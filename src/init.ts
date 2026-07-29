/*
Copyright 2014 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Config } from './config.js'
import { CriticalEffects } from './criticalEffects.js'
import { Events } from './events.js'
import { Point } from './geometry.js'
import globalState from './globalState.js'
import { GameMap } from './map.js'
import { Player } from './player.js'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer.js'
import { saveLoadInit } from './saveload.js'
import { initUI, uiLog } from './ui.js'
import { Worldmap } from './worldmap.js'
import { shouldSkipMainMenu } from './character/chargen.js'

export interface InitGameOptions {
    /** When true, do not load a map yet (main-menu / chargen path). */
    skipMapLoad?: boolean
}

export function initGame(options: InitGameOptions = {}): void {
    globalState.player = new Player()
    globalState.gMap = new GameMap()

    uiLog('Welcome to OpenF2')

    if (shouldSkipMainMenu()) {
        // Dev shortcut: `?artemple` (or any map name) loads immediately.
        globalState.gMap.loadMap(location.search.slice(1))
    } else if (!options.skipMapLoad) {
        // Legacy / test path: boot straight into Temple of Trials.
        globalState.gMap.loadMap('artemple')
    }
    // else: main-menu path — map loads later via enterWorldMap() after chargen.

    if (Config.engine.doCombat === true) {
        CriticalEffects.loadTable()
    }

    document.oncontextmenu = () => false
    const $cnv = document.getElementById('cnv')!
    $cnv.onmouseenter = () => {
        globalState.gameHasFocus = true
    }
    $cnv.onmouseleave = () => {
        globalState.gameHasFocus = false
    }

    globalState.tempCanvas = document.createElement('canvas') as HTMLCanvasElement
    globalState.tempCanvas.width = SCREEN_WIDTH
    globalState.tempCanvas.height = SCREEN_HEIGHT
    globalState.tempCanvasCtx = globalState.tempCanvas.getContext('2d')

    saveLoadInit()

    Worldmap.init()

    initUI()

    if (Config.ui.hideRoofWhenUnder) {
        Events.on('playerMoved', (e: Point) => {
            Config.ui.showRoof = !globalState.gMap.hasRoofAt(e)
        })
    }
}

/** Load a map after chargen or an explicit enter-world request. */
export function enterWorldMap(mapName: string): void {
    if (!globalState.gMap) {
        globalState.gMap = new GameMap()
    }
    if (!globalState.player) {
        globalState.player = new Player()
    }
    globalState.gMap.loadMap(mapName)
}
