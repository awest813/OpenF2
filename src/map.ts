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
import { getCurrentMapInfo, lookupMapName } from './data.js'
import { Events } from './events.js'
import { hexInDirectionDistance, hexLine, HEX_GRID_SIZE, Point, pointInBoundingBox } from './geometry.js'
import globalState from './globalState.js'
import { heart } from './heart.js'
import { Lightmap } from './lightmap.js'
import { Critter, deserializeObj, Obj, objFromMapObject } from './object.js'
import { centerCamera } from './renderer.js'
import { Scripting } from './scripting.js'
import { fromTileNum, hexToTile, toTileNum } from './tile.js'
import { arrayRemove, arrayWithout, getFileJSON } from './util.js'

declare let PF: any

// Representation of game map and its serialized forms

/**
 * A map spatial — a tile-based trigger region. Spatials are the Fallout 2
 * equivalent of an invisible "if-player-walks-here, run script" zone. They
 * carry a script handle and a tile position; the engine fires the script
 * when the player enters the spatial's tile.
 */
export interface Spatial {
    script: string
    tileNum: number
    position: Point
    isSpatial: true
    _script?: Scripting.Script | null
    [key: string]: any
}

/** Telemetry counters for the A* pathfinding solver. */
export interface PathfindingTelemetry {
    /** Total number of recalcPath calls made. */
    totalCalls: number
    /** Cumulative wall-clock time spent in recalcPath, in milliseconds. */
    totalTimeMs: number
    /** Wall-clock time of the single most expensive recalcPath call, in milliseconds. */
    worstCaseTimeMs: number
    /** Wall-clock time of the most recent recalcPath call, in milliseconds. */
    lastSolveTimeMs: number
}

export interface SerializedMap {
    name: string
    mapID: number
    numLevels: number

    mapScript: /* SerializedScript */ any
    objects: /* SerializedObj */ any[][]
    spatials: /* SerializedSpatial */ any[][]

    floorMap: string[][]
    roofMap: string[][]

    mapObj: any // required?
}

export class GameMap {
    name: string = null
    startingPosition: Point
    startingElevation: number
    numLevels: number

    currentElevation = 0 // current map elevation

    floorMap: string[][] = null // Floor tilemap
    roofMap: string[][] = null // Roof tilemap

    mapScript: any = null // Current map script object
    objects: Obj[][] = null // Map objects on all levels
    spatials: Spatial[][] = null // Spatials on all levels

    mapObj: any = null
    mapID: number

    /** Live pathfinding telemetry — updated after every recalcPath call. */
    pathfindingTelemetry: PathfindingTelemetry = {
        totalCalls: 0,
        totalTimeMs: 0,
        worstCaseTimeMs: 0,
        lastSolveTimeMs: 0,
    }

    /** Reused occupancy matrix for pathfinding to avoid per-call allocations. */
    private pathMatrix: number[][] = []
    /** Reused A* finder instance. */
    private readonly pathFinder = new PF.AStarFinder()

    /** Guard set to prevent reentrant destroy_p_proc calls on the same object. */
    private readonly _destroyingObjects: Set<Obj> = new Set()

    private ensurePathMatrix(): void {
        if (this.pathMatrix.length === HEX_GRID_SIZE) {
            return
        }

        this.pathMatrix = new Array(HEX_GRID_SIZE)
        for (let y = 0; y < HEX_GRID_SIZE; y++) {
            const row = new Array<number>(HEX_GRID_SIZE)
            row.fill(0)
            this.pathMatrix[y] = row
        }
    }

    getObjects(level?: number): Obj[] {
        return this.objects[level === undefined ? this.currentElevation : level]
    }

    getSpatials(level?: number): any[] {
        return this.spatials[level === undefined ? this.currentElevation : level]
    }

    getObjectsAndSpatials(level?: number): Obj[] {
        return this.getObjects().concat(this.getSpatials())
    }

    addObject(obj: Obj, level?: number): void {
        this.objects[level === undefined ? this.currentElevation : level].push(obj)
    }

    removeObject(obj: Obj): void {
        // remove `obj` from the map
        // it would be pretty hard to remove it anywhere else without either
        // a walk of the object graph or a `parent` reference.
        //
        // so we're only going to remove it from the global object list, if present.

        // NOTE: We splice in-place during iteration.  This is safe because we
        // break out of both loops on first match, and any external callers
        // are expected to defer mid-iteration mutations via _destroyingObjects
        // (see destroyObject).  Reference equality (`===`) is used since
        // each Obj is unique within the world.

        for (let level = 0; level < this.numLevels; level++) {
            const objects = this.objects[level]
            for (let i = 0; i < objects.length; i++) {
                if (objects[i] === obj) {
                    console.log('removeObject: destroying index %d (%o/%o)', i, obj, objects[i])
                    this.objects[level].splice(i, 1)
                    return
                }
            }
        }

        console.log("removeObject: couldn't find object on map")
        console.trace()
    }

