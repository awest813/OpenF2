/**
 * ActionMenuPanel — the engine's action menu (game_mouse.cc
 * gameMouseRenderActionMenuItems): a column of actions shown where the
 * mouse button was held down in ARROW mode. Dragging the mouse up or down
 * moves the highlight; releasing the button picks the highlighted action.
 * The game input code drives it (main.ts); the panel only draws.
 *
 * Panel name: 'actionMenu'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_BLACK, FALLOUT_AMBER, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
import { ACTION_MENU_LABELS, type ActionMenuItem } from '../mouseMode.js'

const ITEM_W = 96
const ITEM_H = 20

export class ActionMenuPanel extends UIPanel {
    items: ActionMenuItem[] = []
    highlighted = 0

    constructor(private readonly screenWidth: number, private readonly screenHeight: number) {
        super('actionMenu', { x: 0, y: 0, width: ITEM_W, height: ITEM_H })
        this.zOrder = 70
    }

    /** Show `items` next to (x, y), kept on screen. */
    openAt(items: ActionMenuItem[], x: number, y: number): void {
        this.items = items
        this.highlighted = 0
        const height = items.length * ITEM_H
        this.bounds.width = ITEM_W
        this.bounds.height = height
        this.bounds.x = Math.max(0, Math.min(this.screenWidth - ITEM_W, x + 8))
        this.bounds.y = Math.max(0, Math.min(this.screenHeight - height, y - ITEM_H / 2))
        this.show()
    }

    get selected(): ActionMenuItem | null {
        return this.items[this.highlighted] ?? null
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width } = this.bounds
        this.items.forEach((item, i) => {
            const y = i * ITEM_H
            const on = i === this.highlighted
            fillRect(ctx, 0, y, width, ITEM_H, FALLOUT_BLACK)
            strokeRect(ctx, 0, y, width, ITEM_H, on ? FALLOUT_AMBER : FALLOUT_GREEN, 1)
            drawUIFontText(ctx, ACTION_MENU_LABELS[item], width / 2, y + 14, on ? FALLOUT_AMBER : FALLOUT_GREEN, 10, { align: 'center' })
        })
    }

    /** The game drives the menu; clicks on it are swallowed. */
    override onMouseDown(): boolean {
        return true
    }
}
