const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { Readable } = require('stream');

// Tiempo máximo de ejecución (5 minutos)
const MAX_EXECUTION_TIME = 400000;

// Cache de workers para mejor performance
const workerCache = {
  worker: null,
  lastUsed: 0
};

// Función para post-procesar texto OCR
function postProcessOCRText(text) {
  if (!text) return '';
  
  // 1. Corregir secuencias de letras espaciadas (ej: "F R I A S" => "FRIAS")
  let processed = text.replace(/([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z]+)/g, 
    (_, p1, p2, p3, p4) => p1 + p2 + p3 + p4
  );
  
  // 2. Corregir emails con múltiples @
  processed = processed.replace(/(\S+@\S+)@(\S+\.\S+)/g, '$1.$2');
  
  // 3. Corregir patrones comunes OCR
  const replacements = {
    'O': '0',
    'I': '1',
    'Z': '2',
    'A': '4',
    'S': '5',
    'G': '6',
    'T': '7',
    'B': '8'
  };
  
  return processed.replace(
    /(\b\d[\d\s]+\d\b)/g, 
    match => match.split(/\s+/).map(char => replacements[char] || char).join('')
  );
}

async function getWorker() {
  // Reutilizar worker si está disponible
  if (workerCache.worker && (Date.now() - workerCache.lastUsed < 30000)) {
    workerCache.lastUsed = Date.now();
    return workerCache.worker;
  }

  // Limpiar worker existente si hay uno
  if (workerCache.worker) {
    await workerCache.worker.terminate();
  }

  // Crear nuevo worker con config optimizada para formularios
  const worker = await createWorker({
    logger: m => console.log(m),
    errorHandler: err => console.error(err),
    cachePath: '/tmp/tesseract'
  });

  await worker.loadLanguage('spa+eng');
  await worker.initialize('spa+eng');
  
  // Parámetros optimizados para formularios estructurados
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: '11',  // PSM_SPARSE_TEXT (mejor para tablas)
    tessedit_ocr_engine_mode: '1', // Tesseract + LSTM
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@.-/ ',
    textord_tabfind_show_tables: '1'
  });

  workerCache.worker = worker;
  workerCache.lastUsed = Date.now();
  return worker;
}

async function extractTextFromPDF(buffer) {
  // Timeout para evitar procesamiento infinito
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Tiempo de procesamiento excedido')), 
    MAX_EXECUTION_TIME
  );

  try {
    // 1. Intento con pdf-parse
    const pdfData = await Promise.race([
      pdfParse(buffer, {
        max: 10, // Reducido a 10 páginas para mejor performance
        pagerender: async (pageData) => {
          const textContent = await pageData.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false
          });
          return textContent.items.map(item => item.str).join(' ');
        }
      }),
      timeout
    ]);

    if (pdfData.text && pdfData.text.trim().length > 50) {
      return pdfData.text;
    }

    // 2. Fallback a OCR si no hay suficiente texto
    console.log('Iniciando OCR para PDF...');
    const worker = await getWorker();
    const { data } = await Promise.race([
      worker.recognize(buffer),
      timeout
    ]);

    // Aplicar post-procesamiento al texto OCR
    return postProcessOCRText(data.text) || '(No se pudo extraer texto del PDF)';
  } catch (error) {
    console.error('Error en extractTextFromPDF:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Cuerpo de solicitud faltante' })
      };
    }

    const { files } = JSON.parse(event.body);
    if (!files || !Array.isArray(files)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Formato de archivos inválido' })
      };
    }

    // Procesar cada archivo
    const results = await Promise.all(files.map(async (file) => {
      try {
        const buffer = Buffer.from(file.base64, 'base64');
        if (buffer.length > 45 * 1024 * 1024) {
          throw new Error('Archivo excede el límite de 8MB');
        }

        let text = '';
        if (file.name.toLowerCase().endsWith('.pdf')) {
          text = await extractTextFromPDF(buffer);
        } else {
          const worker = await getWorker();
          const { data } = await worker.recognize(buffer);
          text = postProcessOCRText(data.text);  // Aplicar post-procesamiento
        }

        return {
          name: file.name,
          text: text || 'No se pudo extraer texto',
          success: !!text,
          size: buffer.length
        };
      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
        return {
          name: file.name,
          text: `Error: ${error.message}`,
          success: false,
          size: 0
        };
      }
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error('Error en handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  } finally {
    if (workerCache.worker) {
      await workerCache.worker.terminate();
      workerCache.worker = null;
    }
  }
};
