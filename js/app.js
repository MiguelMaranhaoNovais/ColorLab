const imageInput = document.getElementById("imageInput");
const canvas = document.getElementById("imageCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const openCameraButton = document.getElementById("openCameraButton");
const closeCameraButton = document.getElementById("closeCameraButton");
const captureButton = document.getElementById("captureButton");
const cameraPanel = document.getElementById("cameraPanel");
const cameraVideo = document.getElementById("cameraVideo");
const cameraStatus = document.getElementById("cameraStatus");
const emptyState = document.getElementById("emptyState");
const analyzeButton = document.getElementById("analyzeButton");
const clearButton = document.getElementById("clearSelection");

const output = {
    red: document.getElementById("red"),
    green: document.getElementById("green"),
    blue: document.getElementById("blue"),
    medianRed: document.getElementById("medianRed"),
    medianGreen: document.getElementById("medianGreen"),
    medianBlue: document.getElementById("medianBlue"),
    colorPreview: document.getElementById("colorPreview"),
    pixelCount: document.getElementById("pixelCount")
};

// O canvas original guarda os pixels sem a borda visual da seleção.
const originalCanvas = document.createElement("canvas");
const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });

let loadedImage = false;
let selection = null;
let selecting = false;
let startPoint = null;
let cameraStream = null;

function setStatus(message, isError = false) {
    cameraStatus.textContent = message;
    cameraStatus.classList.toggle("error", isError);
}

function resetResults() {
    ["red", "green", "blue", "medianRed", "medianGreen", "medianBlue"]
        .forEach(id => output[id].textContent = "--");
    output.colorPreview.style.backgroundColor = "#334155";
    output.pixelCount.textContent = "pixels analisados: --";
}

function updateButtons() {
    analyzeButton.disabled = !loadedImage || !selection;
    clearButton.disabled = !selection;
    emptyState.hidden = loadedImage;
}

function drawPreview() {
    if (!loadedImage) return;

    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalCanvas, 0, 0);

    if (selection) {
        ctx.save();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = Math.max(2, canvas.width / 500);
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
        ctx.restore();
    }
}

function setImage(source) {
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    originalCanvas.width = width;
    originalCanvas.height = height;
    originalCtx.clearRect(0, 0, width, height);
    originalCtx.drawImage(source, 0, 0, width, height);

    loadedImage = true;
    selection = null;
    resetResults();
    drawPreview();
    updateButtons();
}

function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height))
    };
}

// Entrada pela galeria/arquivos.
imageInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setStatus("selecione um arquivo de imagem válido.", true);
        return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        setImage(image);
        URL.revokeObjectURL(imageUrl);
        setStatus("fotografia carregada. selecione a região do líquido.");
        stopCamera();
    };

    image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        setStatus("não foi possível abrir essa imagem.", true);
    };

    image.src = imageUrl;
});

// A câmera exige contexto seguro: HTTPS ou localhost.
async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("este navegador não liberou acesso à câmera. use HTTPS ou localhost e tente novamente.", true);
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
                height: { ideal: 1080 }
            }
        });

        cameraVideo.srcObject = cameraStream;
        cameraPanel.hidden = false;
        openCameraButton.disabled = true;

        await cameraVideo.play();
        captureButton.disabled = false;
        setStatus("câmera ativa. enquadre a amostra e tire a foto.");
    } catch (error) {
        console.error("Erro ao abrir câmera:", error);
        stopCamera();

        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            setStatus("permissão negada. autorize o uso da câmera nas configurações do navegador.", true);
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            setStatus("nenhuma câmera foi encontrada neste dispositivo.", true);
        } else {
            setStatus("não foi possível iniciar a câmera. verifique a conexão segura e se outro app está usando a câmera.", true);
        }
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
    captureButton.disabled = true;
    openCameraButton.disabled = false;
}

function capturePhoto() {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
        setStatus("aguarde a câmera carregar antes de tirar a foto.", true);
        return;
    }

    setImage(cameraVideo);
    stopCamera();
    setStatus("foto capturada pela câmera. agora selecione a região do líquido.");
}

openCameraButton.addEventListener("click", openCamera);
closeCameraButton.addEventListener("click", () => {
    stopCamera();
    setStatus("câmera fechada.");
});
captureButton.addEventListener("click", capturePhoto);

// Seleção retangular da região de interesse (ROI).
canvas.addEventListener("pointerdown", event => {
    if (!loadedImage) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    selecting = true;
    startPoint = getCanvasPoint(event);
    selection = { x: startPoint.x, y: startPoint.y, width: 0, height: 0 };
    drawPreview();
});

canvas.addEventListener("pointermove", event => {
    if (!selecting || !startPoint) return;
    const point = getCanvasPoint(event);
    selection = {
        x: Math.min(startPoint.x, point.x),
        y: Math.min(startPoint.y, point.y),
        width: Math.abs(point.x - startPoint.x),
        height: Math.abs(point.y - startPoint.y)
    };
    drawPreview();
});

function finishSelection() {
    if (!selecting) return;
    selecting = false;
    startPoint = null;

    if (!selection || selection.width < 2 || selection.height < 2) {
        selection = null;
        setStatus("selecione uma área retangular maior para analisar.");
    } else {
        setStatus("região selecionada. clique em analisar região.");
    }

    drawPreview();
    updateButtons();
}

canvas.addEventListener("pointerup", finishSelection);
canvas.addEventListener("pointercancel", finishSelection);

clearButton.addEventListener("click", () => {
    selection = null;
    resetResults();
    drawPreview();
    updateButtons();
    setStatus("seleção removida.");
});

analyzeButton.addEventListener("click", () => {
    if (!selection || !loadedImage) return;

    const x = Math.max(0, Math.floor(selection.x));
    const y = Math.max(0, Math.floor(selection.y));
    const right = Math.min(originalCanvas.width, Math.ceil(selection.x + selection.width));
    const bottom = Math.min(originalCanvas.height, Math.ceil(selection.y + selection.height));
    const width = right - x;
    const height = bottom - y;

    if (width <= 0 || height <= 0) {
        setStatus("a região selecionada é inválida.", true);
        return;
    }

    try {
        const imageData = originalCtx.getImageData(x, y, width, height);
        const result = calculateRGB(imageData);

        output.red.textContent = result.mean.r.toFixed(2);
        output.green.textContent = result.mean.g.toFixed(2);
        output.blue.textContent = result.mean.b.toFixed(2);
        output.medianRed.textContent = result.median.r.toFixed(2);
        output.medianGreen.textContent = result.median.g.toFixed(2);
        output.medianBlue.textContent = result.median.b.toFixed(2);

        output.colorPreview.style.backgroundColor =
            `rgb(${Math.round(result.mean.r)}, ${Math.round(result.mean.g)}, ${Math.round(result.mean.b)})`;
        output.pixelCount.textContent =
            `pixels analisados: ${result.totalPixels.toLocaleString("pt-BR")}`;

        setStatus("análise RGB concluída.");
    } catch (error) {
        console.error("Erro na análise:", error);
        setStatus("não foi possível analisar a região selecionada.", true);
    }
});

window.addEventListener("pagehide", stopCamera);
updateButtons();
resetResults();
