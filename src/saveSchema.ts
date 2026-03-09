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
export const SAVE_VERSION = 20

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

    /**
     * Player character base stats snapshot (added in v14 / BLK-035).
     *
     * Stores the player's StatSet.baseStats dictionary so that current HP,
     * radiation level, poison level, and any base SPECIAL modifications made
     * by scripts (set_critter_stat) survive save/load cycles.
     *
     * Without this, the player's HP always resets to the hardcoded default
     * (100) on every load, allowing "save-scum" healing and losing all script-
     * driven stat modifications across sessions.
     *
     * Defaults to {} (use Player class defaults) for saves that predate v14.
     */
    playerBaseStats?: Record<string, number>

    /**
     * Player character base skill values snapshot (added in v14 / BLK-035).
     *
     * Stores the player's SkillSet.baseSkills dictionary so that skill-point
     * investments made during the game survive save/load cycles.
     *
     * Defaults to {} for saves that predate v14.
     */
    playerSkillValues?: Record<string, number>

    /**
     * Player unspent skill points (added in v14 / BLK-035).
     *
     * Tracks the count of unspent skill points accumulated through levelling.
     * Without this, the skill-point budget resets to the Player class default
     * (10) on every load.
     *
     * Defaults to undefined (no override) for saves that predate v14.
     */
    playerSkillPoints?: number

    /**
     * PID of the item equipped in the player's left (primary) hand slot (added in v15 / BLK-042).
     *
     * The player can drag weapons from inventory to the left-hand or right-hand
     * weapon slot.  Those equipped items are removed from the inventory array, so
     * they would be lost on save/load without explicit tracking.  Saving the PID
     * here (and including the serialized item in playerInventory) allows the load
     * path to re-equip the correct weapon after loading.
     *
     * Undefined means no custom weapon was equipped in leftHand (uses default punch).
     */
    playerLeftHandPID?: number

    /**
     * PID of the item equipped in the player's right (secondary) hand slot (added in v15 / BLK-042).
     *
     * See playerLeftHandPID for the full explanation.  Undefined means no weapon
     * was equipped in rightHand.
     */
    playerRightHandPID?: number

    /**
     * PID of the armor item the player has equipped (added in v16 / BLK-045).
     *
     * Armor equipped via the inventory drag-and-drop UI is stored in
     * `player.equippedArmor` and removed from the inventory array, so it would
     * be permanently lost across save/load cycles without this field.  The save
     * path serializes the armor into `player.inventory` (like weapon slots in
     * BLK-042) and stores the PID here so the load path can re-equip it.
     *
     * Undefined means no armor was equipped (player wears default clothing).
     */
    playerArmorPID?: number

    /**
     * Number of perk-selection credits owed to the player (added in v16 / BLK-047).
     *
     * In Fallout 2 the player earns one perk selection every 3 levels (levels
     * 3, 6, 9, …).  This counter increments in `give_exp_points` each time a
     * multiple-of-3 level is crossed.  Scripts and sfall mods read it via
     * `get_perk_owed()` and update it via `set_perk_owed()`.  Persisting it
     * prevents perks accrued before a save from being silently lost.
     *
     * Defaults to 0 (no perks owed) for saves that predate v16.
     */
    playerPerksOwed?: number

    /**
     * The player character's name (added in v17 / BLK-048).
     *
     * The name can be set during character creation and by scripts using
     * `set_name(dude_obj, name)`.  Without persistence it reverts to the
     * class default ("Player") on every reload.
     *
     * Defaults to 'Player' for saves that predate v17.
     */
    playerName?: string

    /**
     * The player character's gender (added in v17 / BLK-048).
     *
     * Gender is checked by many Fallout 2 scripts via
     * `get_critter_stat(dude_obj, STAT_gender)` (stat 34).  Without
     * persistence it reverts to 'male' on every reload.
     *
     * Defaults to 'male' for saves that predate v17.
     */
    playerGender?: string

    /**
     * Car fuel level managed by sfall get/set_car_fuel_amount opcodes (added in v18 / BLK-071).
     *
     * The in-game car becomes drivable mid-game (after Gecko/Vault City) and its
     * fuel is set/read by world-map scripts.  Without persistence the fuel resets
     * to 0 on every reload, rendering the car useless after the first session.
     *
     * Clamped to [0, 80 000] (sfall max).  Defaults to 0 for saves that predate v18.
     */
    carFuel?: number

    /**
     * Player injury flags bitmask (added in v19 / BLK-075).
     *
     * Encodes which limbs are crippled and whether the player is blinded:
     *   bit 0 (0x01): crippledLeftLeg
     *   bit 1 (0x02): crippledRightLeg
     *   bit 2 (0x04): crippledLeftArm
     *   bit 3 (0x08): crippledRightArm
     *   bit 4 (0x10): blinded
     *
     * Without this, reloading a save clears all injury states and the player
     * can bypass permanent penalties imposed by critical hits.
     *
     * Defaults to 0 (no injuries) for saves that predate v19.
     */
    playerInjuryFlags?: number

    /**
     * Player's current HP at the time of the save (added in v20 / BLK-138).
     *
     * `playerBaseStats` stores the player's stat store, but current HP is
     * volatile — it changes every fight.  An explicit `playerCurrentHp`
     * snapshot ensures that a save made mid-dungeon at low HP still loads at
     * the correct low HP rather than re-deriving from base stats (which would
     * give the player full HP back).
     *
     * Undefined means "derive from base stats" (pre-v20 behaviour).
     */
    playerCurrentHp?: number

    /**
     * Current HP for each named party member (added in v20 / BLK-138).
     *
     * Keyed by the critter's `name` property.  Stores the current HP so
     * that party members who were injured before a save load at the correct
     * reduced HP rather than at full HP (which was the pre-v20 behaviour).
     *
     * Defaults to {} (use critter proto defaults) when absent.
     */
    partyMembersHp?: Record<string, number>

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
        case 13:
            // v13 → v14: add player base-stats and skill-values snapshots (BLK-035).
            // Old saves default to empty records so the Player class defaults remain
            // in effect (STR=8, PE=8, END=8, CHA=8, INT=8, AGI=8, LCK=8, HP=100).
            if (save.playerBaseStats === undefined) save.playerBaseStats = {}
            if (save.playerSkillValues === undefined) save.playerSkillValues = {}
            // playerSkillPoints: undefined means "use Player class default (10)"
            save.version = 14
            // falls through
        case 14:
            // v14 → v15: add player equipped weapon slot PIDs (BLK-042).
            // Old saves default to undefined meaning no custom weapon was equipped;
            // the load path will restore the default punch for leftHand.
            // playerLeftHandPID and playerRightHandPID are optional and default undefined.
            save.version = 15
            // falls through
        case 15:
            // v15 → v16: add player equipped armor PID (BLK-045) and perk owed count
            // (BLK-047).  Both default to undefined/0 so old saves continue to work.
            // playerArmorPID: undefined means no armor was equipped (default clothing).
            //   Not set here because it is optional; the normalization pass below
            //   calls sanitizeEquippedPID() which validates and strips invalid values.
            // playerPerksOwed: 0 means no pending perk selections.
            if (save.playerPerksOwed === undefined) save.playerPerksOwed = 0
            save.version = 16
            // falls through
        case 16:
            // v16 → v17: add player name and gender (BLK-048).
            // playerName: string — defaults to 'Player' (class default).
            // playerGender: 'male'|'female' — defaults to 'male' (class default).
            if (save.playerName === undefined) save.playerName = 'Player'
            if (save.playerGender === undefined) save.playerGender = 'male'
            save.version = 17
            // falls through
        case 17:
            // v17 → v18: add car fuel level (BLK-071).
            // Old saves default to 0 (empty tank) so the car has no fuel after
            // migration.  Players who had fuel before must refuel; this is safe
            // because the car was not fully drivable in pre-v18 builds anyway.
            if (save.carFuel === undefined) save.carFuel = 0
            save.version = 18
            // falls through
        case 18:
            // v18 → v19: add player injury flags (BLK-075).
            // Old saves default to 0 (no injuries) so all limbs are healthy
            // after migration.  Players who were crippled before must be
            // re-injured by gameplay; this is safe because pre-v19 builds did
            // not persist injury state at all.
            if (save.playerInjuryFlags === undefined) save.playerInjuryFlags = 0
            save.version = 19
            // falls through
        case 19:
            // v19 → v20: add playerCurrentHp and partyMembersHp (BLK-138).
            // playerCurrentHp: undefined means "derive from base stats" — old
            // saves will load at full HP (same as pre-v20 behaviour).
            // partyMembersHp: default to empty record so no override is applied.
            if (save.partyMembersHp === undefined) save.partyMembersHp = {}
            // playerCurrentHp is intentionally left undefined when absent (not
            // set here) — the load path treats undefined as "use stat default".
            save.version = 20
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
    // Normalize playerBaseStats: must be a string→number record.
    save.playerBaseStats = sanitizeStringNumericRecord(save.playerBaseStats)
    // Normalize playerSkillValues: must be a string→number record.
    save.playerSkillValues = sanitizeStringNumericRecord(save.playerSkillValues)
    // Normalize playerSkillPoints: must be a non-negative integer or undefined.
    if (save.playerSkillPoints !== undefined) {
        if (typeof save.playerSkillPoints !== 'number' || !Number.isInteger(save.playerSkillPoints) || save.playerSkillPoints < 0) {
            save.playerSkillPoints = undefined
        }
    }
    // Normalize playerLeftHandPID/playerRightHandPID: must be a positive integer or undefined.
    // A value of 0 is not a valid PID (reserved), so treat it as undefined.
    save.playerLeftHandPID = sanitizeEquippedPID(save.playerLeftHandPID)
    save.playerRightHandPID = sanitizeEquippedPID(save.playerRightHandPID)
    // Normalize playerArmorPID: must be a positive integer or undefined.
    save.playerArmorPID = sanitizeEquippedPID(save.playerArmorPID)
    // Normalize playerPerksOwed: must be a non-negative integer; clamp out-of-range values.
    if (typeof save.playerPerksOwed !== 'number' || !Number.isInteger(save.playerPerksOwed) || save.playerPerksOwed < 0) {
        save.playerPerksOwed = 0
    }
    // Normalize playerName: must be a non-empty string; fall back to 'Player'.
    if (typeof save.playerName !== 'string' || save.playerName.trim() === '') {
        save.playerName = 'Player'
    }
    // Normalize playerGender: must be 'male' or 'female'; fall back to 'male'.
    if (save.playerGender !== 'male' && save.playerGender !== 'female') {
        save.playerGender = 'male'
    }
    // Normalize carFuel (BLK-071): must be a finite non-negative integer, clamped to [0, 80000].
    if (typeof save.carFuel !== 'number' || !Number.isFinite(save.carFuel)) {
        save.carFuel = 0
    } else {
        save.carFuel = Math.max(0, Math.min(80000, Math.floor(save.carFuel)))
    }
    // Normalize playerInjuryFlags (BLK-075): must be a non-negative integer bitmask.
    // Valid bits: 0x01=crippledLeftLeg, 0x02=crippledRightLeg, 0x04=crippledLeftArm,
    //             0x08=crippledRightArm, 0x10=blinded.  Mask to 0x1F.
    if (typeof save.playerInjuryFlags !== 'number' || !Number.isInteger(save.playerInjuryFlags)) {
        save.playerInjuryFlags = 0
    } else {
        save.playerInjuryFlags = (save.playerInjuryFlags >>> 0) & 0x1f
    }
    // Normalize playerCurrentHp (BLK-138): must be a positive finite integer or
    // undefined.  Non-finite, negative, or non-integer values are discarded so the
    // load path falls back to the base-stats derivation safely.
    if (save.playerCurrentHp !== undefined) {
        if (typeof save.playerCurrentHp !== 'number' || !Number.isFinite(save.playerCurrentHp) ||
            save.playerCurrentHp < 0) {
            save.playerCurrentHp = undefined
        } else {
            save.playerCurrentHp = Math.round(save.playerCurrentHp)
        }
    }
    // Normalize partyMembersHp (BLK-138): must be a string→number record with
    // non-negative integer values.  Invalid entries are silently dropped.
    save.partyMembersHp = sanitizeStringNumericRecord(save.partyMembersHp)
    // Defensive: ensure party is always an array so validateSaveForHydration never
    // aborts on saves written without the party field (e.g. very old sessions).
    if (!Array.isArray(save.party)) {
        save.party = []
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

function sanitizeStringNumericRecord(value: unknown): Record<string, number> {
    if (typeof value !== 'object' || value === null) {
        return {}
    }

    // Note: we intentionally do not validate key names here (e.g. against a list
    // of known stat names) because the set of valid stat/skill names is open and
    // validated downstream in StatSet.setBase / SkillSet.setBase, which emit
    // console warnings for unknown names and ignore them.  Stricter filtering here
    // would break saves containing stat names added by future engine versions.
    const out: Record<string, number> = {}
    for (const [key, rawEntry] of Object.entries(value)) {
        if (typeof key !== 'string' || key === '') continue
        if (typeof rawEntry !== 'number' || !Number.isFinite(rawEntry)) continue
        out[key] = rawEntry
    }
    return out
}

/**
 * Normalize an equipped weapon PID: must be a positive integer >= 1, or undefined.
 * PIDs of 0 or negative values are invalid and treated as "no equipped weapon".
 */
function sanitizeEquippedPID(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined
    return value
}
