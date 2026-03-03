/**
 * UIPanel — base class for all WebGL-rendered UI panels.
 *
 * Each panel owns a region of the canvas (a viewport-space rect) and is
 * responsible for drawing itself. Panels do not use DOM elements; all
 * rendering goes through the WebGL renderer, enabling bitmap font support
 * and pixel-accurate Fallout palette colors.
 *
 * Lifecycle:
 *   show()  → visible = true,  receives input events
 *   hide()  → visible = false, stops receiving input
 *   render(ctx) → called every frame when visible
 *   onMouseDown/onKeyDown → input dispatch from UIManager
 *
 * BitmapFontRenderer provides pixel-accurate glyph rendering that matches
 * the original Fallout .FON format. When a loaded Font is supplied, glyphs
 * are drawn from the pre-built texture atlas; otherwise the renderer falls
 * back to the system monospace font so that panels remain usable during
 * development before assets are available.
 */

import type { Font } from '../formats/fon.js'

// ---------------------------------------------------------------------------
// BitmapFontRenderer
// ---------------------------------------------------------------------------

/**
 * Renders text using a pre-parsed Fallout bitmap font (from formats/fon.ts).
 *
 * Usage:
 *   const renderer = new BitmapFontRenderer(font)
 *   renderer.drawText(ctx, 'Hello', 10, 20, FALLOUT_GREEN)
 *
 * When `font` is null the renderer falls back to a monospace system font so
 * UI panels remain usable during development.
 */
export class BitmapFontRenderer {
    private font: Font | null
    /** Pre-built ImageData derived from font.textureData (one row of glyphs). */
    private glyphCanvas: OffscreenCanvas | null = null
    /** Total atlas width (sum of all glyph widths). */
    private atlasWidth = 0
    /**
     * Per-glyph X offset within the atlas, indexed by character code.
     * Pre-computed in the constructor for O(1) per-character lookup.
     */
    private glyphOffsets: number[] = []

    constructor(font: Font | null = null) {
        this.font = font
        if (font) {
            // Build the cumulative offset table in one pass.
            let offset = 0
            for (let i = 0; i < font.symbols.length; i++) {
                this.glyphOffsets[i] = offset
                offset += font.symbols[i]?.width ?? 0
            }
            this.atlasWidth = offset
            this.glyphCanvas = this._buildAtlasCanvas(font)
        }
    }

    /** Width in pixels of a single character, or 0 if the char is unknown. */
    charWidth(ch: string): number {
        if (!this.font) return 8  // monospace fallback
        const code = ch.charCodeAt(0)
        const sym = this.font.symbols[code]
        return sym ? sym.width + (this.font.spacing ?? 1) : 0
    }

    /** Total pixel width of a string. */
    measureText(text: string): number {
        if (!this.font) return text.length * 8
        let w = 0
        for (const ch of text) w += this.charWidth(ch)
        return w
    }

    /**
     * Draw `text` at canvas position (x, y) using `color`.
     * The `y` coordinate is the top of the glyph (not the baseline).
     */
    drawText(
        ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        color: UIColor,
    ): void {
        if (!this.font || !this.glyphCanvas) {
            // System-font fallback
            ctx.font = `${this.fallbackSize()}px monospace`
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a / 255})`
            ctx.fillText(text, x, y + (this.fallbackSize() - 2))
            return
        }

        const font = this.font
        let cx = x
        for (const ch of text) {
            const code = ch.charCodeAt(0)
            const sym = font.symbols[code]
            if (!sym || sym.width === 0) {
                cx += font.spacing ?? 1
                continue
            }

            // Source X in the atlas is pre-computed in glyphOffsets for O(1) lookup
            const srcX = this.glyphOffsets[code] ?? 0

            // Tint the glyph with `color` via compositing
            ctx.save()
            ctx.globalCompositeOperation = 'source-over'

            // Draw the glyph bitmap (white mask).
            // Cast needed because our custom OffscreenCanvas declaration
            // does not extend the DOM's CanvasImageSource union type.
            ctx.drawImage(
                this.glyphCanvas as unknown as CanvasImageSource,
                srcX, 0, sym.width, font.height,
                cx, y, sym.width, font.height,
            )

            // Multiply: replace white pixels with the requested color
            ctx.globalCompositeOperation = 'source-atop'
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a / 255})`
            ctx.fillRect(cx, y, sym.width, font.height)

