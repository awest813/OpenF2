/**
 * OptionsPanel — FO2-style preferences (Game / Display / Sound).
 *
 * Opened from the main-menu OPTIONS item or the HUD OPT button (panel name
 * 'options').  Edits go through `src/settings.ts` so Config, globalState,
 * audio, and script INI reads stay in sync and persist across sessions.
 */

import {
    UIPanel,
    FALLOUT_GREEN,
    FALLOUT_AMBER,
    FALLOUT_DARK_GRAY,
    FALLOUT_DARK_GREEN,
    FALLOUT_BLACK,
    fillRect,
    strokeRect,
    drawUIFontText,
} from './uiPanel.js'
import {
    COMBAT_DIFFICULTY_LABELS,
    GAME_DIFFICULTY_LABELS,
    TARGET_HIGHLIGHT_LABELS,
    VIOLENCE_LABELS,
    getSettings,
    patchSettings,
    type CombatDifficulty,
    type GameDifficulty,
    type GameSettings,
    type TargetHighlight,
    type ViolenceLevel,
} from '../settings.js'

export type OptionsTab = 'game' | 'display' | 'sound'

const PANEL_WIDTH = 480
const PANEL_HEIGHT = 420

const TAB_W = 110
const TAB_H = 24
const TAB_Y = 36
const TABS: OptionsTab[] = ['game', 'display', 'sound']

const ROW_H = 26
const START_Y = 78
const VALUE_W = 118
const VALUE_H = 20
const VALUE_X_OFFSET = 16

const CLOSE_BTN_W = 80
const CLOSE_BTN_H = 24

const VOLUME_STEPS = 10

interface CycleRow {
    kind: 'cycle'
    label: string
    getLabel: (s: GameSettings) => string
    next: (s: GameSettings) => Partial<GameSettings>
    prev: (s: GameSettings) => Partial<GameSettings>
}

interface ToggleRow {
    kind: 'toggle'
    label: string
    get: (s: GameSettings) => boolean
    key: keyof GameSettings
}

interface VolumeRow {
    kind: 'volume'
    label: string
    get: (s: GameSettings) => number
    key: 'musicVolume' | 'sfxVolume' | 'speechVolume'
}

type PrefRow = CycleRow | ToggleRow | VolumeRow

function cycleLevel(current: number, max: number, dir: 1 | -1): number {
    return (current + dir + (max + 1)) % (max + 1)
}

function volumeLabel(vol: number): string {
    return `${Math.round(Math.max(0, Math.min(1, vol)) * VOLUME_STEPS)}/${VOLUME_STEPS}`
}

const GAME_ROWS: PrefRow[] = [
    {
        kind: 'cycle',
        label: 'Game Difficulty',
        getLabel: (s) => GAME_DIFFICULTY_LABELS[s.gameDifficulty],
        next: (s) => ({ gameDifficulty: cycleLevel(s.gameDifficulty, 2, 1) as GameDifficulty }),
        prev: (s) => ({ gameDifficulty: cycleLevel(s.gameDifficulty, 2, -1) as GameDifficulty }),
    },
    {
        kind: 'cycle',
        label: 'Combat Difficulty',
        getLabel: (s) => COMBAT_DIFFICULTY_LABELS[s.combatDifficulty],
        next: (s) => ({ combatDifficulty: cycleLevel(s.combatDifficulty, 2, 1) as CombatDifficulty }),
        prev: (s) => ({ combatDifficulty: cycleLevel(s.combatDifficulty, 2, -1) as CombatDifficulty }),
    },
    {
        kind: 'cycle',
        label: 'Violence Level',
        getLabel: (s) => VIOLENCE_LABELS[s.violenceLevel],
        next: (s) => ({ violenceLevel: cycleLevel(s.violenceLevel, 2, 1) as ViolenceLevel }),
        prev: (s) => ({ violenceLevel: cycleLevel(s.violenceLevel, 2, -1) as ViolenceLevel }),
    },
    { kind: 'toggle', label: 'Always Run', key: 'alwaysRun', get: (s) => s.alwaysRun },
    { kind: 'toggle', label: 'Combat Taunts', key: 'combatTaunts', get: (s) => s.combatTaunts },
    { kind: 'toggle', label: 'Combat Messages', key: 'combatMessages', get: (s) => s.combatMessages },
    { kind: 'toggle', label: 'Combat Looks', key: 'combatLooks', get: (s) => s.combatLooks },
    { kind: 'toggle', label: 'Subtitles', key: 'subtitles', get: (s) => s.subtitles },
    { kind: 'toggle', label: 'Language Filter', key: 'languageFilter', get: (s) => s.languageFilter },
]

