import { QuestLog } from './quest/questLog.js'
import { Reputation } from './quest/reputation.js'
import { SaveGame } from './saveSchema.js'

export interface SaveDataState {
    currentElevation: number
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
        currentMap: curMap.name,
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
    const savedMap = save.savedMaps[save.currentMap]

    state.gMap.deserialize(savedMap)

    state.player.position = save.player.position
    state.player.orientation = save.player.orientation
    state.player.inventory = save.player.inventory.map((obj) => inventoryDeserializer(obj))
    state.player.xp = save.player.xp ?? 0
    state.player.level = save.player.level ?? 1
    state.player.karma = save.player.karma ?? 0

    state.gParty.deserialize(save.party)

    state.questLog = QuestLog.deserialize(save.questLog ?? { entries: [] })
    state.reputation = Reputation.deserialize(save.reputation ?? { karma: 0, reputations: {} })

    state.gMap.changeElevation(save.currentElevation, false)

    state.dirtyMapCache = { ...save.savedMaps }
    delete state.dirtyMapCache[savedMap.name]
}
