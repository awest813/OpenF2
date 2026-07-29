/**
 * MainMenuPanel — New Game / Load / Options entry point (Slice C / P0-1).
 *
 * Shown on cold boot when no `?mapName` query is present. Dev shortcuts that
 * pass a map in the URL still skip straight into gameplay.
 */

import {
    UIPanel,
    FALLOUT_GREEN,
    FALLOUT_AMBER,
    FALLOUT_DARK_GRAY,
    FALLOUT_BLACK,
    cssColor,
    fillRect,
    strokeRect,
} from './uiPanel.js'
import { EventBus } from '../eventBus.js'

const PANEL_W = 360
const PANEL_H = 280
const BTN_W = 220
const BTN_H = 32
const BTN_GAP = 14

const MENU_ITEMS: Array<{ id: 'new' | 'load' | 'options'; label: string }> = [
    { id: 'new', label: 'NEW GAME' },
    { id: 'load', label: 'LOAD GAME' },
    { id: 'options', label: 'OPTIONS' },
]

export class MainMenuPanel extends UIPanel {
    private _focused = 0
    private _hovered = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('mainMenu', {
            x: Math.floor((screenWidth - PANEL_W) / 2),
            y: Math.floor((screenHeight - PANEL_H) / 2),
            width: PANEL_W,
            height: PANEL_H,
        })
        this.zOrder = 40
    }

    protected override onShow(): void {
        this._focused = 0
        this._hovered = -1
    }

    private _buttonRect(i: number): { x: number; y: number; w: number; h: number } {
        const { width } = this.bounds
        const startY = 100
        return {
            x: Math.floor((width - BTN_W) / 2),
            y: startY + i * (BTN_H + BTN_GAP),
            w: BTN_W,
            h: BTN_H,
        }
    }

    private _activate(id: 'new' | 'load' | 'options'): void {
        if (id === 'new') {
            this.hide()
            EventBus.emit('game:newGameRequested', {})
            return
        }
        if (id === 'load') {
            EventBus.emit('ui:openPanel', { panelName: 'saveLoad' })
            return
        }
        EventBus.emit('ui:openPanel', { panelName: 'options' })
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        ctx.textAlign = 'center'
        ctx.font = 'bold 22px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('OPENF2', width / 2, 42)

        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText('Fallout 2 engine reimplementation', width / 2, 68)

        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const item = MENU_ITEMS[i]
            const r = this._buttonRect(i)
            const active = i === this._focused || i === this._hovered
            fillRect(ctx, r.x, r.y, r.w, r.h, active ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, r.x, r.y, r.w, r.h, FALLOUT_GREEN, 1)
            ctx.font = 'bold 13px monospace'
            ctx.fillStyle = active ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.fillText(item.label, width / 2, r.y + 21)
        }

        ctx.font = '10px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('↑↓ / Enter  ·  click to select', width / 2, height - 18)
        ctx.textAlign = 'left'
    }

    override onMouseMove(x: number, y: number): void {
        this._hovered = -1
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const r = this._buttonRect(i)
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                this._hovered = i
                this._focused = i
                return
            }
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const r = this._buttonRect(i)
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                this._activate(MENU_ITEMS[i].id)
                return true
            }
        }
        return true // capture clicks while menu is open
    }

    override onKeyDown(key: string): boolean {
        const k = key.toLowerCase()
        if (k === 'arrowdown' || k === 's') {
            this._focused = (this._focused + 1) % MENU_ITEMS.length
            return true
        }
        if (k === 'arrowup' || k === 'w') {
            this._focused = (this._focused + MENU_ITEMS.length - 1) % MENU_ITEMS.length
            return true
        }
        if (k === 'enter' || k === ' ') {
            this._activate(MENU_ITEMS[this._focused].id)
            return true
        }
        return true
    }
}