    destroyObject(obj: Obj): void {
        // Notify the object's script via destroy_p_proc before removing it from
        // the map so that scripted death / cleanup logic fires correctly.
        // Guard against reentrant destroy calls (e.g. if destroy_p_proc itself
        // calls destroy_object on the same object).
        if (!this._destroyingObjects.has(obj)) {
            this._destroyingObjects.add(obj)
            try {
                Scripting.destroy(obj)
            } finally {
                this._destroyingObjects.delete(obj)
            }
        }
        this.removeObject(obj)
    }

    hasRoofAt(pos: Point, elevation?: number): boolean {
        if (elevation === undefined) {
            elevation = this.currentElevation
        }

        const tilePos = hexToTile(pos)
        return this.mapObj.levels[elevation].tiles.roof[tilePos.y][tilePos.x] !== 'grid000'
    }

    updateMap(): void {
        Scripting.updateMap(this.mapScript, this.getObjectsAndSpatials(), this.currentElevation)
    }

    changeElevation(level: number, updateScripts = false, isMapLoading = false) {
        const oldElevation = this.currentElevation
        this.currentElevation = level
        // NOTE: globalState.currentElevation is mirrored here for legacy
        // callers (lightmap.ts, render.ts).  A future refactor should
        // funnel those reads through GameMap.currentElevation instead.
        globalState.currentElevation = level
        this.floorMap = this.mapObj.levels[level].tiles.floor
        this.roofMap = this.mapObj.levels[level].tiles.roof
        //this.spatials = this.mapObj.levels[level]["spatials"]

        // If we're in combat, end it since we're moving off of that elevation
        if (globalState.inCombat) {
            globalState.combat.end()
        }

        globalState.player.clearAnim()

        // Remove player & party (unless we're loading a new map, in which case they're not present)
        // and place them on the new map
        for (const obj of globalState.gParty.getPartyMembersAndPlayer()) {
            if (!isMapLoading) {
                arrayRemove(this.objects[oldElevation], obj)
            }

            // Only add the member once, in case changeElevation is called multiple times
            if (this.objects[level].indexOf(obj) === -1) {
                this.objects[level].push(obj)
            }
        }

        this.placeParty()

        // set up renderer data
        globalState.renderer.initData(this.roofMap, this.floorMap, this.getObjects())

        if (updateScripts) {
            // NOTE: We fire updateMap for the whole map whenever the elevation
            // changes.  An active/inactive per-script flag would let us scope
            // this to scripts that care about the current elevation only.
            Scripting.updateMap(this.mapScript, this.getObjectsAndSpatials(), level)
        }

        // rebuild the lightmap
        if (Config.engine.doFloorLighting) {
            Lightmap.resetLight()
            Lightmap.rebuildLight()
        }

        centerCamera(globalState.player.position)

        Events.emit('elevationChanged', { elevation: level, oldElevation, isMapLoading })
    }

    placeParty() {
        // set up party members' positions
        globalState.gParty.getPartyMembers().forEach((obj: Critter) => {
            // attempt party member placement around player
            let placed = false
            for (let dist = 1; dist < 3; dist++) {
                for (let dir = 0; dir < 6; dir++) {
                    const pos = hexInDirectionDistance(globalState.player.position, dir, dist)
                    if (this.objectsAtPosition(pos).length === 0) {
                        obj.position = pos
                        console.log('placed %o @ %o', obj, pos)
                        placed = true
                        break
                    }
                }

                if (placed) {
                    break
                }
            }

            if (!placed) {
                console.log("couldn't place %o (player position: %o)", obj, globalState.player.position)
            }
        })
    }

