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

Scripting system/engine for DarkFO
*/

import { Combat } from './combat.js'
import { critterDamage, critterKill } from './critter.js'
import { lookupScriptName } from './data.js'
import {
    hexDirectionTo,
    hexDistance,
    hexInDirection,
    hexInDirectionDistance,
    hexNearestNeighbor,
    Point,
    tile_in_tile_rect,
} from './geometry.js'
import globalState from './globalState.js'
import { parseIntFile } from './intfile.js'
import { Critter, createObjectWithPID, Obj, objectGetDamageType } from './object.js'
import { Player } from './player.js'
import { makePID, loadPRO } from './pro.js'
import { centerCamera, objectOnScreen } from './renderer.js'
import { fromTileNum, toTileNum } from './tile.js'
import { uiAddDialogueOption, uiBarterMode, uiEndDialogue, uiLog, uiSetDialogueReply, uiStartDialogue } from './ui.js'
import { BinaryReader, getFileBinarySync, getFileText, getRandomInt } from './util.js'
import { rollSkillCheck, RollResult, toRollResult, rollResultIsSuccess, rollResultIsCritical } from './skillCheck.js'
import { ScriptVM } from './vm.js'
import { ScriptVMBridge } from './vm_bridge.js'
import { Config } from './config.js'
import { getSfallGlobal, setSfallGlobal, getSfallGlobalInt, setSfallGlobalInt, SFALL_VER, resetSfallGlobals } from './sfallGlobals.js'
import { recordStubHit } from './scriptingChecklist.js'

export module Scripting {
    let useElevatorHandler: () => void = () => {}

    export function setUseElevatorHandler(handler: () => void): void {
        useElevatorHandler = handler
    }

    export interface ScriptDebuggerSink {
        setVMInfo(stepCount: number, currentProcedure: string | null): void
        pushMessage(msg: string): void
    }

    var gameObjects: Obj[] | null = null
    var mapVars: any = null
    var globalVars: any = {
        0: 50, // GVAR_PLAYER_REPUTATION
        //10: 1, // GVAR_START_ARROYO_TRIAL (1 = TRIAL_FIGHT)
        531: 1, // GVAR_TALKED_TO_ELDER
        452: 2, // GVAR_DEN_VIC_KNOWN
        88: 0, // GVAR_VAULT_RAIDERS
        83: 2, // GVAR_VAULT_PLANT_STATUS (9 = PLANT_REPAIRED, 2 = PLANT_ACCEPTED_QUEST)
        616: 0, // GVAR_GECKO_FIND_WOODY (0 = WOODY_UNKNOWN)
        345: 16, // GVAR_NEW_RENO_FLAG_2 (16 = know_mordino_bit)
        357: 2, // GVAR_NEW_RENO_LIL_JESUS_REFERS (lil_jesus_refers_yes)
    }
    var currentMapID: number | null = null
    var currentMapObject: Script | null = null
    var mapFirstRun = true
    var scriptMessages: { [scriptName: string]: { [msgID: number]: string } } = {}
    var dialogueOptionProcs: (() => void)[] = [] // Maps dialogue options to handler callbacks
    var currentDialogueObject: Obj | null = null
    export var timeEventList: TimedEvent[] = []
    let overrideStartPos: StartPos | null = null
    let scriptDebuggerSink: ScriptDebuggerSink | null = null

    export function setScriptDebuggerSink(sink: ScriptDebuggerSink | null): void {
        scriptDebuggerSink = sink
    }

    function pushScriptDebuggerMessage(msg: string): void {
        scriptDebuggerSink?.pushMessage(msg)
    }

    function updateScriptDebuggerVMInfo(vm: ScriptVM): void {
        scriptDebuggerSink?.setVMInfo(vm.stepCount, vm.currentProcedureName ?? vm.lastProcedureName)
    }

    function trackScriptTrigger(script: Script, procName: string): void {
        pushScriptDebuggerMessage(`${script.scriptName}: ${procName}`)
    }

    function flushUnsupportedVMOperations(script: Script): void {
        const vm = script._vm
        if (!vm) return

        updateScriptDebuggerVMInfo(vm)
        const unsupportedOperations = vm.drainUnsupportedOperations()
        for (const op of unsupportedOperations) {
            const callerContext = op.topLevelCallerProcedureName ?? 'none'
            const currentProc = op.procedureName ?? 'none'
            if (op.bridgedProcedureName) {
                pushScriptDebuggerMessage(
                    `[missing bridge] ${op.scriptName}: ${op.bridgedProcedureName} (opcode=0x${op.opcode.toString(16)}, pc=0x${op.pc.toString(16)}, proc=${currentProc}, caller=${callerContext})`
                )
                continue
            }

            pushScriptDebuggerMessage(
                `[unknown opcode] ${op.scriptName}: 0x${op.opcode.toString(16)} @ 0x${op.pc.toString(16)} (proc=${currentProc}, caller=${callerContext})`
            )
        }
    }

    export interface StartPos {
        position: Point
        orientation: number
        elevation: number
    }

    export interface TimedEvent {
        obj: Obj | null
        ticks: number
        userdata: any
        fn: () => void
    }

    var statMap: { [stat: number]: string } = {
        // SPECIAL primaries (0–6)
        0: 'STR',
        1: 'PER',
        2: 'END',
        3: 'CHA',
        4: 'INT',
        5: 'AGI',
        6: 'LUK',
        // Derived combat stats (7–16)
        7: 'Max HP',
        8: 'AP',
        9: 'AC',
        10: 'Melee',    // Unarmed Damage (same as melee)
        11: 'Melee',    // Melee Damage
        12: 'Carry',    // Carry Weight
        13: 'Sequence',
        14: 'Healing Rate',
        15: 'Critical Chance',
        16: 'Better Criticals',
        // DT (Damage Threshold) stats (17–23)
        17: 'DT Normal',
        18: 'DT Laser',
        19: 'DT Fire',
        20: 'DT Plasma',
        21: 'DT Electrical',
        22: 'DT EMP',
        23: 'DT Explosive',
        // DR (Damage Resistance) stats (24–32)
        24: 'DR Normal',
        25: 'DR Laser',
        26: 'DR Fire',
        27: 'DR Plasma',
        28: 'DR Electrical',
        29: 'DR EMP',
        30: 'DR Explosive',
        31: 'DR Radiation',
        32: 'DR Poison',
        // Misc character stats (33–35)
        33: 'Age',
        // 34: Gender — handled separately in get_critter_stat
        35: 'HP',       // Current HP
    }

    var skillNumToName: { [num: number]: string } = {
        0: 'Small Guns',
        1: 'Big Guns',
        2: 'Energy Weapons',
        3: 'Unarmed',
        4: 'Melee Weapons',
        5: 'Throwing',
        6: 'First Aid',
        7: 'Doctor',
        8: 'Sneak',
        9: 'Lockpick',
        10: 'Steal',
        11: 'Traps',
        12: 'Science',
        13: 'Repair',
        14: 'Speech',
        15: 'Barter',
        16: 'Gambling',
        17: 'Outdoorsman',
    }

    type DebugLogShowType = keyof typeof Config.scripting.debugLogShowType

    function stub(name: string, args: IArguments, type?: DebugLogShowType) {
        if (Config.scripting.debugLogShowType.stub === false || Config.scripting.debugLogShowType[type] === false)
            return
        var a = ''
        for (var i = 0; i < args.length; i++)
            if (i === args.length - 1) a += args[i]
            else a += args[i] + ', '
        console.log('STUB: ' + name + ': ' + a)
        recordStubHit(name, a)
    }

    function log(name: string, args: IArguments, type?: DebugLogShowType) {
        if (Config.scripting.debugLogShowType.log === false || Config.scripting.debugLogShowType[type] === false) return
        var a = ''
        for (var i = 0; i < args.length; i++)
            if (i === args.length - 1) a += args[i]
            else a += args[i] + ', '
        console.log('log: ' + name + ': ' + a)
    }

    function warn(msg: string, type?: DebugLogShowType, script?: Script) {
        if (type !== undefined && Config.scripting.debugLogShowType[type] === false) return
        if (script && (script as any)._vm) console.log(`WARNING [${(script as any)._vm.intfile.name}]: ${msg}`)
        else console.log(`WARNING: ${msg}`)
    }

    export function info(msg: string, type?: DebugLogShowType, script?: Script) {
        if (type !== undefined && Config.scripting.debugLogShowType[type] === false) return
        if (script && (script as any)._vm) console.log(`INFO [${(script as any)._vm.intfile.name}]: ${msg}`)
        else console.log(`INFO: ${msg}`)
    }

    // http://stackoverflow.com/a/23304189/1958152
    function seed(s: number) {
        Math.random = () => {
            s = Math.sin(s) * 10000
            return s - Math.floor(s)
        }
    }

    export function getGlobalVar(gvar: number): any {
        return globalVars[gvar] !== undefined ? globalVars[gvar] : 0
    }

    export function getGlobalVars(): any {
        return globalVars
    }

    /**
     * Bulk-restore global script variables from a saved snapshot.
     *
     * Called during save-game load so that quest flags, faction state, and
     * world-event variables survive across sessions.  The incoming `vars`
     * map is *merged* (not replaced) so that any engine-default values
     * already present are preserved when the save was made before v5.
     */
    export function setGlobalVars(vars: Record<number, number>): void {
        for (const key of Object.keys(vars)) {
            globalVars[parseInt(key, 10)] = (vars as any)[key]
        }
    }

    /**
     * Return a deep copy of the current map-variable store.
     *
     * Keyed as `{ scriptName: { varIndex: value } }`.  Used by the save
     * system (v7+) to persist per-map script variables across sessions so that
     * things like "have all enemies been killed on this map" survive reloads.
     */
    export function getMapVars(): Record<string, Record<number, number>> {
        const out: Record<string, Record<number, number>> = {}
        if (mapVars) {
            for (const name of Object.keys(mapVars)) {
                out[name] = { ...mapVars[name] }
            }
        }
        return out
    }

    /**
     * Bulk-restore map variables from a saved snapshot.
     *
     * Called during save-game load.  The incoming map is *merged* into the
     * current mapVars so script-level defaults set during map entry are
     * not overwritten by missing keys from an old save.
     */
    export function setMapVars(vars: Record<string, Record<number, number>>): void {
        if (!mapVars) mapVars = {}
        for (const scriptName of Object.keys(vars)) {
            if (!mapVars[scriptName]) mapVars[scriptName] = {}
            for (const key of Object.keys(vars[scriptName])) {
                mapVars[scriptName][parseInt(key, 10)] = vars[scriptName][key as any]
            }
        }
    }

    function isGameObject(obj: any) {
        // TODO: just use isinstance Obj?
        if (obj === undefined || obj === null) return false
        if (obj.isPlayer === true) return true
        if (
            obj.type === 'item' ||
            obj.type === 'critter' ||
            obj.type === 'scenery' ||
            obj.type === 'wall' ||
            obj.type === 'tile' ||
            obj.type === 'misc'
        )
            return true

        //warn("is NOT GO: " + obj.toString())
        return false
    }

    function isSpatial(obj: any): boolean {
        if (!obj) return false
        return obj.isSpatial === true
    }

    function getScriptName(id: number): string | null {
        // return getLstId("scripts/scripts", id - 1).split(".")[0].toLowerCase()
        return lookupScriptName(id)
    }

    function getScriptMessage(id: number, msg: string | number) {
        if (typeof msg === 'string')
            // passed in a string message
            return msg

        var name = getScriptName(id)
        if (name === null) {
            warn('getScriptMessage: no script with ID ' + id)
            return null
        }

        if (scriptMessages[name] === undefined) loadMessageFile(name)
        if (scriptMessages[name] === undefined) {
            warn('getScriptMessage: message file failed to load for script ' + id + ' (' + name + ')')
            return null
        }
        if (scriptMessages[name][msg] === undefined) {
            warn('getScriptMessage: no message ' + msg + ' for script ' + id + ' (' + name + ')')
            return ''
        }

        return scriptMessages[name][msg]
    }

    export function dialogueReply(id: number): void {
        var f = dialogueOptionProcs[id]
        dialogueOptionProcs = []
        f()
        // by this point we may have already exited dialogue
        if (currentDialogueObject !== null && dialogueOptionProcs.length === 0) {
            // after running the option procedure we have no options...
            // so close the dialogue
            info('[dialogue exit via dialogueReply (no replies)]', 'dialogue')
            dialogueExit()
        }
    }

    export function dialogueEnd() {
        // dialogue exited from [Done] or the UI
        info('[dialogue exit via dialogueExit]', 'dialogue')
        dialogueExit()
    }

    function dialogueExit() {
        uiEndDialogue()
        info('[dialogue exit]')

        if (currentDialogueObject) {
            // resume from when we halted in gsay_end
            var vm = currentDialogueObject._script!._vm!
            vm.pc = vm.popAddr()
            info(`[resuming from gsay_end (pc=0x${vm.pc.toString(16)})]`)
            vm.run()
        }

        currentDialogueObject = null
    }

    function canSee(obj: Obj, target: Obj): boolean {
        const dir = Math.abs(obj.orientation - hexDirectionTo(obj.position, target.position))
        return [0, 1, 5].indexOf(dir) !== -1
    }

    // TODO: Thoroughly test these functions (dealing with critter LOS)
    function isWithinPerception(obj: Critter, target: Critter): boolean {
        const dist = hexDistance(obj.position, target.position)
        const perception = obj.getStat('PER')
        const sneakSkill = target.getSkill('Sneak')
        let reqDist

        // TODO: Implement all of the conditionals here

        if (canSee(obj, target)) {
            reqDist = perception * 5

            if (false /* some target flags & 2 */)
                // @ts-ignore: Unreachable code error (this isn't implemented yet)
                reqDist /= 2

            if (target === globalState.player) {
                if (false /* is_pc_sneak_working */) {
                    // @ts-ignore: Unreachable code error (this isn't implemented yet)
                    reqDist /= 4

                    if (sneakSkill > 120) reqDist--
                } else if (false /* is_sneaking */)
                    // @ts-ignore: Unreachable code error (this isn't implemented yet)
                    reqDist = (reqDist * 2) / 3
            }

            if (dist <= reqDist) return true
        }

        reqDist = globalState.inCombat ? perception * 2 : perception

        if (target === globalState.player) {
            if (false /* is_pc_sneak_working */) {
                // @ts-ignore: Unreachable code error (this isn't implemented yet)
                reqDist /= 4

                if (sneakSkill > 120) reqDist--
            } else if (false /* is_sneaking */)
                // @ts-ignore: Unreachable code error (this isn't implemented yet)
                reqDist = (reqDist * 2) / 3
        }

        return dist <= reqDist
    }

    function objCanSeeObj(obj: Critter, target: Obj): boolean {
        // Is target within obj's perception, or is it a non-critter object (without perception)?
        if (target.type !== 'critter' || isWithinPerception(obj, target as Critter)) {
            // Then, is anything blocking obj from drawing a straight line to target?
            const hit = globalState.gMap.hexLinecast(obj.position, target.position)
            return !hit
        }
        return false
    }

    export interface SerializedScript {
        name: string
        lvars: { [lvar: number]: any }
    }

    interface ScriptableObj {
        _script: Script
    }

    export class Script {
        // Stuff we hacked in
        _didOverride = false // Did the procedure call override the default action?
        _barterMod: number = 0 // One-time barter modifier set by gdialog_set_barter_mod

        scriptName!: string
        lvars!: { [lvar: number]: any }
        _vm?: ScriptVM
        _mapScript?: Script

        // Special built-in variables
        self_obj!: { _script: Script }
        self_tile!: number
        cur_map_index!: number | null
        fixed_param!: number
        source_obj!: Obj | 0
        target_obj!: Obj
        action_being_used!: number
        game_time_hour!: number

        combat_is_initialized!: 0 | 1
        game_time!: number

        // Script procedure prototypes
        start!: () => void

        map_enter_p_proc!: () => void
        map_exit_p_proc!: () => void
        map_update_p_proc!: () => void

        timed_event_p_proc!: () => void

        critter_p_proc!: () => void
        spatial_p_proc!: () => void

        use_p_proc!: () => void
        talk_p_proc!: () => void
        pickup_p_proc!: () => void
        look_at_p_proc!: () => void
        description_p_proc!: () => void

        combat_p_proc!: () => void
        damage_p_proc!: () => void
        destroy_p_proc!: () => void

        use_skill_on_p_proc!: () => void
        use_obj_on_p_proc!: () => void
        push_p_proc!: () => void
        is_dropping_p_proc!: () => void

        // Actual scripting engine API implementations

