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

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_RED, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor, cssColor, fillRect, strokeRect } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent } from '../ecs/components.js'
import { QuestLog, QuestState } from '../quest/questLog.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import {
    readPlayerRadiationLevel,
    readPlayerPoisonLevel,
    radiationBand,
} from '../character/radiationPoison.js'
import { getActiveEffects, getAddictions } from '../character/timedEffects.js'
import { restForHours, canRest, type TimeAdvanceResult } from '../character/rest.js'
import { getHolodisks, markHolodiskRead } from '../character/holodisks.js'
import { openCompanionTrade } from '../partyTrade.js'
import { Critter } from '../object.js'
import { buildPipBoyMapData, markPlayerExplored } from '../character/automap.js'
import globalState from '../globalState.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipBoyTab = 'status' | 'items' | 'map' | 'quests' | 'rest' | 'data'

const PIPBOY_TABS: PipBoyTab[] = ['status', 'items', 'map', 'quests', 'rest', 'data']
const PIPBOY_TAB_LABEL: Record<PipBoyTab, string> = {
    status: 'STAT',
    items: 'INV',
    map: 'MAP',
    quests: 'QST',
    rest: 'REST',
    data: 'DATA',
}

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
/** Right-side x offset for the scroll-position hint text. */
const SCROLL_HINT_X_OFFSET = 110

export class PipBoyPanel extends UIPanel {
    private playerEntityId: number
    private questLog: QuestLog
    private activeTab: PipBoyTab = 'status'
    private mapData: PipBoyMapData | null = null
    /** Scroll offset (in rows) for the ITEMS tab. */
    private _itemScrollOffset = 0
    /** Scroll offset (in rows) for the QUESTS tab. */
    private _questScrollOffset = 0
    /** Last rest outcome message for the REST tab. */
    private _restMessage = ''
    /** Selected holodisk id on the DATA tab. */
    private _selectedHolodiskId: string | null = null
    /** Hit regions for REST duration buttons (content-local coords). */
    private _restButtons: Array<{ x: number; y: number; w: number; h: number; hours: number }> = []
    /** Hit regions for holodisk list rows. */
    private _holodiskRows: Array<{ y: number; h: number; id: string }> = []
    /** Hit regions for party trade rows on the DATA tab. */
    private _partyTradeRows: Array<{ y: number; h: number; member: Critter }> = []

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
        const tabs = PIPBOY_TABS
        const tabW = Math.floor(width / tabs.length)
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            const tx = i * tabW
            const active = tab === this.activeTab
            fillRect(ctx, tx, 30, tabW, 22, active ? FALLOUT_GREEN : { r: 0, g: 40, b: 0, a: 255 })
            strokeRect(ctx, tx, 30, tabW, 22, FALLOUT_GREEN, 1)
            ctx.font = '9px monospace'
            ctx.fillStyle = active ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(PIPBOY_TAB_LABEL[tab], tx + tabW / 2, 45)
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
            case 'rest':   this._renderRest(ctx);   break
            case 'data':   this._renderData(ctx);   break
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
        // Keep Pip-Boy vitals aligned with the live Critter (P0-2 / Slice B).
        syncPlayerEntityFromCritter()
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

        // ── Exposure (Critter levels — P1-4) ──────────
        const radLevel = readPlayerRadiationLevel()
        const poisonLevel = readPlayerPoisonLevel()
        drawLabel(ctx, 'EXPOSURE', 10, y); y += 18
        const radColor = radLevel >= 300 ? FALLOUT_RED : radLevel >= 150 ? FALLOUT_AMBER : FALLOUT_GREEN
        drawStat(ctx, 'Rad Level', `${radLevel} (${radiationBand(radLevel)})`, 16, y, radColor); y += 16
        const poiColor = poisonLevel > 0 ? FALLOUT_AMBER : FALLOUT_GREEN
        drawStat(ctx, 'Poison Level', String(poisonLevel), 16, y, poiColor); y += 16

        const player = globalState.player as object | null
        if (player) {
            const effects = getActiveEffects(player)
            const addicts = getAddictions(player)
            if (effects.length > 0 || addicts.length > 0) {
                y += 8
                drawLabel(ctx, 'CHEMS', 10, y); y += 18
                if (effects.length > 0) {
                    drawStat(ctx, 'Active', effects.map((e) => e.drugId).join(', '), 16, y, FALLOUT_GREEN)
                    y += 16
                }
                if (addicts.length > 0) {
                    const labels = addicts.map((a) => a.withdrawing ? `${a.drugId} (wd)` : a.drugId)
                    drawStat(ctx, 'Addiction', labels.join(', '), 16, y, FALLOUT_AMBER)
                    y += 16
                }
            }
        }

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

        const visibleRows = Math.floor((this.bounds.height - 76) / 16)
        const maxScroll = Math.max(0, inv.items.length - visibleRows)
        this._itemScrollOffset = Math.min(this._itemScrollOffset, maxScroll)

        drawLabel(ctx, 'ITEMS', 10, 16)