    doEnterNewMap(isFirstRun: boolean): void {
        // Tell scripts they've entered the new map

        const objectsAndSpatials = this.getObjectsAndSpatials()
        const overridenStartPos = Scripting.enterMap(
            this.mapScript,
            objectsAndSpatials,
            this.currentElevation,
            this.mapID,
            isFirstRun
        )

        if (overridenStartPos) {
            // Starting position was overridden by map_enter_p_proc -- use the new one
            console.log('Starting position overriden to %o', overridenStartPos)
            globalState.player.position = overridenStartPos.position
            globalState.player.orientation = overridenStartPos.orientation
            this.currentElevation = globalState.currentElevation = overridenStartPos.elevation
        }

        // place party again, so if the map script overrided the start position we're in the right place
        this.placeParty()

        // Tell objects' scripts that they're now on the map.
        // Fires map_enter_p_proc on every object/spatial across all elevations —
        // FO2 only references the current elevation's scripts from updateMap, but
        // map_enter_p_proc itself runs unconditionally so multi-level maps get
        // notified on every object.
        this.objects.forEach((level) => level.forEach((obj) => obj.enterMap()))
        this.spatials.forEach((level) =>
            level.forEach((spatial) => Scripting.objectEnterMap(spatial as unknown as Obj, this.currentElevation, this.mapID))
        )

        Scripting.updateMap(this.mapScript, objectsAndSpatials, this.currentElevation)
    }

    loadMap(mapName: string, startingPosition?: Point, startingElevation = 0, loadedCallback?: () => void): void {
        if (this.name !== null) {
            Scripting.exitMap(this.mapScript, this.getObjectsAndSpatials(), this.currentElevation, this.mapID)
        }

        if (Config.engine.doSaveDirtyMaps && this.name !== null) {
            // if a map is already loaded, save it to the dirty map cache before loading
            console.log(`[Main] Serializing map ${this.name} and committing to dirty map cache`)
            globalState.dirtyMapCache[this.name] = this.serialize()
        }

        if (mapName in globalState.dirtyMapCache) {
            // Previously loaded; load from dirty map cache
            console.log(`[Main] Loading map ${mapName} from dirty map cache`)

            Events.emit('loadMapPre')

            const map = globalState.dirtyMapCache[mapName]
            this.deserialize(map)

            // Set position and orientation
            if (startingPosition !== undefined) {
                globalState.player.position = startingPosition
            }
            // Use default map starting position
            else {
                globalState.player.position = map.mapObj.startPosition
            }

            globalState.player.orientation = map.mapObj.startOrientation

            // Set elevation
            this.currentElevation = globalState.currentElevation = startingElevation

            // Change to our new elevation (sets up map state)
            this.changeElevation(this.currentElevation, false, true)

            // Enter map
            this.doEnterNewMap(false)

            // Change elevation again
            this.changeElevation(this.currentElevation, true, false)

            // Done
            console.log(`[Main] Loaded from dirty map cache`)
            loadedCallback && loadedCallback()

            Events.emit('loadMapPost')
        } else {
            console.log(`[Main] Loading map ${mapName} from clean load`)
            this.loadNewMap(mapName, startingPosition, startingElevation, loadedCallback)
        }
    }

