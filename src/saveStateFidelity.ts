import { QuestLog } from './quest/questLog.js'
import { Reputation } from './quest/reputation.js'
import { SaveGame } from './saveSchema.js'

export interface SaveDataState {
    currentElevation: number
    /** World-map position of the player (undefined when inside a local map). */
    worldPosition?: { x: number; y: number }
    /** Current game clock in engine ticks (10 ticks = 1 second). */
    gameTickTime: number
    /** Per-kill-type kill counts indexed by KILL_TYPE_* constants. */
    critterKillCounts: Record<number, number> | null
    /** Per-map script variable store (scriptName → varIndex → value). */
    mapVars: Record<string, Record<number, number>>
    /** World-map discovery state keyed by area ID. */
    mapAreaStates: Record<number, boolean>
    gMap: {
        name: string
        serialize: () => SaveGame['savedMaps'][string]
    }
    player: {
        position: SaveGame['player']['position']
        orientation: number
        inventory: { serialize: () => SaveGame['player']['inventory'][number] }[]
        xp: number
        level: number
        karma: number
    }
    gParty: {
        serialize: () => SaveGame['party']
    }
    dirtyMapCache: SaveGame['savedMaps']
    questLog: {
        serialize: () => NonNullable<SaveGame['questLog']>
    }
    reputation: {
        serialize: () => NonNullable<SaveGame['reputation']>
    }
}

export interface LoadDataState {
    gMap: {
        deserialize: (map: SaveGame['savedMaps'][string]) => void
        changeElevation: (elevation: number, updatePlayer: boolean) => void
    }
    /** World-map position of the player (written on load when present in save). */
    worldPosition?: { x: number; y: number }
    /** Current game clock in engine ticks. Restored from save so the calendar is correct. */
    gameTickTime: number
    /** Per-kill-type kill counts. Restored from save so lifetime stats are preserved. */
    critterKillCounts: Record<number, number> | null
    /** Per-map script variable store. Restored from save so map state is preserved. */
    mapVars: Record<string, Record<number, number>>
    /** World-map discovery state keyed by area ID. */
    mapAreaStates: Record<number, boolean>
    player: {
        position: SaveGame['player']['position']
        orientation: number
        inventory: any[]
        xp: number
        level: number
        karma: number
    }
    gParty: {
        deserialize: (party: SaveGame['party']) => void
    }
    dirtyMapCache: SaveGame['savedMaps']
    questLog: QuestLog
    reputation: Reputation
}

export function snapshotSaveData(name: string, timestamp: number, version: number, state: SaveDataState): SaveGame {
    const curMap = state.gMap.serialize()

    return {
        version,
        name,
        timestamp,
        currentElevation: state.currentElevation,
        worldPosition: state.worldPosition !== undefined ? { ...state.worldPosition } : undefined,
        currentMap: curMap.name,
        gameTickTime: state.gameTickTime,
        critterKillCounts: state.critterKillCounts ? { ...state.critterKillCounts } : {},
        mapVars: state.mapVars ? JSON.parse(JSON.stringify(state.mapVars)) : {},
        mapAreaStates: state.mapAreaStates ? { ...state.mapAreaStates } : {},
        player: {
            position: state.player.position,
            orientation: state.player.orientation,
            inventory: state.player.inventory.map((obj) => obj.serialize()),
            xp: state.player.xp,
            level: state.player.level,
            karma: state.player.karma,
        },
        party: state.gParty.serialize(),
        savedMaps: { [curMap.name]: curMap, ...state.dirtyMapCache },
        questLog: state.questLog.serialize(),
        reputation: state.reputation.serialize(),
    }
}

export function hydrateStateFromSave(
    save: SaveGame,
    state: LoadDataState,
    inventoryDeserializer: (obj: SaveGame['player']['inventory'][number]) => any
): void {
    validateSaveForHydration(save)

    const savedMap = save.savedMaps[save.currentMap]

    state.gMap.deserialize(savedMap)

    state.player.position = save.player.position
    state.player.orientation = save.player.orientation
    state.player.inventory = save.player.inventory.map((obj) => inventoryDeserializer(obj))
    state.player.xp = save.player.xp ?? 0
    state.player.level = save.player.level ?? 1
    state.player.karma = save.player.karma ?? 0

    if (save.worldPosition !== undefined) {
        state.worldPosition = { ...save.worldPosition }
    } else {
        // Explicitly clear worldPosition so stale data from a previous session
        // cannot persist when loading a save from inside a local map.
        state.worldPosition = undefined
    }

    // Restore game clock so quest timers and the calendar are correct.
    state.gameTickTime = save.gameTickTime ?? 0

    // Restore kill counts so lifetime stats and karma calculations are correct.
    state.critterKillCounts = save.critterKillCounts ? { ...save.critterKillCounts } : {}

    // Restore map variables so per-map script state survives across sessions.
    if (save.mapVars) {
        state.mapVars = JSON.parse(JSON.stringify(save.mapVars))
    } else {
        state.mapVars = {}
    }

    // Restore world-map area discovery state so travel/dialogue progression
    // linked to area-known checks survives save/load cycles.
    state.mapAreaStates = save.mapAreaStates ? { ...save.mapAreaStates } : {}

    state.gParty.deserialize(save.party)

    state.questLog = QuestLog.deserialize(save.questLog ?? { entries: [] })
    state.reputation = Reputation.deserialize(save.reputation ?? { karma: 0, reputations: {} })

    state.gMap.changeElevation(save.currentElevation, false)

    state.dirtyMapCache = { ...save.savedMaps }
    delete state.dirtyMapCache[savedMap.name]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function validateSaveForHydration(save: SaveGame): void {
    if (!isRecord(save.savedMaps)) {
        throw new Error('[SaveLoad] Save is missing map data (savedMaps)')
    }

    const savedMap = save.savedMaps[save.currentMap]
    if (!savedMap) {
        throw new Error(`[SaveLoad] Save references missing current map '${save.currentMap}'`)
    }

    if (!save.player || !Array.isArray(save.player.inventory)) {
        throw new Error('[SaveLoad] Save player inventory is missing or invalid')
    }

    if (!Array.isArray(save.party)) {
        throw new Error('[SaveLoad] Save party data is missing or invalid')
    }
}
