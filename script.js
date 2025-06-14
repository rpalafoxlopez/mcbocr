// Configura PDF.js (si aún lo necesitas para algo)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = document.getElementById('fileInput').files;
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '<p>Procesando...</p>';

  if (files.length > 8) {
    alert('Máximo 8 archivos permitidos');
    return;
  }

  try {
    // Usar el backend en lugar de Tesseract.js en el frontend
    const results = await uploadFilesToBackend(files);
    
    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';
      resultItem.innerHTML = `
        <h3>${result.name}</h3>
        <div class="text-result">${result.text || 'No se pudo extraer texto.'}</div>
      `;
      resultsDiv.appendChild(resultItem);
    });
  } catch (error) {
    resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
});

// Función para enviar archivos al backend
async function uploadFilesToBackend(files) {
  const results = [];
  for (const file of files) {
    const base64 = await toBase64(file);
    results.push({ name: file.name, base64 });
  }

  const response = await fetch('/.netlify/functions/process-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: results }),
  });

  if (!response.ok) throw new Error('Error en el servidor');
  return await response.json();
}

// Convertir archivo a Base64
function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}