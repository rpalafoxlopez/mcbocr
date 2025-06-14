// Configura PDF.js (si aún lo necesitas para algo)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resultsDiv = document.getElementById('results');
 
// Ejemplo de cómo manejar la respuesta
fetch('/.netlify/functions/process-ocr', {
  method: 'POST',
  body: JSON.stringify({ files: [...] }),
}).then(response => response.json())
  .then(data => {
    data.forEach(item => {
      // Descargar el TXT
      const link = document.createElement('a');
      link.href = `data:text/plain;base64,${item.file}`;
      link.download = item.name;
      link.click();
    });
 });


// Eventos Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight() {
  dropZone.classList.add('active');
}

function unhighlight() {
  dropZone.classList.remove('active');
}

// Manejar archivos soltados
dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

// Procesar archivos
function handleFiles(files) {
  if (files.length > 8) {
    alert('Máximo 8 archivos permitidos');
    return;
  }

  resultsDiv.innerHTML = '';
  
  Array.from(files).forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      alert(`El archivo ${file.name} supera el límite de 10MB`);
      return;
    }

    processFile(file);
  });
}

// Procesamiento con Tesseract/PDF
async function processFile(file) {
  const resultItem = document.createElement('div');
  resultItem.className = 'result-item';
  resultItem.innerHTML = `
    <h3>${file.name}</h3>
    <div class="progress-bar"><div class="progress"></div></div>
    <p>Procesando...</p>
  `;
  resultsDiv.appendChild(resultItem);
  
  const progressBar = resultItem.querySelector('.progress');

  try {
    let text = '';
    
    if (file.type === 'application/pdf') {
      // Procesar PDF (usando tu función de Netlify)
      const result = await processWithBackend(file);
      text = result.text;
    } else {
      // Procesar imagen con Tesseract.js en frontend
      const worker = await createWorker('spa');
      await worker.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: '6'
      });
      
      const { data } = await worker.recognize(file, {
        logger: m => {
          if (m.status === 'recognizing text') {
            progressBar.style.width = `${Math.round(m.progress * 100)}%`;
          }
        }
      });
      
      text = data.text;
      await worker.terminate();
    }
    
    resultItem.innerHTML = `
      <h3>${file.name}</h3>
      <p>${text.length > 200 ? text.substring(0, 200) + '...' : text}</p>
      <button class="download-btn" data-text="${encodeURIComponent(text)}" 
              data-filename="${file.name.replace(/\.[^/.]+$/, '')}.txt">
        Descargar TXT
      </button>
    `;
    
  } catch (error) {
    resultItem.innerHTML = `
      <h3>${file.name}</h3>
      <p class="error">Error: ${error.message}</p>
    `;
  }
}

// Descargar archivos TXT
resultsDiv.addEventListener('click', (e) => {
  if (e.target.classList.contains('download-btn')) {
    const text = decodeURIComponent(e.target.getAttribute('data-text'));
    const filename = e.target.getAttribute('data-filename'));
    downloadTxt(text, filename);
  }
});

function downloadTxt(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Conexión con Netlify Functions (opcional)
async function processWithBackend(file) {
  const base64 = await toBase64(file);
  const response = await fetch('/.netlify/functions/process-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [{ name: file.name, base64 }] })
  });
  return (await response.json())[0];
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}


// document.getElementById('uploadForm').addEventListener('submit', async (e) => {
//   e.preventDefault();
//   const files = document.getElementById('fileInput').files;
//   const resultsDiv = document.getElementById('results');
//   resultsDiv.innerHTML = '<p>Procesando...</p>';

//   if (files.length > 8) {
//     alert('Máximo 8 archivos permitidos');
//     return;
//   }

//   try {
//     // Usar el backend en lugar de Tesseract.js en el frontend
//     const results = await uploadFilesToBackend(files);
    
//     results.forEach(result => {
//       const resultItem = document.createElement('div');
//       resultItem.className = 'result-item';
//       resultItem.innerHTML = `
//         <h3>${result.name}</h3>
//         <div class="text-result">${result.text || 'No se pudo extraer texto.'}</div>
//       `;
//       resultsDiv.appendChild(resultItem);
//     });
//   } catch (error) {
//     resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
//   }
// });

// // Función para enviar archivos al backend
// async function uploadFilesToBackend(files) {
//   const results = [];
//   for (const file of files) {
//     const base64 = await toBase64(file);
//     results.push({ name: file.name, base64 });
//   }

//   const response = await fetch('/.netlify/functions/process-ocr', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ files: results }),
//   });

//   if (!response.ok) throw new Error('Error en el servidor');
//   return await response.json();
// }

// // Convertir archivo a Base64
// function toBase64(file) {
//   return new Promise((resolve) => {
//     const reader = new FileReader();
//     reader.onload = (e) => resolve(e.target.result.split(',')[1]);
//     reader.readAsDataURL(file);
//   });
// }