/* ============================================
   DETEKSI AKSARA BALI — APPLICATION LOGIC
   AI Integration, Camera, Upload, TTS, UI
   ============================================ */

// ================================================
// ===  KONFIGURASI MODEL — UBAH URL DI SINI  ===
// ================================================
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/P-wmeDYjY/";
// ================================================

// ---- Derived URLs ----
const modelURL = MODEL_URL + "model.json";
const metadataURL = MODEL_URL + "metadata.json";

// ---- State ----
let model = null;
let maxPredictions = 0;
let webcamStream = null;
let isScanning = false;
let animationFrameId = null;
let currentFacingMode = "environment"; // "user" for front camera

// ---- DOM Elements ----
const loadingOverlay = document.getElementById("loading-overlay");
const toastEl = document.getElementById("toast");

// Camera
const videoEl = document.getElementById("webcam-video");
const cameraContainer = document.getElementById("camera-container");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const scannerLine = document.getElementById("scanner-line");
const scannerCorners = document.getElementById("scanner-corners");
const btnCameraStart = document.getElementById("btn-camera-start");
const btnCameraStop = document.getElementById("btn-camera-stop");
const btnCameraFlip = document.getElementById("btn-camera-flip");

// Upload
const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");
const uploadPreview = document.getElementById("upload-preview");
const uploadImage = document.getElementById("upload-image");

// Results
const resultEmpty = document.getElementById("result-empty");
const resultDetected = document.getElementById("result-detected");
const resultChar = document.getElementById("result-char");
const resultName = document.getElementById("result-name");
const resultTransliteration = document.getElementById("result-transliteration");
const confidenceFill = document.getElementById("confidence-fill");
const confidenceText = document.getElementById("confidence-text");
const predictionsList = document.getElementById("predictions-list");
const btnTts = document.getElementById("btn-tts");

// ============================================
// INITIALIZATION — Load Model
// ============================================
async function initModel() {
  showLoading(true);
  try {
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    console.log(`✅ Model loaded — ${maxPredictions} classes`);
    showToast("Model AI berhasil dimuat!", "success");
  } catch (err) {
    console.error("❌ Failed to load model:", err);
    showToast("Gagal memuat model AI. Periksa koneksi internet.", "error");
  } finally {
    showLoading(false);
  }
}

// Start loading model on page load
window.addEventListener("DOMContentLoaded", () => {
  initModel();
  initScrollReveal();
  initDragDrop();
});

// ============================================
// NAVIGATION
// ============================================
function scrollToDetection() {
  const target = document.getElementById("detection");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tab) {
  const tabCamera = document.getElementById("tab-camera");
  const tabUpload = document.getElementById("tab-upload");
  const panelCamera = document.getElementById("panel-camera");
  const panelUpload = document.getElementById("panel-upload");

  if (tab === "camera") {
    tabCamera.classList.add("tab-btn--active");
    tabUpload.classList.remove("tab-btn--active");
    panelCamera.classList.add("tab-panel--active");
    panelUpload.classList.remove("tab-panel--active");
  } else {
    tabUpload.classList.add("tab-btn--active");
    tabCamera.classList.remove("tab-btn--active");
    panelUpload.classList.add("tab-panel--active");
    panelCamera.classList.remove("tab-panel--active");
    // Stop camera when switching to upload tab
    if (isScanning) stopCamera();
  }
}

// ============================================
// CAMERA MODULE
// ============================================
async function startCamera() {
  if (!model) {
    showToast("Model AI belum dimuat. Mohon tunggu…", "error");
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    };

    webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = webcamStream;

    videoEl.onloadedmetadata = () => {
      videoEl.play();
      isScanning = true;

      // Update UI
      cameraPlaceholder.classList.add("hidden");
      cameraContainer.classList.add("camera-container--active");
      scannerLine.classList.add("scanner-line--active");
      scannerCorners.classList.add("scanner-corners--active");
      btnCameraStart.classList.add("hidden");
      btnCameraStop.classList.remove("hidden");
      btnCameraFlip.classList.remove("hidden");

      showToast("Kamera aktif — memindai aksara…", "success");

      // Start prediction loop
      predictLoop();
    };
  } catch (err) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError") {
      showToast("Akses kamera ditolak. Izinkan akses kamera di pengaturan browser.", "error");
    } else if (err.name === "NotFoundError") {
      showToast("Kamera tidak ditemukan pada perangkat ini.", "error");
    } else {
      showToast("Gagal mengakses kamera: " + err.message, "error");
    }
  }
}

