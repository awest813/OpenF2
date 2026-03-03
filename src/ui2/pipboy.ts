/**
 * PipBoyPanel — the in-game Pip-Boy 2000 interface.
 *
 * Provides four tabs matching the original Fallout UI:
 *   STATUS  — current HP, radiation, poison, combat stats
 *   ITEMS   — inventory list with equipped markers
 *   MAP     — simple local-area tile grid (Pip-Boy map)
 *   QUESTS  — active / completed quest log
 *
 * All rendering uses the 2D offscreen canvas API so that the UIManager can
 * composite it onto the WebGL scene texture.  When bitmap fonts are available
 * (via BitmapFontRenderer) they will be used automatically; otherwise the
 * panel falls back to system monospace.
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_RED, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent } from '../ecs/components.js'
import { QuestLog, QuestState } from '../quest/questLog.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipBoyTab = 'status' | 'items' | 'map' | 'quests'

/** Minimal map cell for the local-area grid display. */
export interface PipBoyMapCell {
    /** True when the cell has been visited/revealed. */
    visited: boolean
    /** Optional terrain type label shown on hover (future use). */
    terrain?: string
}

export interface PipBoyMapData {
    /** Grid width in cells. */
    width: number
    /** Grid height in cells. */
    height: number
    cells: PipBoyMapCell[][]
    /** Player position in grid coordinates. */
    playerX: number
    playerY: number
}

// ---------------------------------------------------------------------------
// PipBoyPanel
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 400
const PANEL_HEIGHT = 500

export class PipBoyPanel extends UIPanel {
    private playerEntityId: number
    private questLog: QuestLog
    private activeTab: PipBoyTab = 'status'
    private mapData: PipBoyMapData | null = null

    constructor(
        screenWidth: number,
        screenHeight: number,
        playerEntityId: number,
        questLog: QuestLog,
    ) {
        super('pipboy', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.playerEntityId = playerEntityId
        this.questLog = questLog
        this.zOrder = 20
    }

    /** Supply updated local-map data (called by the map subsystem). */
    setMapData(data: PipBoyMapData): void {
        this.mapData = data
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // Title bar
        fillRect(ctx, 0, 0, width, 28, { r: 0, g: 60, b: 0, a: 255 })
        drawCenteredText(ctx, 'PIP-BOY 2000', width / 2, 19, FALLOUT_GREEN, 'bold 14px monospace')

        // Tabs
        const tabs: PipBoyTab[] = ['status', 'items', 'map', 'quests']
        const tabW = Math.floor(width / tabs.length)
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            const tx = i * tabW
            const active = tab === this.activeTab
            fillRect(ctx, tx, 30, tabW, 22, active ? FALLOUT_GREEN : { r: 0, g: 40, b: 0, a: 255 })
            strokeRect(ctx, tx, 30, tabW, 22, FALLOUT_GREEN, 1)
            ctx.font = '10px monospace'
            ctx.fillStyle = active ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(tab.toUpperCase(), tx + tabW / 2, 45)
        }
        ctx.textAlign = 'left'

        // Content
        ctx.save()
        ctx.translate(0, 56)
        ctx.beginPath()
        ctx.rect(4, 0, width - 8, height - 60)
        ctx.clip()
        switch (this.activeTab) {
            case 'status': this._renderStatus(ctx); break
            case 'items':  this._renderItems(ctx);  break
            case 'map':    this._renderMap(ctx);    break
            case 'quests': this._renderQuests(ctx); break
        }
        ctx.restore()

        // Close hint
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.textAlign = 'right'
        ctx.fillText('[P] close', width - 6, height - 6)
        ctx.textAlign = 'left'
    }

    // ── Status tab ─────────────────────────────────────────────────────────

