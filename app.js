const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwfySWisPuONmwYByxd74b9NbLvRnfubijdao5zDxEtUSP9QkREOMBzr4vjD9g35DMX2w/exec";
const EGYPT_TIMEZONE = "Africa/Cairo";
const SCAN_COOLDOWN_MS = 3500;

const readerEl = document.querySelector("#reader");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const statusBox = document.querySelector("#statusBox");
const statusText = document.querySelector("#statusText");
const manualForm = document.querySelector("#manualForm");
const manualQr = document.querySelector("#manualQr");
const scanLog = document.querySelector("#scanLog");
const clock = document.querySelector("#clock");

let qrScanner;
let scanning = false;
let lastScanValue = "";
let lastScanAt = 0;

function updateClock() {
  clock.textContent = new Intl.DateTimeFormat("en-GB", {
    timeZone: EGYPT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function setStatus(type, message, label = "") {
  statusBox.className = `status-box ${type}`;
  statusBox.querySelector(".status-label").textContent = label || type.toUpperCase();
  statusText.textContent = message;
}

function addLog(message) {
  const item = document.createElement("li");
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: EGYPT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  item.textContent = `${time} - ${message}`;
  scanLog.prepend(item);

  while (scanLog.children.length > 8) {
    scanLog.lastElementChild.remove();
  }
}

function parseQr(rawValue) {
  const parts = rawValue.split(",");
  if (parts.length < 2) {
    return null;
  }

  const groupId = parts.shift().trim();
  const studentName = parts.join(",").trim();

  if (!groupId || !studentName) {
    return null;
  }

  return { groupId, studentName };
}

function canSendScan(rawValue) {
  const now = Date.now();
  const normalized = rawValue.trim().toLowerCase();

  if (normalized === lastScanValue && now - lastScanAt < SCAN_COOLDOWN_MS) {
    return false;
  }

  lastScanValue = normalized;
  lastScanAt = now;
  return true;
}

function submitScan(rawValue) {
  const cleanValue = rawValue.trim();
  const parsed = parseQr(cleanValue);

  if (!parsed) {
    setStatus("error", "QR must look like: A,David Emad", "Invalid QR");
    addLog(`Invalid QR: ${cleanValue || "empty"}`);
    return;
  }

  if (!canSendScan(cleanValue)) {
    return;
  }

  if (SCRIPT_URL.includes("PASTE_YOUR")) {
    setStatus("error", "Add your Google Apps Script web app URL in app.js first.", "Missing URL");
    addLog("Google Script URL is not configured");
    return;
  }

  setStatus("sending", `Sending ${parsed.groupId}, ${parsed.studentName}...`, "Sending");
  callScript(cleanValue)
    .then((result) => {
      const status = result.status || "ok";
      const message = result.message || "Attendance recorded.";
      const type = status === "error" ? "error" : status === "late" ? "late" : "success";
      setStatus(type, message, status.toUpperCase());
      addLog(message);
    })
    .catch((error) => {
      setStatus("error", error.message || "Could not contact the Google Script.", "Error");
      addLog("Failed to record scan");
    });
}

function callScript(qrValue) {
  return new Promise((resolve, reject) => {
    const callbackName = `attendanceCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Script did not respond."));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload || {});
    };

    const url = new URL(SCRIPT_URL);
    url.searchParams.set("action", "scan");
    url.searchParams.set("qr", qrValue);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", Date.now().toString());

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not load the Google Script response."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    setStatus("error", "Scanner library did not load. Check your internet connection.", "Scanner");
    return;
  }

  if (scanning) {
    return;
  }

  qrScanner = qrScanner || new Html5Qrcode("reader");
  setStatus("sending", "Opening camera...", "Camera");

  try {
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (decodedText) => submitScan(decodedText),
      () => {}
    );
    scanning = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    setStatus("idle", "Camera is ready. Scan a student QR code.", "Ready");
  } catch (error) {
    setStatus("error", "Camera permission failed or no camera was found.", "Camera Error");
  }
}

async function stopScanner() {
  if (!qrScanner || !scanning) {
    return;
  }

  await qrScanner.stop();
  qrScanner.clear();
  scanning = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("idle", "Camera stopped.", "Stopped");
}

startButton.addEventListener("click", startScanner);
stopButton.addEventListener("click", stopScanner);

manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitScan(manualQr.value);
  manualQr.select();
});

updateClock();
window.setInterval(updateClock, 1000);
