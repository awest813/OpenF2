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

import { SkillSet, StatSet } from './char.js'
import { Events } from './events.js'
import { Point } from './geometry.js'
import globalState from './globalState.js'
import { Critter, createObjectWithPID, WeaponObj } from './object.js'
import { centerCamera } from './renderer.js'
import { fromTileNum } from './tile.js'
import { uiWorldMap } from './ui.js'

// Contains the Player class and relevant initialization logic

export class Player extends Critter {
    name = 'Player'

    isPlayer = true
    art = 'art/critters/hmjmpsaa'

    stats = new StatSet({ AGI: 8, INT: 8, STR: 8, CHA: 8, HP: 100 })
    skills = new SkillSet(undefined, undefined, 10) // Start off with 10 skill points

    teamNum = 0

    position = { x: 94, y: 109 }
    orientation = 3
    gender = 'male'
    leftHand = <WeaponObj>createObjectWithPID(9)

    xp: number = 0
    level: number = 1
    karma: number = 0

    /**
     * Player-character state flags (bitfield).
     *
     * Known bits:
     *   0 = LEVEL_UP_UNUSED  (legacy; not used at runtime)
     *   1 = LEVEL_UP2        (second level-up flag)
     *   2 = I_AM_EVIL        (evil-alignment karma flag)
     *   3 = SNK_MODE         (sneak mode — reduces NPC perception range)
     *
     * Set/cleared by pc_flag_on(flag) / pc_flag_off(flag) scripting calls.
     * Persisted in save schema v12+.
     */
    pcFlags: number = 0

    /**
     * Currently active weapon hand (BLK-034).
     *
     * 0 = primary hand (left UI weapon slot — `leftHand` in engine)
     * 1 = secondary hand (right UI weapon slot — `rightHand` in engine)
     *
     * Read by the sfall active_hand() opcode (0x8199) and by scripts that
     * need to know which weapon slot the player is currently using.
     * Updated when inventory-hand commands switch the active slot.
     * Persisted in save schema v13+.
     */
    activeHand: number = 0

    inventory = [createObjectWithPID(41).setAmount(1337)]

    lightRadius = 4
    lightIntensity = 65536

    toString() {
        return 'The Dude'
    }

    /*
    var obj = {position: {x: 94, y: 109}, orientation: 2, frame: 0, type: "critter",
                   art: "art/critters/hmjmpsaa", isPlayer: true, anim: "idle", lastFrameTime: 0,
                   path: null, animCallback: null,
                   leftHand: playerWeapon, rightHand: null, weapon: null, armor: null,
                   dead: false, name: "Player", gender: "male", inventory: [
                   {type: "misc", name: "Money", pid: 41, pidID: 41, amount: 1337, pro: {textID: 4100, extra: {cost: 1}, invFRM: 117440552}, invArt: 'art/inven/cap2'}
                   ], stats: null, skills: null, tempChanges: null}
    */

    move(position: Point, curIdx?: number, signalEvents: boolean = true): boolean {
        if (!super.move(position, curIdx, signalEvents)) return false

        if (signalEvents) Events.emit('playerMoved', position)

        // check if the player has entered an exit grid
        var objs = globalState.gMap.objectsAtPosition(this.position)
        for (var i = 0; i < objs.length; i++) {
            if (objs[i].type === 'misc' && objs[i].extra && objs[i].extra.exitMapID !== undefined) {
                // walking on an exit grid
                // todo: exit grids are likely multi-hex (maybe have a set?)
                var exitMapID = objs[i].extra.exitMapID
                var startingPosition = fromTileNum(objs[i].extra.startingPosition)
                var startingElevation = objs[i].extra.startingElevation
                this.clearAnim()

                if (startingPosition.x === -1 || startingPosition.y === -1 || exitMapID < 0) {
                    // world map
                    console.log('exit grid -> worldmap')
                    uiWorldMap()
                } else {
                    // another map
                    console.log(
                        'exit grid -> map ' +
                            exitMapID +
                            ' elevation ' +
                            startingElevation +
                            ' @ ' +
                            startingPosition.x +
                            ', ' +
                            startingPosition.y
                    )
                    if (exitMapID === globalState.gMap.mapID) {
                        // same map, different elevation
                        globalState.gMap.changeElevation(startingElevation, true)
                        globalState.player.move(startingPosition)
                        centerCamera(globalState.player.position)
                    } else globalState.gMap.loadMapByID(exitMapID, startingPosition, startingElevation)
                }

                return false
            }
        }

        return true
    }
}
