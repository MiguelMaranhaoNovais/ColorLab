'use strict';

/**
 * Cálculos matemáticos do ColorLab: absorbância digital, regressão linear,
 * validação da calibração e agregação de medições repetidas.
 *
 * Funções puras (sem acesso ao DOM), reutilizadas pelo app.js e cobertas
 * pelos testes automatizados em tests/run-tests.js.
 */

/**
 * Absorbância digital aproximada, baseada no canal vermelho:
 *   Ad = log10(R_branco / R_amostra)
 *
 * Esta NÃO é a absorbância espectrofotométrica (que depende de comprimento
 * de onda, caminho óptico e resposta espectral de um espectrofotômetro
 * calibrado). É apenas uma transformação log10 da razão de intensidades do
 * canal vermelho da câmera, útil como aproximação exploratória quando a
 * relação concentração-cor é aproximadamente exponencial no canal escolhido.
 */
function calculateDigitalAbsorbance(blankReading, sampleReading) {
    if (!blankReading) {
        throw new Error('registre primeiro o branco.');
    }

    if (!sampleReading) {
        throw new Error('leitura da amostra ausente.');
    }

    const referenceIntensity = blankReading.r;
    const sampleIntensity = sampleReading.r;

    if (!(referenceIntensity > 0) || !(sampleIntensity > 0)) {
        throw new Error('intensidade do canal vermelho inválida para calcular a absorbância digital.');
    }

    return Math.log10(referenceIntensity / sampleIntensity);
}

/**
 * Regressão linear por mínimos quadrados: y = slope * x + intercept.
 * Retorna também R² e os resíduos de cada ponto.
 *
 * Lança erro explícito em vez de produzir NaN/Infinity quando os dados são
 * insuficientes para uma regressão válida (menos de 2 pontos ou todos os x
 * iguais — divisão por zero).
 */
function calculateLinearRegression(points) {
    if (!Array.isArray(points) || points.length < 2) {
        throw new Error('são necessários pelo menos dois pontos para calcular a regressão linear.');
    }

    const n = points.length;
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);

    if (denominator === 0) {
        throw new Error('os padrões precisam ter concentrações diferentes (todas as concentrações são iguais).');
    }

    const slope = points.reduce(
        (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
        0,
    ) / denominator;
    const intercept = meanY - slope * meanX;

    const residuals = points.map((point) => {
        const predicted = slope * point.x + intercept;
        return {
            x: point.x,
            y: point.y,
            predicted,
            residual: point.y - predicted,
        };
    });

    const totalSumSquares = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const residualSumSquares = residuals.reduce((sum, item) => sum + item.residual ** 2, 0);

    // Quando todos os y são idênticos (totalSumSquares = 0), o ajuste é
    // perfeito por definição (reta horizontal passando por todos os pontos).
    const rSquared = totalSumSquares === 0 ? 1 : 1 - residualSumSquares / totalSumSquares;

    return {
        slope,
        intercept,
        rSquared,
        residuals,
        n,
    };
}

/**
 * Verifica se um valor de concentração estimado está dentro da faixa
 * coberta pelos padrões de calibração (nunca presuma validade fora dela).
 */
function isWithinCalibrationRange(value, minimum, maximum) {
    if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
        return false;
    }

    return value >= minimum && value <= maximum;
}

/**
 * Detecta padrões cadastrados com a mesma concentração (dentro de uma
 * tolerância numérica pequena). Concentrações duplicadas não quebram a
 * regressão, mas merecem alerta: podem indicar erro de digitação ou, se
 * intencionais, deveriam ser tratadas como medições repetidas (ver
 * aggregateRepeatedReading) em vez de pontos independentes da curva.
 */
function findDuplicateConcentrations(standards, tolerance = 1e-9) {
    const duplicates = [];

    for (let i = 0; i < standards.length; i += 1) {
        for (let j = i + 1; j < standards.length; j += 1) {
            if (Math.abs(standards[i].concentration - standards[j].concentration) <= tolerance) {
                duplicates.push([i, j]);
            }
        }
    }

    return duplicates;
}

/**
 * Agrega uma nova leitura a um padrão já existente de mesma concentração,
 * calculando a média das leituras RGB e o desvio padrão (repetibilidade).
 * Retorna um novo objeto de padrão; não modifica os argumentos.
 */
function aggregateRepeatedReading(existingStandard, newReading) {
    const previousReadings = existingStandard.readings ?? [existingStandard.reading];
    const readings = [...previousReadings, newReading];
    const count = readings.length;

    const sum = readings.reduce(
        (acc, reading) => ({
            r: acc.r + reading.r,
            g: acc.g + reading.g,
            b: acc.b + reading.b,
        }),
        { r: 0, g: 0, b: 0 },
    );

    const mean = { r: sum.r / count, g: sum.g / count, b: sum.b / count };

    const variance = readings.reduce(
        (acc, reading) => ({
            r: acc.r + (reading.r - mean.r) ** 2,
            g: acc.g + (reading.g - mean.g) ** 2,
            b: acc.b + (reading.b - mean.b) ** 2,
        }),
        { r: 0, g: 0, b: 0 },
    );

    const stdDev = {
        r: Math.sqrt(variance.r / count),
        g: Math.sqrt(variance.g / count),
        b: Math.sqrt(variance.b / count),
    };

    // Coeficiente de variação (%) do canal vermelho, usado para avaliar a
    // repetibilidade das medições (quanto menor, mais repetível).
    const coefficientOfVariation = mean.r === 0 ? null : (stdDev.r / Math.abs(mean.r)) * 100;

    return {
        concentration: existingStandard.concentration,
        reading: mean,
        readings,
        repeatCount: count,
        stdDev,
        coefficientOfVariation,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateDigitalAbsorbance,
        calculateLinearRegression,
        isWithinCalibrationRange,
        findDuplicateConcentrations,
        aggregateRepeatedReading,
    };
}
