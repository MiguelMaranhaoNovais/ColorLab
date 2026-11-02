'use strict';

/**
 * Processamento de imagens do ColorLab.
 *
 * Todas as funções aqui são puras (sem acesso ao DOM), o que permite
 * reutilizá-las tanto no navegador quanto nos testes automatizados em Node
 * (ver tests/run-tests.js).
 */

// Limiares de detecção de pixels saturados (estourados) ou muito escuros.
// Valores próximos de 255 costumam indicar reflexo/estouro de exposição;
// valores próximos de 0 em todos os canais costumam indicar sombra/subexposição.
const HIGHLIGHT_THRESHOLD = 250;
const SHADOW_THRESHOLD = 8;

// Acima desse desvio padrão (em um canal, escala 0-255), a região é
// considerada heterogênea o suficiente para merecer um alerta (possíveis
// bordas, bolhas, sombras parciais ou reflexos dentro do ROI).
const HIGH_STDDEV_THRESHOLD = 18;

// Frações (do total de pixels do ROI) acima das quais os alertas de
// estouro/sombra são emitidos.
const SATURATION_WARNING_FRACTION = 0.02;

function calculateRGB(imageData) {
    const pixels = imageData.data;
    const histogram = {
        r: new Uint32Array(256),
        g: new Uint32Array(256),
        b: new Uint32Array(256),
    };

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumSquaresR = 0;
    let sumSquaresG = 0;
    let sumSquaresB = 0;
    let totalPixels = 0;
    let highlightPixels = 0;
    let shadowPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
            // Pixel totalmente transparente: não faz parte da amostra.
            continue;
        }

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        sumR += r;
        sumG += g;
        sumB += b;
        sumSquaresR += r * r;
        sumSquaresG += g * g;
        sumSquaresB += b * b;

        histogram.r[r] += 1;
        histogram.g[g] += 1;
        histogram.b[b] += 1;

        if (r >= HIGHLIGHT_THRESHOLD || g >= HIGHLIGHT_THRESHOLD || b >= HIGHLIGHT_THRESHOLD) {
            highlightPixels += 1;
        }

        if (r <= SHADOW_THRESHOLD && g <= SHADOW_THRESHOLD && b <= SHADOW_THRESHOLD) {
            shadowPixels += 1;
        }

        totalPixels += 1;
    }

    if (totalPixels === 0) {
        throw new Error('Região sem pixels válidos (totalmente transparente).');
    }

    function getMedian(hist) {
        const targets = [
            Math.floor((totalPixels - 1) / 2),
            Math.floor(totalPixels / 2),
        ];
        let cumulative = 0;
        let first = null;
        let second = null;

        for (let i = 0; i < 256; i += 1) {
            cumulative += hist[i];

            if (first === null && cumulative > targets[0]) {
                first = i;
            }

            if (cumulative > targets[1]) {
                second = i;
                break;
            }
        }

        return (first + second) / 2;
    }

    function getStdDev(sum, sumSquares) {
        const mean = sum / totalPixels;
        // Proteção contra erro de arredondamento que levaria a variância
        // ligeiramente negativa (ex.: região de cor perfeitamente uniforme).
        const variance = Math.max(0, sumSquares / totalPixels - mean * mean);
        return Math.sqrt(variance);
    }

    const mean = {
        r: sumR / totalPixels,
        g: sumG / totalPixels,
        b: sumB / totalPixels,
    };

    const median = {
        r: getMedian(histogram.r),
        g: getMedian(histogram.g),
        b: getMedian(histogram.b),
    };

    const stdDev = {
        r: getStdDev(sumR, sumSquaresR),
        g: getStdDev(sumG, sumSquaresG),
        b: getStdDev(sumB, sumSquaresB),
    };

    const highlightFraction = highlightPixels / totalPixels;
    const shadowFraction = shadowPixels / totalPixels;
    const maxStdDev = Math.max(stdDev.r, stdDev.g, stdDev.b);

    const warnings = [];

    if (highlightFraction > SATURATION_WARNING_FRACTION) {
        warnings.push(
            `${(highlightFraction * 100).toFixed(1)}% dos pixels estão saturados (possível reflexo ou estouro de exposição).`,
        );
    }

    if (shadowFraction > SATURATION_WARNING_FRACTION) {
        warnings.push(
            `${(shadowFraction * 100).toFixed(1)}% dos pixels estão muito escuros (possível sombra ou subexposição).`,
        );
    }

    if (maxStdDev > HIGH_STDDEV_THRESHOLD) {
        warnings.push(
            'alta variação de cor dentro da região selecionada (possíveis bordas, bolhas, sombras parciais ou reflexos). considere selecionar uma área mais uniforme.',
        );
    }

    if (totalPixels < 64) {
        warnings.push('região de interesse muito pequena; o resultado pode ser menos confiável. selecione uma área maior.');
    }

    return {
        mean,
        median,
        stdDev,
        totalPixels,
        hsv: rgbToHsv(mean.r, mean.g, mean.b),
        lab: rgbToLab(mean.r, mean.g, mean.b),
        saturation: {
            highlightPixels,
            shadowPixels,
            highlightFraction,
            shadowFraction,
        },
        warnings,
    };
}

/**
 * Converte RGB (0-255) para HSV (h em graus 0-360, s e v em 0-1).
 * Usado para descrever a cor média da região em um espaço perceptualmente
 * mais intuitivo que o RGB puro.
 */
function rgbToHsv(r, g, b) {
    const rN = r / 255;
    const gN = g / 255;
    const bN = b / 255;

    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const delta = max - min;

    let hue = 0;

    if (delta !== 0) {
        if (max === rN) {
            hue = 60 * (((gN - bN) / delta) % 6);
        } else if (max === gN) {
            hue = 60 * ((bN - rN) / delta + 2);
        } else {
            hue = 60 * ((rN - gN) / delta + 4);
        }
    }

    if (hue < 0) {
        hue += 360;
    }

    const saturation = max === 0 ? 0 : delta / max;
    const value = max;

    return { h: hue, s: saturation, v: value };
}

/**
 * Converte RGB (sRGB, 0-255) para CIELAB (D65), via XYZ.
 * Referência: especificação sRGB (IEC 61966-2-1) + transformação CIE padrão.
 */
function srgbChannelToLinear(value) {
    const normalized = value / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
}

function labPivot(t) {
    const delta = 6 / 29;
    return t > delta ** 3
        ? Math.cbrt(t)
        : t / (3 * delta * delta) + 4 / 29;
}

function rgbToLab(r, g, b) {
    const rLin = srgbChannelToLinear(r);
    const gLin = srgbChannelToLinear(g);
    const bLin = srgbChannelToLinear(b);

    // Matriz sRGB -> XYZ (D65).
    const x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
    const y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750;
    const z = rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041;

    // Branco de referência D65.
    const xn = 0.95047;
    const yn = 1.0;
    const zn = 1.08883;

    const fx = labPivot(x / xn);
    const fy = labPivot(y / yn);
    const fz = labPivot(z / zn);

    const l = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const labB = 200 * (fy - fz);

    return { l, a, b: labB };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateRGB,
        rgbToHsv,
        rgbToLab,
    };
}
