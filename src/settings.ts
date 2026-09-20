/**
 * Engine preferences — FO2-style game/display/sound settings with persistence.
 *
 * Settings are the source of truth for player-facing options. `applySettings()`
 * projects them onto `Config`, `globalState`, and the audio engine so gameplay,
 * scripts (`get_ini_setting` / metarule difficulty), and the Options panel share
 * one live model. Values persist in `localStorage` when available.
 */

import { HTMLAudioEngine, NullAudioEngine } from './audio.js'
import { Config } from './config.js'
import { EventBus } from './eventBus.js'
import globalState from './globalState.js'

export const SETTINGS_STORAGE_KEY = 'openf2.settings.v1'

/** FO2 ddraw/sfall volume range (default 117). */
export const VOLUME_INI_MAX = 222
export const VOLUME_INI_DEFAULT = 117

export type GameDifficulty = 0 | 1 | 2
export type CombatDifficulty = 0 | 1 | 2
export type ViolenceLevel = 0 | 1 | 2
export type TargetHighlight = 0 | 1 | 2

export interface GameSettings {
    gameDifficulty: GameDifficulty
    combatDifficulty: CombatDifficulty
    violenceLevel: ViolenceLevel
    alwaysRun: boolean
    combatTaunts: boolean
    combatMessages: boolean
    combatLooks: boolean
    itemHighlight: boolean
    targetHighlight: TargetHighlight
    subtitles: boolean
    languageFilter: boolean
    audioEnabled: boolean
    musicVolume: number
    sfxVolume: number
    speechVolume: number
    showHexOverlay: boolean
    showObjects: boolean
    showRoof: boolean
    showFloor: boolean
    showWalls: boolean
    showCoordinates: boolean
    scaleToFit: boolean
}

export const GAME_DIFFICULTY_LABELS: readonly string[] = ['EASY', 'NORMAL', 'HARD']
export const COMBAT_DIFFICULTY_LABELS: readonly string[] = ['WIMPY', 'NORMAL', 'ROUGH']
export const VIOLENCE_LABELS: readonly string[] = ['NONE', 'MINIMAL', 'MAXIMUM']
export const TARGET_HIGHLIGHT_LABELS: readonly string[] = ['OFF', 'ON', 'TARGETING']

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
    gameDifficulty: 1,
    combatDifficulty: 1,
    violenceLevel: 2,
    alwaysRun: true,
    combatTaunts: true,
    combatMessages: true,
    combatLooks: false,
    itemHighlight: true,
    targetHighlight: 2,
    subtitles: false,
    languageFilter: false,
    audioEnabled: false,
    musicVolume: VOLUME_INI_DEFAULT / VOLUME_INI_MAX,
    sfxVolume: VOLUME_INI_DEFAULT / VOLUME_INI_MAX,
    speechVolume: VOLUME_INI_DEFAULT / VOLUME_INI_MAX,
    showHexOverlay: false,
    showObjects: true,
    showRoof: true,
    showFloor: true,
    showWalls: true,
    showCoordinates: false,
    scaleToFit: true,
}

let current: GameSettings = cloneSettings(DEFAULT_SETTINGS)
let memoryStore: string | null = null

function cloneSettings(src: Readonly<GameSettings>): GameSettings {
    return { ...src }
}

function clamp01(n: number): number {
    if (typeof n !== 'number' || Number.isNaN(n)) {return 0}
    return Math.max(0, Math.min(1, n))
}

function clampLevel(n: number, max: number): number {
    if (typeof n !== 'number' || Number.isNaN(n)) {return 0}
    return Math.max(0, Math.min(max, Math.floor(n)))
}

export function volumeToIni(vol: number): number {
    return Math.round(clamp01(vol) * VOLUME_INI_MAX)
}

export function iniToVolume(ini: number): number {
    if (typeof ini !== 'number' || Number.isNaN(ini)) {return 0}
    return clamp01(ini / VOLUME_INI_MAX)
}

export function encounterDifficultyFromGame(level: number): 'easy' | 'normal' | 'hard' {
    if (level <= 0) {return 'easy'}
    if (level >= 2) {return 'hard'}
    return 'normal'
}

/** Map sfall 0–2 violence onto FO2 GAME.CFG 0–3 (none / minimal / normal / max). */
export function violenceToIni(level: number): number {
    if (level <= 0) {return 0}
    if (level === 1) {return 2}
    return 3
}

function sanitize(partial: Partial<GameSettings> | null | undefined): GameSettings {
    const base = cloneSettings(DEFAULT_SETTINGS)
    if (!partial || typeof partial !== 'object') {return base}
    const out: GameSettings = { ...base, ...partial }
    out.gameDifficulty = clampLevel(out.gameDifficulty, 2) as GameDifficulty
    out.combatDifficulty = clampLevel(out.combatDifficulty, 2) as CombatDifficulty
    out.violenceLevel = clampLevel(out.violenceLevel, 2) as ViolenceLevel
    out.targetHighlight = clampLevel(out.targetHighlight, 2) as TargetHighlight
    out.musicVolume = clamp01(out.musicVolume)
    out.sfxVolume = clamp01(out.sfxVolume)
    out.speechVolume = clamp01(out.speechVolume)
    out.alwaysRun = !!out.alwaysRun
    out.combatTaunts = !!out.combatTaunts
    out.combatMessages = !!out.combatMessages
    out.combatLooks = !!out.combatLooks
    out.itemHighlight = !!out.itemHighlight
    out.subtitles = !!out.subtitles
    out.languageFilter = !!out.languageFilter
    out.audioEnabled = !!out.audioEnabled
    out.showHexOverlay = !!out.showHexOverlay
    out.showObjects = !!out.showObjects
    out.showRoof = !!out.showRoof
    out.showWalls = !!out.showWalls
    out.showFloor = !!out.showFloor
    out.showCoordinates = !!out.showCoordinates
    out.scaleToFit = !!out.scaleToFit
    return out
}

