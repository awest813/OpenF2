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
export const SAVE_VERSION = 4

export interface SaveGame {
    id?: number
    version: number
    name: string
    timestamp: number
    currentMap: string
    currentElevation: number

    /** World-map position of the player when saved (added in v4). */
    worldPosition?: Point

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
        case SAVE_VERSION:
            // Already current — nothing to do.
            break

        default:
            throw new Error(
                `[SaveLoad] Unknown save version ${save.version}; cannot migrate to ${SAVE_VERSION}`
            )
    }

    return save as SaveGame
}
