const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');

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
        const pdfData = await pdfParse(buffer);
        text = pdfData.text || '(PDF sin texto. Aplicando OCR...)';
        if (!text.trim()) {
          const worker = await createWorker('spa');
          const { data } = await worker.recognize(buffer);
          text = data.text;
          await worker.terminate();
        }
      } else {
        const worker = await createWorker('spa');
        const { data } = await worker.recognize(buffer);
        text = data.text;
        await worker.terminate();
      }

      results.push({ name: file.name, text });
    }

    return { statusCode: 200, body: JSON.stringify(results) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};