        set_global_var(gvar: number, value: any) {
            globalVars[gvar] = value
            // GVAR_0 = GVAR_PLAYER_REPUTATION is Fallout 2's canonical karma store.
            // Sync the reputation system so getKarma() and the UI stay consistent.
            if (gvar === 0 && globalState.reputation) {
                globalState.reputation.setKarma(typeof value === 'number' ? value : 0)
            }
            info('set_global_var: ' + gvar + ' = ' + value, 'gvars')
            log('set_global_var', arguments, 'gvars')
        }
        set_local_var(lvar: number, value: any) {
            this.lvars[lvar] = value
            info('set_local_var: ' + lvar + ' = ' + value + ' [' + this.scriptName + ']', 'lvars')
            log('set_local_var', arguments, 'lvars')
        }
        local_var(lvar: number) {
            log('local_var', arguments, 'lvars')
            if (this.lvars[lvar] === undefined) {
                warn('local_var: setting default value (0) for LVAR ' + lvar, 'lvars')
                this.lvars[lvar] = 0
            }
            return this.lvars[lvar]
        }
        map_var(mvar: number) {
            if (this._mapScript === undefined) {
                warn('map_var: no map script — returning 0 (mvar=' + mvar + ')', undefined, this)
                return 0
            }
            var scriptName = this._mapScript.scriptName
            if (scriptName === undefined) {
                warn('map_var: map script has no name — returning 0 (mvar=' + mvar + ')', undefined, this)
                return 0
            } else if (mapVars[scriptName] === undefined) mapVars[scriptName] = {}
            else if (mapVars[scriptName][mvar] === undefined) {
                warn('map_var: setting default value (0) for MVAR ' + mvar, 'mvars')
                mapVars[scriptName][mvar] = 0
            }
            return mapVars[scriptName][mvar]
        }
        set_map_var(mvar: number, value: any) {
            if (!this._mapScript) {
                // No map script is attached to this script instance — this can happen when
                // non-map scripts (e.g. critter scripts) call set_map_var.  Treat as a
                // no-op rather than throwing, to avoid crashing the browser runtime.
                warn('set_map_var: no map script — no-op (mvar=' + mvar + ', value=' + value + ')', undefined, this)
                return
            }
            var scriptName = this._mapScript.scriptName
            if (scriptName === undefined) {
                warn('map_var: map script has no name')
                return
            }
            info('set_map_var: ' + mvar + ' = ' + value, 'mvars')
            if (mapVars[scriptName] === undefined) mapVars[scriptName] = {}
            mapVars[scriptName][mvar] = value
        }
        global_var(gvar: number) {
            if (globalVars[gvar] === undefined) {
                warn('global_var: unknown gvar ' + gvar + ', using default (0)', 'gvars')
                globalVars[gvar] = 0
            }
            return globalVars[gvar]
        }
        random(min: number, max: number) {
            log('random', arguments)
            return getRandomInt(min, max)
        }
        abs_value(x: number): number {
            return Math.abs(x)
        }
        string_length(str: string): number {
            if (typeof str !== 'string') return 0
            return str.length
        }
        pow(base: number, exp: number): number {
            return Math.pow(base, exp)
        }
        obj_is_valid(obj: any): number {
            return isGameObject(obj) ? 1 : 0
        }
        debug_msg(msg: string) {
            log('debug_msg', arguments)
            info('DEBUG MSG: [' + this.scriptName + ']: ' + msg, 'debugMessage')
            pushScriptDebuggerMessage(`[debug] ${this.scriptName}: ${msg}`)
            if (this._vm) updateScriptDebuggerVMInfo(this._vm)
        }
        display_msg(msg: string) {
            log('display_msg', arguments)
            info('DISPLAY MSG: ' + msg, 'displayMessage')
            pushScriptDebuggerMessage(`[display] ${this.scriptName}: ${msg}`)
            if (this._vm) updateScriptDebuggerVMInfo(this._vm)
            uiLog(msg)
        }
        message_str(msgList: number, msgNum: number) {
            return getScriptMessage(msgList, msgNum)
        }
        metarule(id: number, target: number): any {
            switch (id) {
                case 14:
                    return mapFirstRun // map_first_run
                case 15: // elevator
                    // target === -1 is the canonical "no explicit type" call.
                    // Some scripts pass an explicit type constant; log and proceed
                    // rather than throwing so the elevator is still activated.
                    if (target !== -1) log('metarule(15): elevator called with explicit type ' + target + ' (ignored)', arguments)
                    useElevatorHandler()
                    break
                case 17:
                    // METARULE_IS_AREA_KNOWN: 1 if the area with ID `target` has been discovered
                    if (globalState.mapAreas && globalState.mapAreas[target] !== undefined) {
                        return globalState.mapAreas[target].state === true ? 1 : 0
                    }
                    return 0 // unknown area ID — treat as undiscovered
                case 18:
                    return 0 // is the critter under the influence of drugs? (TODO)
                case 21:
                    // METARULE_VENDOR_CAPS: return vendor's current available caps.
                    // Used by barter scripts to cap the amount the vendor will trade.
                    // Without a vendor inventory system, return a large default budget.
                    return 99999
                case 22:
                    return 0 // is_game_loading
                case 23:
                    // METARULE_RAND_RANGE: random integer in range.
                    // The full 2-arg metarule form doesn't carry both bounds; callers
                    // that need a bounded random should use the metarule3 variant.
                    // Return 0 as a safe placeholder so existing scripts don't throw.
                    return 0
                case 24:
                    // METARULE_PARTY_COUNT: return number of NPCs currently in the party
                    return globalState.gParty ? globalState.gParty.getPartyMembers().length : 0
                case 30: {
                    // METARULE_CHECK_WEAPON_LOADED: 1 if the weapon object has ammo loaded, 0 otherwise.
                    const wLoaded = isGameObject(target) ? ((target as any).extra?.ammoLoaded ?? 0) : 0
                    return wLoaded > 0 ? 1 : 0
                }
                case 35:
                    // METARULE_COMBAT_DIFFICULTY: 0=easy, 1=normal, 2=hard. Return normal.
                    return 1
                case 44:
                    // METARULE_WHO_ON_DRUGS: 1 if the critter is currently under drug influence.
                    // No drug system implemented; always return 0 (partial).
                    return 0
                case 46:
                    // METARULE_CURRENT_TOWN: return the current map/area ID as the town identifier
                    return currentMapID !== null ? currentMapID : 0
                case 47:
                    // METARULE_MAP_KNOWN: 1 if the world-map area with the given ID is discovered.
                    // Identical logic to case 17 but keyed by a numeric map ID argument.
                    if (globalState.mapAreas && globalState.mapAreas[target] !== undefined) {
                        return globalState.mapAreas[target].state === true ? 1 : 0
                    }
                    return 0
                case 48:
                    return 2 // METARULE_VIOLENCE_FILTER (2 = VLNCLVL_NORMAL)
                case 49: { // METARULE_W_DAMAGE_TYPE
                    // Map the damage-type string to the Fallout 2 DMG_* constants:
                    //   0=Normal, 1=Laser, 2=Fire, 3=Plasma, 4=Electrical, 5=EMP, 6=Explosion
                    const _dmgTypeMap: Record<string, number> = {
                        'Normal': 0,
                        'Laser': 1,
                        'Fire': 2,
                        'Plasma': 3,
                        'Electrical': 4,
                        'EMP': 5,
                        'Explosive': 6,
                        'explosion': 6,
                    }
                    const _dtype = objectGetDamageType(target)
                    const _mapped = _dmgTypeMap[_dtype]
                    if (_mapped !== undefined) return _mapped
                    warn('metarule(49): unrecognised damage type: ' + _dtype)
                    return 0 // fall back to Normal
                }
                case 55:
                    // METARULE_GAME_DIFFICULTY: 0=easy, 1=normal, 2=hard. Return normal.
                    return 1
                case 56:
                    return SFALL_VER // METARULE_SFALL_VER — sfall compatibility version
                // -----------------------------------------------------------------------
                // Additional metarule IDs — de-stubbed with safe defaults
                // -----------------------------------------------------------------------
                case 1:
                    // METARULE_SIGNAL_END_GAME: trigger end-game sequence for given reason.
                    // Browser build has no end-game cinematic pipeline; treat as no-op.
                    log('metarule', arguments)
                    return 0
                case 2:
                    // METARULE_TIMER_FIRED: 1 if the timed event for `target` has elapsed.
                    // Without a running timer-fired table, default to 0 (not fired).
                    return 0
                case 3:
                    // METARULE_FIRST_TIME / METARULE_MAKE_CRITTER_BARTER: context-dependent.
                    // Return 0 (not first time / barter not active) as safe placeholder.
                    return 0
                case 4:
                    // METARULE_RADIATION_GAUGE: current radiation gauge level (0–7).
                    // No radiation display panel in browser build; return 0.
                    return 0
                case 5:
                    // METARULE_MOVIE: play a game movie by ID.
                    // Browser build has no FMV pipeline; treat as no-op and return 0.
                    log('metarule(5/MOVIE)', arguments)
                    return 0
                case 6:
                    // METARULE_ARMOR_WORN: 1 if `target` is a critter wearing armor.
                    if (isGameObject(target) && (target as any).equippedArmor) return 1
                    return 0
                case 7:
                    // METARULE_CRITTER_IN_PARTY / METARULE_CRITTER_BARTER_INFO.
                    // Return 0 (not in party / no barter info) as safe default.
                    return globalState.gParty ? (globalState.gParty.getPartyMembers().includes(target as any) ? 1 : 0) : 0
                case 8:
                    // METARULE_CRITTER_ON_TEAM: 1 if two critters share a team number.
                    // `target` is not enough to encode two critters; return 0 (different teams).
                    return 0
                case 9:
                    // METARULE_CUR_TOWN / METARULE_CRITTER_STATUS: return current map ID.
                    // Matches metarule(46, 0) in most usage contexts.
                    return currentMapID !== null ? currentMapID : 0
                case 10:
                    // METARULE_TILE_LOCKED: 1 if the tile with the given tilenum is locked.
                    // No tile-lock tracking in browser build; return 0 (not locked).
                    return 0
                case 11:
                    // METARULE_MAP_INFO: return map info flags for the current map.
                    // Return 0 (no special flags) as a safe default.
                    return 0
                case 12:
                    // METARULE_CRITTER_REACTION: return the NPC critter's current reaction level
                    // toward the player.  Range 0–100; 50 = neutral.
                    return 50
                case 13:
                    // METARULE_CRITTER_REACTION_TO_PC: similar to case 12 but for direction
                    // toward the PC specifically.  Return 50 (neutral).
                    return 50
                case 16:
                    // METARULE_IS_BIG_GUN: 1 if `target` weapon is a big gun (skill area = big guns).
                    // Check proto flags2 bit for big-gun flag (0x0800 in Fallout 2).
                    if (!isGameObject(target)) return 0
                    return ((target as any).extra?.flags2 ?? (target as any).flags2 ?? 0) & 0x0800 ? 1 : 0
                case 19:
                    // METARULE_PARTY_MEMBER_FOLLOW: 1 if the party-member critter is following.
                    // No follow-mode state tracked; return 0.
                    return 0
                case 20:
                    // METARULE_IS_BIG_GUN_EQUIPPED: 1 if the player currently wields a big gun.
                    if (!globalState.player) return 0
                    {
                        const wep = (globalState.player as any).rightHand ?? (globalState.player as any).leftHand
                        if (!wep) return 0
                        return ((wep as any).extra?.flags2 ?? (wep as any).flags2 ?? 0) & 0x0800 ? 1 : 0
                    }
                case 25:
                    // METARULE_PARTY_MEMBER_STATE: return the state flags of a party-member critter.
                    // No per-member state machine; return 0 (normal / no special state).
                    return 0
                case 26:
                    // METARULE_CRITICAL_HIT_ADJUST: return critical-hit table adjustment for critter.
                    // No per-critter critical table override; return 0 (standard table).
                    return 0
                case 27:
                    // METARULE_HOSTILE_TO_PC: 1 if the critter is currently hostile to the player.
                    if (!isGameObject(target)) return 0
                    return (target as any).hostile ? 1 : 0
                case 28:
                    // METARULE_CRITTER_STATE: return state-flags bitfield for the critter.
                    // Dead=1; alive=0.  Prone state not tracked separately yet.
                    if (!isGameObject(target)) return 0
                    return (target as any).dead ? 1 : 0
                case 29:
                    // METARULE_AREA_REACHABLE: 1 if the world-map area with ID `target` is
                    // reachable from the current position.  Always return 1 (partial).
                    return 1
                case 31:
                    // METARULE_CRITTER_FLEEING: 1 if the critter is currently fleeing.
                    if (!isGameObject(target)) return 0
                    return (target as any).isFleeing ? 1 : 0
                case 32:
                    // METARULE_CRITTER_LEVEL: return the critter's effective level.
                    // For the player, returns player.level; for NPCs return 1 as safe default.
                    if (!isGameObject(target)) return 1
                    return (target as any).level ?? 1
                case 33:
                    // METARULE_PLAYER_ALIVE: 1 if the player is alive.
                    return globalState.player && !globalState.player.dead ? 1 : 0
                case 34:
                    // METARULE_COMBAT_MODE: 1 if combat is active.
                    return globalState.inCombat ? 1 : 0
                case 36:
                    // METARULE_CRITTER_KNOCKED_OUT: 1 if critter is knocked out.
                    if (!isGameObject(target)) return 0
                    return (target as any).knockedOut ? 1 : 0
                case 37:
                    // METARULE_CRITTER_KNOCKED_DOWN: 1 if critter is knocked down.
                    if (!isGameObject(target)) return 0
                    return (target as any).knockedDown ? 1 : 0
                case 38:
                    // METARULE_CRITTER_STUNNED: 1 if critter is stunned.
                    if (!isGameObject(target)) return 0
                    return (target as any).stunned ? 1 : 0
                case 39:
                    // METARULE_CRITTER_ON_FIRE: 1 if critter is on fire.
                    if (!isGameObject(target)) return 0
                    return (target as any).onFire ? 1 : 0
                case 40:
                    // METARULE_CRITTER_CRIPPLED_LEFT_LEG: 1 if critter's left leg is crippled.
                    if (!isGameObject(target)) return 0
                    return (target as any).crippledLeftLeg ? 1 : 0
                case 41:
                    // METARULE_CRITTER_CRIPPLED_RIGHT_LEG: 1 if critter's right leg is crippled.
                    if (!isGameObject(target)) return 0
                    return (target as any).crippledRightLeg ? 1 : 0
                case 42:
                    // METARULE_CRITTER_CRIPPLED_LEFT_ARM: 1 if critter's left arm is crippled.
                    if (!isGameObject(target)) return 0
                    return (target as any).crippledLeftArm ? 1 : 0
                case 43:
                    // METARULE_CRITTER_CRIPPLED_RIGHT_ARM: 1 if critter's right arm is crippled.
                    if (!isGameObject(target)) return 0
                    return (target as any).crippledRightArm ? 1 : 0
                case 45:
                    // METARULE_CRITTER_BLINDED: 1 if critter is blinded.
                    if (!isGameObject(target)) return 0
                    return (target as any).blinded ? 1 : 0
                case 50:
                    // METARULE_CRITTERS_ENTER_REALSPACE: trigger critters to re-enter real-space
                    // after a scripted encounter.  No-op in browser build; return 0.
                    log('metarule(50/CRITTERS_ENTER_REALSPACE)', arguments)
                    return 0
                case 51:
                    // METARULE_GET_BASE_TOHIT: return base to-hit chance for the current attack.
                    // No persistent attack context; return 50 (50% base).
                    return 50
                case 52:
                    // METARULE_TILE_ACCESSIBILITY: 1 if tile is accessible to the given critter.
                    return 1
                case 53:
                    // METARULE_HAVE_DRUG: 1 if the critter (target) has any drug item in its
                    // inventory.  A "drug" item has subtype === 2 in the PRO sub-type table
                    // (0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key).
                    if (!isGameObject(target)) return 0
                    return (target as any).inventory?.some(
                        (inv: any) => inv.subtype === 'drug' || (inv.pro?.extra?.subType === 2)
                    ) ? 1 : 0
                case 54:
                    // METARULE_WEAPON_IS_SUITABLE: 1 if a weapon is suitable for use.
                    // Return 1 (always suitable) as a safe default.
                    return 1
                default:
                    // Unknown metarule IDs above the defined range — log silently
                    // and return 0 rather than emitting a stub hit that floods the
                    // console during normal gameplay.  This covers sfall-specific
                    // extensions and future vanilla IDs not yet mapped.
                    log('metarule (unknown id=' + id + ')', arguments)
                    break
            }
            // Default return for any case that uses break instead of return
            // (e.g. elevator case 15, unknown id) — ensures VM stack gets a
            // valid number rather than undefined.
            return 0
        }
        metarule3(id: number, obj: any, userdata: any, radius: number): any {
            if (id < 100) {
                // metarule3 IDs below 100 are not defined in vanilla Fallout 2.
                // Return 0 silently so scripts probing future or sfall-specific
                // extensions do not crash or flood the console.
                log('metarule3 (unknown id<100, id=' + id + ')', arguments)
                return 0
            } else if (id === 100) {
                // METARULE3_CLR_FIXED_TIMED_EVENTS
                for (var i = 0; i < timeEventList.length; i++) {
                    if (timeEventList[i].obj === obj && timeEventList[i].userdata === userdata) {
                        // todo: game object equals
                        info('removing timed event (userdata ' + userdata + ')', 'timer')
                        timeEventList.splice(i, 1)
                        return 0
                    }
                }
                return 0 // no matching event found — still return 0 cleanly
            } else if (id === 101) {
                // METARULE3_RAND: random integer in range [obj..userdata] (inclusive).
                // Used by many encounter scripts for randomised script behaviour.
                const min = typeof obj === 'number' ? obj : 0
                const max = typeof userdata === 'number' ? userdata : 0
                return getRandomInt(min, max)
            } else if (id === 106) {
                // METARULE3_TILE_GET_NEXT_CRITTER
                // As far as I know, with lastCritter == 0, it just grabs the critter that is not the player at the tile. TODO: Test this!
                // TODO: use elevation
                var tile = obj,
                    elevation = userdata,
                    lastCritter = radius
                var objs = globalState.gMap.objectsAtPosition(fromTileNum(tile))
                log('metarule3 106 (tile_get_next_critter)', arguments)
                for (var i = 0; i < objs.length; i++) {
                    if (objs[i].type === 'critter' && !(<Critter>objs[i]).isPlayer) return objs[i]
                }
                return 0 // no critter found at that position (TODO: test)
            } else if (id === 102) {
                // METARULE3_CHECK_WALKING_ALLOWED: 1 if movement is permitted at the given tile.
                // No path-blocking registry in the script VM context; always return 1 (partial).
                return 1
            } else if (id === 103) {
                // METARULE3_CRITTER_IN_COMBAT: 1 if the given critter is currently in combat.
                if (!isGameObject(obj) || obj.type !== 'critter') return 0
                if (!globalState.inCombat) return 0

                // Prefer explicit membership in the active combat roster when available.
                // Fall back to the global combat flag for compatibility with contexts that
                // do not expose globalState.combat (legacy scripted checks).
                const active = globalState.combat?.combatants
                if (!active) return 1
                return active.includes(obj as Critter) ? 1 : 0
            } else if (id === 104) {
                // METARULE3_TILE_LINE_OF_SIGHT: 1 if there is line-of-sight between two tiles.
                // A full LOS raycasting system is not yet implemented; approximate by distance:
                // tiles within 14 hexes of each other are considered in line-of-sight.
                const tileA = typeof obj === 'number' ? fromTileNum(obj) : null
                const tileB = typeof userdata === 'number' ? fromTileNum(userdata) : null
                if (!tileA || !tileB) {
                    warn('metarule3(104): invalid tile argument — defaulting to visible (1)')
                    return 1
                }
                return hexDistance(tileA, tileB) <= 14 ? 1 : 0
            } else if (id === 105) {
                // METARULE3_OBJ_CAN_HEAR_OBJ: alias for obj_can_hear_obj; 1 if obj can hear target.
                // obj = source object (first arg), userdata = target object.
                const src = obj
                const tgt = userdata
                if (!isGameObject(src) || !isGameObject(tgt)) return 0
                return hexDistance(src.position, tgt.position) <= 12 ? 1 : 0
            } else if (id === 107) {
                // METARULE3_TILE_VISIBLE: returns 1 if the given tile is currently visible.
                // No fog-of-war system implemented yet; always return 1 (partial).
                log('metarule3 107 (tile_visible)', arguments, 'tiles')
                return 1
            } else if (id === 108) {
                // METARULE3_CRITTER_DIST: distance in hexes between two critters (obj, userdata).
                // Returns 0 if either argument is not a valid game object.
                if (!isGameObject(obj) || !isGameObject(userdata)) return 0
                return hexDistance(obj.position, userdata.position)
            } else if (id === 109) {
                // METARULE3_TILE_DIST: distance in hexes between two tile numbers.
                const tileA = typeof obj === 'number' ? fromTileNum(obj) : null
                const tileB = typeof userdata === 'number' ? fromTileNum(userdata) : null
                if (!tileA || !tileB) return 0
                return hexDistance(tileA, tileB)
            } else if (id === 110) {
                // METARULE3_CRITTER_TILE: tile number of the given critter.
                if (!isGameObject(obj)) return -1
                return toTileNum(obj.position)
            } else if (id === 111) {
                // METARULE3_OBJ_IS_CRITTER_DEAD: 1 if the given critter is dead.
                if (!isGameObject(obj) || obj.type !== 'critter') return 0
                return (obj as Critter).dead ? 1 : 0
            } else if (id === 112) {
                // METARULE3_CRITTER_INVEN_OBJ2: return the item at the given inventory slot
                // of the given critter (obj=critter, userdata=slot index).
                if (!isGameObject(obj) || obj.type !== 'critter') return null
                const slotIdx = typeof userdata === 'number' ? userdata : 0
                const inv = (obj as Critter).inventory
                if (!inv || slotIdx < 0 || slotIdx >= inv.length) return null
                return inv[slotIdx]
            } else if (id >= 113 && id <= 115) {
                // METARULE3 IDs 113–115 — unspecified; return 0 as a safe default.
                log('metarule3 ' + id + ' (safe default 0)', arguments)
                return 0
            } else {
                // Unrecognised metarule3 IDs above 115 — return 0 silently so that
                // scripts using future or sfall-specific extensions do not crash.
                log('metarule3 ' + id + ' (unknown id — safe default 0)', arguments)
                return 0
            }
        }
        script_overrides() {
            log('script_overrides', arguments)
            info('[SCRIPT OVERRIDES]')
            this._didOverride = true
        }

