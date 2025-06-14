// Configura PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// Elementos del DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resultsDiv = document.getElementById('results');

// ===== [1] Configuración de Drag & Drop =====
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

dropZone.addEventListener('dragenter', highlight, false);
dropZone.addEventListener('dragover', highlight, false);
dropZone.addEventListener('dragleave', unhighlight, false);
dropZone.addEventListener('drop', unhighlight, false);

function highlight() {
  dropZone.classList.add('active');
}

function unhighlight() {
  dropZone.classList.remove('active');
}

// ===== [2] Manejo de Archivos =====
dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleDrop(e) {
  const files = e.dataTransfer.files;
  handleFiles(files);
}

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
    processFile(file); // Procesar cada archivo
  });
}

// ===== [3] Procesamiento de Archivos =====
async function processFile(file) {
  const resultItem = createResultItem(file.name);
  resultsDiv.appendChild(resultItem);

  try {
    const text = file.type === 'application/pdf' 
      ? await processPDF(file) 
      : await processImage(file);

    showResult(resultItem, file.name, text);
  } catch (error) {
    showError(resultItem, file.name, error);
  }
}

// Helper: Crear elemento de resultado
function createResultItem(filename) {
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <h3>${filename}</h3>
    <div class="progress-bar"><div class="progress"></div></div>
    <p>Procesando...</p>
  `;
  return item;
}

// Helper: Mostrar resultado final
function showResult(item, filename, text) {
  item.innerHTML = `
    <h3>${filename}</h3>
    <p>${text.length > 200 ? text.substring(0, 200) + '...' : text}</p>
    <button class="download-btn" data-text="${encodeURIComponent(text)}" 
            data-filename="${filename.replace(/\.[^/.]+$/, '')}.txt">
      Descargar TXT
    </button>
  `;
}

// Helper: Mostrar error
function showError(item, filename, error) {
  item.innerHTML = `
    <h3>${filename}</h3>
    <p class="error">Error: ${error.message}</p>
  `;
}

// ===== [4] Funciones de Procesamiento =====
async function processPDF(file) {
  // Opción 1: Usar backend (Netlify Function)
  const result = await processWithBackend(file);
  return result.text;

  // Opción 2: Procesar en frontend con PDF.js (descomentar)
  // return await extractTextFromPDF(file);
}

async function processImage(file) {
  const worker = await createWorker('spa');
  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: '6'
  });
  
  const { data } = await worker.recognize(file);
  await worker.terminate();
  return data.text;
}

// ===== [5] Backend (Netlify Functions) =====
async function processWithBackend(file) {
  try {
    const base64 = await toBase64(file);
    const response = await fetch('/.netlify/functions/process-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ name: file.name, base64 }] })
    });

    if (!response.ok) throw new Error("Error en la petición al backend");
    
    const data = await response.json();
    if (!data || !data.length || !data[0].text) {
      throw new Error("Formato de respuesta inválido");
    }

    return data[0];

  } catch (error) {
    return { 
      name: file.name,
      text: `Error procesando ${file.name}: ${error.message}`,
      file: "" 
    };
  }
}

// ===== [6] Utilidades =====
function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}

// Descargar archivos TXT
resultsDiv.addEventListener('click', (e) => {
  if (e.target.classList.contains('download-btn')) {
    const text = decodeURIComponent(e.target.getAttribute('data-text'));
    const filename = e.target.getAttribute('data-filename');
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