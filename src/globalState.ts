// Copyright 2014-2022 darkf
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { AudioEngine } from './audio.js'
import { Combat } from './combat.js'
import { AreaMap } from './data.js'
import { Point } from './geometry.js'
import { GameMap, SerializedMap } from './map.js'
import { Obj } from './object.js'
import { Party } from './party.js'
import { Player } from './player.js'
import { QuestLog } from './quest/questLog.js'
import { Reputation } from './quest/reputation.js'
import { Renderer } from './renderer.js'
import { Skills } from './skills.js'
import { UIMode } from './ui.js'
import { UIManagerImpl } from './ui2/uiPanel.js'

interface FloatMessage {
    msg: string
    obj: Obj
    startTime: number
    color: string
}

export default {
    combat: null,
    inCombat: false,
    gMap: null,
    messageFiles: {},
    player: null,
    proMap: null,

    skillMode: Skills.None,

    isLoading: true, // are we currently loading a map?
    isWaitingOnRemote: false, // are we waiting on the remote server to send critical info?
    isInitializing: true, // are we initializing the engine?
    loadingAssetsLoaded: 0, // how many images we've loaded
    loadingAssetsTotal: 0, // out of this total
    loadingLoadedCallback: null, // loaded callback
    lazyAssetLoadingQueue: {}, // set of lazily-loaded assets being loaded

    images: {}, // Image cache
    imageInfo: null, // Metadata about images (Number of frames, FPS, etc)
    currentElevation: 0, // current map elevation
    tempCanvas: null, // temporary canvas used for detecting single pixels
    tempCanvasCtx: null, // and the context for it

    // position of viewport camera (will be overriden by map starts or scripts)
    cameraPosition: { x: 3580, y: 1020 },

    gameTickTime: 0, // in Fallout 2 ticks (elapsed seconds * 10)
    lastGameTick: 0, // real time of the last game tick
    gameHasFocus: false, // do we have input focus?
    lastMousePickTime: 0, // time when we last checked what's under the mouse cursor
    lastFPSTime: 0, // Time since FPS counter was last updated

    floatMessages: [],
    renderer: null,
    audioEngine: null,
    $fpsOverlay: null,

    centerTile: { x: 0, y: 0 },

    dirtyMapCache: {},
    gParty: new Party(),

    questLog: new QuestLog(),
    reputation: new Reputation(),

    uiMode: UIMode.none,

    ambientLightLevel: 65536, // Ambient light level (0 = dark, 65536 = fully lit)
    gameUIDisabled: false, // True when scripts have disabled UI interaction
    critterKillCounts: null, // kill-type kill counts (sfall get/set_critter_kills)
    mapVars: {}, // per-map script variable store ({ scriptName: { varIndex: value } })
    mapAreaStates: {}, // world-map discovery overrides ({ areaID: discovered })
    playerCharTraits: [], // player character-creation trait IDs (TRAIT_* constants 0–15)
    playerPerkRanks: {}, // player perk ranks granted by scripts (perkID → rank)
    worldPosition: undefined, // world-map position snapshot ({x,y}) when travelling on world map

    uiManager: null,
    playerEntityId: 0,

    mapAreas: null,
    markAreaKnown: null,
} as {
    gMap: GameMap | null
    combat: Combat | null
    inCombat: boolean
    messageFiles: { [msgFile: string]: { [msgID: string]: string } }
    player: Player | null
    proMap: any // TODO: type

    skillMode: Skills

    isLoading: boolean
    isWaitingOnRemote: boolean
    isInitializing: boolean
    loadingAssetsLoaded: number
    loadingAssetsTotal: number
    loadingLoadedCallback: (() => void) | null
    lazyAssetLoadingQueue: {
        [name: string]: ((img: any) => void)[] | undefined
    }

    images: { [name: string]: HTMLImageElement } // Image cache
    imageInfo: any // Metadata about images (Number of frames, FPS, etc)
    currentElevation: number // current map elevation
    tempCanvas: HTMLCanvasElement | null // temporary canvas used for detecting single pixels
    tempCanvasCtx: CanvasRenderingContext2D | null // and the context for it

    cameraPosition: Point

    gameTickTime: number
    lastGameTick: number
    gameHasFocus: boolean
    lastMousePickTime: number
    lastUpdateTime: number
    lastDrawTime: number
    lastFPSTime: number

    floatMessages: FloatMessage[]
    renderer: Renderer
    audioEngine: AudioEngine
    $fpsOverlay: HTMLElement | null

    centerTile: Point

    dirtyMapCache: { [mapName: string]: SerializedMap }

    gParty: Party

    /** Quest log: tracks state of all quests the player has interacted with. */
    questLog: QuestLog
    /** Reputation and global karma tracker. */
    reputation: Reputation

    uiMode: UIMode

    /** Ambient light level: 0 = fully dark, 65536 = fully lit. */
    ambientLightLevel: number
    /** True when scripts have temporarily disabled the game UI. */
    gameUIDisabled: boolean

    /**
     * Per-kill-type kill counts for the player session.
     * Indexed by KILL_TYPE_* constants (0 = men, 3 = super mutants, …).
     * Used by sfall `get_critter_kills` / `set_critter_kills` opcodes and
     * persisted across save/load via `scriptGlobalVars` in the save schema.
     */
    critterKillCounts: Record<number, number> | null

    /**
     * Per-map script variable store.
     * Keyed as `{ scriptName: { varIndex: value } }`.
     * Written by `set_map_var`, read by `map_var` in scripts.
     * Persisted in save v7+ so map state survives save/load.
     */
    mapVars: Record<string, Record<number, number>>
    /** Per-area world-map discovery overrides keyed by area ID. */
    mapAreaStates: Record<number, boolean>

    /**
     * Player character-creation trait IDs (sorted number array, values 0–15).
     * Persisted in save v9+.  Used by `has_trait(TRAIT_CHAR=2, …)` checks.
     */
    playerCharTraits: number[]

    /**
     * Player perk ranks granted by scripts (keyed by perk ID, values are ranks).
     * Persisted in save v10+.  Used so perk-based stat bonuses survive save/load.
     */
    playerPerkRanks: Record<number, number>

    /** World-map position snapshot used for save/load continuity on the overworld. */
    worldPosition?: Point

    mapAreas: AreaMap | null

    /** UIManager for the ui2 WebGL/offscreen-canvas panel system. */
    uiManager: UIManagerImpl | null
    /** ECS entity ID for the player (used by ui2 panels). */
    playerEntityId: number

    /** Registered by Worldmap.init() to bridge mark_area_known scripting calls. */
    markAreaKnown: ((areaID: number, markState: number) => void) | null
}