function stopCamera() {
  isScanning = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (webcamStream) {
    webcamStream.getTracks().forEach((track) => track.stop());
    webcamStream = null;
  }

  videoEl.srcObject = null;

  // Update UI
  cameraPlaceholder.classList.remove("hidden");
  cameraContainer.classList.remove("camera-container--active");
  scannerLine.classList.remove("scanner-line--active");
  scannerCorners.classList.remove("scanner-corners--active");
  btnCameraStart.classList.remove("hidden");
  btnCameraStop.classList.add("hidden");
  btnCameraFlip.classList.add("hidden");

  showToast("Kamera dihentikan.", "success");
}

async function flipCamera() {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  stopCamera();
  // Small delay before restarting
  setTimeout(() => startCamera(), 300);
}

// ---- Real-time Prediction Loop ----
async function predictLoop() {
  if (!isScanning || !model) return;

  try {
    const predictions = await model.predict(videoEl);
    updateResults(predictions);
  } catch (err) {
    // Silently handle prediction errors during continuous scanning
    console.warn("Prediction error:", err);
  }

  animationFrameId = requestAnimationFrame(predictLoop);
}

// ============================================
// UPLOAD MODULE
// ============================================
function initDragDrop() {
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("upload-zone--dragover");
  });

  uploadZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("upload-zone--dragover");
  });

  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("upload-zone--dragover");

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    } else {
      showToast("Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.", "error");
    }
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processImageFile(file);
  }
}

function processImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast("Ukuran file terlalu besar. Maksimal 10MB.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadImage.src = e.target.result;
    uploadZone.classList.add("hidden");
    uploadPreview.classList.add("upload-preview--active");
    showToast("Gambar berhasil dimuat!", "success");
  };
  reader.readAsDataURL(file);
}

function removeUploadedImage() {
  uploadImage.src = "";
  fileInput.value = "";
  uploadPreview.classList.remove("upload-preview--active");
  uploadZone.classList.remove("hidden");

  // Reset results
  resultEmpty.style.display = "";
  resultDetected.classList.remove("result-detected--active");
}

async function detectFromUpload() {
  if (!model) {
    showToast("Model AI belum dimuat.", "error");
    return;
  }

  if (!uploadImage.src || uploadImage.src === window.location.href) {
    showToast("Pilih gambar terlebih dahulu.", "error");
    return;
  }

  const btnDetect = document.getElementById("btn-detect-upload");
  btnDetect.disabled = true;
  btnDetect.innerHTML = "⏳ Mendeteksi…";

  try {
    // Wait for image to be fully loaded
    await new Promise((resolve) => {
      if (uploadImage.complete) resolve();
      else uploadImage.onload = resolve;
    });

    const predictions = await model.predict(uploadImage);
    updateResults(predictions);

    // Scroll to results
    setTimeout(() => {
      document.getElementById("results").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 300);

    showToast("Deteksi selesai!", "success");
  } catch (err) {
    console.error("Detection error:", err);
    showToast("Gagal mendeteksi. Coba gambar lain.", "error");
  } finally {
    btnDetect.disabled = false;
    btnDetect.innerHTML = "🔍 Deteksi Aksara";
  }
}

// ============================================
// RESULTS & UI UPDATE
// ============================================
function updateResults(predictions) {
  if (!predictions || predictions.length === 0) return;

  // Sort by probability descending
  const sorted = [...predictions].sort(
    (a, b) => b.probability - a.probability
  );
  const top = sorted[0];
  const confidence = Math.round(top.probability * 100);
  const className = top.className;

  // Show result panel
  resultEmpty.style.display = "none";
  resultDetected.classList.add("result-detected--active");

  // Update top result
  resultChar.textContent = getAksaraSymbol(className);
  resultName.textContent = className;
  resultTransliteration.textContent = `Transliterasi: ${getTransliteration(className)}`;

  // Update confidence ring
  const circumference = 2 * Math.PI * 33; // r=33
  const offset = circumference - (confidence / 100) * circumference;
  confidenceFill.style.strokeDashoffset = offset;
  confidenceText.textContent = confidence + "%";

  // Update predictions list
  renderPredictionsList(sorted);
}

function renderPredictionsList(predictions) {
  predictionsList.innerHTML = "";

  predictions.forEach((pred, index) => {
    const percent = Math.round(pred.probability * 100);
    const isTop = index === 0;

    const item = document.createElement("div");
    item.className = `prediction-item ${isTop ? "prediction-item--top" : ""}`;
    item.innerHTML = `
      <span class="prediction-item__name" title="${pred.className}">${pred.className}</span>
      <div class="prediction-item__bar-wrapper">
        <div class="prediction-item__bar" style="width: 0%"></div>
      </div>
      <span class="prediction-item__score">${percent}%</span>
    `;

    predictionsList.appendChild(item);

    // Animate bar after a tiny delay for smooth transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.querySelector(".prediction-item__bar").style.width = percent + "%";
      });
    });
  });
}

