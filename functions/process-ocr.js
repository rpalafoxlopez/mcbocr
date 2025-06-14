const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  try {
    const body = JSON.parse(event.body);
    const files = body.files; // Array de {name: string, base64: string}

    const results = [];
    for (const file of files) {
      const buffer = Buffer.from(file.base64, 'base64');
      let text = '';

      if (file.name.endsWith('.pdf')) {
        // 1. Extraer texto del PDF conservando espacios/saltos
        const pdfData = await pdfParse(buffer, {
          normalizeWhitespace: false, // Conserva espacios múltiples
          disableCombineTextItems: false, // Agrupa líneas correctamente
        });
        text = pdfData.text || '(PDF sin texto. Aplicando OCR...)';

        // 2. Si no hay texto, usar OCR con configuración para preservar formato
        if (!text.trim()) {
          const worker = await createWorker('spa');
          await worker.setParameters({
            preserve_interword_spaces: '1', // Conserva espacios entre palabras
            tessedit_pageseg_mode: '6',     // Modo segmentación: bloque único
          });
          const { data } = await worker.recognize(buffer);
          text = data.text;
          await worker.terminate();
        }
      } else {
        // 3. Para imágenes, aplicar OCR con espacios preservados
        const worker = await createWorker('spa');
        await worker.setParameters({
          preserve_interword_spaces: '1',
        });
        const { data } = await worker.recognize(buffer);
        text = data.text;
        await worker.terminate();
      }

      // 4. Generar archivo TXT con el texto original (conserva saltos de línea)
      const txtFilename = `${file.name.replace(/\.[^/.]+$/, '')}.txt`;
      fs.writeFileSync(txtFilename, text);

      // 5. Devolver el texto y el archivo como base64 para descarga
      const txtBuffer = fs.readFileSync(txtFilename);
      results.push({
        name: txtFilename,
        text: text,
        file: txtBuffer.toString('base64'),
      });
    }

    return { statusCode: 200, body: JSON.stringify(results) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};