const DISPLAY_ROWS: PrefRow[] = [
    { kind: 'toggle', label: 'Show Hex Grid', key: 'showHexOverlay', get: (s) => s.showHexOverlay },
    { kind: 'toggle', label: 'Show Objects', key: 'showObjects', get: (s) => s.showObjects },
    { kind: 'toggle', label: 'Show Roof', key: 'showRoof', get: (s) => s.showRoof },
    { kind: 'toggle', label: 'Show Floor', key: 'showFloor', get: (s) => s.showFloor },
    { kind: 'toggle', label: 'Show Walls', key: 'showWalls', get: (s) => s.showWalls },
    { kind: 'toggle', label: 'Show Coordinates', key: 'showCoordinates', get: (s) => s.showCoordinates },
    { kind: 'toggle', label: 'Scale to Fit', key: 'scaleToFit', get: (s) => s.scaleToFit },
    { kind: 'toggle', label: 'Item Highlight', key: 'itemHighlight', get: (s) => s.itemHighlight },
    {
        kind: 'cycle',
        label: 'Target Highlight',
        getLabel: (s) => TARGET_HIGHLIGHT_LABELS[s.targetHighlight],
        next: (s) => ({ targetHighlight: cycleLevel(s.targetHighlight, 2, 1) as TargetHighlight }),
        prev: (s) => ({ targetHighlight: cycleLevel(s.targetHighlight, 2, -1) as TargetHighlight }),
    },
]

const SOUND_ROWS: PrefRow[] = [
    { kind: 'toggle', label: 'Audio', key: 'audioEnabled', get: (s) => s.audioEnabled },
    { kind: 'volume', label: 'Music Volume', key: 'musicVolume', get: (s) => s.musicVolume },
    { kind: 'volume', label: 'SFX Volume', key: 'sfxVolume', get: (s) => s.sfxVolume },
    { kind: 'volume', label: 'Speech Volume', key: 'speechVolume', get: (s) => s.speechVolume },
]

function rowsFor(tab: OptionsTab): PrefRow[] {
    if (tab === 'display') {return DISPLAY_ROWS}
    if (tab === 'sound') {return SOUND_ROWS}
    return GAME_ROWS
}

function nudgeVolume(vol: number, dir: 1 | -1): number {
    const step = 1 / VOLUME_STEPS
    return Math.max(0, Math.min(1, Math.round((vol + dir * step) * VOLUME_STEPS) / VOLUME_STEPS))
}

export class OptionsPanel extends UIPanel {
    private _tab: OptionsTab = 'game'
    /** Index of the keyboard-focused row (-1 = none). */
    private _focusedIndex = 0
    /** Index of the currently hovered row (-1 = none). */
    private _hoveredIndex = -1
    private _hoveredTab: OptionsTab | null = null
    private _hoveredDone = false

