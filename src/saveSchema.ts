/**
 * Save game schema types and migration logic.
 *
 * This module is intentionally kept free of browser-only imports so that
 * the migration helpers can be unit-tested in a Node.js environment.
 */

import type { Point } from './geometry.js'
import type { SerializedMap } from './map.js'
import type { SerializedObj } from './object.js'
import type { SerializedQuestLog } from './quest/questLog.js'
import type { SerializedReputation } from './quest/reputation.js'

/** Current save schema version. Increment when the SaveGame shape changes. */
export const SAVE_VERSION = 9

export interface SaveGame {
    id?: number
    version: number
    name: string
    timestamp: number
    currentMap: string
    currentElevation: number

    /** World-map position of the player when saved (added in v4). */
    worldPosition?: Point

    /**
     * Snapshot of all Fallout 2 script global variables (added in v5).
     *
     * These correspond to the GVAR_* constants in Fallout 2 scripts and
     * carry quest flags, faction states, and world-event flags.
     * Without this, every save/load wipes quest-critical state set by scripts.
     */
    scriptGlobalVars?: Record<number, number>

    /**
     * Game clock in engine ticks at the time of the save (added in v6).
     *
     * 10 ticks = 1 second.  Without this, the calendar and all time-based
     * script checks (quest deadlines, NPC schedules) reset to epoch on load.
     */
    gameTickTime?: number

    /**
     * Per-kill-type kill counts for the player session (added in v6).
     *
     * Indexed by KILL_TYPE_* constants (0 = men, 3 = super mutants, …).
     * Used by the sfall `get_critter_kills` / `set_critter_kills` opcodes and
     * by karma/perk calculations that depend on lifetime kill counts.
     */
    critterKillCounts?: Record<number, number>

    /**
     * Per-map script variable store (added in v7).
     *
     * Keyed as `{ scriptName: { varIndex: value } }`.
     * Map variables (MVAR_*) are set and read by map scripts to track
     * per-map state (e.g. "all enemies killed", "water pump repaired").
     * Persisting these ensures that maps remember their state after save/load.
     */
    mapVars?: Record<string, Record<number, number>>

    /**
     * World-map discovery state keyed by area ID (added in v8).
     *
     * Keeps discovered/hidden locations stable across save/load so scripts
     * using METARULE_IS_AREA_KNOWN and world-map travel progression remain
     * consistent within long campaigns.
     */
    mapAreaStates?: Record<number, boolean>

    /**
     * Character-creation trait IDs chosen for the player character (added in v9).
     *
     * Each element is a Fallout 2 TRAIT_* constant (0–15) corresponding to one
     * of the 16 character-creation mutations (Fast Metabolism, Bruiser, etc.).
     * Persisting this ensures that trait-based script checks (`has_trait(2, …)`)
     * and trait-modulated derived-stats survive across save/load cycles.
     *
     * Stored as a sorted number array for stable JSON output.  Defaults to []
     * (no traits) when absent in older saves.
     */
    playerCharTraits?: number[]

    player: {
        position: Point
        orientation: number
        inventory: SerializedObj[]
        xp: number
        level: number
        karma: number
    }
    party: SerializedObj[]
    savedMaps: { [mapName: string]: SerializedMap }

    /** Serialized quest log (added in v3). */
    questLog?: SerializedQuestLog
    /** Serialized reputation/karma (added in v3). */
    reputation?: SerializedReputation
}

/**
 * Migrate a raw save object from an older version to the current schema.
 *
 * Each `case` handles exactly one version step-up so migrations compose
 * correctly regardless of how old the save is.
 *
 * @returns The migrated save at SAVE_VERSION.
 * @throws If the version is unknown or cannot be migrated.
 */
