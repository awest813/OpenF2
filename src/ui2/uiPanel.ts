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
import { EventBus } from '../eventBus.js'

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
    /** Atlas copies recolored per rgba key (see tintedAtlas). */
    private readonly tintedAtlases = new Map<string, OffscreenCanvas>()

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

    /** Pixel height of the wrapped font (0 when falling back). */
    get fontHeight(): number {
        return this.font?.height ?? 0
    }

    /** Width in pixels of a single character, or 0 if the char is unknown. */
    charWidth(ch: string): number {
        if (!this.font) {return 8}  // monospace fallback
        const code = ch.charCodeAt(0)
        const sym = this.font.symbols[code]
        return sym ? sym.width + (this.font.spacing ?? 1) : 0
    }

    /** Total pixel width of a string. */
    measureText(text: string): number {
        if (!this.font) {return text.length * 8}
        let w = 0
        for (const ch of text) {w += this.charWidth(ch)}
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
        // Tint the atlas up-front and blit plain glyphs: tinting against the
        // destination with 'source-atop' would paint solid rectangles over
        // any opaque panel background.
        const atlas = this.tintedAtlas(color)
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

            // Cast needed because our custom OffscreenCanvas declaration
            // does not extend the DOM's CanvasImageSource union type.
            ctx.drawImage(
                atlas as unknown as CanvasImageSource,
                srcX, 0, sym.width, font.height,
                cx, y, sym.width, font.height,
            )
            cx += sym.width + (font.spacing ?? 1)
        }
    }

    /**
     * The glyph atlas recolored to `color`. The white mask lives on a
     * transparent canvas, so 'source-atop' here keeps only the glyph pixels
     * (unlike tinting against an opaque panel background). Cached per color
     * — panels reuse a handful of palette colors every frame.
     */
    private tintedAtlas(color: UIColor): OffscreenCanvas {
        const key = `${color.r},${color.g},${color.b},${color.a}`
        const cached = this.tintedAtlases.get(key)
        if (cached) {return cached}

        const canvas = new OffscreenCanvas(this.atlasWidth, this.font!.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(this.glyphCanvas as unknown as CanvasImageSource, 0, 0)
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a / 255})`
        ctx.fillRect(0, 0, this.atlasWidth, this.font!.height)
        ctx.globalCompositeOperation = 'source-over'

        // Bound the cache; recoloring on the fly is cheap beyond this point.
        if (this.tintedAtlases.size >= 32) {
            const first = this.tintedAtlases.keys().next().value
            this.tintedAtlases.delete(first!)
        }
        this.tintedAtlases.set(key, canvas)
        return canvas
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

// ---------------------------------------------------------------------------
// UIFontSet — multi-size bitmap-font picker
// ---------------------------------------------------------------------------

/**
 * Picks the loaded bitmap font whose glyph height best matches a requested
 * pixel size, so panels can keep talking in "9px label / 12px title" terms
 * while the actual glyphs come from the fixed-size Fallout .FON fonts.
 *
 * The engine loads fonts 0, 1, 2, 3 and 5, each at a fixed pixel height.
 * Panels request a size; `forSize` returns the renderer of the nearest
 * font (ties resolve downward). Bold is approximated by double-striking
 * in `drawUIFontText` — the original fonts have no bold variant.
 */
export class UIFontSet {
    private readonly fonts: Font[]
    private readonly renderers = new Map<Font, BitmapFontRenderer>()

    constructor(fonts: Font[]) {
        this.fonts = (fonts ?? []).filter((f) => f && f.height > 0)
    }

    get isEmpty(): boolean {
        return this.fonts.length === 0
    }

    /**
     * The loaded font whose glyph height is closest to the requested size,
     * or null when no fonts are loaded. Ties resolve to the smaller font
     * (tighter pixel look). Selection only — building the glyph atlas is
     * deferred to rendererFor().
     */
    forSize(px: number): Font | null {
        if (this.fonts.length === 0) {return null}
        let best = this.fonts[0]
        for (const font of this.fonts) {
            const dBest = Math.abs(best.height - px)
            const dFont = Math.abs(font.height - px)
            if (dFont < dBest || (dFont === dBest && font.height < best.height)) {
                best = font
            }
        }
        return best
    }

    /** Glyph renderer for a font from this set, built on first use. */
    rendererFor(font: Font): BitmapFontRenderer {
        let renderer = this.renderers.get(font)
        if (!renderer) {
            renderer = new BitmapFontRenderer(font)
            this.renderers.set(font, renderer)
        }
        return renderer
    }
}

/**
 * The font set panels draw with. Set once by main.ts after the .FON files
 * load; null (e.g. in unit tests) makes every helper fall back to the
 * system monospace path.
 */
let activeUIFont: UIFontSet | null = null

export function setActiveUIFont(set: UIFontSet | null): void {
    activeUIFont = set
}

export function getActiveUIFont(): UIFontSet | null {
    return activeUIFont
}

export interface UIFontTextOptions {
    /** Horizontal alignment relative to x (default left). */
    align?: 'left' | 'center' | 'right'
    /** Faux-bold via a 1px double strike (bitmap fonts have no bold face). */
    bold?: boolean
}

/**
 * Draw `text` with the bitmap font nearest to `px`, falling back to the
 * system monospace font when no font set is active.
 *
 * `y` is the BASELINE-style anchor panels already use with ctx.fillText;
 * bitmap glyphs are drawn top-anchored, so the glyph top is derived from
 * the font height to land the text on roughly the same baseline.
 */
export function drawUIFontText(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: UIColor,
    px: number,
    opts: UIFontTextOptions = {},
): void {
    const font = activeUIFont?.forSize(px) ?? null
    const align = opts.align ?? 'left'

    if (!activeUIFont || !font) {
        ctx.font = `${opts.bold ? 'bold ' : ''}${px}px monospace`
        ctx.fillStyle = cssColor(color)
        ctx.textAlign = align
        ctx.fillText(text, x, y)
        ctx.textAlign = 'left'
        return
    }

    // The Fallout bitmap fonts have no U+2026 glyph; render '…' as '..' so
    // truncated labels don't silently lose their indicator.
    const bitmapText = text.replace(/\u2026/g, '..')
    const renderer = activeUIFont.rendererFor(font)
    const width = renderer.measureText(bitmapText)
    let dx = x
    if (align === 'center') {dx = x - width / 2}
    else if (align === 'right') {dx = x - width}

    const top = y - renderer.fontHeight + Math.max(1, Math.round(renderer.fontHeight * 0.15))
    renderer.drawText(ctx, bitmapText, dx, top, color)
    if (opts.bold) {
        renderer.drawText(ctx, bitmapText, dx + 1, top, color)
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

export const FALLOUT_GREEN: UIColor      = { r: 0,   g: 195, b: 0,   a: 255 }
export const FALLOUT_DARK_GREEN: UIColor = { r: 0,   g: 100, b: 0,   a: 255 }
export const FALLOUT_AMBER: UIColor      = { r: 255, g: 165, b: 0,   a: 255 }
export const FALLOUT_RED: UIColor        = { r: 195, g: 0,   b: 0,   a: 255 }
export const FALLOUT_BLACK: UIColor      = { r: 0,   g: 0,   b: 0,   a: 255 }
export const FALLOUT_DARK_GRAY: UIColor  = { r: 40,  g: 40,  b: 40,  a: 255 }
/** Dim fill for hovered (but not selected) list rows. */
export const FALLOUT_HOVER: UIColor      = { r: 20,  g: 20,  b: 20,  a: 255 }

// ---------------------------------------------------------------------------
// Key-name normalization
// ---------------------------------------------------------------------------

/**
 * Map engine key names (produced by heart._getKeyChar) to the DOM-style
 * names that panels compare against in onKeyDown. The engine's own hotkeys
 * (Config.controls) keep the heart names, so the translation happens once
 * here at the UIManager dispatch boundary.
 */
const KEY_NAME_MAP: Record<string, string> = {
    escape: 'Escape',
    return: 'Enter',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    '\t': 'Tab',
    '\b': 'Backspace',
}

export function normalizeKey(key: string): string {
    return KEY_NAME_MAP[key] ?? key
}

// ---------------------------------------------------------------------------
// Shared drawing helpers
// ---------------------------------------------------------------------------

/** Convert a UIColor to a CSS rgba() string. */
export function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}

/** Fill a rectangle in the given UI color. */
export function fillRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
): void {
    ctx.fillStyle = cssColor(color)
    ctx.fillRect(x, y, w, h)
}

/**
 * Stroke a rectangle in the given UI color. Coordinates are nudged by 0.5px
 * so the 1-pixel border renders crisp on the integer pixel grid.
 */
export function strokeRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
    lineWidth = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

/**
 * Word-wrap `text` into lines that each fit within `maxWidth` pixels.
 *
 * Explicit `\n` line breaks (and `\r\n`) are honoured first; each resulting
 * paragraph is then word-wrapped using `ctx.measureText` for accurate glyph
 * widths. Empty paragraphs (from `\n\n`) produce visual blank lines.
 */
export function wrapText(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
    const result: string[] = []
    for (const paragraph of paragraphs) {
        const words = paragraph.split(' ')
        let line = ''
        for (const word of words) {
            const test = line ? line + ' ' + word : word
            if (ctx.measureText(test).width > maxWidth && line) {
                result.push(line)
                line = word
            } else {
                line = test
            }
        }
        result.push(line)
    }
    return result
}

/**
 * Truncate `text` with an ellipsis so it fits within `maxWidth` pixels,
 * measured with the context's current font. Single-line labels only.
 */
export function fitText(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string {
    if (ctx.measureText(text).width <= maxWidth) {return text}
    const ellipsis = '…'
    let truncated = text
    while (truncated.length > 1 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
        truncated = truncated.slice(0, -1)
    }
    return truncated + ellipsis
}

/**
 * Clamp a list scroll offset so the focused row stays visible. Used by
 * panels with keyboard-navigated scrollable lists (world map, inventory,
 * loot, save/load).
 */
export function clampListOffset(
    selectedIndex: number,
    currentOffset: number,
    visibleRows: number,
): number {
    if (selectedIndex < currentOffset) {return selectedIndex}
    if (selectedIndex >= currentOffset + visibleRows) {return selectedIndex - visibleRows + 1}
    return currentOffset
}

export abstract class UIPanel {
    readonly name: string
    bounds: Rect
    visible = false
    /** Z-order: higher values render on top. */
    zOrder = 0
    /**
     * Passive overlays (debug inspectors) set this so the UIManager skips
     * them for input dispatch and modal-blocking checks — they observe the
     * game without stealing clicks or keys from it.
     */
    inputTransparent = false
    /**
     * When this panel hides, re-open the named panel (used by main-menu
     * Options / Load / Credits so the menu returns after the modal closes).
     */
    returnPanel: string | null = null

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
        const ret = this.returnPanel
        this.returnPanel = null
        this.onHide()
        if (ret) {
            EventBus.emit('ui:openPanel', { panelName: ret })
        }
    }

    toggle(): void {
        if (this.visible) {this.hide()}
        else {this.show()}
    }

    /** Override to react when panel becomes visible. */
    protected onShow(): void {
        // no-op by default
    }
    /** Override to react when panel becomes hidden. */
    protected onHide(): void {
        // no-op by default
    }

    /**
     * Called each render frame when visible.
     * Implementations draw into the 2D offscreen canvas `ctx`.
     * The UIManager composites all panel canvases onto the WebGL texture.
     */
    abstract render(ctx: OffscreenCanvasRenderingContext2D): void

    onMouseDown(_x: number, _y: number, _button: 'l' | 'r'): boolean {
        return false  // return true to consume the event
    }

    onMouseMove(_x: number, _y: number): void {
        // no-op by default
    }

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
    private _busOpenHandler: ((e: { panelName: string; returnTo?: string; openAs?: string }) => void) | null = null
    private _busCloseHandler: ((e: { panelName: string }) => void) | null = null
    private lastHoveredPanel: UIPanel | null = null
    /** Optional bitmap font renderer for pixel-accurate Fallout fonts. */
    fontRenderer: BitmapFontRenderer | null = null

    constructor(width: number, height: number) {
        this.offscreen = new OffscreenCanvas(width, height)
        const ctx = this.offscreen.getContext('2d')
        if (!ctx) {throw new Error('UIManager: could not get 2D context')}
        this.ctx = ctx
    }

    register(panel: UIPanel): void {
        this.panels.push(panel)
        this.panels.sort((a, b) => a.zOrder - b.zOrder)
    }

    get<T extends UIPanel>(name: string): T {
        const p = this.panels.find((p) => p.name === name)
        if (!p) {throw new Error(`UIPanel "${name}" not registered`)}
        return p as T
    }

    /** Like get() but returns null for an unregistered name. */
    tryGet<T extends UIPanel>(name: string): T | null {
        const p = this.panels.find((p) => p.name === name)
        return (p as T) ?? null
    }

    /** Are any input-blocking panels currently visible? */
    isAnyPanelOpen(): boolean {
        return this.panels.some((p) => p.visible && p.zOrder > 0 && !p.inputTransparent)
    }

    /** Render all visible panels onto the offscreen canvas. */
    render(): OffscreenCanvas {
        this.ctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height)
        for (const panel of this.panels) {
            if (!panel.visible) {continue}
            this.ctx.save()
            this.ctx.translate(panel.bounds.x, panel.bounds.y)
            panel.render(this.ctx)
            this.ctx.restore()
        }
        return this.offscreen
    }

    /**
     * Render a debug preview of the bitmap font atlas onto the overlay canvas.
     * Call from the render loop when Config.ui.showFonts is enabled.
     */
    renderFontDebug(): void {
        if (!this.fontRenderer) {return}
        const sample = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
        this.fontRenderer.drawText(this.ctx, sample, 4, 4, FALLOUT_GREEN)
    }

    handleMouseDown(x: number, y: number, button: 'l' | 'r'): boolean {
        const overlayOpen = this.isAnyPanelOpen()
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible || panel.inputTransparent) {continue}
            // Modal overlays (z > 0) own input; don't leak clicks to the HUD.
            if (overlayOpen && panel.zOrder <= 0) {continue}
            if (panel.containsPoint(x, y)) {
                if (panel.onMouseDown(x - panel.bounds.x, y - panel.bounds.y, button)) {
                    return true
                }
            }
        }
        return overlayOpen
    }

    handleMouseMove(x: number, y: number): void {
        const overlayOpen = this.isAnyPanelOpen()
        let foundPanel: UIPanel | null = null
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible || panel.inputTransparent) {continue}
            if (overlayOpen && panel.zOrder <= 0) {continue}
            if (panel.containsPoint(x, y)) {
                foundPanel = panel
                break
            }
        }

        if (this.lastHoveredPanel && this.lastHoveredPanel !== foundPanel) {
            this.lastHoveredPanel.onMouseMove(-1, -1)
        }
        this.lastHoveredPanel = foundPanel

        if (foundPanel) {
            foundPanel.onMouseMove(x - foundPanel.bounds.x, y - foundPanel.bounds.y)
        }
    }

    handleKeyDown(key: string): boolean {
        // Translate engine key names ('up', 'escape', …) to the DOM-style
        // names ('ArrowUp', 'Escape', …) that panels compare against.
        key = normalizeKey(key)
        const overlayOpen = this.isAnyPanelOpen()
        for (let i = this.panels.length - 1; i >= 0; i--) {
            const panel = this.panels[i]
            if (!panel.visible || panel.inputTransparent) {continue}
            if (overlayOpen && panel.zOrder <= 0) {continue}
            if (panel.onKeyDown(key)) {return true}
        }
        return overlayOpen
    }

    /**
     * Wire this UIManager to the engine EventBus so that `ui:openPanel` and
     * `ui:closePanel` events automatically show/hide registered panels by name.
     *
     * Call once after all panels have been registered. Calling again is safe —
     * existing handlers are removed before new ones are registered to prevent
     * duplicate subscriptions.
     */
    connectEventBus(): void {
        if (this._busOpenHandler) {
            EventBus.off('ui:openPanel', this._busOpenHandler)
            EventBus.off('ui:closePanel', this._busCloseHandler!)
        }
        this._busOpenHandler = ({ panelName, returnTo, openAs }) => {
            const panel = this.panels.find((p) => p.name === panelName)
            if (!panel) {return}
            panel.returnPanel = returnTo ?? null
            const opener = (panel as UIPanel & { openAs?: (mode: string) => void }).openAs
            if (openAs && typeof opener === 'function') {
                opener.call(panel, openAs)
            } else {
                panel.show()
            }
        }
        this._busCloseHandler = ({ panelName }) => {
            const panel = this.panels.find((p) => p.name === panelName)
            panel?.hide()
        }
        EventBus.on('ui:openPanel', this._busOpenHandler)
        EventBus.on('ui:closePanel', this._busCloseHandler)
    }
}
