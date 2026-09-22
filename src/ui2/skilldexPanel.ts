/**
 * SkilldexPanel — UI2 Skilldex with all 8 Fallout 2 skills (Slice D / P0-3).
 */

import {
    UIPanel,
    FALLOUT_GREEN,
    FALLOUT_DARK_GRAY,
    FALLOUT_BLACK,
    fillRect,
    strokeRect,
    drawUIFontText,
} from './uiPanel.js'
import { SKILLDEX_ENTRIES } from '../skilldex.js'
import { Skills, skillRequiresTarget } from '../skills.js'
import { useSkilldexSkill } from '../skilldex.js'
import globalState from '../globalState.js'
import { UIMode } from '../uiMode.js'
import { EventBus } from '../eventBus.js'

const PANEL_W = 200
const PANEL_H = 340
const ROW_H = 28

export class SkilldexPanel extends UIPanel {
    private _hovered = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('skilldex', {
            x: screenWidth - PANEL_W - 8,
            y: screenHeight - PANEL_H - 110,
            width: PANEL_W,
            height: PANEL_H,
        })
        this.zOrder = 25
    }

    protected override onShow(): void {
        // Hover state must not survive a hide/show cycle.
        this._hovered = -1
    }

    private _activate(skill: Skills): void {
        this.hide()
        if (!skillRequiresTarget(skill)) {
            useSkilldexSkill(skill)
            return
        }
        globalState.uiMode = UIMode.useSkill
        globalState.skillMode = skill
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        drawUIFontText(ctx, 'SKILLDEX', width / 2, 22, FALLOUT_GREEN, 12, { bold: true, align: 'center' })

        for (let i = 0; i < SKILLDEX_ENTRIES.length; i++) {
            const entry = SKILLDEX_ENTRIES[i]
            const y = 40 + i * ROW_H
            const active = i === this._hovered
            fillRect(ctx, 12, y, width - 24, ROW_H - 4, active ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, 12, y, width - 24, ROW_H - 4, FALLOUT_GREEN, 1)
            drawUIFontText(ctx, `${i + 1}. ${entry.label.toUpperCase()}`, 24, y + 18, active ? FALLOUT_BLACK : FALLOUT_GREEN, 12)
        }

        drawUIFontText(ctx, '1–8 or click  ·  Esc to close', width / 2, height - 12, FALLOUT_DARK_GRAY, 10, { align: 'center' })
    }

    override onMouseMove(x: number, y: number): void {
        this._hovered = -1
        for (let i = 0; i < SKILLDEX_ENTRIES.length; i++) {
            const rowY = 40 + i * ROW_H
            if (y >= rowY && y < rowY + ROW_H - 4 && x >= 12 && x < this.bounds.width - 12) {
                this._hovered = i
                return
            }
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        for (let i = 0; i < SKILLDEX_ENTRIES.length; i++) {
            const rowY = 40 + i * ROW_H
            if (y >= rowY && y < rowY + ROW_H - 4 && x >= 12 && x < this.bounds.width - 12) {
                this._activate(SKILLDEX_ENTRIES[i].skill)
                return true
            }
        }
        return true
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this.hide()
            return true
        }
        // Number keys 1–8 activate skills directly (matching the drawn hints).
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= SKILLDEX_ENTRIES.length) {
            this._activate(SKILLDEX_ENTRIES[digit - 1].skill)
            return true
        }
        return true
    }
}

/** Open the Skilldex via EventBus (used by HUD / HTML button bridge). */
export function openSkilldexPanel(): void {
    EventBus.emit('ui:openPanel', { panelName: 'skilldex' })
}