        // player
        give_exp_points(xp: number) {
            const player = globalState.player
            if (!player) return
            player.xp += xp
            uiLog('You gain ' + xp + ' experience points.')
            // Check for level-up: level N requires N*(N-1)/2 * 1000 XP
            while (player.xp >= (player.level * (player.level + 1) / 2) * 1000) {
                player.level++
                uiLog('You have reached experience level ' + player.level + '.')
            }
        }

        // critters
        get_critter_stat(obj: Critter, stat: number) {
            if (stat === 34) {
                // STAT_gender
                if (obj.isPlayer) return (<Player>obj).gender === 'female' ? 1 : 0
                return 0 // Default to male
            }
            var namedStat = statMap[stat]
            if (namedStat !== undefined) return obj.getStat(namedStat)
            // Unknown stat number — return 0 gracefully rather than emitting a stub
            // hit that floods the console when scripts probe optional stat IDs.
            warn('get_critter_stat: unknown stat ' + stat + ' — returning 0', undefined, this)
            return 0
        }
        set_critter_stat(obj: Obj, stat: number, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_stat: not a critter: ' + obj, undefined, this)
                return -1
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('set_critter_stat: unknown stat number: ' + stat, undefined, this)
                return -1
            }
            ;(obj as Critter).stats.setBase(statName, amount)
            return 0
        }
        has_trait(traitType: number, obj: Obj, trait: number) {
            if (!isGameObject(obj)) {
                warn('has_trait: not game object: ' + obj, undefined, this)
                return 0
            }

            if (traitType === 0) {
                // TRAIT_PERK — return the critter's perk rank for this perk ID
                if (obj.type !== 'critter') return 0
                return (obj as Critter).perkRanks[trait] ?? 0
            }

            if (traitType === 1) {
                // TRAIT_OBJECT
                switch (trait) {
                    case 0:
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).equippedArmor ? 1 : 0 // INVEN_TYPE_WORN
                    case 1: // INVEN_TYPE_RIGHT_HAND — 1 if critter has a right-hand item equipped
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).rightHand ? 1 : 0
                    case 2: // INVEN_TYPE_LEFT_HAND — 1 if critter has a left-hand item equipped
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).leftHand ? 1 : 0
                    case 3: // INVEN_TYPE_INV_COUNT — total number of items in inventory
                        return obj.inventory ? obj.inventory.length : 0
                    case 4: // OBJECT_TYPE — generic object type code (0=item, 1=critter, 2=scenery, 3=wall)
                        if (obj.type === 'critter') return 1
                        if (obj.type === 'scenery') return 2
                        if (obj.type === 'wall') return 3
                        return 0
                    case 5:
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).aiNum // OBJECT_AI_PACKET
                    case 6:
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).teamNum // OBJECT_TEAM_NUM
                    case 7: // OBJECT_LOCKED — 1 if the object is locked
                        return obj.locked ? 1 : 0
                    case 8: // OBJECT_OPEN — 1 if the object is open
                        return obj.open ? 1 : 0
                    case 9: // OBJECT_PID — prototype ID of the object
                        return obj.pid ?? 0
                    case 10:
                        return obj.orientation // OBJECT_CUR_ROT
                    case 11: // OBJECT_SID — script ID of the object (0 if unscripted)
                        return (obj as any)._sid ?? 0
                    case 666: // OBJECT_VISIBILITY
                        return obj.visible === false ? 0 : 1 // 1 = visible, 0 = invisible
                    case 667: // OBJECT_IS_FLAT — 1 if object is flat (rendered below critters)
                        return (obj as any).extra?.isFlat ? 1 : 0
                    case 668: // OBJECT_NO_BLOCK — 1 if object does not block movement
                        return (obj as any).extra?.noBlock ? 1 : 0
                    case 669: // OBJECT_CUR_WEIGHT — total carried weight in lbs
                        if (obj.type !== 'critter') return 0
                        return (obj as Critter).stats.getBase('Carry')
                    default:
                        // Unknown TRAIT_OBJECT sub-case — return 0 silently so scripts
                        // that probe optional object attributes do not crash.
                        log('has_trait(TRAIT_OBJECT,' + trait + '): unknown sub-case — returning 0', arguments)
                        return 0
                }
            }

            if (traitType === 2) {
                // TRAIT_CHAR — check if the critter has the given character-creation trait.
                // Fallout 2 trait IDs 0–15 correspond to the 16 creation-time mutations
                // (Fast Metabolism, Bruiser, Small Frame, etc.).  We store these in the
                // `charTraits` Set on the Critter instance.
                if (obj.type !== 'critter') return 0
                return (obj as Critter).charTraits.has(trait) ? 1 : 0
            }

            // Unknown traitType — return 0 silently rather than stubbing so that
            // scripts probing unusual trait categories do not produce console noise.
            log('has_trait: unknown traitType ' + traitType + ' — returning 0', arguments)
            return 0
        }
        critter_add_trait(obj: Obj, traitType: number, trait: number, amount: number) {
            if (!isGameObject(obj)) {
                warn('critter_add_trait: not game object: ' + obj, undefined, this)
                return
            }

            if (obj.type !== 'critter') {
                warn('critter_add_trait: not a critter: ' + obj, undefined, this)
                return
            }

            if (traitType === 0) {
                // TRAIT_PERK — set the perk rank for this perk ID
                ;(obj as Critter).perkRanks[trait] = Math.max(0, amount)
                return
            }

            if (traitType === 1) {
                // TRAIT_OBJECT
                switch (trait) {
                    case 5: // OBJECT_AI_PACKET
                        info('Setting critter AI packet to ' + amount, undefined, this)
                        ;(<Critter>obj).aiNum = amount
                        return
                    case 6: // OBJECT_TEAM_NUM
                        info('Setting critter team to ' + amount, undefined, this)
                        ;(<Critter>obj).teamNum = amount
                        return
                    case 7: // OBJECT_LOCKED — set locked state
                        obj.locked = amount !== 0
                        return
                    case 8: // OBJECT_OPEN — set open state
                        obj.open = amount !== 0
                        return
                    case 10: // OBJECT_CUR_ROT
                        obj.orientation = ((amount % 6) + 6) % 6
                        return
                    case 666: // OBJECT_VISIBILITY
                        obj.visible = amount !== 0
                        return
                    case 667: // OBJECT_IS_FLAT — mark object as flat (rendered below critters)
                        if (!(obj as any).extra) (obj as any).extra = {}
                        ;(obj as any).extra.isFlat = amount !== 0
                        return
                    case 668: // OBJECT_NO_BLOCK — mark object as non-blocking for movement
                        if (!(obj as any).extra) (obj as any).extra = {}
                        ;(obj as any).extra.noBlock = amount !== 0
                        return
                    case 669: // OBJECT_CUR_WEIGHT — set the critter's carry weight
                        ;(obj as Critter).stats.setBase('Carry', Math.max(0, amount))
                        return
                    default:
                        // Unknown TRAIT_OBJECT sub-case — log silently and return.
                        log('critter_add_trait(TRAIT_OBJECT,' + trait + ',' + amount + '): unknown sub-case — no-op', arguments)
                        return
                }
            }

            if (traitType === 2) {
                // TRAIT_CHAR — add or remove a character-creation trait by ID.
                // amount > 0: grant the trait; amount <= 0: revoke it.
                if (amount > 0) {
                    ;(obj as Critter).charTraits.add(trait)
                } else {
                    ;(obj as Critter).charTraits.delete(trait)
                }
                return
            }

            // Unknown traitType — log silently rather than stubbing so that
            // scripts using optional trait categories do not produce console noise.
            log('critter_add_trait: unknown traitType ' + traitType + ' — no-op', arguments)
        }
        item_caps_total(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('item_caps_total: not a game object — returning 0', undefined, this)
                return 0
            }
            return obj.money
        }
        item_caps_adjust(obj: Obj, amount: number) {
            const MONEY_PID = 41
            if (!isGameObject(obj)) {
                warn('item_caps_adjust: not a game object', undefined, this)
                return
            }
            for (let i = obj.inventory.length - 1; i >= 0; i--) {
                if (obj.inventory[i].pid === MONEY_PID) {
                    obj.inventory[i].amount = Math.max(0, obj.inventory[i].amount + amount)
                    if (obj.inventory[i].amount <= 0) obj.inventory.splice(i, 1)
                    return
                }
            }
            // No existing caps item — create one when adding a positive amount.
            // Fallout 2 scripts commonly call item_caps_adjust(critter, n) to
            // hand the player money without pre-seeding a caps item in inventory.
            if (amount > 0) {
                let capsItem: Obj | null = null
                try {
                    capsItem = createObjectWithPID(MONEY_PID, -1)
                } catch (e) {
                    // createObjectWithPID throws when PRO data is unavailable (e.g. tests).
                    // Fall through to the stub path below.
                    info('item_caps_adjust: createObjectWithPID failed (' + e + '), using minimal stub', 'inventory')
                }
                if (capsItem) {
                    capsItem.amount = amount
                    obj.inventory.push(capsItem)
                } else {
                    // PRO not available — create a minimal stub caps object so the
                    // amount is not silently discarded.  The stub has just enough
                    // fields for item_caps_total and subsequent item_caps_adjust calls.
                    const stub = { pid: MONEY_PID, amount, type: 'item', subtype: 'misc',
                                   approxEq(o: any) { return o.pid === MONEY_PID } } as any
                    obj.inventory.push(stub)
                }
            }
        }
        move_obj_inven_to_obj(obj: Obj, other: Obj) {
            if (obj === null || other === null) {
                warn('move_obj_inven_to_obj: null pointer passed in')
                return
            }

            if (!isGameObject(obj) || !isGameObject(other)) {
                warn('move_obj_inven_to_obj: not game object')
                return
            }

            info('move_obj_inven_to_obj: ' + obj.inventory.length + ' to ' + other.inventory.length, 'inventory')
            other.inventory = obj.inventory
            obj.inventory = []
        }
        obj_is_carrying_obj_pid(obj: Obj, pid: number) {
            // Number of inventory items with matching PID
            log('obj_is_carrying_obj_pid', arguments)
            if (!isGameObject(obj)) {
                warn('obj_is_carrying_obj_pid: not a game object')
                return 0
            } else if (obj.inventory === undefined) {
                warn('obj_is_carrying_obj_pid: object has no inventory!')
                return 0
            }

            //info("obj_is_carrying_obj_pid: " + pid, "inventory")
            var count = 0
            for (var i = 0; i < obj.inventory.length; i++) {
                if (obj.inventory[i].pid === pid) count++
            }
            return count
        }
        add_mult_objs_to_inven(obj: Obj, item: Obj, count: number) {
            // Add count copies of item to obj's inventory
            if (!isGameObject(obj)) {
                warn('add_mult_objs_to_inven: not a game object')
                return
            } else if (!isGameObject(item)) {
                warn('add_mult_objs_to_inven: item not a game object: ' + item)
                return
            } else if (obj.inventory === undefined) {
                warn('add_mult_objs_to_inven: object has no inventory!')
                return
            }

            //info("add_mult_objs_to_inven: " + count + " counts of " + item.toString(), "inventory")
            log('add_mult_objs_to_inven: ' + count + ' × ' + (item as any)?.art, arguments, 'inventory')
            obj.addInventoryItem(item, count)
        }
        rm_mult_objs_from_inven(obj: Obj, item: Obj, count: number) {
            // Remove up to count copies of item from obj's inventory, draining
            // multiple stacks if necessary (stacks are rare but can occur after
            // separate add_obj_to_inven calls with cloned item references).
            if (!isGameObject(obj)) {
                warn('rm_mult_objs_from_inven: not a game object', undefined, this)
                return 0
            }
            if (!isGameObject(item)) {
                warn('rm_mult_objs_from_inven: item not a game object: ' + item, undefined, this)
                return 0
            }
            let remaining = count
            // Iterate backward so splicing does not skip entries.
            for (let i = obj.inventory.length - 1; i >= 0 && remaining > 0; i--) {
                if (obj.inventory[i].approxEq(item)) {
                    const removed = Math.min(remaining, obj.inventory[i].amount)
                    obj.inventory[i].amount -= removed
                    remaining -= removed
                    if (obj.inventory[i].amount <= 0) obj.inventory.splice(i, 1)
                }
            }
            return count - remaining
        }
        add_obj_to_inven(obj: Obj, item: Obj) {
            this.add_mult_objs_to_inven(obj, item, 1)
        }
        rm_obj_from_inven(obj: Obj, item: Obj) {
            this.rm_mult_objs_from_inven(obj, item, 1)
        }
        obj_carrying_pid_obj(obj: Obj, pid: number) {
            log('obj_carrying_pid_obj', arguments)
            if (!isGameObject(obj)) {
                warn('obj_carrying_pid_obj: not a game object: ' + obj)
                return 0
            }

            for (var i = 0; i < obj.inventory.length; i++) {
                if (obj.inventory[i].pid === pid) return obj.inventory[i]
            }
            return 0
        }
        elevation(obj: Obj) {
            if (isSpatial(obj) || isGameObject(obj)) return globalState.currentElevation
            else {
                warn('elevation: not an object: ' + obj)
                return -1
            }
        }
        obj_can_see_obj(a: Critter, b: Critter) {
            log('obj_can_see_obj', arguments)
            if (!isGameObject(a) || !isGameObject(b)) {
                warn(`obj_can_see_obj: not game object: a=${a} b=${b}`, undefined, this)
                return 0
            }
            return +objCanSeeObj(a, b)
        }
        obj_can_hear_obj(a: Obj, b: Obj) {
            if (!isGameObject(a) || !isGameObject(b)) {
                warn(`obj_can_hear_obj: not game object: a=${a} b=${b}`, undefined, this)
                return 0
            }
            return hexDistance(a.position, b.position) <= 12 ? 1 : 0
        }
        critter_mod_skill(obj: Obj, skill: number, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_mod_skill: not a critter: ' + obj, undefined, this)
                return 0
            }
            const skillName = skillNumToName[skill]
            if (!skillName) {
                warn('critter_mod_skill: unknown skill number: ' + skill, undefined, this)
                return 0
            }
            const critter = obj as Critter
            critter.skills.setBase(skillName, critter.skills.getBase(skillName) + amount)
            return critter.getSkill(skillName)
        }
        using_skill(obj: Obj, skill: number) {
            return this.has_skill(obj, skill)
        }
        has_skill(obj: Obj, skill: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('has_skill: not a critter: ' + obj, undefined, this)
                return 0
            }
            const skillName = skillNumToName[skill]
            if (!skillName) {
                warn('has_skill: unknown skill number: ' + skill, undefined, this)
                return 0
            }
            return (obj as Critter).getSkill(skillName)
        }
        roll_vs_skill(obj: Obj, skill: number, bonus: number) {
            const skillValue = this.has_skill(obj, skill)
            return toRollResult(rollSkillCheck(skillValue, bonus))
        }
        do_check(obj: Obj, check: number, modifier: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('do_check: not a critter: ' + obj, undefined, this)
                return RollResult.FAILURE
            }
            const statName = statMap[check]
            if (!statName) {
                warn('do_check: unknown stat number: ' + check, undefined, this)
                return RollResult.FAILURE
            }
            // SPECIAL stats are on a 1–10 scale; multiply by 10 for percentile roll
            const statValue = (obj as Critter).getStat(statName) * 10
            return toRollResult(rollSkillCheck(statValue, modifier))
        }
        is_success(roll: number) {
            return rollResultIsSuccess(roll as any) ? 1 : 0
        }
        is_critical(roll: number) {
            return rollResultIsCritical(roll as any) ? 1 : 0
        }
        critter_inven_obj(obj: Critter, where: number) {
            if (!isGameObject(obj)) {
                // Graceful fallback — return null instead of crashing the runtime when a
                // script passes an unscripted or deleted object reference.
                warn('critter_inven_obj: not game object — returning null', undefined, this)
                return null
            }
            if (where === 0) return obj.equippedArmor ?? null // INVEN_TYPE_WORN
            else if (where === 1) return obj.rightHand // INVEN_TYPE_RIGHT_HAND
            else if (where === 2) return obj.leftHand // INVEN_TYPE_LEFT_HAND
            else if (where === -2) {
                // INVEN_TYPE_INV_COUNT — return the number of items in the critter's inventory
                return obj.inventory ? obj.inventory.length : 0
            }
            // Unknown `where` value — log silently instead of emitting a stub hit.
            // Scripts occasionally probe non-standard inventory slots; returning null
            // (empty slot) is the safest semantics.
            log('critter_inven_obj: unknown where=' + where + ' — returning null', arguments)
            return null
        }
        inven_cmds(obj: Critter, invenCmd: number, itemIndex: number): Obj | null {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('inven_cmds: not a critter: ' + obj, 'inventory', this)
                return null
            }

            switch (invenCmd) {
                case 0: // INVEN_CMD_FIRST
                    return obj.inventory.length > 0 ? obj.inventory[0] : null
                case 1: // INVEN_CMD_LAST
                    return obj.inventory.length > 0 ? obj.inventory[obj.inventory.length - 1] : null
                case 2: // INVEN_CMD_PREV — item before itemIndex; null when at the start
                    if (itemIndex <= 0) return null
                    return itemIndex - 1 < obj.inventory.length ? obj.inventory[itemIndex - 1] : null
                case 3: // INVEN_CMD_NEXT — item after itemIndex; null when at the end
                    if (itemIndex < 0 || itemIndex + 1 >= obj.inventory.length) return null
                    return obj.inventory[itemIndex + 1]
                case 11: // INVEN_CMD_LEFT_HAND
                    return (obj as Critter).leftHand ?? null
                case 12: // INVEN_CMD_RIGHT_HAND
                    return (obj as Critter).rightHand ?? null
                case 13: // INVEN_CMD_INDEX_PTR
                    if (itemIndex < 0 || itemIndex >= obj.inventory.length) return null
                    return obj.inventory[itemIndex]
                default:
                    // Unknown command index — log and return null rather than emitting
                    // a stub warning so unexpected inventory command codes don't crash
                    // or flood the console.
                    warn('inven_cmds: unknown command ' + invenCmd + ' — returning null', 'inventory', this)
                    return null
            }
        }
        critter_attempt_placement(obj: Obj, tileNum: number, elevation: number) {
            // Place the critter at tileNum; move_to handles finding a nearby tile if
            // the exact position is occupied.
            return this.move_to(obj, tileNum, elevation)
        }
        critter_state(obj: Critter) {
            /*stub("critter_state", arguments);*/
            if (!isGameObject(obj)) {
                warn('critter_state: not game object: ' + obj)
                return 0
            }

            // critter_state() returns a bitmask encoding the critter's current
            // condition.  Bit positions match the Fallout 2 CRITTER_IS_* constants:
            //   bit 0 (0x01): dead
            //   bit 1 (0x02): stunned / knocked out (unconscious)
            //   bit 2 (0x04): knocked down (prone)
            //   bit 3 (0x08): any crippled body part
            //   bit 4 (0x10): fleeing
            var state = 0
            if (obj.dead === true) state |= 0x01
            if ((obj as any).knockedOut === true) state |= 0x02
            if ((obj as any).knockedDown === true) state |= 0x04
            const hasCrippledLimb =
                (obj as any).crippledLeftLeg ||
                (obj as any).crippledRightLeg ||
                (obj as any).crippledLeftArm ||
                (obj as any).crippledRightArm
            if (hasCrippledLimb) state |= 0x08
            if ((obj as any).isFleeing === true) state |= 0x10

            return state
        }
        kill_critter(obj: Critter, deathFrame: number) {
            log('kill_critter', arguments)
            critterKill(obj)
        }
        get_poison(obj: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_poison: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase('Poison Level')
        }
        get_radiation(obj: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_radiation: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase('Radiation Level')
        }
        get_pc_stat(pcstat: number) {
            const player = globalState.player
            switch (pcstat) {
                case 0: // PCSTAT_unspent_skill_points
                    return player ? player.skills.skillPoints : 0
                case 1: // PCSTAT_level
                    return player ? player.level : 1
                case 2: // PCSTAT_experience
                    return player ? player.xp : 0
                case 3: // PCSTAT_reputation
                    return globalVars[0] !== undefined ? globalVars[0] : 0
                case 4: // PCSTAT_karma
                    // In Fallout 2, both PCSTAT_reputation (3) and PCSTAT_karma (4) read
                    // GVAR_PLAYER_REPUTATION (GVAR_0).  Scripts modify karma via
                    // set_global_var(0, ...) so globalVars[0] is always current.
                    return globalVars[0] !== undefined ? globalVars[0] : 0
                case 5: // PCSTAT_max_pc_stat — the number of valid pcstat indices (0–4), so 5
                    return 5
                default:
                    // Unknown pcstat index — return 0 silently rather than throwing, so that
                    // scripts that probe sfall-extended or future pcstat indices do not crash.
                    warn('get_pc_stat: unknown pcstat ' + pcstat + ' — returning 0', undefined, this)
                    return 0
            }
        }
        critter_injure(obj: Obj, how: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_injure: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (how & 1) critter.knockedOut = true
            if (how & 2) critter.knockedDown = true
            if (how & 4) critter.crippledLeftLeg = true
            if (how & 8) critter.crippledRightLeg = true
            if (how & 16) critter.crippledLeftArm = true
            if (how & 32) critter.crippledRightArm = true
            if (how & 64) critter.blinded = true
            if (how & 128) critterKill(critter)
            if (how & 256) critter.onFire = true
        }
        critter_is_fleeing(obj: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_is_fleeing: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).isFleeing ? 1 : 0
        }
        wield_obj_critter(obj: Obj, item: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('wield_obj_critter: not a critter: ' + obj, undefined, this)
                return
            }
            if (!isGameObject(item)) {
                warn('wield_obj_critter: item not a game object: ' + item, undefined, this)
                return
            }
            const critter = obj as Critter
            if (item.subtype === 'weapon') {
                critter.rightHand = item as any
            } else if (item.subtype === 'armor') {
                critter.equippedArmor = item
            } else {
                warn('wield_obj_critter: unhandled item subtype: ' + item.subtype, undefined, this)
            }
        }
        critter_dmg(obj: Critter, damage: number, damageType: string) {
            if (!isGameObject(obj)) {
                warn('critter_dmg: not game object: ' + obj)
                return
            }
            critterDamage(obj, damage, this.self_obj as Critter, true, true, damageType)
        }
        critter_heal(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_heal: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            const maxHP = critter.getStat('Max HP')
            const currentHP = critter.getStat('HP')
            const healAmount = Math.min(amount, maxHP - currentHP)
            if (healAmount > 0) critter.stats.modifyBase('HP', healAmount)
        }
        poison(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('poison: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).stats.modifyBase('Poison Level', amount)
        }
        radiation_dec(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('radiation_dec: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).stats.modifyBase('Radiation Level', -amount)
        }
        radiation_add(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('radiation_add: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).stats.modifyBase('Radiation Level', amount)
        }

        // combat
        attack_complex(
            obj: Obj,
            calledShot: number,
            numAttacks: number,
            bonus: number,
            minDmg: number,
            maxDmg: number,
            attackerResults: number,
            targetResults: number
        ) {
            info('[enter combat via attack_complex]')
            //stub("attack_complex", arguments)
            // since this isn't actually used beyond its basic form, we're not going to bother
            // implementing all of it

            // begin combat, turn starting with us
            if (Config.engine.doCombat) Combat.start(this.self_obj as Critter)
        }
        terminate_combat() {
            info('[terminate_combat]')
            if (globalState.combat) globalState.combat.end()
        }
        critter_set_flee_state(obj: Obj, isFleeing: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_set_flee_state: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).isFleeing = isFleeing !== 0
        }

        // objects
        obj_is_locked(obj: Obj) {
            log('obj_is_locked', arguments)
            if (!isGameObject(obj)) {
                warn('obj_is_locked: not game object: ' + obj, undefined, this)
                return 0
            }
            return obj.locked ? 1 : 0
        }
        obj_lock(obj: Obj) {
            log('obj_lock', arguments)
            if (!isGameObject(obj)) {
                warn('obj_lock: not game object: ' + obj, undefined, this)
                return
            }
            obj.locked = true
        }
        obj_unlock(obj: Obj) {
            log('obj_unlock', arguments)
            if (!isGameObject(obj)) {
                warn('obj_unlock: not game object: ' + obj, undefined, this)
                return
            }
            obj.locked = false
        }
        obj_is_open(obj: Obj) {
            log('obj_is_open', arguments)
            if (!isGameObject(obj)) {
                warn('obj_is_open: not game object: ' + obj, undefined, this)
                return 0
            }
            return obj.open ? 1 : 0
        }
        obj_close(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_close: not game object: ' + obj)
                return
            }
            info('obj_close')
            if (!obj.open) return
            obj.use(this.self_obj as Critter, false)
            //stub("obj_close", arguments)
        }
        obj_open(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_open: not game object: ' + obj)
                return
            }
            info('obj_open')
            if (obj.open) return
            obj.use(this.self_obj as Critter, false)
            //stub("obj_open", arguments)
        }
        proto_data(pid: number, data_member: number): any {
            // data_member 0 (PROTO_DATA_PID) can be returned directly without
            // loading the proto — the PID is the argument itself.
            if (data_member === 0) return pid

            // Load the prototype for this PID.  The PID encodes both the object
            // type (bits 31-24) and the 1-based prototype index (bits 15-0).
            const pro = loadPRO(pid, pid & 0xffff)
            if (!pro) {
                warn('proto_data: could not load PRO for pid=0x' + pid.toString(16))
                return 0
            }

            switch (data_member) {
                // --- Common header fields (all proto types) ---
                case 1:
                    // PROTO_DATA_TEXT_ID — message table ID used for the object name
                    return pro.textID ?? 0
                case 2:
                    // PROTO_DATA_FID — combined FRM id (frmType << 24 | frmPID)
                    return ((pro.frmType ?? 0) << 24) | (pro.frmPID ?? 0)
                case 3:
                    // PROTO_DATA_LIGHT_DIST — light emission radius
                    return pro.lightRadius ?? 0
                case 4:
                    // PROTO_DATA_LIGHT_INTENS — light emission intensity
                    return pro.lightIntensity ?? 0
                case 5:
                    // PROTO_DATA_FLAGS — general object flags bitfield
                    return pro.flags ?? 0

                // --- Item header fields (type == 0: items) ---
                case 8:
                    // ITEM_DATA_SUBTYPE — item sub-type (armor=0, weapon=3, ammo=4, …)
                    return pro.extra?.subType ?? 0
                case 9:
                    // ITEM_DATA_WEIGHT — item weight in tenths of a pound
                    return pro.extra?.weight ?? 0
                case 10:
                    // ITEM_DATA_COST — base barter value in caps
                    return pro.extra?.cost ?? 0
                case 11:
                    // ITEM_DATA_SIZE — inventory size slots occupied
                    return pro.extra?.size ?? 0

                // --- Weapon-specific item fields ---
                case 12:
                    // WEAPON_DATA_ANIMATION_CODE — animation code (lookup key into
                    // art/critters weapon suffix tables, e.g. 0=fists, 1=knife, 2=club…)
                    return pro.extra?.animCode ?? 0
                case 13:
                    // ITEM_DATA_MATERIAL — material type of the item (0=glass, 1=metal, 2=plastic…).
                    // Used by some scripts for breakage/damage calculations.
                    return pro.extra?.material ?? 0
                case 14:
                    // WEAPON_DATA_MIN_DMG — minimum damage roll
                    return pro.extra?.minDmg ?? 0
                case 15:
                    // WEAPON_DATA_MAX_DMG — maximum damage roll
                    return pro.extra?.maxDmg ?? 0
                case 16:
                    // WEAPON_DATA_DMG_TYPE — damage type index
                    return pro.extra?.dmgType ?? 0
                case 17:
                    // WEAPON_DATA_ATTACK_MODE_1 — primary attack mode (lower nibble of attackMode byte)
                    return (pro.extra?.attackMode ?? 0) & 0xf
                case 18:
                    // WEAPON_DATA_ATTACK_MODE_2 — secondary attack mode (upper nibble of attackMode byte)
                    return ((pro.extra?.attackMode ?? 0) >> 4) & 0xf
                case 19:
                    // WEAPON_DATA_PROJ_PID — projectile prototype PID for ranged weapons
                    return pro.extra?.projPID ?? 0
                case 20:
                    // WEAPON_DATA_MIN_ST — minimum Strength required to wield this weapon
                    return pro.extra?.minST ?? 0
                case 21:
                    // WEAPON_DATA_AP_COST_1 — AP cost for primary attack
                    return pro.extra?.APCost1 ?? 0
                case 22:
                    // WEAPON_DATA_AP_COST_2 — AP cost for secondary attack
                    return pro.extra?.APCost2 ?? 0
                case 25:
                    // WEAPON_DATA_CALIBER — ammo caliber index
                    return pro.extra?.caliber ?? 0
                case 26:
                    // WEAPON_DATA_AMMO_PID — required ammo proto PID
                    return pro.extra?.ammoPID ?? 0
                case 27:
                    // WEAPON_DATA_MAX_AMMO — magazine capacity
                    return pro.extra?.maxAmmo ?? 0
                case 34:
                    // WEAPON_DATA_BURST_ROUNDS (weapons) / ARMOR_DATA_DR_LASER (armor).
                    // Disambiguate by item sub-type: subType 0 = armor, 3 = weapon.
                    if (pro.extra?.subType === 0)
                        return pro.extra?.stats?.['DR Laser'] ?? 0
                    return pro.extra?.rounds ?? 0

                // --- Armor-specific item fields ---
                case 32:
                    // ARMOR_DATA_AC — Armor Class bonus
                    return pro.extra?.AC ?? 0
                case 33:
                    // ARMOR_DATA_DR_NORMAL — Damage Resistance vs Normal damage
                    return pro.extra?.stats?.['DR Normal'] ?? 0
                case 35:
                    // ARMOR_DATA_DR_FIRE — Damage Resistance vs Fire damage
                    return pro.extra?.stats?.['DR Fire'] ?? 0
                case 36:
                    // ARMOR_DATA_DR_PLASMA — Damage Resistance vs Plasma damage
                    return pro.extra?.stats?.['DR Plasma'] ?? 0
                case 37:
                    // ARMOR_DATA_DR_ELECTRICAL — Damage Resistance vs Electrical damage
                    return pro.extra?.stats?.['DR Electrical'] ?? 0
                case 38:
                    // ARMOR_DATA_DR_EMP — Damage Resistance vs EMP damage
                    return pro.extra?.stats?.['DR EMP'] ?? 0
                case 39:
                    // ARMOR_DATA_DR_EXPLOSIVE — Damage Resistance vs Explosive damage
                    return pro.extra?.stats?.['DR Explosive'] ?? 0

                // --- Armor DT (Damage Threshold) fields ---
                case 40:
                    // ARMOR_DATA_DT_NORMAL — Damage Threshold vs Normal damage
                    return pro.extra?.stats?.['DT Normal'] ?? 0
                case 41:
                    // ARMOR_DATA_DT_LASER — Damage Threshold vs Laser damage
                    return pro.extra?.stats?.['DT Laser'] ?? 0
                case 42:
                    // ARMOR_DATA_DT_FIRE — Damage Threshold vs Fire damage
                    return pro.extra?.stats?.['DT Fire'] ?? 0
                case 43:
                    // ARMOR_DATA_DT_PLASMA — Damage Threshold vs Plasma damage
                    return pro.extra?.stats?.['DT Plasma'] ?? 0
                case 44:
                    // ARMOR_DATA_DT_ELECTRICAL — Damage Threshold vs Electrical damage
                    return pro.extra?.stats?.['DT Electrical'] ?? 0
                case 45:
                    // ARMOR_DATA_DT_EMP — Damage Threshold vs EMP damage
                    return pro.extra?.stats?.['DT EMP'] ?? 0
                case 46:
                    // ARMOR_DATA_DT_EXPLOSIVE — Damage Threshold vs Explosive damage
                    return pro.extra?.stats?.['DT Explosive'] ?? 0

                // --- Armor / weapon extended fields ---
                case 47:
                    // ARMOR_DATA_PERK / WEAPON_DATA_PERK — perk granted by wearing/wielding this item
                    return pro.extra?.perk ?? -1

                // --- Critter kill/XP data (accessed via critter PIDs) ---
                case 48:
                    // CRITTER_DATA_EXPERIENCE — base XP awarded for killing this critter
                    return pro.extra?.XPValue ?? 0
                case 49:
                    // CRITTER_DATA_KILL_TYPE — kill-type category for kill-count tracking
                    return pro.extra?.killType ?? 0

                // --- Common extended flags ---
                case 7:
                    // PROTO_DATA_FLAGS2 — extended object flags bitfield (second flags word).
                    // Encodes things like "can use on floor", "two-handed", "big gun", etc.
                    return pro.extra?.flags2 ?? pro.flags2 ?? 0

                // --- Critter fields ---
                case 6:
                    // CRITTER_DATA_ACTION_FLAGS — critter action flags
                    return pro.extra?.actionFlags ?? 0

                // --- Weapon range fields ---
                case 23:
                    // WEAPON_DATA_MAX_RANGE_1 — maximum range for primary attack
                    return pro.extra?.maxRange1 ?? 0
                case 24:
                    // WEAPON_DATA_MAX_RANGE_2 — maximum range for secondary attack
                    return pro.extra?.maxRange2 ?? 0

                // --- Ammo / drug specific fields ---
                case 28:
                    // AMMO_DATA_AC_ADJUST — AC modifier applied per bullet in burst
                    return pro.extra?.acAdjust ?? 0
                case 29:
                    // AMMO_DATA_DR_ADJUST — DR modifier (as percentage of final DR)
                    return pro.extra?.drAdjust ?? 0
                case 30:
                    // AMMO_DATA_DMG_MULT — damage multiplier numerator
                    return pro.extra?.dmgMult ?? 1
                case 31:
                    // AMMO_DATA_DMG_DIV — damage multiplier denominator
                    return pro.extra?.dmgDiv ?? 1

                // --- Extended critter/weapon/item fields (50–64) ---
                // These indices are not defined in vanilla Fallout 2 PRO headers but
                // appear in some modded or sfall-extended scripts.  Return 0 silently
                // so scripts do not crash when they probe these fields.
                case 50: case 51: case 52: case 53: case 54: case 55:
                case 56: case 57: case 58: case 59: case 60: case 61:
                case 62: case 63: case 64:
                    log('proto_data: extended field ' + data_member + ' (safe default 0)', arguments)
                    return 0

                default:
                    // Unknown proto_data field index — return 0 silently rather than
                    // emitting a stub hit.  Mods occasionally probe non-standard field
                    // indices; a safe 0 is the least-surprising fallback.
                    log('proto_data: unknown field ' + data_member + ' (safe default 0)', arguments)
                    return 0
            }
        }
        create_object_sid(pid: number, tile: number, elev: number, sid: number) {
            // Create object of pid and possibly script
            info('create_object_sid: pid=' + pid + ' tile=' + tile + ' elev=' + elev + ' sid=' + sid, undefined, this)

            if (elev < 0 || elev > 2) {
                warn('create_object_sid: elev out of range (' + elev + ') — clamping to [0,2]', undefined, this)
                elev = Math.max(0, Math.min(2, elev))
            }

            var obj = createObjectWithPID(pid, sid)
            if (!obj) {
                warn("create_object_sid: couldn't create object", undefined, this)
                return null
            }
            obj.position = fromTileNum(tile)

            //stub("create_object_sid", arguments)

            // TODO: if tile is valid...
            /*if(elevation !== currentElevation) {
                warn("create_object_sid: want to create object on another elevation (current=" + currentElevation + ", elev=" + elevation + ")")
                return
            }*/

            // add it to the map
            globalState.gMap.addObject(obj, elev)

            return obj
        }
        obj_name(obj: Obj) {
            return obj.name
        }
        obj_item_subtype(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_item_subtype: not game object: ' + obj)
                return null
            }

            if (obj.type === 'item' && (obj as any).pro !== undefined) return (obj as any).pro.extra.subtype

            // Fallback: map the string subtype to its Fallout 2 integer constant.
            // 0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key
            const subtypeIntMap: { [name: string]: number } = {
                armor: 0, container: 1, drug: 2, weapon: 3, ammo: 4, misc: 5, key: 6,
            }
            if (obj.subtype !== undefined && subtypeIntMap[obj.subtype] !== undefined) {
                return subtypeIntMap[obj.subtype]
            }

            // Last-resort fallback: return 0 (armor/misc) without emitting a stub.
            // Scripts that call obj_item_subtype on an object with no type information
            // are handled gracefully rather than producing console noise.
            log('obj_item_subtype: unknown subtype for pid=' + (obj.pid ?? '?'), arguments, 'inventory')
            return 0
        }
        anim_busy(obj: Obj) {
            log('anim_busy', arguments)
            if (!isGameObject(obj)) {
                warn('anim_busy: not game object: ' + obj)
                return false
            }
            return obj.inAnim()
        }
        obj_art_fid(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_art_fid: not a game object: ' + obj)
                return 0
            }
            return obj.frmPID ?? 0
        }
        art_anim(fid: number): number {
            // Extract the animation-type field (bits 23–16) from a Fallout FID.
            // For critter FIDs this encodes the base animation (idle, walk, attack, etc.).
            return (fid >>> 16) & 0xff
        }
        set_obj_visibility(obj: Obj, visibility: number) {
            if (!isGameObject(obj)) {
                warn('set_obj_visibility: not a game object: ' + obj)
                return
            }

            obj.visible = !visibility
        }
        use_obj_on_obj(obj: Obj, who: Obj) {
            if (!isGameObject(obj)) {
                warn('use_obj_on_obj: source is not a game object: ' + obj, undefined, this)
                return
            }
            if (!isGameObject(who)) {
                warn('use_obj_on_obj: target is not a game object: ' + who, undefined, this)
                return
            }

            // Prefer use_obj_on_p_proc (Fallout 2 standard for item-on-target
            // interactions). Fall back to use_p_proc for scripts that implement
            // key/lock and item-on-critter logic there.
            if (who._script && who._script.use_obj_on_p_proc !== undefined) {
                useObjOn(who, obj)
            } else {
                use(who, obj)
            }
        }
        use_obj(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('use_obj: not a game object: ' + obj, undefined, this)
                return
            }

            const sourceObj = this.source_obj
            const source =
                sourceObj !== 0 && isGameObject(sourceObj) && (sourceObj as Obj).type === 'critter'
                    ? (sourceObj as Critter)
                    : globalState.player
            obj.use(source)
        }
        anim(obj: Obj, anim: number, param: number) {
            if (!isGameObject(obj)) {
                warn('anim: not a game object: ' + obj)
                return
            }
            if (anim === 1000)
                // set rotation
                obj.orientation = param
            else if (anim === 1010)
                // set frame
                obj.frame = param
            else if (anim === 0)
                // ANIM_stand — reset to idle standing frame
                obj.frame = 0
            else if (anim >= 1 && anim <= 99) {
                // Standard ANIM_* animation constants (1=walk, 2=jump_begin, …, 50=fall_front_blood, etc.).
                // The browser build does not yet drive a full frame-accurate animation state
                // machine from scripted anim() calls, so these are silently logged instead
                // of emitting stub warnings that flood the console during map entry.
                log('anim', arguments, 'animation')
            } else if (anim >= 100 && anim <= 999) {
                // Extended ANIM_* constants (100+ are engine-internal or sfall-specific).
                // Log silently rather than stubbing so the console stays clean.
                log('anim (extended)', arguments, 'animation')
            } else if (anim >= 1001 && anim <= 1009) {
                // Codes 1001–1009 are between the rotation marker (1000) and the
                // frame-set marker (1010).  They appear in some vanilla and modded
                // scripts as engine-internal constants that the browser build does
                // not drive.  Log silently to avoid flooding the console.
                log('anim (mid-range)', arguments, 'animation')
            } else if (anim > 1010) {
                // Unknown high-valued anim codes beyond the frame-set marker.
                // Log silently — these appear in some modded scripts and are not blockers.
                log('anim (unknown high code)', arguments, 'animation')
            } else {
                // Negative or otherwise unclassified anim code — log silently.
                log('anim (unclassified code)', arguments, 'animation')
            }
        }

        // environment
        set_light_level(level: number) {
            log('set_light_level', arguments)
            // Clamp to the valid range 0–65536 and store on globalState.
            globalState.ambientLightLevel = Math.max(0, Math.min(65536, level))
        }
        obj_set_light_level(obj: Obj, intensity: number, distance: number) {
            log('obj_set_light_level', arguments)
            if (!isGameObject(obj)) {
                warn('obj_set_light_level: not a game object: ' + obj)
                return
            }
            obj.lightIntensity = Math.max(0, Math.min(65536, intensity))
            obj.lightRadius = Math.max(0, distance)
        }
        override_map_start(x: number, y: number, elevation: number, rotation: number) {
            log('override_map_start', arguments)
            info(`override_map_start: ${x}, ${y} / elevation ${elevation}`)
            overrideStartPos = { position: { x, y }, orientation: rotation, elevation }
        }
        obj_pid(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_pid: not game object: ' + obj, undefined, this)
                return null
            }
            return obj.pid
        }
        obj_get_rot(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('obj_get_rot: not a game object: ' + obj)
                return 0
            }
            return obj.orientation
        }
        set_obj_rot(obj: Obj, rotation: number): void {
            if (!isGameObject(obj)) {
                warn('set_obj_rot: not a game object: ' + obj)
                return
            }
            obj.orientation = ((rotation % 6) + 6) % 6
        }
        obj_on_screen(obj: Obj) {
            log('obj_on_screen', arguments)
            if (!isGameObject(obj)) {
                warn('obj_on_screen: not a game object: ' + obj)
                return 0
            }
            return objectOnScreen(obj) ? 1 : 0
        }
        obj_type(obj: Obj) {
            if (!isGameObject(obj)) {
                warn('obj_type: not game object: ' + obj)
                return null
            } else if (obj.type === 'critter') return 1 // critter
            else if (obj.pid === undefined) {
                warn('obj_type: no PID')
                return null
            }
            return (obj.pid >> 24) & 0xff
        }
        destroy_object(obj: Obj) {
            // destroy object from world
            log('destroy_object', arguments)
            globalState.gMap.destroyObject(obj)
        }
        set_exit_grids(onElev: number, mapID: number, elevation: number, tileNum: number, rotation: number) {
            log('set_exit_grids', arguments)
            for (var i = 0; i < gameObjects!.length; i++) {
                var obj = gameObjects![i]
                if (obj.type === 'misc' && obj.extra && obj.extra.exitMapID !== undefined) {
                    obj.extra.exitMapID = mapID
                    obj.extra.startingPosition = tileNum
                    obj.extra.startingElevation = elevation
                }
            }
        }

        // tiles
        tile_distance_objs(a: Obj, b: Obj) {
            if (!isSpatial(a) && !isSpatial(b) && (!isGameObject(a) || !isGameObject(b))) {
                warn('tile_distance_objs: ' + a + ' or ' + b + ' are not game objects')
                return null
            }
            return hexDistance(a.position, b.position)
        }
        tile_distance(a: number, b: number) {
            if (a === -1 || b === -1) return 9999
            return hexDistance(fromTileNum(a), fromTileNum(b))
        }
        tile_num(obj: Obj) {
            if (!isSpatial(obj) && !isGameObject(obj)) {
                warn('tile_num: not a game object: ' + obj, undefined, this)
                return null
            }
            return toTileNum(obj.position)
        }
        tile_contains_pid_obj(tile: number, elevation: number, pid: number): any {
            log('tile_contains_pid_obj', arguments, 'tiles')
            var pos = fromTileNum(tile)
            var objects = globalState.gMap.getObjects(elevation)
            for (var i = 0; i < objects.length; i++) {
                if (objects[i].position.x === pos.x && objects[i].position.y === pos.y && objects[i].pid === pid) {
                    return objects[i]
                }
            }
            return 0 // it's not there
        }
        tile_is_visible(tile: number) {
            // A tile is considered visible if the player exists and the tile is within
            // the Fallout 2 standard view radius of 14 hexes.  When the player is not
            // available (e.g. scripts run at startup), fall back to returning 1 so that
            // scripts that use this as a guard condition can still run.
            if (globalState.player) {
                const tilePos = fromTileNum(tile)
                const dist = hexDistance(globalState.player.position, tilePos)
                return dist <= 14 ? 1 : 0
            }
            return 1
        }
        tile_in_tile_rect(ul: number, ur: number, ll: number, lr: number, t: number) {
            //stub("tile_in_tile_rect", arguments, "tiles")
            const _ul = fromTileNum(ul),
                _ur = fromTileNum(ur)
            const _ll = fromTileNum(ll),
                _lr = fromTileNum(lr)
            const _t = fromTileNum(t)
            return tile_in_tile_rect(_t, _ur, _lr, _ll, _ul) ? 1 : 0
        }
        tile_contains_obj_pid(tile: number, elevation: number, pid: number) {
            if (elevation !== globalState.currentElevation) {
                warn('tile_contains_obj_pid: not same elevation')
                return 0
            }
            var objs = globalState.gMap.objectsAtPosition(fromTileNum(tile))
            for (var i = 0; i < objs.length; i++) {
                if (objs[i].pid === pid) return 1
            }
            return 0
        }
        rotation_to_tile(srcTile: number, destTile: number) {
            var src = fromTileNum(srcTile),
                dest = fromTileNum(destTile)
            var hex = hexNearestNeighbor(src, dest)
            if (hex !== null) return hex.direction
            warn('rotation_to_tile: invalid hex: ' + srcTile + ' / ' + destTile)
            return -1 // TODO/XXX: what does this return if invalid?
        }
        move_to(obj: Obj, tileNum: number, elevation: number) {
            if (!isGameObject(obj)) {
                warn('move_to: not a game object: ' + obj)
                return
            }
            if (elevation !== globalState.currentElevation) {
                info('move_to: moving to elevation ' + elevation)

                if (obj instanceof Critter && obj.isPlayer) globalState.gMap.changeElevation(elevation, true)
                else {
                    globalState.gMap.removeObject(obj)
                    globalState.gMap.addObject(obj, elevation)
                }
            }
            obj.position = fromTileNum(tileNum)

            if (obj instanceof Critter && obj.isPlayer) centerCamera(obj.position)
        }

        // combat
        node998() {
            // enter combat
            log('node998 enter combat', arguments, 'movement')
        }

        // dialogue
        node999() {
            // exit dialogue
            info('DIALOGUE EXIT (Node999)')
            dialogueExit()
        }
        gdialog_set_barter_mod(mod: number) {
            log('gdialog_set_barter_mod', arguments)
            this._barterMod = mod
        }
        gdialog_mod_barter(mod: number) {
            // switch to barter mode
            log('gdialog_mod_barter', arguments)
            if (!this.self_obj) {
                warn('gdialog_mod_barter: no self_obj — barter mode skipped', undefined, this)
                return
            }
            uiBarterMode(this.self_obj as Critter)
        }
        start_gdialog(msgFileID: number, obj: Obj, mood: number, headNum: number, backgroundID: number) {
            log('start_gdialog', arguments)
            info('DIALOGUE START', 'dialogue')
            if (!this.self_obj) {
                warn('start_gdialog: no self_obj — dialogue start skipped', undefined, this)
                return
            }
            currentDialogueObject = this.self_obj as Critter
            uiStartDialogue(false, this.self_obj as Critter)
            //stub("start_gdialog", arguments)
        }
        gsay_start() {
            log('gsay_start', arguments)
            // Prepare for a new dialogue exchange: clear pending options
            dialogueOptionProcs = []
        }
        //gSay_Option(msgList, msgID, target, reaction) { stub("gSay_Option", arguments) },
        gsay_reply(msgList: number, msgID: string | number) {
            log('gSay_Reply', arguments)
            var msg = getScriptMessage(msgList, msgID)
            if (msg === null || msg === '') {
                warn('gsay_reply: message is null/empty — reply skipped', undefined, this)
                return
            }
            info('REPLY: ' + msg, 'dialogue')
            uiSetDialogueReply(msg)
        }
        gsay_message(msgList: number, msgID: string | number, reaction: number) {
            log('gsay_message', arguments)
            const msg = getScriptMessage(msgList, msgID)
            if (msg === null) {
                warn('gsay_message: msg is null', undefined, this)
                return
            }
            info('GSAY MESSAGE: ' + msg, 'dialogue')
            uiSetDialogueReply(msg)
        }
        gsay_end() {
            log('gsay_end', arguments)
        }
        end_dialogue() {
            log('end_dialogue', arguments)
            dialogueExit()
        }
        gsay_option(msgList: number, msgID: string | number, target: any, reaction: number) {
            log('gsay_option', arguments)
            var msg = getScriptMessage(msgList, msgID)
            if (msg === null || msg === '') {
                warn('gsay_option: msg is null/empty — option skipped', undefined, this)
                return
            }
            info('DIALOGUE OPTION: ' + msg, 'dialogue')
            dialogueOptionProcs.push(target.bind(this))
            uiAddDialogueOption(msg, dialogueOptionProcs.length - 1)
        }
        giq_option(iqTest: number, msgList: number, msgID: string | number, target: any, reaction: number) {
            log('giQ_Option', arguments)
            var msg = getScriptMessage(msgList, msgID)
            if (msg === null) {
                console.warn('giq_option: msg is null')
                return
            }
            info(
                'DIALOGUE OPTION: ' + msg + ' [INT ' + (iqTest >= 0 ? '>=' + iqTest : '<=' + -iqTest) + ']',
                'dialogue'
            )

            const INT = globalState.player.getStat('INT')
            if ((iqTest > 0 && INT < iqTest) || (iqTest < 0 && INT > -iqTest)) return // not enough intelligence for this option

            dialogueOptionProcs.push(target.bind(this))
            uiAddDialogueOption(msg, dialogueOptionProcs.length - 1)
        }
        dialogue_system_enter() {
            log('dialogue_system_enter', arguments)
            if (!this.self_obj) {
                warn('dialogue_system_enter: no self_obj')
                return
            }
            talk(this.self_obj._script, this.self_obj as Obj)
        }
        float_msg(obj: Obj, msg: string, type: number) {
            log('float_msg', arguments)
            //info("FLOAT MSG: " + msg, "floatMessage")
            if (!isGameObject(obj)) {
                warn('float_msg: not game object: ' + obj)
                return
            }
            var colorMap: { [color: number]: string } = {
                // todo: take the exact values from some palette. also, yellow is ugly.
                0: 'white', //0: "yellow",
                1: 'black',
                2: 'red',
                3: 'green',
                4: 'blue',
                5: 'purple',
                6: 'white',
                7: 'red',
                8: 'white', //8: "yellow",
                9: 'white',
                10: 'dark gray',
                11: 'dark gray',
                12: 'light gray',
            }
            var color = colorMap[type]
            if (type === -2 /* FLOAT_MSG_WARNING */ || type === -1 /* FLOAT_MSG_SEQUENTIAL */) color = colorMap[9]
            globalState.floatMessages.push({
                msg: msg,
                obj: this.self_obj as Obj,
                startTime: window.performance.now(),
                color: color,
            })
        }

        // animation
        reg_anim_func(signal: any, callback: any) {
            log('reg_anim_func', arguments, 'animation')
            // ANIM_BEGIN (1): start an animation sequence — no-op since we don't
            // queue animations, but register the intent.
            // ANIM_COMPLETE (2): register a callback to be called when the animation
            // sequence completes.  Since the browser build has no async animation
            // queue, call the callback immediately so script continuation logic
            // (like transitioning to the next dialogue step or triggering a follow-up
            // event) is not permanently blocked.
            if (signal === 2 /* ANIM_COMPLETE */ && typeof callback === 'function') {
                try {
                    callback()
                } catch (e) {
                    warn('reg_anim_func: ANIM_COMPLETE callback threw: ' + e, 'animation')
                }
            }
        }
        reg_anim_animate(obj: Obj, anim: number, delay: number) {
            log('reg_anim_animate', arguments, 'animation')
        }
        reg_anim_animate_forever(obj: Obj, anim: number) {
            log('reg_anim_animate_forever', arguments, 'animation')
            if (!isGameObject(obj)) {
                warn('reg_anim_animate_forever: not a game object')
                return
            }
            //console.log("ANIM FOREVER: " + obj.art + " / " + anim)
            if (anim !== 0) warn('reg_anim_animate_forever: anim = ' + anim)
            function animate() {
                obj.singleAnimation(false, animate)
            }
            animate()
        }
        animate_move_obj_to_tile(obj: Critter, tileNum: any, isRun: number) {
            log('animate_move_obj_to_tile', arguments, 'movement')
            if (!isGameObject(obj)) {
                warn('animate_move_obj_to_tile: not a game object', 'movement', this)
                return
            }
            // XXX: is this correct? FCMALPNK passes a procedure name
            // but is it a call (wouldn't make sense for NOption) or
            // a procedure reference that this should call?
            if (typeof tileNum === 'function') tileNum = tileNum.call(this)
            if (isNaN(tileNum)) {
                warn('animate_move_obj_to_tile: invalid tile num', 'movement', this)
                return
            }

            var tile = fromTileNum(tileNum)
            if (tile.x < 0 || tile.x >= 200 || tile.y < 0 || tile.y >= 200) {
                warn(
                    'animate_move_obj_to_tile: invalid tile: ' + tile.x + ', ' + tile.y + ' (' + tileNum + ')',
                    'movement',
                    this
                )
                return
            }
            if (!obj.walkTo(tile, !!isRun)) {
                warn('animate_move_obj_to_tile: no path', 'movement', this)
                return
            }
        }
        reg_anim_obj_move_to_tile(obj: Obj, tileNum: number, delay: number) {
            log('reg_anim_obj_move_to_tile', arguments, 'movement')
            if (!isGameObject(obj)) {
                warn('reg_anim_obj_move_to_tile: not a game object', 'movement', this)
                return
            }
            if (isNaN(tileNum) || tileNum < 0) {
                warn('reg_anim_obj_move_to_tile: invalid tile num', 'movement', this)
                return
            }
            const tile = fromTileNum(tileNum)
            if (tile.x < 0 || tile.x >= 200 || tile.y < 0 || tile.y >= 200) {
                warn(
                    'reg_anim_obj_move_to_tile: invalid tile: ' + tile.x + ', ' + tile.y + ' (' + tileNum + ')',
                    'movement',
                    this
                )
                return
            }
            if (!(obj as Critter).walkTo) {
                warn('reg_anim_obj_move_to_tile: object cannot walk', 'movement', this)
                return
            }
            if (!(obj as Critter).walkTo(tile, false)) {
                warn('reg_anim_obj_move_to_tile: no path', 'movement', this)
            }
        }

        animate_stand_obj(obj: Critter) {
            log('animate_stand_obj', arguments, 'animation')
            if (!isGameObject(obj)) {
                warn('animate_stand_obj: not a game object', undefined, this)
                return
            }
            // Reset to idle (frame 0 of the standing animation)
            obj.frame = 0
        }

        explosion(tile: number, elevation: number, damage: number) {
            log('explosion', arguments)

            // Make a transient object so we can explode at the tile.
            var explosives = createObjectWithPID(makePID(0 /* items */, 85 /* Plastic Explosives */), -1)
            explosives.position = fromTileNum(tile)
            globalState.gMap.addObject(explosives)
            // Use the script-supplied damage value: half as min, full as max.
            // Allow 0 for scripts that trigger a visual-only explosion.
            const minDmg = Math.floor(damage / 2)
            const maxDmg = damage
            explosives.explode(explosives, minDmg, maxDmg)
            globalState.gMap.removeObject(explosives)
        }

        gfade_out(time: number) {
            // Screen fade-out over `time` game ticks.  In the browser build we
            // don't implement an actual fading effect yet, but we must not stub
            // this procedure — it is called frequently during map transitions
            // and cut-scenes, and the stub warning floods the console.
            log('gfade_out', arguments)
        }
        gfade_in(time: number) {
            // Screen fade-in over `time` game ticks.  Same note as gfade_out.
            log('gfade_in', arguments)
        }

        // timing
        add_timer_event(obj: Obj, ticks: number, userdata: any) {
            log('add_timer_event', arguments)
            if (!obj || !obj._script) {
                warn('add_timer_event: not a scriptable object: ' + obj)
                return
            }
            info('timer event added in ' + ticks + ' ticks (userdata ' + userdata + ')', 'timer')
            // trigger timedEvent in `ticks` game ticks
            timeEventList.push({
                ticks: ticks,
                obj: obj,
                userdata: userdata,
                fn: function () {
                    timedEvent(obj._script!, userdata)
                }.bind(this),
            })
        }
        rm_timer_event(obj: Obj) {
            log('rm_timer_event', arguments)
            info('rm_timer_event: ' + obj + ', ' + obj.pid)
            for (var i = 0; i < timeEventList.length; i++) {
                const timedEvent = timeEventList[i]
                if (timedEvent.obj && timedEvent.obj.pid === obj.pid) {
                    // TODO: better object equality
                    info('removing timed event for obj')
                    timeEventList.splice(i--, 1)
                    break
                }
            }
        }
        game_ticks(seconds: number) {
            return seconds * 10
        }
        game_time_advance(ticks: number) {
            log('game_time_advance', arguments)
            info('advancing time ' + ticks + ' ticks ' + '(' + ticks / 10 + ' seconds)')
            globalState.gameTickTime += ticks
        }

        // sfall extended API
        get_sfall_global(name: string): number {
            return getSfallGlobal(name)
        }
        set_sfall_global(name: string, value: number): void {
            setSfallGlobal(name, value)
        }
        get_sfall_global_int(index: number): number {
            return getSfallGlobalInt(index)
        }
        set_sfall_global_int(index: number, value: number): void {
            setSfallGlobalInt(index, value)
        }

        // sfall extended opcodes — PC/critter stat helpers
        get_pc_base_stat(stat: number): number {
            const player = globalState.player
            if (!player) return 0
            const statName = statMap[stat]
            if (!statName) {
                warn('get_pc_base_stat: unknown stat number: ' + stat, undefined, this)
                return 0
            }
            return player.stats.getBase(statName)
        }
        set_pc_base_stat(stat: number, value: number): void {
            const player = globalState.player
            if (!player) return
            const statName = statMap[stat]
            if (!statName) {
                warn('set_pc_base_stat: unknown stat number: ' + stat, undefined, this)
                return
            }
            player.stats.setBase(statName, value)
        }
        set_critter_current_ap(obj: Obj, ap: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_current_ap: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (critter.AP) {
                critter.AP.combat = Math.max(0, ap)
            }
        }
        get_npc_level(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_npc_level: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.stats.getBase('Level')
        }
        get_critter_current_ap(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_current_ap: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.AP ? critter.AP.combat : 0
        }
        get_critter_max_hp(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_max_hp: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.getStat('Max HP')
        }
        get_pc_level(): number {
            const player = globalState.player
            if (!player) return 0
            return player.level
        }

        // sfall extended opcodes — any-critter stat helpers
        get_critter_base_stat(obj: Obj, stat: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_base_stat: not a critter: ' + obj, undefined, this)
                return 0
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('get_critter_base_stat: unknown stat number: ' + stat, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase(statName)
        }
        set_critter_base_stat(obj: Obj, stat: number, value: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_base_stat: not a critter: ' + obj, undefined, this)
                return
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('set_critter_base_stat: unknown stat number: ' + stat, undefined, this)
                return
            }
            ;(obj as Critter).stats.setBase(statName, value)
        }
        in_combat(): number {
            return globalState.inCombat ? 1 : 0
        }
        get_current_town(): number {
            return currentMapID !== null ? currentMapID : 0
        }
        critter_is_dead(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('critter_is_dead: not a game object', undefined, this)
                return 0
            }
            if (obj.type !== 'critter') {
                warn('critter_is_dead: not a critter: ' + obj, undefined, this)
                return 0
            }
            const hp = (obj as Critter).getStat('HP')
            return hp <= 0 ? 1 : 0
        }
        get_dialogue_active(): number {
            return currentDialogueObject !== null ? 1 : 0
        }

        // sfall extended opcodes — kill count helpers (0x8170–0x8171)
        get_critter_kills(killType: number): number {
            // Return the number of kills of the given kill-type recorded on the
            // player.  Kill types are the KILL_TYPE_* constants (0 = men,
            // 3 = super mutants, 4 = ghouls, …).  The counts are stored on
            // globalState so they survive map transitions within a session.
            const counts = globalState.critterKillCounts
            if (!counts) return 0
            return counts[killType] ?? 0
        }
        set_critter_kills(killType: number, amount: number): void {
            // Overwrite the kill count for the given kill type.
            if (!globalState.critterKillCounts) {
                ;(globalState as any).critterKillCounts = {}
            }
            globalState.critterKillCounts[killType] = Math.max(0, amount)
        }

        // sfall extended opcodes — critter body type (0x8172)
        get_critter_body_type(obj: Obj): number {
            // Return the body-type index from the critter's prototype.
            // 0 = biped, 1 = quadruped, 2 = robotic, 3 = bat, …
            // Used by combat AI and animation scripts to gate attack modes.
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_body_type: not a critter: ' + obj)
                return 0
            }
            const critter = obj as Critter
            // bodyType is stored in the critter prototype extra data.
            if (critter.pro?.extra?.bodyType !== undefined) return critter.pro.extra.bodyType
            return 0
        }

        // sfall extended opcodes — math floor (0x8173)
        floor2(x: number): number {
            // Integer floor — mirrors the sfall floor2() opcode used by drug
            // duration and formula scripts (distinct from the integer division
            // already available via the division opcode).
            return Math.floor(x)
        }

        // sfall extended opcodes — count objects on map by PID (0x8174)
        obj_count_by_pid(mapPID: number): number {
            // Return the number of live objects on the current map whose PID
            // matches `mapPID`.  Used by scripted encounter clean-up and loot
            // scripts to check whether all enemies are dead.
            if (!globalState.gMap) return 0
            let count = 0
            for (const level of globalState.gMap.objects) {
                if (!level) continue
                for (const obj of level) {
                    if (obj.pid === mapPID) count++
                }
            }
            return count
        }

        // sfall extended opcodes — string comparison (0x8175)
        string_compare(str1: string, str2: string, caseSensitive: number): number {
            // Returns 0 if the strings are equal, non-zero otherwise.
            // caseSensitive: 0 = case-insensitive, 1 = case-sensitive.
            const a = typeof str1 === 'string' ? str1 : String(str1)
            const b = typeof str2 === 'string' ? str2 : String(str2)
            if (caseSensitive) return a === b ? 0 : 1
            return a.toLowerCase() === b.toLowerCase() ? 0 : 1
        }

        // sfall extended opcodes — substring extraction (0x8176)
        substr(str: string, start: number, len: number): string {
            // Returns a substring of `str` starting at `start` with length `len`.
            // Negative `len` means "to end of string".  Mirrors sfall substr().
            if (typeof str !== 'string') return ''
            const s = start < 0 ? Math.max(0, str.length + start) : start
            if (len < 0) return str.slice(s)
            return str.slice(s, s + len)
        }

        // sfall extended opcodes — session uptime (0x8177)
        get_uptime(): number {
            // Returns milliseconds since the page was loaded.  Used by scripts
            // that want to measure real-world elapsed time (e.g. anti-exploit timers).
            return typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0
        }

        // sfall extended opcodes — type conversion (0x8190–0x8191)
        string_to_int(str: any): number {
            // Parse a string as a base-10 integer.  Mirrors sfall string_to_int().
            // Returns 0 for non-string inputs or strings that cannot be parsed.
            // parseInt already handles leading/trailing whitespace, so no trim needed.
            if (typeof str !== 'string') return 0
            const n = parseInt(str, 10)
            return Number.isFinite(n) ? n : 0
        }
        int_to_string(n: any): string {
            // Convert a number to its decimal string representation.  Mirrors
            // the sfall sprintf("%d", n) pattern commonly used for display and logging.
            // Returns '0' for non-number inputs to match sfall's safe-zero default for
            // invalid arguments (consistent with how string_to_int returns 0 on error).
            if (typeof n !== 'number') return '0'
            return Math.trunc(n).toString()
        }

        // sfall extended opcode — C-style single-argument string format (0x8192).
        // sprintf(format, arg) → formatted string.
        // Supports: %d/%i (decimal int), %s (string), %x (hex int), %c (char), %% (literal %).
        // This is one of the most commonly used sfall opcodes; many scripts use it for
        // display messages, UI labels, and debug output.
        sprintf(fmt: any, arg: any): string {
            if (typeof fmt !== 'string') return String(fmt ?? '')
            // Replace each format specifier with the corresponding formatted value.
            // The %%|%([disxci]) pattern handles: %% → literal %, and %d/%i/%s/%x/%c specifiers.
            return fmt.replace(/%%|%([disxci])/g, (match: string, spec?: string) => {
                if (!spec) return '%'
                const n = typeof arg === 'number' ? Math.trunc(arg) : (parseInt(String(arg), 10) || 0)
                switch (spec) {
                    case 'd':
                    case 'i':
                        return n.toString()
                    case 's':
                        return typeof arg === 'string' ? arg : String(arg ?? '')
                    case 'x':
                        return (n >>> 0).toString(16)
                    case 'c':
                        return typeof arg === 'number' ? String.fromCharCode(arg) : ''
                    default:
                        return match
                }
            })
        }

        // sfall extended opcode — check whether an object has a script attached (0x8193).
        // obj_has_script(obj) → 1 if obj has a script, 0 otherwise.
        // Used by scripts that conditionally call procedures only on scripted objects
        // to avoid crashing when triggering NPC interactions on unscripted objects.
        obj_has_script(obj: Obj): number {
            if (!isGameObject(obj)) return 0
            return (obj as any)._script ? 1 : 0
        }

        // sfall extended opcode — get tile FID at tile/elevation (0x8194).
        // get_tile_fid(tile, elevation) → FID value of the floor tile, or 0 if unavailable.
        // Used by map scripts that inspect or modify the visual appearance of tiles.
        get_tile_fid(tile: number, elevation: number): number {
            log('get_tile_fid', arguments, 'tiles')
            // Tile FID read-back is not yet wired to the renderer's tile cache.
            // Return 0 as a safe partial implementation so scripts that check the
            // return value do not use stale data to make destructive decisions.
            return 0
        }

        // sfall extended opcode — set tile FID at tile/elevation (0x8195).
        // set_tile_fid(tile, elevation, fid) — override the floor tile art.
        // The browser build does not yet support runtime tile art patching;
        // calls are logged and treated as a no-op until the renderer gains support.
        set_tile_fid(tile: number, elevation: number, fid: number): void {
            log('set_tile_fid', arguments, 'tiles')
        }

        // sfall extended opcode — get critter flags bitmask (0x8196).
        // get_critter_flags(obj) → integer bitmask of engine-level critter flags.
        // Maps to the `flags` field used internally by vanilla Fallout 2 critter records.
        get_critter_flags(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_flags: not a critter: ' + obj, undefined, this)
                return 0
            }
            const c = obj as Critter
            let flags = 0
            if (c.dead)             flags |= 0x0001  // CRITTER_FLAG_DEAD
            if (c.knockedOut)       flags |= 0x0002  // CRITTER_FLAG_KNOCKED_OUT
            if (c.knockedDown)      flags |= 0x0004  // CRITTER_FLAG_KNOCKED_DOWN
            if (c.crippledLeftLeg)  flags |= 0x0008  // CRITTER_FLAG_CRIPPLED_LEFT_LEG
            if (c.crippledRightLeg) flags |= 0x0010  // CRITTER_FLAG_CRIPPLED_RIGHT_LEG
            if (c.crippledLeftArm)  flags |= 0x0020  // CRITTER_FLAG_CRIPPLED_LEFT_ARM
            if (c.crippledRightArm) flags |= 0x0040  // CRITTER_FLAG_CRIPPLED_RIGHT_ARM
            if (c.blinded)          flags |= 0x0080  // CRITTER_FLAG_BLINDED
            return flags
        }

        // sfall extended opcode — set critter flags bitmask (0x8197).
        // set_critter_flags(obj, flags) — override engine-level critter flags in bulk.
        // Only the flag bits that map to tracked critter injury state are written back.
        set_critter_flags(obj: Obj, flags: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_flags: not a critter: ' + obj, undefined, this)
                return
            }
            const c = obj as Critter
            c.dead             = !!(flags & 0x0001)
            c.knockedOut       = !!(flags & 0x0002)
            c.knockedDown      = !!(flags & 0x0004)
            c.crippledLeftLeg  = !!(flags & 0x0008)
            c.crippledRightLeg = !!(flags & 0x0010)
            c.crippledLeftArm  = !!(flags & 0x0020)
            c.crippledRightArm = !!(flags & 0x0040)
            c.blinded          = !!(flags & 0x0080)
        }

        // sfall extended opcodes — weapon ammo PID getter/setter (0x8178–0x8179)
        get_weapon_ammo_pid(weapon: Obj): number {
            // Return the ammo type PID currently loaded in the weapon.
            // Uses the runtime ammoType field if set, otherwise falls back to
            // the proto's required ammo PID (ammoPID).
            if (!isGameObject(weapon)) {
                warn('get_weapon_ammo_pid: not a game object: ' + weapon)
                return -1
            }
            if (weapon.extra?.ammoType !== undefined && weapon.extra.ammoType !== -1) {
                return weapon.extra.ammoType
            }
            return weapon.pro?.extra?.ammoPID ?? -1
        }
        set_weapon_ammo_pid(weapon: Obj, pid: number): void {
            // Set the ammo type PID loaded in a weapon.  The change is stored in
            // extra.ammoType so it survives map serialization.
            if (!isGameObject(weapon)) {
                warn('set_weapon_ammo_pid: not a game object: ' + weapon)
                return
            }
            if (!weapon.extra) weapon.extra = {}
            weapon.extra.ammoType = pid
        }

        // sfall extended opcodes — weapon ammo count getter/setter (0x817A–0x817B)
        get_weapon_ammo_count(weapon: Obj): number {
            // Return the number of rounds currently loaded in the weapon.
            if (!isGameObject(weapon)) {
                warn('get_weapon_ammo_count: not a game object: ' + weapon)
                return 0
            }
            return weapon.extra?.ammoLoaded ?? 0
        }
        set_weapon_ammo_count(weapon: Obj, count: number): void {
            // Set the number of rounds currently loaded in the weapon.
            if (!isGameObject(weapon)) {
                warn('set_weapon_ammo_count: not a game object: ' + weapon)
                return
            }
            if (!weapon.extra) weapon.extra = {}
            weapon.extra.ammoLoaded = Math.max(0, count)
        }

        // sfall extended opcode — tile number under mouse cursor (0x817C)
        get_mouse_tile_num(): number {
            // In a browser/VM context the mouse position is not directly available
            // to scripts running without a live DOM event.  Return -1 to signal
            // "no tile under cursor" — the same value the original engine returns
            // when the mouse is outside the map area.
            return -1
        }

        // sfall extended opcode — get the display name of any game object (0x817D)
        get_critter_name(obj: Obj): string {
            if (!isGameObject(obj)) return ''
            return (obj as any).name ?? ''
        }

        // sfall extended opcode — current game mode bitmask (0x817E).
        // Returns a bitmask encoding the current engine state:
        //   0x01 = combat is active
        //   0x02 = dialogue is active
        //   0x04 = world map is open
        //   0x08 = barter mode is active
        // Scripts use this to gate combat-only or dialogue-only code paths.
        get_game_mode(): number {
            let mode = 0
            if (globalState.inCombat) mode |= 1
            if (currentDialogueObject !== null) mode |= 2
            return mode
        }

        // sfall extended opcode — set the repeat interval for the global map script (0x817F).
        // Partial: the engine does not run a global script ticker; this is a no-op.
        set_global_script_repeat(intervalMs: number): void {
            log('set_global_script_repeat', arguments)
        }

        // sfall extended opcode — get a critter's derived skill value (0x8180).
        // Mirrors has_skill() but exposed as a dedicated sfall opcode.
        get_critter_skill(obj: Obj, skill: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_skill: not a critter: ' + obj)
                return 0
            }
            const skillName = skillNumToName[skill]
            if (!skillName) {
                warn('get_critter_skill: unknown skill number: ' + skill)
                return 0
            }
            return (obj as Critter).getSkill(skillName)
        }

        // sfall extended opcode — set a critter's base skill point allocation (0x8181).
        // Sets the base skill value directly (does not add; use critter_mod_skill to adjust).
        set_critter_skill_points(obj: Obj, skill: number, value: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_skill_points: not a critter: ' + obj)
                return
            }
            const skillName = skillNumToName[skill]
            if (!skillName) {
                warn('set_critter_skill_points: unknown skill number: ' + skill)
                return
            }
            ;(obj as Critter).skills.setBase(skillName, value)
        }

        // sfall extended opcode — get current ambient light level (0x8182).
        // Returns the engine's ambient light level in the range 0–65536.
        // (0 = fully dark, 65536 = fully lit.)
        get_light_level(): number {
            return globalState.ambientLightLevel ?? 65536
        }

        // sfall extended opcode — get current HP of a critter (0x8183).
        // Convenience wrapper equivalent to get_critter_stat(obj, STAT_HP/35).
        get_critter_hp(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_hp: not a critter: ' + obj)
                return 0
            }
            return (obj as Critter).getStat('HP')
        }

        // sfall extended opcode — set current HP of a critter (0x8184).
        // Directly writes the critter's current HP stat via stats.setBase('HP', …).
        set_critter_hp(obj: Obj, hp: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_hp: not a critter: ' + obj)
                return
            }
            ;(obj as Critter).stats.setBase('HP', Math.max(0, hp))
        }

        // sfall extended opcode — get max action points for a critter (0x8185).
        // Returns the critter's maximum AP derived stat.
        get_critter_max_ap(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_max_ap: not a critter: ' + obj)
                return 0
            }
            return (obj as Critter).getStat('AP')
        }

        // sfall extended opcodes — object list iteration (0x8186–0x8188).
        //
        // `list_begin(type)` starts an iteration over game objects on the current
        // elevation.  Type constants:
        //   0 = LIST_ALL — all objects (items, critters, scenery, etc.)
        //   1 = LIST_CRITTERS — living critters only
        //   2 = LIST_GROUNDITEMS — items on the ground (not held)
        //
        // `list_next()` advances the iterator and returns the next object, or 0
        // when the iteration is exhausted.
        //
        // `list_end()` disposes the current iterator (no-op in this implementation
        // because we store only an index rather than a live cursor).
        list_begin(listType: number): Obj | null {
            if (!globalState.gMap || !globalState.gMap.objects) {
                this._listIterObjects = []
                this._listIterIndex = 0
                return null
            }
            const elevation = globalState.gMap.currentElevation ?? 0
            const all: Obj[] = globalState.gMap.objects[elevation] ?? []
            switch (listType) {
                case 1: // LIST_CRITTERS
                    this._listIterObjects = all.filter((o) => o.type === 'critter' && !(o as Critter).dead)
                    break
                case 2: // LIST_GROUNDITEMS
                    this._listIterObjects = all.filter((o) => o.type !== 'critter' && o.type !== 'misc')
                    break
                default: // LIST_ALL (0) and any unknown type
                    this._listIterObjects = all.slice()
                    break
            }
            this._listIterIndex = 0
            return this._listIterObjects.length > 0 ? this._listIterObjects[0] : null
        }
        list_next(): Obj | null {
            this._listIterIndex = (this._listIterIndex ?? 0) + 1
            const objs = this._listIterObjects ?? []
            if (this._listIterIndex >= objs.length) return null
            return objs[this._listIterIndex]
        }
        list_end(): void {
            this._listIterObjects = []
            this._listIterIndex = 0
        }
        // Internal state for sfall list iteration (not serialized).
        _listIterObjects: Obj[] = []
        _listIterIndex: number = 0

        // sfall extended opcode — tile number N steps in a direction (0x8189).
        // tile_num_in_direction(tile, dir, count):
        //   tile  — starting tile number
        //   dir   — direction (0-5, same hex-grid directions as obj.orientation)
        //   count — number of steps to take in that direction
        // Returns the tile number of the destination, or the original tile when
        // the input is out of range (count <= 0 or bad tile).
        tile_num_in_direction(tile: number, dir: number, count: number): number {
            if (typeof tile !== 'number' || typeof dir !== 'number' || typeof count !== 'number') return tile ?? 0
            if (count <= 0) return tile
            const start = fromTileNum(tile)
            if (!start) return tile
            const dest = hexInDirectionDistance(start, ((dir % 6) + 6) % 6, count)
            return toTileNum(dest)
        }

        // sfall extended opcode — get elevation of an object (0x818A).
        // Returns the current elevation (0-based floor index) that the given
        // object belongs to.  In the browser build, all visible objects share
        // the current elevation so we return globalState.currentElevation.
        get_obj_elevation(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_obj_elevation: not a game object: ' + obj)
                return 0
            }
            return globalState.currentElevation ?? 0
        }

        // sfall extended opcodes 0x818B–0x818F
        get_object_art_fid(obj: Obj): number {
            // Return the object's current art FID (Fallout Resource Image identifier).
            // Used by appearance and disguise scripts to read what sprite a critter uses.
            if (!isGameObject(obj)) {
                warn('get_object_art_fid: not a game object: ' + obj)
                return 0
            }
            // FID encoding: (frmType << 24) | frmPID
            const frmType = (obj as any).frmType ?? 0
            const frmPID = (obj as any).frmPID ?? (obj as any).fid ?? 0
            return (frmType << 24) | (frmPID & 0xffffff)
        }
        set_object_art_fid(obj: Obj, fid: number): void {
            // Set the object's art FID so it renders a different sprite.
            // Used by disguise and appearance-change scripts.
            if (!isGameObject(obj)) {
                warn('set_object_art_fid: not a game object: ' + obj)
                return
            }
            ;(obj as any).frmType = (fid >> 24) & 0xff
            ;(obj as any).frmPID = fid & 0xffffff
            ;(obj as any).fid = fid & 0xffffff
            log('set_object_art_fid: fid=0x' + fid.toString(16), arguments)
        }
        get_critter_combat_ap(obj: Obj): number {
            // Return the critter's current action points during combat.
            // Returns 0 outside of combat (critter.AP.combat is the in-combat pool).
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_combat_ap: not a critter: ' + obj)
                return 0
            }
            return (obj as Critter).AP ? (obj as Critter).AP.combat : 0
        }
        set_critter_combat_ap(obj: Obj, ap: number): void {
            // Set the critter's current action points during combat.
            // No-op outside of combat.
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_combat_ap: not a critter: ' + obj)
                return
            }
            const critter = obj as Critter
            if (critter.AP) critter.AP.combat = Math.max(0, ap)
        }
        get_script_return_value(): number {
            // Return the most recent sfall hook-script return value.
            // Hook scripts are not implemented in the browser build; return 0.
            return 0
        }

        load_map(map: number | string, startLocation: number) {
            log('load_map', arguments)
            info('load_map: ' + map)
            if (typeof map === 'string') globalState.gMap.loadMap(map.split('.')[0].toLowerCase())
            else globalState.gMap.loadMapByID(map)
        }
        play_gmovie(movieID: number) {
            // Play a full-motion video clip by ID.  The browser build does not
            // currently have an FMV pipeline, so we skip playback silently rather
            // than emitting a stub warning on every intro/cut-scene trigger.
            log('play_gmovie', arguments)
        }
        mark_area_known(areaType: number, area: number, markState: number) {
            if (areaType === 0) {
                // MARK_TYPE_TOWN
                if (markState === -66) {
                    // MARK_STATE_INVISIBLE — hide the area
                    if (globalState.markAreaKnown) globalState.markAreaKnown(area, 0)
                } else {
                    // MARK_STATE_UNKNOWN (0), MARK_STATE_KNOWN (1), MARK_STATE_VISITED (2)
                    if (globalState.markAreaKnown) globalState.markAreaKnown(area, markState)
                    else log('mark_area_known', arguments)
                }
            } else if (areaType === 1) {
                // MARK_TYPE_MAP — individual map reveal within a town area.
                // Currently no per-map fog-of-war is tracked, so we log and
                // treat the call as a no-op rather than emitting a stub warning.
                log('mark_area_known', arguments)
            } else {
                // Unknown area type — log silently rather than throwing, so that scripts
                // using sfall-extended or future area type constants do not crash the
                // browser runtime.
                log('mark_area_known: unknown areaType ' + areaType + ' — no-op', arguments)
            }
        }
        wm_area_set_pos(area: number, x: number, y: number) {
            log('wm_area_set_pos', arguments)
        }
        game_ui_disable() {
            log('game_ui_disable', arguments)
            globalState.gameUIDisabled = true
        }
        game_ui_enable() {
            log('game_ui_enable', arguments)
            globalState.gameUIDisabled = false
        }

        // sound
        play_sfx(sfx: string) {
            log('play_sfx', arguments)
            globalState.audioEngine.playSfx(sfx)
        }

        // party
        party_member_obj(pid: number) {
            log('party_member_obj', arguments, 'party')
            return globalState.gParty.getPartyMemberByPID(pid) || 0
        }
        party_add(obj: Critter) {
            log('party_add', arguments)
            globalState.gParty.addPartyMember(obj)
        }
        party_remove(obj: Critter) {
            log('party_remove', arguments)
            globalState.gParty.removePartyMember(obj)
        }

        // sfall extended opcode — read an INI setting by key string (0x8198).
        // Partial: the browser build has no INI file layer; always returns 0.
        get_ini_setting(key: string): number {
            log('get_ini_setting', arguments)
            return 0
        }

        // sfall extended opcode — return the player's currently active hand (0x8199).
        // 0 = primary hand (left), 1 = secondary hand (right).
        // Partial: returns 0 (primary) as a safe default; active-hand state is not
        // tracked separately in the browser build.
        active_hand(): number {
            return 0
        }

        // sfall hook-script opcode — set the return value for a hook script (0x819A).
        // No-op in the browser build; hook scripts are not implemented.
        set_sfall_return(val: number): void {
            log('set_sfall_return', arguments)
        }

        // sfall hook-script opcode — get a hook-script argument by index (0x819B).
        // Partial: returns 0; hook scripts are not implemented in the browser build.
        get_sfall_arg(): number {
            log('get_sfall_arg', arguments)
            return 0
        }

        // sfall extended opcode — return the world-map X coordinate (0x819C).
        get_world_map_x(): number {
            return globalState.worldPosition ? globalState.worldPosition.x : 0
        }

        // sfall extended opcode — return the world-map Y coordinate (0x819D).
        get_world_map_y(): number {
            return globalState.worldPosition ? globalState.worldPosition.y : 0
        }

        // sfall extended opcode — teleport world-map cursor to (x, y) (0x819E).
        set_world_map_pos(x: number, y: number): void {
            log('set_world_map_pos', arguments)
            globalState.worldPosition = { x, y }
        }

        // sfall extended opcode — 1 if the player is currently on the world map (0x819F).
        // Partial: returns 1 when no map is loaded (between maps), 0 otherwise.
        in_world_map(): number {
            return !globalState.gMap || !globalState.gMap.name ? 1 : 0
        }

        // sfall extended opcode — return the character level of a critter (0x81A0).
        get_critter_level(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_level: not a critter: ' + obj, undefined, this)
                return 0
            }
            // `level` is defined on Player; NPCs carry it as a dynamic property.
            return (obj as any).level ?? 1
        }

        // sfall extended opcode — override a critter's character level (0x81A1).
        set_critter_level(obj: Obj, level: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_level: not a critter: ' + obj, undefined, this)
                return
            }
            // `level` is defined on Player; set it as a dynamic property for NPCs.
            ;(obj as any).level = Math.max(1, level)
        }

        // sfall extended opcode — return the weight of an object in lbs (0x81A2).
        get_object_weight(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_weight: not a game object: ' + obj, undefined, this)
                return 0
            }
            // Weight is stored in proto data as weight in lbs * 10 (grams).
            const pro = (obj as any).pro
            if (pro?.extra?.weight !== undefined) return Math.round(pro.extra.weight / 10)
            if (pro?.weight !== undefined) return Math.round(pro.weight / 10)
            return 0
        }

        // sfall extended opcode — get a string value from the mod's INI configuration (0x81A3).
        // Partial: no INI file system in browser build; returns empty string.
        get_ini_string(key: string): string {
            log('get_ini_string', arguments)
            return ''
        }

        // sfall extended opcode — set the global script type (0x81A4).
        // 0=map-update script, 1=combat script. No-op in browser build (no global script ticker).
        set_global_script_type(type: number): void {
            log('set_global_script_type', arguments)
        }

        // sfall extended opcode — get in-game calendar year (0x81A5).
        // Game epoch is year 2241; uses 360-day years (12 × 30-day months).
        get_year(): number {
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            return 2241 + Math.floor(days / 360)
        }

        // sfall extended opcode — get in-game calendar month (0x81A6).
        // Returns 1–12; Fallout 2 uses 30-day months.
        get_month(): number {
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            return (Math.floor(days / 30) % 12) + 1
        }

        // sfall extended opcode — get in-game calendar day of month (0x81A7).
        // Returns 1–30; Fallout 2 uses 30-day months.
        get_day(): number {
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            return (days % 30) + 1
        }

        // sfall extended opcode — get free movement AP for the current combat turn (0x81A8).
        // "Free move" AP are bonus movement points that can only be spent on movement,
        // not attacks.  Returns the critter's current freeMoveAP field; defaults to 0.
        get_combat_free_move(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_combat_free_move: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).freeMoveAP ?? 0
        }

        // sfall extended opcode — set free movement AP for the current combat turn (0x81A9).
        // Clamped to >= 0.  Used by level-scaling and difficulty scripts.
        set_combat_free_move(obj: Obj, ap: number): void {
            if (!isGameObject(obj)) {
                warn('set_combat_free_move: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).freeMoveAP = Math.max(0, typeof ap === 'number' ? ap : 0)
        }

        _serialize(): SerializedScript {
            return { name: this.scriptName, lvars: Object.assign({}, this.lvars) }
        }
    }

    export function deserializeScript(obj: SerializedScript): Script {
        var script = loadScript(obj.name)
        script.lvars = obj.lvars
        // TODO: do some kind of logic like enterMap/updateMap
        return script
    }

    function loadMessageFile(name: string) {
        name = name.toLowerCase()
        info('loading message file: ' + name, 'load')
        var msg = getFileText('data/text/english/dialog/' + name + '.msg')
        if (scriptMessages[name] === undefined) scriptMessages[name] = {}

        // parse message file
        var lines = msg.split(/\r|\n/)

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
            var m = lines[i].match(/\{(\d+)\}\{.*\}\{(.*)\}/)
            if (m === null) {
                warn('message parsing: skipping invalid line: ' + lines[i])
                continue
            }
            // HACK: replace unicode replacement character with an apostrophe (because the Web sucks at character encodings)
            scriptMessages[name][parseInt(m[1])] = m[2].replace(/\ufffd/g, "'")
        }
    }

    export function setMapScript(script: Script) {
        currentMapObject = script
    }

    export function loadScript(name: string): Script {
        info('loading script ' + name, 'load')

        var path = 'data/scripts/' + name.toLowerCase() + '.int'
        var data: DataView = getFileBinarySync(path)
        var reader = new BinaryReader(data)
        //console.log("[%s] loaded %d bytes", name, reader.length)
        var intfile = parseIntFile(reader, name.toLowerCase())

        //console.log("%s int file: %o", name, intfile)

        if (!currentMapObject) {
            // This script is its own map script; common for standalone map entry points.
        }

        reader.seek(0)
        var vm = new ScriptVMBridge.GameScriptVM(reader, intfile)
        vm.scriptObj.scriptName = name
        vm.scriptObj.lvars = {}
        vm.scriptObj._mapScript = currentMapObject || vm.scriptObj // map scripts are their own map scripts
        vm.scriptObj._vm = vm
        vm.run()

        // return the scriptObj, which is a clone of ScriptProto
        // which will be patched by the GameScriptVM to allow
        // transparent procedure calls
        return vm.scriptObj
    }

    export function initScript(script: Script, obj: Obj) {
        script.self_obj = obj as ScriptableObj
        script.cur_map_index = currentMapID!
        if (script.start !== undefined) {
            trackScriptTrigger(script, 'start')
            script.start()
            flushUnsupportedVMOperations(script)
        }
    }

    export function timedEvent(script: Script, userdata: any): boolean {
        info('timedEvent: ' + script.scriptName + ': ' + userdata, 'timer')
        if (script.timed_event_p_proc === undefined) {
            warn(
                `timedEvent called on script without a timed_event_p_proc! script: ${script.scriptName} userdata: ${userdata}`
            )
            return false
        }

        script.fixed_param = userdata
        script._didOverride = false
        trackScriptTrigger(script, 'timed_event_p_proc')
        script.timed_event_p_proc()
        flushUnsupportedVMOperations(script)
        return script._didOverride
    }

    export function use(obj: Obj, source: Obj): boolean | null {
        if (!obj._script || obj._script.use_p_proc === undefined) return null

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'use_p_proc')
        obj._script.use_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function lookAt(obj: Obj, source: Obj): boolean | null {
        if (!obj._script || obj._script.look_at_p_proc === undefined) return null

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'look_at_p_proc')
        obj._script.look_at_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function description(obj: Obj, source: Obj): boolean | null {
        if (!obj._script || obj._script.description_p_proc === undefined) return null

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'description_p_proc')
        obj._script.description_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function talk(script: Script, obj: Obj): boolean {
        script.self_obj = obj as ScriptableObj
        script.game_time = Math.max(1, globalState.gameTickTime)
        script.cur_map_index = currentMapID
        script._didOverride = false
        trackScriptTrigger(script, 'talk_p_proc')
        script.talk_p_proc()
        flushUnsupportedVMOperations(script)
        return script._didOverride
    }

    export function updateCritter(script: Script, obj: Critter): boolean {
        // critter heartbeat (critter_p_proc)
        if (!script.critter_p_proc) return false // TODO: Should we override or not if it doesn't exist? Probably not.

        script.game_time = globalState.gameTickTime
        script.cur_map_index = currentMapID
        script._didOverride = false
        script.self_obj = obj as ScriptableObj
        script.self_tile = toTileNum(obj.position)
        trackScriptTrigger(script, 'critter_p_proc')
        script.critter_p_proc()
        flushUnsupportedVMOperations(script)
        return script._didOverride
    }

    export function spatial(spatialObj: Obj, source: Obj) {
        // TODO: Spatial type
        const script = spatialObj._script
        if (!script) return // no script attached — silently ignore
        if (!script.spatial_p_proc) return // no spatial_p_proc defined — silently ignore

        script.game_time = globalState.gameTickTime
        script.cur_map_index = currentMapID
        script.source_obj = source
        script.self_obj = spatialObj as ScriptableObj
        trackScriptTrigger(script, 'spatial_p_proc')
        script.spatial_p_proc()
        flushUnsupportedVMOperations(script)
    }

    export function destroy(obj: Obj, source?: Obj) {
        if (!obj._script || !obj._script.destroy_p_proc) return null

        obj._script.self_obj = obj as ScriptableObj
        obj._script.source_obj = source || 0
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'destroy_p_proc')
        obj._script.destroy_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function damage(obj: Obj, target: Obj, source: Obj, damage: number) {
        if (!obj._script || obj._script.damage_p_proc === undefined) return null

        obj._script.self_obj = obj as ScriptableObj
        obj._script.target_obj = target
        obj._script.source_obj = source
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'damage_p_proc')
        obj._script.damage_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function useSkillOn(who: Critter, skillId: number, obj: Obj): boolean {
        if (!obj._script) return false // no script on this object — treat as no-override
        obj._script.self_obj = obj as ScriptableObj
        obj._script.source_obj = who
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        obj._script.action_being_used = skillId
        trackScriptTrigger(obj._script, 'use_skill_on_p_proc')
        obj._script.use_skill_on_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function pickup(obj: Obj, source: Critter): boolean {
        if (!obj._script) return false // no script — default pickup behaviour applies
        obj._script.self_obj = obj as ScriptableObj
        obj._script.source_obj = source
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'pickup_p_proc')
        obj._script.pickup_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function useObjOn(obj: Obj, item: Obj): boolean | null {
        if (!obj._script || obj._script.use_obj_on_p_proc === undefined) return null

        obj._script.source_obj = item as Obj
        obj._script.self_obj = obj as ScriptableObj
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'use_obj_on_p_proc')
        obj._script.use_obj_on_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function push(obj: Obj, source: Critter): boolean | null {
        if (!obj._script || obj._script.push_p_proc === undefined) return null

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'push_p_proc')
        obj._script.push_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function isDropping(obj: Obj, source: Critter): boolean | null {
        if (!obj._script || obj._script.is_dropping_p_proc === undefined) return null

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'is_dropping_p_proc')
        obj._script.is_dropping_p_proc()
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function combatEvent(obj: Obj, event: 'turnBegin'): boolean {
        if (!obj._script) return false // no script — not a bug; many map objects lack one

        let fixed_param: number | null = null
        switch (event) {
            case 'turnBegin':
                fixed_param = 4
                break // COMBAT_SUBTYPE_TURN
            default:
                console.warn('combatEvent: unknown event ' + event + ' — ignoring')
                return false
        }

        if (!obj._script.combat_p_proc) return false

        info('[COMBAT EVENT ' + event + ']')

        obj._script.combat_is_initialized = 1
        obj._script.fixed_param = fixed_param
        obj._script.self_obj = obj as ScriptableObj
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false

        // TODO: script_overrides

        // hack so that the procedure is allowed to finish before
        // we actually terminate combat
        var doTerminate: any = false // did combat_p_proc terminate combat?
        obj._script.terminate_combat = function () {
            doTerminate = true
        }
        trackScriptTrigger(obj._script, 'combat_p_proc')
        obj._script.combat_p_proc()
        flushUnsupportedVMOperations(obj._script)

        if (doTerminate) {
            info('[combatEvent] combat_p_proc requested terminate_combat')
            Script.prototype.terminate_combat.call(obj._script) // call original
        }

        return doTerminate
    }

    export function updateMap(mapScript: Script, objects: Obj[], elevation: number) {
        gameObjects = objects
        mapFirstRun = false

        if (mapScript) {
            mapScript.combat_is_initialized = globalState.inCombat ? 1 : 0
            if (mapScript.map_update_p_proc !== undefined) {
                mapScript.self_obj = { _script: mapScript }
                trackScriptTrigger(mapScript, 'map_update_p_proc')
                mapScript.map_update_p_proc()
                flushUnsupportedVMOperations(mapScript)
            }
        }

        const secs = Math.floor(globalState.gameTickTime / 10) % 86400
        const currentHour = Math.floor(secs / 3600) * 100 + Math.floor((secs % 3600) / 60)

        var updated = 0
        for (var i = 0; i < gameObjects.length; i++) {
            var script = gameObjects[i]._script
            if (script !== undefined && script.map_update_p_proc !== undefined) {
                script.combat_is_initialized = globalState.inCombat ? 1 : 0
                script.self_obj = gameObjects[i] as ScriptableObj
                script.game_time = Math.max(1, globalState.gameTickTime)
                script.game_time_hour = currentHour
                script.cur_map_index = currentMapID
                trackScriptTrigger(script, 'map_update_p_proc')
                script.map_update_p_proc()
                flushUnsupportedVMOperations(script)
                updated++
            }
        }

        // info("updated " + updated + " objects")
    }

    export function exitMap(mapScript: Script, objects: Obj[], elevation: number, mapID: number): void {
        gameObjects = objects

        if (mapScript && mapScript.map_exit_p_proc !== undefined) {
            mapScript.self_obj = { _script: mapScript }
            mapScript.game_time = Math.max(1, globalState.gameTickTime)
            mapScript.cur_map_index = mapID
            trackScriptTrigger(mapScript, 'map_exit_p_proc')
            mapScript.map_exit_p_proc()
            flushUnsupportedVMOperations(mapScript)
        }

        for (let i = 0; i < gameObjects.length; i++) {
            const script = gameObjects[i]._script
            if (script !== undefined && script.map_exit_p_proc !== undefined) {
                script.self_obj = gameObjects[i] as ScriptableObj
                script.game_time = Math.max(1, globalState.gameTickTime)
                script.cur_map_index = mapID
                trackScriptTrigger(script, 'map_exit_p_proc')
                script.map_exit_p_proc()
                flushUnsupportedVMOperations(script)
            }
        }
    }

    export function enterMap(
        mapScript: Script,
        objects: Obj[],
        elevation: number,
        mapID: number,
        isFirstRun: boolean
    ): StartPos | null {
        gameObjects = objects
        currentMapID = mapID
        mapFirstRun = isFirstRun

        if (mapScript && mapScript.map_enter_p_proc !== undefined) {
            info('calling map enter')
            mapScript.self_obj = { _script: mapScript }
            trackScriptTrigger(mapScript, 'map_enter_p_proc')
            mapScript.map_enter_p_proc()
            flushUnsupportedVMOperations(mapScript)
        }

        if (overrideStartPos) {
            const r = overrideStartPos
            overrideStartPos = null
            return r
        }

        // XXX: caller should do this for all objects, which is better?
        /*for(var i = 0; i < gameObjects.length; i++) {
            objectEnterMap(gameObjects[i], elevation, mapID)			
        }*/

        return null
    }

    export function objectEnterMap(obj: Obj, elevation: number, mapID: number) {
        var script = obj._script
        if (script !== undefined && script.map_enter_p_proc !== undefined) {
            const secs = Math.floor(globalState.gameTickTime / 10) % 86400
            script.combat_is_initialized = 0
            script.self_obj = obj as ScriptableObj
            script.game_time = Math.max(1, globalState.gameTickTime)
            script.game_time_hour = Math.floor(secs / 3600) * 100 + Math.floor((secs % 3600) / 60)
            script.cur_map_index = currentMapID
            trackScriptTrigger(script, 'map_enter_p_proc')
            script.map_enter_p_proc()
            flushUnsupportedVMOperations(script)
        }
    }

    export function reset(mapName: string, mapID?: number) {
        timeEventList.length = 0 // clear timed events
        dialogueOptionProcs.length = 0
        gameObjects = null
        currentMapObject = null
        currentMapID = mapID !== undefined ? mapID : null
        mapVars = {}
    }

    export function init(mapName: string, mapID?: number) {
        seed(123)
        reset(mapName, mapID)
    }
}
