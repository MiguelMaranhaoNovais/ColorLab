'use strict';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

const imageInput = $('imageInput');
const canvas = $('imageCanvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const originalCanvas = document.createElement('canvas');
const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });

const elements = {
    openCameraButton: $('openCameraButton'),
    closeCameraButton: $('closeCameraButton'),
    captureButton: $('captureButton'),
    cameraPanel: $('cameraPanel'),
    cameraVideo: $('cameraVideo'),
    cameraStatus: $('cameraStatus'),
    emptyState: $('emptyState'),
    analyzeButton: $('analyzeButton'),
    clearButton: $('clearSelection'),
    exportCsvButton: $('exportCsvButton'),
    setBlankButton: $('setBlankButton'),
    addStandardButton: $('addStandardButton'),
    clearStandardsButton: $('clearStandardsButton'),
    calculateCurveButton: $('calculateCurveButton'),
    estimateButton: $('estimateButton'),
};

const output = {
    red: $('red'),
    green: $('green'),
    blue: $('blue'),
    medianRed: $('medianRed'),
    medianGreen: $('medianGreen'),
    medianBlue: $('medianBlue'),
    colorPreview: $('colorPreview'),
    pixelCount: $('pixelCount'),
};

let loadedImage = false;
let selection = null;
let selecting = false;
let startPoint = null;
let cameraStream = null;
let currentReading = null;
let currentSource = 'imagem';
let blankReading = null;
let standards = [];
let calibration = null;
const readingHistory = [];

function setStatus(message, isError = false) {
    elements.cameraStatus.textContent = message;
    elements.cameraStatus.classList.toggle('error', isError);
}

function resetReading() {
    currentReading = null;

    [
        'red',
        'green',
        'blue',
        'medianRed',
        'medianGreen',
        'medianBlue',
    ].forEach((id) => {
        $(id).textContent = '--';
    });

    output.colorPreview.style.backgroundColor = '#334155';
    output.pixelCount.textContent = 'pixels analisados: --';
    $('hexValue').textContent = '#------';
    updateCalibrationButtons();
}

function updateButtons() {
    elements.analyzeButton.disabled = !loadedImage || !selection;
    elements.clearButton.disabled = !selection;
    elements.emptyState.hidden = loadedImage;
}

function updateCalibrationButtons() {
    elements.setBlankButton.disabled = !currentReading;
    elements.addStandardButton.disabled = !currentReading;
    elements.clearStandardsButton.disabled = standards.length === 0;
    elements.calculateCurveButton.disabled = standards.length < 2 || !blankReading;
    elements.estimateButton.disabled = !calibration || !currentReading;
    elements.exportCsvButton.disabled = readingHistory.length === 0
        && standards.length === 0
        && !blankReading;
}

function drawPreview() {
    if (!loadedImage) {
        return;
    }

    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(originalCanvas, 0, 0);

    if (!selection) {
        return;
    }

    context.save();
    context.strokeStyle = '#facc15';
    context.lineWidth = Math.max(3, canvas.width / 450);
    context.setLineDash([10, 6]);
    context.strokeRect(
        selection.x,
        selection.y,
        selection.width,
        selection.height,
    );
    context.restore();
}

function getSourceDimensions(source) {
    if (source instanceof HTMLVideoElement) {
        return {
            width: source.videoWidth,
            height: source.videoHeight,
        };
    }

    return {
        width: source.naturalWidth || source.width,
        height: source.naturalHeight || source.height,
    };
}

function setImage(source, sourceLabel) {
    const dimensions = getSourceDimensions(source);
    const sourceWidth = dimensions.width;
    const sourceHeight = dimensions.height;

    if (!sourceWidth || !sourceHeight) {
        throw new Error('a imagem ainda não está pronta.');
    }

    const maxDimension = 1800;
    const scale = Math.min(
        1,
        maxDimension / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    originalCanvas.width = width;
    originalCanvas.height = height;
    originalContext.clearRect(0, 0, width, height);
    originalContext.drawImage(source, 0, 0, width, height);

    loadedImage = true;
    currentSource = sourceLabel;
    selection = null;
    resetReading();
    drawPreview();
    updateButtons();
}

function loadImageFile(file) {
    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/')) {
        setStatus('selecione um arquivo de imagem válido.', true);
        return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        try {
            setImage(image, 'galeria');
            setStatus('fotografia carregada. selecione a região que deseja analisar.');
            stopCamera();
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    };

    image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        setStatus('não foi possível abrir essa imagem.', true);
    };

    image.src = imageUrl;
}

imageInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    loadImageFile(file);

    // Permite selecionar novamente o mesmo arquivo em uma próxima tentativa.
    imageInput.value = '';
});

function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: Math.max(
            0,
            Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width),
        ),
        y: Math.max(
            0,
            Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height),
        ),
    };
}

async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('câmera indisponível. abra o aplicativo por HTTPS ou localhost.', true);
        return;
    }

    try {
        stopCamera();
        setStatus('solicitando permissão para acessar a câmera...');

        cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
        });

        elements.cameraVideo.srcObject = cameraStream;
        elements.cameraPanel.hidden = false;
        elements.openCameraButton.disabled = true;

        await elements.cameraVideo.play();

        if (!elements.cameraVideo.videoWidth) {
            await new Promise((resolve, reject) => {
                elements.cameraVideo.addEventListener('loadedmetadata', resolve, { once: true });
                window.setTimeout(() => reject(new Error('tempo esgotado ao iniciar a câmera.')), 8000);
            });
        }

        elements.captureButton.disabled = false;
        setStatus('câmera ativa. enquadre a amostra e tire a foto.');
    } catch (error) {
        console.error('erro ao abrir câmera:', error);
        stopCamera();

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            setStatus('permissão negada. autorize a câmera nas configurações do navegador.', true);
        } else {
            setStatus('não foi possível iniciar a câmera. verifique HTTPS, permissões e outros aplicativos usando a câmera.', true);
        }
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    elements.cameraVideo.srcObject = null;
    elements.cameraPanel.hidden = true;
    elements.captureButton.disabled = true;
    elements.openCameraButton.disabled = false;
}

function capturePhoto() {
    try {
        if (!elements.cameraVideo.videoWidth || !elements.cameraVideo.videoHeight) {
            throw new Error('aguarde a câmera carregar antes de tirar a foto.');
        }

        setImage(elements.cameraVideo, 'câmera');
        stopCamera();
        setStatus('foto capturada. selecione a região que deseja analisar.');
    } catch (error) {
        setStatus(error.message, true);
    }
}

elements.openCameraButton.addEventListener('click', openCamera);
elements.closeCameraButton.addEventListener('click', () => {
    stopCamera();
    setStatus('câmera fechada.');
});
elements.captureButton.addEventListener('click', capturePhoto);

canvas.addEventListener('pointerdown', (event) => {
    if (!loadedImage) {
        return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    selecting = true;
    startPoint = pointFromEvent(event);
    selection = {
        x: startPoint.x,
        y: startPoint.y,
        width: 0,
        height: 0,
    };
    drawPreview();
});

canvas.addEventListener('pointermove', (event) => {
    if (!selecting || !startPoint) {
        return;
    }

    const point = pointFromEvent(event);
    selection = {
        x: Math.min(startPoint.x, point.x),
        y: Math.min(startPoint.y, point.y),
        width: Math.abs(point.x - startPoint.x),
        height: Math.abs(point.y - startPoint.y),
    };

    drawPreview();
});

function finishSelection() {
    if (!selecting) {
        return;
    }

    selecting = false;
    startPoint = null;

    if (!selection || selection.width < 3 || selection.height < 3) {
        selection = null;
        setStatus('selecione uma área retangular maior.');
    } else {
        setStatus('região selecionada. toque em analisar região.');
    }

    drawPreview();
    updateButtons();
}

canvas.addEventListener('pointerup', finishSelection);
canvas.addEventListener('pointercancel', finishSelection);
canvas.addEventListener('lostpointercapture', finishSelection);

elements.clearButton.addEventListener('click', () => {
    selection = null;
    resetReading();
    drawPreview();
    updateButtons();
    setStatus('seleção removida.');
});

function getCurrentReading() {
    const left = Math.max(0, Math.floor(selection.x));
    const top = Math.max(0, Math.floor(selection.y));
    const right = Math.min(
        originalCanvas.width,
        Math.ceil(selection.x + selection.width),
    );
    const bottom = Math.min(
        originalCanvas.height,
        Math.ceil(selection.y + selection.height),
    );
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        throw new Error('região selecionada inválida.');
    }

    return calculateRGB(originalContext.getImageData(left, top, width, height));
}

