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
    switchCameraButton: $('switchCameraButton'),
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
    warningsList: $('warningsList'),
    persistenceHint: $('persistenceHint'),
    clearStorageButton: $('clearStorageButton'),
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
    hsvH: $('hsvH'),
    hsvS: $('hsvS'),
    hsvV: $('hsvV'),
    labL: $('labL'),
    labA: $('labA'),
    labB: $('labB'),
};

let loadedImage = false;
let selection = null;
let selecting = false;
let startPoint = null;
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
        'hsvH',
        'hsvS',
        'hsvV',
        'labL',
        'labA',
        'labB',
    ].forEach((id) => {
        $(id).textContent = '--';
    });

    output.colorPreview.style.backgroundColor = '#334155';
    output.pixelCount.textContent = 'pixels analisados: --';
    $('hexValue').textContent = '#------';
    renderWarnings([]);
    updateCalibrationButtons();
}

function renderWarnings(warnings) {
    elements.warningsList.replaceChildren();

    if (!warnings || warnings.length === 0) {
        elements.warningsList.hidden = true;
        return;
    }

    warnings.forEach((warning) => {
        const item = document.createElement('li');
        item.textContent = `⚠ ${warning}`;
        elements.warningsList.append(item);
    });
    elements.warningsList.hidden = false;
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

async function loadImageFile(file) {
    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/')) {
        setStatus('selecione um arquivo de imagem válido.', true);
        return;
    }

    setStatus('carregando fotografia...');

    // Fotos de câmeras de celular costumam trazer a orientação em metadados
    // EXIF em vez de girar os pixels de fato. `drawImage` em um <canvas>
    // ignora esses metadados, o que fazia fotos em retrato aparecerem
    // deitadas/invertidas. `createImageBitmap` com `imageOrientation:
    // 'from-image'` aplica a rotação correta antes de chegarmos ao canvas.
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            setImage(bitmap, 'galeria');
            bitmap.close?.();
            setStatus('fotografia carregada. selecione a região que deseja analisar.');
            stopCamera();
            return;
        } catch (error) {
            console.warn('createImageBitmap falhou, usando fallback com <img>:', error);
            // Segue para o fallback abaixo em vez de falhar silenciosamente.
        }
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        try {
            setImage(image, 'galeria');
            setStatus('fotografia carregada. selecione a região que deseja analisar. observação: em navegadores sem suporte a createImageBitmap, fotos em retrato podem aparecer com a orientação original do arquivo.');
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
    if (!ColorLabCamera.isSupported()) {
        setStatus('câmera indisponível. abra o aplicativo por HTTPS ou localhost.', true);
        return;
    }

    try {
        setStatus('solicitando permissão para acessar a câmera...');

        await ColorLabCamera.start(elements.cameraVideo, 'environment');

        elements.cameraPanel.hidden = false;
        elements.openCameraButton.disabled = true;
        elements.captureButton.disabled = false;
        elements.switchCameraButton.disabled = false;
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
    ColorLabCamera.stop();
    elements.cameraPanel.hidden = true;
    elements.captureButton.disabled = true;
    elements.switchCameraButton.disabled = true;
    elements.openCameraButton.disabled = false;
}

async function switchCamera() {
    try {
        setStatus('trocando câmera...');
        const facing = await ColorLabCamera.switchFacing(elements.cameraVideo);
        setStatus(`câmera ${facing === 'environment' ? 'traseira' : 'frontal'} ativa. enquadre a amostra e tire a foto.`);
    } catch (error) {
        console.error('erro ao trocar câmera:', error);
        setStatus('não foi possível trocar de câmera neste dispositivo.', true);
    }
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
elements.switchCameraButton.addEventListener('click', switchCamera);

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

    output.hsvH.textContent = `${result.hsv.h.toFixed(1)}°`;
    output.hsvS.textContent = `${(result.hsv.s * 100).toFixed(1)}%`;
    output.hsvV.textContent = `${(result.hsv.v * 100).toFixed(1)}%`;
    output.labL.textContent = result.lab.l.toFixed(2);
    output.labA.textContent = result.lab.a.toFixed(2);
    output.labB.textContent = result.lab.b.toFixed(2);

    const rgb = [result.mean.r, result.mean.g, result.mean.b];
    output.colorPreview.style.backgroundColor = `rgb(${rgb.map(Math.round).join(', ')})`;
    $('hexValue').textContent = `#${formatHex(rgb)}`;
    output.pixelCount.textContent = `pixels analisados: ${result.totalPixels.toLocaleString('pt-BR')}`;

    renderWarnings(result.warnings);

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

    const duplicates = findDuplicateConcentrations(standards);
    const duplicateIndexes = new Set(duplicates.flat());

    standards.forEach((standard, index) => {
        const row = document.createElement('div');
        row.className = 'standard-item';

        const label = document.createElement('span');
        const repeatInfo = standard.repeatCount > 1
            ? ` · ${standard.repeatCount} medições, CV ${standard.coefficientOfVariation === null ? 'n/d' : `${standard.coefficientOfVariation.toFixed(2)}%`}`
            : '';
        const duplicateFlag = duplicateIndexes.has(index) ? ' ⚠ concentração duplicada' : '';
        label.textContent = `Padrão ${index + 1} · concentração ${standard.concentration}${repeatInfo}${duplicateFlag}`;

        const values = document.createElement('span');
        values.textContent = `R ${standard.reading.r.toFixed(1)} | G ${standard.reading.g.toFixed(1)} | B ${standard.reading.b.toFixed(1)}`;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'standard-remove';
        removeButton.textContent = 'remover';
        removeButton.addEventListener('click', () => removeStandard(index));

        row.append(label, values, removeButton);
        list.append(row);
    });
}

function removeStandard(index) {
    standards.splice(index, 1);
    calibration = null;
    $('curveResult').hidden = true;
    $('calibrationState').textContent = standards.length === 0 && !blankReading ? 'não calibrado' : 'padrões atualizados';
    $('estimateResult').textContent = 'padrão removido. gere novamente a curva de calibração, se necessário.';
    renderStandards();
    updateCalibrationButtons();
    persistState();
    setStatus('padrão removido.');
}

// calculateDigitalAbsorbance e calculateLinearRegression agora vivem em
// js/calculations.js (funções puras, compartilhadas com os testes
// automatizados). Aqui mantemos apenas um wrapper fino que já injeta o
// branco atual, para não precisar repeti-lo em cada chamada.
function digitalAbsorbanceForReading(reading) {
    return calculateDigitalAbsorbance(blankReading, reading);
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
        y: digitalAbsorbanceForReading(standard.reading),
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
    persistState();
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

    // Concentração igual a um padrão já cadastrado: trata como medição
    // repetida do mesmo padrão (faz a média e registra a repetibilidade)
    // em vez de criar um ponto independente e artificialmente duplicado na
    // curva de calibração.
    const existingIndex = standards.findIndex(
        (standard) => Math.abs(standard.concentration - concentration) <= 1e-9,
    );

    if (existingIndex >= 0) {
        standards[existingIndex] = aggregateRepeatedReading(
            standards[existingIndex],
            { ...currentReading.mean },
        );
        setStatus(`medição repetida registrada para a concentração ${concentration} (${standards[existingIndex].repeatCount} medições no total).`);
    } else {
        standards.push({
            concentration,
            reading: { ...currentReading.mean },
            readings: [{ ...currentReading.mean }],
            repeatCount: 1,
            coefficientOfVariation: null,
        });
        standards.sort((a, b) => a.concentration - b.concentration);
        setStatus('padrão adicionado.');
    }

    calibration = null;
    $('curveResult').hidden = true;
    $('calibrationState').textContent = 'padrões registrados';
    $('estimateResult').textContent = 'padrões atualizados. gere novamente a curva de calibração.';
    renderStandards();
    updateCalibrationButtons();
    persistState();

    input.value = '';
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
    persistState();
});

