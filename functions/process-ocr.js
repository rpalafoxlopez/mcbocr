const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { Readable } = require('stream');

// Función para extracción simple de texto
const getSimpleText = (buffer) => {
  return new Promise((resolve) => {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    
    let text = '';
    stream.on('data', chunk => {
      text += chunk.toString('ascii', 0, 1024);
    });
    stream.on('end', () => resolve(text));
  });
};

// Renderizador personalizado
const renderPage = (pageData) => {
  const renderOptions = {
    normalizeWhitespace: false,
    disableCombineTextItems: false,
    customFontExtractor: (text) => text.replace(/[^\x00-\x7F]/g, '')
  };
  return pageData.getTextContent(renderOptions)
    .then(textContent => textContent.items.map(item => item.str).join(' '));
};

exports.handler = async (event) => {
  try {
    const { files } = JSON.parse(event.body);
    const results = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(file.base64, 'base64');
        let text = '';

        // 1. Intento extracción simple
        text = await getSimpleText(buffer);
        
        // 2. Si no hay texto, probar con pdf-parse
        if (!text.trim()) {
          const pdfData = await pdfParse(buffer, {
            max: 3,
            pagerender: renderPage
          }).catch(() => ({ text: '' }));
          
          text = pdfData.text;
        }

        // 3. Fallback a OCR si aún no hay texto
        if (!text.trim()) {
          const worker = await createWorker('spa');
          await worker.setParameters({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '1',
            tessedit_ocr_engine_mode: '3'
          });
          
          const { data } = await worker.recognize(buffer);
          text = data.text;
          await worker.terminate();
        }

        results.push({
          name: file.name,
          text: text || 'No se pudo extraer texto',
          // No incluir file.base64 en la respuesta para reducir tamaño
          fileSize: buffer.length
        });

      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
        results.push({
          name: file.name,
          text: `Error: ${error.message}`,
          fileSize: 0
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
