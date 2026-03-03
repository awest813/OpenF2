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
 */

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
