/**
 * SpriteBatch — render-batch collector for minimising WebGL draw calls.
 *
 * The dominant per-frame GPU cost in tile-heavy maps is texture binding.
 * By collecting all draw commands for a frame and sorting them by
 * (layer, textureKey) before submission, each unique texture is bound
 * exactly once per layer instead of once per object, which on a typical
 * Fallout map (hundreds of floor tiles + objects) can halve the number of
 * WebGL draw calls issued.
 *
 * Usage:
 *   const batch = new SpriteBatch()
 *   batch.begin()
 *   batch.draw('tiles/floor01', 0, 0, 80, 36, 0, DrawLayer.Floor)
 *   batch.draw('critters/hmjmpsna', 120, 80, 64, 32, 3, DrawLayer.Object)
 *   batch.draw('tiles/floor01', 80, 0, 80, 36, 0, DrawLayer.Floor)  // same key → no extra bind
 *   const cmds = batch.end()   // sorted; 2 unique textures, 1 bind saved
 *   // … submit cmds to WebGLRenderer …
 *   console.log(batch.stats)   // { drawCount: 3, uniqueTextures: 2, bindsSaved: 1 }
 */

export const enum DrawLayer {
    Floor  = 0,
    Object = 1,
    Roof   = 2,
    UI     = 3,
}

export interface DrawCommand {
    textureKey: string
    x: number
    y: number
    width: number
    height: number
    /** FRM frame index (0-based). */
    frame: number
    /** Rendering layer — controls draw order and texture-sort scope. */
    layer: DrawLayer
}

export interface BatchStats {
    /** Total draw commands submitted this frame. */
    drawCount: number
    /** Number of unique textures referenced (= minimum texture-bind calls needed). */
    uniqueTextures: number
    /** Estimated texture-bind calls saved vs. unordered submission. */
    bindsSaved: number
    /**
     * Wall-clock time between the matching begin() and end() calls, in
     * milliseconds.  Measures frame-assembly cost on the CPU side.
     * 0 when no frame has been completed yet.
     */
    frameTimeMs: number
}

export class SpriteBatch {
    private _commands: DrawCommand[] = []
    private _open = false
    private _beginTime = 0
    private _lastStats: BatchStats = { drawCount: 0, uniqueTextures: 0, bindsSaved: 0, frameTimeMs: 0 }

    /** Open a new frame.  Must be called before draw(). */
    begin(): void {
        if (this._open) throw new Error('SpriteBatch.begin() called while batch is already open')
        this._commands = []
        this._beginTime = performance.now()
        this._open = true
    }

    /**
     * Queue a sprite draw command.
     *
     * @param textureKey  Canonical asset key (passed to WebGLRenderer.getTexture)
     * @param x           Screen X in pixels
     * @param y           Screen Y in pixels
     * @param width       Destination width in pixels
     * @param height      Destination height in pixels
     * @param frame       FRM frame index (default 0)
     * @param layer       Rendering layer (default DrawLayer.Object)
     */
    draw(
        textureKey: string,
        x: number,
        y: number,
        width: number,
        height: number,
        frame: number = 0,
        layer: DrawLayer = DrawLayer.Object,
    ): void {
        if (!this._open) throw new Error('SpriteBatch.draw() called outside begin/end block')
        this._commands.push({ textureKey, x, y, width, height, frame, layer })
    }

    /**
     * Close the batch and return the draw commands sorted for minimal
     * texture-bind cost.
     *
     * Sorting key: layer ASC, textureKey ASC.
     * This groups floor tiles together, objects together, and roof tiles
     * together, while minimising per-layer texture switches.
     */
    end(): DrawCommand[] {
        if (!this._open) throw new Error('SpriteBatch.end() called without a matching begin()')
        this._open = false

        // Sort by layer first, then by textureKey within each layer.
        this._commands.sort((a, b) => {
            if (a.layer !== b.layer) return a.layer - b.layer
            return a.textureKey < b.textureKey ? -1 : a.textureKey > b.textureKey ? 1 : 0
        })

        // Compute stats.
        const drawCount = this._commands.length
        const uniqueTextures = new Set(this._commands.map((c) => c.textureKey)).size
        const bindsSaved = Math.max(0, drawCount - uniqueTextures)
        const frameTimeMs = performance.now() - this._beginTime

        this._lastStats = { drawCount, uniqueTextures, bindsSaved, frameTimeMs }

        const result = this._commands
        this._commands = []
        return result
    }

    /** Statistics from the most recently completed batch (after end()). */
    get stats(): Readonly<BatchStats> {
        return this._lastStats
    }

    /** True if the batch is currently open (between begin() and end()). */
    get isOpen(): boolean {
        return this._open
    }
}
