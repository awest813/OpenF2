/**
 * CreditsPanel — engine credits / quit thank-you screen (P0-1).
 *
 * Opened from the main-menu CREDITS item, or after QUIT when the browser
 * cannot close the tab.  Panel name: 'credits'.
 */

import {
    UIPanel,
    FALLOUT_GREEN,
    FALLOUT_AMBER,
    FALLOUT_DARK_GRAY,
    FALLOUT_BLACK,
    fillRect,
    strokeRect,
    wrapText,
    drawUIFontText,
} from './uiPanel.js'

const PANEL_W = 480
const PANEL_H = 360
const CLOSE_BTN_W = 80
const CLOSE_BTN_H = 24

const CREDITS_BODY =
    'OPENF2\n' +
    'Open-source Fallout 2 engine reimplementation\n' +
    '\n' +
    'Based on the DarkFO engine by darkf\n' +
    'and the OpenF2 contributors.\n' +
    '\n' +
    'Fallout 2 is a trademark of Bethesda Softworks.\n' +
    'This project is not affiliated with Bethesda,\n' +
    'Interplay, or Microsoft.\n' +
    '\n' +
    'Use your own legally obtained Fallout 2 data.\n' +
    '\n' +
    'Apache License 2.0'

const QUIT_FOOTER = 'Thanks for playing. Refresh the page to return.'

export class CreditsPanel extends UIPanel {
    /** When true, show the quit thank-you footer instead of a credits-only close. */
    quitMode = false
    private _openedViaOpenAs = false
    private _hoveredClose = false

    constructor(screenWidth: number, screenHeight: number) {
        super('credits', {
            x: Math.floor((screenWidth - PANEL_W) / 2),
            y: Math.floor((screenHeight - PANEL_H) / 2),
            width: PANEL_W,
            height: PANEL_H,
        })
        this.zOrder = 45
    }

    openAs(mode: 'credits' | 'quit' = 'credits'): void {
        this._openedViaOpenAs = true
        this.quitMode = mode === 'quit'
        this.show()
    }

    protected override onShow(): void {
        if (this._openedViaOpenAs) {
            this._openedViaOpenAs = false
            return
        }
        this.quitMode = false
    }

    private _closeRect(): { x: number; y: number; w: number; h: number } {
        const { width, height } = this.bounds
        return {
            x: Math.floor((width - CLOSE_BTN_W) / 2),
            y: height - 40,
            w: CLOSE_BTN_W,
            h: CLOSE_BTN_H,
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        drawUIFontText(ctx, this.quitMode ? 'QUIT' : 'CREDITS', width / 2, 28, FALLOUT_GREEN, 16, { bold: true, align: 'center' })

        // Font stays set for wrapText's ctx.measureText below.
        ctx.font = '11px monospace'
        const lines = wrapText(ctx, CREDITS_BODY, width - 40)
        let y = 56
        for (const line of lines) {
            drawUIFontText(ctx, line, width / 2, y, FALLOUT_AMBER, 11, { align: 'center' })
            y += 16
        }

        if (this.quitMode) {
            drawUIFontText(ctx, QUIT_FOOTER, width / 2, height - 58, FALLOUT_GREEN, 11, { align: 'center' })
        }

        const close = this._closeRect()
        fillRect(ctx, close.x, close.y, close.w, close.h, this._hoveredClose ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
        strokeRect(ctx, close.x, close.y, close.w, close.h, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, this.quitMode ? 'OK' : 'CLOSE', width / 2, close.y + 16, this._hoveredClose ? FALLOUT_BLACK : FALLOUT_GREEN, 11, { align: 'center' })
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const close = this._closeRect()
        if (x >= close.x && x < close.x + close.w && y >= close.y && y < close.y + close.h) {
            this.hide()
            return true
        }
        return true
    }

    override onMouseMove(x: number, y: number): void {
        const close = this._closeRect()
        this._hoveredClose = (
            x >= close.x && x < close.x + close.w &&
            y >= close.y && y < close.y + close.h
        )
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape' || key === 'Enter' || key === ' ') {
            this.hide()
            return true
        }
        return true
    }
}