function formatHex(rgb) {
    return rgb
        .map((value) => Math.round(value).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

function displayReading(result) {
    currentReading = result;

    output.red.textContent = result.mean.r.toFixed(2);
    output.green.textContent = result.mean.g.toFixed(2);
    output.blue.textContent = result.mean.b.toFixed(2);
    output.medianRed.textContent = result.median.r.toFixed(2);
    output.medianGreen.textContent = result.median.g.toFixed(2);
    output.medianBlue.textContent = result.median.b.toFixed(2);

    const rgb = [result.mean.r, result.mean.g, result.mean.b];
    output.colorPreview.style.backgroundColor = `rgb(${rgb.map(Math.round).join(', ')})`;
    $('hexValue').textContent = `#${formatHex(rgb)}`;
    output.pixelCount.textContent = `pixels analisados: ${result.totalPixels.toLocaleString('pt-BR')}`;

    readingHistory.push({
        timestamp: new Date(),
        source: currentSource,
        result,
    });

    updateCalibrationButtons();
}

elements.analyzeButton.addEventListener('click', () => {
    if (!selection || !loadedImage) {
        return;
    }

    try {
        displayReading(getCurrentReading());
        setStatus('leitura RGB concluída.');
    } catch (error) {
        console.error('erro na análise:', error);
        setStatus('não foi possível analisar a região selecionada.', true);
    }
});

function renderStandards() {
    const list = $('standardsList');
    list.replaceChildren();

    if (standards.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'empty-list';
        emptyMessage.textContent = 'nenhum padrão cadastrado.';
        list.append(emptyMessage);
        return;
    }

    standards.forEach((standard, index) => {
        const row = document.createElement('div');
        row.className = 'standard-item';

        const label = document.createElement('span');
        label.textContent = `Padrão ${index + 1} · concentração ${standard.concentration}`;

        const values = document.createElement('span');
        values.textContent = `R ${standard.reading.r.toFixed(1)} | G ${standard.reading.g.toFixed(1)} | B ${standard.reading.b.toFixed(1)}`;

        row.append(label, values);
        list.append(row);
    });
}

function calculateDigitalAbsorbance(reading) {
    if (!blankReading) {
        throw new Error('registre primeiro o branco.');
    }

    const referenceIntensity = blankReading.r;
    const sampleIntensity = reading.r;

    if (referenceIntensity <= 0 || sampleIntensity <= 0) {
        throw new Error('intensidade do canal vermelho inválida para calcular a absorbância digital.');
    }

    // Aproximação digital experimental; não equivale automaticamente à absorbância espectrofotométrica.
    return Math.log10(referenceIntensity / sampleIntensity);
}

function calculateLinearRegression(points) {
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);

    if (denominator === 0) {
        throw new Error('os padrões precisam ter concentrações diferentes.');
    }

    const slope = points.reduce(
        (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
        0,
    ) / denominator;
    const intercept = meanY - slope * meanX;
    const totalSumSquares = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const residualSumSquares = points.reduce(
        (sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2,
        0,
    );
    const rSquared = totalSumSquares === 0
        ? 1
        : 1 - residualSumSquares / totalSumSquares;

    return { slope, intercept, rSquared };
}

function svgElement(name, attributes = {}, textContent = null) {
    const element = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, String(value));
    });

    if (textContent !== null) {
        element.textContent = textContent;
    }

    return element;
}

