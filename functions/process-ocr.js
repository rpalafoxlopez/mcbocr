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

  // Crear nuevo worker
  const worker = await createWorker({
    logger: m => console.log(m),
    errorHandler: err => console.error(err),
    cachePath: '/tmp/tesseract'
  });

  await worker.loadLanguage('spa+eng');
  await worker.initialize('spa+eng');
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: '6',
    tessedit_ocr_engine_mode: '1'
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
        max: 20, // Limitar a 20 páginas
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

    return data.text || '(No se pudo extraer texto del PDF)';
  } catch (error) {
    console.error('Error en extractTextFromPDF:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  // Configurar timeout de Netlify
  context.callbackWaitsForEmptyEventLoop = false;

  // Validar método HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    // Validar cuerpo de la solicitud
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
        // Validar tamaño máximo (80MB)
        const buffer = Buffer.from(file.base64, 'base64');
        if (buffer.length > 80 * 1024 * 1024) {
          throw new Error('Archivo excede el límite de 8MB');
        }

        // Extraer texto según tipo de archivo
        let text = '';
        if (file.name.toLowerCase().endsWith('.pdf')) {
          text = await extractTextFromPDF(buffer);
        } else {
          // Procesar imagen con OCR
          const worker = await getWorker();
          const { data } = await worker.recognize(buffer);
          text = data.text;
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
    // Limpiar worker al terminar
    if (workerCache.worker) {
      await workerCache.worker.terminate();
      workerCache.worker = null;
    }
  }
};
