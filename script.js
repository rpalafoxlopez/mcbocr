// Configura PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// Elementos del DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resultsDiv = document.getElementById('results');
const progressBar = document.getElementById('globalProgress');

const selectedFilesContainer = document.getElementById('selectedFiles'); // Nuevo
const fileInstructions = document.getElementById('fileInstructions'); // Nuevo

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
  if (files.length === 0) return;
  
  if (files.length > 8) {
    alert('Máximo 8 archivos permitidos');
    return;
  }

  resultsDiv.innerHTML = '';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';

  let processedCount = 0;
  const totalFiles = files.length;

  Array.from(files).forEach(async (file) => {
    if (file.size > 100 * 1024 * 1024) {
      showError(null, file.name, {
        message: `El archivo supera el límite de 100MB`,
        details: ''
      });
      updateProgress(++processedCount, totalFiles);
      return;
    }

    try {
      const resultItem = createResultItem(file.name);
      resultsDiv.appendChild(resultItem);

      const text = await processFile(file);
      showResult(resultItem, file.name, text);
    } catch (error) {
      console.error(`Error procesando ${file.name}:`, error);
      showError(null, file.name, {
        message: `Error al procesar archivo`,
        details: error.message
      });
    } finally {
      updateProgress(++processedCount, totalFiles);
    }
  });
}

function updateProgress(processed, total) {
  const percent = Math.round((processed / total) * 100);
  progressBar.style.width = `${percent}%`;
  progressBar.textContent = `${percent}%`;
  
  if (processed === total) {
    progressBar.classList.add('complete');
  }
}
fileInput.addEventListener('change', (e) => {
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  const files = e.target.files;
  updateSelectedFilesUI(files); // Actualizar interfaz primero
});
dropZone.addEventListener('drop', (e) => {
function handleDrop(e) {
  const files = e.dataTransfer.files;
  const files = e.dataTransfer.files;
  fileInput.files = files; // Asignar archivos al input
  updateSelectedFilesUI(files); // Actualizar interfaz
});
dropZone.addEventListener('click', () => fileInput.click());
// Función para actualizar la interfaz con archivos seleccionados
function updateSelectedFilesUI(files) {
  handleFiles(files);
  selectedFilesContainer.innerHTML = '';
  
  if (!files || files.length === 0) {
    fileInstructions.textContent = 'Arrastra aquí tus documentos o';
    return;
  }
  
  fileInstructions.textContent = `${files.length} archivo(s) seleccionado(s):`;
  
  Array.from(files).forEach((file, index) => {
    const fileElement = document.createElement('div');
    fileElement.className = 'selected-file';
    fileElement.innerHTML = `
      <i class="fas ${getFileIcon(file.type)}"></i>
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <button class="remove-file" data-index="${index}">
        <i class="fas fa-times"></i>
      </button>
    `;
    selectedFilesContainer.appendChild(fileElement);
  });
  
  // Agregar eventos para eliminar archivos
  document.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFileAtIndex(btn.dataset.index);
    });
  });
}
}
// Función para eliminar un archivo específico
function removeFileAtIndex(index) {
  const dt = new DataTransfer();
  const files = Array.from(fileInput.files);
  
  files.forEach((file, i) => {
    if (i !== parseInt(index)) {
      dt.items.add(file);
    }
  });
  
  fileInput.files = dt.files;
  updateSelectedFilesUI(fileInput.files);
}
// Función para obtener icono según tipo de archivo
function getFileIcon(fileType) {
  if (fileType === 'application/pdf') return 'fa-file-pdf';
  if (fileType.includes('image/')) return 'fa-file-image';
  return 'fa-file-alt';
}
// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
// ===== [3] Procesamiento de Archivos =====
async function processFile(file) {
  // Validar tipo de archivo
  if (!isValidFileType(file)) {
    throw new Error('Tipo de archivo no soportado. Solo PDF, JPG y PNG.');
  }

  // Procesar según tipo
  if (file.type === 'application/pdf') {
    await validatePDF(file); // Validar estructura PDF primero
    return await extractTextFromPDF(file);
  } else {
    return await processImageWithOCR(file);
  }
}