// ============================================
// TRANSLITERATION HELPERS
// ============================================

/**
 * Returns the display symbol/character for a class name.
 * Since Teachable Machine class names ARE the aksara names,
 * we use the first 2 characters as a shorthand display.
 * Customize this mapping as needed.
 */
function getAksaraSymbol(className) {
  // Map common Aksara Bali names to display characters
  const symbolMap = {
    // Consonants (Wyanjana)
    "Ka": "ᬓ", "ka": "ᬓ",
    "Kha": "ᬔ", "kha": "ᬔ",
    "Ga": "ᬕ", "ga": "ᬕ",
    "Gha": "ᬖ", "gha": "ᬖ",
    "Nga": "ᬗ", "nga": "ᬗ",
    "Ca": "ᬘ", "ca": "ᬘ",
    "Cha": "ᬙ", "cha": "ᬙ",
    "Ja": "ᬚ", "ja": "ᬚ",
    "Jha": "ᬛ", "jha": "ᬛ",
    "Nya": "ᬜ", "nya": "ᬜ",
    "Ta": "ᬝ", "ta": "ᬝ",
    "Tha": "ᬞ", "tha": "ᬞ",
    "Da": "ᬟ", "da": "ᬟ",
    "Dha": "ᬠ", "dha": "ᬠ",
    "Na": "ᬡ", "na": "ᬡ",
    "Pa": "ᬧ", "pa": "ᬧ",
    "Pha": "ᬨ", "pha": "ᬨ",
    "Ba": "ᬩ", "ba": "ᬩ",
    "Bha": "ᬪ", "bha": "ᬪ",
    "Ma": "ᬫ", "ma": "ᬫ",
    "Ya": "ᬬ", "ya": "ᬬ",
    "Ra": "ᬭ", "ra": "ᬭ",
    "La": "ᬮ", "la": "ᬮ",
    "Wa": "ᬯ", "wa": "ᬯ",
    "Sa": "ᬰ", "sa": "ᬰ",
    "Sha": "ᬱ", "sha": "ᬱ",
    "Ha": "ᬳ", "ha": "ᬳ",
    // Vowels (Aksara Suara)
    "A": "ᬅ", "a": "ᬅ",
    "I": "ᬇ", "i": "ᬇ",
    "U": "ᬉ", "u": "ᬉ",
    "E": "ᬏ", "e": "ᬏ",
    "O": "ᬑ", "o": "ᬑ",
  };

  if (symbolMap[className]) return symbolMap[className];

  // Fallback: use the first 2 characters as display
  return className.substring(0, 2).toUpperCase();
}

/**
 * Returns a Latin transliteration for the class name.
 * Most Teachable Machine labels are already in Latin script,
 * so this is effectively a pass-through with formatting.
 */
function getTransliteration(className) {
  return className;
}

// ============================================
// TEXT-TO-SPEECH (TTS)
// ============================================
function speakResult() {
  const text = resultName.textContent;
  if (!text || text === "—") return;

  if ("speechSynthesis" in window) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID"; // Indonesian
    utterance.rate = 0.85;
    utterance.pitch = 1;

    // Visual feedback
    btnTts.classList.add("btn-tts--speaking");
    utterance.onend = () => btnTts.classList.remove("btn-tts--speaking");
    utterance.onerror = () => btnTts.classList.remove("btn-tts--speaking");

    window.speechSynthesis.speak(utterance);
  } else {
    showToast("Text-to-Speech tidak didukung oleh browser ini.", "error");
  }
}

// ============================================
// LOADING OVERLAY
// ============================================
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.add("loading-overlay--active");
  } else {
    loadingOverlay.classList.remove("loading-overlay--active");
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
let toastTimeout = null;

function showToast(message, type = "success") {
  clearTimeout(toastTimeout);

  toastEl.textContent = message;
  toastEl.className = "toast";
  toastEl.classList.add(`toast--${type}`);

  // Trigger reflow for animation reset
  void toastEl.offsetWidth;
  toastEl.classList.add("toast--visible");

  toastTimeout = setTimeout(() => {
    toastEl.classList.remove("toast--visible");
  }, 3500);
}

// ============================================
// SCROLL REVEAL (IntersectionObserver)
// ============================================
function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal--visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -50px 0px",
    }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener("keydown", (e) => {
  // ESC to stop camera
  if (e.key === "Escape" && isScanning) {
    stopCamera();
  }
});
