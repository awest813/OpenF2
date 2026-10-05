/**
 * CalledShotPanel — WebGL-rendered called shot targeting interface.
 *
 * Replaces the legacy DOM-based uiCalledShot / uiCloseCalledShot with a ui2
 * panel rendered entirely via the OffscreenCanvas pipeline.
 *
 * Displays the eight targetable body regions (torso, head, eyes, groin,
 * left arm, right arm, left leg, right leg) with their associated hit-chance
 * percentages.  Clicking a region fires EventBus event
 * 'calledShot:regionSelected' with the region name so that the combat system
 * can apply the targeted attack.
 *
 * Panel name: 'calledShot'
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 280
const PANEL_HEIGHT = 220
const ROW_H        = 28
const REGIONS_Y    = 46
const COLUMN_X     = [16, 144]
const REGION_W     = 120
const ROWS         = 4
const BTN_W        = 60
const BTN_H        = 22

/**
 * Body regions in the order of the engine's called-shot window
 * (combat.cc _hit_loc_left / _hit_loc_right): the left column lists the
 * target's head, eyes, right arm and right leg; the right column its torso,
 * groin, left arm and left leg.
 */
export const BODY_REGIONS = [
    'head',
    'eyes',
    'rightArm',
    'rightLeg',
    'torso',
    'groin',
    'leftArm',
    'leftLeg',
] as const

export type BodyRegion = typeof BODY_REGIONS[number]

const REGION_LABELS: Record<BodyRegion, string> = {
    torso:    'Torso',
    head:     'Head',
    eyes:     'Eyes',
    groin:    'Groin',
    leftArm:  'Left Arm',
    rightArm: 'Right Arm',
    leftLeg:  'Left Leg',
    rightLeg: 'Right Leg',
}

// ---------------------------------------------------------------------------
// CalledShotPanel
// ---------------------------------------------------------------------------

/** Cell of region `i`: column 0/1, row 0..3. */
function cellRect(i: number): { x: number; y: number; w: number; h: number } {
    const col = Math.floor(i / ROWS)
    const row = i % ROWS
    return { x: COLUMN_X[col], y: REGIONS_Y + row * ROW_H, w: REGION_W, h: ROW_H - 2 }
}

/** combat.cc _print_tohit: two digits, or "--" for a negative chance. */
export function formatCalledShotChance(chance: number): string {
    if (chance < 0) {return '--'}
    return String(Math.min(99, Math.trunc(chance))).padStart(2, '0')
}

export class CalledShotPanel extends UIPanel {
    /**
     * Hit chance per body region (may be negative — shown as "--" but still
     * selectable, like the engine); -1 for regions not supplied to openWith.
     */
    hitChances: Record<BodyRegion, number> = {
        torso: -1, head: -1, eyes: -1, groin: -1,
        leftArm: -1, rightArm: -1, leftLeg: -1, rightLeg: -1,
    }
    /** Regions supplied by openWith (selectable). */
    private _available = new Set<BodyRegion>()
    /** Index of the currently keyboard-focused region (-1 = none). */
    private _focusedIndex = -1
    /** Index of the currently hovered region (-1 = none). */
    private _hoveredIndex = -1

