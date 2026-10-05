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
/* eslint-disable prefer-rest-params */

declare const __dirname: string

import { Combat, CombatStartData } from './combat.js'
import { critterDamage } from './critter.js'
import { areaContainingMap, lookupMapName, lookupScriptName, setMapMusic } from './data.js'
import { hexDirectionTo, hexDistance, hexInDirection, hexInDirectionDistance, Point, hexToScreen } from './geometry.js'
import { Spatial } from './map.js'
import globalState from './globalState.js'
import { parseIntFile } from './intfile.js'
import { actionExplode, Critter, createObjectWithPID, Obj, objectGetDamageType, setObjectOpen } from './object.js'
import { Player } from './player.js'
import { lookupArt, makePID, loadPRO } from './pro.js'
import { centerCamera, centerTile, objectOnScreen } from './renderer.js'
import { Lightmap } from './lightmap.js'
import { fromTileNum, hexToTile, isValidTileNum, toTileNum } from './tile.js'
import { uiAddDialogueOption, uiBarterMode, uiEndDialogue, uiLog, uiSetDialogueReply, uiStartDialogue } from './ui.js'
import { UIMode } from './uiMode.js'
import { BinaryReader, getFileBinarySync, getFileText, getMessage, getRandomInt, fixMojibake } from './util.js'
import { aiPacketFor, isWithinPerception as perceives, playerInSneakMode } from './combat/aiPacket.js'
import { SKILL_NAMES, skillRoll as engineSkillRoll } from './skillUse.js'
import { adjustPoison, adjustRadiation } from './character/radiationPoison.js'
import { installSfallFunctions, resetSfallState, sfallSettings } from './sfallFunctions.js'
import { setPerkGvarReader } from './character/perks.js'
import { EventBus } from './eventBus.js'
import { gameDate } from './gameTime.js'
import { RollResult } from './skillCheck.js'
import { skillDependencies } from './skills.js'
import { ScriptVM } from './vm.js'
import { ScriptVMBridge } from './vm_bridge.js'
import { Config } from './config.js'
import { sfallSprintf } from './sfallPrintf.js'
import { iniInt, iniString, parseIniSetting } from './iniFiles.js'
import { AVAILABLE_GLOBAL_SCRIPT_TYPES, clearGlobalScripts, runGlobalScriptsAtProc, setGlobalScriptRepeat, setGlobalScriptType, startGlobalScripts } from './globalScripts.js'
import { getSfallGlobalAny, rawToFloat, setSfallGlobalAny, setSfallGlobalInt } from './sfallGlobals.js'
import { PERK_MAP } from './character/perks.js'
import { awardCritterXp } from './character/xp.js'
import { canCritterCarryMore, getCritterInventoryWeightLbs } from './critterInventory.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { syncPlayerEntityFromCritter } from './playerProjection.js'
import { advanceGameTime, bindTimedEventList } from './character/rest.js'
import { fillCarGas, getCarFuel, getCarPark, getCarTrunkMaxSize, setCarTrunkMaxSize, setHasCar } from './car.js'
import {
    syncReputationFromGvar,
    pullReputationFromGvars,
    GVAR_PLAYER_GOT_CAR,
} from './quest/townReputation.js'
import { signalEndGame } from './endgame.js'
import { playMovie } from './movies.js'
import { fadeIn, fadeOut } from './fade.js'
import { getSettings, iniOverride, violenceToIni } from './settings.js'
import { itemDropAll } from './mapAging.js'
import { sfxAmbientName, sfxCharName, sfxInterfaceName, sfxOpenName, sfxSceneryName, sfxWeaponName } from './sfxNames.js'
import { equipItem, isRealItem, removeItem } from './equipment.js'
import { hasDrugEvent, isDrug, takeDrug } from './character/timedEffects.js'
import {
    ANIM_COUNT, ANIM_FALL_BACK, ANIM_FALL_BACK_SF, ANIM_FALL_FRONT, ANIM_FALL_FRONT_BLOOD, ANIM_FALL_FRONT_SF,
    ANIM_BACK_TO_STANDING, ANIM_PRONE_TO_STANDING, ANIM_STAND, ANIMATION_REQUEST_UNRESERVED, animationIsBusy, critterArt, isProne, resetAnimSequences, weaponAnimationCode,
    regAnimAnimate, regAnimAnimateForever, regAnimAnimateReversed, regAnimBegin, regAnimClear, regAnimEnd,
    regAnimMoveToObject, regAnimMoveToTile, regAnimPlaySfx, regAnimRunToObject, regAnimRunToTile, regAnimSetArt,
    regAnimBlocked, regAnimCallback, setRegAnimCombatCheck,
} from './animSequence.js'

export namespace Scripting {
    let useElevatorHandler: (source: unknown, type: number) => number = () => -1

    let tilesList: string[] = []
    let tilesIndexMap: Map<string, number> | null = null

    function loadTilesList(): void {
        if (tilesIndexMap !== null) return
        tilesIndexMap = new Map<string, number>()
        try {
            let text = ''
            if (typeof window === 'undefined' || typeof XMLHttpRequest === 'undefined') {
                // Node.js environment — prefer converted art export, fall back to lut fixture
                const candidatePaths: string[] = []
                const fs = (globalThis as any).nodeFs
                const path = (globalThis as any).nodePath
                const req = typeof (globalThis as any).require === 'function' ? (globalThis as any).require : null
                const fsMod = fs || (req ? req('fs') : null)
                const pathMod = path || (req ? req('path') : null)
                if (fsMod && pathMod) {
                    const proc = (globalThis as any).process
                    if (typeof proc !== 'undefined' && typeof proc.cwd === 'function') {
                        candidatePaths.push(pathMod.join(proc.cwd(), 'data', 'art', 'tiles', 'tiles.lst'))
                        candidatePaths.push(pathMod.join(proc.cwd(), 'lut', 'tiles.lst'))
                    }
                    const dir = typeof __dirname !== 'undefined' ? __dirname : ''
                    if (dir) {
                        candidatePaths.push(pathMod.resolve(dir, '..', 'data', 'art', 'tiles', 'tiles.lst'))
                        candidatePaths.push(pathMod.resolve(dir, '..', 'lut', 'tiles.lst'))
                    }
                    for (const tilesPath of candidatePaths) {
                        if (tilesPath && fsMod.existsSync(tilesPath)) {
                            text = fsMod.readFileSync(tilesPath, 'utf8')
                            break
                        }
                    }
                }
            } else {
                // Browser environment — try converted art, then lut fixture
                text = getFileText('data/art/tiles/tiles.lst') || getFileText('lut/tiles.lst') || ''
            }
            if (text) {
                tilesList = text.split(/\r?\n/).map(line => line.trim().toLowerCase().replace(/\.frm$/, ''))
                for (let i = 0; i < tilesList.length; i++) {
                    // Skip blanks and comment lines so fixtures can document indices.
                    if (!tilesList[i] || tilesList[i].startsWith('#')) {
                        continue
                    }
                    tilesIndexMap.set(tilesList[i], i)
                }
            }
        } catch (e) {
            console.warn('Failed to load tiles.lst:', e)
        }
    }

    /** The art index of the floor or roof square under a tile (tiles.lst line), 0 for none. */
    function getTileIndex(tile: number, elevation: number, layer: 'floor' | 'roof'): number {
        if (!isValidTileNum(tile)) {
            return 0
        }
        const map = globalState.gMap
        if (!map || !map.mapObj || elevation < 0 || elevation >= map.numLevels) {
            return 0
        }
        const squares = map.mapObj.levels[elevation]?.tiles?.[layer]
        if (!squares) {
            return 0
        }
        const tilePos = hexToTile(fromTileNum(tile))
        const tileName = squares[tilePos.y]?.[tilePos.x]
        if (!tileName) {
            return 0
        }
        loadTilesList()
        return tilesIndexMap?.get(tileName.toLowerCase()) ?? 0
    }

    /** Patch the live map floor name from an FID (script-visible; renderer may lag). */
    function setTileFID(tile: number, elevation: number, fid: number): void {
        if (!isValidTileNum(tile)) {
            return
        }
        if (typeof fid !== 'number' || !Number.isFinite(fid)) {
            return
        }
        const map = globalState.gMap
        if (!map || !map.mapObj || elevation < 0 || elevation >= map.numLevels) {
            return
        }
        const level = map.mapObj.levels[elevation]
        if (!level || !level.tiles || !level.tiles.floor) {
            return
        }
        const hexPos = fromTileNum(tile)
        const tilePos = hexToTile(hexPos)
        const floor = level.tiles.floor
        if (tilePos.y < 0 || tilePos.y >= floor.length) {
            return
        }
        const row = floor[tilePos.y]
        if (!row || tilePos.x < 0 || tilePos.x >= row.length) {
            return
        }
        loadTilesList()
        const index = fid & 0xffff
        const name = tilesList[index]
        if (!name || name.startsWith('#')) {
            return
        }
        row[tilePos.x] = name
    }

    export function setUseElevatorHandler(handler: (source: unknown, type: number) => number): void {
        useElevatorHandler = handler
    }

    export interface ScriptDebuggerSink {
        setVMInfo(stepCount: number, currentProcedure: string | null): void
        pushMessage(msg: string): void
    }

    let gameObjects: Obj[] | null = null
    let mapVars: any = null
    const globalVars: any = {
        0: 0, // GVAR_PLAYER_REPUTATION (karma) — start at neutral to match Reputation
        //10: 1, // GVAR_START_ARROYO_TRIAL (1 = TRIAL_FIGHT)
        47: 50, // GVAR_TOWN_REP_ARROYO — FO2 default Idolized
        531: 1, // GVAR_TALKED_TO_ELDER
        452: 2, // GVAR_DEN_VIC_KNOWN
        88: 0, // GVAR_VAULT_RAIDERS
        83: 2, // GVAR_VAULT_PLANT_STATUS (9 = PLANT_REPAIRED, 2 = PLANT_ACCEPTED_QUEST)
        616: 0, // GVAR_GECKO_FIND_WOODY (0 = WOODY_UNKNOWN)
        345: 16, // GVAR_NEW_RENO_FLAG_2 (16 = know_mordino_bit)
        357: 2, // GVAR_NEW_RENO_LIL_JESUS_REFERS (lil_jesus_refers_yes)
    }
    let currentMapID: number | null = null
    let currentMapObject: Script | null = null
    let mapFirstRun = true
    const scriptMessages: { [scriptName: string]: { [msgID: number]: string } } = {}
    let dialogueOptionProcs: (() => void)[] = [] // Maps dialogue options to handler callbacks
    let currentDialogueObject: Obj | null = null
    export const timeEventList: TimedEvent[] = []
    let overrideStartPos: StartPos | null = null
    let scriptDebuggerSink: ScriptDebuggerSink | null = null

    const PERK_COUNT = 119
    const GVAR_LOAD_MAP_INDEX = 27
    const TRAIT_COUNT = 16

    // opMetarule constants.
    const CITY_CAR_OUT_OF_GAS = 21
    const CRITTER_BARTER = 0x02
    const KILL_TYPE_MAN = 0
    const KILL_TYPE_WOMAN = 1
    const DAMAGE_TYPE_EXPLOSION = 6
    /** buildFid(OBJ_TYPE_MISC, 10, 0, 0, 0): the explosion's art. */
    const MISC_EXPLOSION_FID = 0x0500000a
    const DAMAGE_TYPE_NUMBERS: Record<string, number> = {
        Normal: 0, Laser: 1, Fire: 2, Plasma: 3, Electrical: 4, EMP: 5, Explosive: 6, Explosion: 6, explosion: 6,
    }

    const PID_MONEY = 41


    /** itemGetTotalCaps. */
    function totalCaps(obj: any): number {
        let caps = 0
        for (const item of obj?.inventory ?? []) {
            if (item.pid === PID_MONEY) {caps += item.amount ?? 1}
            else if (item.subtype === 'container') {caps += totalCaps(item)}
        }
        return caps
    }

    /** itemCapsAdjust; false when there are not enough caps to take. */
    function adjustCaps(obj: any, amount: number): boolean {
        if (amount < 0 && totalCaps(obj) < -amount) {return false}
        if (!Array.isArray(obj.inventory)) {obj.inventory = []}
        if (amount > 0) {
            const stack = obj.inventory.find((o: any) => o.pid === PID_MONEY)
            if (stack) {
                stack.amount += amount
            } else {
                const money = createObjectWithPID(PID_MONEY)
                if (!money) {return false}
                money.amount = amount
                obj.inventory.push(money)
            }
            return true
        }
        for (let i = 0; i < obj.inventory.length && amount < 0; i++) {
            const item = obj.inventory[i]
            if (item.pid !== PID_MONEY) {continue}
            if (-amount >= item.amount) {
                amount += item.amount
                obj.inventory.splice(i--, 1)
            } else {
                item.amount += amount
                amount = 0
            }
        }
        for (const item of obj.inventory) {
            if (amount >= 0) {break}
            if (item.subtype !== 'container') {continue}
            const inside = totalCaps(item)
            const take = Math.min(inside, -amount)
            if (take > 0 && adjustCaps(item, -take)) {amount += take}
        }
        return true
    }

    /** _correctDeath: a gory death is a plain fall under the violence filter or when there is no such art. */
    function correctDeath(critter: any, anim: number, forceBack: boolean): number {
        if (anim < 51 /* ANIM_BIG_HOLE_SF */ || anim > 63) {return anim}
        const maxBlood = violenceToIni(globalState.violenceLevel) >= 3
        if (maxBlood && critter?.type === 'critter' && critterArt(critter, anim)) {return anim}
        if (forceBack) {return ANIM_FALL_BACK}
        return critter?.type === 'critter' && critterArt(critter, ANIM_FALL_FRONT) ? ANIM_FALL_FRONT : ANIM_FALL_BACK
    }

    /** The map level holding an object (the current level for anything not on the map). */
    function elevationOf(obj: any): number {
        const levels: any[][] = (globalState.gMap as any)?.objects ?? []
        for (let level = 0; level < levels.length; level++) {
            if (levels[level]?.includes(obj)) {return level}
        }
        return globalState.currentElevation ?? 0
    }

    /** critterKill as opKillCritter calls it: straight to a single-frame death. */
    function scriptKillCritter(critter: any, anim: number): void {
        regAnimClear(critter)
        globalState.gParty?.removePartyMember?.(critter)
        let frame = anim
        if (isProne(critter) && (critter.animCode === ANIM_FALL_BACK || critter.animCode === ANIM_FALL_FRONT)) {
            frame = critter.animCode === ANIM_FALL_FRONT && critterArt(critter, ANIM_FALL_FRONT_SF) ? ANIM_FALL_FRONT_SF : ANIM_FALL_BACK_SF
        } else {
            if (frame < 0 || frame > 63) {frame = 63}
            // _obj_fix_violence_settings: no gore below maximum blood.
            if (frame > ANIM_FALL_FRONT_SF && violenceToIni(globalState.violenceLevel) < 3) {frame = ANIM_FALL_BACK_SF}
            if (!critterArt(critter, frame)) {frame = 62}
        }
        const art = critterArt(critter, frame)
        if (art) {
            critter.art = art
            critter.animCode = frame
        }
        critter.frame = 0
        critter.anim = null
        critter.animCallback = null
        critter.path = null
        critter.dead = true
        critter.outline = null
        if (critter.stats?.setBase) {critter.stats.setBase('HP', 0)}
        if (critter.drugState) {critter.drugState.drugEvents = []}
        critter._script = null
        if (critter === globalState.player) {syncPlayerEntityFromCritter()}
    }

    /** objectGetOwner: whoever carries the object (inside containers too), or null. */
    function findOwner(obj: any): any {
        const holds = (holder: any): any => {
            for (const item of holder?.inventory ?? []) {
                if (item === obj) {return holder}
                const inner = holds(item)
                if (inner) {return inner}
            }
            return null
        }
        const candidates: any[] = [globalState.player, ...(globalState.gMap?.getObjects?.() ?? [])]
        for (const c of candidates) {
            const found = c && c !== obj ? holds(c) : null
            if (found) {return found}
        }
        return null
    }

    /** RGB555 colour-table entries as CSS. */
    const rgb555 = (c: number) => `rgb(${Math.round(((c >> 10) & 31) * 255 / 31)},${Math.round(((c >> 5) & 31) * 255 / 31)},${Math.round((c & 31) * 255 / 31)})`
    /** opFloatMessage's colours by message type (-2 warning … 12 light grey). */
    const FLOAT_COLORS: Record<number, string> = {
        [-2]: rgb555(31744), 0: rgb555(32747), 1: rgb555(10570), 2: rgb555(31744), 3: rgb555(992),
        4: rgb555(31), 5: rgb555(10570), 6: rgb555(21140), 7: rgb555(32074), 8: rgb555(32747),
        9: rgb555(32767), 10: rgb555(10570), 11: rgb555(8456), 12: rgb555(15855),
    }
    /** _last_color: where FLOATING_MESSAGE_TYPE_COLOR_SEQUENCE is in the cycle. */
    let lastFloatColor = 0