    loadNewMap(mapName: string, startingPosition?: Point, startingElevation?: number, loadedCallback?: () => void) {
        function load(file: string, callback?: (x: HTMLImageElement) => void) {
            if (globalState.images[file] !== undefined) {
                return
            } // don't load more than once
            globalState.loadingAssetsTotal++
            heart.graphics.newImage(file + '.png', (r: HTMLImageElement) => {
                globalState.images[file] = r
                globalState.loadingAssetsLoaded++
                if (callback) {
                    callback(r)
                }
            })
        }

        this.name = mapName.toLowerCase()

        Events.emit('loadMapPre')

        globalState.isLoading = true
        globalState.loadingAssetsTotal = 1 // this will remain +1 until we load the map, preventing it from exiting early
        globalState.loadingAssetsLoaded = 0
        globalState.loadingLoadedCallback = loadedCallback || null

        // clear any previous objects/events
        this.objects = null
        this.mapScript = null
        Scripting.reset(this.name)

        // reset player animation status (to idle)
        globalState.player.clearAnim()

        console.log('loading map ' + mapName)

        const mapImages = getFileJSON('maps/' + mapName + '.images.json')
        for (let i = 0; i < mapImages.length; i++) {
            load(mapImages[i])
        }
        console.log('loading ' + mapImages.length + ' images')

        const map = getFileJSON('maps/' + mapName + '.json')
        this.mapObj = map
        this.mapID = map.mapID
        this.numLevels = map.levels.length

        let elevation = startingElevation !== undefined ? startingElevation : 0

        if (Config.engine.doLoadScripts) {
            Scripting.init(mapName)
            try {
                this.mapScript = Scripting.loadScript(mapName)
                Scripting.setMapScript(this.mapScript)
            } catch (e) {
                this.mapScript = null
                console.log('ERROR LOADING MAP SCRIPT:', e.message)
            }
        } else {
            this.mapScript = null
        }

        // warp to the default position (may be overridden by map script)
        globalState.player.position = startingPosition || map.startPosition
        globalState.player.orientation = map.startOrientation

        if (Config.engine.doSpatials) {
            this.spatials = map.levels.map((level: any) => level.spatials) as Spatial[][]

            if (Config.engine.doLoadScripts) {
                // initialize spatial scripts
                this.spatials.forEach((level) =>
                    level.forEach((spatial) => {
                        const script = Scripting.loadScript(spatial.script)
                        if (script === null) {
                            console.log('load script failed for spatial ' + spatial.script)
                        } else {
                            spatial._script = script
                            // no need to initialize here because spatials only use spatial_p_proc
                        }

                        spatial.isSpatial = true
                        spatial.position = fromTileNum(spatial.tileNum)
                    })
                )
            }
        }
        else {
            this.spatials = map.levels.map(() => [] as Spatial[])
        }

        // Load map objects. Note that these need to be loaded *after* the map so that object scripts
        // have access to the map script object.
        this.objects = new Array(map.levels.length)
        for (let level = 0; level < map.levels.length; level++) {
            this.objects[level] = map.levels[level].objects.map((obj: any) => objFromMapObject(obj))
        }

        // change to our new elevation (sets up map state)
        this.changeElevation(elevation, false, true)

        // NOTE: objectsAndSpatials is captured here so the scripting engine
        // has a stable view of "what's on the map" for the duration of
        // doEnterNewMap + the script-driven updateMap.  If we mutated
        // getObjectsAndSpatials() lazily (e.g. per-tick), the engine could
        // see new objects added mid-tick and miss a frame.  See
        // scripting.ts updateMap for the consumer.
        const objectsAndSpatials = this.getObjectsAndSpatials()

        if (Config.engine.doLoadScripts) {
            // party member NPCs get the new map script
            globalState.gParty.getPartyMembers().forEach((obj: Critter) => {
                obj._script._mapScript = this.mapScript
            })

            this.doEnterNewMap(true)
            elevation = this.currentElevation

            // change elevation with script updates
            this.changeElevation(this.currentElevation, true, true)
        }

        // map_enter_p_proc is intentionally NOT re-run on elevation changes —
        // it fires once when the map is first entered (via doEnterNewMap above).
        // Elevation changes only invoke map_update_p_proc on the map script.
        console.log(
            'loaded (' +
                map.levels.length +
                ' levels, ' +
                this.getObjects().length +
                ' objects on elevation ' +
                elevation +
                ')'
        )

        // load some testing art
        load('art/critters/hmjmpsat')
        load('hex_outline')

        globalState.loadingAssetsTotal-- // we should know all of the assets we need by now

        // clear audio and use the map music
        // BLK-103: Guard against null audioEngine — during test environments and
        // early browser init the audio subsystem has not been created yet.
        // Calling stopAll() / playMusic() on null throws a TypeError that would
        // abort map loading entirely.  Skip audio setup silently when unavailable.
        const curMapInfo = getCurrentMapInfo()
        if (globalState.audioEngine) {
            globalState.audioEngine.stopAll()
            if (curMapInfo && curMapInfo.music) {
                globalState.audioEngine.playMusic(curMapInfo.music)
            }
        }

        Events.emit('loadMapPost')
    }

    loadMapByID(mapID: number, startingPosition?: Point, startingElevation?: number): void {
        const mapName = lookupMapName(mapID)
        if (mapName !== null) {
            this.loadMap(mapName, startingPosition, startingElevation)
        } else {
            console.log("couldn't lookup map name for map ID " + mapID)
        }
    }

    objectsAtPosition(position: Point): Obj[] {
        // BLK-091: Guard against objects with null positions — objects in inventory
        // or mid-transition may have no tile; skip them to avoid a TypeError crash.
        return this.getObjects().filter((obj: Obj) => obj.position !== null && obj.position !== undefined && obj.position.x === position.x && obj.position.y === position.y)
    }

    critterAtPosition(position: Point): Critter | null {
        return (this.objectsAtPosition(position).find((obj) => obj.type === 'critter') as Critter) || null
    }

