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

    /**
     * Per-critter drug-effect tracking.
     *
     * Maps a critter object reference to the game-tick time at which its active
     * drug effect(s) expire.  Any drug item whose use_p_proc fires marks the
     * using/target critter for the default Fallout 2 drug duration (600 ticks =
     * 60 seconds).  metarule(18) (CRITTER_ON_DRUGS) and metarule(44)
     * (WHO_ON_DRUGS) query this map to determine whether a critter is currently
     * under drug influence.
     *
     * A WeakRef-like approach is not needed here because the map is cleared on
     * every map transition (reset()), which is the natural lifetime boundary.
     */
    const _druggedCritters = new Map<object, number>()

    /** Default drug effect duration in game ticks (600 ticks = 60 in-game seconds). */
    const DRUG_EFFECT_TICKS = 600

    /**
     * Mark a critter as being under drug influence for the given duration.
     * Extends any existing drug timer to the later of the current and new expiry.
     */
    function markOnDrugs(critter: object, durationTicks: number = DRUG_EFFECT_TICKS): void {
        const newExpiry = globalState.gameTickTime + durationTicks
        const existing = _druggedCritters.get(critter) ?? 0
        _druggedCritters.set(critter, Math.max(existing, newExpiry))
    }

    /**
     * Return 1 if the given critter object is currently under drug influence, 0 otherwise.
     * Lazily evicts stale entries to avoid unbounded growth.
     */
    function isOnDrugs(obj: object): number {
        const expiry = _druggedCritters.get(obj)
        if (expiry === undefined) return 0
        if (globalState.gameTickTime >= expiry) {
            _druggedCritters.delete(obj)
            return 0
        }
        return 1
    }

    /**
     * Return true if the given game object is a drug item (Fallout 2 item subtype 2).
     * Centralises the check used by use() and useObjOn() to avoid duplication.
     */
    function isDrugItem(obj: any): boolean {
        return obj?.subtype === 'drug' || obj?.pro?.extra?.subType === 2
    }

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

    // BLK-123 (Phase 78) — sfall hook-script argument buffer.
    // When a hook script is invoked, its arguments are stored here.
    // get_sfall_arg() retrieves the next arg in sequence; set_sfall_return() stores
    // the return value; get_sfall_args_count() reports how many were provided.
    // This is a module-level buffer reset on each hook invocation.
    const _sfallHookArgs: any[] = []
    let _sfallHookArgCursor = 0
    let _sfallHookReturnVal: number = 0

    /**
     * Push arguments into the sfall hook arg buffer before invoking a hook script.
     * Called by the vm_bridge hook dispatcher.
     */
    export function sfallSetHookArgs(args: any[]): void {
        _sfallHookArgs.length = 0
        _sfallHookArgs.push(...args)
        _sfallHookArgCursor = 0
        _sfallHookReturnVal = 0
    }

    /**
     * Return the value stored by the last set_sfall_return() call.
     * Called by the vm_bridge hook dispatcher after hook script execution.
     */
    export function sfallGetHookReturn(): number {
        return _sfallHookReturnVal
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

    /**
     * BLK-140 — Safe procedure dispatcher.
     *
     * Wraps any script procedure call in a try-catch so that a throwing script
     * does not propagate an uncaught exception into the game loop.  On error the
     * warning is logged and execution continues from after the call site (the
     * flushUnsupportedVMOperations call and the caller's return-value logic still
     * run, using whatever state was set before the throw).
     *
     * This prevents a single bad NPC script from:
     *   • aborting the entire map_update_p_proc loop (killing all NPC updates)
     *   • crashing a dialogue session (leaving the player stuck)
     *   • halting combat turns (freezing the game)
     *   • aborting timed events (breaking quest triggers)
     *
     * @param fn        Zero-argument closure that invokes the procedure.
     * @param scriptName Human-readable script identifier for the warning.
     * @param procName  Name of the procedure being called (e.g. 'talk_p_proc').
     */
    function callProcedureSafe(fn: () => void, scriptName: string, procName: string): void {
        try {
            fn()
        } catch (e) {
            warn(
                `[BLK-140] ${procName} in '${scriptName}' threw an error — skipping: ` +
                    String(e).slice(0, 300)
            )
        }
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

    /** Return 1 if the current map has not been entered before in this session (map_first_run). */
    export function getMapFirstRun(): number {
        return mapFirstRun ? 1 : 0
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
        // BLK-086: Guard against null positions — objects in inventory or mid-transition
        // often have null positions.  Without this guard hexDirectionTo crashes.
        if (!obj.position || !target.position) return false
        const dir = Math.abs(obj.orientation - hexDirectionTo(obj.position, target.position))
        return [0, 1, 5].indexOf(dir) !== -1
    }

    // TODO: Thoroughly test these functions (dealing with critter LOS)
    function isWithinPerception(obj: Critter, target: Critter): boolean {
        // BLK-087: Guard against null positions — critters without positions cannot
        // perceive or be perceived.  Return false (not within perception) rather than crash.
        if (!obj.position || !target.position) return false
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
                // SNK_MODE (bit 3) set via pc_flag_on(3) means sneak mode is active.
                const isSneaking = !!(globalState.player.pcFlags & (1 << 3))
                if (isSneaking) {
                    reqDist /= 4
                    if (sneakSkill > 120) reqDist--
                }
            }

            if (dist <= reqDist) return true
        }

        reqDist = globalState.inCombat ? perception * 2 : perception

        if (target === globalState.player) {
            const isSneaking = !!(globalState.player.pcFlags & (1 << 3))
            if (isSneaking) {
                reqDist /= 4
                if (sneakSkill > 120) reqDist--
            }
        }

        return dist <= reqDist
    }

    function objCanSeeObj(obj: Critter, target: Obj): boolean {
        // Is target within obj's perception, or is it a non-critter object (without perception)?
        if (target.type !== 'critter' || isWithinPerception(obj, target as Critter)) {
            // BLK-076: Guard against null gMap (during map transitions or before a map
            // is loaded) and null/missing positions on either critter.  When the map or
            // positions are unavailable we conservatively treat the line-of-sight check
            // as unobstructed (return true) so scripts that call can_see_obj / is_within_perception
            // don't crash and still get a usable result.
            if (!globalState.gMap || !obj.position || !target.position) return true
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

    // BLK-064: Fallout 2 engine-appropriate defaults for well-known INI config keys.
    // Keys are stored in lower-case for O(1) case-insensitive lookup.
    // Scripts that call get_ini_setting() receive these defaults when the browser
    // build cannot read the actual INI files, preventing settings from appearing
    // falsely disabled (0) when the FO2 engine default is non-zero.
    const INI_SETTING_DEFAULTS: Readonly<Record<string, number>> = {
        'main.speedinterfacecounteranims': 1,
        'main.fps': 60,
        'main.brightmaps': 0,
        'main.singlecore': 1,
        'main.subtitles': 0,
        'main.languagefilter': 0,
        'main.running': 1,
        'sound.sound': 1,
        'sound.music': 1,
        'sound.speech': 1,
        'sound.sfxvolume': 117,
        'sound.musicvolume': 117,
        'sound.speechvolume': 117,
        'preferences.game_difficulty': 1,
        'preferences.combat_difficulty': 1,
        'preferences.violence_level': 3,
        'preferences.target_highlight': 2,
        'preferences.combat_looks': 0,
        'preferences.item_highlight': 1,
        'preferences.combat_messages': 1,
        'preferences.combat_taunts': 1,
        'preferences.running_burning_guy': 1,
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
            // BLK-129: Guard against non-finite numeric values — scripts that perform
            // integer division by zero or accumulate arithmetic errors can produce NaN
            // or Infinity and pass them directly into set_global_var.  Storing NaN in
            // globalVars corrupts downstream reads (global_var()) and the reputation
            // karma sync.  Clamp any non-finite number to 0 so the game state stays
            // in a consistent condition rather than silently poisoning the save.
            if (typeof value === 'number' && !isFinite(value)) {
                warn('set_global_var: non-finite value (' + value + ') for gvar ' + gvar + ' — clamping to 0', 'gvars')
                value = 0
            }
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
                    // METARULE_CRITTER_ON_DRUGS: 1 if the self_obj critter is currently
                    // under drug influence (e.g. just used a stimpak or buffout).
                    return isOnDrugs(this.self_obj as object)
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
                case 44: {
                    // METARULE_WHO_ON_DRUGS: 1 if the target critter is currently under drug influence.
                    // Uses the drug-tracking map populated when drug items are used via use/useObjOn.
                    const drugTarget = isGameObject(target) ? target : this.self_obj
                    return isOnDrugs(drugTarget as unknown as object)
                }
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
                // METARULE3_TILE_GET_NEXT_CRITTER(tile, elevation, lastCritter)
                // Returns the first (or next, if lastCritter is non-zero) non-player
                // critter standing on the given tile at the specified elevation.
                // With lastCritter == 0: return the first matching critter.
                // With lastCritter != 0: return the critter after lastCritter in the
                //   encounter list (supports iterating all critters at a tile).
                // BLK-036: now uses getObjects(elevation) so multi-floor maps return
                // the correct critter without being biased by the current floor.
                var tile = obj
                var tileElevation = typeof userdata === 'number' ? userdata : (globalState.currentElevation ?? 0)
                var lastCritter: any = radius
                var tilePos = fromTileNum(typeof tile === 'number' ? tile : 0)
                var allObjs = (globalState.gMap?.getObjects(tileElevation)) ?? []
                var critters = allObjs.filter(function(o) {
                    // BLK-088: Guard against null position — objects without a tile
                    // position (inventory items, mid-transition objects) would crash
                    // on o.position.x without this check.
                    return o.type === 'critter' &&
                        !(o as Critter).isPlayer &&
                        !!o.position &&
                        o.position.x === tilePos.x &&
                        o.position.y === tilePos.y
                })
                log('metarule3 106 (tile_get_next_critter)', arguments)
                if (!lastCritter || lastCritter === 0) {
                    // Return the first non-player critter at the tile.
                    return critters.length > 0 ? critters[0] : 0
                }
                // Return the critter immediately after lastCritter in the list.
                var idx = critters.findIndex(function(o: any) { return o === lastCritter })
                if (idx >= 0 && idx + 1 < critters.length) return critters[idx + 1]
                return 0 // no critter found (or lastCritter was the last one)
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
                // BLK-096: Guard against null positions — objects in inventory or mid-transition
                // may have no position; hexDistance would crash with a TypeError if either is null.
                if (!src.position || !tgt.position) return 0
                return hexDistance(src.position, tgt.position) <= 12 ? 1 : 0
            } else if (id === 107) {
                // METARULE3_TILE_VISIBLE: returns 1 if the given tile is currently visible.
                // No fog-of-war system implemented yet; always return 1 (partial).
                log('metarule3 107 (tile_visible)', arguments, 'tiles')
                return 1
            } else if (id === 108) {
                // METARULE3_CRITTER_DIST: distance in hexes between two critters (obj, userdata).
                // Returns 0 if either argument is not a valid game object or lacks a position.
                if (!isGameObject(obj) || !isGameObject(userdata)) return 0
                // BLK-058: Guard against null positions to prevent hexDistance crash.
                if (!obj.position || !userdata.position) return 0
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
                // BLK-097: Guard against null position — critters in inventory or
                // mid-transition may have no position; toTileNum(null) crashes.
                if (!obj.position) return -1
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
            // BLK-106: Guard against non-finite XP — NaN or Infinity would corrupt
            // player.xp, causing the level-up while-loop comparison to always be
            // false (NaN >= anything is false) so the player could never level up.
            if (typeof xp !== 'number' || !isFinite(xp)) {
                warn('give_exp_points: non-finite XP (' + xp + ') — no-op', undefined, this)
                return
            }
            player.xp += xp
            uiLog('You gain ' + xp + ' experience points.')
            // Check for level-up: level N is reached at N*(N+1)/2 * 1000 total XP.
            while (player.xp >= (player.level * (player.level + 1) / 2) * 1000) {
                player.level++
                // BLK-043: Award skill points on level-up (10 + INT/2, minimum 1).
                // Fallout 2 formula: base 10 + floor(INT / 2) skill points per level.
                // The Educated perk (perk ID 47) adds +2 per level; check perkRanks.
                const intScore = player.getStat('INT') ?? 5
                const educatedBonus = (player.perkRanks?.[47] ?? 0) * 2
                const pointsGained = Math.max(1, 10 + Math.floor(intScore / 2) + educatedBonus)
                player.skills.skillPoints += pointsGained
                uiLog('You have reached experience level ' + player.level + '.')
                // BLK-047: Award a perk credit every 3 levels (levels 3, 6, 9, …).
                // The player earns one perk selection every 3 levels in Fallout 2.
                // Scripts and sfall mods can read this via get_perk_owed() (0x81AE)
                // and update it via set_perk_owed() (0x81AF).
                if (player.level % 3 === 0) {
                    globalState.playerPerksOwed = (globalState.playerPerksOwed ?? 0) + 1
                }
            }
        }

        // critters
        get_critter_stat(obj: Critter, stat: number) {
            // BLK-098: Guard against null/non-critter objects — get_critter_stat is
            // frequently called from scripts that may hold a stale or null reference
            // (e.g. dead or destroyed critters).  Without this guard obj.getStat()
            // throws a TypeError when obj is 0 (the Fallout 2 null-ref convention).
            if (!isGameObject(obj)) {
                warn('get_critter_stat: not a game object — returning 0', undefined, this)
                return 0
            }
            if (stat === 34) {
                // STAT_gender
                if ((obj as Player).isPlayer) return (obj as Player).gender === 'female' ? 1 : 0
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
            // BLK-133: Guard against non-finite amount values — NaN or Infinity
            // passed by a script arithmetic error would silently corrupt the stat
            // store.  Clamp to 0 and warn so the issue is traceable.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('set_critter_stat: non-finite amount (' + amount + ') — clamping to 0', undefined, this)
                amount = 0
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
            // BLK-134: Guard against non-finite amount values — NaN or Infinity would
            // corrupt the caps item's amount field silently.  Return early and warn.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('item_caps_adjust: non-finite amount (' + amount + ') — no-op', undefined, this)
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

            // BLK-066: Also check equipped slots (leftHand, rightHand, equippedArmor).
            // In Fallout 2, equipped items are removed from the inventory array and placed
            // in dedicated slots, so a simple inventory scan would miss them.  Scripts
            // commonly use obj_carrying_pid_obj() to detect whether an NPC has a specific
            // weapon equipped before giving them ammo or initiating trade.
            const equipped = [
                (obj as any).leftHand,
                (obj as any).rightHand,
                (obj as any).equippedArmor,
            ]
            for (const slot of equipped) {
                if (slot && slot.pid === pid) return slot
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
            // BLK-085: Guard against null positions — objects without a position
            // (e.g. items in inventory, or critters mid-map-transition) would
            // crash hexDistance with a TypeError.  Return 0 (out of earshot) when
            // either position is missing so combat/AI scripts can continue safely.
            if (!a.position || !b.position) {
                warn(`obj_can_hear_obj: one or both objects lack a position`, undefined, this)
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
            // BLK-065: Guard against invalid (≤0) tile numbers and null objects.
            // Fallout 2 returns -1 when placement fails; we mirror that here so
            // calling scripts can detect and handle the failure gracefully.
            if (!isGameObject(obj) || typeof tileNum !== 'number' || tileNum <= 0) return -1
            // BLK-108: Guard against null gMap — critter_attempt_placement delegates
            // to move_to(), which calls gMap.changeElevation() without checking gMap.
            // During map transitions or in test environments this crash is silent and
            // hard to diagnose.  Return -1 (placement failure) so calling scripts can
            // handle it gracefully rather than receiving an uncaught TypeError.
            if (!globalState.gMap) {
                warn('critter_attempt_placement: gMap is null — returning -1', undefined, this)
                return -1
            }
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
            // BLK-130: Guard against non-finite damage values — division-by-zero in a
            // damage formula or a script arithmetic error can produce NaN/Infinity.
            // Passing these to critterDamage() corrupts HP stats silently; skip the
            // call instead and emit a warning so the issue is traceable.
            if (typeof damage !== 'number' || !isFinite(damage)) {
                warn('critter_dmg: non-finite damage (' + damage + ') — no-op', undefined, this)
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

        // ---------------------------------------------------------------------------
        // PC flags — player character state bitfield
        //   Bit 0: LEVEL_UP_UNUSED (legacy level-up flag, not used at runtime)
        //   Bit 1: LEVEL_UP2       (second level-up flag)
        //   Bit 2: I_AM_EVIL       (character is evil-aligned for karma logic)
        //   Bit 3: SNK_MODE        (sneak mode active; reduces NPC perception range)
        // ---------------------------------------------------------------------------
        pc_flag_on(flag: number) {
            log('pc_flag_on', arguments)
            const player = globalState.player
            if (!player) {
                warn('pc_flag_on: no player', undefined, this)
                return
            }
            if (typeof flag !== 'number' || flag < 0 || flag > 31) {
                warn('pc_flag_on: invalid flag ' + flag, undefined, this)
                return
            }
            player.pcFlags |= (1 << flag)
        }
        pc_flag_off(flag: number) {
            log('pc_flag_off', arguments)
            const player = globalState.player
            if (!player) {
                warn('pc_flag_off: no player', undefined, this)
                return
            }
            if (typeof flag !== 'number' || flag < 0 || flag > 31) {
                warn('pc_flag_off: invalid flag ' + flag, undefined, this)
                return
            }
            player.pcFlags &= ~(1 << flag)
        }

        // ---------------------------------------------------------------------------
        // inven_unwield — make a critter put away their current weapon
        //
        // In Fallout 2 this causes the critter to holster their weapon so it returns
        // to their inventory.  The browser build clears the active weapon hand slot
        // (determined by activeHand for the player, or rightHand for NPCs).
        //
        // BLK-044: Previously only cleared rightHand, leaving leftHand weapons
        // untouched.  Now clears the appropriate slot so scripts that call
        // inven_unwield() actually remove the weapon from the critter's combat view.
        // ---------------------------------------------------------------------------
        inven_unwield(obj: Obj) {
            log('inven_unwield', arguments)
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('inven_unwield: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (critter.isPlayer) {
                // For the player, clear the currently active hand slot.
                // activeHand: 0 = leftHand (primary), 1 = rightHand (secondary).
                const activeHand = (critter as any).activeHand ?? 0
                if (activeHand === 1) {
                    critter.rightHand = undefined
                } else {
                    critter.leftHand = undefined
                }
            } else {
                // For NPCs, clear rightHand (always their primary equipped weapon slot).
                critter.rightHand = undefined
            }
        }

        // ---------------------------------------------------------------------------
        // pickup_obj — move an object from the map to the player's inventory
        //
        // Fallout 2 scripts call this to force-add items to the player's inventory
        // (e.g. quest item hand-offs).  The object is removed from the map and pushed
        // onto the player inventory array.
        // ---------------------------------------------------------------------------
        pickup_obj(obj: Obj) {
            log('pickup_obj', arguments)
            if (!isGameObject(obj)) {
                warn('pickup_obj: not a game object: ' + obj, undefined, this)
                return
            }
            const player = globalState.player
            if (!player) {
                warn('pickup_obj: no player', undefined, this)
                return
            }
            if (globalState.gMap) globalState.gMap.removeObject(obj)
            player.inventory.push(obj)
        }

        // ---------------------------------------------------------------------------
        // drop_obj — remove an object from a critter's inventory and place on the map
        //
        // Used by scripts to force-drop items from a critter (e.g. disarming a
        // critter in a scripted event).  Places the item at the critter's tile.
        // ---------------------------------------------------------------------------
        drop_obj(obj: Obj) {
            log('drop_obj', arguments)
            if (!isGameObject(obj)) {
                warn('drop_obj: not a game object: ' + obj, undefined, this)
                return
            }
            // Determine the source critter: prefer self_obj if it's a critter,
            // otherwise fall back to the player.
            const selfObj = this.self_obj
            const source: Critter | null =
                isGameObject(selfObj) && (selfObj as any).type === 'critter'
                    ? (selfObj as Critter)
                    : (globalState.player ?? null)
            if (!source) {
                warn('drop_obj: no source critter', undefined, this)
                return
            }
            const idx = source.inventory.indexOf(obj)
            if (idx !== -1) source.inventory.splice(idx, 1)
            if (globalState.gMap && source.position) {
                obj.position = { ...source.position }
                globalState.gMap.addObject(obj)
            }
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

            // BLK-079: Guard against null gMap — can happen when scripts run during
            // map transitions or before the first map is fully loaded.  Skip the
            // addObject call so the VM doesn't crash; return null to signal failure.
            if (!globalState.gMap) {
                warn('create_object_sid: gMap is null — cannot place object on map', undefined, this)
                return null
            }

            // add it to the map
            globalState.gMap.addObject(obj, elev)

            return obj
        }
        obj_name(obj: Obj) {
            // BLK-128: Guard against null/falsy obj — Fallout 2 scripts often pass 0
            // (the FO2 null-object convention) to obj_name() when resolving NPC names
            // in dialogue/combat context.  Without this guard the member access on 0
            // throws a TypeError that crashes the script VM.
            if (!isGameObject(obj)) {
                warn('obj_name: not a game object — returning empty string', undefined, this)
                return ''
            }
            // Return the name property, or '' for null/undefined.
            // An empty string is a valid (intentionally blank) name so we do not
            // substitute a placeholder — callers can check for '' explicitly.
            return (obj as any).name ?? ''
        }
        // set_name(obj, name) — set the display name of an object or critter (opcode 0x80A8).
        // Used by character-creation scripts to set the player's name and by NPC
        // scripts that rename critters dynamically (e.g. to distinguish clones).
        // BLK-050: Previously absent; now assigns name directly on the game object.
        set_name(obj: Obj, name: string): void {
            if (!isGameObject(obj)) {
                warn('set_name: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).name = String(name ?? '')
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
                // BLK-125 (Phase 79): Trigger a one-shot animation cycle on the object using
                // singleAnimation so the visual plays in the browser.  Falls back to setting
                // frame=0 for objects that don't support singleAnimation (e.g. static items).
                log('anim', arguments, 'animation')
                if (typeof (obj as any).singleAnimation === 'function') {
                    try { ;(obj as any).singleAnimation(false, null) } catch (_e) { /* ignore */ }
                } else {
                    obj.frame = 0
                }
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
            // BLK-069: Guard against null gMap and null obj to prevent crashes when
            // scripts destroy objects during map transitions or test runs.
            if (!globalState.gMap || !obj) {
                warn('destroy_object: gMap or obj is null — skipping', undefined, this)
                return
            }
            globalState.gMap.destroyObject(obj)
        }
        set_exit_grids(onElev: number, mapID: number, elevation: number, tileNum: number, rotation: number) {
            log('set_exit_grids', arguments)
            // BLK-084: Guard against null gameObjects — called before a map is loaded
            // (e.g. in startup scripts or test environments) gameObjects is null and the
            // non-null assertion would crash.  Skip silently when there are no objects.
            if (!gameObjects) {
                warn('set_exit_grids: gameObjects is null — skipping', undefined, this)
                return
            }
            for (var i = 0; i < gameObjects.length; i++) {
                var obj = gameObjects[i]
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
            // BLK-060: Guard null positions to prevent hexDistance crash.
            if (!a.position || !b.position) {
                warn('tile_distance_objs: one or both objects lack a position', undefined, this)
                return 0
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
            // BLK-060: Guard null position to prevent toTileNum crash.
            if (!obj.position) {
                warn('tile_num: object has no position', undefined, this)
                return -1
            }
            return toTileNum(obj.position)
        }
        tile_contains_pid_obj(tile: number, elevation: number, pid: number): any {
            log('tile_contains_pid_obj', arguments, 'tiles')
            // BLK-072: Guard against null gMap — can occur when scripts run during
            // map transitions or in early-init before a map has been loaded.
            if (!globalState.gMap) {
                warn('tile_contains_pid_obj: gMap is null — returning 0', undefined, this)
                return 0
            }
            var pos = fromTileNum(tile)
            var objects = globalState.gMap.getObjects(elevation)
            for (var i = 0; i < objects.length; i++) {
                // BLK-055: Guard against objects without a position (edge case during
                // map transitions or after explosive removal).
                if (!objects[i].position) continue
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
                // BLK-083: Guard against a null player.position — can happen when the
                // player object exists but has not yet been placed on the map (e.g.
                // during initial script execution before map_enter_p_proc completes).
                // Fall back to always-visible (1) so scripts proceed safely.
                if (!globalState.player.position) return 1
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
            // BLK-037: use getObjects(elevation) so that objects on a non-current
            // floor are correctly found (previously returned 0 whenever the elevation
            // did not match the current floor, even when the target floor existed).
            // BLK-135: Guard against invalid tile numbers — negative values or NaN
            // produce meaningless coordinates from fromTileNum().  Return 0 early.
            if (typeof tile !== 'number' || !isFinite(tile) || tile < 0) return 0
            var pos = fromTileNum(tile)
            var objs = (globalState.gMap?.getObjects(elevation)) ?? []
            for (var i = 0; i < objs.length; i++) {
                // BLK-055: Guard against objects without a position.
                if (!objs[i].position) continue
                if (objs[i].position.x === pos.x && objs[i].position.y === pos.y && objs[i].pid === pid) return 1
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
            // BLK-136: Guard against non-finite tileNum — NaN/Infinity passed by a
            // script arithmetic error would set obj.position to {x: NaN, y: NaN},
            // breaking all subsequent position checks.  Skip and warn instead.
            if (typeof tileNum !== 'number' || !isFinite(tileNum) || tileNum < 0) {
                warn('move_to: invalid tileNum (' + tileNum + ') — no-op', undefined, this)
                return
            }
            if (elevation !== globalState.currentElevation) {
                info('move_to: moving to elevation ' + elevation)
                // BLK-073: Guard against null gMap — can occur when scripts call
                // move_to during map transitions or before a map is loaded.
                if (!globalState.gMap) {
                    warn('move_to: gMap is null — cannot change elevation; placing at tile only', undefined, this)
                } else if (obj instanceof Critter && obj.isPlayer) {
                    globalState.gMap.changeElevation(elevation, true)
                } else {
                    globalState.gMap.removeObject(obj)
                    globalState.gMap.addObject(obj, elevation)
                }
            }
            obj.position = fromTileNum(tileNum)

            if (obj instanceof Critter && obj.isPlayer) centerCamera(obj.position)
        }

        // combat
        node998() {
            // node998 — "go hostile" node in Fallout 2 dialogue.
            // When a script calls node998(), the NPC/creature should exit dialogue and
            // immediately initiate combat against the player.
            // BLK-057: exit any active dialogue first, then start combat with this NPC.
            info('node998: NPC goes hostile — initiating combat', 'dialogue')
            dialogueExit()
            if (Config.engine.doCombat && this.self_obj) {
                const source = this.self_obj as Critter
                if (source.isPlayer !== true) {
                    source.hostile = true
                    Combat.start(source)
                }
            }
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
            // BLK-107: Guard against null/non-function target — scripts occasionally
            // pass 0 or a non-callable as the target when the option has no handler.
            // target.bind(this) would throw a TypeError and abort the dialogue.
            // Wrap the no-op in a safe function so the option still appears in the UI.
            if (typeof target !== 'function') {
                warn('gsay_option: target is not a function (' + target + ') — using no-op', undefined, this)
                dialogueOptionProcs.push(() => {})
            } else {
                dialogueOptionProcs.push(target.bind(this))
            }
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

            // BLK-056: Guard against null player (edge case when running tests or
            // entering dialogue before the player object is initialised).
            const player = globalState.player
            if (!player) {
                warn('giq_option: no player — showing option unconditionally', undefined, this)
                dialogueOptionProcs.push(target.bind(this))
                uiAddDialogueOption(msg, dialogueOptionProcs.length - 1)
                return
            }

            const INT = player.getStat('INT')
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
            // BLK-131: Guard against missing floatMessages array — globalState is
            // initialised with floatMessages:[] but a custom init path or a partial
            // reset could leave it undefined.  Array spread access on undefined
            // would throw; skip the push and emit a warning instead.
            if (!Array.isArray(globalState.floatMessages)) {
                warn('float_msg: globalState.floatMessages is not an array — skipping', undefined, this)
                return
            }
            globalState.floatMessages.push({
                msg: msg,
                obj: this.self_obj as Obj,
                // BLK-082: Use performance.now() with a typeof guard rather than
                // window.performance.now() directly — the window global is not
                // available in Node.js test environments and would throw a ReferenceError.
                // This matches the pattern already used by get_uptime().
                startTime: typeof performance !== 'undefined' ? performance.now() : 0,
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
            // BLK-121: Trigger a single non-looping animation cycle on obj.
            log('reg_anim_animate', arguments, 'animation')
            this.reg_anim_animate_once(obj, anim, delay)
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
            // BLK-104: Guard against null position — critters in inventory or
            // mid-map-transition have no tile assignment.  walkTo() accesses
            // this.position.x immediately, so calling it with a null position
            // throws a TypeError.  Skip movement for unplaced critters.
            if (!obj.position) {
                warn('reg_anim_obj_move_to_tile: object has no position — skipping movement', 'movement', this)
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

            // BLK-077: Guard against null gMap — explosion() can be called from
            // scripts during map transitions or before the first map loads.
            // Without the guard, addObject/removeObject would throw a TypeError.
            if (!globalState.gMap) {
                warn('explosion: gMap is null — skipping explosion at tile ' + tile, undefined, this)
                return
            }

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
            // BLK-122: Screen fade-out — apply CSS opacity transition on the canvas.
            log('gfade_out', arguments)
            this.gfade_out_css(time)
        }
        gfade_in(time: number) {
            // BLK-122: Screen fade-in — restore CSS opacity on the canvas.
            log('gfade_in', arguments)
            this.gfade_in_css(time)
        }

        // timing
        add_timer_event(obj: Obj, ticks: number, userdata: any) {
            log('add_timer_event', arguments)
            if (!obj || !obj._script) {
                warn('add_timer_event: not a scriptable object: ' + obj)
                return
            }
            // BLK-109: Guard against non-positive or non-finite ticks — zero, negative,
            // NaN, or Infinity ticks would fire the event on the very next tick-advance
            // (or never), potentially causing re-entrant callbacks and confusing time-sorted
            // event queues.  Clamp to a minimum of 1 tick so events always fire in the future.
            if (typeof ticks !== 'number' || !isFinite(ticks) || ticks <= 0) {
                warn('add_timer_event: non-positive ticks (' + ticks + ') — clamping to 1', undefined, this)
                ticks = 1
            }
            info('timer event added in ' + ticks + ' ticks (userdata ' + userdata + ')', 'timer')
            // trigger timedEvent in `ticks` game ticks
            timeEventList.push({
                ticks: ticks,
                obj: obj,
                userdata: userdata,
                fn: function () {
                    // BLK-061: Guard against the object being destroyed between
                    // add_timer_event and when the timer fires.  If the script
                    // was cleared (e.g. destroy_object called in the meantime),
                    // skip the event silently rather than crashing.
                    if (!obj._script) {
                        warn('add_timer_event callback: obj._script was null when timer fired — skipping', undefined, undefined)
                        return
                    }
                    timedEvent(obj._script, userdata)
                }.bind(this),
            })
        }
        rm_timer_event(obj: Obj) {
            log('rm_timer_event', arguments)
            // BLK-074: Guard against null obj — scripts sometimes call rm_timer_event
            // with 0/null when clearing events on an invalid reference.  Previously
            // the unconditional obj.pid access caused an uncaught TypeError.
            if (!obj) {
                warn('rm_timer_event: null obj — no-op', undefined, this)
                return
            }
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
            // BLK-105: Guard against non-finite ticks — NaN or Infinity would corrupt
            // globalState.gameTickTime, breaking every subsequent time-based check
            // (timed events, drug timers, in-game clock).  Clamp to a safe no-op
            // when the value is not a finite number.
            if (typeof ticks !== 'number' || !isFinite(ticks)) {
                warn('game_time_advance: non-finite ticks (' + ticks + ') — no-op', undefined, this)
                return
            }
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
            // BLK-137: Guard against non-number skill argument — scripts occasionally
            // pass null, undefined, or a string for the skill parameter when a lookup
            // table entry is missing.  The skillNumToName indexing silently returns
            // undefined for non-integers; we warn explicitly so the issue is traceable.
            if (typeof skill !== 'number' || !Number.isFinite(skill)) {
                warn('get_critter_skill: non-number skill (' + skill + ') — returning 0', undefined, this)
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
            // BLK-078: Guard against null gMap — can occur when load_map() is called
            // from a context where no map has been initialized yet (e.g. startup scripts
            // or test harnesses).  Without the guard, loadMap/loadMapByID would throw.
            if (!globalState.gMap) {
                warn('load_map: gMap is null — cannot load map ' + map, undefined, this)
                return
            }
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
            // BLK-100: Guard against null audioEngine — during test environments and
            // early browser init (before the audio subsystem is set up) audioEngine
            // is null.  Without the guard, any script that calls play_sfx() will crash
            // with a TypeError.  Skip silently rather than emitting a stub warning so
            // every map-enter sound effect does not flood the console.
            if (!globalState.audioEngine) return
            globalState.audioEngine.playSfx(sfx)
        }

        // party
        party_member_obj(pid: number) {
            log('party_member_obj', arguments, 'party')
            // BLK-067: Guard against null gParty to prevent crash during early init
            // or when tests run without a full game-state setup.
            if (!globalState.gParty) return 0
            return globalState.gParty.getPartyMemberByPID(pid) || 0
        }
        party_add(obj: Critter) {
            log('party_add', arguments)
            // BLK-099: Guard against null gParty — can occur during early init, test
            // environments, or map transitions before the party system is registered.
            if (!globalState.gParty) {
                warn('party_add: gParty is null — skipping', undefined, this)
                return
            }
            globalState.gParty.addPartyMember(obj)
        }
        party_remove(obj: Critter) {
            log('party_remove', arguments)
            // BLK-099: Guard against null gParty (same as party_add guard above).
            if (!globalState.gParty) {
                warn('party_remove: gParty is null — skipping', undefined, this)
                return
            }
            globalState.gParty.removePartyMember(obj)
        }

        // sfall extended opcode — read an INI setting by key string (0x8198).
        // BLK-064: Returns sensible Fallout 2 defaults for well-known config keys.
        // Full INI file access is not available in the browser build; returning
        // engine-appropriate defaults prevents scripts from treating absent settings
        // as explicitly disabled (0) when the actual FO2 default is non-zero.
        get_ini_setting(key: string): number {
            log('get_ini_setting', arguments)
            const normalized = key.toLowerCase()
            if (Object.prototype.hasOwnProperty.call(INI_SETTING_DEFAULTS, normalized)) {
                return INI_SETTING_DEFAULTS[normalized]
            }
            return 0
        }

        // sfall extended opcode — return the player's currently active hand (0x8199).
        // 0 = primary hand (left), 1 = secondary hand (right).
        // BLK-034: now reads Player.activeHand for a live value instead of always 0.
        active_hand(): number {
            return (globalState.player as any)?.activeHand ?? 0
        }

        // sfall hook-script opcode — set the return value for a hook script (0x819A).
        // No-op in the browser build; hook scripts are not implemented.
        set_sfall_return(val: number): void {
            // BLK-123 (Phase 78): Store value in the module-level hook return buffer.
            _sfallHookReturnVal = typeof val === 'number' ? val : 0
        }

        // sfall hook-script opcode — get the next hook-script argument (0x819B).
        // BLK-123 (Phase 78): Now reads from the module-level hook arg buffer in order.
        get_sfall_arg(): number {
            if (_sfallHookArgCursor < _sfallHookArgs.length) {
                const v = _sfallHookArgs[_sfallHookArgCursor++]
                return typeof v === 'number' ? v : 0
            }
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

        // Phase 51 — sfall extended opcodes 0x81B6–0x81BD

        // sfall 0x81B6 — get_critter_stat_bonus(obj, stat):
        // Returns the stat modifier bonus applied to a critter's stat (derived minus base).
        // Partial: returns 0 for most stats; implemented for HP (Max HP - base HP).
        get_critter_stat_bonus(obj: Obj, stat: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_stat_bonus: not a critter: ' + obj, undefined, this)
                return 0
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('get_critter_stat_bonus: unknown stat number: ' + stat + ' — returning 0', undefined, this)
                return 0
            }
            const critter = obj as Critter
            const derived = critter.stats.get(statName)
            const base = critter.stats.getBase(statName)
            return derived - base
        }

        // sfall 0x81B7 — obj_art_name(obj):
        // Returns the art path/filename of a game object as a string.
        // Used by scripts that want to check or display an object's sprite name.
        obj_art_name(obj: Obj): string {
            if (!isGameObject(obj)) {
                warn('obj_art_name: not a game object: ' + obj, undefined, this)
                return ''
            }
            return (obj as any).art ?? ''
        }

        // sfall 0x81B8 — get_item_type_int(item):
        // Returns the Fallout 2 item subtype as a numeric constant.
        // 0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key.
        // Falls back to obj_item_subtype logic for consistency.
        get_item_type_int(obj: Obj): number {
            return this.obj_item_subtype(obj) ?? 0
        }

        // sfall 0x81B9 — set_pc_stat(pcstat, val):
        // Sets a player-character stat by index.
        // Supported: 0=unspent_skill_points, 1=level, 2=experience, 3/4=karma.
        // Others: warn and no-op.
        set_pc_stat(pcstat: number, val: number): void {
            const player = globalState.player
            if (!player) {
                warn('set_pc_stat: no player', undefined, this)
                return
            }
            switch (pcstat) {
                case 0: // PCSTAT_unspent_skill_points
                    player.skills.skillPoints = Math.max(0, val)
                    return
                case 1: // PCSTAT_level
                    player.level = Math.max(1, val)
                    return
                case 2: // PCSTAT_experience
                    player.xp = Math.max(0, val)
                    return
                case 3: // PCSTAT_reputation (maps to GVAR_0)
                case 4: // PCSTAT_karma — same as reputation in FO2
                    globalVars[0] = val
                    return
                default:
                    warn('set_pc_stat: unknown pcstat ' + pcstat + ' — no-op', undefined, this)
            }
        }

        // sfall 0x81BA — num_critters_in_radius(tile, elev, radius):
        // Returns the number of critters within `radius` hexes of `tile` at elevation `elev`.
        // Used by AI and encounter scripts to assess nearby threat density.
        num_critters_in_radius(tile: number, elev: number, radius: number): number {
            if (!globalState.gMap) return 0
            const origin = fromTileNum(tile)
            if (!origin) return 0
            // Use elevation-specific object list so critters on other floors are excluded.
            const objects = typeof globalState.gMap.getObjects === 'function'
                ? globalState.gMap.getObjects(elev)
                : (gameObjects ?? [])
            let count = 0
            for (const obj of objects) {
                if (obj.type !== 'critter') continue
                if ((obj as Critter).dead) continue
                // BLK-089: Guard against null position — critters in inventory or
                // mid-transition may have no position; skip them instead of crashing.
                if (!obj.position) continue
                if (hexDistance(origin, obj.position) <= radius) count++
            }
            return count
        }

        // sfall 0x81BB — get_object_ai_num(obj):
        // Returns the AI packet number of a critter.
        // Used by scripts that need to inspect or override NPC behaviour.
        get_object_ai_num(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_object_ai_num: not a critter: ' + obj, undefined, this)
                return -1
            }
            return (obj as Critter).aiNum ?? -1
        }

        // sfall 0x81BC — set_object_ai_num(obj, num):
        // Sets the AI packet number of a critter (aliases critter_add_trait TRAIT_OBJECT OBJECT_AI_PACKET).
        set_object_ai_num(obj: Obj, num: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_object_ai_num: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).aiNum = num
        }

        // sfall 0x81BD — get_critter_hostile_to_dude(obj):
        // Returns 1 if the critter is currently hostile to the player, 0 otherwise.
        // Partial: checks the critter's `hostile` flag.
        get_critter_hostile_to_dude(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_hostile_to_dude: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).hostile ? 1 : 0
        }

        // Phase 52 — sfall extended opcodes 0x81BE–0x81C5

        // sfall 0x81BE — get_critter_weapon(critter, slot):
        // Returns the game object equipped in the specified weapon slot of a critter.
        //   slot 0 = primary hand (rightHand — the main weapon hand)
        //   slot 1 = secondary hand (leftHand — the off-hand / secondary weapon)
        // Returns 0 if no weapon is equipped in that slot or the object is not a critter.
        // Used by combat AI and equipment scripts to inspect what a critter is wielding.
        get_critter_weapon(obj: Obj, slot: number): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_weapon: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            if (slot === 0) {
                const w = critter.rightHand
                return (w && (w as any).pid) ? w : 0
            } else if (slot === 1) {
                const w = critter.leftHand
                return (w && (w as any).pid) ? w : 0
            }
            return 0
        }

        // sfall 0x81BF — critter_inven_size(critter):
        // Returns the total number of items currently in the critter's inventory.
        // Returns 0 for non-critters or critters with empty / missing inventory.
        // Used by scripts that need to check whether a critter is carrying anything.
        critter_inven_size(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_inven_size: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).inventory?.length ?? 0
        }

        // sfall 0x81C0 — get_sfall_args_count():
        // BLK-123 (Phase 78): Returns the number of args in the sfall hook arg buffer.
        get_sfall_args_count(): number {
            return _sfallHookArgs.length
        }

        // sfall 0x81C1 — get_sfall_arg_at(idx):
        // BLK-123 (Phase 78): Returns the hook-script arg at the given zero-based index.
        get_sfall_arg_at(idx: number): number {
            if (typeof idx !== 'number' || idx < 0 || idx >= _sfallHookArgs.length) return 0
            const v = _sfallHookArgs[idx]
            return typeof v === 'number' ? v : 0
        }

        // sfall 0x81C2 — set_sfall_arg(idx, val):
        // BLK-123 (Phase 78): Writes a value back into the hook-script arg buffer at idx.
        set_sfall_arg(idx: number, val: number): void {
            if (typeof idx === 'number' && idx >= 0 && idx < _sfallHookArgs.length) {
                _sfallHookArgs[idx] = typeof val === 'number' ? val : 0
            }
        }

        // sfall 0x81C3 — get_object_lighting(obj):
        // Returns the current light level received by obj (0–65536).
        // Partial: returns the global ambient light level as a reasonable approximation;
        // per-object lighting is not modelled separately in the browser build.
        get_object_lighting(obj: Obj): number {
            log('get_object_lighting', arguments)
            return globalState.ambientLightLevel ?? 65536
        }

        // sfall 0x81C4 — get_critter_team(critter):
        // Returns the team number of the given critter.  Team numbers control which
        // factions will attack each other in combat (same team = allied).
        // Returns 0 for non-critters.
        get_critter_team(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_team: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).teamNum ?? 0
        }

        // sfall 0x81C5 — set_critter_team(critter, team):
        // Sets the team number of the given critter.  Used by faction-switch scripts
        // (e.g. turning a neutral NPC hostile by moving them to the player-enemy team).
        set_critter_team(obj: Obj, team: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_team: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).teamNum = typeof team === 'number' ? team : 0
        }

        // Phase 53 — sfall 0x81C8 — critter_mod_skill_points(critter, delta):
        // Add or subtract raw skill points from a critter. Only meaningful for the
        // player critter — NPCs do not maintain a skill-point pool.
        critter_mod_skill_points(obj: Obj, delta: number): void {
            if (!isGameObject(obj)) {
                warn('critter_mod_skill_points: not a game object', undefined, this)
                return
            }
            if ((obj as any).isPlayer && globalState.player) {
                globalState.player.skills.skillPoints = Math.max(
                    0,
                    (globalState.player.skills.skillPoints || 0) + (typeof delta === 'number' ? delta : 0)
                )
            }
            // NPCs do not have a skill-point pool; silently ignore.
        }

        // Phase 53 — sfall 0x81CB — get_combat_target(critter):
        // Return the current combat target of a critter.
        // Browser build: returns 0 (no per-critter target tracking).
        get_combat_target(obj: Obj): Obj | 0 {
            return 0
        }

        // Phase 53 — sfall 0x81CC — set_combat_target(critter, target):
        // Set a critter's combat target. No-op in the browser build.
        set_combat_target(obj: Obj, target: Obj): void {
            // No per-critter target tracking in the browser build.
        }

        // Phase 53 — sfall 0x81CD — get_game_time_in_seconds:
        // Return game time in seconds (gameTickTime / 10).
        get_game_time_in_seconds(): number {
            return Math.floor(globalState.gameTickTime / 10)
        }

        // Phase 53 — sfall 0x81CF — set_light_level_sfall(level, update):
        // Set the global ambient light level (0–65536).
        // Browser build stores it but defers actual rendering update.
        set_light_level_sfall(level: number, _update: number): void {
            if (typeof level === 'number') {
                globalState.ambientLightLevel = Math.max(0, Math.min(65536, level))
            }
        }

        // Phase 54 / Phase 78 — sfall 0x81D0 — get_game_mode_sfall():
        // Returns a bitmask indicating the current game mode.
        // Bit 0 (0x01) = normal map mode (always set when on a map)
        // Bit 1 (0x02) = combat mode
        // Bit 2 (0x04) = dialogue mode
        // Bit 3 (0x08) = barter mode
        // Bit 4 (0x10) = inventory/menu mode
        // Bit 5 (0x20) = world-map mode
        // BLK-123 (Phase 78): Now reads globalState.uiMode to set dialogue/barter/inventory/worldmap bits.
        get_game_mode_sfall(): number {
            let mode = 0
            const ui = globalState.uiMode ?? 0
            // import UIMode values numerically (avoid circular import): 1=dialogue, 2=barter, 4=inventory, 5=worldMap
            if (ui === 5 /* worldMap */) {
                mode |= 0x20 // world-map mode — no normal-map bit
            } else {
                mode |= 0x01 // on a normal map
                if (globalState.inCombat) mode |= 0x02
                if (ui === 1 /* dialogue */) mode |= 0x04
                if (ui === 2 /* barter   */) mode |= 0x08
                if (ui === 4 /* inventory*/) mode |= 0x10
            }
            if (mode === 0) mode = 0x01 // fallback: normal mode
            return mode
        }

        // Phase 54 — sfall 0x81D4 — obj_is_disabled_sfall(obj):
        // Returns 1 if the object's AI / script is disabled, 0 otherwise.
        // Browser build: partial — no per-object disable flag; always returns 0.
        obj_is_disabled_sfall(obj: Obj): number {
            log('obj_is_disabled_sfall', arguments)
            return 0
        }

        // -----------------------------------------------------------------------
        // Phase 56 — sfall extended opcodes 0x81E0–0x81E7
        // -----------------------------------------------------------------------

        // sfall 0x81E0 — get_current_map_id_sfall():
        // Return the current map index.  Alias of metarule(46, 0) / metarule(55, 0).
        // Scripts use this to branch on which map the player is currently in without
        // needing to call a multi-arg metarule.
        get_current_map_id_sfall(): number {
            return currentMapID !== null ? currentMapID : 0
        }

        // sfall 0x81E1 — get_object_dude_distance(obj):
        // Return the tile distance (in hexes) from obj to the player character.
        // Returns -1 if obj is not a game object or the player is unavailable.
        // Useful for range/proximity checks in AI and encounter scripts.
        get_object_dude_distance(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_dude_distance: not a game object: ' + obj, undefined, this)
                return -1
            }
            const player = globalState.player
            if (!player || !obj.position || !player.position) return -1
            const objTile = toTileNum(obj.position)
            const playerTile = toTileNum(player.position)
            return this.tile_distance(objTile, playerTile)
        }

        // sfall 0x81E2 — get_critter_attack_mode_sfall(obj):
        // Return the critter's current attack-mode index (0=unarmed, 1=melee, 2=ranged).
        // Browser build: partial — no per-critter attack-mode flag; always returns 0.
        get_critter_attack_mode_sfall(obj: Obj): number {
            log('get_critter_attack_mode_sfall', arguments)
            return 0
        }

        // sfall 0x81E3 — set_critter_attack_mode_sfall(obj, mode):
        // Set the critter's attack-mode index.  Browser build: no-op.
        set_critter_attack_mode_sfall(obj: Obj, _mode: number): void {
            log('set_critter_attack_mode_sfall', arguments)
        }

        // sfall 0x81E4 — get_map_first_run_sfall():
        // Return 1 if the current map is being visited for the first time in this
        // playthrough, 0 otherwise.  Uses the same mapFirstRun flag as map_first_run.
        get_map_first_run_sfall(): number {
            return mapFirstRun ? 1 : 0
        }

        // sfall 0x81E5 — get_script_type_sfall():
        // Return the type of the currently executing script (0=map, 1=critter/NPC,
        // 2=item, 3=scenery, 4=door, 5=container).  Browser build: returns 0.
        get_script_type_sfall(): number {
            log('get_script_type_sfall', arguments)
            return 0
        }

        // sfall 0x81E6 — get_tile_pid_sfall(tile, elev):
        // Return the PID of the first non-critter object found at the specified tile
        // and elevation.  Returns 0 if no object is present.
        // Useful for scripts that probe what's on the floor before triggering.
        get_tile_pid_sfall(tile: number, elev: number): number {
            if (!globalState.gMap) return 0
            const objects = typeof globalState.gMap.getObjects === 'function'
                ? globalState.gMap.getObjects(elev)
                : []
            const tilePos = fromTileNum(tile)
            if (!tilePos) return 0
            for (const o of objects) {
                if (!isGameObject(o)) continue
                if (o.type === 'critter') continue
                if (o.position && o.position.x === tilePos.x && o.position.y === tilePos.y) {
                    return o.pid ?? 0
                }
            }
            return 0
        }

        // sfall 0x81E7 — get_critter_skill_points(obj, skill):
        // Return the base skill-point allocation for the given skill on a critter.
        // Uses the same skill-name lookup as set_critter_skill_points (0x8181).
        get_critter_skill_points(obj: Obj, skill: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_skill_points: not a critter: ' + obj, undefined, this)
                return 0
            }
            const skillName = skillNumToName[skill]
            if (!skillName) {
                warn('get_critter_skill_points: unknown skill number: ' + skill, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.skills?.getBase(skillName) ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 57 — sfall extended opcodes 0x81E8–0x81EF
        // -----------------------------------------------------------------------

        // sfall 0x81E8 — get_object_cost_sfall(obj):
        // Return the base barter/store cost of an item from its proto data.
        // Equivalent to proto_data(obj, ITEM_DATA_COST) for items.
        // Returns 0 for critters and non-game objects.
        get_object_cost_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_cost_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            const pro = (obj as any).pro
            if (pro?.extra?.cost !== undefined) return pro.extra.cost
            if (pro?.cost !== undefined) return pro.cost
            return 0
        }

        // sfall 0x81E9 — set_object_cost_sfall(obj, cost):
        // Override the barter cost for an object.  Browser build: no-op (proto data
        // is read-only at runtime).
        set_object_cost_sfall(_obj: Obj, _cost: number): void {
            log('set_object_cost_sfall', arguments)
        }

        // sfall 0x81EA — get_sfall_global_int_sfall(index):
        // Alias of get_sfall_global_int — return the integer sfall global at the
        // given numeric index.  Provided as a dedicated opcode for scripts that use
        // the alt calling convention.
        get_sfall_global_int_sfall(index: number): number {
            return this.get_sfall_global_int(index)
        }

        // sfall 0x81EB — set_sfall_global_int_sfall(index, value):
        // Alias of set_sfall_global_int.
        set_sfall_global_int_sfall(index: number, value: number): void {
            this.set_sfall_global_int(index, value)
        }

        // sfall 0x81EC — get_combat_difficulty_sfall():
        // Return the current combat difficulty as an integer:
        //   0 = Easy, 1 = Normal (default), 2 = Hard.
        // Browser build: always returns 1 (Normal) — no per-session difficulty setting.
        get_combat_difficulty_sfall(): number {
            log('get_combat_difficulty_sfall', arguments)
            return 1
        }

        // sfall 0x81ED — game_in_combat_sfall():
        // Return 1 if the engine is currently in turn-based combat, 0 otherwise.
        // Equivalent to checking global_var(GVAR_IN_COMBAT) in vanilla scripts.
        game_in_combat_sfall(): number {
            return globalState.inCombat ? 1 : 0
        }

        // sfall 0x81EE — get_tile_fid_sfall(tile, elev):
        // Return the FID (Frame ID) of the floor tile at the given tile/elevation.
        // Browser build: partial — no tile-FID registry; returns 0.
        get_tile_fid_sfall(_tile: number, _elev: number): number {
            return 0
        }

        // sfall 0x81EF — set_tile_fid_sfall(tile, elev, fid):
        // Override the floor tile FID at the given tile/elevation.
        // Browser build: no-op (no tile-override system).
        set_tile_fid_sfall(_tile: number, _elev: number, _fid: number): void {
            log('set_tile_fid_sfall', arguments)
        }

        // -----------------------------------------------------------------------
        // Phase 58 — sfall extended opcodes 0x81F0–0x81F7
        // -----------------------------------------------------------------------

        // sfall 0x81F0 — get_critter_xp_sfall(obj):
        // Return the XP value of a critter from its proto data.  Used by loot/reward
        // scripts that want to award a custom XP amount.  Returns 0 for non-critters.
        get_critter_xp_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_xp_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).pro?.extra?.XPValue ?? 0
        }

        // sfall 0x81F1 — get_object_sid_sfall(obj):
        // Return the script SID (Script ID) associated with a game object.
        // Returns 0 if the object has no script.
        get_object_sid_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_sid_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).script ?? 0
        }

        // sfall 0x81F2 — get_game_mode_ex_sfall():
        // Extended game mode bitfield (superset of get_game_mode).
        // Browser build: alias of get_game_mode_sfall — returns 0 (field mode).
        get_game_mode_ex_sfall(): number {
            return this.get_game_mode_sfall()
        }

        // sfall 0x81F3 — get_object_pid_sfall(obj):
        // Return the prototype ID (PID) of a game object.
        // Equivalent to obj_pid(obj) (0x80D0) but exposed as a dedicated sfall opcode.
        get_object_pid_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_pid_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return obj.pid ?? 0
        }

        // sfall 0x81F4 — get_critter_kill_type_sfall(obj):
        // Return the kill-type index of a critter (used by get_critter_kills to
        // attribute kill-counts per type).  Returns the proto's killType field.
        get_critter_kill_type_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_kill_type_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).pro?.extra?.killType ?? 0
        }

        // sfall 0x81F5 — get_tile_at_sfall(x, y):
        // Convert a hex-grid (x, y) coordinate pair to a Fallout 2 tile number.
        // The inverse of fromTileNum — equivalent to toTileNum({x, y}).
        get_tile_at_sfall(x: number, y: number): number {
            if (typeof x !== 'number' || typeof y !== 'number') {
                warn('get_tile_at_sfall: non-numeric coordinates', undefined, this)
                return 0
            }
            return toTileNum({ x, y })
        }

        // sfall 0x81F6 — get_object_type_sfall(obj):
        // Return the object type as an integer:
        //   0 = item, 1 = critter, 2 = scenery, 3 = wall, 4 = tile, 5 = misc.
        // Browser build: maps obj.type string to the Fallout 2 numeric index.
        get_object_type_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_type_sfall: not a game object: ' + obj, undefined, this)
                return 5
            }
            const typeMap: { [t: string]: number } = {
                item: 0, critter: 1, scenery: 2, wall: 3, tile: 4, misc: 5,
            }
            return typeMap[obj.type] ?? 5
        }

        // sfall 0x81F7 — critter_at_sfall(tile, elev):
        // Return the first non-player critter found at the given tile/elevation, or
        // 0 if no critter is present.  Useful for ambush-trigger and trap scripts.
        critter_at_sfall(tile: number, elev: number): Obj | number {
            const pos = fromTileNum(tile)
            const objects = globalState.gMap?.getObjects(elev) ?? []
            for (const o of objects) {
                if (!isGameObject(o) || o.type !== 'critter') continue
                if (!o.position) continue
                if (o.position.x === pos.x && o.position.y === pos.y) return o
            }
            return 0
        }

        // -----------------------------------------------------------------------
        // Phase 59 — sfall extended opcodes 0x81F8–0x81FF
        // -----------------------------------------------------------------------

        // sfall 0x81F8 — get_critter_max_hp_sfall(obj):
        // Return the maximum HP (stat ceiling) for a critter.
        // Equivalent to get_critter_stat(obj, 6) (STAT_max_hp = 6).
        // Returns 0 for non-critters.
        // NOTE: The more complete 0x828F alias (get_critter_max_hp_sfall_82) also
        // checks proto extra data; this implementation is the canonical definition.
        get_critter_max_hp_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_max_hp_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            // Also check getStat safely and fall back to proto / direct property.
            if (typeof (obj as any).getStat === 'function') {
                const hp = (obj as any).getStat('Max HP')
                if (typeof hp === 'number' && isFinite(hp)) return hp
            }
            return (obj as any).pro?.extra?.maxHP ?? (obj as any).maxHP ?? 0
        }

        // sfall 0x81F9 — set_critter_max_hp_sfall(obj, hp):
        // Override the maximum HP of a critter.  Used by difficulty-scaling mods.
        // Browser build: sets the base Max HP stat.
        set_critter_max_hp_sfall(obj: Obj, hp: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_max_hp_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            critter.stats.setBase('Max HP', Math.max(1, typeof hp === 'number' ? hp : 0))
        }

        // sfall 0x81FA — get_total_kills_sfall():
        // Return the total number of critters killed across all kill-types.
        // Sums the critterKillCounts globalState object.
        get_total_kills_sfall(): number {
            const counts = globalState.critterKillCounts
            if (!counts) return 0
            return Object.values(counts).reduce((sum: number, n: any) => sum + (n as number), 0)
        }

        // sfall 0x81FB — get_critter_extra_data_sfall(obj, field):
        // Return a field from the critter's proto extra data.
        // Partial: returns 0 for unknown fields.
        get_critter_extra_data_sfall(obj: Obj, field: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_extra_data_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const extra = (obj as any).pro?.extra
            if (!extra) return 0
            // Map common field indices to proto.extra properties
            switch (field) {
                case 0: return extra.age ?? 0
                case 1: return extra.gender ?? 0
                case 2: return extra.killType ?? 0
                case 3: return extra.XPValue ?? 0
                case 4: return extra.AI ?? 0
                default: return 0
            }
        }

        // sfall 0x81FC — get_script_return_val_sfall():
        // BLK-123 (Phase 78): Return the hook return value from the module-level buffer.
        get_script_return_val_sfall(): number {
            return _sfallHookReturnVal
        }

        // sfall 0x81FD — set_script_return_val_sfall(val):
        // BLK-123 (Phase 78): Alias of set_sfall_return — store into module-level buffer.
        set_script_return_val_sfall(val: number): void {
            _sfallHookReturnVal = typeof val === 'number' ? val : 0
        }

        // sfall 0x81FE — get_active_map_id_sfall():
        // Return the map ID of the currently active map.
        // Alias of get_current_map_id_sfall() — provides an alternate call convention.
        get_active_map_id_sfall(): number {
            return this.get_current_map_id_sfall()
        }

        // sfall 0x81FF — get_critter_range_sfall(obj):
        // Return the maximum attack range of a critter's currently equipped weapon.
        // Fallback to 1 (melee) when no weapon or weapon data is available.
        get_critter_range_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_range_sfall: not a critter: ' + obj, undefined, this)
                return 1
            }
            const critter = obj as Critter
            const weapon = critter.equippedWeapon?.weapon
            if (!weapon) return 1
            // maxRange1 is the primary-mode range; weapon.weapon is the raw WeaponObj.
            return (weapon.weapon as any)?.pro?.extra?.maxRange1 ?? 1
        }

        // -----------------------------------------------------------------------
        // Phase 60 — sfall extended opcodes 0x8200–0x8207
        // -----------------------------------------------------------------------

        // sfall 0x8200 — get_critter_current_hp_sfall(obj):
        // Return the critter's current HP.  Alias of critter_hp() via sfall convention.
        get_critter_current_hp_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_current_hp_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).getStat('HP') ?? 0
        }

        // sfall 0x8201 — get_critter_level_sfall2(obj):
        // Return the critter's current level.  Used by level-scaling and encounter scripts.
        // The name suffix '2' avoids collision with the existing get_critter_level alias.
        get_critter_level_sfall2(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_level_sfall2: not a critter: ' + obj, undefined, this)
                return 1
            }
            return (obj as any).level ?? 1
        }

        // sfall 0x8202 — get_num_nearby_critters_sfall(obj, radius, team):
        // Return the number of living critters within radius hexes of obj that belong
        // to the given team.  Pass -1 for team to count all critters regardless of team.
        get_num_nearby_critters_sfall(obj: Obj, radius: number, team: number): number {
            if (!isGameObject(obj)) {
                warn('get_num_nearby_critters_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            if (!obj.position) return 0
            const elev = globalState.currentElevation ?? 0
            const objects = globalState.gMap?.getObjects(elev) ?? []
            let count = 0
            for (const o of objects) {
                if (!isGameObject(o) || o.type !== 'critter') continue
                if ((o as Critter).dead) continue
                if (!o.position) continue
                if (team !== -1 && (o as Critter).teamNum !== team) continue
                if (hexDistance(obj.position, o.position) <= radius) count++
            }
            return count
        }

        // sfall 0x8203 — is_critter_hostile_sfall(obj):
        // Return 1 if the critter is currently hostile to the player, 0 otherwise.
        is_critter_hostile_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('is_critter_hostile_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).hostile ? 1 : 0
        }

        // sfall 0x8204 — set_critter_hostile_sfall(obj, hostile):
        // Set the hostile flag on a critter.
        set_critter_hostile_sfall(obj: Obj, hostile: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_hostile_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as Critter).hostile = hostile !== 0
        }

        // sfall 0x8205 — get_inven_slot_sfall(critter, slot):
        // Return the item in the given inventory slot (0=left, 1=right, 2=armor).
        // Returns 0 if the slot is empty or the argument is not a critter.
        get_inven_slot_sfall(obj: Obj, slot: number): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_inven_slot_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            switch (slot) {
                case 0: return critter.leftHand ?? 0
                case 1: return critter.rightHand ?? 0
                case 2: return critter.equippedArmor ?? 0
                default:
                    warn('get_inven_slot_sfall: unknown slot ' + slot, undefined, this)
                    return 0
            }
        }

        // sfall 0x8206 — get_critter_body_type_sfall(obj):
        // Return the critter body type: 0=biped, 1=quadruped, 2=robotic.
        // Reads pro.extra.bodyType if available; defaults to 0 (biped).
        get_critter_body_type_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_body_type_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).pro?.extra?.bodyType ?? 0
        }

        // sfall 0x8207 — get_flags_sfall(obj):
        // Return the raw Fallout 2 flags bitmask for a game object.
        get_flags_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_flags_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).flags ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 61 — sfall extended opcodes 0x8208–0x820F
        // -----------------------------------------------------------------------

        // sfall 0x8208 — get_critter_trait_sfall(obj, traitId):
        // Return the rank of a character trait on a critter.
        // Traits are stored in critter.charTraits as a Set; this returns 1 if the
        // trait is present, 0 otherwise.
        get_critter_trait_sfall(obj: Obj, traitId: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_trait_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const traits = (obj as Critter).charTraits
            return traits && traits.has(traitId) ? 1 : 0
        }

        // sfall 0x8209 — set_critter_trait_sfall(obj, traitId, value):
        // Add or remove a trait from a critter's charTraits set.
        set_critter_trait_sfall(obj: Obj, traitId: number, value: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_trait_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (!critter.charTraits) critter.charTraits = new Set()
            if (value) critter.charTraits.add(traitId)
            else critter.charTraits.delete(traitId)
        }

        // sfall 0x820A — get_critter_race_sfall(obj):
        // Return the critter's race index from proto.extra.race.
        // 0=human, 1=ghoul, 2=super mutant, 3=ghoul (special), …
        // Defaults to 0 (human) when no race is set.
        get_critter_race_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_race_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).pro?.extra?.race ?? 0
        }

        // sfall 0x820B — obj_has_trait_sfall(obj, traitId):
        // Return 1 if a critter has the given trait; 0 otherwise.
        // Alias of get_critter_trait_sfall() with a more script-friendly name.
        obj_has_trait_sfall(obj: Obj, traitId: number): number {
            return this.get_critter_trait_sfall(obj, traitId)
        }

        // sfall 0x820C — get_critter_move_ap_sfall(obj):
        // Return the critter's current available move AP.
        // Returns 0 when not in combat or AP not initialized.
        get_critter_move_ap_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_move_ap_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).AP?.getAvailableMoveAP() ?? 0
        }

        // sfall 0x820D — get_critter_combat_ap_sfall(obj):
        // Return the critter's current available combat AP.
        // Returns 0 when not in combat or AP not initialized.
        get_critter_combat_ap_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_combat_ap_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).AP?.getAvailableCombatAP() ?? 0
        }

        // sfall 0x820E — critter_knockout_sfall(obj):
        // Return 1 if the critter is currently knocked out (unconscious), else 0.
        critter_knockout_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_knockout_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).knockedOut ? 1 : 0
        }

        // sfall 0x820F — get_map_script_id_sfall():
        // Return the script ID (SID) of the current map's map script.
        // Browser build: returns the current map's script ID from the map object,
        // or 0 if no map script is loaded.
        get_map_script_id_sfall(): number {
            return (globalState.gMap as any)?.mapObj?.scriptID ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 62 — sfall extended opcodes 0x8210–0x8217
        // -----------------------------------------------------------------------

        // sfall 0x8210 — critter_is_fleeing_sfall(obj):
        // Return 1 if the critter is currently fleeing (low-HP flight behaviour),
        // else 0.  Reads the isFleeing flag set by the AI flee code path.
        critter_is_fleeing_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_is_fleeing_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).isFleeing ? 1 : 0
        }

        // sfall 0x8211 — get_perk_name_sfall(perkId):
        // Return the localised display name of a perk by its numeric ID.
        // Browser build: perk name table is not loaded; returns empty string.
        get_perk_name_sfall(perkId: number): string {
            return ''
        }

        // sfall 0x8212 — get_critter_perk_sfall(critter, perkId):
        // Return the rank of a perk possessed by a critter (0 if not possessed).
        // Reads from critter.perkRanks which is updated by critter_add_trait PERK calls.
        get_critter_perk_sfall(obj: Obj, perkId: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_perk_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).perkRanks?.[perkId] ?? 0
        }

        // sfall 0x8213 — obj_is_open_sfall(obj):
        // Return 1 if the object (door/container) is currently in the open state,
        // else 0.  Reads the open flag on the object.
        obj_is_open_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('obj_is_open_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).open === true ? 1 : 0
        }

        // sfall 0x8214 — get_world_map_x_sfall():
        // Return the player's current world-map tile x-coordinate.
        // Returns -1 when the player is not on the world map (inside a local map).
        get_world_map_x_sfall(): number {
            return globalState.worldPosition?.x ?? -1
        }

        // sfall 0x8215 — get_world_map_y_sfall():
        // Return the player's current world-map tile y-coordinate.
        // Returns -1 when the player is not on the world map.
        get_world_map_y_sfall(): number {
            return globalState.worldPosition?.y ?? -1
        }

        // sfall 0x8216 — set_world_map_pos_sfall(x, y):
        // Update the player's stored world-map position.
        // Used by travel and teleport scripts to reposition the player.
        // Only takes effect when the player is already on the world map.
        set_world_map_pos_sfall(x: number, y: number): void {
            if (globalState.worldPosition !== undefined) {
                globalState.worldPosition = { x, y }
            }
        }

        // sfall 0x8217 — get_object_weight_sfall(obj):
        // Return the weight of an object in pounds from its prototype data.
        // Returns 0 for non-item objects or when prototype data is unavailable.
        get_object_weight_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_weight_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).pro?.extra?.weight ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 63 — sfall extended opcodes 0x8218–0x821F
        // -----------------------------------------------------------------------

        // sfall 0x8218 — get_year_sfall():
        // Return the current in-game year (2241 at game start).
        // Derived from gameTickTime: 10 ticks = 1 second; 1 year = 365 * 86400 seconds.
        get_year_sfall(): number {
            const totalSecs = globalState.gameTickTime / 10
            return 2241 + Math.floor(totalSecs / (365 * 86400))
        }

        // sfall 0x8219 — get_month_sfall():
        // Return the current in-game month (1–12).
        // Uses a 30-day month approximation (Fallout 2 uses 365-day years, 30-day months).
        get_month_sfall(): number {
            const totalSecs = globalState.gameTickTime / 10
            const dayOfYear = Math.floor(totalSecs / 86400) % 365
            return Math.floor(dayOfYear / 30) + 1
        }

        // sfall 0x821A — get_day_sfall():
        // Return the current in-game day of the month (1–30, approximate).
        get_day_sfall(): number {
            const totalSecs = globalState.gameTickTime / 10
            const dayOfYear = Math.floor(totalSecs / 86400) % 365
            return (dayOfYear % 30) + 1
        }

        // sfall 0x821B — get_time_sfall():
        // Return the current in-game time in minutes since midnight (0–1439).
        // This matches Fallout 2's time() script opcode which returns HHMM as number.
        get_time_sfall(): number {
            const totalSecs = globalState.gameTickTime / 10
            const secsToday = Math.floor(totalSecs) % 86400
            const hour = Math.floor(secsToday / 3600)
            const minute = Math.floor((secsToday % 3600) / 60)
            return hour * 100 + minute
        }

        // sfall 0x821C — get_critter_kill_type_sfall(obj):
        // Return the kill-type constant for a critter (used for XP and kill counts).
        // 0=men, 1=women, 2=children, 3=super mutants, …
        // Alias of the Phase-58 opcode 0x81F4; reads from pro.extra.killType.
        // Note: this method is already defined in Phase 58 at 0x81F4; the 0x821C
        // opcode entry in vm_bridge.ts is a second binding to the same function.

        // sfall 0x821D — get_npc_pids_sfall():
        // Return an array of PIDs of active party member NPCs.
        // Browser build: returns 0 (not implemented; party tracking is minimal).
        get_npc_pids_sfall(): number {
            return 0
        }

        // sfall 0x821E — get_proto_num_sfall(obj):
        // Return the prototype number (PID) of an object.
        // Alias of obj_pid() exposed under the sfall opcode convention.
        get_proto_num_sfall(obj: Obj): number {
            if (!isGameObject(obj)) return 0
            return (obj as any).pid ?? 0
        }

        // sfall 0x821F — mark_area_known_sfall(areaID, markState):
        // Mark or unmark a world-map location as known.
        // markState: 0 = hide, 1 = reveal.
        // Delegates to globalState.markAreaKnown if registered by the world-map system.
        mark_area_known_sfall(areaID: number, markState: number): void {
            if (typeof globalState.markAreaKnown === 'function') {
                globalState.markAreaKnown(areaID, markState)
            }
        }

        // -----------------------------------------------------------------------
        // Phase 64 — sfall extended opcodes 0x8220–0x8227
        // -----------------------------------------------------------------------

        // sfall 0x8220 — get_cursor_mode_sfall():
        // BLK-126 (Phase 79): Return the current cursor mode from globalState.sfallCursorMode.
        get_cursor_mode_sfall(): number {
            return globalState.sfallCursorMode ?? 0
        }

        // sfall 0x8221 — set_cursor_mode_sfall(mode):
        // BLK-126 (Phase 79): Store cursor mode into globalState.sfallCursorMode.
        set_cursor_mode_sfall(mode: number): void {
            globalState.sfallCursorMode = typeof mode === 'number' && isFinite(mode) ? Math.round(mode) : 0
        }

        // sfall 0x8222 — set_flags_sfall(obj, flags):
        // Set the extended flags word on an object.
        // BLK-070: Companion to get_flags_sfall() (Phase 61 0x8207); allows scripts
        // to persistently modify object flags (used by combat AI and item-state scripts).
        // Writes directly to obj.flags to match get_flags_sfall's read location.
        set_flags_sfall(obj: Obj, flags: number): void {
            if (!isGameObject(obj)) {
                warn('set_flags_sfall: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).flags = flags
        }

        // sfall 0x8223 — critter_skill_level_sfall(obj, skillId):
        // Return the effective (modified) skill value for a critter.
        // Reads the skill via getSkill which applies tag-bonuses and SPECIAL modifiers.
        critter_skill_level_sfall(obj: Obj, skillId: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_skill_level_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const skillName = skillNumToName[skillId]
            if (!skillName) {
                warn('critter_skill_level_sfall: unknown skill id ' + skillId, undefined, this)
                return 0
            }
            return (obj as Critter).getSkill(skillName) ?? 0
        }

        // sfall 0x8224 — get_active_weapon_sfall(obj):
        // Return the object currently wielded in the critter's active hand.
        // Returns 0 when no weapon is equipped.
        get_active_weapon_sfall(obj: Obj): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_active_weapon_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            const activeHand = (critter as any).activeHand ?? 0
            const weapon = activeHand === 1
                ? ((critter as any).leftHand ?? (critter as any).rightHand)
                : ((critter as any).rightHand ?? (critter as any).leftHand)
            return weapon ?? 0
        }

        // sfall 0x8225 — get_inven_ap_cost_sfall(obj, item):
        // Return the AP cost to use an item from inventory on a target.
        // Browser build: returns 0 (AP costs are handled by the UI/combat layer).
        get_inven_ap_cost_sfall(obj: Obj, item: Obj): number {
            return 0
        }

        // sfall 0x8226 — obj_can_see_tile_sfall(obj, tileNum):
        // Return 1 if the critter can see the given tile (LOS check).
        // Browser build: returns 1 when distance is ≤ perception×5 (simplified LOS).
        obj_can_see_tile_sfall(obj: Obj, tileNum: number): number {
            if (!isGameObject(obj) || !obj.position) return 0
            const dest = fromTileNum(tileNum)
            if (!dest) return 0
            const dist = hexDistance(obj.position, dest)
            const per = isGameObject(obj) && obj.type === 'critter'
                ? (obj as Critter).getStat('PER')
                : 5
            return dist <= per * 5 ? 1 : 0
        }

        // sfall 0x8227 — get_map_enter_position_sfall(type):
        // Return a map-entry position value.
        // type=0: tile, type=1: elevation, type=2: rotation
        // Browser build: returns -1 (no saved map-entry position).
        get_map_enter_position_sfall(type: number): number {
            return -1
        }

        // -----------------------------------------------------------------------
        // Phase 65 — sfall extended opcodes 0x8228–0x822F
        // -----------------------------------------------------------------------

        // sfall 0x8228 — get_critter_name_sfall(obj):
        // Return the display name of a critter.  Alias of get_critter_name().
        get_critter_name_sfall(obj: Obj): string {
            if (!isGameObject(obj)) return ''
            return (obj as any).name ?? ''
        }

        // sfall 0x8229 — get_car_fuel_amount_sfall():
        // Return the current fuel level of the player's car (Highwayman).
        // Car fuel is stored in globalState.carFuel (BLK-071: persisted in save v18+).
        get_car_fuel_amount_sfall(): number {
            return globalState.carFuel ?? 0
        }

        // sfall 0x822A — set_car_fuel_amount_sfall(amount):
        // Set the current fuel level of the player's car.
        // Clamps to range [0, 80000] (FO2 maximum fuel capacity).
        set_car_fuel_amount_sfall(amount: number): void {
            globalState.carFuel = Math.max(0, Math.min(80000, amount))
        }

        // sfall 0x822B — get_critter_ai_packet_sfall(obj):
        // Return the AI packet index for a critter.
        // Reads from critter.aiPacket or proto.extra.aiPacket.
        get_critter_ai_packet_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return -1
            return (obj as any).aiPacket ?? (obj as any).pro?.extra?.aiPacket ?? 0
        }

        // sfall 0x822C — set_critter_ai_packet_sfall(obj, packetId):
        // Set the AI packet index for a critter.
        // Used by scripts to switch NPC behaviour patterns dynamically.
        set_critter_ai_packet_sfall(obj: Obj, packetId: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_ai_packet_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as any).aiPacket = packetId
        }

        // sfall 0x822D — obj_under_cursor_sfall():
        // BLK-127 (Phase 79): Return the game object under the cursor from globalState.objUnderCursor.
        // Updated by renderer hover detection; returns 0 when no object is under the cursor.
        obj_under_cursor_sfall(): Obj | 0 {
            return globalState.objUnderCursor ?? 0
        }

        // sfall 0x822E — get_attack_weapon_sfall(obj, attackType):
        // Return the weapon used by a critter for a given attack type.
        // attackType: 0=rightHand (primary), 1=leftHand (secondary).
        // Returns 0 when no weapon is equipped or the attack type is out of range.
        get_attack_weapon_sfall(obj: Obj, attackType: number): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            const critter = obj as Critter
            if (attackType === 0) return (critter as any).rightHand ?? 0
            if (attackType === 1) return (critter as any).leftHand ?? 0
            return 0
        }

        // sfall 0x822F — get_tile_pid_at_sfall(tileNum, elevation):
        // Return the PID of the scenery object on a tile at the given elevation.
        // Returns 0 when no scenery is found (simplified; does not iterate all objects).
        get_tile_pid_at_sfall(tileNum: number, elevation: number): number {
            if (!globalState.gMap) return 0
            const tilePos = fromTileNum(tileNum)
            if (!tilePos) return 0
            const objects = globalState.gMap.getObjects ? globalState.gMap.getObjects(elevation) : []
            for (const obj of objects) {
                if (obj.position &&
                    obj.position.x === tilePos.x &&
                    obj.position.y === tilePos.y) {
                    return (obj as any).pid ?? 0
                }
            }
            return 0
        }

        // -----------------------------------------------------------------------
        // Phase 66 — sfall extended opcodes 0x8230–0x8237
        // -----------------------------------------------------------------------

        // sfall 0x8230 — get_object_name_sfall(obj):
        // Return the display name of any game object (critter, item, scenery, …).
        // Falls through to the vanilla obj_name / critter name path.
        // Returns '' when obj is not a valid game object or has no name.
        get_object_name_sfall(obj: Obj): string {
            if (!isGameObject(obj)) return ''
            return (obj as any).name ?? ''
        }

        // sfall 0x8231 — get_critter_gender_sfall(obj):
        // Return the gender of a critter (0 = male, 1 = female).
        // Uses the critter's .gender property when available; defaults to 0 (male).
        get_critter_gender_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_gender_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const gender: string | undefined = (obj as any).gender
            return gender === 'female' ? 1 : 0
        }

        // sfall 0x8232 — get_combat_round_sfall():
        // Return the current combat round number (1-based).
        // Returns 0 when not in combat.
        get_combat_round_sfall(): number {
            if (!globalState.inCombat || !globalState.combat) return 0
            return (globalState.combat as any).round ?? 0
        }

        // sfall 0x8233 — get_critter_action_points_sfall(obj):
        // Return a critter's current action points during combat (alias of
        // get_critter_combat_ap, but also works when not in combat by returning the
        // critter's maximum AP instead of 0).
        get_critter_action_points_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_action_points_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            if (globalState.inCombat && critter.AP) return critter.AP.combat
            // Outside combat return max AP derived from Agility.
            const agi = typeof critter.getStat === 'function' ? (critter.getStat('AGI') ?? 5) : 5
            return Math.max(1, 5 + Math.floor(agi / 2))
        }

        // sfall 0x8234 — set_critter_action_points_sfall(obj, ap):
        // Set a critter's current action points (alias of set_critter_combat_ap).
        // No-op outside of combat.
        set_critter_action_points_sfall(obj: Obj, ap: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_action_points_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (critter.AP) critter.AP.combat = Math.max(0, ap)
        }

        // sfall 0x8235 — get_critter_max_ap_sfall(obj):
        // Return a critter's maximum action points per turn.
        // Derived from Agility: max_ap = 5 + floor(AGI / 2).
        get_critter_max_ap_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_max_ap_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            const agi = typeof critter.getStat === 'function' ? (critter.getStat('AGI') ?? 5) : 5
            return Math.max(1, 5 + Math.floor(agi / 2))
        }

        // sfall 0x8236 — get_critter_carry_weight_sfall(obj):
        // Return a critter's carry-weight capacity in pounds.
        // Derived from Strength: carry_weight = 25 + ST * 25.
        get_critter_carry_weight_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_carry_weight_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            const str = typeof critter.getStat === 'function' ? (critter.getStat('STR') ?? 5) : 5
            return 25 + str * 25
        }

        // sfall 0x8237 — get_critter_current_weight_sfall(obj):
        // Return the total weight currently carried by a critter in pounds.
        // Derived from proto extra.weight (tenths of a pound → pounds).
        get_critter_current_weight_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_current_weight_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            if (!Array.isArray(critter.inventory)) return 0
            let total = 0
            for (const item of critter.inventory) {
                const w: number = (item as any).pro?.extra?.weight ?? 0
                const amt: number = (item as any).amount ?? 1
                total += Math.floor(w / 10) * amt
            }
            return total
        }

        // -----------------------------------------------------------------------
        // Phase 67 — sfall extended opcodes 0x8238–0x823F
        // -----------------------------------------------------------------------

        // sfall 0x8238 — get_critter_radiation_sfall(obj):
        // Return the critter's current radiation level.  Alias of get_radiation().
        get_critter_radiation_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_radiation_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase('Radiation Level') ?? 0
        }

        // sfall 0x8239 — set_critter_radiation_sfall(obj, val):
        // Set the critter's radiation level to the given absolute value.
        // Unlike radiation_add/radiation_dec which adjust relatively, this sets
        // it directly.  Clamps to [0, 1000].
        set_critter_radiation_sfall(obj: Obj, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_radiation_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const clamped = Math.max(0, Math.min(1000, Math.floor(val)))
            const critter = obj as Critter
            const current = critter.stats.getBase('Radiation Level') ?? 0
            critter.stats.modifyBase('Radiation Level', clamped - current)
        }

        // sfall 0x823A — get_critter_poison_sfall(obj):
        // Return the critter's current poison level.  Alias of get_poison().
        get_critter_poison_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_poison_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase('Poison Level') ?? 0
        }

        // sfall 0x823B — set_critter_poison_sfall(obj, val):
        // Set the critter's poison level to the given absolute value.
        // Unlike poison() which adjusts relatively, this sets it directly.
        // Clamps to [0, 1000].
        set_critter_poison_sfall(obj: Obj, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_poison_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const clamped = Math.max(0, Math.min(1000, Math.floor(val)))
            const critter = obj as Critter
            const current = critter.stats.getBase('Poison Level') ?? 0
            critter.stats.modifyBase('Poison Level', clamped - current)
        }

        // sfall 0x823C — critter_in_party_sfall(obj):
        // Return 1 if the given critter is currently in the player's party,
        // 0 otherwise.  Checks globalState.gParty membership.
        critter_in_party_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('critter_in_party_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            const party = globalState.gParty
            if (!party) return 0
            const members = (party as any).members
            if (!Array.isArray(members)) return 0
            return members.some((m: any) => m === obj || m?.pid === (obj as any).pid) ? 1 : 0
        }

        // sfall 0x823D — get_critter_proto_flags_sfall(obj):
        // Return the proto flags bitmask for a critter.  Reads obj.flags if
        // present; falls back to 0 (partial — no full proto-flag table).
        get_critter_proto_flags_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_critter_proto_flags_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).flags ?? 0
        }

        // sfall 0x823E — set_critter_proto_flags_sfall(obj, flags):
        // Set proto flags on a critter object.  Partial — stores flags on obj
        // for subsequent get_critter_proto_flags_sfall / get_flags_sfall reads.
        set_critter_proto_flags_sfall(obj: Obj, flags: number): void {
            if (!isGameObject(obj)) {
                warn('set_critter_proto_flags_sfall: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).flags = flags >>> 0
        }

        // sfall 0x823F — get_party_count_sfall():
        // Return the current number of critters in the player's party (not
        // counting the player).  Returns 0 when no party exists.
        get_party_count_sfall(): number {
            const party = globalState.gParty
            if (!party) return 0
            const members = (party as any).members
            return Array.isArray(members) ? members.length : 0
        }

        // -----------------------------------------------------------------------
        // Phase 68 — sfall extended opcodes 0x8240–0x8247
        // -----------------------------------------------------------------------

        // sfall 0x8240 — get_critter_damage_type_sfall(obj):
        // Return the default melee damage type for a critter.
        // Fallout 2 damage types: 0=normal, 1=laser, 2=fire, 3=plasma, 4=electrical,
        // 5=EMP, 6=explosion.  Browser build returns 0 (normal) for all critters;
        // full per-critter damage-type tracking is not modelled.
        get_critter_damage_type_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_damage_type_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).damageType ?? 0
        }

        // sfall 0x8241 — set_critter_damage_type_sfall(obj, type):
        // Set the default melee damage type for a critter.
        // Stores the value on the object for subsequent reads.
        set_critter_damage_type_sfall(obj: Obj, type: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_damage_type_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as any).damageType = Math.max(0, Math.min(6, Math.floor(type)))
        }

        // sfall 0x8242 — get_combat_free_move_sfall():
        // Return the number of free tile-moves available this combat turn
        // (the "free move" AP bonus from some perks/traits).
        // Browser build: returns 0 (no free-move tracking).
        get_combat_free_move_sfall(): number {
            return 0
        }

        // sfall 0x8243 — set_combat_free_move_sfall(obj, tiles):
        // Set the number of free tile-moves available to a critter this turn.
        // Browser build: no-op (free-move is not tracked per critter).
        set_combat_free_move_sfall(obj: Obj, tiles: number): void {
            log('set_combat_free_move_sfall', arguments)
        }

        // sfall 0x8244 — get_base_stat_sfall(obj, stat_id):
        // Return the base (unmodified) value of a SPECIAL stat for any critter.
        // Uses the same stat-name mapping as get_critter_stat_sfall but reads the
        // base value instead of the derived value.  Returns 0 for unknown stats
        // or non-critters.
        get_base_stat_sfall(obj: Obj, stat_id: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_base_stat_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            const statNames: Record<number, string> = {
                0: 'STR', 1: 'PER', 2: 'END', 3: 'CHA', 4: 'INT', 5: 'AGI', 6: 'LUK',
                7: 'Max HP', 8: 'AP', 9: 'AC', 10: 'Melee', 11: 'Carry',
                12: 'Sequence', 13: 'Healing Rate', 14: 'Critical Chance', 15: 'Better Criticals',
                16: 'DT Normal', 17: 'DT Laser', 18: 'DT Fire', 19: 'DT Plasma',
                20: 'DT Electrical', 21: 'DT EMP', 22: 'DT Explosive',
                23: 'DR Normal', 24: 'DR Laser', 25: 'DR Fire', 26: 'DR Plasma',
                27: 'DR Electrical', 28: 'DR EMP', 29: 'DR Explosive',
                30: 'DR Radiation', 31: 'DR Poison',
            }
            const name = statNames[stat_id]
            if (!name) {
                log('get_base_stat_sfall: unknown stat id ' + stat_id + ' — returning 0', arguments)
                return 0
            }
            return typeof critter.stats?.getBase === 'function' ? (critter.stats.getBase(name) ?? 0) : 0
        }

        // sfall 0x8245 — set_base_stat_sfall(obj, stat_id, value):
        // Set the base (unmodified) value of a SPECIAL stat on a critter.
        // Uses the same stat-name mapping as get_base_stat_sfall.
        set_base_stat_sfall(obj: Obj, stat_id: number, value: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_base_stat_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            const statNames: Record<number, string> = {
                0: 'STR', 1: 'PER', 2: 'END', 3: 'CHA', 4: 'INT', 5: 'AGI', 6: 'LUK',
                7: 'Max HP', 8: 'AP', 9: 'AC', 10: 'Melee', 11: 'Carry',
                12: 'Sequence', 13: 'Healing Rate', 14: 'Critical Chance',
            }
            const name = statNames[stat_id]
            if (!name) {
                warn('set_base_stat_sfall: unknown stat id ' + stat_id + ' — ignoring', undefined, this)
                return
            }
            if (typeof critter.stats?.modifyBase === 'function') {
                const current = typeof critter.stats?.getBase === 'function' ? (critter.stats.getBase(name) ?? 0) : 0
                critter.stats.modifyBase(name, Math.floor(value) - current)
            }
        }

        // sfall 0x8246 — get_game_difficulty_sfall():
        // Return the current game difficulty setting.
        // 0=easy, 1=normal, 2=hard.  Browser build: always returns 1 (normal).
        get_game_difficulty_sfall(): number {
            return 1
        }

        // sfall 0x8247 — get_violence_level_sfall():
        // Return the current violence level setting (0=minimal, 1=normal, 2=maximum blood).
        // Browser build: always returns 2 (maximum) — no violence-level control implemented.
        get_violence_level_sfall(): number {
            return 2
        }

        // ---------------------------------------------------------------------------
        // Phase 69 — sfall extended opcodes 0x8248–0x824F
        // ---------------------------------------------------------------------------

        // sfall 0x8248 — get_map_limits_sfall(which):
        // Return map dimension in tiles.  which=0 → width, which=1 → height.
        // Fallout 2 maps are always 200×200 tiles.
        get_map_limits_sfall(which: number): number {
            // 0 = width, 1 = height — both are 200 in the Fallout 2 tile grid.
            return 200
        }

        // sfall 0x8249 — obj_is_valid_sfall(obj):
        // Return 1 if `obj` is a valid game object, 0 otherwise.
        // Scripts use this to defend against stale/deleted object references before
        // calling procedures that would crash on a non-object argument.
        obj_is_valid_sfall(obj: any): number {
            return isGameObject(obj) ? 1 : 0
        }

        // sfall 0x824A — get_string_length_sfall(str):
        // Return the length of a string.  Returns 0 for non-string arguments.
        get_string_length_sfall(str: any): number {
            if (typeof str !== 'string') return 0
            return str.length
        }

        // sfall 0x824B — get_char_code_sfall(str, pos):
        // Return the character code (UTF-16 code unit) of `str` at zero-based index
        // `pos`.  Returns -1 when `str` is not a string or `pos` is out of range.
        get_char_code_sfall(str: any, pos: number): number {
            if (typeof str !== 'string') return -1
            if (pos < 0 || pos >= str.length) return -1
            return str.charCodeAt(pos)
        }

        // sfall 0x824C — string_contains_sfall(haystack, needle):
        // Return 1 if `haystack` contains `needle` (case-sensitive), 0 otherwise.
        // Returns 0 for non-string inputs.
        string_contains_sfall(haystack: any, needle: any): number {
            if (typeof haystack !== 'string' || typeof needle !== 'string') return 0
            return haystack.includes(needle) ? 1 : 0
        }

        // sfall 0x824D — string_index_of_sfall(haystack, needle):
        // Return the first zero-based index of `needle` in `haystack`, or -1 if not
        // found.  Returns -1 for non-string inputs.
        string_index_of_sfall(haystack: any, needle: any): number {
            if (typeof haystack !== 'string' || typeof needle !== 'string') return -1
            return haystack.indexOf(needle)
        }

        // sfall 0x824E — get_object_script_id_sfall(obj):
        // Return the integer script SID attached to an object, or -1 when the object
        // has no script.  Used by scripts that want to verify or compare script
        // attachments before calling scripted procedures.
        get_object_script_id_sfall(obj: any): number {
            if (!isGameObject(obj)) return -1
            const script = (obj as Obj)._script
            if (!script) return -1
            // sid is the numeric script identifier loaded from the map data.
            const sid: number | undefined = (script as any).sid ?? (script as any)._sid
            return typeof sid === 'number' ? sid : -1
        }

        // sfall 0x824F — get_script_field_sfall(field):
        // Read a named field from the current script execution context.  In the
        // browser build the full set of engine-internal script fields is not exposed;
        // returns 0 for all field queries so calling scripts do not crash.
        get_script_field_sfall(field: any): number {
            log('get_script_field_sfall: field=' + field + ' — returning 0', arguments)
            return 0
        }

        // ---------------------------------------------------------------------------
        // Phase 70 — sfall extended opcodes 0x8250–0x8257
        // ---------------------------------------------------------------------------

        // sfall 0x8250 — get_object_art_fid_sfall(obj):
        // Return the art FID (Fallout Resource Image identifier) of any game object.
        // Alias for get_object_art_fid(); used by appearance and disguise scripts.
        get_object_art_fid_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_art_fid_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            const frmType = (obj as any).frmType ?? 0
            const frmPID = (obj as any).frmPID ?? (obj as any).fid ?? 0
            return (frmType << 24) | (frmPID & 0xffffff)
        }

        // sfall 0x8251 — set_object_art_fid_sfall(obj, fid):
        // Override the art FID of a game object.
        // Alias for set_object_art_fid(); used by appearance-change and disguise scripts.
        set_object_art_fid_sfall(obj: Obj, fid: number): void {
            if (!isGameObject(obj)) {
                warn('set_object_art_fid_sfall: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).frmType = (fid >> 24) & 0xff
            ;(obj as any).frmPID = fid & 0xffffff
            ;(obj as any).fid = fid & 0xffffff
            log('set_object_art_fid_sfall: fid=0x' + fid.toString(16), arguments)
        }

        // sfall 0x8252 — get_item_subtype_sfall(obj):
        // Return the numeric subtype index of an item object (weapon=3, ammo=4,
        // armor=2, container=1, drug=0, misc=5, key=6).
        // Returns -1 for non-item objects.
        get_item_subtype_sfall(obj: Obj): number {
            if (!isGameObject(obj)) return -1
            if (obj.type !== 'item') return -1
            const subtypeMap: Record<string, number> = {
                drug: 0,
                container: 1,
                armor: 2,
                weapon: 3,
                ammo: 4,
                misc: 5,
                key: 6,
            }
            const sub = (obj as any).subtype as string
            if (typeof sub === 'string' && sub in subtypeMap) return subtypeMap[sub]
            return -1
        }

        // sfall 0x8253 — get_combat_target_sfall(obj):
        // Return the current combat target of a critter, or 0 when not in combat /
        // no target is set.  Used by AI and scripted combat hooks to check targeting.
        get_combat_target_sfall(obj: Obj): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).combatTarget ?? (obj as any)._combatTarget ?? 0
        }

        // sfall 0x8254 — set_combat_target_sfall(obj, target):
        // Assign a specific combat target to a critter.  Browser build: stores the
        // target reference on the critter object so get_combat_target_sfall() reads it.
        set_combat_target_sfall(obj: Obj, target: Obj | number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') return
            ;(obj as any).combatTarget = isGameObject(target) ? target : null
            log('set_combat_target_sfall', arguments)
        }

        // sfall 0x8255 — combat_is_initialized_sfall():
        // Return 1 if the combat system is currently active (i.e. we are in a combat
        // turn), 0 otherwise.
        combat_is_initialized_sfall(): number {
            return globalState.inCombat ? 1 : 0
        }

        // sfall 0x8256 — get_attack_type_sfall(obj, slot):
        // Return the active attack mode/type for a critter.  slot: 0=primary,
        // 1=secondary.  Browser build: returns 0 (unarmed/default) for all critters.
        // The isGameObject check is kept for consistency with other opcode handlers
        // so that invalid arguments produce the same code path as future improvements.
        get_attack_type_sfall(_obj: Obj, _slot: number): number {
            return 0
        }

        // sfall 0x8257 — get_map_script_idx_sfall():
        // Return the index of the currently-executing map script.  Browser build
        // returns -1 (not exposed); scripts that rely on this for branching will
        // receive a safe out-of-range sentinel.
        get_map_script_idx_sfall(): number {
            return -1
        }

        // -----------------------------------------------------------------------
        // Phase 71 — sfall extended opcodes 0x8258–0x825F
        // -----------------------------------------------------------------------

        // sfall 0x8258 — get_critter_hurt_state_sfall(obj):
        // Return the Fallout 2 critter-state bitmask (dead/stunned/knockedDown/
        // crippled/fleeing) for the given critter.  Mirrors the critter_state()
        // opcode (0x8101) but exposed as a sfall-namespaced call so scripts that
        // query it via the sfall dispatch table still get a value.
        get_critter_hurt_state_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            var state = 0
            if ((obj as any).dead === true) state |= 0x01
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

        // sfall 0x8259 — set_critter_hurt_state_sfall(obj, state):
        // Write the Fallout 2 critter-state bitmask.  Each bit maps to a boolean
        // property on the Critter object (same mapping as critter_state above).
        // Bit 0 (dead) is intentionally ignored — use kill_critter for that.
        set_critter_hurt_state_sfall(obj: Obj, state: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') return
            ;(obj as any).knockedOut = !!(state & 0x02)
            ;(obj as any).knockedDown = !!(state & 0x04)
            const crippled = !!(state & 0x08)
            ;(obj as any).crippledLeftLeg = crippled
            ;(obj as any).crippledRightLeg = crippled
            ;(obj as any).crippledLeftArm = crippled
            ;(obj as any).crippledRightArm = crippled
            ;(obj as any).isFleeing = !!(state & 0x10)
        }

        // sfall 0x825A — get_critter_is_fleeing_sfall(obj):
        // Return 1 if the critter is currently fleeing combat, 0 otherwise.
        // Convenience wrapper around the isFleeing property.
        get_critter_is_fleeing_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).isFleeing ? 1 : 0
        }

        // sfall 0x825B — set_critter_is_fleeing_sfall(obj, flag):
        // Set or clear the fleeing state on the given critter.
        set_critter_is_fleeing_sfall(obj: Obj, flag: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') return
            ;(obj as any).isFleeing = flag !== 0
        }

        // sfall 0x825C — get_tile_blocked_sfall(tileNum, elev):
        // Return 1 if any blocking object occupies the given tile on the given
        // elevation, 0 otherwise.  Uses the map object list; returns 0 when the
        // map is not loaded.
        get_tile_blocked_sfall(tileNum: number, _elev: number): number {
            if (!globalState.gMap) return 0
            const pos = fromTileNum(tileNum)
            const objs = globalState.gMap.objectsAtPosition(pos)
            return objs.some((o) => o.blocks()) ? 1 : 0
        }

        // sfall 0x825D — get_critter_hit_pts_sfall(obj):
        // Return the critter's current maximum HP (Max HP stat).  Returns 0 for
        // non-critters or null objects.
        get_critter_hit_pts_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as Critter).getStat('Max HP')
        }

        // sfall 0x825E — critter_add_trait_sfall(obj, traitType, trait, amount):
        // Modify a trait/perk value on a critter.  Browser build: no-op (trait
        // modification requires deeper engine integration not yet implemented).
        critter_add_trait_sfall(_obj: Obj, _traitType: number, _trait: number, _amount: number): void {
            // no-op
        }

        // sfall 0x825F — get_num_new_obj_sfall():
        // Return the count of game objects created by script since the last map
        // load.  Browser build: returns 0 (no per-session object creation counter).
        get_num_new_obj_sfall(): number {
            return 0
        }

        // -----------------------------------------------------------------------
        // Phase 72 — sfall extended opcodes 0x8260–0x8267
        // -----------------------------------------------------------------------

        // sfall 0x8260 — get_critter_weapon (second opcode alias):
        // Opcode alias — the implementation lives in the Phase-52 section above
        // (search for 0x81BE, method get_critter_weapon).  vm_bridge.ts maps both
        // opcodes to the same method; no separate definition is needed here.

        // sfall 0x8261 — set_critter_weapon_sfall(obj, slot, weapon):
        // Equip a weapon in the given slot (0=right, 1=left).
        // Browser build: partial — writes the slot directly; no animation triggered.
        set_critter_weapon_sfall(obj: Obj, slot: number, weapon: Obj | number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_weapon_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const c = obj as Critter
            const item = isGameObject(weapon) ? (weapon as any) : null
            if (slot === 0) c.rightHand = item
            else if (slot === 1) c.leftHand = item
        }

        // sfall 0x8262 — get_object_type_sfall (second opcode alias):
        // Opcode alias — implementation is in the Phase-58 section (search for 0x81F6).

        // sfall 0x8263 — get_critter_team (second opcode alias):
        // Opcode alias — implementation is in the Phase-52 section (search for 0x81C4).

        // sfall 0x8264 — set_critter_team (second opcode alias):
        // Opcode alias — implementation is in the Phase-52 section (search for 0x81C5).

        // sfall 0x8265 — get_ambient_light_sfall():
        // Return the current ambient light level (0=dark, 65536=maximum brightness).
        // Browser build: returns the value from globalState.ambientLightLevel, defaulting
        // to 65536 (full brightness) when no explicit light level has been set.
        get_ambient_light_sfall(): number {
            return globalState.ambientLightLevel ?? 65536
        }

        // sfall 0x8266 — set_ambient_light_sfall(level):
        // Set the ambient light level.  Browser build: writes globalState.ambientLightLevel.
        // Full dynamic-lighting update is not yet wired; the value is stored for script reads.
        set_ambient_light_sfall(level: number): void {
            globalState.ambientLightLevel = typeof level === 'number' ? Math.max(0, Math.min(65536, level)) : 65536
        }

        // sfall 0x8267 — get_map_local_var_sfall(idx):
        // Return a map-local variable by index.  Delegates to the existing map_var()
        // implementation so sfall callers get the same value as native map_var() calls.
        get_map_local_var_sfall(idx: number): any {
            return this.map_var(typeof idx === 'number' ? idx : 0)
        }

        // -----------------------------------------------------------------------
        // Phase 73 — sfall extended opcodes 0x8268–0x826F
        // -----------------------------------------------------------------------

        // sfall 0x8268 — get_critter_ap_sfall(obj):
        // Return the current combat AP available for a critter.
        // In combat: reads the AP.combat field; out of combat returns the max AP stat.
        get_critter_ap_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_ap_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.AP ? critter.AP.combat : critter.getStat('AP')
        }

        // sfall 0x8269 — set_critter_ap_sfall(obj, ap):
        // Set the current combat AP for a critter.
        // No-op when AP.combat is not initialized (out-of-combat critters).
        set_critter_ap_sfall(obj: Obj, ap: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_ap_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as Critter
            if (critter.AP) critter.AP.combat = Math.max(0, ap)
        }

        // sfall 0x826A — get_object_flags_sfall(obj):
        // Return the Fallout 2 flags bitmask for an object.
        // Reads obj.flags (the proto-sourced flags field stored on the Obj).
        get_object_flags_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_object_flags_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).flags ?? 0
        }

        // sfall 0x826B — set_object_flags_sfall(obj, flags):
        // Write the flags bitmask for an object.  Stores on obj.flags so that
        // subsequent get_object_flags_sfall / get_flags_sfall reads are consistent.
        set_object_flags_sfall(obj: Obj, flags: number): void {
            if (!isGameObject(obj)) {
                warn('set_object_flags_sfall: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).flags = flags >>> 0
        }

        // sfall 0x826C — critter_is_dead_sfall(obj):
        // Return 1 if the given object is a dead critter, 0 otherwise.
        // Non-critters always return 0 (they cannot be "dead" in the FO2 sense).
        critter_is_dead_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as Critter).dead ? 1 : 0
        }

        // sfall 0x826D — get_obj_light_level_sfall(obj):
        // Return the light emission level of an object (0–65536).
        // Browser build: reads obj.lightLevel if set; defaults to 0 (no emission).
        get_obj_light_level_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_obj_light_level_sfall: not a game object: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).lightLevel ?? 0
        }

        // sfall 0x826E — set_obj_light_level_sfall(obj, level):
        // Set the light emission level of an object (0–65536).
        // Browser build: stores on obj.lightLevel for get_obj_light_level_sfall reads.
        set_obj_light_level_sfall(obj: Obj, level: number): void {
            if (!isGameObject(obj)) {
                warn('set_obj_light_level_sfall: not a game object: ' + obj, undefined, this)
                return
            }
            ;(obj as any).lightLevel = Math.max(0, Math.min(65536, level))
        }

        // sfall 0x826F — get_elevation_sfall():
        // Return the current map elevation (0–2).  Equivalent to native elevation()
        // but exposed as a sfall opcode for mods that call it via the sfall table.
        get_elevation_sfall(): number {
            return globalState.currentElevation ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 74 — sfall extended opcodes 0x8270–0x8277
        // -----------------------------------------------------------------------

        // sfall 0x8270 — get_tile_at_object_sfall(obj):
        // Return the tile number (tileNum) of the object's current map position.
        // Returns -1 when the object has no position (e.g. is in inventory or is
        // being destroyed) so callers can detect and handle the unplaced state.
        get_tile_at_object_sfall(obj: Obj): number {
            if (!isGameObject(obj)) {
                warn('get_tile_at_object_sfall: not a game object: ' + obj, undefined, this)
                return -1
            }
            if ((obj as any).position == null) return -1
            return toTileNum((obj as any).position)
        }

        // sfall 0x8271 — critter_get_flee_state_sfall(obj):
        // Return 1 if the critter is currently fleeing, 0 otherwise.
        // Alias of the isFleeing flag used by critter_state().
        critter_get_flee_state_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).isFleeing === true ? 1 : 0
        }

        // sfall 0x8272 — critter_set_flee_state_sfall(obj, fleeing):
        // Set the critter's fleeing flag.  1 = fleeing, 0 = not fleeing.
        critter_set_flee_state_sfall(obj: Obj, fleeing: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_set_flee_state_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            ;(obj as any).isFleeing = fleeing !== 0
        }

        // sfall 0x8273 is an alias of get_combat_difficulty_sfall() (0x81EC) —
        // see the vm_bridge.ts registration; no new method body is needed here.

        // sfall 0x8274 — get_object_proto_sfall(obj):
        // Return the proto data object for obj.  Browser build: returns 0 (stub) —
        // the full in-memory proto table is not yet accessible from the script VM.
        get_object_proto_sfall(_obj: Obj): number {
            return 0
        }

        // sfall 0x8275 — get_critter_hit_chance_sfall(attacker, target):
        // Return the computed hit chance (0–100) for attacker against target.
        // Browser build: partial — delegates to getHitChance when combat module
        // is available; returns 0 if not in combat or combat is not initialized.
        get_critter_hit_chance_sfall(attacker: Obj, target: Obj): number {
            if (!isGameObject(attacker) || !isGameObject(target)) return 0
            if (!globalState.combat) return 0
            try {
                return (globalState.combat as any).getHitChance?.(attacker as Critter, target as Critter) ?? 0
            } catch (_e) {
                return 0
            }
        }

        // sfall 0x8276 — get_tile_distance_sfall(tile1, tile2):
        // Return the hex distance between two tile numbers.
        // Fully implemented: converts both tiles via fromTileNum and calls hexDistance.
        get_tile_distance_sfall(tile1: number, tile2: number): number {
            const pos1 = fromTileNum(tile1)
            const pos2 = fromTileNum(tile2)
            if (!pos1 || !pos2) return 0
            return hexDistance(pos1, pos2)
        }

        // sfall 0x8277 — get_tile_in_direction_sfall(tile, dir, count):
        // Return the tile count steps in direction dir from tile.
        // Alias of tile_num_in_direction().
        get_tile_in_direction_sfall(tile: number, dir: number, count: number): number {
            return this.tile_num_in_direction(tile, dir, count)
        }

        // -----------------------------------------------------------------------
        // Phase 75 — sfall extended opcodes 0x8278–0x827F
        // -----------------------------------------------------------------------

        // sfall 0x8278 — get_critter_knockout_sfall(obj):
        // Returns 1 if the critter is currently knocked out (unconscious), 0 otherwise.
        get_critter_knockout_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).knockedOut ? 1 : 0
        }

        // sfall 0x8279 — get_critter_knockdown_sfall(obj):
        // Returns 1 if the critter is currently knocked down (prone), 0 otherwise.
        get_critter_knockdown_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).knockedDown ? 1 : 0
        }

        // sfall 0x827A — get_critter_crippled_legs_sfall(obj):
        // Returns a bitmask: bit 0 (0x01) = left leg crippled, bit 1 (0x02) = right leg.
        get_critter_crippled_legs_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            let mask = 0
            if ((obj as any).crippledLeftLeg)  mask |= 0x01
            if ((obj as any).crippledRightLeg) mask |= 0x02
            return mask
        }

        // sfall 0x827B — get_critter_crippled_arms_sfall(obj):
        // Returns a bitmask: bit 0 (0x01) = left arm crippled, bit 1 (0x02) = right arm.
        get_critter_crippled_arms_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            let mask = 0
            if ((obj as any).crippledLeftArm)  mask |= 0x01
            if ((obj as any).crippledRightArm) mask |= 0x02
            return mask
        }

        // sfall 0x827C — get_critter_dead_sfall(obj):
        // Returns 1 if the critter is dead, 0 otherwise.  Safe for non-critter objects.
        get_critter_dead_sfall(obj: Obj): number {
            if (!isGameObject(obj)) return 0
            return (obj as any).dead ? 1 : 0
        }

        // sfall 0x827D — get_map_loaded_sfall():
        // Returns 1 if the current map was entered via a save/load (alias of game_loaded).
        // BLK-111: reads the real globalState.mapLoadedFromSave flag.
        get_map_loaded_sfall(): number {
            return globalState.mapLoadedFromSave ? 1 : 0
        }

        // sfall 0x827E — get_critter_poison_level_sfall(obj):
        // Returns the current poison level of the critter (same as get_poison).
        get_critter_poison_level_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as Critter).stats?.getBase('Poison Level') ?? 0
        }

        // sfall 0x827F — get_critter_radiation_level_sfall(obj):
        // Returns the current radiation level of the critter (same as get_radiation).
        get_critter_radiation_level_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as Critter).stats?.getBase('Radiation Level') ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 76 — sfall extended opcodes 0x8280–0x8287
        // -----------------------------------------------------------------------

        // sfall 0x8280 — get_last_target_sfall(obj): BLK-117
        // Returns the last combat target of the given critter, or 0 if unset.
        get_last_target_sfall(obj: Obj): Obj | 0 {
            if (!obj || typeof obj !== 'object') return 0
            return (obj as any).lastCombatTarget ?? 0
        }

        // sfall 0x8281 — get_last_attacker_sfall(obj): BLK-117
        // Returns the last combat attacker of the given critter, or 0 if unset.
        get_last_attacker_sfall(obj: Obj): Obj | 0 {
            if (!obj || typeof obj !== 'object') return 0
            return (obj as any).lastCombatAttacker ?? 0
        }

        // sfall 0x8282 — get_critter_level_sfall(obj):
        // Returns the critter's current level.  For the player, reads player.level;
        // for NPCs, returns 1 (partial — NPC level tracking is not yet implemented).
        get_critter_level_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            // Player has a real level property; NPCs default to 1.
            return (obj as any).level ?? 1
        }

        // sfall 0x8283 — get_critter_current_xp_sfall(obj):
        // Returns the critter's current accumulated XP.  For the player, reads
        // player.xp; for NPCs, returns 0 (no XP tracking for non-player critters).
        // NOTE: distinct from get_critter_xp_sfall (0x81F0) which reads proto XPValue.
        get_critter_current_xp_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).xp ?? 0
        }

        // sfall 0x8284 — set_critter_level_sfall(obj, level):
        // Set the critter's level.  Browser build: partial — sets the level property
        // directly on the critter object; no stat recalculation is performed.
        set_critter_level_sfall(obj: Obj, level: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_level_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof level !== 'number' || !isFinite(level) || level < 1) {
                warn('set_critter_level_sfall: invalid level ' + level + ' — no-op', undefined, this)
                return
            }
            ;(obj as any).level = Math.floor(level)
        }

        // sfall 0x8285 — get_critter_base_stat_sfall(obj, stat):
        // Returns the critter's base stat value (before modifiers/bonuses).
        // Mirrors critter_get_stat_sfall (0x8182) but reads the base, not derived.
        get_critter_base_stat_sfall(obj: Obj, stat: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_base_stat_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('get_critter_base_stat_sfall: unknown stat ' + stat + ' — returning 0', undefined, this)
                return 0
            }
            return (obj as Critter).stats?.getBase(statName) ?? 0
        }

        // sfall 0x8286 — set_critter_base_stat_sfall(obj, stat, value):
        // Set the critter's base stat value directly.  Mirrors set_critter_stat.
        set_critter_base_stat_sfall(obj: Obj, stat: number, value: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_base_stat_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const statName = statMap[stat]
            if (!statName) {
                warn('set_critter_base_stat_sfall: unknown stat ' + stat + ' — no-op', undefined, this)
                return
            }
            if (typeof value !== 'number' || !isFinite(value)) {
                warn('set_critter_base_stat_sfall: non-finite value ' + value + ' — no-op', undefined, this)
                return
            }
            ;(obj as Critter).stats?.setBase(statName, Math.round(value))
        }

        // sfall 0x8287 — get_obj_weight_sfall(obj):
        // Return the object's weight in lbs from its proto data.  Returns 0 for
        // non-game-objects or when no weight data is available.
        get_obj_weight_sfall(obj: Obj): number {
            if (!isGameObject(obj)) return 0
            return (obj as any).pro?.extra?.weight ?? (obj as any).weight ?? 0
        }

        // Phase 77 — sfall extended opcodes 0x8288–0x828F
        // -----------------------------------------------------------------------

        // sfall 0x8288 — get_critter_flags_sfall(obj):
        // Returns the engine-level critter flags bitmask.  Alias of get_critter_flags().
        get_critter_flags_sfall(obj: Obj): number {
            return this.get_critter_flags(obj)
        }

        // sfall 0x8289 — set_critter_flags_sfall(obj, flags):
        // Sets the engine-level critter flags in bulk.  Alias of set_critter_flags().
        set_critter_flags_sfall(obj: Obj, flags: number): void {
            this.set_critter_flags(obj, flags)
        }

        // sfall 0x828A — get_critter_worn_armor_sfall(obj):
        // Returns the armor item currently equipped by the critter, or 0 if none.
        get_critter_worn_armor_sfall(obj: Obj): Obj | 0 {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return (obj as any).equippedArmor ?? 0
        }

        // sfall 0x828B — get_critter_weapon_sfall(obj, hand):
        // Returns the weapon in the given hand (0 = right, 1 = left), or 0 if empty.
        get_critter_weapon_sfall(obj: Obj, hand: number): Obj | 0 {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            if (hand === 1) return (obj as any).leftHand ?? 0
            return (obj as any).rightHand ?? 0
        }

        // sfall 0x828C — get_tile_x_sfall(tile):
        // Returns the x hex coordinate of a tile number.
        get_tile_x_sfall(tile: number): number {
            if (typeof tile !== 'number' || !isFinite(tile) || tile < 0) return 0
            return fromTileNum(tile).x
        }

        // sfall 0x828D — get_tile_y_sfall(tile):
        // Returns the y hex coordinate of a tile number.
        get_tile_y_sfall(tile: number): number {
            if (typeof tile !== 'number' || !isFinite(tile) || tile < 0) return 0
            return fromTileNum(tile).y
        }

        // sfall 0x828E — tile_from_coords_sfall(x, y):
        // Returns the tile number for the given (x, y) hex coordinates.
        tile_from_coords_sfall(x: number, y: number): number {
            if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return 0
            return toTileNum({ x: Math.round(x), y: Math.round(y) })
        }

        // sfall 0x828F — get_critter_max_hp_sfall_82(obj):
        // Returns the maximum HP of a critter from its stats or proto data.
        // Returns 0 for non-critters.  Delegates to the canonical
        // get_critter_max_hp_sfall() (0x81F8) which now includes proto fallback.
        get_critter_max_hp_sfall_82(obj: Obj): number {
            return this.get_critter_max_hp_sfall(obj)
        }

        // -----------------------------------------------------------------------
        // Phase 80 — sfall extended opcodes 0x8290–0x8297
        // -----------------------------------------------------------------------

        // sfall 0x8290 — set_critter_current_hp_sfall(obj, hp):
        // Set the current HP of a critter to the given value, clamped to [0, maxHP].
        // Used by New Reno and other mid-game scripts that directly manage NPC health.
        set_critter_current_hp_sfall(obj: Obj, hp: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_current_hp_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof hp !== 'number' || !isFinite(hp)) {
                warn('set_critter_current_hp_sfall: non-finite hp (' + hp + ') — no-op', undefined, this)
                return
            }
            const critter = obj as Critter
            const maxHP: number = (typeof (critter as any).getStat === 'function')
                ? ((critter as any).getStat('Max HP') ?? 100)
                : ((critter as any).pro?.extra?.maxHP ?? 100)
            const clampedHP = Math.max(0, Math.min(Math.round(hp), maxHP))
            if (critter.stats && typeof critter.stats.setBase === 'function') {
                critter.stats.setBase('HP', clampedHP)
            } else {
                ;(critter as any).HP = clampedHP
            }
        }

        // sfall 0x8291 — get_local_var_sfall(idx):
        // Return the local script variable at index idx.
        // Equivalent to local_var() exposed as a dedicated sfall opcode.
        get_local_var_sfall(idx: number): number {
            if (!this.lvars) return 0
            if (this.lvars[idx] === undefined) return 0
            return typeof this.lvars[idx] === 'number' ? this.lvars[idx] : 0
        }

        // sfall 0x8292 — set_local_var_sfall(idx, val):
        // Set the local script variable at index idx to val.
        // Equivalent to set_local_var() exposed as a dedicated sfall opcode.
        set_local_var_sfall(idx: number, val: number): void {
            if (!this.lvars) this.lvars = {}
            if (typeof val === 'number' && !isFinite(val)) {
                warn('set_local_var_sfall: non-finite value (' + val + ') for lvar ' + idx + ' — storing 0', 'lvars')
                val = 0
            }
            this.lvars[idx] = typeof val === 'number' ? val : 0
        }

        // sfall 0x8293 — get_game_time_sfall():
        // Return the current game time in ticks.
        // Alias of game_time(); exposed as a dedicated sfall opcode for scripts that
        // want to avoid caching the vanilla procedure.
        get_game_time_sfall(): number {
            return Math.max(1, globalState.gameTickTime ?? 1)
        }

        // sfall 0x8294 — get_area_known_sfall(areaID):
        // Return 1 if the world-map area with the given ID is known (visible) to
        // the player, 0 otherwise.
        // Reads from globalState.mapAreas when available.
        get_area_known_sfall(areaID: number): number {
            if (globalState.mapAreas && (globalState.mapAreas as any)[areaID] !== undefined) {
                return (globalState.mapAreas as any)[areaID] ? 1 : 0
            }
            return 0
        }

        // sfall 0x8295 — get_kill_counter_sfall(critterType):
        // Return the number of kills of the given critter type accumulated so far.
        // Browser build: returns 0 — per-type kill tracking is not implemented.
        get_kill_counter_sfall(_critterType: number): number {
            return 0
        }

        // sfall 0x8296 — add_kill_counter_sfall(critterType, count):
        // Add count to the kill counter for the given critter type.
        // Browser build: no-op — per-type kill tracking is not implemented.
        add_kill_counter_sfall(_critterType: number, _count: number): void {
            // no-op
        }

        // sfall 0x8297 — get_player_elevation_sfall():
        // Return the player's current elevation (0–2).
        // Alias of get_elevation_sfall(); exposed separately for clarity.
        get_player_elevation_sfall(): number {
            return globalState.currentElevation ?? 0
        }

        // -----------------------------------------------------------------------
        // Phase 81 — sfall extended opcodes 0x8298–0x829F
        // -----------------------------------------------------------------------

        // sfall 0x8298 — get_critter_stat_sfall2(obj, stat):
        // Safe alias of get_critter_stat that applies an additional null guard for
        // the obj parameter.  New Reno scripts call this frequently on objects that
        // may be 0 (FO2 null convention); the base get_critter_stat already handles
        // that, but this exposes the same path as a dedicated sfall opcode.
        get_critter_stat_sfall2(obj: Obj, stat: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') return 0
            return this.get_critter_stat(obj as Critter, stat)
        }

        // sfall 0x8299 — set_critter_extra_stat_sfall(obj, stat, val):
        // Set a temporary extra-stat modifier on a critter.  Stores the value in a
        // critter.extraStats dictionary for retrieval by get_critter_extra_stat_sfall.
        // Used by New Reno boss scripts that buff/debuff NPCs dynamically.
        set_critter_extra_stat_sfall(obj: Obj, stat: number, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_extra_stat_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof val !== 'number' || !isFinite(val)) {
                warn('set_critter_extra_stat_sfall: non-finite val (' + val + ') — clamping to 0', undefined, this)
                val = 0
            }
            const critter = obj as any
            if (!critter.extraStats) critter.extraStats = {}
            critter.extraStats[stat] = val
        }

        // sfall 0x829A — get_active_hand_sfall():
        // Return the player's currently active weapon hand: 0 = primary (leftHand),
        // 1 = secondary (rightHand).  Alias of active_hand(); exposed as a dedicated
        // sfall opcode for weapon-swapping combat scripts.
        get_active_hand_sfall(): number {
            return (globalState.player as any)?.activeHand ?? 0
        }

        // sfall 0x829B — set_active_hand_sfall(hand):
        // Switch the player's active weapon hand: 0 = primary, 1 = secondary.
        // Clamps out-of-range values to the valid set {0, 1}.
        set_active_hand_sfall(hand: number): void {
            if (!globalState.player) return
            ;(globalState.player as any).activeHand = (hand === 1) ? 1 : 0
        }

        // sfall 0x829C — get_item_type_sfall(item):
        // Return the numeric item-type index of an item object:
        //   0=drug, 1=container, 2=armor, 3=weapon, 4=ammo, 5=misc, 6=key
        // Returns -1 for non-item objects.
        // Distinct from get_item_subtype_sfall (0x8252) in that it returns -1 for
        // non-items rather than a subtype enum — some sfall scripts test for -1 to
        // detect non-item objects.
        get_item_type_sfall(item: Obj): number {
            if (!isGameObject(item) || item.type !== 'item') return -1
            const subtypeMap: Record<string, number> = {
                drug: 0,
                container: 1,
                armor: 2,
                weapon: 3,
                ammo: 4,
                misc: 5,
                key: 6,
            }
            const sub = (item as any).subtype as string
            if (typeof sub === 'string' && sub in subtypeMap) return subtypeMap[sub]
            return -1
        }

        // sfall 0x829D — get_critter_perk_level_sfall(obj, perkId):
        // Return the rank of a specific perk for a critter.
        // Reads from critter.perkRanks (same source as get_critter_perk_sfall / 0x8212).
        // Used by New Reno prize/reward scripts that check perk prerequisites.
        get_critter_perk_level_sfall(obj: Obj, perkId: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_perk_level_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).perkRanks?.[perkId] ?? 0
        }

        // sfall 0x829E — set_critter_perk_sfall(obj, perkId, level):
        // Set a specific perk rank on a critter.
        // For player critters this writes to player.perkRanks; for NPCs it writes to
        // critter.perkRanks.  Negative levels are clamped to 0 (remove perk).
        set_critter_perk_sfall(obj: Obj, perkId: number, level: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_perk_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof level !== 'number' || !isFinite(level)) {
                warn('set_critter_perk_sfall: non-finite level (' + level + ') — clamping to 0', undefined, this)
                level = 0
            }
            const critter = obj as Critter
            if (!critter.perkRanks) (critter as any).perkRanks = {}
            critter.perkRanks[perkId] = Math.max(0, Math.round(level))
        }

        // sfall 0x829F — get_distance_sfall(obj1, obj2):
        // Return the hex grid distance between two game objects.
        // Returns -1 when either object has no position (e.g. in inventory) or is
        // not a valid game object.  Uses the same hexDistance() path as normal LOS.
        get_distance_sfall(obj1: Obj, obj2: Obj): number {
            if (!isGameObject(obj1) || !obj1.position) return -1
            if (!isGameObject(obj2) || !obj2.position) return -1
            return hexDistance(obj1.position, obj2.position)
        }

        // -----------------------------------------------------------------------
        // Phase 82 — sfall extended opcodes 0x82A0–0x82A7
        // -----------------------------------------------------------------------

        // sfall 0x82A0 — get_worldmap_free_move_sfall():
        // Returns 1 if "free movement" (no AP cost on world map) is enabled.
        // The browser build does not implement this flag — returns 0.
        get_worldmap_free_move_sfall(): number {
            return 0
        }

        // sfall 0x82A1 — set_worldmap_free_move_sfall(v):
        // Sets world-map free-movement state.  No-op in the browser build.
        set_worldmap_free_move_sfall(_v: number): void {
            // no-op
        }

        // sfall 0x82A2 — get_car_current_town_sfall():
        // Returns the area ID of the car's current location, or -1 if the car has
        // not been acquired / placed.  Reads from globalState.carAreaID when set.
        get_car_current_town_sfall(): number {
            const areaID = (globalState as any).carAreaID
            return typeof areaID === 'number' ? areaID : -1
        }

        // sfall 0x82A3 — get_dude_obj_sfall():
        // Returns the player (dude) game object, or 0 when no player exists.
        // This is the sfall equivalent of the built-in dude_obj() variable.
        get_dude_obj_sfall(): Obj | 0 {
            return globalState.player ?? 0
        }

        // sfall 0x82A4 — set_dude_obj_sfall(obj):
        // Override which object is treated as the player.  Stub — the browser
        // build does not support player-object substitution.
        set_dude_obj_sfall(_obj: Obj): void {
            // no-op stub
        }

        // sfall 0x82A5 — alias of 0x8235 get_critter_max_ap_sfall (already defined above).
        // The vm_bridge maps both 0x8235 and 0x82A5 to the same method.

        // sfall 0x82A6 — get_tile_light_level_sfall(tile):
        // Returns the light level (0–65536) at the given tile.  The browser build
        // does not expose per-tile light readback; returns 0.
        get_tile_light_level_sfall(_tile: number): number {
            return 0
        }

        // sfall 0x82A7 — set_tile_light_level_sfall(tile, level):
        // Sets the light level at a specific tile.  No-op in the browser build.
        set_tile_light_level_sfall(_tile: number, _level: number): void {
            // no-op
        }

        // -----------------------------------------------------------------------
        // Phase 83 — sfall extended opcodes 0x82A8–0x82AF
        // -----------------------------------------------------------------------

        // sfall 0x82A8 — get_critter_experience_sfall(obj):
        // Return the total experience points accumulated by a critter.
        // Reads critter.xp for any critter (player or NPC).  Falls back to
        // critter.experience for NPCs that store XP in that field instead.
        get_critter_experience_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_experience_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as any
            if (typeof critter.xp === 'number') return critter.xp
            return typeof critter.experience === 'number' ? critter.experience : 0
        }

        // sfall 0x82A9 — set_critter_experience_sfall(obj, val):
        // Set the total experience points for a critter.
        // Writes to critter.xp (and critter.experience for NPCs that use that field).
        // Values are clamped to [0, 2_147_483_647].
        set_critter_experience_sfall(obj: Obj, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_experience_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof val !== 'number' || !isFinite(val)) {
                warn('set_critter_experience_sfall: non-finite val (' + val + ') — no-op', undefined, this)
                return
            }
            const clamped = Math.max(0, Math.min(Math.round(val), 2_147_483_647))
            const critter = obj as any
            critter.xp = clamped
            critter.experience = clamped
        }

        // sfall 0x82AA — get_critter_crit_chance_sfall(obj):
        // Return the critter's critical-hit modifier (percent, signed).
        // Reads from critter.critChanceMod if set; otherwise returns 0.
        // Affects the chance that any given attack becomes a critical hit.
        get_critter_crit_chance_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_crit_chance_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).critChanceMod ?? 0
        }

        // sfall 0x82AB — set_critter_crit_chance_sfall(obj, val):
        // Set the critter's critical-hit modifier.  Stored in critter.critChanceMod.
        // Clamped to [-100, 100] to prevent unreachable probabilities.
        set_critter_crit_chance_sfall(obj: Obj, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_crit_chance_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof val !== 'number' || !isFinite(val)) {
                warn('set_critter_crit_chance_sfall: non-finite val (' + val + ') — no-op', undefined, this)
                return
            }
            ;(obj as any).critChanceMod = Math.max(-100, Math.min(100, Math.round(val)))
        }

        // sfall 0x82AC — get_critter_npc_flag_sfall(obj, flag):
        // Return the value of a specific NPC flags bit (0 or 1).
        // flag is a bit index (0–31); reads from critter.npcFlags bitfield.
        // Used by New Reno side-quest scripts that track critter disposition bits.
        get_critter_npc_flag_sfall(obj: Obj, flag: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_npc_flag_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            if (typeof flag !== 'number' || flag < 0 || flag > 31) return 0
            const bits: number = (obj as any).npcFlags ?? 0
            return (bits >>> flag) & 1
        }

        // sfall 0x82AD — set_critter_npc_flag_sfall(obj, flag, val):
        // Set or clear a single NPC flags bit.  flag is a bit index (0–31);
        // a truthy val sets the bit, a falsy val clears it.
        // Writes to critter.npcFlags; initialises to 0 if not present.
        set_critter_npc_flag_sfall(obj: Obj, flag: number, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_npc_flag_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof flag !== 'number' || flag < 0 || flag > 31) return
            const critter = obj as any
            const bits: number = critter.npcFlags ?? 0
            critter.npcFlags = val ? (bits | (1 << flag)) : (bits & ~(1 << flag))
        }

        // sfall 0x82AE — get_critter_outline_color_sfall(obj):
        // Return the current highlight/outline colour index for a critter.
        // 0 = no outline.  Reads from critter.sfallOutlineColor.
        // Used by some quest scripts to check if a critter is already highlighted.
        get_critter_outline_color_sfall(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_outline_color_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as any).sfallOutlineColor ?? 0
        }

        // sfall 0x82AF — set_critter_outline_color_sfall(obj, color):
        // Set the highlight/outline colour for a critter.  0 = remove outline.
        // Writes to critter.sfallOutlineColor and, when a renderer is attached,
        // triggers a re-render by calling obj.invalidate() when available.
        set_critter_outline_color_sfall(obj: Obj, color: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_outline_color_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            const critter = obj as any
            critter.sfallOutlineColor = typeof color === 'number' && color >= 0 ? Math.floor(color) : 0
            if (typeof critter.invalidate === 'function') {
                try { critter.invalidate() } catch (_) { /* ignore renderer errors */ }
            }
        }

        reg_anim_animate_once(obj: Obj, anim: number, _delay: number): void {
            if (!isGameObject(obj)) {
                warn('reg_anim_animate_once: not a game object', 'animation', this)
                return
            }
            // anim 0 = idle/stand animation; trigger it as a single non-looping cycle
            if (typeof (obj as any).singleAnimation === 'function') {
                try {
                    ;(obj as any).singleAnimation(false, null)
                } catch (e) {
                    warn('reg_anim_animate_once: singleAnimation threw: ' + e, 'animation', this)
                }
            }
        }

        // BLK-122 — gfade_out real CSS implementation:
        // Fade the game canvas to black using a CSS transition.  Safe in Node.js.
        gfade_out_css(_time: number): void {
            if (typeof document === 'undefined') return
            const cnv = document.getElementById('cnv')
            if (cnv) {
                cnv.style.transition = 'opacity 0.5s ease-in-out'
                cnv.style.opacity = '0'
            }
        }

        // BLK-122 — gfade_in real CSS implementation:
        // Restore the game canvas from a previous fade-out.  Safe in Node.js.
        gfade_in_css(_time: number): void {
            if (typeof document === 'undefined') return
            const cnv = document.getElementById('cnv')
            if (cnv) {
                cnv.style.transition = 'opacity 0.5s ease-in-out'
                cnv.style.opacity = '1'
            }
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
        // BLK-132: Wrap the file-load in a try-catch so that a missing .msg file
        // (e.g. for a New Reno sub-area that has no translated dialogue) degrades
        // gracefully to empty messages rather than throwing an unhandled error that
        // crashes the entire script VM.  The existing warn at call-site will still
        // fire if the resulting scriptMessages[name] stays undefined.
        let msg: string
        try {
            msg = getFileText('data/text/english/dialog/' + name + '.msg')
        } catch (e) {
            warn('loadMessageFile: could not load ' + name + '.msg — using empty message table: ' + e, 'load')
            scriptMessages[name] = {}
            return
        }
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
            // BLK-144: wrap start proc in callProcedureSafe so a throwing script
            // initializer does not propagate up and crash the map-load loop.
            callProcedureSafe(() => script.start(), script.scriptName, 'start')
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
        // BLK-143: wrap in callProcedureSafe so a throwing timer callback does not
        // abort subsequent timed events or corrupt the game loop.
        callProcedureSafe(() => script.timed_event_p_proc(), script.scriptName, 'timed_event_p_proc')
        flushUnsupportedVMOperations(script)
        return script._didOverride
    }

    export function use(obj: Obj, source: Obj): boolean | null {
        if (!obj._script || obj._script.use_p_proc === undefined) return null

        // If the item being used is a drug, mark the source critter as
        // "on drugs" so that metarule(18) checks return the correct result
        // for the duration of the drug effect.
        if (isDrugItem(obj) && source && (source as any).type === 'critter') {
            markOnDrugs(source)
        }

        obj._script.source_obj = source
        obj._script.self_obj = obj as ScriptableObj
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'use_p_proc')
        // BLK-140: safe dispatch — a throwing use_p_proc must not crash the game.
        callProcedureSafe(() => obj._script!.use_p_proc(), obj._script.scriptName, 'use_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => obj._script!.look_at_p_proc(), obj._script.scriptName, 'look_at_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(
            () => obj._script!.description_p_proc(),
            obj._script.scriptName,
            'description_p_proc'
        )
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function talk(script: Script, obj: Obj): boolean {
        script.self_obj = obj as ScriptableObj
        script.game_time = Math.max(1, globalState.gameTickTime)
        script.cur_map_index = currentMapID
        script._didOverride = false
        trackScriptTrigger(script, 'talk_p_proc')
        // BLK-140: safe dispatch — a throwing talk_p_proc must not leave the player
        // stuck in a broken dialogue state or crash the game.
        callProcedureSafe(() => script.talk_p_proc(), script.scriptName, 'talk_p_proc')
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
        // BLK-090: Guard against null position — critters with no position (not yet
        // placed on the map, or mid-transition) would crash toTileNum(null).  Fall back
        // to tile 0 so the critter_p_proc can still run without crashing.
        script.self_tile = obj.position ? toTileNum(obj.position) : 0
        trackScriptTrigger(script, 'critter_p_proc')
        // BLK-140: safe dispatch — a throwing critter_p_proc must not abort
        // subsequent NPC updates or crash the game loop.
        callProcedureSafe(() => script.critter_p_proc(), script.scriptName, 'critter_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => script.spatial_p_proc(), script.scriptName, 'spatial_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => obj._script!.destroy_p_proc(), obj._script.scriptName, 'destroy_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => obj._script!.damage_p_proc(), obj._script.scriptName, 'damage_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(
            () => obj._script!.use_skill_on_p_proc(),
            obj._script.scriptName,
            'use_skill_on_p_proc'
        )
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => obj._script!.pickup_p_proc(), obj._script.scriptName, 'pickup_p_proc')
        flushUnsupportedVMOperations(obj._script)
        return obj._script._didOverride
    }

    export function useObjOn(obj: Obj, item: Obj): boolean | null {
        if (!obj._script || obj._script.use_obj_on_p_proc === undefined) return null

        // If the item being used on this target is a drug, mark the target
        // critter as "on drugs" so that metarule(44)/WHO_ON_DRUGS queries return
        // the correct result (e.g. NPC healer scripts using stimpaks on companions).
        if (isDrugItem(item) && (obj as any).type === 'critter') {
            markOnDrugs(obj)
        }

        obj._script.source_obj = item as Obj
        obj._script.self_obj = obj as ScriptableObj
        obj._script.cur_map_index = currentMapID
        obj._script._didOverride = false
        trackScriptTrigger(obj._script, 'use_obj_on_p_proc')
        // BLK-140: safe dispatch.
        callProcedureSafe(
            () => obj._script!.use_obj_on_p_proc(),
            obj._script.scriptName,
            'use_obj_on_p_proc'
        )
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
        // BLK-140: safe dispatch.
        callProcedureSafe(() => obj._script!.push_p_proc(), obj._script.scriptName, 'push_p_proc')
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
        // BLK-140: safe dispatch.
        callProcedureSafe(
            () => obj._script!.is_dropping_p_proc(),
            obj._script.scriptName,
            'is_dropping_p_proc'
        )
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

        // hack so that the procedure is allowed to finish before
        // we actually terminate combat
        var doTerminate: any = false // did combat_p_proc terminate combat?
        obj._script.terminate_combat = function () {
            doTerminate = true
        }
        trackScriptTrigger(obj._script, 'combat_p_proc')
        // BLK-140: safe dispatch — a throwing combat_p_proc must not crash the combat loop.
        callProcedureSafe(() => obj._script!.combat_p_proc(), obj._script.scriptName, 'combat_p_proc')
        flushUnsupportedVMOperations(obj._script)

        if (doTerminate) {
            info('[combatEvent] combat_p_proc requested terminate_combat')
            Script.prototype.terminate_combat.call(obj._script) // call original
        }

        // BLK-068: Return true when either terminate_combat was requested OR when
        // script_overrides() was called by combat_p_proc.  In Fallout 2, calling
        // script_overrides() inside combat_p_proc tells the engine to skip the
        // default AI combat processing for this critter's turn.
        return doTerminate || obj._script._didOverride
    }

    export function updateMap(mapScript: Script, objects: Obj[], elevation: number) {
        gameObjects = objects
        mapFirstRun = false

        if (mapScript) {
            mapScript.combat_is_initialized = globalState.inCombat ? 1 : 0
            if (mapScript.map_update_p_proc !== undefined) {
                mapScript.self_obj = { _script: mapScript }
                trackScriptTrigger(mapScript, 'map_update_p_proc')
                // BLK-140: safe dispatch — map script errors must not abort NPC updates.
                callProcedureSafe(
                    () => mapScript.map_update_p_proc(),
                    mapScript.scriptName,
                    'map_update_p_proc'
                )
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
                // BLK-142: Per-object isolation — one NPC's throwing map_update_p_proc
                // must not abort subsequent NPC updates.  Wrap each call individually.
                callProcedureSafe(
                    () => (script as Script).map_update_p_proc(),
                    script.scriptName,
                    'map_update_p_proc'
                )
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
            // BLK-140: safe dispatch — map exit script errors must not abort the transition.
            callProcedureSafe(
                () => mapScript.map_exit_p_proc(),
                mapScript.scriptName,
                'map_exit_p_proc'
            )
            flushUnsupportedVMOperations(mapScript)
        }

        for (let i = 0; i < gameObjects.length; i++) {
            const script = gameObjects[i]._script
            if (script !== undefined && script.map_exit_p_proc !== undefined) {
                script.self_obj = gameObjects[i] as ScriptableObj
                script.game_time = Math.max(1, globalState.gameTickTime)
                script.cur_map_index = mapID
                trackScriptTrigger(script, 'map_exit_p_proc')
                // BLK-140: per-object isolation for exit scripts.
                callProcedureSafe(
                    () => (script as Script).map_exit_p_proc(),
                    script.scriptName,
                    'map_exit_p_proc'
                )
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
            // BLK-140: safe dispatch — a throwing map_enter_p_proc must not abort the
            // map load sequence and leave the player in an invalid state.
            callProcedureSafe(
                () => mapScript.map_enter_p_proc(),
                mapScript.scriptName,
                'map_enter_p_proc'
            )
            flushUnsupportedVMOperations(mapScript)
        }

        // BLK-111: Clear the save-load flag after map_enter_p_proc has run.
        // Scripts that call game_loaded() inside map_enter_p_proc see 1 (loaded
        // from save); subsequent critter_p_proc calls see 0 (normal run).
        globalState.mapLoadedFromSave = false

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
            // BLK-140: safe dispatch — per-object enter script errors must not abort the map load.
            callProcedureSafe(
                () => (script as Script).map_enter_p_proc(),
                script.scriptName,
                'map_enter_p_proc'
            )
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
        _druggedCritters.clear() // clear per-critter drug effects on map transition
    }

    export function init(mapName: string, mapID?: number) {
        seed(123)
        reset(mapName, mapID)
    }
}