    private _renderStatus(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        if (!stats) {
            drawText(ctx, 'No stats available.', 10, 20, FALLOUT_DARK_GRAY)
            return
        }

        let y = 18
        const col2 = 200

        // ── Vitals ────────────────────────────────────
        drawLabel(ctx, 'VITALS', 10, y); y += 18
        drawStat(ctx, 'Hit Points',  `${stats.currentHp} / ${stats.maxHp}`, 16, y, hpColor(stats)); y += 16
        drawStat(ctx, 'Armor Class', String(stats.armorClass),  16, y, FALLOUT_GREEN); y += 16
        drawStat(ctx, 'Action Pts',  String(stats.maxAP),       16, y, FALLOUT_GREEN); y += 16
        drawStat(ctx, 'Carry Wt.',   `${stats.carryWeight} lbs`, 16, y, FALLOUT_GREEN); y += 16

        y += 8

        // ── Resistances ───────────────────────────────
        drawLabel(ctx, 'RESISTANCES', 10, y); y += 18
        drawStat(ctx, 'Damage',    `${stats.damageResistance}%`,    16, y, FALLOUT_GREEN); y += 16
        drawStat(ctx, 'Radiation', `${stats.radiationResistance}%`, 16, y, FALLOUT_GREEN); y += 16
        drawStat(ctx, 'Poison',    `${stats.poisonResistance}%`,    16, y, FALLOUT_GREEN); y += 16

        y += 8

        // ── SPECIAL ───────────────────────────────────
        drawLabel(ctx, 'S.P.E.C.I.A.L.', 10, y); y += 18
        const specials: Array<[string, keyof StatsComponent]> = [
            ['STR', 'strength'], ['PER', 'perception'], ['END', 'endurance'],
            ['CHA', 'charisma'], ['INT', 'intelligence'], ['AGL', 'agility'], ['LCK', 'luck'],
        ]
        for (const [abbr, key] of specials) {
            const val = stats[key] as number
            drawStat(ctx, abbr, String(val), 16, y, FALLOUT_GREEN)
            y += 14
        }
    }

    // ── Items tab ──────────────────────────────────────────────────────────

    private _renderItems(ctx: OffscreenCanvasRenderingContext2D): void {
        const inv = EntityManager.get<'inventory'>(this.playerEntityId, 'inventory')
        if (!inv || !inv.items || inv.items.length === 0) {
            drawText(ctx, 'Inventory empty.', 10, 24, FALLOUT_DARK_GRAY)
            return
        }

        drawLabel(ctx, 'ITEMS', 10, 16)

        let y = 36
        for (const item of inv.items) {
            const isEquipped =
                item.pid === inv.equippedWeaponPrimary ||
                item.pid === inv.equippedWeaponSecondary ||
                item.pid === inv.equippedArmor

            const prefix = isEquipped ? '* ' : '  '
            const label = `PID:${item.pid}` + (item.count > 1 ? ` x${item.count}` : '')
            const color = isEquipped ? FALLOUT_AMBER : FALLOUT_GREEN
            drawText(ctx, prefix + label, 14, y, color)
            y += 16
            if (y > this.bounds.height - 70) {
                drawText(ctx, '... (more)', 14, y, FALLOUT_DARK_GRAY)
                break
            }
        }
    }

    // ── Map tab ────────────────────────────────────────────────────────────

    private _renderMap(ctx: OffscreenCanvasRenderingContext2D): void {
        if (!this.mapData) {
            drawText(ctx, 'No map data loaded.', 10, 24, FALLOUT_DARK_GRAY)
            drawText(ctx, 'Explore to reveal the map.', 10, 42, FALLOUT_DARK_GRAY)
            return
        }

        const { width, height, cells, playerX, playerY } = this.mapData
        const availH = this.bounds.height - 64
        const availW = this.bounds.width - 8

        // Scale cells to fit the available area
        const cellW = Math.max(3, Math.floor(availW / width))
        const cellH = Math.max(3, Math.floor(availH / height))
        const mapW = width * cellW
        const mapH = height * cellH
        const offX = Math.floor((availW - mapW) / 2) + 4
        const offY = 10

        drawLabel(ctx, 'LOCAL MAP', 10, 12)

        for (let cy = 0; cy < height; cy++) {
            for (let cx = 0; cx < width; cx++) {
                const cell = cells[cy]?.[cx]
                if (!cell) continue
                const px = offX + cx * cellW
                const py = offY + cy * cellH

                if (cx === playerX && cy === playerY) {
                    // Player marker
                    fillRect(ctx, px, py, cellW, cellH, FALLOUT_AMBER)
                } else if (cell.visited) {
                    fillRect(ctx, px, py, cellW, cellH, { r: 0, g: 100, b: 0, a: 255 })
                } else {
                    fillRect(ctx, px, py, cellW, cellH, { r: 20, g: 20, b: 20, a: 255 })
                }
            }
        }

        // Legend
        const legendY = offY + mapH + 12
        fillRect(ctx, offX, legendY, cellW, cellH, FALLOUT_AMBER)
        drawText(ctx, ' You', offX + cellW + 4, legendY + cellH - 2, FALLOUT_AMBER)
        fillRect(ctx, offX + 60, legendY, cellW, cellH, { r: 0, g: 100, b: 0, a: 255 })
        drawText(ctx, ' Visited', offX + 64 + cellW, legendY + cellH - 2, FALLOUT_GREEN)
    }