            ctx.restore()
            cx += sym.width + (font.spacing ?? 1)
        }
    }

    private fallbackSize(): number {
        return this.font ? this.font.height : 12
    }

    /**
     * Convert the 1-bit texture atlas stored in `font.textureData` into an
     * OffscreenCanvas RGBA image so it can be drawn via drawImage().
     * Each set bit becomes white (255, 255, 255, 255); cleared bits are fully
     * transparent so the background shows through.
     */
    private _buildAtlasCanvas(font: Font): OffscreenCanvas {
        const canvas = new OffscreenCanvas(this.atlasWidth, font.height)
        const ctx = canvas.getContext('2d')!
        const imgData = ctx.createImageData(this.atlasWidth, font.height)
        const { data } = imgData

        for (let py = 0; py < font.height; py++) {
            for (let px = 0; px < this.atlasWidth; px++) {
                const idx = py * this.atlasWidth + px
                const alpha = font.textureData[idx] ?? 0
                const out = idx * 4
                data[out]     = 255
                data[out + 1] = 255
                data[out + 2] = 255
                data[out + 3] = alpha
            }
        }

        ctx.putImageData(imgData, 0, 0)
        return canvas
    }
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export interface UIColor {
    r: number  // 0–255
    g: number
    b: number
    a: number  // 0–255
}

export const FALLOUT_GREEN: UIColor = { r: 0, g: 195, b: 0, a: 255 }
export const FALLOUT_DARK_GREEN: UIColor = { r: 0, g: 100, b: 0, a: 255 }
export const FALLOUT_AMBER: UIColor = { r: 255, g: 165, b: 0, a: 255 }
export const FALLOUT_RED: UIColor = { r: 195, g: 0, b: 0, a: 255 }
export const FALLOUT_BLACK: UIColor = { r: 0, g: 0, b: 0, a: 255 }
export const FALLOUT_DARK_GRAY: UIColor = { r: 40, g: 40, b: 40, a: 255 }

export abstract class UIPanel {
    readonly name: string
    bounds: Rect
    visible: boolean = false
    /** Z-order: higher values render on top. */
    zOrder: number = 0

    constructor(name: string, bounds: Rect) {
        this.name = name
        this.bounds = bounds
    }

    show(): void {
        this.visible = true
        this.onShow()
    }

    hide(): void {
        this.visible = false
        this.onHide()
    }

    toggle(): void {
        if (this.visible) this.hide()
        else this.show()
    }

    /** Override to react when panel becomes visible. */
    protected onShow(): void {}
    /** Override to react when panel becomes hidden. */
    protected onHide(): void {}

    /**
     * Called each render frame when visible.
     * Implementations draw into the 2D offscreen canvas `ctx`.
     * The UIManager composites all panel canvases onto the WebGL texture.
     */
    abstract render(ctx: OffscreenCanvasRenderingContext2D): void

    onMouseDown(_x: number, _y: number, _button: 'l' | 'r'): boolean {
        return false  // return true to consume the event
    }

    onMouseMove(_x: number, _y: number): void {}

    onKeyDown(_key: string): boolean {
        return false
    }

    /** Returns true if (x, y) is within this panel's bounds. */
    containsPoint(x: number, y: number): boolean {
        return (
            x >= this.bounds.x &&
            x < this.bounds.x + this.bounds.width &&
            y >= this.bounds.y &&
            y < this.bounds.y + this.bounds.height
        )
    }
}

// ---------------------------------------------------------------------------
// UIManager — owns all panels and drives rendering + input dispatch
// ---------------------------------------------------------------------------

export class UIManagerImpl {
    private panels: UIPanel[] = []
    private offscreen: OffscreenCanvas
    private ctx: OffscreenCanvasRenderingContext2D

    constructor(width: number, height: number) {
        this.offscreen = new OffscreenCanvas(width, height)
        const ctx = this.offscreen.getContext('2d')
        if (!ctx) throw new Error('UIManager: could not get 2D context')
        this.ctx = ctx
    }

    register(panel: UIPanel): void {
        this.panels.push(panel)
        this.panels.sort((a, b) => a.zOrder - b.zOrder)
    }

    get<T extends UIPanel>(name: string): T {
        const p = this.panels.find((p) => p.name === name)
        if (!p) throw new Error(`UIPanel "${name}" not registered`)
        return p as T
    }

    /** Are any panels currently visible (blocking game input)? */
    isAnyPanelOpen(): boolean {
        return this.panels.some((p) => p.visible && p.zOrder > 0)
    }

    /** Render all visible panels onto the offscreen canvas. */
    render(): OffscreenCanvas {
        this.ctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height)
        for (const panel of this.panels) {
            if (!panel.visible) continue
            this.ctx.save()
            this.ctx.translate(panel.bounds.x, panel.bounds.y)
            panel.render(this.ctx)
            this.ctx.restore()
        }
        return this.offscreen
    }

    handleMouseDown(x: number, y: number, button: 'l' | 'r'): boolean {
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible) continue
            if (panel.containsPoint(x, y)) {
                if (panel.onMouseDown(x - panel.bounds.x, y - panel.bounds.y, button)) {
                    return true
                }
            }
        }
        return false
    }

    handleMouseMove(x: number, y: number): void {
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible) continue
            if (panel.containsPoint(x, y)) {
                panel.onMouseMove(x - panel.bounds.x, y - panel.bounds.y)
                return
            }
        }
    }

    handleKeyDown(key: string): boolean {
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible) continue
            if (panel.onKeyDown(key)) return true
        }
        return false
    }
}