function drawCalibrationChart(points, model) {
    const svg = $('curveChart');
    const width = 640;
    const height = 360;
    const margin = { top: 24, right: 24, bottom: 62, left: 72 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const minX = Math.min(0, ...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x)) || 1;
    const rawMinY = Math.min(0, ...points.map((point) => point.y));
    const rawMaxY = Math.max(...points.map((point) => point.y));
    const yPadding = (rawMaxY - rawMinY || 1) * 0.12;
    const minY = rawMinY - yPadding;
    const maxY = rawMaxY + yPadding;

    const xScale = (value) => margin.left + ((value - minX) / (maxX - minX || 1)) * plotWidth;
    const yScale = (value) => margin.top + plotHeight - ((value - minY) / (maxY - minY || 1)) * plotHeight;

    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Eixos e linhas de grade.
    for (let index = 0; index <= 4; index += 1) {
        const fraction = index / 4;
        const y = margin.top + fraction * plotHeight;
        const value = maxY - fraction * (maxY - minY);

        svg.append(svgElement('line', {
            x1: margin.left,
            y1: y,
            x2: width - margin.right,
            y2: y,
            stroke: '#26364d',
            'stroke-width': 1,
        }));
        svg.append(svgElement('text', {
            x: margin.left - 10,
            y: y + 4,
            fill: '#9aabc2',
            'font-size': 11,
            'text-anchor': 'end',
        }, value.toFixed(3)));
    }

    svg.append(svgElement('line', {
        x1: margin.left,
        y1: margin.top,
        x2: margin.left,
        y2: margin.top + plotHeight,
        stroke: '#8da1bb',
        'stroke-width': 1.5,
    }));
    svg.append(svgElement('line', {
        x1: margin.left,
        y1: margin.top + plotHeight,
        x2: width - margin.right,
        y2: margin.top + plotHeight,
        stroke: '#8da1bb',
        'stroke-width': 1.5,
    }));

    for (let index = 0; index <= 4; index += 1) {
        const value = minX + (index / 4) * (maxX - minX);
        const x = xScale(value);

        svg.append(svgElement('text', {
            x,
            y: margin.top + plotHeight + 22,
            fill: '#9aabc2',
            'font-size': 11,
            'text-anchor': 'middle',
        }, value.toFixed(2)));
    }

    // Reta ajustada dentro da faixa dos padrões.
    const lineStartX = Math.min(...points.map((point) => point.x));
    const lineEndX = Math.max(...points.map((point) => point.x));
    svg.append(svgElement('line', {
        x1: xScale(lineStartX),
        y1: yScale(model.slope * lineStartX + model.intercept),
        x2: xScale(lineEndX),
        y2: yScale(model.slope * lineEndX + model.intercept),
        stroke: '#55c5e8',
        'stroke-width': 3,
        'stroke-linecap': 'round',
    }));

    points.forEach((point) => {
        svg.append(svgElement('circle', {
            cx: xScale(point.x),
            cy: yScale(point.y),
            r: 6,
            fill: '#f5c76b',
            stroke: '#101827',
            'stroke-width': 2,
        }));
    });

    svg.append(svgElement('text', {
        x: margin.left + plotWidth / 2,
        y: height - 14,
        fill: '#edf4ff',
        'font-size': 12,
        'text-anchor': 'middle',
    }, 'concentração'));

    const yLabel = svgElement('text', {
        x: 18,
        y: margin.top + plotHeight / 2,
        fill: '#edf4ff',
        'font-size': 12,
        'text-anchor': 'middle',
        transform: `rotate(-90 18 ${margin.top + plotHeight / 2})`,
    }, 'absorbância digital aparente');
    svg.append(yLabel);
}

function renderCalibration() {
    const points = standards.map((standard) => ({
        x: standard.concentration,
        y: calculateDigitalAbsorbance(standard.reading),
    }));

    calibration = calculateLinearRegression(points);
    const { slope, intercept, rSquared } = calibration;
    const sign = intercept < 0 ? '−' : '+';

    $('calibrationState').textContent = 'curva calculada';
    $('curveEquation').textContent = `Aᵈ = ${slope.toFixed(5)} × C ${sign} ${Math.abs(intercept).toFixed(5)} · R² = ${rSquared.toFixed(4)}`;
    $('curveCaption').textContent = 'Pontos: padrões medidos. Linha: regressão linear. A absorbância exibida é uma aproximação digital baseada no canal vermelho.';
    $('curveResult').hidden = false;

    drawCalibrationChart(points, calibration);
    updateCalibrationButtons();
}

elements.setBlankButton.addEventListener('click', () => {
    if (!currentReading) {
        return;
    }

    blankReading = { ...currentReading.mean };
    calibration = null;
    $('calibrationState').textContent = 'branco registrado';
    $('curveResult').hidden = true;
    $('estimateResult').textContent = 'branco registrado. adicione pelo menos dois padrões conhecidos e gere a curva.';
    updateCalibrationButtons();
    setStatus('leitura atual registrada como branco.');
});

