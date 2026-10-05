/**
 * MessageBoxPanel — the engine's one-button message box (window.cc
 * showDialogBox with no buttons requested): a framed box with the message
 * and a DONE button. Clicking DONE or pressing Enter / Escape closes it.
 *
 * Open it with the 'ui:messageBox' event. Panel name: 'messageBox'.
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_BLACK, FALLOUT_AMBER, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
import { EventBus } from '../eventBus.js'
import { getMessage } from '../util.js'

const BOX_W = 280
const BOX_H = 140
const BUTTON_W = 80
const BUTTON_H = 22

/** Wrap `text` into lines of at most `max` characters. */
export function wrapMessageBoxText(text: string, max = 36): string[] {
    const lines: string[] = []
    for (const paragraph of String(text ?? '').split('\n')) {
        let line = ''
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && line.length + 1 + word.length > max) {
                lines.push(line)
                line = word
            } else {
                line = line ? line + ' ' + word : word
            }
        }
        lines.push(line)
    }
    return lines
}

export class MessageBoxPanel extends UIPanel {
    private _lines: string[] = []

    constructor(screenWidth: number, screenHeight: number) {
        super('messageBox', {
            x: Math.floor((screenWidth - BOX_W) / 2),
            y: Math.floor((screenHeight - BOX_H) / 2),
            width: BOX_W,
            height: BOX_H,
        })
        this.zOrder = 60
        EventBus.on('ui:messageBox', ({ text }) => this.openWith(text))
    }

    openWith(text: string): void {
        this._lines = wrapMessageBoxText(text)
        this.show()
    }

    get lines(): readonly string[] {
        return this._lines
    }

    private _doneLabel(): string {
        try {
            return getMessage('dbox', 100) || 'DONE'
        } catch {
            return 'DONE'
        }
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)
        let y = 30
        for (const line of this._lines) {
            drawUIFontText(ctx, line, width / 2, y, FALLOUT_AMBER, 11, { align: 'center' })
            y += 15
        }
        const bx = Math.floor((width - BUTTON_W) / 2)
        const by = height - BUTTON_H - 12
        strokeRect(ctx, bx, by, BUTTON_W, BUTTON_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, this._doneLabel(), width / 2, by + 15, FALLOUT_GREEN, 11, { align: 'center' })
    }

    override onMouseDown(x: number, y: number): boolean {
        const { width, height } = this.bounds
        const bx = Math.floor((width - BUTTON_W) / 2)
        const by = height - BUTTON_H - 12
        if (x >= bx && x < bx + BUTTON_W && y >= by && y < by + BUTTON_H) {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            this.hide()
        }
        return true
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Enter' || key === 'Escape') {
            this.hide()
        }
        return true
    }
}
