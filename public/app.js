const fileInput = document.getElementById("fileInput");
const btnUpload = document.getElementById("btnUpload");
const btnCamera = document.getElementById("btnCamera");
const btnCancelCamera = document.getElementById("btnCancelCamera");
const btnCapture = document.getElementById("btnCapture");
const btnCheck = document.getElementById("btnCheck");
const btnRetake = document.getElementById("btnRetake");

const cameraSection = document.getElementById("cameraSection");
const previewSection = document.getElementById("previewSection");
const resultSection = document.getElementById("resultSection");

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const previewImg = document.getElementById("previewImg");

const resultBanner = document.getElementById("resultBanner");
const errorList = document.getElementById("errorList");
const rawJson = document.getElementById("rawJson");
const issuerSelect = document.getElementById("issuer");

let mediaStream = null;
let currentDataUrl = null;

// Longest side to resize to before sending. ICAO checks the CROPPED FACE
// against a min ~876x1063, not the full frame -- for loosely-framed photos
// where the face is a smaller fraction of the image, 1600px wasn't enough
// headroom and shrank faces below BioID's minimum eye-distance (240px).
const MAX_DIMENSION = 3000;

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

function resetToStart() {
  hide(previewSection);
  hide(resultSection);
  hide(cameraSection);
  currentDataUrl = null;
}

// --- Upload flow ---
btnUpload.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => loadImageIntoCanvas(e.target.result);
  reader.readAsDataURL(file);
});

// --- Camera flow ---
btnCamera.addEventListener("click", async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 1706 },
      },
      audio: false,
    });
    video.srcObject = mediaStream;
    hide(previewSection);
    hide(resultSection);
    show(cameraSection);
  } catch (err) {
    alert("Could not access camera: " + err.message);
  }
});

btnCancelCamera.addEventListener("click", stopCamera);

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  hide(cameraSection);
}

btnCapture.addEventListener("click", () => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  stopCamera();
  loadImageIntoCanvas(canvas.toDataURL("image/jpeg", 0.92));
});

// --- Shared: resize + preview ---
function loadImageIntoCanvas(dataUrl) {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    currentDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    previewImg.src = currentDataUrl;

    hide(resultSection);
    show(previewSection);
  };
  img.src = dataUrl;
}

btnRetake.addEventListener("click", () => {
  resetToStart();
  fileInput.value = "";
});

// --- Submit to backend ---
btnCheck.addEventListener("click", async () => {
  if (!currentDataUrl) return;
  btnCheck.disabled = true;
  btnCheck.textContent = "Checking...";

  try {
    const res = await fetch("/api/quality-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: currentDataUrl,
        issuer: issuerSelect.value,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      renderServerError(data);
      return;
    }
    renderResult(data);
  } catch (err) {
    renderServerError({ error: "Network error", details: err.message });
  } finally {
    btnCheck.disabled = false;
    btnCheck.textContent = "Check photo";
  }
});

function renderServerError(data) {
  show(resultSection);
  resultBanner.className = "result-banner fail";
  resultBanner.textContent = "⚠ " + (data.error || "Something went wrong");
  errorList.innerHTML = "";
  if (data.details) {
    const li = document.createElement("li");
    li.textContent =
      typeof data.details === "string"
        ? data.details
        : JSON.stringify(data.details);
    errorList.appendChild(li);
  }
  rawJson.textContent = JSON.stringify(data, null, 2);
}

function renderResult(data) {
  show(resultSection);

  const passed = data.success && data.errors.length === 0;
  resultBanner.className = "result-banner " + (passed ? "pass" : "fail");
  resultBanner.textContent = passed
    ? `✔ PASS — meets ${data.issuer} photo requirements`
    : `✘ FAIL — ${data.errors.length} issue${data.errors.length === 1 ? "" : "s"} found (${data.issuer} standard)`;

  errorList.innerHTML = "";
  data.errors.forEach((e) => {
    const li = document.createElement("li");
    const codeEl = document.createElement("span");
    codeEl.className = "code";
    codeEl.textContent = e.code;
    li.appendChild(codeEl);
    li.appendChild(document.createTextNode(e.message));
    errorList.appendChild(li);
  });

  rawJson.textContent = JSON.stringify(data, null, 2);
}
