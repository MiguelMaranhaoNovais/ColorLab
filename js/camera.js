'use strict';

/**
 * Controle da câmera do dispositivo (captura ao vivo via getUserMedia).
 *
 * Expõe o objeto global `ColorLabCamera`, usado pelo app.js. Mantido em
 * módulo separado para isolar o código com efeitos colaterais de hardware
 * (permissões, streams) do restante da aplicação.
 */
const ColorLabCamera = (() => {
    let stream = null;
    let videoElement = null;
    let facingMode = 'environment';
    let availableFacingModes = ['environment', 'user'];

    function isSupported() {
        return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    function stop() {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }

        if (videoElement) {
            videoElement.srcObject = null;
        }
    }

    async function start(video, requestedFacingMode = facingMode) {
        if (!isSupported()) {
            throw new Error('câmera indisponível. abra o aplicativo por HTTPS ou localhost.');
        }

        stop();
        videoElement = video;
        facingMode = requestedFacingMode;

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            });
        } catch (error) {
            // Alguns dispositivos (ex.: desktops sem câmera frontal/traseira
            // diferenciada) rejeitam facingMode "exact"/"ideal" específico.
            // Tenta novamente sem restrição de câmera antes de desistir.
            if (requestedFacingMode !== undefined) {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: true,
                });
            } else {
                throw error;
            }
        }

        video.srcObject = stream;
        await video.play();

        if (!video.videoWidth) {
            await new Promise((resolve, reject) => {
                video.addEventListener('loadedmetadata', resolve, { once: true });
                window.setTimeout(() => reject(new Error('tempo esgotado ao iniciar a câmera.')), 8000);
            });
        }

        return stream;
    }

    async function switchFacing(video) {
        const nextIndex = (availableFacingModes.indexOf(facingMode) + 1) % availableFacingModes.length;
        const nextFacing = availableFacingModes[nextIndex];
        await start(video, nextFacing);
        return facingMode;
    }

    function getFacingMode() {
        return facingMode;
    }

    return {
        isSupported,
        start,
        stop,
        switchFacing,
        getFacingMode,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ColorLabCamera };
}
