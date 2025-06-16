// functions/process-ocr.js
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const pdf = require('pdf-parse/lib/pdf-parse');

exports.handler = async (event) => {
  try {
    const { files } = JSON.parse(event.body);
    const results = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(file.base64, 'base64');
        let text = '';

        // 1. Intento con pdf-parse (para PDFs de texto)
        const pdfData = await pdfParse(buffer, {
          max: 3, // Limita a 3 páginas
          pagerender: renderPage, // Renderizador personalizado
        }).catch(() => ({ text: '' }));

        text = pdfData.text;

        // 2. Fallback a OCR si no se extrajo texto
        if (!text.trim()) {
          const worker = await createWorker('spa');
          await worker.setParameters({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '1', // Modo automático
            tessedit_ocr_engine_mode: '3', // LSTM only
          });
          
          const { data } = await worker.recognize(buffer);
          text = data.text;
          await worker.terminate();
        }

        results.push({
          name: file.name,
          text: text || 'No se pudo extraer texto',
          file: file.base64
        });

      } catch (error) {
        console.error(`Error procesando ${file.name}:`, error);
        results.push({
          name: file.name,
          text: `Error: ${error.message}`,
          file: ''
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
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Renderizador personalizado para manejar fuentes complejas
async function renderPage(pageData) {
  const renderOptions = {
    normalizeWhitespace: false,
    disableCombineTextItems: false,
    customFontExtractor: (text) => {
      return text.replace(/[^\x00-\x7F]/g, ''); // Filtra caracteres no ASCII
    }
  };
  return pageData.getTextContent(renderOptions).then(textContent => {
    return textContent.items.map(item => item.str).join(' ');
  });
}
