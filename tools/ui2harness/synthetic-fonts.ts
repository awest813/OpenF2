/**
 * Synthetic .FON-shaped fonts for harness runs (real font files only exist
 * in a game install). Rasterizes ASCII with the system monospace face at a
 * few pixel heights and converts the alpha channel into the 1-bit texture
 * layout fon.ts produces, so UIFontSet/BitmapFontRenderer exercise the
 * production code path end to end.
 */
import { createCanvas } from '@napi-rs/canvas'
import type { Font } from '../../src/formats/fon.js'

const HEIGHTS = [9, 11, 13]
/** BitmapFontRenderer indexes symbols by character code, so the table must
 *  span 0..LAST_CHAR with empty placeholders below the printable range. */
const LAST_CHAR = 126

function buildFont(height: number): Font {
    const measure = createCanvas(64, height)
    const mctx = measure.getContext('2d')!

    type Glyph = { width: number; rows: boolean[][] }
    const glyphs: Glyph[] = []
    let totalWidth = 0

    for (let code = 0; code <= LAST_CHAR; code++) {
        if (code < 32) {
            // Control range: empty placeholder so symbols[code] stays aligned.
            glyphs.push({ width: 0, rows: [] })
            continue
        }
        const char = String.fromCharCode(code)
        if (char === ' ') {
            // Blank cell with a proportional width so word gaps read correctly.
            const w = Math.max(2, Math.round(height * 0.3))
            glyphs.push({ width: w, rows: [] })
            totalWidth += w
            continue
        }
        mctx.clearRect(0, 0, 64, height)
        mctx.font = `${height - 2}px monospace`
        mctx.fillStyle = '#fff'
        mctx.textBaseline = 'alphabetic'
        mctx.fillText(char, 0, height - 2)
        const img = mctx.getImageData(0, 0, 64, height)
        // Trim to ink extent.
        let maxW = 1
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < 64; x++) {
                if (img.data[(y * 64 + x) * 4 + 3] > 96 && x + 1 > maxW) {maxW = x + 1}
            }
        }
        const rows: boolean[][] = []
        for (let y = 0; y < height; y++) {
            const row: boolean[] = []
            for (let x = 0; x < maxW; x++) {
                row.push(img.data[(y * 64 + x) * 4 + 3] > 96)
            }
            rows.push(row)
        }
        glyphs.push({ width: maxW, rows })
        totalWidth += maxW
    }

    const textureData = new Uint8Array(totalWidth * height)
    const symbols: Array<{ width: number; offset: number }> = []

    let xOffset = 0
    for (const g of glyphs) {
        symbols.push({ width: g.width, offset: xOffset })
        for (let y = 0; y < g.rows.length; y++) {
            for (let x = 0; x < g.width; x++) {
                if (g.rows[y][x]) {
                    textureData[y * totalWidth + xOffset + x] = 255
                }
            }
        }
        xOffset += g.width
    }

    return {
        filepath: `synthetic-${height}.fon`,
        symbols,
        height,
        spacing: 1,
        textureData,
    }
}

export function buildSyntheticFonts(): Font[] {
    return HEIGHTS.map(buildFont)
}