export function migrateSave(raw: Record<string, any>): SaveGame {
    const save = { ...raw }

    // Treat missing version as version 1 (the original schema).
    if (save.version === undefined || save.version === null) {
        save.version = 1
    }

    // Fall-through intentional: each case upgrades one version.
    switch (save.version as number) {
        case 1:
            // v1 → v2: add xp/level/karma to player snapshot
            if (save.player) {
                if (save.player.xp === undefined) save.player.xp = 0
                if (save.player.level === undefined) save.player.level = 1
                if (save.player.karma === undefined) save.player.karma = 0
            }
            save.version = 2
            // falls through
        case 2:
            // v2 → v3: add questLog and reputation snapshots
            if (save.questLog === undefined) save.questLog = { entries: [] }
            if (save.reputation === undefined) save.reputation = { karma: 0, reputations: {} }
            save.version = 3
            // falls through
        case 3:
            // v3 → v4: add worldPosition when present; leave undefined when absent
            // (undefined means the player was inside a local map, not on the world map)
            // No forced default — callers should treat missing worldPosition as unknown.
            save.version = 4
            // falls through
        case 4:
            // v4 → v5: add scriptGlobalVars snapshot.
            // Old saves have no script state — initialize to empty so scripts see a
            // clean slate (default values) rather than throwing on missing gvars.
            if (save.scriptGlobalVars === undefined) save.scriptGlobalVars = {}
            save.version = 5
            // falls through
        case 5:
            // v5 → v6: add gameTickTime and critterKillCounts.
            // gameTickTime defaults to 0 (game epoch) so the calendar reads
            // the correct starting year/month/day for old saves.
            // critterKillCounts defaults to {} (no kills recorded yet).
            if (save.gameTickTime === undefined) save.gameTickTime = 0
            if (save.critterKillCounts === undefined) save.critterKillCounts = {}
            save.version = 6
            // falls through
        case 6:
            // v6 → v7: add mapVars snapshot.
            // Old saves have no map-variable state — initialize to empty so
            // map scripts start fresh (default values) rather than throwing.
            if (save.mapVars === undefined) save.mapVars = {}
            save.version = 7
            // falls through
        case 7:
            // v7 → v8: add world-map discovery snapshot.
            // Old saves default to no explicit overrides, preserving runtime
            // defaults from city.txt until the user discovers new areas.
            if (save.mapAreaStates === undefined) save.mapAreaStates = {}
            save.version = 8
            // falls through
        case 8:
            // v8 → v9: add player character-creation traits snapshot.
            // Old saves have no trait data — initialize to empty array so
            // trait-based script checks start from a clean slate (no traits).
            if (save.playerCharTraits === undefined) save.playerCharTraits = []
            save.version = 9
            // falls through
        case SAVE_VERSION:
            // Already current — nothing to do.
            break

        default:
            throw new Error(
                `[SaveLoad] Unknown save version ${save.version}; cannot migrate to ${SAVE_VERSION}`
            )
    }

    // Final normalization pass: tolerate partially corrupted saves that carry
    // malformed field shapes/types while still preserving usable campaign data.
    save.scriptGlobalVars = sanitizeNumericRecord(save.scriptGlobalVars)
    save.gameTickTime = sanitizeGameTickTime(save.gameTickTime)
    save.critterKillCounts = sanitizeNumericRecord(save.critterKillCounts)
    save.mapVars = sanitizeNestedNumericRecord(save.mapVars)
    save.mapAreaStates = sanitizeBooleanRecord(save.mapAreaStates)
    save.playerCharTraits = sanitizeTraitArray(save.playerCharTraits)

    return save as SaveGame
}

function sanitizeGameTickTime(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0
    }

    // Game ticks should be integer and non-negative.
    return Math.max(0, Math.floor(value))
}

function sanitizeNumericRecord(value: unknown): Record<number, number> {
    if (typeof value !== 'object' || value === null) {
        return {}
    }

    const out: Record<number, number> = {}
    for (const [key, rawEntry] of Object.entries(value)) {
        const numericKey = Number(key)
        if (!Number.isInteger(numericKey)) continue
        if (typeof rawEntry !== 'number' || !Number.isFinite(rawEntry)) continue
        out[numericKey] = rawEntry
    }
    return out
}

function sanitizeNestedNumericRecord(value: unknown): Record<string, Record<number, number>> {
    if (typeof value !== 'object' || value === null) {
        return {}
    }

    const out: Record<string, Record<number, number>> = {}
    for (const [mapScript, mapVars] of Object.entries(value)) {
        const sanitized = sanitizeNumericRecord(mapVars)
        out[mapScript] = sanitized
    }

    return out
}

function sanitizeBooleanRecord(value: unknown): Record<number, boolean> {
    if (typeof value !== 'object' || value === null) {
        return {}
    }

    const out: Record<number, boolean> = {}
    for (const [key, rawEntry] of Object.entries(value)) {
        const numericKey = Number(key)
        if (!Number.isInteger(numericKey)) continue
        if (typeof rawEntry !== 'boolean') continue
        out[numericKey] = rawEntry
    }

    return out
}

function sanitizeTraitArray(value: unknown): number[] {
    if (!Array.isArray(value)) return []
    const out: number[] = []
    for (const entry of value) {
        if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > 15) continue
        if (!out.includes(entry)) out.push(entry)
    }
    return out.sort((a, b) => a - b)
}