function readStorage(): string | null {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(SETTINGS_STORAGE_KEY)
        }
    } catch {
        // ignore quota / privacy errors
    }
    return memoryStore
}

function writeStorage(raw: string): void {
    memoryStore = raw
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SETTINGS_STORAGE_KEY, raw)
        }
    } catch {
        // ignore quota / privacy errors
    }
}

function clearStorage(): void {
    memoryStore = null
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(SETTINGS_STORAGE_KEY)
        }
    } catch {
        // ignore
    }
}

export function getSettings(): GameSettings {
    return cloneSettings(current)
}

export function persistSettings(): void {
    writeStorage(JSON.stringify(current))
}

/**
 * Project the in-memory settings onto Config / globalState / audio.
 * Safe to call from tests and from the browser boot path.
 */
export function applySettings(settings: GameSettings = current): void {
    current = sanitize(settings)

    globalState.gameDifficulty = current.gameDifficulty
    globalState.combatDifficulty = current.combatDifficulty
    globalState.violenceLevel = current.violenceLevel

    Config.engine.doAlwaysRun = current.alwaysRun
    Config.engine.doAudio = current.audioEnabled
    Config.engine.encounterDifficulty = encounterDifficultyFromGame(current.gameDifficulty)

    Config.ui.showHexOverlay = current.showHexOverlay
    Config.ui.showObjects = current.showObjects
    Config.ui.showRoof = current.showRoof
    Config.ui.showFloor = current.showFloor
    Config.ui.showWalls = current.showWalls
    Config.ui.showCoordinates = current.showCoordinates
    Config.ui.scaleToFit = current.scaleToFit

    syncAudioEngine()

    EventBus.emit('settings:changed', { settings: getSettings() })
}

function syncAudioEngine(): void {
    if (current.audioEnabled) {
        if (!globalState.audioEngine || globalState.audioEngine instanceof NullAudioEngine) {
            globalState.audioEngine = new HTMLAudioEngine()
        }
    }
    if (!globalState.audioEngine) {return}
    const mute = current.audioEnabled ? 1 : 0
    globalState.audioEngine.setMusicVolume(current.musicVolume * mute)
    globalState.audioEngine.setSfxVolume(current.sfxVolume * mute)
}

export function patchSettings(partial: Partial<GameSettings>, persist = true): GameSettings {
    current = sanitize({ ...current, ...partial })
    applySettings(current)
    if (persist) {persistSettings()}
    return getSettings()
}

/** Load persisted settings (if any) and apply them to the engine. */
export function loadAndApplySettings(): GameSettings {
    const raw = readStorage()
    if (raw) {
        try {
            current = sanitize(JSON.parse(raw) as Partial<GameSettings>)
        } catch {
            current = cloneSettings(DEFAULT_SETTINGS)
        }
    } else {
        current = cloneSettings(DEFAULT_SETTINGS)
    }
    applySettings(current)
    return getSettings()
}

/** Restore factory defaults. Pass `false` to keep persisted storage (reboot simulation). */
export function resetSettings(clearPersisted = true): GameSettings {
    if (clearPersisted) {clearStorage()}
    current = cloneSettings(DEFAULT_SETTINGS)
    applySettings(current)
    return getSettings()
}

/**
 * Live INI overlay for `get_ini_setting`. Returns `undefined` for keys this
 * module does not own so the scripting defaults table remains the fallback.
 *
 * `sound.sound` / `sound.music` / `sound.speech` are intentionally not overlaid:
 * OpenF2 boots with audio off, but FO2 scripts expect those keys to default to 1.
 */
export function iniOverride(key: string): number | undefined {
    const k = key.toLowerCase()
    const s = current
    switch (k) {
        case 'preferences.game_difficulty': return globalState.gameDifficulty
        case 'preferences.combat_difficulty': return globalState.combatDifficulty
        case 'preferences.violence_level': return violenceToIni(globalState.violenceLevel)
        case 'preferences.combat_taunts': return s.combatTaunts ? 1 : 0
        case 'preferences.combat_messages': return s.combatMessages ? 1 : 0
        case 'preferences.combat_looks': return s.combatLooks ? 1 : 0
        case 'preferences.item_highlight': return s.itemHighlight ? 1 : 0
        case 'preferences.target_highlight': return s.targetHighlight
        case 'main.running': return s.alwaysRun ? 1 : 0
        case 'main.subtitles': return s.subtitles ? 1 : 0
        case 'main.languagefilter': return s.languageFilter ? 1 : 0
        case 'sound.sfxvolume': return volumeToIni(s.sfxVolume)
        case 'sound.musicvolume': return volumeToIni(s.musicVolume)
        case 'sound.speechvolume': return volumeToIni(s.speechVolume)
        default: return undefined
    }
}