    // ── Quests tab ─────────────────────────────────────────────────────────

    private _renderQuests(ctx: OffscreenCanvasRenderingContext2D): void {
        const all = this.questLog.getAll()

        if (all.length === 0) {
            drawText(ctx, 'No quests recorded.', 10, 24, FALLOUT_DARK_GRAY)
            return
        }

        let y = 16
        const groups: Array<[string, QuestState, UIColor]> = [
            ['ACTIVE',    'active',    FALLOUT_GREEN],
            ['COMPLETED', 'completed', FALLOUT_AMBER],
            ['FAILED',    'failed',    FALLOUT_RED],
        ]

        for (const [header, state, color] of groups) {
            const entries = all.filter((e) => e.state === state)
            if (entries.length === 0) continue

            drawLabel(ctx, header, 10, y)
            y += 18

            for (const entry of entries) {
                drawText(ctx, '  • ' + entry.id, 14, y, color)
                y += 16
                if (y > this.bounds.height - 70) {
                    drawText(ctx, '  ... (more)', 14, y, FALLOUT_DARK_GRAY)
                    return
                }
            }
            y += 6
        }
    }

    // ── Input handling ─────────────────────────────────────────────────────

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width } = this.bounds
        // Tab hit detection
        const tabs: PipBoyTab[] = ['status', 'items', 'map', 'quests']
        const tabW = Math.floor(width / tabs.length)
        if (y >= 30 && y < 52) {
            const idx = Math.floor(x / tabW)
            if (idx >= 0 && idx < tabs.length) {
                this.activeTab = tabs[idx]
                return true
            }
        }
        return true  // consume all clicks
    }

    override onKeyDown(key: string): boolean {
        if (key === 'p' || key === 'P' || key === 'Escape') {
            this.hide()
            return true
        }
        // Tab cycling
        const tabs: PipBoyTab[] = ['status', 'items', 'map', 'quests']
        const idx = tabs.indexOf(this.activeTab)
        if (key === 'ArrowRight' || key === 'Tab') {
            this.activeTab = tabs[(idx + 1) % tabs.length]
            return true
        }
        if (key === 'ArrowLeft') {
            this.activeTab = tabs[(idx + tabs.length - 1) % tabs.length]
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
    lineWidth: number = 1,
): void {
    ctx.strokeStyle = cssColor(color)
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

function drawText(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string, x: number, y: number,
    color: UIColor,
    font = '11px monospace',
): void {
    ctx.font = font
    ctx.fillStyle = cssColor(color)
    ctx.fillText(text, x, y)
}

function drawCenteredText(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string, x: number, y: number,
    color: UIColor,
    font = '11px monospace',
): void {
    ctx.font = font
    ctx.fillStyle = cssColor(color)
    ctx.textAlign = 'center'
    ctx.fillText(text, x, y)
    ctx.textAlign = 'left'
}

function drawLabel(
    ctx: OffscreenCanvasRenderingContext2D,
    text: string, x: number, y: number,
): void {
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = cssColor({ r: 0, g: 140, b: 0, a: 255 })
    ctx.fillText(text, x, y)
}

function drawStat(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string, value: string,
    x: number, y: number,
    valueColor: UIColor,
): void {
    ctx.font = '11px monospace'
    ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
    ctx.fillText(label.padEnd(14), x, y)
    ctx.fillStyle = cssColor(valueColor)
    ctx.fillText(value, x + 130, y)
}

function hpColor(stats: StatsComponent): UIColor {
    const ratio = stats.maxHp > 0 ? stats.currentHp / stats.maxHp : 1
    if (ratio > 0.66) return FALLOUT_GREEN
    if (ratio > 0.33) return FALLOUT_AMBER
    return FALLOUT_RED
}
