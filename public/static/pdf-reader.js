const statusEl = document.getElementById("status");
const containerEl = document.getElementById("pdf-container");
const params = new URLSearchParams(window.location.search);
const fileUrl = params.get("file");

if (!fileUrl) {
  statusEl.textContent = "Missing file URL.";
} else {
  initPdfReader(fileUrl);
}

async function initPdfReader(url) {
  if (!window.pdfjsLib) {
    statusEl.textContent = "PDF engine failed to load.";
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  try {
    const loadingTask = window.pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    statusEl.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      await renderPdfPage(pdf, pageNumber);
    }
  } catch (error) {
    statusEl.textContent = "Failed to load PDF.";
    console.error(error);
  }
}

async function renderPdfPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.35 });

  const pageEl = document.createElement("div");
  pageEl.className = "pdf-page";
  pageEl.dataset.page = String(pageNumber);

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;

  pageEl.appendChild(canvas);
  pageEl.appendChild(textLayer);
  containerEl.appendChild(pageEl);

  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
  }).promise;

  const textContent = await page.getTextContent();
  window.pdfjsLib.renderTextLayer({
    textContent,
    container: textLayer,
    viewport,
    textDivs: [],
  });
}
