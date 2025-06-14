const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/extract-text', upload.single('pdf'), async (req, res) => {
  try {
    // 1. Leer PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);

    // 2. Si el PDF tiene texto, devolverlo
    if (pdfData.text) {
      return res.json({ text: pdfData.text });
    }

    // 3. Si es un PDF escaneado (imagen), aplicar OCR
    const worker = await createWorker('spa'); // 'spa' para español
    const { data: { text } } = await worker.recognize(req.file.path);
    await worker.terminate();

    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));