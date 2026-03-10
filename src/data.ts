/*
Copyright 2014-2017 darkf

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

import { getFileJSON, getFileText, parseIni } from './util.js'
import globalState from './globalState.js'
import { Point } from './geometry.js'
import { lookupInterfaceArt } from './pro.js'

const lstFiles: { [lsgFile: string]: string[] } = {}
let mapInfo: { [mapID: number]: MapInfo } | null = null
let elevatorInfo: { elevators: Elevator[] } | null = null

export interface AreaMap {
    // XXX: Why does using a number key break areas?
    [areaID: string]: Area
}

export interface Area {
    name: string
    id: number
    size: string
    state: boolean
    worldPosition: Point
    mapArt?: string
    labelArt?: string
    entrances: AreaEntrance[]
}

interface AreaEntrance {
    startState: string
    x: number
    y: number
    mapLookupName: string
    mapName: string
    elevation: number
    tileNum: number
    orientation: number
}

export interface MapInfo {
    name: string
    lookupName: string
    ambientSfx: [string, number][]
    music: string
    randomStartPoints: { elevation: number; tileNum: number }[]
}

export interface Elevator {
    buttons: { tileNum: number; mapID: number; level: number }[]
    buttonCount: number
    labels: number
    type: number
}

export function getElevator(type: number): Elevator {
    if (!elevatorInfo) {
        console.log('loading elevator info')
        elevatorInfo = getFileJSON('lut/elevators.json')
    }

    return elevatorInfo!.elevators[type]
}

function parseAreas(data: string): AreaMap {
    const areas = parseIni(data)
    const out: AreaMap = {}

    for (const _area in areas) {
        const area = areas[_area]
        const match = _area.match(/Area (\d+)/)
        if (match === null) {
            console.warn('city.txt: skipping section with invalid area name: ' + _area)
            continue
        }
        const areaID = parseInt(match[1])
        const worldPos = area.world_pos.split(',').map((x: string) => parseInt(x))

        const newArea: Area = {
            name: area.area_name,
            id: areaID,
            size: area.size.toLowerCase(),
            state: area.start_state.toLowerCase() === 'on',
            worldPosition: { x: worldPos[0], y: worldPos[1] },
            entrances: [],
        }

        // map/label art
        const mapArtIdx = parseInt(area.townmap_art_idx)
        const labelArtIdx = parseInt(area.townmap_label_art_idx)

        //console.log(mapArtIdx + " - " + labelArtIdx)

        if (mapArtIdx !== -1) {newArea.mapArt = lookupInterfaceArt(mapArtIdx)}
        if (labelArtIdx !== -1) {newArea.labelArt = lookupInterfaceArt(labelArtIdx)}

        // entrances
        for (const _key in area) {
            // entrance_N
            // e.g.: entrance_0=On,345,230,Destroyed Arroyo Bridge,-1,26719,0

            let s = _key.split('_')
            if (s[0] === 'entrance') {
                const entranceString = area[_key]
                s = entranceString.split(',')

                const mapLookupName = s[3].trim()
                const mapName = lookupMapNameFromLookup(mapLookupName)
                if (!mapName) {
                    console.warn('city.txt: area ' + areaID + ' entrance "' + mapLookupName + '" has no map — skipping entrance')
                    continue
                }

                const entrance = {
                    startState: s[0],
                    x: parseInt(s[1]),
                    y: parseInt(s[2]),
                    mapLookupName,
                    mapName,
                    elevation: parseInt(s[4]),
                    tileNum: parseInt(s[5]),
                    orientation: parseInt(s[6]),
                }
                newArea.entrances.push(entrance)
            }
        }

        out[areaID] = newArea
    }

    return out
}

function areaContainingMap(mapName: string) {
    if (!globalState.mapAreas) {
        console.warn('areaContainingMap: globalState.mapAreas not loaded — returning null')
        return null
    }
    for (const area in globalState.mapAreas) {
        const entrances = globalState.mapAreas[area].entrances
        for (let i = 0; i < entrances.length; i++) {
            if (entrances[i].mapName === mapName) {return globalState.mapAreas[area]}
        }
    }
    return null
}

export function loadAreas() {
    return parseAreas(getFileText('data/data/city.txt'))
}

function allAreas() {
    if (globalState.mapAreas === null) {globalState.mapAreas = loadAreas()}
    const areas = []
    for (const area in globalState.mapAreas) {areas.push(globalState.mapAreas[area])}
    return areas
}

export function loadMessage(name: string) {
    name = name.toLowerCase()
    const msg = getFileText('data/text/english/game/' + name + '.msg')
    if (globalState.messageFiles[name] === undefined) {globalState.messageFiles[name] = {}}

    // parse message file
    const lines = msg.split(/\r|\n/)

    // preprocess and merge lines
    for (var i = 0; i < lines.length; i++) {
        // comments/blanks
        if (lines[i][0] === '#' || lines[i].trim() === '') {
            lines.splice(i--, 1)
            continue
        }

        // probably a continuation -- merge it with the last line
        if (lines[i][0] !== '{') {
            lines[i - 1] += lines[i]
            lines.splice(i--, 1)
            continue
        }
    }

    for (var i = 0; i < lines.length; i++) {
        // e.g. {100}{}{You have entered a dark cave in the side of a mountain.}
        const m = lines[i].match(/\{(\d+)\}\{.*\}\{(.*)\}/)
        if (m === null) {
            console.warn('message parsing: skipping invalid line: ' + lines[i])
            continue
        }
        // HACK: replace unicode replacement character with an apostrophe (because the Web sucks at character encodings)
        globalState.messageFiles[name][m[1]] = m[2].replace(/\ufffd/g, "'")
    }
}

function loadLst(lst: string): string[] {
    return getFileText('data/' + lst + '.lst').split('\n')
}

export function getLstId(lst: string, id: number): string | null {
    if (lstFiles[lst] === undefined) {lstFiles[lst] = loadLst(lst)}
    if (lstFiles[lst] === undefined) {return null}

    return lstFiles[lst][id]
}

export function lookupScriptName(scriptID: number): string | null {
    console.log('SID: ' + scriptID)
    const lookupName = getLstId('scripts/scripts', scriptID - 1)
    if (lookupName === null) {
        console.warn('lookupScriptName: no entry for script ID ' + scriptID + ' — returning null')
        return null
    }
    return lookupName.split('.')[0].toLowerCase()
}

// Map info (data/data/maps.txt)

function parseMapInfo() {
    if (mapInfo !== null) {return}

    // parse map info from data/data/maps.txt
    mapInfo = {}
    const text = getFileText('data/data/maps.txt')
    const ini = parseIni(text)
    for (const category in ini) {
        const m = category.match(/Map (\d+)/)
        if (!m) {
            console.warn('maps.txt: skipping section with invalid category: ' + category)
            continue
        }

        let id: string | number = m[1]
        if (id === null) {
            console.warn('maps.txt: skipping section with null ID in category: ' + category)
            continue
        }
        id = parseInt(id)

        const randomStartPoints = []
        for (const key in ini[category]) {
            if (key.indexOf('random_start_point_') === 0) {
                const startPoint = ini[category][key].match(/elev:(\d), tile_num:(\d+)/)
                if (startPoint === null) {
                    console.warn('maps.txt: skipping invalid random_start_point: ' + ini[category][key])
                    continue
                }
                randomStartPoints.push({ elevation: parseInt(startPoint[1]), tileNum: parseInt(startPoint[2]) })
            }
        }

        // parse ambient sfx list
        const ambientSfx: [string, number][] = []
        const ambient_sfx = ini[category].ambient_sfx
        if (ambient_sfx) {
            const s = ambient_sfx.split(',')
            for (let i = 0; i < s.length; i++) {
                const kv = s[i].trim().split(':')
                ambientSfx.push([kv[0].toLowerCase(), parseInt(kv[1].toLowerCase())])
            }
        }

        mapInfo[id] = {
            name: ini[category].map_name,
            lookupName: ini[category].lookup_name,
            ambientSfx: ambientSfx,
            music: (ini[category].music || '').trim().toLowerCase(),
            randomStartPoints: randomStartPoints,
        }
    }
}

export function lookupMapFromLookup(lookupName: string) {
    if (mapInfo === null) {parseMapInfo()}

    for (const mapID in mapInfo!) {
        if (mapInfo![mapID].lookupName === lookupName) {return mapInfo![mapID]}
    }
    return null
}

export function lookupMapNameFromLookup(lookupName: string) {
    if (mapInfo === null) {parseMapInfo()}

    for (const mapID in mapInfo!) {
        if (mapInfo![mapID].lookupName.toLowerCase() === lookupName.toLowerCase()) {return mapInfo![mapID].name}
    }
    return null
}

export function lookupMapName(mapID: number): string | null {
    if (mapInfo === null) {parseMapInfo()}

    return mapInfo![mapID].name || null
}

function getMapInfo(mapName: string) {
    if (mapInfo === null) {parseMapInfo()}

    for (const mapID in mapInfo!) {
        if (mapInfo![mapID].name.toLowerCase() === mapName.toLowerCase()) {return mapInfo![mapID]}
    }
    return null
}

export function getCurrentMapInfo() {
    return getMapInfo(globalState.gMap.name)
}
