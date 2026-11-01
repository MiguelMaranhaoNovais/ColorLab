const $ = (id) => document.getElementById(id);
const imageInput = $("imageInput"),
  canvas = $("imageCanvas"),
  ctx = canvas.getContext("2d", { willReadFrequently: true });
const originalCanvas = document.createElement("canvas"),
  originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
const openCameraButton = $("openCameraButton"),
  closeCameraButton = $("closeCameraButton"),
  captureButton = $("captureButton"),
  cameraPanel = $("cameraPanel"),
  cameraVideo = $("cameraVideo");
const cameraStatus = $("cameraStatus"),
  emptyState = $("emptyState"),
  analyzeButton = $("analyzeButton"),
  clearButton = $("clearSelection");
const output = {
  red: $("red"),
  green: $("green"),
  blue: $("blue"),
  medianRed: $("medianRed"),
  medianGreen: $("medianGreen"),
  medianBlue: $("medianBlue"),
  colorPreview: $("colorPreview"),
  pixelCount: $("pixelCount"),
};
let loadedImage = false,
  selection = null,
  selecting = false,
  startPoint = null,
  cameraStream = null,
  currentReading = null,
  blankReading = null,
  standards = [],
  calibration = null;
const setStatus = (message, error = false) => {
  cameraStatus.textContent = message;
  cameraStatus.classList.toggle("error", error);
};
function resetReading() {
  currentReading = null;
  ["red", "green", "blue", "medianRed", "medianGreen", "medianBlue"].forEach(
    (id) => ($(id).textContent = "--"),
  );
  output.colorPreview.style.background = "#334155";
  output.pixelCount.textContent = "pixels analisados: --";
  $("hexValue").textContent = "#------";
  updateCalibrationButtons();
}
function updateButtons() {
  analyzeButton.disabled = !loadedImage || !selection;
  clearButton.disabled = !selection;
  emptyState.hidden = loadedImage;
}
function updateCalibrationButtons() {
  $("setBlankButton").disabled = !currentReading;
  $("addStandardButton").disabled = !currentReading;
  $("clearStandardsButton").disabled = !standards.length;
  $("calculateCurveButton").disabled = standards.length < 2;
  $("estimateButton").disabled = !calibration || !currentReading;
}
function drawPreview() {
  if (!loadedImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = originalCanvas.width;
  canvas.height = originalCanvas.height;
  ctx.drawImage(originalCanvas, 0, 0);
  if (selection) {
    ctx.save();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = Math.max(3, canvas.width / 450);
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
    ctx.restore();
  }
}
function setImage(source) {
  const sw =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source.naturalWidth || source.width;
  const sh =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error("A imagem ainda não está pronta.");
  const max = 1800,
    scale = Math.min(1, max / Math.max(sw, sh)),
    w = Math.max(1, Math.round(sw * scale)),
    h = Math.max(1, Math.round(sh * scale));
  originalCanvas.width = w;
  originalCanvas.height = h;
  originalCtx.clearRect(0, 0, w, h);
  originalCtx.drawImage(source, 0, 0, w, h);
  loadedImage = true;
  selection = null;
  resetReading();
  drawPreview();
  updateButtons();
}
function pointFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(canvas.width, ((e.clientX - r.left) * canvas.width) / r.width),
    ),
    y: Math.max(
      0,
      Math.min(canvas.height, ((e.clientY - r.top) * canvas.height) / r.height),
    ),
  };
}
imageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("selecione um arquivo de imagem válido.", true);
    return;
  }
  const url = URL.createObjectURL(file),
    img = new Image();
  img.onload = () => {
    try {
      setImage(img);
      setStatus(
        "fotografia carregada. selecione uma região uniforme do líquido.",
      );
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      URL.revokeObjectURL(url);
      stopCamera();
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("não foi possível abrir essa imagem.", true);
  };
  img.src = url;
  imageInput.value = "";
});
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(
      "câmera indisponível. abra o aplicativo por HTTPS ou localhost.",
      true,
    );
    return;
  }
  try {
    stopCamera();
    setStatus("solicitando permissão para acessar a câmera...");
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    cameraVideo.srcObject = cameraStream;
    cameraPanel.hidden = false;
    openCameraButton.disabled = true;
    await cameraVideo.play();
    if (!cameraVideo.videoWidth)
      await new Promise((resolve, reject) => {
        cameraVideo.addEventListener("loadedmetadata", resolve, { once: true });
        setTimeout(
          () => reject(new Error("tempo esgotado ao iniciar câmera")),
          8000,
        );
      });
    captureButton.disabled = false;
    setStatus("câmera ativa. enquadre a amostra e tire a foto.");
  } catch (err) {
    console.error(err);
    stopCamera();
    setStatus(
      err.name === "NotAllowedError"
        ? "permissão negada. autorize a câmera nas configurações do navegador."
        : "não foi possível iniciar a câmera. verifique HTTPS, permissões e outros aplicativos usando a câmera.",
      true,
    );
  }
}
function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  cameraPanel.hidden = true;
  captureButton.disabled = true;
  openCameraButton.disabled = false;
}
function capturePhoto() {
  try {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight)
      throw new Error("aguarde a câmera carregar.");
    setImage(cameraVideo);
    stopCamera();
    setStatus("foto capturada. selecione a região do líquido.");
  } catch (err) {
    setStatus(err.message, true);
  }
}
openCameraButton.addEventListener("click", openCamera);
closeCameraButton.addEventListener("click", () => {
  stopCamera();
  setStatus("câmera fechada.");
});
captureButton.addEventListener("click", capturePhoto);
canvas.addEventListener("pointerdown", (e) => {
  if (!loadedImage) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  selecting = true;
  startPoint = pointFromEvent(e);
  selection = { x: startPoint.x, y: startPoint.y, width: 0, height: 0 };
  drawPreview();
});
canvas.addEventListener("pointermove", (e) => {
  if (!selecting || !startPoint) return;
  const p = pointFromEvent(e);
  selection = {
    x: Math.min(startPoint.x, p.x),
    y: Math.min(startPoint.y, p.y),
    width: Math.abs(p.x - startPoint.x),
    height: Math.abs(p.y - startPoint.y),
  };
  drawPreview();
});
function finishSelection() {
  if (!selecting) return;
  selecting = false;
  startPoint = null;
  if (!selection || selection.width < 3 || selection.height < 3) {
    selection = null;
    setStatus("selecione uma área retangular maior.");
  } else setStatus("região selecionada. toque em analisar região.");
  drawPreview();
  updateButtons();
}
canvas.addEventListener("pointerup", finishSelection);
canvas.addEventListener("pointercancel", finishSelection);
canvas.addEventListener("lostpointercapture", finishSelection);
clearButton.addEventListener("click", () => {
  selection = null;
  resetReading();
  drawPreview();
  updateButtons();
  setStatus("seleção removida.");
});
function getReading() {
  const x = Math.max(0, Math.floor(selection.x)),
    y = Math.max(0, Math.floor(selection.y)),
    r = Math.min(
      originalCanvas.width,
      Math.ceil(selection.x + selection.width),
    ),
    b = Math.min(
      originalCanvas.height,
      Math.ceil(selection.y + selection.height),
    );
  if (r <= x || b <= y) throw new Error("região selecionada inválida.");
  return calculateRGB(originalCtx.getImageData(x, y, r - x, b - y));
}
function displayReading(result) {
  currentReading = result;
  for (const c of ["r", "g", "b"]) {
    output[
      ["r", "g", "b"].indexOf(c) === 0 ? "red" : c === "g" ? "green" : "blue"
    ].textContent = result.mean[c].toFixed(2);
    output[
      c === "r" ? "medianRed" : c === "g" ? "medianGreen" : "medianBlue"
    ].textContent = result.median[c].toFixed(2);
  }
  const rgb = [result.mean.r, result.mean.g, result.mean.b].map((v) =>
    Math.round(v),
  );
  output.colorPreview.style.backgroundColor = `rgb(${rgb.join(",")})`;
  $("hexValue").textContent =
    "#" +
    rgb
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  output.pixelCount.textContent = `pixels analisados: ${result.totalPixels.toLocaleString("pt-BR")}`;
  updateCalibrationButtons();
}
analyzeButton.addEventListener("click", () => {
  if (!selection || !loadedImage) return;
  try {
    displayReading(getReading());
    setStatus("leitura RGB concluída.");
  } catch (e) {
    console.error(e);
    setStatus("falha ao analisar a região.", true);
  }
});
$("setBlankButton").addEventListener("click", () => {
  if (!currentReading) return;
  blankReading = { ...currentReading.mean };
  calibration = null;
  $("calibrationState").textContent = "branco registrado";
  $("curveResult").hidden = true;
  $("estimateResult").textContent =
    "branco registrado. adicione pelo menos dois padrões conhecidos e gere a curva.";
  updateCalibrationButtons();
});
$("addStandardButton").addEventListener("click", () => {
  if (!currentReading) return;
  const input = $("standardConcentration"),
    value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    setStatus("informe uma concentração positiva para o padrão.", true);
    input.focus();
    return;
  }
  standards.push({ concentration: value, reading: { ...currentReading.mean } });
  standards.sort((a, b) => a.concentration - b.concentration);
  renderStandards();
  calibration = null;
  $("curveResult").hidden = true;
  updateCalibrationButtons();
  setStatus("padrão adicionado.");
  input.value = "";
});
function renderStandards() {
  $("standardsList").replaceChildren();
  if (!standards.length) {
    const p = document.createElement("p");
    p.className = "empty-list";
    p.textContent = "nenhum padrão cadastrado.";
    $("standardsList").append(p);
    return;
  }
  standards.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "standard-item";
    const a = document.createElement("span"),
      b = document.createElement("span");
    a.textContent = `Padrão ${i + 1} · concentração ${s.concentration}`;
    b.textContent = `R ${s.reading.r.toFixed(1)} | G ${s.reading.g.toFixed(1)} | B ${s.reading.b.toFixed(1)}`;
    row.append(a, b);
    $("standardsList").append(row);
  });
}
function absorbance(reading) {
  if (!blankReading) throw new Error("registre primeiro o branco.");
  const i0 = blankReading.r,
    i = reading.r;
  if (i0 <= 0 || i <= 0)
    throw new Error(
      "intensidade do canal vermelho inválida para calcular absorbância.",
    );
  return Math.log10(i0 / i);
}
$("calculateCurveButton").addEventListener("click", () => {
  try {
    if (!blankReading) throw new Error("registre o branco antes de calibrar.");
    const pts = standards.map((s) => ({
      x: s.concentration,
      y: absorbance(s.reading),
    }));
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length,
      my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    if (!den)
      throw new Error("os padrões precisam ter concentrações diferentes.");
    const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den,
      intercept = my - slope * mx;
    if (slope <= 0)
      throw new Error(
        "a curva não apresentou inclinação positiva. confira padrões, branco e iluminação.",
      );
    const ssTot = pts.reduce((a, p) => a + (p.y - my) ** 2, 0),
      ssRes = pts.reduce(
        (a, p) => a + (p.y - (slope * p.x + intercept)) ** 2,
        0,
      ),
      r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    calibration = { slope, intercept, r2 };
    $("calibrationState").textContent = "curva calculada";
    $("curveResult").hidden = false;
    $("curveResult").textContent =
      `Modelo: A = ${slope.toFixed(5)} × C ${intercept < 0 ? "−" : "+ "} ${Math.abs(intercept).toFixed(5)} · R² = ${r2.toFixed(4)}. Use apenas dentro da faixa dos padrões.`;
    updateCalibrationButtons();
  } catch (e) {
    setStatus(e.message, true);
  }
});
$("clearStandardsButton").addEventListener("click", () => {
  standards = [];
  calibration = null;
  renderStandards();
  $("curveResult").hidden = true;
  $("calibrationState").textContent = blankReading
    ? "branco registrado"
    : "não calibrado";
  $("estimateResult").textContent = "padrões removidos.";
  updateCalibrationButtons();
});
$("estimateButton").addEventListener("click", () => {
  try {
    if (!calibration || !currentReading)
      throw new Error("gere a curva e analise a amostra.");
    const a = absorbance(currentReading),
      c = (a - calibration.intercept) / calibration.slope,
      min = Math.min(...standards.map((s) => s.concentration)),
      max = Math.max(...standards.map((s) => s.concentration));
    $("estimateResult").replaceChildren();
    if (c < 0) {
      $("estimateResult").textContent =
        "a estimativa ficou abaixo de zero. a amostra está fora do comportamento calibrado ou houve variação experimental.";
      return;
    }
    const note = document.createElement("span");
    note.textContent =
      c < min || c > max
        ? "atenção: resultado extrapolado fora da faixa de calibração. dilua ou prepare padrões que cubram essa faixa."
        : `dentro da faixa calibrada · absorbância digital ${a.toFixed(4)} · R² ${calibration.r2.toFixed(4)}`;
    const strong = document.createElement("strong");
    strong.textContent = `${c.toFixed(4)} (unid.)`;
    const label = document.createElement("span");
    label.textContent = "concentração estimada";
    $("estimateResult").append(label, strong, note);
  } catch (e) {
    setStatus(e.message, true);
  }
});
window.addEventListener("pagehide", stopCamera);
renderStandards();
updateButtons();
resetReading();
