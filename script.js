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
    processFile(file);
  });
}

// ===== [3] Procesamiento de Archivos =====
// Versión mejorada de processFile con manejo robusto de errores
async function processFile(file) {
  const resultItem = createResultItem(file.name);
  resultsDiv.appendChild(resultItem);

  try {
    // 1. Validar tipo de archivo primero
    if (!isValidFileType(file)) {
      throw new Error('Tipo de archivo no soportado');
    }

    // 2. Verificar si el PDF está corrupto
    if (file.type === 'application/pdf') {
      await validatePDF(file);
    }

    console.log( file.type );

    // 3. Procesamiento real
    const text = file.type === 'application/pdf' 
      ? await processPDF(file) 
      : await processImageWithOCR(file);

    showResult(resultItem, file.name, text);

  } catch (error) {
    console.error(`Error procesando ${file.name}:`, error);
    showError(resultItem, file.name, {
      message: `Error al procesar archivo: ${error.message}`,
      details: 'El archivo puede estar corrupto o en formato no soportado'
    });
  }
}

// Helpers para mostrar resultados
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

function showError(item, filename, error) {
  item.innerHTML = `
    <h3>${filename}</h3>
    <p class="error">Error: ${error.message}</p>
  `;
}

// ===== [4] Funciones de Procesamiento =====
async function processPDF(file) {
  try {
    // Opción 1: Usar backend (Netlify Function)
    const result = await processWithBackend(file);
    return result.text;
  } catch (error) {
    console.error("Error al procesar PDF:", error);
    throw error;
  }
}

async function processImageWithOCR(file) {
  try {
    // Usar Tesseract.js en el frontend
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage('spa');
    await worker.initialize('spa');
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6'
    });

    const { data } = await worker.recognize(file);
    await worker.terminate();
    
    return data.text;
  } catch (error) {
    console.error("Error en OCR:", error);
    throw new Error("Falló el reconocimiento de texto");
  }
}
// Funciones auxiliares
function isValidFileType(file) {
  const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  return validTypes.includes(file.type);
}

async function validatePDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arr = new Uint8Array(reader.result);
      // Buscar %PDF en los primeros 1024 bytes
      const header = Array.from(arr.slice(0, 1024)).map(byte => 
        String.fromCharCode(byte)).join('');
      
      if (header.includes('%PDF')) {
        resolve();
      } else {
        reject(new Error('El archivo no es un PDF válido'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file.slice(0, 1024)); // Leer primeros 1024 bytes
  });
}

// Versión segura de processPDF
async function processPDF(file) {
  try {
    // Opción 1: Intentar con el backend primero
    try {
      const result = await processWithBackend(file);
      return result.text;
    } catch (backendError) {
      console.warn('Falló backend, intentando con PDF.js:', backendError);
    }

    // Opción 2: Fallback a PDF.js
    const pdf = await pdfjsLib.getDocument({
      url: URL.createObjectURL(file),
      disableStream: true,
      disableAutoFetch: true
    }).promise;

    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n\n';
    }

    return fullText || '(No se pudo extraer texto del PDF)';

  } catch (error) {
    throw new Error(`Error procesando PDF: ${error.message}`);
  }
}
// ===== [5] Backend (Netlify Functions) =====
async function processWithBackend(file) {
  try {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("El archivo excede el límite de 8MB");
    }

    const base64 = await toBase64(file);
    const response = await fetch('/.netlify/functions/process-ocr', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: JSON.stringify({
        files: [{
          name: file.name,
          base64: base64
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data?.[0]?.text) {
      throw new Error("Formato de respuesta inesperado");
    }

    return data[0];
  } catch (error) {
    console.error(`Error procesando ${file.name}:`, error);
    throw error;
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