    constructor(screenWidth: number, screenHeight: number) {
        super('options', {
            x: Math.floor((screenWidth - PANEL_WIDTH) / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 15
    }

    get activeTab(): OptionsTab {
        return this._tab
    }

    protected override onShow(): void {
        this._focusedIndex = 0
        this._hoveredIndex = -1
        this._hoveredTab = null
        this._hoveredDone = false
    }

    private _tabRect(i: number): { x: number; y: number; w: number; h: number } {
        const { width } = this.bounds
        const total = TABS.length * TAB_W + (TABS.length - 1) * 8
        const startX = Math.floor((width - total) / 2)
        return { x: startX + i * (TAB_W + 8), y: TAB_Y, w: TAB_W, h: TAB_H }
    }

    private _valueRect(rowIndex: number): { x: number; y: number; w: number; h: number } {
        const { width } = this.bounds
        const y = START_Y + rowIndex * ROW_H
        return {
            x: width - VALUE_X_OFFSET - VALUE_W,
            y: y + 2,
            w: VALUE_W,
            h: VALUE_H,
        }
    }

    private _doneRect(): { x: number; y: number; w: number; h: number } {
        const { width, height } = this.bounds
        return {
            x: Math.floor((width - CLOSE_BTN_W) / 2),
            y: height - 40,
            w: CLOSE_BTN_W,
            h: CLOSE_BTN_H,
        }
    }

    private _activateRow(row: PrefRow, dir: 1 | -1): void {
        const s = getSettings()
        if (row.kind === 'cycle') {
            patchSettings(dir >= 0 ? row.next(s) : row.prev(s))
            return
        }
        if (row.kind === 'toggle') {
            patchSettings({ [row.key]: !row.get(s) } as Partial<GameSettings>)
            return
        }
        patchSettings({ [row.key]: nudgeVolume(row.get(s), dir) } as Partial<GameSettings>)
    }

    private _setTab(tab: OptionsTab): void {
        this._tab = tab
        this._focusedIndex = 0
        this._hoveredIndex = -1
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        const settings = getSettings()
        const rows = rowsFor(this._tab)

        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        drawUIFontText(ctx, 'OPTIONS', width / 2, 22, FALLOUT_GREEN, 14, { bold: true, align: 'center' })

        for (let i = 0; i < TABS.length; i++) {
            const tab = TABS[i]
            const r = this._tabRect(i)
            const isActive = tab === this._tab
            const isHovered = tab === this._hoveredTab
            // Active tab: solid green. Hover on an inactive tab: dim green —
            // visually distinct from the selected tab.
            const bg = isActive ? FALLOUT_GREEN : isHovered ? FALLOUT_DARK_GREEN : FALLOUT_DARK_GRAY
            fillRect(ctx, r.x, r.y, r.w, r.h, bg)
            strokeRect(ctx, r.x, r.y, r.w, r.h, FALLOUT_GREEN, 1)
            drawUIFontText(ctx, tab.toUpperCase(), r.x + r.w / 2, r.y + 16, isActive ? FALLOUT_BLACK : FALLOUT_GREEN, 11, { bold: true, align: 'center' })
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const y = START_Y + i * ROW_H
            const vr = this._valueRect(i)
            const isFocused = i === this._focusedIndex || i === this._hoveredIndex

            if (isFocused) {
                fillRect(ctx, 8, y, width - 16, ROW_H, FALLOUT_DARK_GRAY)
            }

            drawUIFontText(ctx, row.label, 16, y + 18, isFocused ? FALLOUT_AMBER : FALLOUT_GREEN, 11)

            fillRect(ctx, vr.x, vr.y, vr.w, vr.h, FALLOUT_DARK_GRAY)
            strokeRect(ctx, vr.x, vr.y, vr.w, vr.h, FALLOUT_GREEN, 1)
            if (row.kind === 'toggle') {
                drawUIFontText(ctx, row.get(settings) ? 'ON' : 'OFF', vr.x + vr.w / 2, vr.y + 14, FALLOUT_GREEN, 10, { align: 'center' })
            } else if (row.kind === 'cycle') {
                drawUIFontText(ctx, row.getLabel(settings), vr.x + vr.w / 2, vr.y + 14, FALLOUT_GREEN, 10, { align: 'center' })
            } else {
                drawUIFontText(ctx, volumeLabel(row.get(settings)), vr.x + vr.w / 2, vr.y + 14, FALLOUT_GREEN, 10, { align: 'center' })
            }
        }

        const done = this._doneRect()
        fillRect(ctx, done.x, done.y, done.w, done.h, this._hoveredDone ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
        strokeRect(ctx, done.x, done.y, done.w, done.h, FALLOUT_GREEN, 1)
        drawUIFontText(ctx, 'DONE', width / 2, done.y + 16, this._hoveredDone ? FALLOUT_BLACK : FALLOUT_GREEN, 11, { align: 'center' })

        drawUIFontText(ctx, 'Tab/Q/E tabs  ·  ↑↓/WS select  ·  ←→ change  ·  Esc close', width / 2, height - 8, FALLOUT_DARK_GRAY, 9, { align: 'center' })
    }

    override onMouseMove(x: number, y: number): void {
        this._hoveredTab = null
        this._hoveredIndex = -1
        this._hoveredDone = false

        for (let i = 0; i < TABS.length; i++) {
            const r = this._tabRect(i)
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                this._hoveredTab = TABS[i]
                return
            }
        }

        const done = this._doneRect()
        if (x >= done.x && x < done.x + done.w && y >= done.y && y < done.y + done.h) {
            this._hoveredDone = true
            return
        }

        const rows = rowsFor(this._tab)
        const { width } = this.bounds
        for (let i = 0; i < rows.length; i++) {
            const y0 = START_Y + i * ROW_H
            if (y >= y0 && y < y0 + ROW_H && x >= 8 && x < width - 8) {
                this._hoveredIndex = i
                this._focusedIndex = i
                return
            }
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        for (let i = 0; i < TABS.length; i++) {
            const r = this._tabRect(i)
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                this._setTab(TABS[i])
                return true
            }
        }

        const done = this._doneRect()
        if (x >= done.x && x < done.x + done.w && y >= done.y && y < done.y + done.h) {
            this.hide()
            return true
        }

        const rows = rowsFor(this._tab)
        const { width } = this.bounds
        for (let i = 0; i < rows.length; i++) {
            const y0 = START_Y + i * ROW_H
            if (y >= y0 && y < y0 + ROW_H && x >= 8 && x < width - 8) {
                this._focusedIndex = i
                const vr = this._valueRect(i)
                const dir: 1 | -1 = x < vr.x + vr.w / 2 ? -1 : 1
                this._activateRow(rows[i], dir)
                return true
            }
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        const k = key.length === 1 ? key.toLowerCase() : key
        if (k === 'Escape') {
            this.hide()
            return true
        }
        if (k === 'Tab' || k === 'e') {
            const idx = (TABS.indexOf(this._tab) + 1) % TABS.length
            this._setTab(TABS[idx])
            return true
        }
        if (k === 'q') {
            const idx = (TABS.indexOf(this._tab) + TABS.length - 1) % TABS.length
            this._setTab(TABS[idx])
            return true
        }
        const rows = rowsFor(this._tab)
        if (k === 'ArrowDown' || k === 's') {
            this._focusedIndex = Math.min(this._focusedIndex + 1, rows.length - 1)
            return true
        }
        if (k === 'ArrowUp' || k === 'w') {
            this._focusedIndex = Math.max(this._focusedIndex - 1, 0)
            return true
        }
        if (this._focusedIndex < 0 || this._focusedIndex >= rows.length) {return false}
        const row = rows[this._focusedIndex]
        if (k === 'ArrowRight') {
            this._activateRow(row, 1)
            return true
        }
        if (k === 'ArrowLeft') {
            this._activateRow(row, -1)
            return true
        }
        if (k === 'Enter' || k === ' ') {
            this._activateRow(row, 1)
            return true
        }
        return false
    }
}
