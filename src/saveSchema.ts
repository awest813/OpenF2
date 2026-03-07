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
export const SAVE_VERSION = 13

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

    /**
     * Player perk ranks granted by scripts during play (added in v10).
     *
     * When Fallout 2 scripts call `critter_add_trait(dude_obj, TRAIT_PERK, perkId, rank)`
     * the perk is stored in the player's `perkRanks` record.  Without persisting
     * this, any perk-gated skill or stat bonus (e.g. Action Boy +AP, Toughness
     * +DT) would silently vanish every time the player loaded a save, causing
     * incorrect derived-stat calculations throughout the campaign.
     *
     * Keyed by numeric perk ID, values are the granted rank (typically 1).
     * Defaults to {} (no scripted perks) when absent in older saves.
     */
    playerPerkRanks?: Record<number, number>

    /**
     * Snapshot of sfall extended global variable stores (added in v11).
     *
     * Many Fallout 2 mods use `set_sfall_global` / `get_sfall_global` (string-keyed)
     * and `set_sfall_global_int` / `get_sfall_global_int` (integer-indexed) for
     * cross-map persistent state (quest flags, unlock trackers, etc.).
     * Without persisting these, any sfall-global-based logic resets to zero on
     * every save/load cycle, silently breaking mod quest state.
     *
     * `stringKeyed` maps arbitrary string keys to numbers.
     * `intIndexed` is a sparse map of non-zero integer-indexed entries (omitting
     * all-zero slots keeps save files compact).
     */
    sfallGlobals?: {
        stringKeyed?: Record<string, number>
        intIndexed?: Record<number, number>
    }

    /**
     * Player character state flags bitfield (added in v12).
     *
     * Set and cleared by pc_flag_on(flag) / pc_flag_off(flag) script calls.
     * Known bits:
     *   bit 0 (1)  — LEVEL_UP_UNUSED
     *   bit 1 (2)  — LEVEL_UP2
     *   bit 2 (4)  — I_AM_EVIL  (karma-alignment flag)
     *   bit 3 (8)  — SNK_MODE   (sneak mode; halves NPC perception range)
     *
     * Defaults to 0 (no flags set) for old saves.
     */
    playerPcFlags?: number

    /**
     * Currently active weapon hand (added in v13 / BLK-034).
     *
     * 0 = primary hand (left UI weapon slot / engine `leftHand`)
     * 1 = secondary hand (right UI weapon slot / engine `rightHand`)
     *
     * Read by the sfall active_hand() opcode and by combat scripts that need
     * to know which weapon the player is wielding.  Defaults to 0 (primary).
     */
    playerActiveHand?: number

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
        case 9:
            // v9 → v10: add player perk-ranks snapshot.
            // Old saves have no persisted perk data — initialize to empty record so
            // perk-based stat bonuses start from a clean slate on legacy saves.
            if (save.playerPerkRanks === undefined) save.playerPerkRanks = {}
            save.version = 10
            // falls through
        case 10:
            // v10 → v11: add sfall global variable snapshot.
            // Old saves have no sfall global state — initialize to empty stores so
            // all sfall-global-based checks start from zero (matching sfall default).
            if (save.sfallGlobals === undefined) save.sfallGlobals = {}
            save.version = 11
            // falls through
        case 11:
            // v11 → v12: add player character state flags (pc_flag_on/pc_flag_off).
            // Old saves have no pcFlags — default to 0 (no flags set, e.g. not sneaking).
            if (save.playerPcFlags === undefined) save.playerPcFlags = 0
            save.version = 12
            // falls through
        case 12:
            // v12 → v13: add player active-hand tracker (BLK-034).
            // Old saves default to 0 (primary hand active).
            if (save.playerActiveHand === undefined) save.playerActiveHand = 0
            save.version = 13
            // falls through
        case SAVE_VERSION:
            // Already current — nothing to do.
            break

        default:
            // Unknown save version — could be from a future build.
            // Emit a warning and treat as current so the save remains
            // usable rather than crashing the load path entirely.
            console.warn(
                `[SaveLoad] Unknown save version ${save.version}; treating as v${SAVE_VERSION} (best-effort)`
            )
            save.version = SAVE_VERSION
            break
    }

    // Final normalization pass: tolerate partially corrupted saves that carry
    // malformed field shapes/types while still preserving usable campaign data.
    save.scriptGlobalVars = sanitizeNumericRecord(save.scriptGlobalVars)
    save.gameTickTime = sanitizeGameTickTime(save.gameTickTime)
    save.critterKillCounts = sanitizeNumericRecord(save.critterKillCounts)
    save.mapVars = sanitizeNestedNumericRecord(save.mapVars)
    save.mapAreaStates = sanitizeBooleanRecord(save.mapAreaStates)
    save.playerCharTraits = sanitizeTraitArray(save.playerCharTraits)
    save.playerPerkRanks = sanitizeNumericRecord(save.playerPerkRanks)
    save.sfallGlobals = sanitizeSfallGlobals(save.sfallGlobals)
    // Normalize playerPcFlags: must be a non-negative integer (bitfield).
    if (typeof save.playerPcFlags !== 'number' || !Number.isFinite(save.playerPcFlags)) {
        save.playerPcFlags = 0
    } else {
        save.playerPcFlags = save.playerPcFlags >>> 0 // coerce to unsigned 32-bit integer
    }
    // Normalize playerActiveHand: must be 0 (primary) or 1 (secondary).
    if (save.playerActiveHand !== 0 && save.playerActiveHand !== 1) {
        save.playerActiveHand = 0
    }

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

function sanitizeSfallGlobals(value: unknown): { stringKeyed: Record<string, number>; intIndexed: Record<number, number> } {
    const out = { stringKeyed: {} as Record<string, number>, intIndexed: {} as Record<number, number> }
    if (typeof value !== 'object' || value === null) return out

    const raw = value as Record<string, unknown>

    if (typeof raw.stringKeyed === 'object' && raw.stringKeyed !== null) {
        for (const [k, v] of Object.entries(raw.stringKeyed)) {
            if (typeof v === 'number' && Number.isFinite(v)) out.stringKeyed[k] = v
        }
    }

    if (typeof raw.intIndexed === 'object' && raw.intIndexed !== null) {
        for (const [rawKey, v] of Object.entries(raw.intIndexed as Record<string, unknown>)) {
            const idx = Number(rawKey)
            if (Number.isInteger(idx) && idx >= 0 && typeof v === 'number' && Number.isFinite(v)) {
                out.intIndexed[idx] = v
            }
        }
    }

    return out
}