elements.addStandardButton.addEventListener('click', () => {
    if (!currentReading) {
        return;
    }

    const input = $('standardConcentration');
    const concentration = Number(input.value.replace(',', '.'));

    if (!Number.isFinite(concentration) || concentration <= 0) {
        setStatus('informe uma concentração positiva para o padrão.', true);
        input.focus();
        return;
    }

    standards.push({
        concentration,
        reading: { ...currentReading.mean },
    });
    standards.sort((a, b) => a.concentration - b.concentration);

    calibration = null;
    $('curveResult').hidden = true;
    $('calibrationState').textContent = 'padrões registrados';
    $('estimateResult').textContent = 'padrões atualizados. gere novamente a curva de calibração.';
    renderStandards();
    updateCalibrationButtons();

    input.value = '';
    setStatus('padrão adicionado.');
});

elements.calculateCurveButton.addEventListener('click', () => {
    try {
        if (!blankReading) {
            throw new Error('registre o branco antes de calibrar.');
        }

        if (standards.length < 2) {
            throw new Error('adicione pelo menos dois padrões.');
        }

        renderCalibration();
        setStatus('curva de calibração calculada.');
    } catch (error) {
        calibration = null;
        updateCalibrationButtons();
        setStatus(error.message, true);
    }
});

elements.clearStandardsButton.addEventListener('click', () => {
    standards = [];
    calibration = null;
    renderStandards();
    $('curveResult').hidden = true;
    $('calibrationState').textContent = blankReading ? 'branco registrado' : 'não calibrado';
    $('estimateResult').textContent = 'padrões removidos.';
    updateCalibrationButtons();
});

elements.estimateButton.addEventListener('click', () => {
    try {
        if (!calibration || !currentReading) {
            throw new Error('gere a curva e analise a amostra.');
        }

        const absorbance = calculateDigitalAbsorbance(currentReading.mean);
        const concentration = (absorbance - calibration.intercept) / calibration.slope;
        const minimum = Math.min(...standards.map((standard) => standard.concentration));
        const maximum = Math.max(...standards.map((standard) => standard.concentration));
        const result = $('estimateResult');

        result.replaceChildren();

        if (!Number.isFinite(concentration) || concentration < 0) {
            result.textContent = 'a estimativa ficou abaixo de zero ou inválida. confira a leitura, o branco e a curva.';
            return;
        }

        const label = document.createElement('span');
        label.textContent = 'concentração estimada (na unidade usada nos padrões)';

        const value = document.createElement('strong');
        value.textContent = concentration.toFixed(4);

        const note = document.createElement('span');
        note.textContent = concentration < minimum || concentration > maximum
            ? 'atenção: resultado extrapolado fora da faixa de calibração. não interprete como quantitativo confiável.'
            : `dentro da faixa dos padrões · absorbância digital ${absorbance.toFixed(4)} · R² ${calibration.rSquared.toFixed(4)}`;

        result.append(label, value, note);
    } catch (error) {
        setStatus(error.message, true);
    }
});

function csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv() {
    const rows = [
        ['tipo', 'data_hora', 'origem', 'concentracao', 'media_r', 'media_g', 'media_b', 'mediana_r', 'mediana_g', 'mediana_b', 'pixels', 'absorbancia_digital'],
    ];

    if (blankReading) {
        rows.push([
            'branco', '', '', 0,
            blankReading.r, blankReading.g, blankReading.b,
            '', '', '', '', 0,
        ]);
    }

    readingHistory.forEach((entry) => {
        const { mean, median, totalPixels } = entry.result;
        rows.push([
            'leitura',
            entry.timestamp.toISOString(),
            entry.source,
            '',
            mean.r,
            mean.g,
            mean.b,
            median.r,
            median.g,
            median.b,
            totalPixels,
            blankReading ? calculateDigitalAbsorbance(mean) : '',
        ]);
    });

    standards.forEach((standard) => {
        rows.push([
            'padrao', '', '', standard.concentration,
            standard.reading.r,
            standard.reading.g,
            standard.reading.b,
            '', '', '', '',
            blankReading ? calculateDigitalAbsorbance(standard.reading) : '',
        ]);
    });

    if (calibration) {
        rows.push(['regressao_linear', '', '', '', '', '', '', '', '', '', '', `inclinação=${calibration.slope}; intercepto=${calibration.intercept}; R2=${calibration.rSquared}`]);
    }

    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `colorlab-dados-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

elements.exportCsvButton.addEventListener('click', exportCsv);

window.addEventListener('pagehide', stopCamera);

renderStandards();
updateButtons();
resetReading();
