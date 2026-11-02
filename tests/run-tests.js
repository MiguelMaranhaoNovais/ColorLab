'use strict';

/**
 * Testes automatizados do ColorLab (Node.js, sem dependências externas).
 *
 * Cobre js/image-processing.js e js/calculations.js — os dois módulos que
 * não tocam o DOM e, por isso, podem ser testados fora do navegador.
 * A lógica de câmera (js/camera.js) e a orquestração de UI (js/app.js)
 * dependem de APIs de navegador (getUserMedia, canvas, localStorage) e não
 * são cobertas aqui; recomenda-se um teste manual em dispositivo real para
 * elas (ver README.md).
 *
 * Executar com: node tests/run-tests.js
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const { calculateRGB, rgbToHsv, rgbToLab } = require(path.join('..', 'js', 'image-processing.js'));
const {
    calculateDigitalAbsorbance,
    calculateLinearRegression,
    isWithinCalibrationRange,
    findDuplicateConcentrations,
    aggregateRepeatedReading,
} = require(path.join('..', 'js', 'calculations.js'));

// --- utilitário para montar um ImageData falso (compatível o bastante
// para os testes: apenas { data, width, height }) ------------------------
function makeImageData(pixels, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);

    pixels.forEach((pixel, index) => {
        const offset = index * 4;
        data[offset] = pixel[0];
        data[offset + 1] = pixel[1];
        data[offset + 2] = pixel[2];
        data[offset + 3] = pixel.length > 3 ? pixel[3] : 255;
    });

    return { data, width, height };
}

function solidImageData(r, g, b, width, height, alpha = 255) {
    const pixels = [];
    for (let i = 0; i < width * height; i += 1) {
        pixels.push([r, g, b, alpha]);
    }
    return makeImageData(pixels, width, height);
}

// --- framework de testes mínimo ------------------------------------------
const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

function run() {
    let passed = 0;
    let failed = 0;

    tests.forEach(({ name, fn }) => {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed += 1;
        } catch (error) {
            console.error(`  ✗ ${name}`);
            console.error(`    ${error.message}`);
            failed += 1;
        }
    });

    console.log('');
    console.log(`${passed} passou(ram), ${failed} falhou(aram), ${tests.length} no total.`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

// =========================================================================
// 1. Cor uniforme
// =========================================================================
test('calculateRGB: região com cor uniforme retorna média/mediana exatas e desvio padrão zero', () => {
    const imageData = solidImageData(120, 60, 200, 10, 10);
    const result = calculateRGB(imageData);

    assert.equal(result.totalPixels, 100);
    assert.equal(result.mean.r, 120);
    assert.equal(result.mean.g, 60);
    assert.equal(result.mean.b, 200);
    assert.equal(result.median.r, 120);
    assert.equal(result.median.g, 60);
    assert.equal(result.median.b, 200);
    assert.equal(result.stdDev.r, 0);
    assert.equal(result.stdDev.g, 0);
    assert.equal(result.stdDev.b, 0);
    // Região uniforme e grande o suficiente não deve gerar alerta de
    // variação de cor nem de tamanho.
    assert.ok(!result.warnings.some((w) => w.includes('variação de cor')));
    assert.ok(!result.warnings.some((w) => w.includes('muito pequena')));
});

// =========================================================================
// 2. Região com cores diferentes
// =========================================================================
test('calculateRGB: região com metade preta e metade branca calcula média correta e alerta de heterogeneidade', () => {
    const width = 10;
    const height = 10;
    const pixels = [];

    for (let i = 0; i < width * height; i += 1) {
        // Metade dos pixels preta, metade branca.
        pixels.push(i % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
    }

    const imageData = makeImageData(pixels, width, height);
    const result = calculateRGB(imageData);

    assert.equal(result.totalPixels, 100);
    assert.equal(result.mean.r, 127.5);
    assert.equal(result.mean.g, 127.5);
    assert.equal(result.mean.b, 127.5);
    // Alta variação de cor dentro do ROI deve ser sinalizada.
    assert.ok(result.warnings.some((w) => w.includes('variação de cor')));
});

// =========================================================================
// 3. Escala de cinza
// =========================================================================
test('calculateRGB + rgbToHsv: pixel cinza tem saturação zero e matiz zero', () => {
    const imageData = solidImageData(128, 128, 128, 4, 4);
    const result = calculateRGB(imageData);

    assert.equal(result.hsv.s, 0);
    assert.equal(result.hsv.h, 0);
    assert.ok(result.hsv.v > 0 && result.hsv.v < 1);
});

test('rgbToLab: preto puro e branco puro têm L* nos extremos (0 e 100)', () => {
    const black = rgbToLab(0, 0, 0);
    const white = rgbToLab(255, 255, 255);

    assert.ok(Math.abs(black.l - 0) < 0.01);
    assert.ok(Math.abs(white.l - 100) < 0.01);
});

// =========================================================================
// 4. Transparência
// =========================================================================
test('calculateRGB: pixels totalmente transparentes são ignorados no cálculo', () => {
    const width = 2;
    const height = 2;
    const pixels = [
        [200, 0, 0, 255],
        [200, 0, 0, 255],
        [0, 0, 0, 0], // transparente: não deve contar
        [0, 0, 0, 0], // transparente: não deve contar
    ];

    const imageData = makeImageData(pixels, width, height);
    const result = calculateRGB(imageData);

    assert.equal(result.totalPixels, 2);
    assert.equal(result.mean.r, 200);
});

test('calculateRGB: lança erro quando todos os pixels são transparentes', () => {
    const imageData = solidImageData(10, 10, 10, 2, 2, 0);
    assert.throws(() => calculateRGB(imageData), /sem pixels válidos/);
});

// =========================================================================
// 5. ROI pequena
// =========================================================================
test('calculateRGB: ROI pequena (poucos pixels) gera alerta de confiabilidade', () => {
    const imageData = solidImageData(50, 50, 50, 3, 3); // 9 pixels
    const result = calculateRGB(imageData);

    assert.ok(result.warnings.some((w) => w.includes('muito pequena')));
});

// =========================================================================
// 6. Regressão linear
// =========================================================================
test('calculateLinearRegression: recupera exatamente a reta y = 2x + 1 sem ruído', () => {
    const points = [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 5 },
        { x: 3, y: 7 },
    ];

    const result = calculateLinearRegression(points);

    assert.ok(Math.abs(result.slope - 2) < 1e-9);
    assert.ok(Math.abs(result.intercept - 1) < 1e-9);
    assert.ok(Math.abs(result.rSquared - 1) < 1e-9);
});

test('calculateLinearRegression: dados com ruído têm R² estritamente menor que 1', () => {
    const points = [
        { x: 0, y: 1.1 },
        { x: 1, y: 2.8 },
        { x: 2, y: 5.4 },
        { x: 3, y: 6.7 },
    ];

    const result = calculateLinearRegression(points);
    assert.ok(result.rSquared < 1);
    assert.ok(result.rSquared > 0.9); // ainda um ajuste bom, mas não perfeito
});

// =========================================================================
// 7. R² (casos de borda)
// =========================================================================
test('calculateLinearRegression: todos os y iguais produz R² = 1 (ajuste trivial perfeito)', () => {
    const points = [
        { x: 0, y: 5 },
        { x: 1, y: 5 },
        { x: 2, y: 5 },
    ];

    const result = calculateLinearRegression(points);
    assert.equal(result.slope, 0);
    assert.equal(result.intercept, 5);
    assert.equal(result.rSquared, 1);
});

// =========================================================================
// 8. Extrapolação
// =========================================================================
test('isWithinCalibrationRange: identifica corretamente valores dentro e fora da faixa', () => {
    assert.equal(isWithinCalibrationRange(5, 0, 10), true);
    assert.equal(isWithinCalibrationRange(0, 0, 10), true);
    assert.equal(isWithinCalibrationRange(10, 0, 10), true);
    assert.equal(isWithinCalibrationRange(10.0001, 0, 10), false);
    assert.equal(isWithinCalibrationRange(-0.0001, 0, 10), false);
    assert.equal(isWithinCalibrationRange(NaN, 0, 10), false);
});

// =========================================================================
// 9. Padrões duplicados
// =========================================================================
test('findDuplicateConcentrations: detecta padrões com a mesma concentração', () => {
    const standards = [
        { concentration: 1 },
        { concentration: 2 },
        { concentration: 2 },
        { concentration: 3 },
    ];

    const duplicates = findDuplicateConcentrations(standards);
    assert.equal(duplicates.length, 1);
    assert.deepEqual(duplicates[0], [1, 2]);
});

test('findDuplicateConcentrations: não aponta duplicata quando todas as concentrações são diferentes', () => {
    const standards = [{ concentration: 1 }, { concentration: 2 }, { concentration: 3 }];
    assert.equal(findDuplicateConcentrations(standards).length, 0);
});

test('aggregateRepeatedReading: faz a média de medições repetidas e calcula o CV%', () => {
    const existing = { concentration: 5, reading: { r: 100, g: 50, b: 20 }, readings: [{ r: 100, g: 50, b: 20 }] };
    const aggregated = aggregateRepeatedReading(existing, { r: 110, g: 52, b: 18 });

    assert.equal(aggregated.repeatCount, 2);
    assert.ok(Math.abs(aggregated.reading.r - 105) < 1e-9);
    assert.ok(aggregated.coefficientOfVariation > 0);
});

// =========================================================================
// 10. Dados insuficientes / prevenção de divisão por zero
// =========================================================================
test('calculateLinearRegression: lança erro com menos de dois pontos', () => {
    assert.throws(() => calculateLinearRegression([{ x: 1, y: 1 }]), /pelo menos dois pontos/);
    assert.throws(() => calculateLinearRegression([]), /pelo menos dois pontos/);
});

test('calculateLinearRegression: lança erro (não divide por zero) quando todas as concentrações são iguais', () => {
    const points = [
        { x: 2, y: 1 },
        { x: 2, y: 3 },
        { x: 2, y: 5 },
    ];

    assert.throws(() => calculateLinearRegression(points), /concentrações diferentes/);
});

test('calculateDigitalAbsorbance: exige o branco registrado e intensidades válidas', () => {
    assert.throws(() => calculateDigitalAbsorbance(null, { r: 100 }), /registre primeiro o branco/);
    assert.throws(
        () => calculateDigitalAbsorbance({ r: 0 }, { r: 100 }),
        /intensidade do canal vermelho inválida/,
    );
    assert.throws(
        () => calculateDigitalAbsorbance({ r: 200 }, { r: 0 }),
        /intensidade do canal vermelho inválida/,
    );
});

test('calculateDigitalAbsorbance: branco igual à amostra resulta em absorbância zero', () => {
    const absorbance = calculateDigitalAbsorbance({ r: 180 }, { r: 180 });
    assert.ok(Math.abs(absorbance - 0) < 1e-9);
});

console.log('ColorLab — testes automatizados\n');
run();