elements.estimateButton.addEventListener('click', () => {
    try {
        if (!calibration || !currentReading) {
            throw new Error('gere a curva e analise a amostra.');
        }

        const absorbance = digitalAbsorbanceForReading(currentReading.mean);
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
        note.textContent = isWithinCalibrationRange(concentration, minimum, maximum)
            ? `dentro da faixa dos padrões · absorbância digital ${absorbance.toFixed(4)} · R² ${calibration.rSquared.toFixed(4)}`
            : 'atenção: resultado extrapolado fora da faixa de calibração. não interprete como quantitativo confiável.';

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
        ['tipo', 'data_hora', 'origem', 'concentracao', 'media_r', 'media_g', 'media_b', 'mediana_r', 'mediana_g', 'mediana_b', 'pixels', 'absorbancia_digital', 'num_medicoes', 'cv_percent_r'],
    ];

    if (blankReading) {
        rows.push([
            'branco', '', '', 0,
            blankReading.r, blankReading.g, blankReading.b,
            '', '', '', '', 0, '', '',
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
            blankReading ? digitalAbsorbanceForReading(mean) : '',
            '', '',
        ]);
    });

    standards.forEach((standard) => {
        rows.push([
            'padrao', '', '', standard.concentration,
            standard.reading.r,
            standard.reading.g,
            standard.reading.b,
            '', '', '', '',
            blankReading ? digitalAbsorbanceForReading(standard.reading) : '',
            standard.repeatCount ?? 1,
            standard.coefficientOfVariation == null ? '' : standard.coefficientOfVariation.toFixed(3),
        ]);
    });

    if (calibration) {
        rows.push(['regressao_linear', '', '', '', '', '', '', '', '', '', '', `inclinação=${calibration.slope}; intercepto=${calibration.intercept}; R2=${calibration.rSquared}`, '', '']);
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

// --- Persistência local -----------------------------------------------
//
// Apenas o branco e os padrões (números pequenos) são salvos no
// localStorage do navegador — nunca as imagens capturadas, que
// permanecem somente em memória e nunca são enviadas a servidores
// externos. Isso permite retomar uma calibração em andamento após
// recarregar a página, sem reintroduzir dependência de rede.
const STORAGE_KEY = 'colorlab:v1';

function persistState() {
    try {
        const payload = {
            blankReading,
            standards,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('não foi possível salvar os dados localmente:', error);
    }
}

function clearPersistedState() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('não foi possível limpar os dados salvos:', error);
    }
    elements.persistenceHint.hidden = true;
}

function restoreState() {
    let saved = null;

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('não foi possível ler os dados salvos:', error);
        return;
    }

    if (!saved || (!saved.blankReading && (!saved.standards || saved.standards.length === 0))) {
        return;
    }

    blankReading = saved.blankReading ?? null;
    standards = Array.isArray(saved.standards) ? saved.standards : [];

    renderStandards();
    $('calibrationState').textContent = blankReading ? 'branco registrado' : 'não calibrado';
    elements.persistenceHint.hidden = false;
    updateCalibrationButtons();
}

elements.clearStorageButton.addEventListener('click', () => {
    blankReading = null;
    standards = [];
    calibration = null;
    renderStandards();
    $('curveResult').hidden = true;
    $('calibrationState').textContent = 'não calibrado';
    $('estimateResult').textContent = 'aguardando calibração e leitura da amostra.';
    updateCalibrationButtons();
    clearPersistedState();
    setStatus('dados salvos localmente foram apagados.');
});

window.addEventListener('pagehide', stopCamera);

renderStandards();
updateButtons();
resetReading();
restoreState();