    /// Draws a line between a and b, returning the first object hit.
    /// A script-registered blocked tile (via tile_add_blocking) returns a
    /// well-typed sentinel Obj so callers that only check for null/truthy
    /// results work correctly; callers that inspect .type will see
    /// "__blocked_tile__" instead of undefined.
    private static readonly _blockedTileSentinel: Obj = (() => { const o = new Obj(); (o as any).type = '__blocked_tile__'; return o })()

    hexLinecast(a: Point, b: Point): Obj | null {
        let line = hexLine(a, b)
        if (line === null) {
            return null
        }
        line = line.slice(1, -1)
        const blockedTiles: Set<number> | undefined = (globalState as any).blockedTiles
        for (let i = 0; i < line.length; i++) {
            // check script-registered blocked tiles first
            if (blockedTiles?.has(toTileNum(line[i]))) {
                GameMap._blockedTileSentinel.position = line[i]
                return GameMap._blockedTileSentinel
            }
            // potential optimization: only check within a certain radius of `a`
            const obj = this.objectsAtPosition(line[i])
            if (obj.length !== 0) {
                return obj[0]
            }
        }
        return null
    }

    recalcPath(start: Point, goal: Point, isGoalBlocking?: boolean) {
        // BLK-119: Safe performance.now() fallback for non-browser environments.
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0

        this.ensurePathMatrix()
        const matrix = this.pathMatrix
        for (let y = 0; y < HEX_GRID_SIZE; y++) {
            matrix[y].fill(0)
        }

        for (const obj of this.getObjects()) {
            // BLK-092: Guard against objects with null positions — objects in inventory
            // or mid-transition may not have a tile assignment.  Skip them so the
            // pathfinding matrix doesn't crash on a null dereference.
            if (!obj.position) {continue}
            // if there are multiple, any blocking one will block
            matrix[obj.position.y][obj.position.x] |= <any>obj.blocks()
        }

        if (isGoalBlocking === false) {
            matrix[goal.y][goal.x] = 0
        }

        const grid = new PF.Grid(HEX_GRID_SIZE, HEX_GRID_SIZE, matrix)
        const path = this.pathFinder.findPath(start.x, start.y, goal.x, goal.y, grid)

        // BLK-119: Same safe fallback for the elapsed-time measurement.
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : 0) - t0
        this.pathfindingTelemetry.totalCalls++
        this.pathfindingTelemetry.totalTimeMs += elapsed
        this.pathfindingTelemetry.lastSolveTimeMs = elapsed
        if (elapsed > this.pathfindingTelemetry.worstCaseTimeMs) {
            this.pathfindingTelemetry.worstCaseTimeMs = elapsed
        }

        return path
    }

    serialize(): SerializedMap {
        return {
            name: this.name,
            mapID: this.mapID,
            numLevels: this.numLevels,
            mapObj: {
                levels: this.mapObj.levels.map((level: any) => ({ tiles: level.tiles })),
                startPosition: this.mapObj.startPosition,
                startOrientation: this.mapObj.startOrientation,
            },

            // roof/floor maps
            roofMap: this.roofMap,
            floorMap: this.floorMap,

            mapScript: this.mapScript ? this.mapScript._serialize() : null,
            objects: this.objects.map((level: Obj[]) => {
                const partyAndPlayer: Set<Obj> = new Set<Obj>(globalState.gParty
                    ? (globalState.gParty.getPartyMembersAndPlayer() as Obj[])
                    : (globalState.player ? [globalState.player] : []))
                return level.filter((obj) => !partyAndPlayer.has(obj)).map((obj) => obj.serialize())
            }),
            spatials: null, //this.spatials.map(level => level.map(spatial:> spatial.serialize()))
        }
    }

    deserialize(obj: SerializedMap): void {
        this.name = obj.name
        this.mapID = obj.mapID
        this.numLevels = obj.numLevels
        this.mapObj = obj.mapObj
        this.mapScript = obj.mapScript ? Scripting.deserializeScript(obj.mapScript) : null
        this.objects = obj.objects.map((level) => level.map((obj) => deserializeObj(obj)))
        // NOTE: spatials are not serialized in the save format (they're
        // re-loaded from MAP files on the next loadMap), so we re-init
        // them as empty arrays.  See serialize() above.
        this.spatials = [[], [], []]
        this.roofMap = obj.roofMap
        this.floorMap = obj.floorMap
        // NOTE: the current elevation is reset to 0 here; loadMap() will
        // call changeElevation() to the requested level right after.
        this.currentElevation = 0

        // NOTE: roofMap dimensioning and scripting-engine reset are
        // handled by loadMap() after this deserialize() returns.
    }
}