    constructor(screenWidth: number, screenHeight: number) {
        super('calledShot', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 35
    }

    /** Set hit chances and show the panel. */
    openWith(chances: Partial<Record<BodyRegion, number>>): void {
        this._available.clear()
        for (const region of BODY_REGIONS) {
            const chance = chances[region]
            this.hitChances[region] = chance ?? -1
            if (typeof chance === 'number' && Number.isFinite(chance)) {this._available.add(region)}
        }
        // Focus the first selectable region so keyboard nav works immediately.
        this._focusedIndex = BODY_REGIONS.findIndex(r => this._available.has(r))
        this._hoveredIndex = -1
        this._openedViaOpenWith = true
        this.show()
    }

    /** True when show() was triggered by openWith (skip the reset in onShow). */
    private _openedViaOpenWith = false

    protected override onShow(): void {
        if (this._openedViaOpenWith) {
            this._openedViaOpenWith = false
            return
        }
        // A plain show() (EventBus ui:openPanel) must not display the
        // previous target's hit chances.
        for (const region of BODY_REGIONS) {
            this.hitChances[region] = -1
        }
        this._available.clear()
        this._focusedIndex = -1
        this._hoveredIndex = -1
    }

    private isSelectable(region: BodyRegion): boolean {
        return this._available.has(region)
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        drawUIFontText(ctx, 'CALLED SHOT', width / 2, 20, FALLOUT_GREEN, 12, { align: 'center', bold: true })

        // Body regions, laid out like the engine window (two columns of four)
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const region = BODY_REGIONS[i]
            const cell = cellRect(i)
            const chance = this.hitChances[region]
            const selectable = this.isSelectable(region)
            const isHighlighted = i === this._focusedIndex || i === this._hoveredIndex

            if (isHighlighted && selectable) {
                fillRect(ctx, cell.x, cell.y, cell.w, cell.h, FALLOUT_DARK_GRAY)
            }
            strokeRect(ctx, cell.x, cell.y, cell.w, cell.h, FALLOUT_DARK_GRAY, 1)

            const labelColor = isHighlighted && selectable ? FALLOUT_AMBER : selectable ? FALLOUT_GREEN : FALLOUT_DARK_GRAY
            drawUIFontText(ctx, `${i + 1}. ${REGION_LABELS[region]}`, cell.x + 6, cell.y + 17, labelColor, 11)
            const chanceText = selectable ? formatCalledShotChance(chance) : '--'
            const chanceColor = !selectable ? FALLOUT_DARK_GRAY : chance < 25 ? FALLOUT_RED : FALLOUT_AMBER
            drawUIFontText(ctx, chanceText, cell.x + cell.w - 6, cell.y + 17, chanceColor, 11, { align: 'right' })
        }

        // Cancel button
        const cancelX = width / 2 - BTN_W / 2
        const cancelY = height - 34
        fillRect(ctx, cancelX, cancelY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, cancelX, cancelY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'CANCEL', width / 2, cancelY + 15, FALLOUT_GREEN, 11, { align: 'center' })
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Cancel button
        const cancelX = width / 2 - BTN_W / 2
        const cancelY = height - 34
        if (x >= cancelX && x < cancelX + BTN_W && y >= cancelY && y < cancelY + BTN_H) {
            this._cancel()
            return true
        }

        // Region cells
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const c = cellRect(i)
            if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
                const region = BODY_REGIONS[i]
                if (!this.isSelectable(region)) {return true}
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
                return true
            }
        }

        return true
    }

    override onMouseMove(x: number, y: number): void {
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const c = cellRect(i)
            if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
                this._hoveredIndex = i
                return
            }
        }
        this._hoveredIndex = -1
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this._cancel()
            return true
        }
        // Number keys 1–8 select a body region directly when targetable.
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= BODY_REGIONS.length) {
            const region = BODY_REGIONS[digit - 1]
            if (this.isSelectable(region)) {
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
            }
            return true
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            const dir = key === 'ArrowDown' ? 1 : -1
            const hittable = BODY_REGIONS
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => this.isSelectable(r))
            if (hittable.length === 0) {return true}
            const currentPos = hittable.findIndex(({ i }) => i === this._focusedIndex)
            const nextPos = currentPos < 0
                ? (dir > 0 ? 0 : hittable.length - 1)
                : (currentPos + dir + hittable.length) % hittable.length
            this._focusedIndex = hittable[nextPos].i
            return true
        }
        if (key === 'Enter' && this._focusedIndex >= 0 && this._focusedIndex < BODY_REGIONS.length) {
            const region = BODY_REGIONS[this._focusedIndex]
            if (this.isSelectable(region)) {
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
            }
            return true
        }
        return false
    }

    /** Close without a selection, notifying callers (unlike a silent hide). */
    private _cancel(): void {
        EventBus.emit('calledShot:cancelled', {})
        this.hide()
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)
