// functions/process-ocr.js
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');

exports.handler = async (event, context) => {
  // Validación básica
  if (event.httpMethod !== 'POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido" })
    };
  }

  try {
    const body = JSON.parse(event.body);
    console.log("Archivos recibidos:", body.files.map(f => f.name));

    // Procesamiento en paralelo
    const results = await Promise.all(
      body.files.map(async file => {
        try {
          const buffer = Buffer.from(file.base64, 'base64');
          
          // 1. Intento extracción directa de PDF
          if (file.name.endsWith('.pdf')) {
            const pdfData = await pdfParse(buffer);
            if (pdfData.text) return {
              name: file.name,
              text: pdfData.text,
              file: file.base64
            };
          }

          console.log("Tamaño base64 recibido:", file.base64?.length);
          console.log("Tipo de archivo:", file.name.split('.').pop());

          // 2. Fallback a OCR
          const worker = await createWorker('spa');
          await worker.setParameters({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6'
          });
          
          const { data } = await worker.recognize(buffer);
          await worker.terminate();
          
          return {
            name: file.name,
            text: data.text,
            file: file.base64
          };

        } catch (error) {
          console.error(`Error procesando ${file.name}:`, error);
          return {
            name: file.name,
            text: `Error: ${error.message}`,
            file: ""
          };
        }
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };

  } catch (error) {
    console.error("Error general:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
