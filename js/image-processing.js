
function calculateRGB(imageData) {
    const pixels = imageData.data;

    const histogram = {
        r: new Uint32Array(256),
        g: new Uint32Array(256),
        b: new Uint32Array(256)
    };

    let red = 0;
    let green = 0;
    let blue = 0;
    let totalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) continue;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        red += r;
        green += g;
        blue += b;

        histogram.r[r]++;
        histogram.g[g]++;
        histogram.b[b]++;

        totalPixels++;
    }

    function getMedian(hist) {
        const targets = [
            Math.floor((totalPixels - 1) / 2),
            Math.floor(totalPixels / 2)
        ];

        let cumulative = 0;
        let first = null;
        let second = null;

        for (let i = 0; i < 256; i++) {
            cumulative += hist[i];

            if (
                first === null &&
                cumulative > targets[0]
            ) {
                first = i;
            }

            if (cumulative > targets[1]) {
                second = i;
                break;
            }
        }

        return (first + second) / 2;
    }

    if (totalPixels === 0) {
        throw new Error("Região sem pixels válidos.");
    }

    return {
        mean: {
            r: red / totalPixels,
            g: green / totalPixels,
            b: blue / totalPixels
        },

        median: {
            r: getMedian(histogram.r),
            g: getMedian(histogram.g),
            b: getMedian(histogram.b)
        },

        totalPixels
    };
}