    function lookupMapNameSafe(mapID: number): string | null {
        try {
            return lookupMapName(mapID)
        } catch {
            return null
        }
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

    /** gScriptProcNames: script_action reports the procedure by this number. */
    const SCRIPT_PROC_NAMES = [
        'no_p_proc', 'start', 'spatial_p_proc', 'description_p_proc', 'pickup_p_proc', 'drop_p_proc',
        'use_p_proc', 'use_obj_on_p_proc', 'use_skill_on_p_proc', 'use_ad_on_p_proc', 'use_disad_on_p_proc',
        'talk_p_proc', 'critter_p_proc', 'combat_p_proc', 'damage_p_proc', 'map_enter_p_proc',
        'map_exit_p_proc', 'create_p_proc', 'destroy_p_proc', 'barter_init_p_proc', 'barter_p_proc',
        'look_at_p_proc', 'timed_event_p_proc', 'map_update_p_proc', 'push_p_proc', 'is_dropping_p_proc',
        'combat_is_starting_p_proc', 'combat_is_over_p_proc',
    ]

    function trackScriptTrigger(script: Script, procName: string): void {
        // scriptExecProc: script->action = proc.
        const proc = SCRIPT_PROC_NAMES.indexOf(procName)
        ;(script as any)._action = proc < 0 ? 0 : proc
        pushScriptDebuggerMessage(`${script.scriptName}: ${procName}`)
    }

    function flushUnsupportedVMOperations(script: Script): void {
        const vm = script._vm
        if (!vm) {return}

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
    let _sfallHookReturnVal = 0

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

    const statMap: { [stat: number]: string } = {
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
        36: 'Poison Level',
        37: 'Radiation Level',
    }

    const skillNumToName: { [num: number]: string } = {
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

    function log(name: string, args: IArguments, type?: DebugLogShowType) {
        if (Config.scripting.debugLogShowType.log === false || Config.scripting.debugLogShowType[type] === false) {return}
        let a = ''
        for (let i = 0; i < args.length; i++)
            {if (i === args.length - 1) {a += args[i]}
            else {a += args[i] + ', '}}
        console.log('log: ' + name + ': ' + a)
    }

    function warn(msg: string, type?: DebugLogShowType, script?: Script) {
        if (type !== undefined && Config.scripting.debugLogShowType[type] === false) {return}
        if (script && (script as any)._vm) {console.log(`WARNING [${(script as any)._vm.intfile.name}]: ${msg}`)}
        else {console.log(`WARNING: ${msg}`)}
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
        if (type !== undefined && Config.scripting.debugLogShowType[type] === false) {return}
        if (script && (script as any)._vm) {console.log(`INFO [${(script as any)._vm.intfile.name}]: ${msg}`)}
        else {console.log(`INFO: ${msg}`)}
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

    // Perks whose requirement is a global variable (perk.cc perkCanAdd) read them here.
    setPerkGvarReader((gvar) => Number(getGlobalVar(gvar)) || 0)

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
            const gvar = parseInt(key, 10)
            let value = (vars as any)[key]
            // Mirror set_global_var: sanitize non-finite numbers on load to avoid poisoning state.
            if (typeof value === 'number' && !Number.isFinite(value)) {
                warn('setGlobalVars: non-finite value (' + value + ') for gvar ' + gvar + ' — clamping to 0', 'gvars')
                value = 0
            }
            globalVars[gvar] = value
            // Keep karma/reputation in sync when restoring saves that include GVAR_0.
            if (gvar === 0 && globalState.reputation) {
                globalState.reputation.setKarma(typeof value === 'number' ? value : 0)
            }
            syncReputationFromGvar(globalState.reputation, gvar, value)
            if (gvar === GVAR_PLAYER_GOT_CAR) {
                setHasCar(typeof value === 'number' ? value !== 0 : !!value)
            }
        }
        // Ensure Reputation town/flag mirrors match the full GVAR table after bulk load.
        if (globalState.reputation) {
            pullReputationFromGvars(globalState.reputation, globalVars)
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
        if (!mapVars) {mapVars = {}}
        for (const scriptName of Object.keys(vars)) {
            if (!mapVars[scriptName]) {mapVars[scriptName] = {}}
            for (const key of Object.keys(vars[scriptName])) {
                mapVars[scriptName][parseInt(key, 10)] = vars[scriptName][key as any]
            }
        }
    }

    function isGameObject(obj: any) {
        // NOTE: We can't simply use `instanceof Obj` because script opcodes
        // frequently receive plain objects (deserialized records, raw ints,
        // 0 sentinels, etc.) — duck typing on `isPlayer` and a known type
        // string is the safest predicate here.
        if (obj === undefined || obj === null) {return false}
        if (obj.isPlayer === true) {return true}
        if (
            obj.type === 'item' ||
            obj.type === 'critter' ||
            obj.type === 'scenery' ||
            obj.type === 'wall' ||
            obj.type === 'tile' ||
            obj.type === 'misc'
        )
            {return true}

        //warn("is NOT GO: " + obj.toString())
        return false
    }

    function isSpatial(obj: any): boolean {
        if (!obj) {return false}
        return obj.isSpatial === true
    }

    function getScriptName(id: number): string | null {
        // return getLstId("scripts/scripts", id - 1).split(".")[0].toLowerCase()
        return lookupScriptName(id)
    }

    function getScriptMessage(id: number, msg: string | number) {
        if (typeof msg === 'string')
            // passed in a string message
            {return msg}

        const name = getScriptName(id)
        if (name === null) {
            warn('getScriptMessage: no script with ID ' + id)
            return null
        }

        if (scriptMessages[name] === undefined) {loadMessageFile(name)}
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
        if (id < 0 || id >= dialogueOptionProcs.length) {
            warn('dialogueReply: invalid id ' + id + ' (have ' + dialogueOptionProcs.length + ' options)')
            return
        }
        const f = dialogueOptionProcs[id]
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
            const vm = currentDialogueObject._script?._vm
            if (vm) {
                vm.pc = vm.popAddr()
                info(`[resuming from gsay_end (pc=0x${vm.pc.toString(16)})]`)
                vm.run()
            } else {
                warn('dialogueExit: no VM for dialogue object')
            }
        }

        currentDialogueObject = null
        globalState.dialogueObject = null
    }

    // combat_ai.cc isWithinPerception: seen within PER×5 in the forward arc,
    // heard within PER (PER×2 in combat); a sneaking player is harder to notice.
    function isWithinPerception(obj: Critter, target: Critter): boolean {
        if (!obj?.position || !target?.position) {return false}
        // BLK-210: a critter spawned without stats cannot perceive anything.
        if (typeof (obj as any).getStat !== 'function') {return false}
        return perceives(obj, target, (min, max) => getRandomInt(min, max))
    }

    function objCanSeeObj(obj: Critter, target: Obj): boolean {
        // opObjectCanSeeObject: within perception, and nothing in the way.
        if (isWithinPerception(obj, target as Critter)) {
            // BLK-076: Guard against null gMap (during map transitions or before a map
            // is loaded) and null/missing positions on either critter.  When the map or
            // positions are unavailable we conservatively treat the line-of-sight check
            // as unobstructed (return true) so scripts that call can_see_obj / is_within_perception
            // don't crash and still get a usable result.
            if (!globalState.gMap || !obj.position || !target.position) {return true}
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
        _didOverride = false // Did the procedure call override the default action?
        _howMuch = 0 // Margin of the last roll_vs_skill / do_check (how_much)
        _returnValue = 0 // scr_return value
        _barterMod = 0 // One-time barter modifier set by gdialog_set_barter_mod

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
            syncReputationFromGvar(globalState.reputation, gvar, value)
            // GVAR_PLAYER_GOT_CAR (18) — Highwayman ownership flag.
            if (gvar === GVAR_PLAYER_GOT_CAR) {
                setHasCar(typeof value === 'number' ? value !== 0 : !!value)
            }
            info('set_global_var: ' + gvar + ' = ' + value, 'gvars')
            log('set_global_var', arguments, 'gvars')
        }
        set_local_var(lvar: number, value: any) {
            // BLK-147: Guard against non-finite numeric values — parallel to BLK-129
            // for global vars.  New Reno scripts that use local variables for combat
            // math (damage calculations, timer offsets) can produce NaN or Infinity
            // from arithmetic errors.  Storing these corrupts subsequent local_var()
            // reads and can cascade into stat mutations.  Clamp to 0 and warn.
            if (typeof value === 'number' && !isFinite(value)) {
                warn('set_local_var: non-finite value (' + value + ') for lvar ' + lvar + ' — clamping to 0', 'lvars')
                value = 0
            }
            if (!this.lvars) {this.lvars = {}}
            this.lvars[lvar] = value
            info('set_local_var: ' + lvar + ' = ' + value + ' [' + this.scriptName + ']', 'lvars')
            log('set_local_var', arguments, 'lvars')
        }
        local_var(lvar: number) {
            log('local_var', arguments, 'lvars')
            if (!this.lvars) {this.lvars = {}}
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
            const scriptName = this._mapScript.scriptName
            if (scriptName === undefined) {
                warn('map_var: map script has no name — returning 0 (mvar=' + mvar + ')', undefined, this)
                return 0
            } else if (mapVars[scriptName] === undefined) {mapVars[scriptName] = {}}
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
            const scriptName = this._mapScript.scriptName
            if (scriptName === undefined) {
                warn('map_var: map script has no name')
                return
            }
            // BLK-202: Guard against non-finite numeric values — Arroyo and Temple
            // quest-tracking scripts compute map-variable values from arithmetic that can
            // yield NaN (e.g. when a quest-stage count is divided by an uninitialised
            // multiplier).  Storing NaN in mapVars corrupts downstream map_var() reads and
            // can break quest-gating conditions.  Mirror BLK-147 (set_local_var) and
            // BLK-129 (set_global_var): clamp to 0 and warn so the issue is traceable.
            if (typeof value === 'number' && !isFinite(value)) {
                warn('set_map_var: non-finite value (' + value + ') for mvar ' + mvar + ' — clamping to 0', 'mvars')
                value = 0
            }
            info('set_map_var: ' + mvar + ' = ' + value, 'mvars')
            if (mapVars[scriptName] === undefined) {mapVars[scriptName] = {}}
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
            // BLK-209: Guard against non-finite bounds — Arroyo encounter scripts
            // compute random ranges from character stats and map-var-driven formulas
            // that can yield NaN when uninitialised stat fields are used (e.g.
            // random(0, critter_stat(obj, STAT_ST) - 2) where STAT_ST returns NaN
            // for a partially-initialised critter).  getRandomInt(NaN, NaN) returns
            // NaN which propagates into downstream stat checks and corrupts combat
            // results.  Clamp both bounds to 0 so the call returns 0 safely.
            if (typeof min !== 'number' || !isFinite(min)) {
                warn('random: non-finite min (' + min + ') — clamping to 0', undefined, this)
                min = 0
            }
            if (typeof max !== 'number' || !isFinite(max)) {
                warn('random: non-finite max (' + max + ') — clamping to 0', undefined, this)
                max = 0
            }
            return getRandomInt(min, max)
        }
        pow(base: number, exp: number): number {
            return Math.pow(base, exp)
        }
        debug_msg(msg: string) {
            log('debug_msg', arguments)
            info('DEBUG MSG: [' + this.scriptName + ']: ' + msg, 'debugMessage')
            pushScriptDebuggerMessage(`[debug] ${this.scriptName}: ${msg}`)
            if (this._vm) {updateScriptDebuggerVMInfo(this._vm)}
        }
        display_msg(msg: string) {
            log('display_msg', arguments)
            // BLK-179: Guard against null/non-string message — Temple end-of-combat and
            // Arroyo Elder scripts call display_msg(message_str(msgList, id)); when the
            // message key is missing from the loaded .msg file, message_str() returns null.
            // uiLog(null) causes the HTML log renderer to display "null" as a message and
            // can crash rich-text formatters that call .length on the value.  Drop silently.
            if (msg == null || typeof msg !== 'string') {
                warn('display_msg: msg is null/non-string — skipping', undefined, this)
                return
            }
            info('DISPLAY MSG: ' + msg, 'displayMessage')
            pushScriptDebuggerMessage(`[display] ${this.scriptName}: ${msg}`)
            if (this._vm) {updateScriptDebuggerVMInfo(this._vm)}
            uiLog(msg)
        }
        /** opGetMessageString: "Error" for a negative index or a missing message. */
        message_str(msgList: number, msgNum: number) {
            if (typeof msgNum === 'number' && msgNum < 0) {return 'Error'}
            return getScriptMessage(msgList, msgNum) ?? 'Error'
        }
        /** opMetarule: the engine's rules 13–53; any other id gives 0. */
        metarule(id: number, target: any): any {
            const obj = isGameObject(target) ? (target as any) : null
            switch (id) {
                case 13: // METARULE_SIGNAL_END_GAME
                    signalEndGame(0, globalVars, { play: true })
                    return 0
                case 14: // METARULE_FIRST_RUN
                    return mapFirstRun ? 1 : 0
                case 15: // METARULE_ELEVATOR
                    useElevatorHandler(this.self_obj, typeof target === 'number' ? target : -1)
                    return 0
                case 16: // METARULE_PARTY_COUNT: the player and the living, visible party critters
                    return 1 + (globalState.gParty?.getPartyMembers() ?? []).filter(
                        (m: any) => m?.type === 'critter' && !m.dead && !m.hidden
                    ).length
                case 17: // METARULE_AREA_KNOWN
                    return globalState.mapAreas?.[target]?.state === true ? 1 : 0
                case 18: // METARULE_WHO_ON_DRUGS
                    return hasDrugEvent(obj) ? 1 : 0
                case 19: { // METARULE_MAP_KNOWN: the map's entrance in its area is on
                    const mapName = typeof target === 'number' ? lookupMapNameSafe(target) : null
                    const area = mapName ? areaContainingMap(mapName) : null
                    if (!area || area.state !== true) {return 0}
                    const entrance = area.entrances.find((e: any) => e.mapName === mapName)
                    return entrance && String(entrance.startState).toLowerCase() === 'on' ? 1 : 0
                }
                case 22: // METARULE_IS_LOADGAME
                    return globalState.loadingGame ? 1 : 0
                case 30: { // METARULE_CAR_CURRENT_TOWN
                    const park = getCarPark()
                    const area = park ? areaContainingMap(park.mapName) : null
                    return area ? area.id : (sfallSettings.carTown ?? -1)
                }
                case 31: // METARULE_GIVE_CAR_TO_PARTY
                    if (getCarFuel() <= 0) {
                        let text: string | null = null
                        try {
                            text = getMessage('worldmap', 1502)
                        } catch {
                            text = null
                        }
                        EventBus.emit('ui:message', { text: text ?? 'The car is out of power.' })
                        return -1
                    }
                    setHasCar(true)
                    if (globalState.mapAreas?.[CITY_CAR_OUT_OF_GAS]) {globalState.mapAreas[CITY_CAR_OUT_OF_GAS].state = false}
                    globalState.mapAreaStates[CITY_CAR_OUT_OF_GAS] = false
                    this.world_map()
                    return 0
                case 32: // METARULE_GIVE_CAR_GAS
                    return fillCarGas(Number(target) || 0)
                case 40: { // METARULE_SKILL_CHECK_TAG
                    const name = SKILL_NAMES[target]
                    return name && (globalState.player as any)?.skills?.isTagged?.(name) ? 1 : 0
                }
                case 42: // METARULE_DROP_ALL_INVEN
                    if (!obj) {return 0}
                    itemDropAll(obj, obj.elevation ?? globalState.currentElevation ?? 0, {
                        addObject: (item: any) => globalState.gMap?.addObject(item),
                    })
                    if (obj === globalState.player) {syncPlayerEntityFromCritter()}
                    return 0
                case 43: // METARULE_INVEN_UNWIELD_WHO
                    if (obj) {this.inven_unwield(obj)}
                    return 0
                case 44: // METARULE_GET_WORLDMAP_XPOS
                    return globalState.worldPosition?.x ?? 0
                case 45: // METARULE_GET_WORLDMAP_YPOS
                    return globalState.worldPosition?.y ?? 0
                case 46: { // METARULE_CURRENT_TOWN: the area the party is in
                    const mapName = (globalState.gMap as any)?.name
                    const area = mapName ? areaContainingMap(mapName) : null
                    return area ? area.id : 0
                }
                case 47: // METARULE_LANGUAGE_FILTER
                    return getSettings().languageFilter ? 1 : 0
                case 48: // METARULE_VIOLENCE_FILTER
                    return violenceToIni(globalState.violenceLevel)
                case 49: { // METARULE_WEAPON_DAMAGE_TYPE
                    if (!obj) {return 0}
                    if (obj.type === 'item' && obj.subtype === 'weapon') {
                        const raw = obj.pro?.extra?.dmgType ?? obj.dmgType
                        if (typeof raw === 'number') {return raw}
                        return DAMAGE_TYPE_NUMBERS[objectGetDamageType(obj)] ?? 0
                    }
                    if (obj.type === 'misc' && (obj.pro?.fid ?? obj.fid) === MISC_EXPLOSION_FID) {return DAMAGE_TYPE_EXPLOSION}
                    warn('metarule:w_damage_type: Not a weapon!', undefined, this)
                    return 0
                }
                case 50: // METARULE_CRITTER_BARTERS
                    return obj?.type === 'critter' && ((obj.pro?.extra?.flags ?? 0) & CRITTER_BARTER) !== 0 ? 1 : 0
                case 51: // METARULE_CRITTER_KILL_TYPE
                    if (!obj) {return -1}
                    if (obj === globalState.player) {return obj.getStat?.('Gender') === 1 ? KILL_TYPE_WOMAN : KILL_TYPE_MAN}
                    if (obj.type !== 'critter') {return -1}
                    return obj.killType ?? obj.pro?.extra?.killType ?? 0
                case 52: // METARULE_SET_CAR_CARRY_AMOUNT
                    setCarTrunkMaxSize(Number(target) || 0)
                    return 1
                case 53: // METARULE_GET_CAR_CARRY_AMOUNT
                    return getCarTrunkMaxSize()
                default:
                    return 0
            }
        }
        /** opMetarule3: the engine's rules 100–111; any other id gives 0. */
        metarule3(id: number, p1: any, p2: any, p3: any): any {
            switch (id) {
                case 100: // METARULE3_CLR_FIXED_TIMED_EVENTS(obj, fixed param)
                    for (let i = timeEventList.length - 1; i >= 0; i--) {
                        if (timeEventList[i].obj === p1 && timeEventList[i].userdata === p2) {timeEventList.splice(i, 1)}
                    }
                    return 0
                case 101: // METARULE3_MARK_SUBTILE: the world map has no sub-tile fog here
                    return 0
                case 103: // METARULE3_GET_KILL_COUNT
                    return this.get_critter_kills(p1)
                case 104: { // METARULE3_MARK_MAP_ENTRANCE(map, elevation, state)
                    const mapName = typeof p1 === 'number' ? lookupMapNameSafe(p1) : null
                    const area = mapName ? areaContainingMap(mapName) : null
                    if (!area) {return -1}
                    const entrance = area.entrances.find(
                        (e: any) => e.mapName === mapName && (p2 === -1 || e.elevation === -1 || e.elevation === p2)
                    )
                    if (!entrance) {return -1}
                    entrance.startState = p3 === 1 ? 'On' : 'Off'
                    return 0
                }
                case 105: // METARULE3_WM_SUBTILE_STATE: no sub-tile fog here
                    return 0
                case 106: { // METARULE3_TILE_GET_NEXT_CRITTER(tile, elevation, previous critter)
                    if (!isValidTileNum(p1)) {return 0}
                    const pos = fromTileNum(p1)
                    const previous = isGameObject(p3) ? p3 : null
                    let found = previous === null
                    for (const o of globalState.gMap?.getObjects(p2) ?? []) {
                        const here = o.position && o.position.x === pos.x && o.position.y === pos.y
                        if (!here) {continue}
                        if (o.type === 'critter' && found) {return o}
                        if (o === previous) {found = true}
                    }
                    return 0
                }
                case 107: { // METARULE3_ART_SET_BASE_FID_NUM(obj, frm id)
                    if (!isGameObject(p1)) {return 0}
                    const target = p1 as any
                    const fid = ((target.frmPID ?? target.pro?.frmPID ?? 0) & ~0xfff) | (p2 & 0xfff)
                    target.frmPID = fid
                    try {
                        target.art = lookupArt(makePID(target.pro?.frmType ?? target.frmType ?? 0, fid))
                    } catch (e) {
                        warn('metarule3(107): no art for fid 0x' + fid.toString(16), undefined, this)
                    }
                    return 0
                }
                case 108: // METARULE3_TILE_SET_CENTER
                    if (isValidTileNum(p1)) {centerCamera(fromTileNum(p1))}
                    return 0
                case 109: // aiGetChemUse
                    return p1?.type === 'critter' ? aiPacketFor(p1).chemUse : 0
                case 110: // wmCarIsOutOfGas
                    return getCarFuel() <= 0 ? 1 : 0
                case 111: { // _map_target_load_area: the area holding the current map
                    const mapName = (globalState.gMap as any)?.name
                    const area = mapName ? areaContainingMap(mapName) : null
                    return area ? area.id : -1
                }
                default:
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
            if (!player) {return}
            // BLK-106: Guard against non-finite XP — NaN or Infinity would corrupt
            // player.xp, causing the level-up while-loop comparison to always be
            // false (NaN >= anything is false) so the player could never level up.
            if (typeof xp !== 'number' || !isFinite(xp)) {
                warn('give_exp_points: non-finite XP (' + xp + ') — no-op', undefined, this)
                return
            }
            // opGiveExpPoints prints nothing itself; a level-up announces itself.
            awardCritterXp(player, xp)
        }

        // critters
        get_critter_stat(obj: Critter, stat: number) {
            // BLK-098: Guard against null/non-critter objects — get_critter_stat is
            // frequently called from scripts that may hold a stale or null reference
            // (e.g. dead or destroyed critters).  Without this guard obj.getStat()
            // throws a TypeError when obj is 0 (the Fallout 2 null-ref convention).
            if (!isGameObject(obj)) {return -1}
            if (stat === 34) {
                // STAT_gender
                if ((obj as Player).isPlayer) {return (obj as Player).gender === 'female' ? 1 : 0}
                return 0 // Default to male
            }
            const namedStat = statMap[stat]
            if (namedStat !== undefined) {return obj.getStat(namedStat)}
            // Unknown stat number — return 0 gracefully rather than emitting a stub
            // hit that floods the console when scripts probe optional stat IDs.
            warn('get_critter_stat: unknown stat ' + stat + ' — returning 0', undefined, this)
            return 0
        }
        /**
         * opSetCritterStat: only the player, and the value is added to the base
         * stat (critterSetBaseStat). Derived stats do not change; a result out of
         * the stat's range is refused; current HP, poison and radiation adjust.
         */
        set_critter_stat(obj: Obj, stat: number, amount: number) {
            if (!isGameObject(obj) || obj !== globalState.player) {return -1}
            const critter = obj as any
            const value = Number.isFinite(amount) ? Math.trunc(amount) : 0
            if (stat >= 0 && stat <= 6) {
                const next = critter.stats.getBase(statMap[stat]) + value
                if (next >= 1 && next <= 10) {critter.stats.setBase(statMap[stat], next)}
            } else if (stat === 33) {
                const next = critter.stats.getBase('Age') + value
                if (next >= 16 && next <= 101) {critter.stats.setBase('Age', next)}
            } else if (stat === 34) {
                const next = (critter.gender === 'female' ? 1 : 0) + value
                if (next === 0 || next === 1) {critter.gender = next === 1 ? 'female' : 'male'}
            } else if (stat === 35) {
                this.critter_heal(obj, value)
            } else if (stat === 36) {
                adjustPoison(critter, value)
            } else if (stat === 37) {
                adjustRadiation(critter, value)
            }
            if (stat >= 0 && stat <= 6) {syncPlayerEntityFromCritter()}
            return 0
        }
        /** opHasTrait: perk rank, a few object fields, or whether the player picked a trait. */
        has_trait(traitType: number, obj: Obj, trait: number) {
            if (!isGameObject(obj)) {
                warn('has_trait: obj is NULL', undefined, this)
                return 0
            }
            const o = obj as any
            switch (traitType) {
                case 0: // CRITTER_TRAIT_PERK
                    if (trait >= PERK_COUNT) {return 0}
                    return perkRank(o, trait)
                case 1: // CRITTER_TRAIT_OBJECT
                    switch (trait) {
                        case 5: // AI packet
                            return o.type === 'critter' ? (o.aiNum ?? 0) : 0
                        case 6: // team
                            return o.type === 'critter' ? (o.teamNum ?? 0) : 0
                        case 10: // rotation
                            return o.orientation ?? 0
                        case 666: // not hidden
                            return o.visible === false ? 0 : 1
                        case 669: // inventory weight
                            return getCritterInventoryWeightLbs(o)
                        default:
                            return 0
                    }
                case 2: // CRITTER_TRAIT_TRAIT: the player's chosen traits, whoever is asked about
                    if (trait >= TRAIT_COUNT) {return 0}
                    return (globalState.player as any)?.charTraits?.has?.(trait) ? 1 : 0
                default:
                    return 0
            }
        }
        /** opCritterAddTrait: add or take one perk rank, or set a critter's AI packet or team. Always -1. */
        critter_add_trait(obj: Obj, traitType: number, trait: number, amount: number) {
            if (!isGameObject(obj)) {
                warn('critter_add_trait: obj is NULL', undefined, this)
                return -1
            }
            if (obj.type !== 'critter') {return -1}
            const critter = obj as any
            if (traitType === 0) {
                // perkAddForce / perkRemove
                if (trait < 0 || trait >= PERK_COUNT) {return -1}
                if (!critter.perkRanks) {critter.perkRanks = {}}
                const rank = perkRank(critter, trait)
                if (amount > 0) {
                    const maxRank = PERK_MAP.get(trait)?.ranks
                    if (maxRank === undefined || maxRank === -1 || rank < maxRank) {critter.perkRanks[trait] = rank + 1}
                } else if (rank >= 1) {
                    critter.perkRanks[trait] = rank - 1
                }
                if (critter === globalState.player) {syncPlayerEntityFromCritter()}
            } else if (traitType === 1) {
                if (trait === 5) {
                    critter.aiNum = amount // critterSetAiPacket
                } else if (trait === 6) {
                    const inParty = globalState.gParty?.isPartyMember?.(critter) ?? false
                    if (!inParty && critter.teamNum !== amount && !globalState.loadingGame) {critter.teamNum = amount}
                }
            }
            return -1
        }
        /** itemGetTotalCaps: money carried, counting what is inside containers. */
        item_caps_total(obj: Obj) {
            if (!isGameObject(obj)) {return 0}
            return totalCaps(obj)
        }
        /**
         * itemCapsAdjust: add caps to the first money stack (or a new one), or
         * take them from money and then containers. Taking more than there is
         * changes nothing and gives -1.
         */
        item_caps_adjust(obj: Obj, amount: number) {
            if (!isGameObject(obj) || !Number.isFinite(amount)) {return -1}
            return adjustCaps(obj, Math.trunc(amount)) ? 0 : -1
        }
        /** opMoveObjectInventoryToObject (itemMoveAll): everything moves over, joining matching stacks. */
        move_obj_inven_to_obj(obj: Obj, other: Obj) {
            if (!isGameObject(obj) || !isGameObject(other)) {return}
            if (!Array.isArray(other.inventory)) {other.inventory = []}
            const items = [...(Array.isArray(obj.inventory) ? obj.inventory : [])]
            obj.inventory = []
            const c = obj as any
            c.leftHand = undefined
            c.rightHand = undefined
            if ('equippedArmor' in c) {c.equippedArmor = null}
            for (const item of items) {
                const stack = other.inventory.find((o: Obj) => o.approxEq(item))
                if (stack) {stack.amount += typeof item.amount === 'number' ? item.amount : 1}
                else {other.inventory.push(item)}
            }
            if (obj === globalState.player || other === globalState.player) {syncPlayerEntityFromCritter()}
        }
        /** objectGetCarriedQuantityByPid: how many, counting stacks and what containers hold. */
        obj_is_carrying_obj_pid(obj: Obj, pid: number) {
            if (!isGameObject(obj)) {return 0}
            const count = (o: any): number => {
                let n = 0
                for (const item of (o?.inventory ?? [])) {
                    if (item.pid === pid) {n += typeof item.amount === 'number' ? item.amount : 1}
                    n += count(item)
                }
                return n
            }
            return count(obj)
        }
        /**
         * opAddMultipleObjectsToInventory: the object itself leaves the map and joins
         * the inventory (merging into a stack of the same pid). A negative count
         * means 1; at most 99999.
         */
        add_mult_objs_to_inven(obj: Obj, item: Obj, count: number) {
            if (!isGameObject(obj) || !isGameObject(item) || !Array.isArray(obj.inventory)) {return}
            let quantity = Number.isFinite(count) ? Math.trunc(count) : 0
            if (quantity < 0) {quantity = 1}
            if (quantity > 99999) {quantity = 99999}
            if (quantity < 1) {return}
            if (obj.type === 'critter' && !canCritterCarryMore(obj as Critter, item, quantity)) {return}
            globalState.gMap?.removeObject?.(item)
            const stack = obj.inventory.find((o: Obj) => o !== item && o.approxEq(item))
            if (stack) {
                stack.amount += quantity
            } else if (!obj.inventory.includes(item)) {
                item.amount = quantity
                obj.inventory.push(item)
            }
            if (obj === globalState.player) {syncPlayerEntityFromCritter()}
        }
        /**
         * opRemoveMultipleObjectsFromInventory: take up to `count` of that item's
         * stack; an emptied stack leaves its hand or armor slot. Returns how many.
         */
        rm_mult_objs_from_inven(obj: Obj, item: Obj, count: number) {
            if (!isGameObject(obj) || !isGameObject(item)) {return 0}
            if (!Array.isArray(obj.inventory)) {obj.inventory = []}
            const carried: Obj[] = obj.inventory
            const stack = carried.includes(item) ? item : carried.find((o: Obj) => o.approxEq(item))
            if (!stack) {return 0}
            const have = typeof stack.amount === 'number' ? stack.amount : 1
            const quantity = Math.max(0, Math.min(have, Number.isFinite(count) ? Math.trunc(count) : 0))
            if (quantity === 0) {return 0}
            stack.amount = have - quantity
            if (stack.amount <= 0) {
                const index = obj.inventory.indexOf(stack)
                if (index >= 0) {obj.inventory.splice(index, 1)}
                const c = obj as any
                if (c.leftHand === stack) {c.leftHand = undefined}
                if (c.rightHand === stack) {c.rightHand = undefined}
                if (c.equippedArmor === stack) {c.equippedArmor = null}
            }
            if (obj === globalState.player) {syncPlayerEntityFromCritter()}
            return quantity
        }
        add_obj_to_inven(obj: Obj, item: Obj) {
            this.add_mult_objs_to_inven(obj, item, 1)
        }
        rm_obj_from_inven(obj: Obj, item: Obj) {
            this.rm_mult_objs_from_inven(obj, item, 1)
        }
        /** objectGetCarriedObjectByPid: the first such item, looking inside containers too. */
        obj_carrying_pid_obj(obj: Obj, pid: number) {
            if (!isGameObject(obj)) {return 0}
            const find = (o: any): any => {
                for (const item of (o?.inventory ?? [])) {
                    if (item.pid === pid) {return item}
                    const inner = find(item)
                    if (inner) {return inner}
                }
                return null
            }
            return find(obj) ?? 0
        }
        /** opGetObjectElevation: the level the object is on (0 for no object). */
        elevation(obj: Obj) {
            if (!isSpatial(obj) && !isGameObject(obj)) {return 0}
            return elevationOf(obj)
        }
        obj_can_see_obj(a: Critter, b: Critter) {
            log('obj_can_see_obj', arguments)
            if (!isGameObject(a) || !isGameObject(b) || !a.position || !b.position) {return 0}
            // opObjectCanSeeObject: both on the map at the same elevation.
            if (elevationOf(a) !== elevationOf(b)) {return 0}
            return +objCanSeeObj(a, b)
        }
        /** opObjectCanHearObject (with sfall's fix): same elevation and within perception. */
        obj_can_hear_obj(a: Obj, b: Obj) {
            if (!isGameObject(a) || !isGameObject(b) || !a.position || !b.position) {return 0}
            if (elevationOf(a) !== elevationOf(b)) {return 0}
            return isWithinPerception(a as Critter, b as Critter) ? 1 : 0
        }
        /**
         * opCritterModifySkill: only the player. Adds or takes skill points one at
         * a time (a tagged skill counts half as many); never past 300 or below the
         * skill's starting value. Returns 0.
         */
        critter_mod_skill(obj: Obj, skill: number, amount: number) {
            if (!isGameObject(obj) || obj !== globalState.player || !Number.isFinite(amount) || amount === 0) {return 0}
            const critter = obj as Critter
            const skillName = skillNumToName[skill]
            if (!skillName || !critter.skills) {return 0}
            let points = Math.abs(Math.trunc(amount))
            if (critter.skills.isTagged(skillName)) {points = Math.trunc(points / 2)}
            const start = skillDependencies[skillName]?.startValue ?? 0
            for (let i = 0; i < points; i++) {
                const base = critter.skills.getBase(skillName)
                if (amount > 0) {
                    if (critter.getSkill(skillName) >= 300) {break}
                    critter.skills.setBase(skillName, base + 1)
                } else {
                    if (base <= start) {break}
                    critter.skills.setBase(skillName, base - 1)
                }
            }
            syncPlayerEntityFromCritter()
            return 0
        }
        /** opUsingSkill: only the player's Sneak state is known (1 while sneak mode is on); 0 otherwise. */
        using_skill(obj: Obj, skill: number) {
            const SNEAK = 8
            return skill === SNEAK && obj === globalState.player && playerInSneakMode(obj) ? 1 : 0
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
            // BLK-191: Guard against critters that lack the getSkill() method — proto-only
            // Arroyo NPC objects (spawned via create_object_sid with no SkillSet attached)
            // have type === 'critter' but no getSkill function.  Calling a missing method
            // throws TypeError; return 0 (no skill) instead.
            if (typeof (obj as any).getSkill !== 'function') {
                warn('has_skill: critter has no getSkill() method — returning 0', undefined, this)
                return 0
            }
            return (obj as Critter).getSkill(skillName)
        }
        /**
         * opRollVsSkill / skillRoll: randomRoll(skill + modifier, Critical
         * Chance) — the same roll the attack uses, criticals included. Steal
         * gets +30 while sneaking works. The margin is kept for how_much.
         */
        roll_vs_skill(obj: Obj, skill: number, bonus: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {return RollResult.CRITICAL_FAILURE}
            const safeBonus = (typeof bonus === 'number' && isFinite(bonus)) ? bonus : 0
            const result = engineSkillRoll(obj, skill, safeBonus, (min, max) => getRandomInt(min, max))
            this._howMuch = result.delta
            return result.roll
        }
        /** opDoCheck / statRoll: d10 against stat + modifier; success or failure only. */
        do_check(obj: Obj, check: number, modifier: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('do_check: not a critter: ' + obj, undefined, this)
                return 0
            }
            const statName = statMap[check]
            if (!statName || check < 0 || check > 6) {
                warn('do_check: stat out of range: ' + check, undefined, this)
                return 0
            }
            const value = (obj as Critter).getStat(statName) + ((typeof modifier === 'number' && isFinite(modifier)) ? modifier : 0)
            const chance = getRandomInt(1, 10)
            this._howMuch = value - chance
            return chance <= value ? RollResult.SUCCESS : RollResult.FAILURE
        }
        /** opSuccess: 1 for a success, 0 for a failure, -1 for anything else. */
        is_success(roll: number) {
            if (roll === RollResult.SUCCESS || roll === RollResult.CRITICAL_SUCCESS) {return 1}
            if (roll === RollResult.FAILURE || roll === RollResult.CRITICAL_FAILURE) {return 0}
            return -1
        }
        /** opCritical: 1 for a critical, 0 for a plain roll, -1 for anything else. */
        is_critical(roll: number) {
            if (roll === RollResult.CRITICAL_SUCCESS || roll === RollResult.CRITICAL_FAILURE) {return 1}
            if (roll === RollResult.FAILURE || roll === RollResult.SUCCESS) {return 0}
            return -1
        }
        /**
         * opCritterGetInventoryObject: armor (0), right hand (1), left hand (2) or the
         * number of stacks (-2). The player's hands answer only for the hand in use.
         */
        critter_inven_obj(obj: Critter, where: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {return 0}
            const c = obj as any
            const isDude = c === globalState.player || c.isPlayer === true
            const leftInUse = (c.activeHand ?? 0) === 0
            switch (where) {
                case 0: return isRealItem(c.equippedArmor) ? c.equippedArmor : 0
                case 1: return isDude && leftInUse ? 0 : (isRealItem(c.rightHand) ? c.rightHand : 0)
                case 2: return isDude && !leftInUse ? 0 : (isRealItem(c.leftHand) ? c.leftHand : 0)
                case -2: return Array.isArray(c.inventory) ? c.inventory.length : 0
                default: return 0
            }
        }
        /** _op_inven_cmds: only INVEN_CMD_INDEX_PTR (13), the stack at an index of any object's inventory. */
        inven_cmds(obj: Critter, invenCmd: number, itemIndex: number): Obj | null {
            if (!isGameObject(obj) || invenCmd !== 13) {return null}
            const inv = (obj as any).inventory
            if (!Array.isArray(inv) || itemIndex < 0 || itemIndex >= inv.length) {return null}
            return inv[itemIndex]
        }
        /**
         * opCritterAttemptPlacement (_obj_attempt_placement with radius 1): the
         * tile, or when something blocks it the nearest free tile two or more
         * hexes away that the player can reach, else a free adjacent one.
         */
        critter_attempt_placement(obj: Obj, tileNum: number, elevation: number) {
            if (!isGameObject(obj) || !Number.isFinite(tileNum) || tileNum === -1 || !isValidTileNum(tileNum)) {return -1}
            const map = globalState.gMap
            if (!map) {return -1}
            const level = Number.isInteger(elevation) ? elevation : globalState.currentElevation
            const blocked = (t: Point) => (map.getObjects(level) ?? []).some((o: any) => o !== obj && o.position && o.position.x === t.x && o.position.y === t.y && o.blocks?.())
            const origin = fromTileNum(tileNum)
            let place: Point | null = origin
            if (blocked(origin)) {
                place = null
                const player = globalState.player
                for (let dist = 2; dist < 7 && !place; dist++) {
                    for (let rotation = 0; rotation < 6; rotation++) {
                        const t = hexInDirectionDistance(origin, rotation, dist)
                        if (!t || t.x < 0 || t.x >= 200 || t.y < 0 || t.y >= 200 || blocked(t)) {continue}
                        if (player?.position && map.recalcPath(player.position, t).length === 0) {continue}
                        place = t
                        break
                    }
                }
                if (!place) {
                    for (let rotation = 0; rotation < 6 && !place; rotation++) {
                        const t = hexInDirectionDistance(origin, rotation, 1)
                        if (t && !blocked(t)) {place = t}
                    }
                }
                place = place ?? origin
            }
            this.move_to(obj, toTileNum(place), level)
            return 0
        }
        /**
         * opGetCritterState: CRITTER_STATE_DEAD (1) for a dead or non-critter
         * object; 2 (prone) while knocked out or down; otherwise 0, plus the
         * crippled-limb and blinded bits while the critter can act.
         */
        critter_state(obj: Critter) {
            if (!isGameObject(obj) || obj.type !== 'critter' || obj.dead === true) {return 1}
            const c = obj as any
            if (c.knockedOut === true) {return 2}
            // Prone while knocked down or showing the lying-down frame of a fall.
            const lying = c.animCode === ANIM_FALL_BACK_SF || c.animCode === ANIM_FALL_FRONT_SF
            let state = c.knockedDown === true || lying ? 2 : 0
            if (c.crippledLeftLeg) {state |= 0x04}
            if (c.crippledRightLeg) {state |= 0x08}
            if (c.crippledLeftArm) {state |= 0x10}
            if (c.crippledRightArm) {state |= 0x20}
            if (c.blinded) {state |= 0x40}
            return state
        }
        /**
         * opKillCritter (critterKill): the critter drops dead on the spot showing
         * the given death frame; no death animation, no experience, and its
         * script is gone without a destroy_p_proc.
         */
        kill_critter(obj: Critter, deathFrame: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {return}
            scriptKillCritter(obj, typeof deathFrame === 'number' ? deathFrame : -1)
        }
        get_poison(obj: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_poison: not a critter: ' + obj, undefined, this)
                return 0
            }
            return (obj as Critter).stats.getBase('Poison Level')
        }
        get_pc_stat(pcstat: number) {
            const player = globalState.player
            switch (pcstat) {
                case 0: // PCSTAT_unspent_skill_points
                    // BLK-185: Guard against null player.skills — Arroyo Elder scripts
                    // call get_pc_stat(0) to read unspent skill points after the XP
                    // award from give_exp_points(2500).  When the skills component has
                    // not yet been attached to a partially-initialised player object,
                    // player.skills is null and .skillPoints throws TypeError.  Mirror
                    // BLK-174 (give_exp_points null-skills guard): return 0 safely.
                    return player ? (player.skills ? player.skills.skillPoints : 0) : 0
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
                default:
                    // Unknown pcstat index — return 0 silently rather than throwing, so that
                    // scripts that probe sfall-extended or future pcstat indices do not crash.
                    warn('get_pc_stat: unknown pcstat ' + pcstat + ' — returning 0', undefined, this)
                    return 0
            }
        }
        /**
         * opCritterInjure: cripples limbs or blinds (the DAM_CRIP bits only);
         * with DAM_PERFORM_REVERSE (0x800000) those injuries are healed instead.
         */
        critter_injure(obj: Obj, how: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {return}
            const flags = typeof how === 'number' ? how : 0
            const value = (flags & 0x800000) === 0
            const c = obj as any
            if (flags & 0x04) {c.crippledLeftLeg = value}
            if (flags & 0x08) {c.crippledRightLeg = value}
            if (flags & 0x10) {c.crippledLeftArm = value}
            if (flags & 0x20) {c.crippledRightArm = value}
            if (flags & 0x40) {c.blinded = value}
            if (c === globalState.player) {syncPlayerEntityFromCritter()}
        }
        /** opCritterIsFleeing: the CRITTER_MANUEVER_FLEEING bit the AI reads. */
        critter_is_fleeing(obj: Obj) {
            if (!isGameObject(obj)) {return 0}
            const c = obj as any
            return ((c.combatManeuver ?? 0) & 0x04) !== 0 || c.isFleeing === true ? 1 : 0
        }
        /**
         * opWieldItem (_inven_wield): armor is worn; anything else goes in a hand,
         * the player's hand in use or an NPC's right hand. The item stays in the
         * inventory.
         */
        wield_obj_critter(obj: Obj, item: Obj) {
            if (!isGameObject(obj) || obj.type !== 'critter' || !isGameObject(item)) {return}
            const critter = obj as any
            if (!Array.isArray(critter.inventory)) {critter.inventory = []}
            if (!critter.inventory.includes(item)) {critter.inventory.push(item)}
            let slot: 'leftHand' | 'rightHand' | 'equippedArmor' = 'rightHand'
            if (item.subtype === 'armor') {slot = 'equippedArmor'}
            else if (critter === globalState.player && (critter.activeHand ?? 0) === 0) {slot = 'leftHand'}
            equipItem(critter, item, slot)
            if (critter === globalState.player) {syncPlayerEntityFromCritter()}
        }
        /**
         * opCritterDamage (actionDamage): `amount` of a damage type to a critter.
         * Flag 0x100 bypasses armor, 0x200 skips the hit animation; otherwise its
         * DT then DR for that type apply. Nobody is credited with the hit.
         */
        critter_dmg(obj: Critter, amount: number, typeWithFlags: number) {
            if (!isGameObject(obj) || obj.type !== 'critter' || !Number.isFinite(amount)) {return}
            const flags = typeof typeWithFlags === 'number' ? typeWithFlags : 0
            const animate = (flags & 0x200) === 0
            const bypassArmor = (flags & 0x100) !== 0
            const type = flags & ~(0x100 | 0x200)
            const names = ['Normal', 'Laser', 'Fire', 'Plasma', 'Electrical', 'EMP', 'Explosive']
            const name = names[type] ?? 'Normal'
            let damage = Math.trunc(amount)
            if (!bypassArmor) {
                const stat = (s: string) => {
                    const v = typeof obj.getStat === 'function' ? obj.getStat(s) : 0
                    return Number.isFinite(v) ? v : 0
                }
                damage -= stat('DT ' + name)
                if (damage > 0) {damage -= Math.trunc((stat('DR ' + name) * damage) / 100)}
                if (damage < 0) {damage = 0}
            }
            regAnimClear(obj)
            if (damage > 0) {critterDamage(obj, damage, null as any, true, animate, name)}
        }
        critter_heal(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('critter_heal: not a critter: ' + obj, undefined, this)
                return
            }
            // BLK-145: Guard against non-finite heal amounts — New Reno boxing scripts
            // compute healing quantities from formulas that can produce NaN or Infinity
            // (e.g. division by zero when a fighter's stats are 0).  Passing a non-finite
            // value to Math.min() propagates NaN into modifyBase('HP', NaN), silently
            // corrupting the critter's HP stat.  Reject and warn instead.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('critter_heal: non-finite amount (' + amount + ') — no-op', undefined, this)
                return
            }
            const critter = obj as Critter
            // BLK-208: Guard against partially-initialised critters that lack a
            // getStat() method — Temple of Trials combat-result scripts sometimes
            // call critter_heal() on NPCs spawned via create_object_sid() before
            // their stat component is attached.  Without this guard,
            // critter.getStat('Max HP') throws TypeError and aborts the heal
            // sequence.  Skip silently so the critter simply retains its current HP.
            if (typeof critter.getStat !== 'function') {
                warn('critter_heal: critter has no getStat() method — no-op', undefined, this)
                return
            }
            const maxHP = critter.getStat('Max HP')
            const currentHP = critter.getStat('HP')
            const healAmount = Math.min(amount, maxHP - currentHP)
            if (healAmount > 0) {critter.stats.modifyBase('HP', healAmount)}
        }
        poison(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('poison: not a critter: ' + obj, undefined, this)
                return
            }
            // BLK-163: Guard against non-finite poison amounts — New Reno drug scripts
            // compute poison doses from encounter formulas (poison-per-dose × multipliers)
            // that can produce NaN when an unknown drug type yields an undefined dose value.
            // Passing NaN to modifyBase('Poison Level', NaN) corrupts the stat and breaks
            // all subsequent drug-resistance and addiction checks.  Reject and warn.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('poison: non-finite amount (' + amount + ') — no-op', undefined, this)
                return
            }
            // opPoison → critterAdjustPoison (the player only; resistance, messages, ticks).
            adjustPoison(obj, amount)
        }
        radiation_dec(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('radiation_dec: not a critter: ' + obj, undefined, this)
                return
            }
            // BLK-165: Guard against non-finite radiation decrease amounts — mirrors BLK-163/164.
            // New Reno encounter scripts apply radiation_dec() to decontaminate NPCs using
            // formulas that can produce NaN (e.g. zero decontamination rate via undefined
            // cleaner-drug efficacy).  Passing NaN corrupts the Radiation Level stat.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('radiation_dec: non-finite amount (' + amount + ') — no-op', undefined, this)
                return
            }
            // opRadiationDecrease → critterAdjustRadiation(−amount).
            adjustRadiation(obj, -amount)
        }
        radiation_add(obj: Obj, amount: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('radiation_add: not a critter: ' + obj, undefined, this)
                return
            }
            // BLK-164: Guard against non-finite radiation amounts — New Reno scripts
            // apply radiation_add() in nuclear-area encounters using level-scaled formulas
            // that can produce NaN (e.g. undefined radiation intensity for an encounter type).
            // Passing NaN to modifyBase('Radiation Level', NaN) corrupts the stat and
            // breaks radiation gauge / resistance checks everywhere.  Reject and warn.
            if (typeof amount !== 'number' || !isFinite(amount)) {
                warn('radiation_add: non-finite amount (' + amount + ') — no-op', undefined, this)
                return
            }
            // opRadiationIncrease → critterAdjustRadiation: resistance, messages, the midnight check.
            adjustRadiation(obj, amount)
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

            // BLK-176: Guard against null self_obj — Temple NPC scripts call attack_complex()
            // from map-level scripts (not object scripts) where self_obj is null.  Without this
            // guard, Combat.start(null as Critter) throws a TypeError and halts the entire
            // script VM, preventing any further combat or map events from firing.
            if (!this.self_obj) {
                warn('attack_complex: self_obj is null — combat start skipped', undefined, this)
                return
            }
            // opAttackComplex: no fight starts from inside a conversation.
            if (currentDialogueObject) {return}

            this._scriptAttack(this.self_obj, obj, {
                accuracyBonus: bonus | 0,
                damageBonus: 0,
                minDamage: minDmg | 0,
                maxDamage: maxDmg | 0,
                overrideAttackResults: attackerResults === targetResults,
                attackerResults: attackerResults | 0,
                targetResults: targetResults | 0,
            })
        }
        /** attack_setup(attacker, defender) (opAttackSetup): attack_complex with an explicit attacker. */
        attack_setup(attacker: Obj, defender: Obj) {
            info('[enter combat via attack_setup]')
            if (!attacker) {return}
            this._scriptAttack(attacker, defender, {
                accuracyBonus: 0, damageBonus: 0, minDamage: 0, maxDamage: 0x7fffffff,
                overrideAttackResults: false, attackerResults: 0, targetResults: 0,
            })
        }
        /**
         * opAttackComplex / opAttackSetup: nothing happens when either side is
         * dead, knocked out or hidden, or the target is fleeing; mid-fight the
         * attacker just engages (joining at the end of the round).
         */
        private _scriptAttack(attacker: any, target: any, startData: CombatStartData) {
            const inactive = (c: any) => !c || c.dead || c.knockedOut || c.visible === false
            if (inactive(attacker) || inactive(target)) {return}
            if (((target.combatManeuver ?? 0) & 0x04) !== 0) {return}

            // Track the starting combatant for get_last_pers_obj (0x81D3).
            ;(globalState as any).lastPersistentObj = attacker
            if (globalState.inCombat && globalState.combat) {
                if (((attacker.combatManeuver ?? 0) & 0x01) === 0) {
                    attacker.combatManeuver = (attacker.combatManeuver ?? 0) | 0x01
                    attacker.whoHitMe = target
                }
                return
            }
            if (Config.engine.doCombat) {Combat.start(attacker as Critter, target instanceof Critter ? target : undefined, { startData })}
        }
        critter_stop_attacking(obj: Obj) {
            // opCritterStopAttacking: disengage and forget the enemy.
            if (!isGameObject(obj)) {return}
            const c: any = obj
            c.combatManeuver = (c.combatManeuver ?? 0) | 0x02
            c.whoHitMe = null
            c.aiLastTarget = null
        }
        terminate_combat() {
            info('[terminate_combat]')
            // opTerminateCombat: the calling critter drops out of the fight, then combat ends.
            const self: any = this.self_obj
            if (globalState.combat && self && self.type === 'critter') {
                self.combatManeuver = (self.combatManeuver ?? 0) | 0x02
                self.whoHitMe = null
                self.aiLastTarget = null
            }
            if (globalState.combat) {globalState.combat.end()}
        }
        /** opCritterSetFleeState: set or clear the fleeing maneuver bit. */
        critter_set_flee_state(obj: Obj, fleeing: number) {
            if (!isGameObject(obj)) {return}
            const c = obj as any
            c.combatManeuver = fleeing ? (c.combatManeuver ?? 0) | 0x04 : (c.combatManeuver ?? 0) & ~0x04
            c.isFleeing = !!fleeing
        }

        // ---------------------------------------------------------------------------
        // PC flags — player character state bitfield
        //   Bit 0: SNEAKING            (DUDE_STATE_SNEAKING)
        //   Bit 3: LEVEL_UP_AVAILABLE  (DUDE_STATE_LEVEL_UP_AVAILABLE)
        //   Bit 4: ADDICTED            (DUDE_STATE_ADDICTED)
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
        /** opPickup (actionPickUp): the script's critter picks the object up into its inventory. */
        pickup_obj(obj: Obj) {
            if (!isGameObject(obj)) {return}
            const self: any = isGameObject(this.target_obj) ? this.target_obj : this.self_obj
            if (!isGameObject(self) || self.type !== 'critter') {return}
            // _obj_pickup: the item's own pickup_p_proc runs first and may override.
            if (obj._script && Scripting.pickup(obj, self)) {return}
            if (globalState.gMap) {globalState.gMap.removeObject(obj)}
            this.add_mult_objs_to_inven(self, obj, (obj as any).amount ?? 1)
        }

        // ---------------------------------------------------------------------------
        // drop_obj — remove an object from a critter's inventory and place on the map
        //
        // Used by scripts to force-drop items from a critter (e.g. disarming a
        // critter in a scripted event).  Places the item at the critter's tile.
        // ---------------------------------------------------------------------------
        drop_obj(obj: Obj) {
            if (!isGameObject(obj)) {return}
            // The script's own critter drops it; otherwise the player.
            const selfObj = this.self_obj as any
            const source: any = isGameObject(selfObj) && selfObj.type === 'critter' ? selfObj : globalState.player
            if (!source) {return}
            removeItem(source, obj, (obj as any).amount ?? 1)
            if (globalState.gMap && source.position) {
                obj.position = { ...source.position }
                globalState.gMap.addObject(obj)
            }
            if (source === globalState.player) {syncPlayerEntityFromCritter()}
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
        /** opObjectLock: only items (containers) and scenery (doors) can be locked. */
        obj_lock(obj: Obj) {
            if (isGameObject(obj) && (obj.type === 'item' || obj.type === 'scenery')) {obj.locked = true}
        }
        obj_unlock(obj: Obj) {
            if (isGameObject(obj) && (obj.type === 'item' || obj.type === 'scenery')) {obj.locked = false}
        }
        obj_is_open(obj: Obj) {
            log('obj_is_open', arguments)
            if (!isGameObject(obj)) {
                warn('obj_is_open: not game object: ' + obj, undefined, this)
                return 0
            }
            return obj.open ? 1 : 0
        }
        /** opObjectClose (objectClose): an open, unlocked door or container closes. */
        obj_close(obj: Obj) {
            if (!isGameObject(obj) || !obj.open || obj.locked) {return}
            ;(obj as any).lockJammed = false
            setObjectOpen(obj, false, false)
        }
        /**
         * opObjectOpen (objectOpen): a closed, unlocked door or container swings
         * open (its jam cleared); no use_p_proc and no loot screen.
         */
        obj_open(obj: Obj) {
            if (!isGameObject(obj) || obj.open || obj.locked) {return}
            ;(obj as any).lockJammed = false
            setObjectOpen(obj, true, false)
        }
        /** opGetProtoData (protoGetDataMember): the members depend on the proto's type. */
        proto_data(pid: number, data_member: number): any {
            const type = (pid >>> 24) & 0xff
            let pro: any
            try {
                pro = loadPRO(pid, pid & 0xffff)
            } catch {
                pro = null
            }
            if (!pro) {return 0}
            const extra = pro.extra ?? {}
            const fid = ((pro.frmType ?? 0) << 24) | (pro.frmPID ?? 0)
            const msgFile = ['pro_item', 'pro_crit', 'pro_scen', 'pro_wall', 'pro_tile', 'pro_misc'][type]
            const text = (offset: number): string => {
                try {
                    return getMessage(msgFile, (pro.textID ?? 0) + offset) ?? ''
                } catch {
                    return ''
                }
            }
            // Members 0–8 are the common header everywhere but tiles.
            if (type !== 4) {
                switch (data_member) {
                    case 0: return pid
                    case 1: return text(0)
                    case 2: return type === 5 ? 0 : text(1) // misc reports the pointer as an int
                    case 3: return fid
                    case 4: return pro.lightRadius ?? 0
                    case 5: return pro.lightIntensity ?? 0
                    case 6: return pro.flags ?? 0
                }
            }
            switch (type) {
                case 0: // items
                    switch (data_member) {
                        case 7: // extended flags: item flags, action flags, weapon flags, attack modes
                            return (((extra.itemFlags ?? 0) << 24) | ((extra.actionFlags ?? 0) << 16) |
                                ((extra.weaponFlags ?? 0) << 8) | (extra.attackMode ?? 0)) >>> 0
                        case 8: return extra.scriptID ?? -1
                        case 9: return extra.subType ?? 0
                        case 11: return extra.materialID ?? 0
                        case 12: return extra.size ?? 0
                        case 13: return extra.weight ?? 0
                        case 14: return extra.cost ?? 0
                        case 15: return extra.invFRM ?? -1
                        case 555: return extra.subType === 3 ? (extra.maxRange1 ?? 0) : 0
                    }
                    return 0
                case 1: // critters
                    switch (data_member) {
                        case 7: return extra.actionFlags ?? 0
                        case 8: return extra.scriptID ?? -1
                        case 10: return extra.headFID ?? -1
                        case 11: return extra.bodyType ?? 0
                    }
                    return 0
                case 2: // scenery
                    switch (data_member) {
                        case 7: return (((extra.wallLightTypeFlags ?? 0) << 16) | (extra.actionFlags ?? 0)) >>> 0
                        case 8: return extra.scriptPID ?? -1
                        case 9: return extra.subType ?? 0
                        case 11: return extra.materialID ?? 0
                    }
                    return 0
                case 3: // walls
                    switch (data_member) {
                        case 7: return (((extra.wallLightTypeFlags ?? 0) << 16) | (extra.actionFlags ?? 0)) >>> 0
                        case 8: return extra.scriptPID ?? -1
                        case 9: return extra.materialID ?? 0
                    }
                    return 0
                case 5: // misc
                    return data_member === 7 ? (extra.actionFlags ?? 0) : 0
                default:
                    return 0
            }
        }
        create_object_sid(pid: number, tile: number, elev: number, sid: number) {
            // Create object of pid and possibly script
            info('create_object_sid: pid=' + pid + ' tile=' + tile + ' elev=' + elev + ' sid=' + sid, undefined, this)

            // BLK-169: Guard against negative tile numbers — Fallout 2 scripts use -1
            // as a sentinel for "no tile / not yet placed".  Placing an object at a
            // negative tile gives it an out-of-bounds position ({x:<0, y:0}), which
            // corrupts pathfinding and LOS calculations.  Return null so the caller
            // can detect the failure and defer placement.
            // opCreateObject: nothing for pid 0 or while a save is being restored;
            // tile -1 means tile 0.
            if (pid === 0 || globalState.loadingGame) {return null}
            if (tile === -1) {tile = 0}
            if (!isValidTileNum(tile)) {
                warn('create_object_sid: invalid tile (' + tile + ') — no-op', undefined, this)
                return null
            }

            if (elev < 0 || elev > 2) {
                warn('create_object_sid: elev out of range (' + elev + ') — clamping to [0,2]', undefined, this)
                elev = Math.max(0, Math.min(2, elev))
            }

            const obj = createObjectWithPID(pid, sid)
            if (!obj) {
                warn("create_object_sid: couldn't create object", undefined, this)
                return null
            }
            obj.position = fromTileNum(tile)

            //stub("create_object_sid", arguments)

            // FO2 normally requires the script to be running on the same
            // elevation as the object being created.  We log a warning and
            // continue rather than failing the call outright, because some
            // sfall scripts intentionally create cross-elevation objects
            // (e.g. map transitions).
            if (elev !== globalState.currentElevation) {
                warn('create_object_sid: creating object on elevation ' + elev + ' (current=' + globalState.currentElevation + ')', undefined, this)
            }

            // BLK-079: Guard against null gMap — can happen when scripts run during
            // map transitions or before the first map is fully loaded.  Skip the
            // addObject call so the VM doesn't crash; return null to signal failure.
            if (!globalState.gMap) {
                warn('create_object_sid: gMap is null — cannot place object on map', undefined, this)
                return null
            }

            // add it to the map
            globalState.gMap.addObject(obj, elev)

            // sfall 0x825F: increment the per-session object creation counter
            globalState.newObjCounter++

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
        /** opGetItemType: the item's type, or -1 for anything that is not an item. */
        obj_item_subtype(obj: Obj) {
            if (!isGameObject(obj) || obj.type !== 'item') {return -1}
            const subType = (obj as any).pro?.extra?.subType
            if (typeof subType === 'number') {return subType}
            const byName: Record<string, number> = { armor: 0, container: 1, drug: 2, weapon: 3, ammo: 4, misc: 5, key: 6 }
            return obj.subtype !== undefined && byName[obj.subtype] !== undefined ? byName[obj.subtype] : -1
        }
        /** opAnimBusy: -1 while the object is in a running animation sequence (or moving), else 0. */
        anim_busy(obj: Obj) {
            if (!isGameObject(obj)) {return 0}
            if (animationIsBusy(obj) !== 0) {return -1}
            return (obj as any).path ? -1 : 0
        }
        /** opGetObjectFid: type << 24 | animation << 16 | weapon code << 12 | art index. */
        obj_art_fid(obj: Obj) {
            if (!isGameObject(obj)) {return 0}
            const o = obj as any
            const type = o.type === 'critter' ? 1 : (o.pro?.frmType ?? o.frmType ?? ((o.pid ?? 0) >>> 24) ?? 0)
            const index = (o.frmPID ?? o.pro?.frmPID ?? 0) & 0xfff
            if (o.type !== 'critter') {return ((type & 0xf) << 24) | index}
            return ((type & 0xf) << 24) | (((o.animCode ?? 0) & 0xff) << 16) | ((weaponAnimationCode(o) & 0xf) << 12) | index
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
            // BLK-203: Guard against non-numeric/non-finite visibility values — Arroyo
            // NPC init scripts sometimes pass the result of a Fallout 2 conditional
            // expression (e.g. `local_var(0) == 0`) that can resolve to null or NaN
            // when the variable is uninitialised.  `!NaN` and `!null` both evaluate to
            // `true`, so the object would be shown (visible=true) regardless of intent.
            // When the argument is not a finite number, treat as 0 (show the object)
            // to preserve the default-visible semantics and emit a warning.
            if (typeof visibility !== 'number' || !isFinite(visibility)) {
                warn('set_obj_visibility: non-numeric visibility (' + visibility + ') — treating as 0 (visible)', undefined, this)
                visibility = 0
            }
            // opSetObjectVisibility: refused while a save is restored.
            if (globalState.loadingGame) {return}

            obj.visible = !visibility
        }
        /**
         * opUseObjectOnObject: the script's object uses the item on the target.
         * The target's use_obj_on_p_proc decides; otherwise the default use
         * applies (a drug given to a critter is taken).
         */
        use_obj_on_obj(item: Obj, target: Obj) {
            if (!isGameObject(item) || !isGameObject(target)) {return}
            const user: any = this.self_obj
            if (useObjOn(target, item, user) === true) {return}
            if (target.type === 'critter' && isDrug(item) && takeDrug(target, item) === 1 && user) {
                removeItem(user, item, 1)
            }
        }
        /** opUseObject: the script's critter (or object) uses the object. */
        use_obj(obj: Obj) {
            if (!isGameObject(obj) || typeof (obj as any).use !== 'function') {return}
            const user: any = isGameObject(this.target_obj) ? this.target_obj : this.self_obj
            if (!isGameObject(user)) {return}
            obj.use(user)
        }
        /**
         * opAnim: an animation code below ANIM_COUNT plays once (forwards for
         * frame 0, else backwards); a fall leaves the critter lying, and getting
         * up from one ends standing. 1000 sets the rotation, 1010 the frame.
         */
        anim(obj: Obj, anim: number, param: number) {
            if (!isGameObject(obj)) {return}
            const o = obj as any
            if (anim < ANIM_COUNT) {
                anim = correctDeath(o, anim, true)
                regAnimBegin(ANIMATION_REQUEST_UNRESERVED)
                if (param === 0) {
                    regAnimAnimate(o, anim, 0)
                    if (anim >= ANIM_FALL_BACK && anim <= ANIM_FALL_FRONT_BLOOD) {regAnimSetArt(o, anim + 28, -1)}
                    if (o.type === 'critter') {o.knockedOut = false}
                } else {
                    regAnimAnimateReversed(o, anim, 0)
                    if (anim === ANIM_PRONE_TO_STANDING) {regAnimSetArt(o, ANIM_FALL_FRONT_SF, -1)}
                    else if (anim === ANIM_BACK_TO_STANDING) {regAnimSetArt(o, ANIM_FALL_BACK_SF, -1)}
                    if (o.type === 'critter') {o.knockedDown = true}
                }
                regAnimEnd()
            } else if (anim === 1000) {
                if (typeof param === 'number' && param >= 0 && param < 6) {o.orientation = param}
            } else if (anim === 1010) {
                o.frame = param
            }
        }

        // environment
        set_light_level(level: number) {
            log('set_light_level', arguments)
            // Clamp to the valid range 0–65536 and store on globalState.
            globalState.ambientLightLevel = Math.max(0, Math.min(65536, level))
            Lightmap.applyAmbientLight()
        }
        /** opSetObjectLightLevel: intensity is a percentage (scaled by 65636/100, as the engine does). */
        obj_set_light_level(obj: Obj, intensity: number, distance: number) {
            if (!isGameObject(obj)) {return}
            const pct = Number.isFinite(intensity) ? intensity : 0
            const value = pct !== 0 ? Math.trunc((pct * 65636) / 100) : 0
            const dist = Number.isFinite(distance) ? Math.max(0, distance) : 0
            Lightmap.syncObjectEmitterLight(obj, value, dist)
        }
        override_map_start(x: number, y: number, elevation: number, rotation: number) {
            log('override_map_start', arguments)
            // BLK-173: Guard against non-finite position — temple exit grids compute
            // the player spawn tile from level arithmetic; a broken formula yields NaN
            // or Infinity which would corrupt overrideStartPos and cause the player to
            // appear at an invalid/out-of-bounds map position on map load.
            if (typeof x !== 'number' || !isFinite(x) || typeof y !== 'number' || !isFinite(y)) {
                warn('override_map_start: non-finite position (' + x + ', ' + y + ') — no-op', undefined, this)
                return
            }
            info(`override_map_start: ${x}, ${y} / elevation ${elevation}`)
            overrideStartPos = { position: { x, y }, orientation: rotation, elevation }
        }
        obj_pid(obj: Obj) {
            return isGameObject(obj) ? obj.pid : -1
        }
        /** opObjectOnScreen: on the current level and inside the view. */
        obj_on_screen(obj: Obj) {
            if (!isGameObject(obj) || elevationOf(obj) !== globalState.currentElevation) {return 0}
            return objectOnScreen(obj) ? 1 : 0
        }
        /** opGetObjectType: the art type of the object, or -1. */
        obj_type(obj: Obj) {
            if (!isGameObject(obj)) {return -1}
            if (obj.type === 'critter') {return 1}
            if (typeof obj.pid !== 'number') {return -1}
            return (obj.pid >>> 24) & 0xff
        }
        /**
         * opDestroyObject: an object somebody carries leaves that inventory (and
         * any slot); one on the map is removed. Its pending timers go with it.
         * A critter is not destroyed while a save is restored.
         */
        destroy_object(obj: Obj) {
            if (!isGameObject(obj)) {return}
            if (obj.type === 'critter' && globalState.loadingGame) {return}
            regAnimClear(obj)
            for (let i = timeEventList.length - 1; i >= 0; i--) {
                if (timeEventList[i].obj === obj) {timeEventList.splice(i, 1)}
            }
            const owner = findOwner(obj)
            if (owner) {
                removeItem(owner, obj, (obj as any).amount ?? 1)
                if (owner === globalState.player) {syncPlayerEntityFromCritter()}
                return
            }
            if (globalState.gMap) {globalState.gMap.destroyObject(obj)}
        }
        /** opSetExitGrids: every exit grid on that elevation leads to the given map, elevation and tile. */
        set_exit_grids(onElev: number, mapID: number, elevation: number, tileNum: number, _rotation: number) {
            for (const obj of globalState.gMap?.getObjects(onElev) ?? []) {
                if (obj.type === 'misc' && obj.extra && obj.extra.exitMapID !== undefined) {
                    obj.extra.exitMapID = mapID
                    obj.extra.startingPosition = tileNum
                    obj.extra.startingElevation = elevation
                }
            }
        }

        // tiles
        /** opTileDistanceBetweenObjects: 9999 unless both are on the map at the same elevation. */
        tile_distance_objs(a: Obj, b: Obj) {
            const okA = isSpatial(a) || isGameObject(a)
            const okB = isSpatial(b) || isGameObject(b)
            if (!okA || !okB || !a.position || !b.position) {return 9999}
            if (elevationOf(a) !== elevationOf(b)) {return 9999}
            return hexDistance(a.position, b.position)
        }
        tile_distance(a: number, b: number) {
            if (a === -1 || b === -1) {return 9999}
            // BLK-187: Guard against non-finite tile numbers — Arroyo transition and
            // encounter scripts compute tile positions from formulas that can yield NaN
            // (e.g. a tile index formula that divides by zero when the player spawns at
            // an uninitialised position).  fromTileNum(NaN) returns {x:NaN, y:NaN} and
            // hexDistance then propagates NaN into all downstream distance comparisons,
            // silently breaking LOS and proximity checks.  Return 9999 (maximum sentinel
            // distance) so callers treat the positions as "out of range".
            if (typeof a !== 'number' || !Number.isFinite(a) ||
                typeof b !== 'number' || !Number.isFinite(b)) {
                warn('tile_distance: non-finite tile (' + a + ', ' + b + ') — returning 9999', undefined, this)
                return 9999
            }
            return hexDistance(fromTileNum(a), fromTileNum(b))
        }
        /** opGetObjectTile: -1 for no object or one off the map. */
        tile_num(obj: Obj) {
            if ((!isSpatial(obj) && !isGameObject(obj)) || !obj.position) {return -1}
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
            const pos = fromTileNum(tile)
            const objects = globalState.gMap.getObjects(elevation)
            for (let i = 0; i < objects.length; i++) {
                // BLK-055: Guard against objects without a position (edge case during
                // map transitions or after explosive removal).
                if (!objects[i].position) {continue}
                if (objects[i].position.x === pos.x && objects[i].position.y === pos.y && objects[i].pid === pid) {
                    return objects[i]
                }
            }
            return 0 // it's not there
        }
        /** tileIsVisible: the engine's coarse test against the tile at the middle of the view. */
        tile_is_visible(tile: number) {
            if (!Number.isFinite(tile)) {return 0}
            const d = Math.abs(centerTile() - tile)
            return d % 200 < 5 || Math.trunc(d / 200) < 5 ? 1 : 0
        }
        /** opTileInTileRect: x between the 4th and 1st corners, y between the 1st and 4th. */
        tile_in_tile_rect(ul: number, _ur: number, _ll: number, lr: number, t: number) {
            const x = t % 200, y = Math.trunc(t / 200)
            const minX = lr % 200, maxX = ul % 200
            const minY = Math.trunc(ul / 200), maxY = Math.trunc(lr / 200)
            return x >= minX && x <= maxX && y >= minY && y <= maxY ? 1 : 0
        }
        tile_contains_obj_pid(tile: number, elevation: number, pid: number) {
            // BLK-037: use getObjects(elevation) so that objects on a non-current
            // floor are correctly found (previously returned 0 whenever the elevation
            // did not match the current floor, even when the target floor existed).
            // BLK-135: Guard against invalid tile numbers — negative values or NaN
            // produce meaningless coordinates from fromTileNum().  Return 0 early.
            if (typeof tile !== 'number' || !isFinite(tile) || tile < 0) {return 0}
            const pos = fromTileNum(tile)
            const objs = (globalState.gMap?.getObjects(elevation)) ?? []
            for (let i = 0; i < objs.length; i++) {
                // BLK-055: Guard against objects without a position.
                if (!objs[i].position) {continue}
                if (objs[i].position.x === pos.x && objs[i].position.y === pos.y && objs[i].pid === pid) {return 1}
            }
            return 0
        }
        /** opGetRotationToTile (tileGetRotationTo): the screen angle between the hexes in sixths. */
        rotation_to_tile(srcTile: number, destTile: number) {
            if (!Number.isFinite(srcTile) || !Number.isFinite(destTile)) {return -1}
            const a = fromTileNum(srcTile)
            const b = fromTileNum(destTile)
            const s1 = hexToScreen(a.x, a.y)
            const s2 = hexToScreen(b.x, b.y)
            const dx = s2.x - s1.x
            const dy = s2.y - s1.y
            if (dx === 0) {return dy < 0 ? 0 : 2}
            const angle = Math.trunc((Math.atan2(-dy, dx) * 180) / Math.PI)
            let rotation = 360 - (angle + 180) - 90
            if (rotation < 0) {rotation += 360}
            rotation = Math.trunc(rotation / 60)
            return rotation >= 6 ? 5 : rotation
        }
        move_to(obj: Obj, tileNum: number, elevation: number) {
            if (!isGameObject(obj)) {
                warn('move_to: not a game object: ' + obj)
                return -1
            }
            // BLK-136: Guard against non-finite tileNum — NaN/Infinity passed by a
            // script arithmetic error would set obj.position to {x: NaN, y: NaN},
            // breaking all subsequent position checks.  Skip and warn instead.
            if (typeof tileNum !== 'number' || !isFinite(tileNum) || tileNum < 0) {
                warn('move_to: invalid tileNum (' + tileNum + ') — no-op', undefined, this)
                return -1
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

            if (obj instanceof Critter && obj.isPlayer) {centerCamera(obj.position)}
            // opMoveTo returns the tile the object now stands on.
            return tileNum
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
                if (source.isPlayer !== true && globalState.inCombat) {
                    ;(source as any).combatManeuver = ((source as any).combatManeuver ?? 0) | 0x01
                    ;(source as any).whoHitMe = globalState.player
                } else if (source.isPlayer !== true) {
                    Combat.start(source, globalState.player as Critter)
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
            // gameDialogBarter: switch to barter mode with this modifier.
            log('gdialog_mod_barter', arguments)
            this._barterMod = typeof mod === 'number' && isFinite(mod) ? mod : 0
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
            // opStartGameDialog: no conversation during combat.
            if (globalState.inCombat) {return}
            currentDialogueObject = this.self_obj as Critter
            globalState.dialogueObject = currentDialogueObject
            // gameDialogEnter clears the barter modifier.
            this._barterMod = 0
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
            const msg = getScriptMessage(msgList, msgID)
            if (msg === null || msg === '') {
                warn('gsay_reply: message is null/empty — reply skipped', undefined, this)
                return
            }
            info('REPLY: ' + msg, 'dialogue')
            uiSetDialogueReply(msg)
        }
        /**
         * _op_gsay_message: show the line with a single [Done] option (proto.msg
         * 650) that carries on with the script. True when the option was offered.
         */
        gsay_message(msgList: number, msgID: string | number, _reaction: number, resume?: () => void): boolean {
            const msg = getScriptMessage(msgList, msgID)
            uiSetDialogueReply(msg ?? '')
            if (!currentDialogueObject) {return false}
            let done: string | null = null
            try {
                done = getMessage('proto', 650)
            } catch {
                done = null
            }
            dialogueOptionProcs.push(() => resume?.())
            uiAddDialogueOption(done ?? '[Done]', dialogueOptionProcs.length - 1)
            return true
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
            const msg = getScriptMessage(msgList, msgID)
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
            const msg = getScriptMessage(msgList, msgID)
            // BLK-204: Guard against null/empty message — mirrors the same guard in
            // gsay_option() (BLK-107/BLK-156).  Arroyo character-creation dialogue
            // scripts use giq_option() for INT-gated options; if a message key is
            // missing from the loaded .msg file, getScriptMessage() returns null and
            // an empty-string message would render as a blank option in the UI.
            // Skip silently so the player never sees a blank IQ-gated option.
            if (msg === null || msg === '') {
                warn('giq_option: msg is null/empty — option skipped', undefined, this)
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

            // _op_giq_option: Intelligence plus the Smooth Talker rank.
            const INT: number = (typeof player.getStat === 'function' ? (player.getStat('INT') ?? 5) : 5) + perkRank(player, PerkId.SMOOTH_TALKER)
            // BLK-168: Guard against non-numeric INT (getStat may return undefined
            // for new-game player objects whose stat tables aren't fully initialised
            // yet; defaulting to 5 matches Fallout 2's base human INT).
            if ((iqTest > 0 && INT < iqTest) || (iqTest < 0 && INT > -iqTest)) {return} // not enough intelligence for this option

            dialogueOptionProcs.push(target.bind(this))
            uiAddDialogueOption(msg, dialogueOptionProcs.length - 1)
        }
        dialogue_system_enter() {
            log('dialogue_system_enter', arguments)
            if (!this.self_obj) {
                warn('dialogue_system_enter: no self_obj')
                return
            }
            // opGameDialogSystemEnter: not in combat, nor with a critter that cannot act.
            if (globalState.inCombat) {return}
            const speaker: any = this.self_obj
            if (speaker.type === 'critter' && (speaker.dead || speaker.knockedOut || speaker.knockedDown)) {return}
            talk(this.self_obj._script, this.self_obj as Obj)
        }
        /**
         * opFloatMessage: text over the object. Empty text clears the object's
         * messages; nothing shows for an object on another level. Colours follow
         * the engine's palette; -1 cycles through them, -2 is a warning.
         */
        float_msg(obj: Obj, msg: string, type: number) {
            if (!isGameObject(obj) || !Array.isArray(globalState.floatMessages)) {return}
            if (typeof msg !== 'string' || msg === '') {
                globalState.floatMessages = globalState.floatMessages.filter((m: any) => m.obj !== obj)
                return
            }
            if (elevationOf(obj) !== globalState.currentElevation) {return}
            let kind = typeof type === 'number' ? type : 0
            if (kind === -1) {
                kind = lastFloatColor + 1
                if (kind >= 13) {kind = 1}
                lastFloatColor = kind
            }
            if (kind === -2 && globalState.player?.position) {centerCamera(globalState.player.position)}
            globalState.floatMessages.push({
                msg,
                obj,
                startTime: typeof performance !== 'undefined' ? performance.now() : 0,
                color: FLOAT_COLORS[kind] ?? FLOAT_COLORS[0],
            })
        }

        // animation
        /** opRegAnimFunc: 1 begins a sequence (with request flags), 2 clears an object's, 3 ends it. Not in combat. */
        reg_anim_func(cmd: number, param: any) {
            if (regAnimBlocked()) {return}
            if (cmd === 1) {regAnimBegin(typeof param === 'number' ? param : ANIMATION_REQUEST_UNRESERVED)}
            else if (cmd === 2) {regAnimClear(param)}
            else if (cmd === 3) {regAnimEnd()}
        }
        /** opRegAnimAnimate; the dying fall of pid 0x100002F is skipped under the violence filter. */
        reg_anim_animate(obj: Obj, anim: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            if (anim === 20 && (obj as any).pid === 0x100002f && violenceToIni(globalState.violenceLevel) < 2) {return}
            regAnimAnimate(obj, anim, delay)
        }
        reg_anim_animate_forever(obj: Obj, anim: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimAnimateForever(obj, anim)
        }
        /**
         * opAnimateMoveObjectToTile: walk (flags 0) or run there, outside combat,
         * if the critter can act; flag 0x10 first clears what it was doing.
         */
        animate_move_obj_to_tile(obj: Critter, tileNum: number, flags: number) {
            if (!isGameObject(obj) || typeof tileNum !== 'number' || tileNum <= -1) {return}
            const c = obj as any
            if (c.type !== 'critter' || c.dead || c.knockedOut || c.knockedDown || globalState.inCombat) {return}
            let f = typeof flags === 'number' ? flags : 0
            if (f & 0x10) {
                regAnimClear(c)
                f &= ~0x10
            }
            regAnimBegin(ANIMATION_REQUEST_UNRESERVED)
            if (f === 0) {regAnimMoveToTile(c, tileNum, -1)}
            else {regAnimRunToTile(c, tileNum, -1)}
            regAnimEnd()
        }
        reg_anim_obj_move_to_tile(obj: Obj, tileNum: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimMoveToTile(obj, tileNum, delay)
        }

        // ── sfall's reg_anim steps (Anims.cpp): skipped in combat unless reg_anim_combat_check(0). ──
        /**
         * create_spatial(script, tile, elevation, radius): a new spatial script
         * (scripts.lst entry, counting from 1); its start runs now.
         */
        create_spatial(scriptIndex: number, tile: number, elevation: number, radius: number): any {
            const map: any = globalState.gMap
            const name = lookupScriptName(Math.trunc(scriptIndex))
            if (!map || !name || !isValidTileNum(tile)) {return 0}
            const elev = Math.max(0, Math.min(2, Math.trunc(elevation)))
            const spatial: any = { script: name, tileNum: tile, position: fromTileNum(tile), range: Math.trunc(radius), isSpatial: true }
            try {
                spatial._script = loadScript(name)
            } catch {
                return 0
            }
            if (!map.spatials) {map.spatials = [[], [], []]}
            if (!map.spatials[elev]) {map.spatials[elev] = []}
            map.spatials[elev].push(spatial)
            initScript(spatial._script, spatial)
            return spatial
        }
        /** reg_anim_combat_check(0): reg_anim_* work in combat too, until the frame ends. */
        reg_anim_combat_check(on: number) {
            setRegAnimCombatCheck(on > 0)
        }
        /** reg_anim_destroy: the object is removed when the sequence gets here. */
        reg_anim_destroy(obj: Obj) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimCallback(obj, () => this.destroy_object(obj), -1)
        }
        /** reg_anim_animate_and_hide: play the animation, then hide the object. */
        reg_anim_animate_and_hide(obj: Obj, anim: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimAnimate(obj, anim, delay)
            regAnimCallback(obj, () => { (obj as any).visible = false }, -1)
        }
        /** reg_anim_light(obj, radius 0–8, delay): the light's radius changes at that step. */
        reg_anim_light(obj: Obj, radius: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            const r = Math.max(0, Math.min(8, Math.trunc(radius)))
            regAnimCallback(obj, () => {
                Lightmap.syncObjectEmitterLight(obj, (obj as any).lightIntensity ?? 0, r)
                ;(obj as any).lightRadius = r
            }, delay)
        }
        /** reg_anim_change_fid: the object's art changes at that step. */
        reg_anim_change_fid(obj: Obj, fid: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimCallback(obj, () => {
                try {
                    ;(obj as any).art = lookupArt(fid)
                    ;(obj as any).frmPID = fid & 0xffffff
                } catch {
                    warn('reg_anim_change_fid: no art for fid 0x' + (fid >>> 0).toString(16), undefined, this)
                }
            }, delay)
        }
        /** reg_anim_take_out: the critter draws its weapon. */
        reg_anim_take_out(obj: Obj, _holdFrame: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimAnimate(obj, 38, -1)
        }
        /** reg_anim_turn_towards: the object turns to face the tile. */
        reg_anim_turn_towards(obj: Obj, tile: number) {
            if (regAnimBlocked() || !isGameObject(obj) || !obj.position || !isValidTileNum(tile)) {return}
            regAnimCallback(obj, () => {
                if (obj.position) {obj.orientation = hexDirectionTo(obj.position, fromTileNum(tile))}
            }, -1)
        }
        /** reg_anim_callback(procedure): the script's procedure runs when the sequence gets here. */
        reg_anim_callback(proc: number | string) {
            const vm: any = this._vm
            const name = typeof proc === 'string' ? proc : vm?.intfile?.proceduresTable?.[proc]?.name
            if (!name || !vm) {return}
            regAnimCallback(null, () => vm.call(name), -1)
        }

        // ── Vanilla opcodes (interpreter_extra.cc) ──────────────────────────
        /** scr_return(value): the value a procedure hands back to the engine. */
        scr_return(value: number) {
            this._returnValue = value
        }
        /** how_much(unused): the margin of the last roll_vs_skill / do_check. */
        how_much(_unused: number) {
            return this._howMuch ?? 0
        }
        /** skill_contest, roll_dice and reaction_influence are unimplemented in the engine and return 0. */
        skill_contest(_a: number, _b: number, _c: number) {
            return 0
        }
        roll_dice(_a: number, _b: number) {
            return 0
        }
        reaction_influence(_a: number, _b: number, _c: number) {
            return 0
        }
        /** obj_being_used_with: the object this one is being used on. */
        obj_being_used_with() {
            return this.target_obj ?? 0
        }
        /** set_map_start(x, y, elevation, rotation): where the current map starts. */
        set_map_start(x: number, y: number, elevation: number, rotation: number) {
            const map: any = globalState.gMap
            if (!map || !isFinite(x) || !isFinite(y)) {return}
            map.startingPosition = { x, y }
            map.startingElevation = elevation
            if (map.mapObj) {
                map.mapObj.startPosition = { x, y }
                map.mapObj.startOrientation = rotation
            }
        }
        /** game_time_in_seconds (0x80EB). */
        game_time_in_seconds() {
            return Math.floor((globalState.gameTickTime ?? 0) / 10)
        }
        /** days_since_visited: whole days since the player last left this map, −1 on a first visit. */
        days_since_visited() {
            const last = (globalState.gMap as any)?.lastVisitTime ?? 0
            if (!last) {return -1}
            return Math.floor(((globalState.gameTickTime ?? 0) - last) / 864000)
        }
        /** kill_critter_type(pid, deathFrame): kill every living, visible critter with that pid. */
        /**
         * opKillCritterType: every living, visible, standing critter with that pid.
         * Death frame 0 removes them; 1 cycles through the engine's list of deaths;
         * a single-frame death code uses that one; anything else falls back.
         */
        kill_critter_type(pid: number, deathFrame: number) {
            if (globalState.loadingGame) {return}
            const ftList = [62, 51, 52, 53, 63, 62, 54, 56, 59, 62, 63]
            let ftIndex = 0
            const objects: Obj[] = globalState.gMap?.getObjects?.() ?? []
            for (const obj of objects.slice()) {
                const c = obj as any
                if (c.type !== 'critter' || c.pid !== pid || c.dead || c.visible === false) {continue}
                if ((c.animCode ?? 0) >= ANIM_FALL_BACK_SF) {continue}
                regAnimClear(c)
                if (deathFrame === 0) {
                    this.destroy_object(c)
                } else if (deathFrame === 1) {
                    let anim = correctDeath(c, ftList[ftIndex], true)
                    if (anim === ANIM_FALL_BACK) {anim = ANIM_FALL_BACK_SF}
                    else if (anim === ANIM_FALL_FRONT) {anim = ANIM_FALL_FRONT_SF}
                    scriptKillCritter(c, anim)
                    ftIndex = (ftIndex + 1) % ftList.length
                } else if (deathFrame >= ANIM_FALL_BACK_SF && deathFrame <= 63) {
                    scriptKillCritter(c, deathFrame)
                } else {
                    scriptKillCritter(c, ANIM_FALL_BACK_SF)
                }
            }
        }
        /** critter_rm_trait(obj, kind, param, value): removes a perk entirely; returns −1. */
        critter_rm_trait(obj: Obj, kind: number, param: number, _value: number) {
            if (!isGameObject(obj) || obj.type !== 'critter') {return -1}
            if (kind === 0) {
                const ranks = (obj as any).perkRanks
                if (ranks && typeof ranks === 'object') {delete ranks[param]}
            }
            return -1
        }
        /** inven_unwield (0x812C) unwields the script's own critter. */
        inven_unwield_self() {
            if (this.self_obj) {this.inven_unwield(this.self_obj as Obj)}
        }
        game_difficulty() {
            return globalState.gameDifficulty ?? 1
        }
        combat_difficulty() {
            return globalState.combatDifficulty ?? 1
        }
        /** running_burning_guy preference (on by default). */
        running_burning_guy() {
            return 1
        }
        game_ui_is_disabled() {
            return globalState.gameUIDisabled ? 1 : 0
        }
        /** _op_anim_action_frame: the action frame of the object's art for that animation. */
        anim_action_frame(obj: Obj, anim: number) {
            if (!isGameObject(obj)) {return 0}
            const o = obj as any
            const art = o.type === 'critter' ? critterArt(o, anim) : o.art
            return (art && globalState.imageInfo?.[art]?.actionFrame) ?? 0
        }
        reg_anim_animate_reverse(obj: Obj, anim: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimAnimateReversed(obj, anim, delay)
        }
        reg_anim_obj_run_to_tile(obj: Obj, tileNum: number, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimRunToTile(obj, tileNum, delay)
        }
        reg_anim_obj_move_to_obj(obj: Obj, target: Obj, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimMoveToObject(obj, target, delay)
        }
        reg_anim_obj_run_to_obj(obj: Obj, target: Obj, delay: number) {
            if (regAnimBlocked() || !isGameObject(obj)) {return}
            regAnimRunToObject(obj, target, delay)
        }
        /** opRegAnimPlaySfx: a sound step (allowed in combat too). */
        reg_anim_play_sfx(obj: Obj, name: string, delay: number) {
            if (!isGameObject(obj)) {return}
            regAnimPlaySfx(obj, typeof name === 'string' ? name : '', delay)
        }
        /** opAnimateStandReverse: the stand animation played backwards, outside combat. */
        animate_stand_reverse_obj(obj: Obj) {
            const target: any = isGameObject(obj) ? obj : this.self_obj
            if (!isGameObject(target) || globalState.inCombat) {return}
            regAnimBegin(ANIMATION_REQUEST_UNRESERVED)
            regAnimAnimateReversed(target, ANIM_STAND, 0)
            regAnimEnd()
        }
        make_daytime() {}
        /** scripts_request_world_map: leave for the world map. */
        world_map() {
            EventBus.emit('ui:openPanel', { panelName: 'worldMap' })
        }
        dialogue_reaction(_reaction: number) {}
        /** opSetMapMusic (wmSetMapMusic): the map's music; restarted at once on the current map. */
        set_map_music(mapID: number, name: string) {
            if (mapID === -1 || typeof name !== 'string') {return}
            let ok = false
            try {
                ok = setMapMusic(mapID, name)
            } catch {
                ok = false
            }
            if (ok && mapID === currentMapID && globalState.audioEngine) {
                globalState.audioEngine.stopAll()
                globalState.audioEngine.playMusic(name.trim().toLowerCase())
            }
        }
        /** opSfxBuild*Name: sound effect file names, built as game_sound.cc does. */
        sfx_build_open_name(obj: Obj, action: number) {
            return isGameObject(obj) ? sfxOpenName(obj, action) : 0
        }
        sfx_build_char_name(obj: Obj, anim: number, extra: number) {
            return isGameObject(obj) ? (sfxCharName(obj, anim, extra) ?? 0) : 0
        }
        sfx_build_ambient_name(name: string) {
            return sfxAmbientName(name)
        }
        sfx_build_interface_name(name: string) {
            return sfxInterfaceName(name)
        }
        /** The engine builds item sounds with the interface-sound name. */
        sfx_build_item_name(name: string) {
            return sfxInterfaceName(name)
        }
        sfx_build_weapon_name(effectType: number, weapon: Obj, hitMode: number, target: Obj) {
            return sfxWeaponName(effectType, weapon, hitMode, isGameObject(target) ? target : null)
        }
        sfx_build_scenery_name(name: string, action: number, actionType: number) {
            return sfxSceneryName(actionType, action, name)
        }
        /**
         * destroy_mult_objs(obj, count): take up to `count` of the item out of
         * whoever carries it and return how many went; an item on the ground
         * is destroyed and 0 is returned.
         */
        destroy_mult_objs(obj: Obj, count: number) {
            if (!isGameObject(obj)) {return 0}
            const carriers: any[] = [this.self_obj, globalState.player, ...(globalState.gMap?.getObjects?.() ?? [])]
            for (const owner of carriers) {
                if (!owner || !Array.isArray(owner.inventory)) {continue}
                if (!owner.inventory.includes(obj)) {continue}
                const have = typeof (obj as any).amount === 'number' ? (obj as any).amount : 1
                const n = Math.max(0, Math.min(have, count))
                return this.rm_mult_objs_from_inven(owner, obj, n) ?? n
            }
            this.destroy_object(obj)
            return 0
        }
        endgame_slideshow() {
            signalEndGame(0, globalVars, { play: true })
        }
        /** endgame_movie: the credits roll (endgamePlayMovie). */
        /** endgamePlayMovie: the credits roll over the "akiss" music. */
        endgame_movie() {
            globalState.audioEngine?.playMusic?.('akiss')
            EventBus.emit('ui:openPanel', { panelName: 'credits' })
        }
        /** jam_lock(obj): a jammed lock stays shut until it is reset. */
        jam_lock(obj: Obj) {
            if (isGameObject(obj)) {(obj as any).lockJammed = true}
        }

        /** opAnimateStand: the object (or the script's own) stands, outside combat. */
        animate_stand_obj(obj: Critter) {
            const target: any = isGameObject(obj) ? obj : this.self_obj
            if (!isGameObject(target) || globalState.inCombat) {return}
            regAnimBegin(ANIMATION_REQUEST_UNRESERVED)
            regAnimAnimate(target, ANIM_STAND, 0)
            regAnimEnd()
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

            // opExplosion: 1 to `damage` (0 to 0 for a harmless blast), blamed on no one.
            if (tile === -1) {return}
            const maxDamage = typeof damage === 'number' && isFinite(damage) ? damage : 0
            actionExplode(fromTileNum(tile), maxDamage === 0 ? 0 : 1, maxDamage, null)
        }

        /** opGameFadeOut: any non-zero argument fades to black at the engine's fixed speed. */
        gfade_out(value: number) {
            if (value) {fadeOut()}
        }
        /** opGameFadeIn: any non-zero argument fades back in at the engine's fixed speed. */
        gfade_in(value: number) {
            if (value) {fadeIn()}
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
            // BLK-175: Remove ALL timer events matching this object — the original code
            // used break after the first match.  Temple of Trials dart-trap scripts add
            // multiple timer events to the same trap object (one per patrol pass); only
            // removing the first left stale events that would fire after the trap was
            // already cleared, producing phantom damage ticks on the player.  Iterate
            // in reverse so splice indices stay valid after each removal.
            for (let i = timeEventList.length - 1; i >= 0; i--) {
                const timedEvent = timeEventList[i]
                // queueRemoveEvents(object): that object's events, not every object with its pid.
                if (timedEvent.obj === obj) {
                    info('removing timed event for obj')
                    timeEventList.splice(i, 1)
                }
            }
        }
        game_ticks(seconds: number) {
            return Math.max(0, seconds) * 10
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
            // Slice G: process due timed events + chem clocks (no rest healing).
            advanceGameTime(ticks, { heal: false, tickEffects: true, requireOutOfCombat: false })
        }

        set_sfall_global(name: string | number, value: number): void {
            if (setSfallGlobalAny(name, value) !== 0) {
                warn('set_sfall_global() - the name of the global variable must consist of 8 characters.', undefined, this)
            }
        }
        get_sfall_global_int(nameOrIndex: string | number): number {
            return getSfallGlobalAny(nameOrIndex)
        }
        get_sfall_global_float(nameOrIndex: string | number): number {
            return rawToFloat(getSfallGlobalAny(nameOrIndex))
        }
        set_sfall_global_int(index: number, value: number): void {
            setSfallGlobalInt(index, value)
        }

        // sfall extended opcodes — PC/critter stat helpers
        get_pc_base_stat(stat: number): number {
            const player = globalState.player
            if (!player) {return 0}
            const statName = statMap[stat]
            if (!statName) {
                warn('get_pc_base_stat: unknown stat number: ' + stat, undefined, this)
                return 0
            }
            return player.stats.getBase(statName)
        }
        set_pc_base_stat(stat: number, value: number): void {
            const player = globalState.player
            if (!player) {return}
            const statName = statMap[stat]
            if (!statName) {
                warn('set_pc_base_stat: unknown stat number: ' + stat, undefined, this)
                return
            }
            // BLK-205: Guard against non-finite values — Arroyo character-creation
            // scripts compute SPECIAL stat values from formulas that can yield NaN
            // when an uninitialised multiplier or divisor is used.  Storing NaN via
            // setBase() corrupts the player's stat table and makes all derived stats
            // (AC, AP, carry weight, …) return NaN for the rest of the session.
            // Clamp to 0 and warn so the underlying script bug is visible in logs.
            if (typeof value !== 'number' || !isFinite(value)) {
                warn('set_pc_base_stat: non-finite value (' + value + ') for stat ' + statName + ' — clamping to 0', undefined, this)
                value = 0
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
        /** get_npc_level(name or pid): how many levels the party member has gone up; -1 if not in the party. */
        get_npc_level(who: unknown): number {
            const party: any = globalState.gParty
            const members: any[] = party?.getPartyMembers?.() ?? []
            const member = members.find((m) => typeof who === 'number'
                ? m.pid === who
                : String(m.name ?? '').toLowerCase() === String(who ?? '').toLowerCase())
            if (!member || (typeof who !== 'number' && !who)) {return -1}
            return party.getControl?.(member)?.levelIndex ?? -1
        }
        get_critter_current_ap(obj: Obj): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_current_ap: not a critter: ' + obj, undefined, this)
                return 0
            }
            const critter = obj as Critter
            return critter.AP ? critter.AP.combat : 0
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
            (obj as Critter).stats.setBase(statName, value)
        }

        // sfall extended opcodes — kill count helpers (0x8170–0x8171)
        get_critter_kills(killType: number): number {
            // Return the number of kills of the given kill-type recorded on the
            // player.  Kill types are the KILL_TYPE_* constants (0 = men,
            // 3 = super mutants, 4 = ghouls, …).  The counts are stored on
            // globalState so they survive map transitions within a session.
            const counts = globalState.critterKillCounts
            if (!counts) {return 0}
            return counts[killType] ?? 0
        }
        set_critter_kills(killType: number, amount: number): void {
            // Overwrite the kill count for the given kill type.
            if (!globalState.critterKillCounts) {
                (globalState as any).critterKillCounts = {}
            }
            // BLK-196: Guard against non-finite amount — Math.max(0, NaN) = NaN, which
            // would store NaN in the kill-count table and corrupt subsequent comparisons.
            // Arroyo temple completion scripts call set_critter_kills to award kill-type
            // credit after boss encounters; a broken formula can yield NaN.  Clamp to 0.
            const safeAmount = (typeof amount === 'number' && isFinite(amount)) ? Math.max(0, Math.trunc(amount)) : 0
            globalState.critterKillCounts[killType] = safeAmount
        }

        // sfall extended opcodes — substring extraction (0x8176)
        /** substr(str, start, len) (Utils.cpp SubString): negatives count from the end. */
        substr(str: string, start: number, len: number): string {
            const text = String(str ?? '')
            const n = text.length
            let pos = Math.trunc(start) || 0
            let length = Math.trunc(len) || 0
            if (pos < 0) {pos = Math.max(0, pos + n)}
            if (length < 0) {
                length += n - pos
                if (length === 0) {return ''}
                length = Math.abs(length)
            }
            if (pos >= n) {return ''}
            if (length === 0 || length + pos > n) {length = n - pos}
            return text.substr(pos, length)
        }

        // sfall extended opcodes — session uptime (0x8177)
        get_uptime(): number {
            // Returns milliseconds since the page was loaded.  Used by scripts
            // that want to measure real-world elapsed time (e.g. anti-exploit timers).
            return typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0
        }


        // sfall extended opcode — C-style single-argument string format (0x8192).
        // sprintf(format, arg) → formatted string.
        // Supports: %d/%i (decimal int), %s (string), %x (hex int), %c (char), %% (literal %).
        // This is one of the most commonly used sfall opcodes; many scripts use it for
        // display messages, UI labels, and debug output.
        /** sprintf(format, value): sfall's sprintf_lite with one value. */
        sprintf(fmt: any, arg: any): string {
            return sfallSprintf(fmt, [arg])
        }

        /**
         * get_tile_fid(tile | elevation << 24 | mode << 28): the floor square's
         * art number, the roof's (mode 1), or both as the map stores them
         * (mode 2: roof << 16 | floor).
         */
        get_tile_fid(tileAndElev: number): number {
            const tile = tileAndElev & 0xffffff
            const elevation = (tileAndElev >> 24) & 0x0f
            const mode = tileAndElev >>> 28
            if (tile >= 40000 || elevation > 2) {return 0}
            const floor = getTileIndex(tile, elevation, 'floor') & 0x3fff
            const roof = getTileIndex(tile, elevation, 'roof') & 0x3fff
            if (mode === 1) {return roof}
            if (mode === 2) {return ((roof << 16) | floor) | 0}
            return floor
        }

        // sfall extended opcode — set tile FID at tile/elevation (0x8195).
        // set_tile_fid(tile, elevation, fid) — override the floor tile art name in
        // the live map object so subsequent get_tile_fid calls observe the change.
        // The WebGL renderer may not re-upload tile textures until a map refresh;
        // script/map state is updated immediately (partial rendering parity).
        set_tile_fid(tile: number, elevation: number, fid: number): void {
            log('set_tile_fid', arguments, 'tiles')
            setTileFID(tile, elevation, fid)
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
            if (c.dead)             {flags |= 0x0001}  // CRITTER_FLAG_DEAD
            if (c.knockedOut)       {flags |= 0x0002}  // CRITTER_FLAG_KNOCKED_OUT
            if (c.knockedDown)      {flags |= 0x0004}  // CRITTER_FLAG_KNOCKED_DOWN
            if (c.crippledLeftLeg)  {flags |= 0x0008}  // CRITTER_FLAG_CRIPPLED_LEFT_LEG
            if (c.crippledRightLeg) {flags |= 0x0010}  // CRITTER_FLAG_CRIPPLED_RIGHT_LEG
            if (c.crippledLeftArm)  {flags |= 0x0020}  // CRITTER_FLAG_CRIPPLED_LEFT_ARM
            if (c.crippledRightArm) {flags |= 0x0040}  // CRITTER_FLAG_CRIPPLED_RIGHT_ARM
            if (c.blinded)          {flags |= 0x0080}  // CRITTER_FLAG_BLINDED
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
            if (!weapon.extra) {weapon.extra = {}}
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
            if (!weapon.extra) {weapon.extra = {}}
            weapon.extra.ammoLoaded = Math.max(0, count)
        }

        // sfall extended opcode — current game mode bitmask (0x817E).
        // Returns a bitmask encoding the current engine state:
        //   0x01 = combat is active
        //   0x02 = dialogue is active
        //   0x04 = world map is open
        //   0x08 = barter mode is active
        // Scripts use this to gate combat-only or dialogue-only code paths.
        /** get_game_mode: sfall's loop flags (LoadGameHook.h LoopFlag) for the screens open now. */
        get_game_mode(): number {
            const ui: any = globalState.uiManager
            const open = (name: string): boolean => ui?.tryGet?.(name)?.visible === true
            let mode = 0
            if (globalState.uiMode === UIMode.worldMap || open('worldMap')) {mode |= 0x1}
            if (currentDialogueObject !== null || open('dialogue')) {mode |= 0x4}
            if (open('options')) {mode |= 0x8}
            if (open('saveLoad')) {mode |= ui.tryGet('saveLoad').isSave ? 0x10 : 0x20}
            if (globalState.inCombat) {
                mode |= 0x40
                if (globalState.combat?.inPlayerTurn) {mode |= 0x800}
            }
            if (open('characterScreen')) {mode |= 0x200}
            if (open('pipboy')) {mode |= 0x400}
            if (open('inventory')) {mode |= 0x1000}
            if (open('mapViewer')) {mode |= 0x2000}
            if (open('skilldex')) {mode |= 0x4000}
            if (open('loot')) {mode |= 0x10000}
            if (open('barter')) {mode |= 0x20000}
            return mode
        }

        /** set_global_script_repeat(frames): how often this global script runs; -1 flips its type. */
        set_global_script_repeat(frames: number): void {
            setGlobalScriptRepeat(this, frames)
        }
        available_global_script_types(): number {
            return AVAILABLE_GLOBAL_SCRIPT_TYPES
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
            // BLK-159: Guard against non-finite value — New Reno quest reward scripts
            // sometimes compute skill values from combat math (damage offsets, level
            // formulas) that may produce NaN or Infinity.  Storing a non-finite value
            // corrupts the SkillSet and causes every subsequent skill read on this
            // critter to return NaN.  Mirror the guard from BLK-129 (set_global_var):
            // clamp non-finite values to 0 and emit a warning.
            if (!Number.isFinite(value)) {
                warn('set_critter_skill_points: non-finite value (' + value + ') — clamping to 0')
                value = 0
            }
            // BLK-184: Guard against null critter.skills — mirrors BLK-183 (critter_mod_skill).
            // Arroyo NPC initialization scripts call set_critter_skill_points() on freshly
            // spawned critters before the skills component is attached; without this guard,
            // skills.setBase() throws TypeError and halts the entire NPC initialization.
            if (!(obj as Critter).skills) {
                warn('set_critter_skill_points: critter.skills is null — no-op', undefined, this)
                return
            }
            (obj as Critter).skills.setBase(skillName, value)
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
            (obj as Critter).stats.setBase('HP', Math.max(0, hp))
        }

        /** opGetTileInDirection: -1 for no tile, a rotation out of range, a zero distance, or off the map. */
        /**
         * opGetTileInDirection (tileGetTileInDirection): step `count` hexes, stopping
         * at the map's edge. -1 for no tile, a rotation out of range or a zero
         * distance; a negative distance stays put.
         */
        tile_num_in_direction(tile: number, dir: number, count: number): number {
            if (!Number.isFinite(tile) || tile === -1 || !isValidTileNum(tile)) {return -1}
            if (!Number.isInteger(dir) || dir < 0 || dir >= 6 || !Number.isFinite(count) || count === 0) {return -1}
            let hex = fromTileNum(tile)
            for (let i = 0; i < count; i++) {
                if (hex.x === 0 || hex.x === 199 || hex.y === 0 || hex.y === 199) {break}
                hex = hexInDirection(hex, dir)
            }
            return toTileNum(hex)
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
            if (critter.AP) {critter.AP.combat = Math.max(0, ap)}
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
            // opLoadMap: the entrance goes to GVAR_LOAD_MAP_INDEX for the new map's script.
            if (typeof map === 'string') {
                globalVars[GVAR_LOAD_MAP_INDEX] = startLocation
                globalState.gMap.loadMap(map.split('.')[0].toLowerCase())
            } else if (typeof map === 'number' && map >= 0) {
                globalVars[GVAR_LOAD_MAP_INDEX] = startLocation
                globalState.gMap.loadMapByID(map)
            }
        }
        play_gmovie(movieID: number) {
            // P1-9: resolve FO2 movie ID, emit movie:play / optional cinematic placeholder.
            playMovie(typeof movieID === 'number' ? movieID : 0)
            log('play_gmovie', arguments)
        }
        mark_area_known(areaType: number, area: number, markState: number) {
            // BLK-213: Guard against non-finite area ID — Arroyo and Temple completion
            // scripts compute the area index from quest-flag arithmetic that can yield
            // NaN when a prerequisite global variable was never initialised.  Passing
            // NaN to globalState.markAreaKnown() would create a mapAreas[NaN] entry,
            // silently corrupting the world-map discovery state.  Drop the call and
            // warn so the underlying script bug is visible in logs.
            if (typeof area !== 'number' || !isFinite(area)) {
                warn('mark_area_known: non-finite area ID (' + area + ') — no-op', undefined, this)
                return
            }
            if (areaType === 0) {
                // MARK_TYPE_TOWN
                if (markState === -66) {
                    // MARK_STATE_INVISIBLE — hide the area
                    if (globalState.markAreaKnown) {globalState.markAreaKnown(area, 0)}
                } else {
                    // opMarkAreaKnown: any state but invisible shows the town
                    // (wmAreaSetVisibleState(area, 1)); state 0 leaves it unvisited.
                    if (globalState.markAreaKnown) {globalState.markAreaKnown(area, markState === 0 ? 1 : markState)}
                    else {log('mark_area_known', arguments)}
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
        /** opWorldmapCitySetPos (wmAreaSetWorldPos): move a town on the world map. */
        wm_area_set_pos(area: number, x: number, y: number) {
            const town = globalState.mapAreas?.[area]
            if (!town || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {return}
            town.worldPosition = { x, y }
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
            if (!globalState.audioEngine) {return}
            globalState.audioEngine.playSfx(sfx)
        }

        // party
        party_member_obj(pid: number) {
            log('party_member_obj', arguments, 'party')
            // BLK-067: Guard against null gParty to prevent crash during early init
            // or when tests run without a full game-state setup.
            if (!globalState.gParty) {return 0}
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
            // Apply any tiers already owed for the current player level.
            const pl = globalState.player as any
            if (pl && typeof pl.level === 'number') {
                globalState.gParty.applyLevelTiersForPlayerLevel(pl.level)
            }
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

        /**
         * get_ini_setting("file|section|key"): the number there, -1 when it is
         * missing or the name is malformed. fallout2.cfg answers from the live
         * options, as the game keeps it in memory.
         */
        get_ini_setting(setting: string): number {
            const parsed = parseIniSetting(setting)
            if (!parsed) {return -1}
            if (parsed.file.toLowerCase() === 'fallout2.cfg') {
                const name = (parsed.section + '.' + parsed.key).toLowerCase()
                const live = iniOverride(name)
                if (live !== undefined) {return live}
                if (Object.prototype.hasOwnProperty.call(INI_SETTING_DEFAULTS, name)) {return INI_SETTING_DEFAULTS[name]}
            }
            return iniInt(parsed.file, parsed.section, parsed.key, -1)
        }
        /** get_ini_string("file|section|key"): the text there ("" when missing), -1 for a malformed name. */
        get_ini_string(setting: string): string | number {
            const parsed = parseIniSetting(setting)
            if (!parsed) {return -1}
            return iniString(parsed.file, parsed.section, parsed.key) ?? ''
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

        // sfall extended opcode — teleport world-map cursor to (x, y) (0x819E).
        set_world_map_pos(x: number, y: number): void {
            log('set_world_map_pos', arguments)
            // BLK-171: Guard against non-finite coordinates — arroyo exit scripts
            // compute the world map destination from tile arithmetic; a broken formula
            // produces NaN or Infinity which would corrupt globalState.worldPosition and
            // break all subsequent world map navigation (travel, encounter rolls, area
            // detection).  No-op and warn when either coordinate is not a finite number.
            if (typeof x !== 'number' || !isFinite(x) || typeof y !== 'number' || !isFinite(y)) {
                warn('set_world_map_pos: non-finite coordinates (' + x + ', ' + y + ') — no-op', undefined, this)
                return
            }
            globalState.worldPosition = { x, y }
        }

        // sfall extended opcode — 1 if the player is currently on the world map (0x819F).
        // Partial: returns 1 when no map is loaded (between maps), 0 otherwise.
        in_world_map(): number {
            return !globalState.gMap || !globalState.gMap.name ? 1 : 0
        }

        // sfall extended opcode — get a string value from the mod's INI configuration (0x81A3).
        // Partial: no INI file system in browser build; returns empty string.

        /** set_global_script_type(type): 0 main loop, 1 input loop, 2 world map, 3 main loop and world map. */
        set_global_script_type(type: number): void {
            setGlobalScriptType(this, type)
        }

        // sfall extended opcode — get in-game calendar year (0x81A5).
        // The engine calendar (gameTimeGetDate): starts 25 July 2241, real month lengths.
        get_year(): number {
            return gameDate(globalState.gameTickTime).year
        }

        // sfall extended opcode — get in-game calendar month (0x81A6).
        // Returns 1–12.
        get_month(): number {
            return gameDate(globalState.gameTickTime).month
        }

        // sfall extended opcode — get in-game calendar day of month (0x81A7).
        // Returns 1–31.
        get_day(): number {
            return gameDate(globalState.gameTickTime).day
        }

        // Phase 51 — sfall extended opcodes 0x81B6–0x81BD

        // Phase 52 — sfall extended opcodes 0x81BE–0x81C5

        // sfall 0x81C1 — get_sfall_arg_at(idx):
        // BLK-123 (Phase 78): Returns the hook-script arg at the given zero-based index.
        get_sfall_arg_at(idx: number): number {
            if (typeof idx !== 'number' || idx < 0 || idx >= _sfallHookArgs.length) {return 0}
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
            if (obj && typeof obj === 'object') {
                return Lightmap.getObjectReceivedLight(obj as Obj)
            }
            return globalState.ambientLightLevel ?? 65536
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
            if (ui === UIMode.worldMap) {
                mode |= 0x20 // world-map mode — no normal-map bit
            } else {
                mode |= 0x01 // on a normal map
                if (globalState.inCombat) {mode |= 0x02}
                if (ui === UIMode.dialogue) {mode |= 0x04}
                if (ui === UIMode.barter) {mode |= 0x08}
                if (ui === UIMode.inventory) {mode |= 0x10}
            }
            if (mode === 0) {mode = 0x01} // fallback: normal mode
            return mode
        }

        // Phase 54 — sfall 0x81D4 — obj_is_disabled_sfall(obj):
        // Returns 1 if the object's AI / script is disabled, 0 otherwise.
        // Checks the scriptDisabled flag on the object.
        obj_is_disabled_sfall(obj: Obj): number {
            log('obj_is_disabled_sfall', arguments)
            if (!isGameObject(obj)) {return 0}
            return (obj as any).scriptDisabled ? 1 : 0
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

        // sfall 0x81E2 — get_critter_attack_mode_sfall(obj):
        // Return the critter's current attack-mode index (0=unarmed, 1=melee, 2=ranged).
        // Reads from attackModeOverride (set by 0x81E3), then falls back to the
        // equipped weapon's primary attack mode.
        get_critter_attack_mode_sfall(obj: Obj): number {
            log('get_critter_attack_mode_sfall', arguments)
            if (!isGameObject(obj) || (obj as any).type !== 'critter') {return 0}
            // Check per-critter override first
            const override = (obj as any).attackModeOverride
            if (typeof override === 'number' && override >= 0 && override <= 2) {return override}
            // Fall back to equipped weapon
            const critter = obj as Critter
            const weaponObj = critter.equippedWeapon
            if (!weaponObj || !weaponObj.pro || !weaponObj.pro.extra) {return 0}
            const attackMode = weaponObj.pro.extra.attackMode
            const primaryMode = (attackMode ?? 0) & 0x0f
            // 0=none, 1=punch, 2=kick → unarmed(0)
            if (primaryMode <= 2) {return 0}
            // 3=swing, 4=thrust → melee(1)
            if (primaryMode <= 4) {return 1}
            // 5=throw, 6=fire single, 7=fire burst, 8=flame → ranged(2)
            return 2
        }

        // sfall 0x81E3 — set_critter_attack_mode_sfall(obj, mode):
        // Set the critter's attack-mode index (0=unarmed, 1=melee, 2=ranged).
        // Stored as attackModeOverride; cleared on next AP reset.
        set_critter_attack_mode_sfall(obj: Obj, mode: number): void {
            log('set_critter_attack_mode_sfall', arguments)
            if (!isGameObject(obj) || (obj as any).type !== 'critter') {return}
            ;(obj as any).attackModeOverride = (mode >= 0 && mode <= 2) ? mode : 0
        }

        // sfall 0x81E5 — get_script_type_sfall():
        // Return the type of the currently executing script (0=map, 1=critter/NPC,
        // 2=item, 3=scenery, 4=door, 5=container).  Browser build: returns 0.
        get_script_type_sfall(): number {
            log('get_script_type_sfall', arguments)
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

        // sfall 0x81EC — get_combat_difficulty_sfall():
        // Return the current combat difficulty as an integer:
        //   0 = Easy, 1 = Normal (default), 2 = Hard.
        // Phase 89: upgraded from hardcoded 1 to read globalState.combatDifficulty,
        // which is also written by set_combat_difficulty_sfall (0x82D5).
        get_combat_difficulty_sfall(): number {
            log('get_combat_difficulty_sfall', arguments)
            return globalState.combatDifficulty
        }

        // sfall 0x81EF — set_tile_fid_sfall(tile, elev, fid):
        // Override the floor tile FID at the given tile/elevation (same as 0x8195).
        set_tile_fid_sfall(tile: number, elev: number, fid: number): void {
            log('set_tile_fid_sfall', arguments)
            setTileFID(tile, elev, fid)
        }

        // -----------------------------------------------------------------------
        // Phase 58 — sfall extended opcodes 0x81F0–0x81F7
        // -----------------------------------------------------------------------

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
                if (typeof hp === 'number' && isFinite(hp)) {return hp}
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

        // -----------------------------------------------------------------------
        // Phase 60 — sfall extended opcodes 0x8200–0x8207
        // -----------------------------------------------------------------------

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

        // -----------------------------------------------------------------------
        // Phase 62 — sfall extended opcodes 0x8210–0x8217
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 63 — sfall extended opcodes 0x8218–0x821F
        // -----------------------------------------------------------------------

        // sfall 0x821C — get_critter_kill_type_sfall(obj):
        // Return the kill-type constant for a critter (used for XP and kill counts).
        // 0=men, 1=women, 2=children, 3=super mutants, …
        // Alias of the Phase-58 opcode 0x81F4; reads from pro.extra.killType.
        // Note: this method is already defined in Phase 58 at 0x81F4; the 0x821C
        // opcode entry in vm_bridge.ts is a second binding to the same function.

        // -----------------------------------------------------------------------
        // Phase 64 — sfall extended opcodes 0x8220–0x8227
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 65 — sfall extended opcodes 0x8228–0x822F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 66 — sfall extended opcodes 0x8230–0x8237
        // -----------------------------------------------------------------------

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
            if (globalState.inCombat && critter.AP) {return critter.AP.combat}
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
            if (critter.AP) {critter.AP.combat = Math.max(0, ap)}
        }

        // -----------------------------------------------------------------------
        // Phase 67 — sfall extended opcodes 0x8238–0x823F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 68 — sfall extended opcodes 0x8240–0x8247
        // -----------------------------------------------------------------------

        // sfall 0x8243 — set_combat_free_move_sfall(obj, tiles):
        // Set the number of free tile-moves available to a critter this turn.
        // Stored as combatFreeMove on the script object.
        set_combat_free_move_sfall(obj: Obj, tiles: number): void {
            log('set_combat_free_move_sfall', arguments)
            if (!isGameObject(obj) || (obj as any).type !== 'critter') {return}
            ;(obj as any).combatFreeMove = isFinite(tiles) ? Math.max(0, Math.floor(tiles)) : 0
        }

        // ---------------------------------------------------------------------------
        // Phase 69 — sfall extended opcodes 0x8248–0x824F
        // ---------------------------------------------------------------------------

        // ---------------------------------------------------------------------------
        // Phase 70 — sfall extended opcodes 0x8250–0x8257
        // ---------------------------------------------------------------------------

        // sfall 0x8253 — get_combat_target_sfall(obj):
        // Return the current combat target of a critter, or 0 when not in combat /
        // no target is set.  Used by AI and scripted combat hooks to check targeting.
        get_combat_target_sfall(obj: Obj): Obj | number {
            if (!isGameObject(obj) || obj.type !== 'critter') {return 0}
            return (obj as any).combatTarget ?? (obj as any)._combatTarget ?? 0
        }

        // sfall 0x8254 — set_combat_target_sfall(obj, target):
        // Assign a specific combat target to a critter.  Browser build: stores the
        // target reference on the critter object so get_combat_target_sfall() reads it.
        set_combat_target_sfall(obj: Obj, target: Obj | number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {return
            ;}(obj as any).combatTarget = isGameObject(target) ? target : null
            log('set_combat_target_sfall', arguments)
        }

        // sfall 0x8256 — get_attack_type_sfall(obj, slot):
        // Return the active attack mode/type for a critter.  slot: 0=primary,
        // 1=secondary.  Returns the raw attack mode nibble from equipped weapon.
        get_attack_type_sfall(obj: Obj, slot: number): number {
            if (!isGameObject(obj) || (obj as any).type !== 'critter') {return 0}
            const critter = obj as Critter
            const weaponObj = critter.equippedWeapon
            if (!weaponObj || !weaponObj.pro || !weaponObj.pro.extra) {return 0}
            const attackMode = weaponObj.pro.extra.attackMode ?? 0
            if (slot === 1) {
                // Secondary attack — upper nibble
                return (attackMode >> 4) & 0x0f
            }
            // Primary attack — lower nibble
            return attackMode & 0x0f
        }

        // -----------------------------------------------------------------------
        // Phase 71 — sfall extended opcodes 0x8258–0x825F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 72 — sfall extended opcodes 0x8260–0x8267
        // -----------------------------------------------------------------------

        // sfall 0x8260 — get_critter_weapon (second opcode alias):
        // Opcode alias — the implementation lives in the Phase-52 section above
        // (search for 0x81BE, method get_critter_weapon).  vm_bridge.ts maps both
        // opcodes to the same method; no separate definition is needed here.

        // sfall 0x8262 — get_object_type_sfall (second opcode alias):
        // Opcode alias — implementation is in the Phase-58 section (search for 0x81F6).

        // sfall 0x8263 — get_critter_team (second opcode alias):
        // Opcode alias — implementation is in the Phase-52 section (search for 0x81C4).

        // sfall 0x8264 — set_critter_team (second opcode alias):
        // Opcode alias — implementation is in the Phase-52 section (search for 0x81C5).

        // -----------------------------------------------------------------------
        // Phase 73 — sfall extended opcodes 0x8268–0x826F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 74 — sfall extended opcodes 0x8270–0x8277
        // -----------------------------------------------------------------------

        // sfall 0x8273 is an alias of get_combat_difficulty_sfall() (0x81EC) —
        // see the vm_bridge.ts registration; no new method body is needed here.

        // -----------------------------------------------------------------------
        // Phase 75 — sfall extended opcodes 0x8278–0x827F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 76 — sfall extended opcodes 0x8280–0x8287
        // -----------------------------------------------------------------------

        // Phase 77 — sfall extended opcodes 0x8288–0x828F
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 80 — sfall extended opcodes 0x8290–0x8297
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 81 — sfall extended opcodes 0x8298–0x829F
        // -----------------------------------------------------------------------

        // sfall 0x8299 / 0x831B — set_critter_extra_stat_sfall(obj, statId, val):
        // Set a temporary extra-stat modifier on a critter. Stores the value in both
        // critter.extraStats (by ID for backwards compatibility) and critter._extraStats
        // (by stat name for dynamic integration with getStat).
        set_critter_extra_stat_sfall(obj: Obj, statId: number, val: number): void {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('set_critter_extra_stat_sfall: not a critter: ' + obj, undefined, this)
                return
            }
            if (typeof val !== 'number' || !isFinite(val)) {
                warn('set_critter_extra_stat_sfall: non-finite val (' + val + ') — clamping to 0', undefined, this)
                val = 0
            }
            const critter = obj as any
            if (!critter.extraStats) {critter.extraStats = {}}
            critter.extraStats[statId] = val

            const statName = statMap[statId]
            if (statName) {
                if (!critter._extraStats) {critter._extraStats = {}}
                critter._extraStats[statName] = Math.trunc(val)
            }
        }

        // -----------------------------------------------------------------------
        // Phase 82 — sfall extended opcodes 0x82A0–0x82A7
        // -----------------------------------------------------------------------

        // sfall 0x82A5 — alias of 0x8235 get_critter_max_ap_sfall (already defined above).
        // The vm_bridge maps both 0x8235 and 0x82A5 to the same method.

        // -----------------------------------------------------------------------
        // Phase 83 — sfall extended opcodes 0x82A8–0x82AF
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 84 — sfall extended opcodes 0x82B0–0x82B7
        // New Reno utility: inventory count, AP, carry weight, script metadata,
        // knockout state, and combat turn tracking.
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 86 — sfall extended opcodes 0x82B8–0x82BF
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 87 — sfall extended opcodes 0x82C0–0x82C7
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 89 — sfall extended opcodes 0x82D0–0x82D7
        // Arroyo / Temple of Trials end-sequence polish.
        // -----------------------------------------------------------------------

        // sfall 0x82D2 — get_game_difficulty_sfall():
        // Alias: delegates to the upgraded get_game_difficulty_sfall() implementation
        // already registered at 0x8246.  Both opcodes read globalState.gameDifficulty.

        // sfall 0x82D4 — get_combat_difficulty_sfall():
        // Alias: delegates to the upgraded get_combat_difficulty_sfall() implementation
        // already registered at 0x81EC.  Both opcodes read globalState.combatDifficulty.

        // -----------------------------------------------------------------------
        // Phase 90 — sfall extended opcodes 0x82D8–0x82DF (critter body/weapon/
        // gender and kill-count queries used by Arroyo NPC and temple scripts).
        // Note: 0x82D8 (get_critter_body_type_sfall) and 0x82DE
        // (get_critter_gender_sfall) reuse existing implementations from
        // opcodes 0x8206 and 0x8231 respectively — no new method needed.
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 91 — sfall extended opcodes 0x82E0–0x82E7 (critter heal-rate
        // and sequence queries for Arroyo NPC end-sequence scripts).
        // Note: 0x82E0 (get_critter_poison_sfall) and 0x82E1 (set_critter_poison_sfall)
        // reuse existing implementations from opcodes 0x823A/0x823B.
        // Note: 0x82E2 (get_critter_radiation_sfall) and 0x82E3 (set_critter_radiation_sfall)
        // reuse existing implementations from opcodes 0x8238/0x8239.
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // Phase 92 — sfall extended opcodes 0x82E8–0x82EF (critter level alias,
        // age, kill-type, party count and max-level queries for arroyo end-sequence).
        // -----------------------------------------------------------------------

        // -------------------------------------------------------------------------
        // Phase 93 — sfall extended opcodes 0x82F0–0x82F7 (HP aliases, melee dmg,
        // critical chance).
        // -------------------------------------------------------------------------

        // -------------------------------------------------------------------------
        // Phase 94 — sfall extended opcodes 0x82F8–0x82FF (armor class, damage
        // resist/thresh, action points).
        // -------------------------------------------------------------------------

        // -------------------------------------------------------------------------
        // Phase 95 — sfall extended opcodes 0x8300–0x8307 (critter SPECIAL stats:
        // Perception, Luck, Agility, Charisma — used by Arroyo guard-AI detection
        // scripts and character-creation validation at game start).
        // -------------------------------------------------------------------------

        // -------------------------------------------------------------------------
        // Phase 96 — sfall extended opcodes 0x8308–0x830F (critter SPECIAL stats:
        // Strength, Endurance, Intelligence — completing the full S.P.E.C.I.A.L.
        // setter/getter suite — plus critter level; used by Arroyo village NPC
        // level-scaling and Temple of Trials encounter-balance scripts).
        // -------------------------------------------------------------------------

        // -------------------------------------------------------------------------
        // Phase 97 — sfall extended opcodes 0x8310–0x8317 (critter orientation,
        // tile/elevation queries, base-AP setter, XP-level formula, and base-HP
        // get/set — used by Arroyo NPC placement, end-sequence reward scripts, and
        // the Temple of Trials encounter-balance calculations).
        // -------------------------------------------------------------------------

        // sfall 0x831A — get_critter_extra_stat_sfall(obj, statId): returns derived stat modifier.
        get_critter_extra_stat_sfall(obj: Obj, statId: number): number {
            if (!isGameObject(obj) || obj.type !== 'critter') {
                warn('get_critter_extra_stat_sfall: not a critter: ' + obj, undefined, this)
                return 0
            }
            const statName = statMap[statId]
            if (!statName) {return 0}
            return (obj as any)._extraStats?.[statName] ?? 0
        }




        _serialize(): SerializedScript {
            return { name: this.scriptName, lvars: Object.assign({}, this.lvars) }
        }
    }

    export function deserializeScript(obj: SerializedScript): Script {
        const script = loadScript(obj.name)
        script.lvars = obj.lvars
        // Note: enterMap / updateMap re-firing is handled by the caller
        // (GameMap.loadMap for map scripts, Obj.fromMapObject for object scripts).
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
        if (scriptMessages[name] === undefined) {scriptMessages[name] = {}}

        // parse message file
        const lines = msg.split(/\r|\n/)

        // preprocess and merge lines
        for (let i = 0; i < lines.length; i++) {
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

        for (let i = 0; i < lines.length; i++) {
            // e.g. {100}{}{You have entered a dark cave in the side of a mountain.}
            const m = lines[i].match(/\{(\d+)\}\{.*\}\{(.*)\}/)
            if (m === null) {
                warn('message parsing: skipping invalid line: ' + lines[i])
                continue
            }
            // Decode U+FFFD sentinels (see fixMojibake for rationale).
            scriptMessages[name][parseInt(m[1])] = fixMojibake(m[2])
        }
    }

    export function setMapScript(script: Script) {
        currentMapObject = script
    }

    export function loadScript(name: string): Script {
        info('loading script ' + name, 'load')

        const path = 'data/scripts/' + name.toLowerCase() + '.int'
        const data: DataView = getFileBinarySync(path)
        const reader = new BinaryReader(data)
        //console.log("[%s] loaded %d bytes", name, reader.length)
        const intfile = parseIntFile(reader, name.toLowerCase())

        //console.log("%s int file: %o", name, intfile)

        if (!currentMapObject) {
            // This script is its own map script; common for standalone map entry points.
        }

        reader.seek(0)
        const vm = new ScriptVMBridge.GameScriptVM(reader, intfile)
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
        if (!obj._script || obj._script.use_p_proc === undefined) {return null}

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
        if (!obj._script || obj._script.look_at_p_proc === undefined) {return null}

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
        if (!obj._script || obj._script.description_p_proc === undefined) {return null}

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
        // No-op when the script doesn't define critter_p_proc — the engine never
        // overrides heartbeat in vanilla FO2 scripts that omit the procedure.
        if (!script.critter_p_proc) {return false}

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

    export function spatial(spatialObj: Obj | Spatial, source: Obj) {
        // NOTE: spatials are technically a separate `Spatial` interface
        // (see src/map.ts) but at runtime they're script-bearing and look
        // like Obj for scripting purposes, so we accept both here.
        const script = spatialObj._script
        if (!script) {return} // no script attached — silently ignore
        if (!script.spatial_p_proc) {return} // no spatial_p_proc defined — silently ignore

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
        if (!obj._script || !obj._script.destroy_p_proc) {return null}

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
        if (!obj._script || obj._script.damage_p_proc === undefined) {return null}

        obj._script.self_obj = obj as ScriptableObj
        obj._script.target_obj = target
        obj._script.source_obj = source
        obj._script.fixed_param = isFinite(damage) ? damage : 0
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
        if (!obj._script) {return false} // no script on this object — treat as no-override
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
        if (!obj._script) {return false} // no script — default pickup behaviour applies
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

    /**
     * The target's use_obj_on_p_proc: as _protinst_use_item_on, source_obj is
     * whoever uses the item and obj_being_used_with is the item.
     */
    export function useObjOn(obj: Obj, item: Obj, user: Obj | null = globalState.player): boolean | null {
        if (!obj._script || obj._script.use_obj_on_p_proc === undefined) {return null}

        obj._script.source_obj = (user ?? item) as Obj
        obj._script.target_obj = item as Obj
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
        if (!obj._script || obj._script.push_p_proc === undefined) {return null}

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
        if (!obj._script || obj._script.is_dropping_p_proc === undefined) {return null}

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

    export function combatEvent(
        obj: Obj,
        event: 'turnBegin' | 'hitSucceeded' | 'joinCheck',
        targetObj?: Obj,
        sourceObj?: Obj,
    ): boolean {
        if (!obj._script) {return false} // no script — not a bug; many map objects lack one

        // combat_p_proc fixed_param values the engine sends (combat.cc, combat_ai.cc):
        //   2 = COMBAT_SUBTYPE_HIT_SUCCEEDED — this critter's attack hit (target_obj = defender)
        //   4 = COMBAT_SUBTYPE_TURN          — start of this critter's turn
        //   5 — a critter outside the fight is asked whether it wants in (_combatai_want_to_join)
        let fixed_param: number
        switch (event) {
            case 'hitSucceeded':
                fixed_param = 2
                break
            case 'turnBegin':
                fixed_param = 4
                break
            case 'joinCheck':
                fixed_param = 5
                break
            default:
                console.warn('combatEvent: unknown event ' + event + ' — ignoring')
                return false
        }

        if (!obj._script.combat_p_proc) {return false}

        info('[COMBAT EVENT ' + event + ' (fixed_param=' + fixed_param + ')]')

        obj._script.combat_is_initialized = 1
        obj._script.fixed_param = fixed_param
        obj._script.self_obj = obj as ScriptableObj
        obj._script.game_time = Math.max(1, globalState.gameTickTime)
        obj._script.cur_map_index = currentMapID
        if (targetObj) {obj._script.target_obj = targetObj}
        if (sourceObj) {obj._script.source_obj = sourceObj}
        obj._script._didOverride = false

        // hack so that the procedure is allowed to finish before
        // we actually terminate combat
        let doTerminate: any = false // did combat_p_proc terminate combat?
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

        let updated = 0
        for (let i = 0; i < gameObjects.length; i++) {
            const script = gameObjects[i]._script
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
        runGlobalScriptsAtProc('map_update_p_proc')

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
        runGlobalScriptsAtProc('map_exit_p_proc')
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

        // Record the map entry position for get_map_enter_position_sfall.
        // Uses the player's current tile and the given elevation.
        const playerObj = globalState.player
        if (playerObj?.position) {
            ;(globalState as any)._mapEntryPosition = {
                tile: toTileNum(playerObj.position),
                elevation: elevation,
                rotation: playerObj.orientation ?? 0
            }
        }

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

        // sfall: global scripts start once the new game's first map is in;
        // after that they get map_enter_p_proc like the map script.
        if (globalScriptsPending) {startGlobalScriptsNow()}
        else {runGlobalScriptsAtProc('map_enter_p_proc')}

        if (overrideStartPos) {
            const r = overrideStartPos
            overrideStartPos = null
            return r
        }

        // NOTE: objectEnterMap is fired by the caller (GameMap) for each
        // object/spatial in turn, not from here, so we don't double-fire
        // map_enter_p_proc.

        return null
    }

    let globalScriptsPending = false

    /** A new game is starting: its global scripts start once its first map is in. */
    export function requestGlobalScriptsStart(): void {
        resetSfallState()
        clearGlobalScripts()
        globalScriptsPending = true
    }

    /** InitGlobalScripts: load the sfall global scripts and run their start procedures. */
    export function startGlobalScriptsNow(): void {
        globalScriptsPending = false
        startGlobalScripts((name) => {
            const script = loadScript(name)
            script.self_obj = null as any
            script.cur_map_index = currentMapID ?? 0
            return script
        })
    }

    export function objectEnterMap(obj: Obj, elevation: number, mapID: number) {
        const script = obj._script
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
        resetAnimSequences()
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

// Slice G: rest/time-advance module shares the same timed-event queue.
bindTimedEventList(Scripting.timeEventList)

// P1-7: seed Reputation town/flag mirrors from default GVARs once the module
// graph finishes (globalState can be undefined mid-circular import).
Promise.resolve().then(() => {
    if (globalState?.reputation) {
        pullReputationFromGvars(globalState.reputation, Scripting.getGlobalVars())
    }
})

// sfall functions the Script class does not define itself (sfallFunctions.ts).
installSfallFunctions(Scripting.Script.prototype as unknown as Record<string, unknown>)
