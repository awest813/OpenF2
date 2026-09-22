/**
 * Node-side global shims for the ui2 harness. Must be the FIRST import in
 * the entry file: some engine modules (heart.ts) install window event
 * handlers at module scope.
 */
import { createCanvas } from '@napi-rs/canvas'

// OffscreenCanvas shim backed by a real @napi-rs Canvas so drawImage between
// offscreen surfaces works (BitmapFontRenderer blits its glyph atlas).
// Returning the native canvas from the constructor lets ctx.drawImage accept it.
const g = globalThis as any
g.OffscreenCanvas = class OffscreenCanvasShim {
    constructor(width: number, height: number) {
        return createCanvas(width, height) as any
    }
}
g.window = g.window ?? g
g.document = g.document ?? {
    readyState: 'complete',
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
}

export {}
