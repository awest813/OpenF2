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

import { UIPanel, FALLOUT_GREEN, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_AMBER, FALLOUT_RED, UIColor } from './uiPanel.js'
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

            strokeRect(ctx, REGIONS_X, ry, REGION_W, ROW_H - 2, FALLOUT_DARK_GRAY, 1)

            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(REGION_LABELS[region], REGIONS_X + 6, ry + 17)

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
                EventBus.emit('calledShot:regionSelected', { region })
                this.hide()
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
        return false
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}

function fillRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
): void {
    ctx.fillStyle = cssColor(color)
    ctx.fillRect(x, y, w, h)
}

function strokeRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    color: UIColor,
    lineWidth = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}
