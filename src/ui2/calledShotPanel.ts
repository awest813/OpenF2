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

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, cssColor, fillRect, strokeRect } from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 280
const PANEL_HEIGHT = 320
const ROW_H        = 28
const REGIONS_X    = 16
const REGIONS_Y    = 46
const REGION_W     = 200
const CHANCE_X_OFF = 170   // x offset within a row for the chance display
const BTN_W        = 60
const BTN_H        = 22

export const BODY_REGIONS = [
    'torso',
    'head',
    'eyes',
    'groin',
    'leftArm',
    'rightArm',
    'leftLeg',
    'rightLeg',
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

export class CalledShotPanel extends UIPanel {
    /** Hit chance (0–100) per body region; -1 means "—" (impossible). */
    hitChances: Record<BodyRegion, number> = {
        torso: -1, head: -1, eyes: -1, groin: -1,
        leftArm: -1, rightArm: -1, leftLeg: -1, rightLeg: -1,
    }
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
        for (const region of BODY_REGIONS) {
            this.hitChances[region] = chances[region] ?? -1
        }
        // Focus the first hittable region so keyboard nav works immediately.
        this._focusedIndex = BODY_REGIONS.findIndex(r => this.hitChances[r] >= 0)
        this._hoveredIndex = -1
        this.show()
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CALLED SHOT', width / 2, 20)
        ctx.textAlign = 'left'

        // Sub-header
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('TARGET REGION', REGIONS_X + 4, REGIONS_Y - 6)
        ctx.fillText('HIT%', REGIONS_X + CHANCE_X_OFF, REGIONS_Y - 6)

        // Body region rows
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const region = BODY_REGIONS[i]
            const ry = REGIONS_Y + i * ROW_H
            const chance = this.hitChances[region]
            const chanceText = chance < 0 ? '--' : `${chance}%`
            const chanceColor = chance < 0 ? FALLOUT_DARK_GRAY : chance < 25 ? FALLOUT_RED : FALLOUT_AMBER
            const isHighlighted = i === this._focusedIndex || i === this._hoveredIndex
            const isHittable = chance >= 0

            // Highlight row when hovered/focused (only if region is targetable)
            if (isHighlighted && isHittable) {
                fillRect(ctx, REGIONS_X, ry, REGION_W, ROW_H - 2, FALLOUT_DARK_GRAY)
            }
            strokeRect(ctx, REGIONS_X, ry, REGION_W, ROW_H - 2, FALLOUT_DARK_GRAY, 1)

            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(
                isHighlighted && isHittable ? FALLOUT_AMBER :
                    isHittable ? FALLOUT_GREEN : FALLOUT_DARK_GRAY,
            )
            // Number hint (1-8) for keyboard selection
            ctx.fillText(`${i + 1}. ${REGION_LABELS[region]}`, REGIONS_X + 6, ry + 17)

            ctx.fillStyle = cssColor(chanceColor)
            ctx.fillText(chanceText, REGIONS_X + CHANCE_X_OFF + 4, ry + 17)
        }

        // Cancel button
        const cancelX = width / 2 - BTN_W / 2
        const cancelY = height - 34
        fillRect(ctx, cancelX, cancelY, BTN_W, BTN_H, FALLOUT_DARK_GRAY)
        strokeRect(ctx, cancelX, cancelY, BTN_W, BTN_H, FALLOUT_GREEN, 1)
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CANCEL', width / 2, cancelY + 15)
        ctx.textAlign = 'left'
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Cancel button
        const cancelX = width / 2 - BTN_W / 2
        const cancelY = height - 34
        if (x >= cancelX && x < cancelX + BTN_W && y >= cancelY && y < cancelY + BTN_H) {
            this.hide()
            return true
        }

        // Region rows
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const ry = REGIONS_Y + i * ROW_H
            if (x >= REGIONS_X && x < REGIONS_X + REGION_W && y >= ry && y < ry + ROW_H - 2) {
                const region = BODY_REGIONS[i]
                if (this.hitChances[region] < 0) {return true} // ignore impossible regions
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
                return true
            }
        }

        return true
    }

    override onMouseMove(x: number, y: number): void {
        for (let i = 0; i < BODY_REGIONS.length; i++) {
            const ry = REGIONS_Y + i * ROW_H
            if (x >= REGIONS_X && x < REGIONS_X + REGION_W && y >= ry && y < ry + ROW_H - 2) {
                this._hoveredIndex = i
                return
            }
        }
        this._hoveredIndex = -1
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this.hide()
            return true
        }
        // Number keys 1–8 select a body region directly when targetable.
        const digit = parseInt(key)
        if (!isNaN(digit) && digit >= 1 && digit <= BODY_REGIONS.length) {
            const region = BODY_REGIONS[digit - 1]
            if (this.hitChances[region] >= 0) {
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
            }
            return true
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            const dir = key === 'ArrowDown' ? 1 : -1
            const hittable = BODY_REGIONS
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => this.hitChances[r] >= 0)
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
            if (this.hitChances[region] >= 0) {
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
            }
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)