        let y = 36
        for (let i = this._itemScrollOffset; i < inv.items.length; i++) {
            const item = inv.items[i]
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
                if (i < inv.items.length - 1) {
                    drawText(ctx, '... (more)', 14, y, FALLOUT_DARK_GRAY)
                }
                break
            }
        }

        // Scroll hint
        if (maxScroll > 0) {
            this._renderScrollHint(ctx, this._itemScrollOffset, maxScroll)
        }
    }

    // ── Map tab ────────────────────────────────────────────────────────────

    private _renderMap(ctx: OffscreenCanvasRenderingContext2D): void {
        // Refresh from live automap each paint so exploration stays current.
        markPlayerExplored(1)
        const live = buildPipBoyMapData(40)
        if (live) this.mapData = live

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
                if (!cell) {continue}
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

        // Flatten all quest rows for scroll calculation
        const groups: Array<[string, QuestState, UIColor]> = [
            ['ACTIVE',    'active',    FALLOUT_GREEN],
            ['COMPLETED', 'completed', FALLOUT_AMBER],
            ['FAILED',    'failed',    FALLOUT_RED],
        ]

        // Build flat list of renderable rows (header + entries per group)
        type QuestRow = { kind: 'header'; label: string } | { kind: 'entry'; text: string; color: UIColor }
        const rows: QuestRow[] = []
        for (const [header, state, color] of groups) {
            const entries = all.filter((e) => e.state === state)
            if (entries.length === 0) {continue}
            rows.push({ kind: 'header', label: header })
            for (const entry of entries) {
                rows.push({ kind: 'entry', text: '  • ' + entry.id, color })
            }
        }

        const rowH = 16
        const visibleRows = Math.floor((this.bounds.height - 76) / rowH)
        const maxScroll = Math.max(0, rows.length - visibleRows)
        this._questScrollOffset = Math.min(this._questScrollOffset, maxScroll)

        let y = 16
        for (let i = this._questScrollOffset; i < rows.length; i++) {
            const row = rows[i]
            if (row.kind === 'header') {
                drawLabel(ctx, row.label, 10, y)
            } else {
                drawText(ctx, row.text, 14, y, row.color)
            }
            y += rowH
            if (y > this.bounds.height - 70) {
                if (i < rows.length - 1) {
                    drawText(ctx, '  ... (more)', 14, y, FALLOUT_DARK_GRAY)
                }
                break
            }
        }

        // Scroll hint
        if (maxScroll > 0) {
            this._renderScrollHint(ctx, this._questScrollOffset, maxScroll)
        }
    }

    // ── Rest tab (alarm clock) ─────────────────────────────────────────────

    private _renderRest(ctx: OffscreenCanvasRenderingContext2D): void {
        this._restButtons = []
        let y = 18
        drawLabel(ctx, 'ALARM CLOCK', 10, y); y += 18
        drawText(ctx, 'Rest to advance game time and heal.', 16, y, FALLOUT_DARK_GRAY); y += 20

        if (!canRest()) {
            drawText(ctx, globalState.inCombat ? 'Cannot rest during combat.' : 'No player.', 16, y, FALLOUT_RED)
            y += 20
        }

        const durations = [1, 3, 6, 12, 24]
        const btnW = 56
        const btnH = 22
        let x = 16
        for (const hours of durations) {
            this._restButtons.push({ x, y, w: btnW, h: btnH, hours })
            fillRect(ctx, x, y, btnW, btnH, { r: 0, g: 50, b: 0, a: 255 })
            strokeRect(ctx, x, y, btnW, btnH, FALLOUT_GREEN, 1)
            drawCenteredText(ctx, `${hours}h`, x + btnW / 2, y + 15, FALLOUT_GREEN, '11px monospace')
            x += btnW + 8
        }
        y += btnH + 16

        if (this._restMessage) {
            drawText(ctx, this._restMessage, 16, y, FALLOUT_AMBER)
        }
    }

    // ── Data / holodisk archives ───────────────────────────────────────────

    private _renderData(ctx: OffscreenCanvasRenderingContext2D): void {
        this._holodiskRows = []
        this._partyTradeRows = []
        let y = 18

        // Party trade (P1-3)
        drawLabel(ctx, 'PARTY', 10, y); y += 18
        const members = globalState.gParty?.getPartyMembers?.() ?? []
        if (members.length === 0) {
            drawText(ctx, 'No companions.', 16, y, FALLOUT_DARK_GRAY); y += 16
        } else {
            for (const member of members) {
                if ((member as Critter).dead) continue
                const rowH = 16
                this._partyTradeRows.push({ y, h: rowH, member: member as Critter })
                const waiting = globalState.gParty.getControl?.(member as Critter)?.waiting
                const label = `${member.name || 'Companion'}${waiting ? ' (waiting)' : ''} — trade`
                drawText(ctx, label, 16, y + 12, FALLOUT_GREEN)
                y += rowH
            }
        }

        y += 12
        drawLabel(ctx, 'ARCHIVES', 10, y); y += 18
        const disks = getHolodisks()
        if (disks.length === 0) {
            drawText(ctx, 'No holodisks in archive.', 16, y, FALLOUT_DARK_GRAY)
            return
        }

        for (const disk of disks) {
            const rowH = 16
            this._holodiskRows.push({ y, h: rowH, id: disk.id })
            const selected = disk.id === this._selectedHolodiskId
            const color = selected ? FALLOUT_AMBER : disk.read ? FALLOUT_GREEN : FALLOUT_AMBER
            drawText(ctx, `${disk.read ? ' ' : '*'} ${disk.title}`, 16, y + 12, color)
            y += rowH
        }

        y += 12
        const selected = disks.find((d) => d.id === this._selectedHolodiskId) ?? disks[0]
        if (selected) {
            drawLabel(ctx, selected.title.toUpperCase(), 10, y); y += 18
            const lines = selected.body.split('\n')
            for (const line of lines) {
                drawText(ctx, line, 16, y, FALLOUT_GREEN, '10px monospace')
                y += 14
                if (y > this.bounds.height - 80) break
            }
        }
    }

    private _doRest(hours: number): void {
        const result: TimeAdvanceResult = restForHours(hours)
        if (result.refusedReason === 'combat') {
            this._restMessage = 'Cannot rest during combat.'
            return
        }
        if (result.refusedReason) {
            this._restMessage = 'Rest failed.'
            return
        }
        this._restMessage = `Rested ${hours}h. Healed ${result.hpHealed} HP.` +
            (result.eventsFired ? ` (${result.eventsFired} timed events)` : '')
    }

    // ── Input handling ─────────────────────────────────────────────────────

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width } = this.bounds
        // Tab hit detection
        const tabs = PIPBOY_TABS
        const tabW = Math.floor(width / tabs.length)
        if (y >= 30 && y < 52) {
            const idx = Math.floor(x / tabW)
            if (idx >= 0 && idx < tabs.length) {
                this._switchTab(tabs[idx])
                return true
            }
        }

        // Content is translated by +56 in render
        const contentY = y - 56
        if (this.activeTab === 'rest' && contentY >= 0) {
            for (const btn of this._restButtons) {
                if (x >= btn.x && x < btn.x + btn.w && contentY >= btn.y && contentY < btn.y + btn.h) {
                    this._doRest(btn.hours)
                    return true
                }
            }
        }
        if (this.activeTab === 'data' && contentY >= 0) {
            for (const row of this._partyTradeRows) {
                if (contentY >= row.y && contentY < row.y + row.h) {
                    this.hide()
                    openCompanionTrade(row.member)
                    return true
                }
            }
            for (const row of this._holodiskRows) {
                if (contentY >= row.y && contentY < row.y + row.h) {
                    this._selectedHolodiskId = row.id
                    markHolodiskRead(row.id)
                    return true
                }
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
        const tabs = PIPBOY_TABS
        const idx = tabs.indexOf(this.activeTab)
        if (key === 'ArrowRight' || key === 'Tab') {
            this._switchTab(tabs[(idx + 1) % tabs.length])
            return true
        }
        if (key === 'ArrowLeft') {
            this._switchTab(tabs[(idx + tabs.length - 1) % tabs.length])
            return true
        }
        // Scroll within current tab
        if (key === 'ArrowDown') {
            if (this.activeTab === 'items') {this._itemScrollOffset++}
            else if (this.activeTab === 'quests') {this._questScrollOffset++}
            return true
        }
        if (key === 'ArrowUp') {
            if (this.activeTab === 'items') {this._itemScrollOffset = Math.max(0, this._itemScrollOffset - 1)}
            else if (this.activeTab === 'quests') {this._questScrollOffset = Math.max(0, this._questScrollOffset - 1)}
            return true
        }
        // Rest shortcuts 1/3/6
        if (this.activeTab === 'rest') {
            if (key === '1') { this._doRest(1); return true }
            if (key === '3') { this._doRest(3); return true }
            if (key === '6') { this._doRest(6); return true }
        }
        return false
    }

    private _switchTab(tab: PipBoyTab): void {
        this.activeTab = tab
        // Reset scroll when switching tabs for a clean view
        this._itemScrollOffset = 0
        this._questScrollOffset = 0
    }

    private _renderScrollHint(
        ctx: OffscreenCanvasRenderingContext2D,
        offset: number,
        maxScroll: number,
    ): void {
        drawText(
            ctx,
            `↑↓ scroll (${offset + 1}/${maxScroll + 1})`,
            this.bounds.width - SCROLL_HINT_X_OFFSET,
            16,
            FALLOUT_DARK_GRAY,
            '9px monospace',
        )
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

// (cssColor / fillRect / strokeRect now live in uiPanel.ts)

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
    if (ratio > 0.66) {return FALLOUT_GREEN}
    if (ratio > 0.33) {return FALLOUT_AMBER}
    return FALLOUT_RED
}
