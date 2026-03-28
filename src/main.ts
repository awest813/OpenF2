// Copyright 2022 darkf
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

import { HTMLAudioEngine, NullAudioEngine } from './audio.js'
import { Combat } from './combat.js'
import { critterKill } from './critter.js'
import { getElevator, lookupMapNameFromLookup } from './data.js'
import { heart } from './heart.js'
import { hexesInRadius, hexFromScreen } from './geometry.js'
import globalState from './globalState.js'
import { IDBCache } from './idbcache.js'
import { initGame } from './init.js'
import { Critter, Obj } from './object.js'
import { getObjectUnderCursor, SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer.js'
import { Scripting } from './scripting.js'
import { skillRequiresTarget, Skills } from './skills.js'
import {
    uiCalledShot,
    uiCloseCalledShot,
    uiContextMenu,
    uiElevator,
    uiLog,
    uiLoot,
    UIMode,
    uiSaveLoad,
    setPlayerUseHandler,
    uiWorldMap,
} from './ui.js'
import { getFileJSON, getProtoMsg } from './util.js'
import { WebGLRenderer } from './webglrenderer.js'
import { Config } from './config.js'
import { fonUnpack } from './formats/fon.js'
import { UIManagerImpl, BitmapFontRenderer } from './ui2/uiPanel.js'
import { ScriptDebuggerPanel } from './ui2/scriptDebuggerPanel.js'
import { DebugOverlayPanel } from './ui2/debugOverlay.js'
import { registerDefaultPanels } from './ui2/registerPanels.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import { EventBus } from './eventBus.js'
import { SaveLoadPanel } from './ui2/saveLoadPanel.js'

// Return the skill ID used by the Fallout 2 engine
function getSkillID(skill: Skills): number {
    switch (skill) {
        case Skills.Lockpick:
            return 9
        case Skills.Repair:
            return 13
    }

    console.log('unimplemented skill %d', skill)
    return -1
}

function playerUseSkill(skill: Skills, obj: Obj): void {
    console.log('use skill %o on %o', skill, obj)

    if (!obj && skillRequiresTarget(skill)) {
        console.warn('playerUseSkill: skill ' + skill + ' requires a target but none was provided — skipping')
        return
    }

    if (skillRequiresTarget(skill)) {
        // use the skill on the object
        Scripting.useSkillOn(globalState.player, getSkillID(skill), obj)
    } else {
        console.log('passive skills are not implemented')
    }
}

export function playerUse() {
    // TODO: playerUse should take an object
    const mousePos = heart.mouse.getPosition()
    const mouseHex = hexFromScreen(
        mousePos[0] + globalState.cameraPosition.x,
        mousePos[1] + globalState.cameraPosition.y
    )
    let obj = getObjectUnderCursor((obj) => obj.isSelectable)
    const who = <Critter>obj

    if (globalState.uiMode === UIMode.useSkill) {
        // using a skill on object
        obj = getObjectUnderCursor((_: Obj) => true) // obj might not be usable, so select non-usable ones too
        if (!obj) {
            return
        }
        try {
            playerUseSkill(globalState.skillMode, obj)
        } finally {
            globalState.skillMode = Skills.None
            globalState.uiMode = UIMode.none
        }

        return
    }

    if (obj === null) {
        // walk to the destination if there is no usable object
        // Walking in combat (TODO: This should probably be in Combat...)
        if (globalState.inCombat) {
            if (!(globalState.combat.inPlayerTurn || Config.combat.allowWalkDuringAnyTurn)) {
                console.log('Wait your turn.')
                return
            }

            if (globalState.player.AP.getAvailableMoveAP() === 0) {
                uiLog(getProtoMsg(700)) // "You don't have enough action points."
                return
            }

            const maxWalkingDist = globalState.player.AP.getAvailableMoveAP()
            if (!globalState.player.walkTo(mouseHex, Config.engine.doAlwaysRun, undefined, maxWalkingDist)) {
                console.log('Cannot walk there')
            } else {
                if (!globalState.player.AP.subtractMoveAP(globalState.player.path.path.length - 1)) {
                    console.warn(
                        'subtractMoveAP failed: has AP: ' +
                        globalState.player.AP.getAvailableMoveAP() +
                        ' needs AP:' +
                        globalState.player.path.path.length +
                        ' and maxDist was:' +
                        maxWalkingDist +
                        ' — ignoring AP desync'
                    )
                }
            }
        }

        // Walking out of combat
        if (!globalState.player.walkTo(mouseHex, Config.engine.doAlwaysRun)) {
            console.log('Cannot walk there')
        }

        return
    }

    if (obj.type === 'critter') {
        if (obj === globalState.player) {
            return
        } // can't use yourself

        if (globalState.inCombat && !who.dead) {
            // attack a critter
            if (!globalState.combat!.inPlayerTurn || globalState.player.inAnim()) {
                console.log("You can't do that yet.")
                return
            }

            // TODO: move within range of target

            const weapon = globalState.player.equippedWeapon
            if (weapon === null) {
                console.log('You have no weapon equipped!')
                return
            }

            // C2 FIX: use weapon-specific AP cost (APCost1 = primary attack mode)
            const attackCost: number = weapon.weapon?.getAPCost?.(1) ??
                weapon.weapon?.weapon?.pro?.extra?.APCost1 ?? 4

            if (globalState.player.AP!.getAvailableCombatAP() < attackCost) {
                uiLog(getProtoMsg(700)!) // "You don't have enough action points."
                return
            }

            if (weapon.weapon!.isCalled()) {
                let art = 'art/critters/hmjmpsna' // default art
                if (who.hasAnimation('called-shot')) {
                    art = who.getAnimation('called-shot')
                }

                console.log('art: %s', art)

                uiCalledShot(art, who, (region: string) => {
                    globalState.player.AP!.subtractCombatAP(attackCost)
                    console.log('Attacking %s...', region)
                    globalState.combat!.attack(globalState.player, <Critter>obj, region)
                    uiCloseCalledShot()
                })
            } else {
                globalState.player.AP!.subtractCombatAP(attackCost)
                console.log('Attacking the torso...')
                globalState.combat!.attack(globalState.player, <Critter>obj, 'torso')
            }

            return
        }
    }

    const callback = function () {
        globalState.player.clearAnim()

        if (!obj) {
            console.warn('playerUse callback: obj is null — skipping use action')
            return
        }

        // if there's an object under the cursor, use it
        if (obj.type === 'critter') {
            if (
                who.dead !== true &&
                globalState.inCombat !== true &&
                obj._script &&
                obj._script.talk_p_proc !== undefined
            ) {
                // talk to a critter
                console.log('Talking to ' + who.name)
                if (!who._script) {
                    console.warn('obj has no script')
                    return
                }
                Scripting.talk(who._script, who)
            } else if (who.dead === true) {
                // loot a dead body
                uiLoot(obj)
            } else {
                console.log('Cannot talk to/loot that critter')
            }
        } else {
            obj.use(globalState.player)
        }
    }

    if (Config.engine.doInfiniteUse === true) {
        callback()
    } else {
        globalState.player.walkInFrontOf(obj.position, callback)
    }
}

setPlayerUseHandler(playerUse)

/**
 * Create and wire the UIManagerImpl (ui2 WebGL/OffscreenCanvas path).
 *
 * Called once after the renderer is initialized. Creates the player ECS entity
 * (for UI data), builds all panels, registers them, and connects the EventBus so
 * that ui:openPanel / ui:closePanel events show/hide panels automatically.
 */
function initUIManager(): void {
    const playerEntityId = createPlayerEntity({ name: 'VAULT DWELLER' })
    globalState.playerEntityId = playerEntityId

    const mgr = new UIManagerImpl(SCREEN_WIDTH, SCREEN_HEIGHT)

    // Wire the first loaded font (font0.fon — the main UI font) into the
    // BitmapFontRenderer so ui2 panels can draw pixel-accurate Fallout glyphs.
    const fonts = globalState.renderer?.fonts
    if (fonts && fonts.length > 0) {
        mgr.fontRenderer = new BitmapFontRenderer(fonts[0])
    }

    registerDefaultPanels(mgr, SCREEN_WIDTH, SCREEN_HEIGHT, playerEntityId, globalState.questLog)

    const scriptDebuggerPanel = mgr.get<ScriptDebuggerPanel>('scriptDebugger')
    Scripting.setScriptDebuggerSink(scriptDebuggerPanel)

    const debugOverlayPanel = mgr.get<DebugOverlayPanel>('debug')
    debugOverlayPanel.setScriptRuntimeProvider(() => scriptDebuggerPanel.getRuntimeSnapshot())
    EventBus.on('map:loaded', ({ mapName }) => {
        debugOverlayPanel.mapName = mapName
    })

    EventBus.on('worldMap:travelTo', ({ mapLookupName }) => {
        const mapName = lookupMapNameFromLookup(mapLookupName)
        if (mapName) {
            console.log('worldMap:travelTo -> ' + mapName + ' (via ' + mapLookupName + ')')
            globalState.gMap.loadMap(mapName)
            globalState.uiMode = UIMode.none
        }
    })

    EventBus.on('worldMap:closed', () => {
        globalState.uiMode = UIMode.none
    })

    mgr.connectEventBus()

    globalState.uiManager = mgr
}

window.onload = async function () {
    globalState.isInitializing = true

    globalState.$fpsOverlay = document.getElementById('fpsOverlay')

    const fragment = await fetch('shaders/fragment.glsl')
    const fragmentLighting = await fetch('shaders/fragmentLighting.glsl')
    const vertex = await fetch('shaders/vertex.glsl')
    const fragmentFont = await fetch('shaders/fragmentFont.glsl')

    // initialize renderer
    globalState.renderer = new WebGLRenderer(
        {
            fragment: await fragment.text(),
            fragmentLighting: await fragmentLighting.text(),
            vertex: await vertex.text(),
            fragmentFont: await fragmentFont.text(),
        },
        await Promise.all([0, 1, 2, 3, 5].map((i) => fonUnpack(`data/font${i}.fon`)))
    )

    globalState.renderer.init()

    // initialize ui2 panel manager (unified WebGL/OffscreenCanvas UI path)
    initUIManager()

    // initialize audio engine
    if (Config.engine.doAudio) {
        globalState.audioEngine = new HTMLAudioEngine()
    } else {
        globalState.audioEngine = new NullAudioEngine()
    }

    // initialize cached data

    function cachedJSON(key: string, path: string, callback: (value: any) => void): void {
        // load data from cache if possible, else load and cache it
        IDBCache.get(key, (value) => {
            if (value) {
                console.log('[Main] %s loaded from cache DB', key)
                callback(value)
            } else {
                value = getFileJSON(path)
                IDBCache.add(key, value)
                console.log('[Main] %s loaded and cached', key)
                callback(value)
            }
        })
    }

    IDBCache.init(() => {
        cachedJSON('imageMap', 'art/imageMap.json', (value) => {
            globalState.imageInfo = value

            cachedJSON('proMap', 'proto/pro.json', (value) => {
                globalState.proMap = value

                // continue initialization
                initGame()
                globalState.isInitializing = false
            })
        })
    })

    heart._init()
}

heart.mousepressed = (x: number, y: number, btn: string) => {
    if (globalState.isInitializing || globalState.isLoading || globalState.isWaitingOnRemote) {
        return
    }
    // Route to ui2 UIManager first; if it consumes the event, stop game input processing.
    if (globalState.uiManager && (btn === 'l' || btn === 'r') &&
        globalState.uiManager.handleMouseDown(x, y, btn)) {
        return
    }
    if (btn === 'l') {
        playerUse()
    } else if (btn === 'r') {
        // item context menu
        const obj = getObjectUnderCursor((obj) => obj.isSelectable)
        if (obj) {
            uiContextMenu(obj, { clientX: x, clientY: y })
        }
    }
}

heart.keydown = (k: string) => {
    if (globalState.isLoading === true) {
        return
    }

    // Global gameplay-debugger toggle (works even while panel is hidden).
    if (k === 'F6') {
        globalState.uiManager?.get<ScriptDebuggerPanel>('scriptDebugger').toggle()
        return
    }

    // Route to ui2 UIManager first; if a panel consumes the key, skip game handling.
    if (globalState.uiManager?.handleKeyDown(k)) {
        return
    }
    const mousePos = heart.mouse.getPosition()
    const mouseHex = hexFromScreen(
        mousePos[0] + globalState.cameraPosition.x,
        mousePos[1] + globalState.cameraPosition.y
    )

    if (k === Config.controls.cameraDown) {
        globalState.cameraPosition.y += 15
    }
    if (k === Config.controls.cameraRight) {
        globalState.cameraPosition.x += 15
    }
    if (k === Config.controls.cameraLeft) {
        globalState.cameraPosition.x -= 15
    }
    if (k === Config.controls.cameraUp) {
        globalState.cameraPosition.y -= 15
    }
    if (k === Config.controls.elevationDown) {
        if (globalState.currentElevation - 1 >= 0) {
            globalState.gMap.changeElevation(globalState.currentElevation - 1, true)
        }
    }
    if (k === Config.controls.elevationUp) {
        if (globalState.currentElevation + 1 < globalState.gMap.numLevels) {
            globalState.gMap.changeElevation(globalState.currentElevation + 1, true)
        }
    }
    if (k === Config.controls.showRoof) {
        Config.ui.showRoof = !Config.ui.showRoof
    }
    if (k === Config.controls.showFloor) {
        Config.ui.showFloor = !Config.ui.showFloor
    }
    if (k === Config.controls.showObjects) {
        Config.ui.showObjects = !Config.ui.showObjects
    }
    if (k === Config.controls.showWalls) {
        Config.ui.showWalls = !Config.ui.showWalls
    }
    if (k === Config.controls.talkTo) {
        const critter = globalState.gMap.critterAtPosition(mouseHex)
        if (critter) {
            if (critter._script && critter._script.talk_p_proc !== undefined) {
                console.log('talking to ' + critter.name)
                Scripting.talk(critter._script, critter)
            }
        }
    }
    if (k === Config.controls.inspect) {
        globalState.gMap.getObjects().forEach((obj, idx) => {
            if (obj.position.x === mouseHex.x && obj.position.y === mouseHex.y) {
                const hasScripts =
                    (obj.script !== undefined ? 'yes (' + obj.script + ')' : 'no') +
                    ' ' +
                    (obj._script === undefined ? 'and is NOT loaded' : 'and is loaded')
                console.log(
                    'object is at index ' +
                        idx +
                        ', of type ' +
                        obj.type +
                        ', has art ' +
                        obj.art +
                        ', and has scripts? ' +
                        hasScripts +
                        ' -> %o',
                    obj
                )
            }
        })
    }
    if (k === Config.controls.moveTo) {
        globalState.player.walkTo(mouseHex)
    }
    if (k === Config.controls.runTo) {
        globalState.player.walkTo(mouseHex, true)
    }
    if (k === Config.controls.attack) {
        if (!globalState.inCombat || !globalState.combat.inPlayerTurn || globalState.player.anim !== 'idle') {
            console.log("You can't do that yet.")
            return
        }

        // C2 FIX: use weapon-specific AP cost
        const kbWeapon = globalState.player.equippedWeapon
        const kbAttackCost: number = kbWeapon?.weapon?.getAPCost?.(1) ??
            kbWeapon?.weapon?.weapon?.pro?.extra?.APCost1 ?? 4

        if (globalState.player.AP.getAvailableCombatAP() < kbAttackCost) {
            uiLog(getProtoMsg(700))
            return
        }

        for (let i = 0; i < globalState.combat!.combatants.length; i++) {
            // BLK-112: Guard against null position — combatants may lose their tile
            // assignment during a scripted move or map transition mid-combat.
            // Without this check, the .x access would throw a TypeError and freeze
            // the combat loop for the remainder of the turn.
            const combatant = globalState.combat.combatants[i]
            if (
                combatant.position &&
                combatant.position.x === mouseHex.x &&
                combatant.position.y === mouseHex.y &&
                !combatant.dead
            ) {
                globalState.player.AP.subtractCombatAP(kbAttackCost)
                console.log('Attacking...')
                globalState.combat.attack(globalState.player, combatant)
                break
            }
        }
    }

    if (k === Config.controls.combat) {
        if (!Config.engine.doCombat) {
            return
        }
        if (globalState.inCombat === true && globalState.combat.inPlayerTurn === true) {
            console.log('[TURN]')
            globalState.combat.nextTurn()
        } else if (globalState.inCombat === true) {
            console.log('Wait your turn...')
        } else {
            console.log('[COMBAT BEGIN]')
            Combat.start()
        }
    }

    if (k === Config.controls.playerToTargetRaycast) {
        const obj = globalState.gMap.objectsAtPosition(mouseHex)[0]
        if (obj !== undefined) {
            const hit = globalState.gMap.hexLinecast(globalState.player.position, obj.position)
            if (!hit) {
                return
            }
            console.log('hit obj: ' + hit.art)
        }
    }

    if (k === Config.controls.showTargetInventory) {
        const obj = globalState.gMap.objectsAtPosition(mouseHex)[0]
        if (obj !== undefined) {
            console.log('PID: ' + obj.pid)
            console.log('inventory: ' + JSON.stringify(obj.inventory))
            uiLoot(obj)
        }
    }

    if (k === Config.controls.use) {
        const objs = globalState.gMap.objectsAtPosition(mouseHex)
        for (let i = 0; i < objs.length; i++) {
            objs[i].use()
        }
    }

    if (k === 'h') {
        globalState.player.move(mouseHex)
    }

    if (k === Config.controls.kill) {
        const critter = globalState.gMap.critterAtPosition(mouseHex)
        if (critter) {
            critterKill(critter, globalState.player)
        }
    }

    if (k === Config.controls.worldmap) {
        if (Config.ui.forceUI2OnlyGameplayPanels) {
            EventBus.emit('ui:openPanel', { panelName: 'worldMap' })
        } else {
            uiWorldMap()
        }
    }

    if (k === Config.controls.saveKey) {
        const slPanel = globalState.uiManager?.get<SaveLoadPanel>('saveLoad')
        if (slPanel) {
            slPanel.openAs('save')
        } else {
            uiSaveLoad(true)
        }
    }

    if (k === Config.controls.loadKey) {
        const slPanel = globalState.uiManager?.get<SaveLoadPanel>('saveLoad')
        if (slPanel) {
            slPanel.openAs('load')
        } else {
            uiSaveLoad(false)
        }
    }

    //if(k == calledShotKey)
    //	uiCalledShot()

    //if(k == 'a')
    //	Worldmap.checkEncounters()
}

function changeCursor(image: string) {
    document.getElementById('cnv')!.style.cursor = image
}

heart.update = function () {
    if (globalState.isInitializing || globalState.isWaitingOnRemote) {
        return
    } else if (globalState.isLoading) {
        if (globalState.loadingAssetsLoaded === globalState.loadingAssetsTotal) {
            globalState.isLoading = false
            if (globalState.loadingLoadedCallback) {
                globalState.loadingLoadedCallback()
            }
        } else {
            return
        }
    }

    if (globalState.uiMode !== UIMode.none) {
        return
    }
    const time = window.performance.now()

    if (time - globalState.lastFPSTime >= 500) {
        globalState.$fpsOverlay.textContent = 'fps: ' + heart.timer.getFPS()
        globalState.lastFPSTime = time

        if (globalState.lastUpdateTime != undefined) {
            globalState.$fpsOverlay.textContent += ' update: ' + globalState.lastUpdateTime + 'ms'
        }

        if (globalState.lastDrawTime) {
            globalState.$fpsOverlay.textContent += ' draw: ' + globalState.lastDrawTime + 'ms'
        }
    }

    if (globalState.gameHasFocus) {
        const mousePos = heart.mouse.getPosition()
        // Route mouse move to ui2 panels for hover effects.
        globalState.uiManager?.handleMouseMove(mousePos[0], mousePos[1])
        if (mousePos[0] <= Config.ui.scrollPadding) {
            globalState.cameraPosition.x -= 15
        }
        if (mousePos[0] >= SCREEN_WIDTH - Config.ui.scrollPadding) {
            globalState.cameraPosition.x += 15
        }

        if (mousePos[1] <= Config.ui.scrollPadding) {
            globalState.cameraPosition.y -= 15
        }
        if (mousePos[1] >= SCREEN_HEIGHT - Config.ui.scrollPadding) {
            globalState.cameraPosition.y += 15
        }

        if (time >= globalState.lastMousePickTime + 750) {
            // every .75 seconds, check the object under the cursor
            globalState.lastMousePickTime = time

            const obj = getObjectUnderCursor((obj) => obj.isSelectable)
            if (obj !== null) {
                changeCursor('pointer')
            } else {
                changeCursor('auto')
            }
        }

        for (let i = 0; i < globalState.floatMessages.length; i++) {
            if (time >= globalState.floatMessages[i].startTime + 1000 * Config.ui.floatMessageDuration) {
                globalState.floatMessages.splice(i--, 1)
                continue
            }
        }
    }

    const didTick = time - globalState.lastGameTick >= 1000 / 10 // 10 Hz game tick
    if (didTick) {
        globalState.lastGameTick = time
        globalState.gameTickTime++

        if (Config.engine.doTimedEvents && !globalState.inCombat) {
            // check and update timed events
            const timedEvents = Scripting.timeEventList
            let numEvents = timedEvents.length
            for (let i = 0; i < numEvents; i++) {
                const event = timedEvents[i]
                const obj = event.obj

                // remove events for dead objects
                if (obj && obj instanceof Critter && obj.dead) {
                    console.log('removing timed event for dead object')
                    timedEvents.splice(i--, 1)
                    numEvents--
                    continue
                }

                event.ticks--
                if (event.ticks <= 0) {
                    Scripting.info('timed event triggered', 'timer')
                    event.fn()
                    timedEvents.splice(i--, 1)
                    numEvents--
                }
            }
        }

        globalState.audioEngine.tick()
    }

    for (const obj of globalState.gMap.getObjects()) {
        if (obj.type === 'critter') {
            if (
                didTick &&
                Config.engine.doUpdateCritters &&
                !globalState.inCombat &&
                !(<Critter>obj).dead &&
                !obj.inAnim() &&
                obj._script
            ) {
                Scripting.updateCritter(obj._script, obj as Critter)
            }
        }

        obj.updateAnim()
    }

    globalState.lastUpdateTime = Math.floor(window.performance.now() - time)
}

heart.draw = () => {
    const time = window.performance.now()

    if (globalState.isWaitingOnRemote) {
        return
    }
    globalState.renderer.render()

    globalState.lastDrawTime = Math.floor(window.performance.now() - time)
}

export function useElevator(): void {
    // Player walked into an elevator
    //
    // We search for the Elevator Stub (Scenery PID 1293)
    // in the range of 11. The original engine uses a square
    // of size 11x11, but we don't do that.

    console.log('[elevator]')

    const center = globalState.player.position
    const hexes = hexesInRadius(center, 11)
    let elevatorStub = null
    for (let i = 0; i < hexes.length; i++) {
        const objs = globalState.gMap.objectsAtPosition(hexes[i])
        for (let j = 0; j < objs.length; j++) {
            const obj = objs[j]
            if (obj.type === 'scenery' && obj.pidID === 1293) {
                console.log('elevator stub @ ' + hexes[i].x + ', ' + hexes[i].y)
                elevatorStub = obj
                break
            }
        }
    }

    if (elevatorStub === null) {
        console.warn("useElevator: couldn't find elevator stub near " + center.x + ', ' + center.y + ' — aborting')
        return
    }

    console.log('elevator type: ' + elevatorStub.extra.type + ', ' + 'level: ' + elevatorStub.extra.level)

    const elevator = getElevator(elevatorStub.extra.type)
    if (!elevator) {
        console.warn('useElevator: no elevator definition for type: ' + elevatorStub.extra.type + ' — aborting')
        return
    }

    uiElevator(elevator)
}

Scripting.setUseElevatorHandler(useElevator)

// ---------------------------------------------------------------------------
// BLK-139 — Global browser error boundary
//
// Without global error handlers, any uncaught JavaScript exception (including
// those thrown by async code, requestAnimationFrame callbacks, or WebGL driver
// errors) produces a silent freeze: the game loop stops, the screen is frozen,
// and the user has no indication that anything is wrong.
//
// These handlers intercept all unhandled errors and:
//   1. Log the full error to the browser console for developer debugging.
//   2. Display a recoverable error overlay in the game viewport so the user
//      sees a clear message and is offered a "Continue" or "Reload" option.
//
// "Continue" hides the overlay and lets the game attempt to recover (the
// requestAnimationFrame loop restarts from the next tick).  This works for
// recoverable errors (e.g. a single bad NPC script that was not caught by
// callProcedureSafe).  "Reload" does a hard page reload for catastrophic
// failures (e.g. WebGL context lost, IndexedDB corruption).
// ---------------------------------------------------------------------------

;(function installBrowserErrorBoundary() {
    // Only install in browser environments.
    if (typeof window === 'undefined') {return}

    /** Tracks whether the overlay is already visible to suppress duplicates. */
    let overlayVisible = false
    /** Counter: max errors shown per minute before throttling. */
    let recentErrorCount = 0
    const ERROR_THROTTLE_MAX = 5
    const ERROR_THROTTLE_WINDOW_MS = 60_000
    let throttleResetTimer: ReturnType<typeof setTimeout> | null = null

    function showErrorOverlay(message: string, source: string, detail: string) {
        recentErrorCount++
        if (recentErrorCount > ERROR_THROTTLE_MAX) {return} // throttle flood

        if (throttleResetTimer === null) {
            throttleResetTimer = setTimeout(() => {
                recentErrorCount = 0
                throttleResetTimer = null
            }, ERROR_THROTTLE_WINDOW_MS)
        }

        if (overlayVisible) {return} // only one overlay at a time

        overlayVisible = true
        console.error(`[BLK-139] Unhandled error in ${source}:`, message, detail)

        const overlay = document.createElement('div')
        overlay.id = 'f2-error-overlay'
        overlay.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'background:rgba(0,0,0,0.85)',
            'color:#e0c060',
            'font-family:monospace',
            'font-size:14px',
            'display:flex',
            'flex-direction:column',
            'align-items:center',
            'justify-content:center',
            'z-index:99999',
            'padding:20px',
            'box-sizing:border-box',
        ].join(';')

        const title = document.createElement('div')
        title.style.cssText = 'font-size:22px;font-weight:bold;margin-bottom:12px;color:#ff9944'
        title.textContent = '⚠ Game Error'

        const msg = document.createElement('div')
        msg.style.cssText = 'max-width:600px;text-align:center;margin-bottom:8px;color:#ffcc88'
        msg.textContent = message.length > 200 ? message.slice(0, 200) + '…' : message

        const src = document.createElement('div')
        src.style.cssText = 'max-width:700px;text-align:center;font-size:11px;color:#888;margin-bottom:20px;word-break:break-all'
        src.textContent = `Source: ${source}`

        const btnRow = document.createElement('div')
        btnRow.style.cssText = 'display:flex;gap:16px'

        const btnContinue = document.createElement('button')
        btnContinue.textContent = 'Continue'
        btnContinue.style.cssText = 'padding:10px 24px;background:#4a7a3a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px'
        btnContinue.onclick = () => {
            overlay.remove()
            overlayVisible = false
        }

        const btnReload = document.createElement('button')
        btnReload.textContent = 'Reload Page'
        btnReload.style.cssText = 'padding:10px 24px;background:#7a3a3a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px'
        btnReload.onclick = () => { window.location.reload() }

        btnRow.appendChild(btnContinue)
        btnRow.appendChild(btnReload)
        overlay.appendChild(title)
        overlay.appendChild(msg)
        overlay.appendChild(src)
        overlay.appendChild(btnRow)
        document.body.appendChild(overlay)
    }

    window.addEventListener('error', (event: ErrorEvent) => {
        const msg = event.message || String(event.error) || 'Unknown error'
        const src = `${event.filename ?? '(unknown)'}:${event.lineno}:${event.colno}`
        showErrorOverlay(msg, src, String(event.error?.stack ?? ''))
        // Do NOT preventDefault — allow DevTools to still report the error.
    })

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const reason = event.reason
        const msg = (reason instanceof Error ? reason.message : String(reason)) || 'Unhandled Promise rejection'
        const stack = reason instanceof Error ? (reason.stack ?? '') : ''
        showErrorOverlay(msg, 'Promise rejection', stack)
    })
})()
