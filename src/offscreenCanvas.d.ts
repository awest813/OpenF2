/**
 * Type declarations for OffscreenCanvas and related APIs.
 * TypeScript 4.x does not ship these in the dom lib; they ship in 4.7+.
 * We declare the minimal surface we use here.
 */

interface OffscreenCanvas extends EventTarget {
    width: number
    height: number
    getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): OffscreenCanvasRenderingContext2D | null
    getContext(contextId: 'webgl' | 'webgl2', options?: WebGLContextAttributes): WebGL2RenderingContext | null
    transferToImageBitmap(): ImageBitmap
}

declare var OffscreenCanvas: {
    prototype: OffscreenCanvas
    new(width: number, height: number): OffscreenCanvas
}

interface OffscreenCanvasRenderingContext2D extends CanvasCompositing, CanvasDrawImage, CanvasDrawPath, CanvasFillStrokeStyles, CanvasFilters, CanvasImageData, CanvasImageSmoothing, CanvasPath, CanvasPathDrawingStyles, CanvasRect, CanvasShadowStyles, CanvasState, CanvasText, CanvasTextDrawingStyles, CanvasTransform {
    readonly canvas: OffscreenCanvas
}