async function extractTextFromPDF(file) {
  try {
    // Opción 1: Intentar extracción directa con PDF.js
    const loadingTask = pdfjsLib.getDocument({
      url: URL.createObjectURL(file),
      disableStream: true,
      disableAutoFetch: true
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 20); // Limitar a 20 páginas
    
    for (let i = 1; i <= maxPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
      } catch (pageError) {
        console.warn(`Error en página ${i}:`, pageError);
        continue;
      }
    }

    // Si se extrajo texto suficiente, retornarlo
    if (fullText.trim().length > 50) {
      return fullText;
    }

    // Opción 2: Si no hay texto, intentar con backend OCR
    console.log('PDF sin texto detectable, intentando con backend OCR...');
    const result = await processWithBackend(file);
    return result.text;
    
  } catch (error) {
    console.error('Error en extractTextFromPDF:', error);
    throw new Error('No se pudo extraer texto del PDF');
  }
}

async function processImageWithOCR(file) {
  try {
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage('spa+eng');
    await worker.initialize('spa+eng');
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
      tessedit_ocr_engine_mode: '1'
    });

    const { data } = await worker.recognize(file);
    await worker.terminate();
    
    return data.text || '(No se encontró texto en la imagen)';
  } catch (error) {
    console.error('Error en OCR:', error);
    throw new Error('Falló el reconocimiento de texto en la imagen');
  }
}

// ===== [4] Backend (Netlify Functions) =====
async function processWithBackend(file) {
  try {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("El archivo excede el límite de 8MB para procesamiento en backend");
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
      throw new Error(`Error del servidor: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data?.[0]?.text) {
      throw new Error("Formato de respuesta inesperado del servidor");
    }

    return data[0];
  } catch (error) {
    console.error('Error en processWithBackend:', error);
    throw error;
  }
}

// ===== [5] Helpers =====
function isValidFileType(file) {
  const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  return validTypes.includes(file.type);
}

async function validatePDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arr = new Uint8Array(reader.result);
      const header = new TextDecoder().decode(arr.slice(0, 1024));
      
      if (header.includes('%PDF')) {
        resolve();
      } else {
        reject(new Error('El archivo no es un PDF válido'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file.slice(0, 1024));
  });
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

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
  const shortText = text.length > 300 ? text.substring(0, 300) + '...' : text;
  item.innerHTML = `
    <h3>${filename}</h3>
    <div class="text-preview">${shortText}</div>
    <div class="actions">
      <button class="view-btn">Ver completo</button>
      <button class="download-btn" data-text="${encodeURIComponent(text)}" 
              data-filename="${filename.replace(/\.[^/.]+$/, '')}.txt">
        Descargar TXT
      </button>
    </div>
  `;

  // Agregar evento para ver texto completo
  item.querySelector('.view-btn').addEventListener('click', () => {
    alert(text);
  });
}

function showError(item, filename, error) {
  if (!item) {
    item = createResultItem(filename);
    resultsDiv.appendChild(item);
  }
  item.innerHTML = `
    <h3 class="error-title">${filename}</h3>
    <p class="error-message">${error.message}</p>
    ${error.details ? `<p class="error-details">${error.details}</p>` : ''}
  `;
}

// ===== [6] Eventos de Descarga =====
resultsDiv.addEventListener('click', (e) => {
  if (e.target.classList.contains('download-btn')) {
    const text = decodeURIComponent(e.target.getAttribute('data-text'));
    const filename = e.target.getAttribute('data-filename');
    downloadTxt(text, filename);
  }
});

function downloadTxt(text, filename) {
  try {
    const cleanName = filename.replace(/[^a-z0-9áéíóúñü_\-]/gi, '_') + '.txt';
    const blob = new Blob(["\uFEFF" + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error('Error al descargar:', error);
    alert('Error al generar el archivo de descarga');
  }
}
