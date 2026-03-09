/**
 * Global test environment shims for modules with browser-only top-level code.
 * This file runs before any test module is imported.
 */

// heart.ts assigns window.onkeydown/onkeyup/onfocus/onblur at module scope.
// Provide a minimal stub so these assignments don't throw in Node.
if (typeof window === 'undefined') {
    ;(global as any).window = {
        onkeydown: null,
        onkeyup: null,
        onfocus: null,
        onblur: null,
    }
}

// ui2/uiPanel.ts uses OffscreenCanvas which is not available in Node.
// Provide a minimal stub so UIManagerImpl can be instantiated in tests.
if (typeof OffscreenCanvas === 'undefined') {
    function _makeCtx2dStub() {
        return {
            canvas: { width: 640, height: 480 },
            clearRect: () => {},
            save: () => {},
            restore: () => {},
            translate: () => {},
            fillRect: () => {},
            fillText: () => {},
            strokeRect: () => {},
            drawImage: () => {},
            // Approximate monospace text measurement for test environments.
            measureText: (text: string) => ({ width: text.length * 6.5 }),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'alphabetic',
        }
    }
    ;(global as any).OffscreenCanvas = class MockOffscreenCanvas {
        width: number
        height: number
        constructor(w: number, h: number) {
            this.width = w
            this.height = h
        }
        getContext(type: string) {
            if (type === '2d') return _makeCtx2dStub()
            return null
        }
    }
}
