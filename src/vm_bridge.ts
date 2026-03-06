/*
Copyright 2015 darkf

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

import globalState from "./globalState.js"
import { IntFile } from "./intfile.js"
import { Scripting } from "./scripting.js"
import { UIMode } from "./ui.js"
import { BinaryReader } from "./util.js"
import { opMap, ScriptVM } from "./vm.js"

// Bridge between Scripting API and the Scripting VM

export module ScriptVMBridge {
    // create a bridged function that calls procedures on scriptObj
    function bridged(procName: string, argc: number, pushResult: boolean=true) {
        return function(this: GameScriptVM) {
            var args = []
            for(var i = 0; i < argc; i++)
                args.push(this.pop())
            args.reverse()

            const targetFn = (<any>this.scriptObj)[procName]
            if(typeof targetFn !== "function") {
                this.recordUnsupportedProcedure(this.lastOpcode, procName)
                throw new Error(`ScriptVMBridge: missing procedure implementation ${procName} for opcode 0x${this.lastOpcode.toString(16)}`)
            }

            var r = targetFn.apply(this.scriptObj, args)
            if(pushResult)
                this.push(r)
        }
    }

    function varName(this: ScriptVM, value: any): string {
        if(typeof value === "number")
            return this.intfile.identifiers[value]
        return value
    }

    var bridgeOpMap: { [opcode: number]: (this: GameScriptVM) => void } = {
        0x80BF: function() { this.push(globalState.player) } // dude_obj
       ,0x80BC: function() { this.push(this.scriptObj.self_obj) } // self_obj
       ,0x8128: function() { this.push(this.scriptObj.combat_is_initialized) } // combat_is_initialized
       ,0x8118: function() {
            // get_month: compute from gameTickTime (10 ticks/second, 30-day months)
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            this.push(1 + (Math.floor(days / 30) % 12))
        } // get_month
       ,0x80F6: function() {
            // game_time_hour: HHMM computed from gameTickTime
            const secs = Math.floor(globalState.gameTickTime / 10) % 86400
            this.push(Math.floor(secs / 3600) * 100 + Math.floor((secs % 3600) / 60))
        } // game_time_hour
       ,0x80EA: function() { this.push(this.scriptObj.game_time) } // game_time
       ,0x8119: function() {
            // get_day: 1-based day within the current 30-day month
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            this.push(1 + days % 30)
        } // get_day
       ,0x8101: function() { this.push(this.scriptObj.cur_map_index) } // cur_map_index
       ,0x80BD: function() { this.push(this.scriptObj.source_obj) } // source_obj
       ,0x80FA: function() { this.push(this.scriptObj.action_being_used) } // action_being_used
       ,0x80BE: function() { this.push(this.scriptObj.target_obj) } // target_obj
       ,0x80F7: function() { this.push(this.scriptObj.fixed_param) } // fixed_param

       ,0x8016: function() { this.mapScript()[this.pop()] = 0 } // op_export_var
       ,0x8015: function() { var name = varName.call(this, this.pop()); this.mapScript()[name] = this.pop() } // op_store_external
       ,0x8014: function() { this.push(this.mapScript()[varName.call(this, this.pop())]) } // op_fetch_external

       ,0x80B9: bridged("script_overrides", 0, false)
       ,0x80B4: bridged("random", 2)
       ,0x80E1: bridged("metarule3", 4)
       ,0x80CA: bridged("get_critter_stat", 2)
       ,0x8105: bridged("message_str", 2)
       ,0x80B8: bridged("display_msg", 1, false)
       ,0x810E: bridged("reg_anim_func", 2, false)
       ,0x8126: bridged("reg_anim_animate_forever", 2, false)
       ,0x810F: bridged("reg_anim_animate", 3, false)
       ,0x8110: bridged("reg_anim_obj_move_to_tile", 3, false)
       ,0x810C: bridged("anim", 3, false)
       ,0x80E7: bridged("anim_busy", 1)
       ,0x810B: bridged("metarule", 2)
       ,0x80C1: bridged("local_var", 1)
       ,0x80C2: bridged("set_local_var", 2, false)
       ,0x80C5: bridged("global_var", 1)
       ,0x80C6: bridged("set_global_var", 2, false)
       ,0x80C3: bridged("map_var", 1)
       ,0x80C4: bridged("set_map_var", 2, false)
       ,0x80B2: bridged("mark_area_known", 3, false)
       ,0x80E5: bridged("wm_area_set_pos", 3, false)
       ,0x80B7: bridged("create_object_sid", 4)
       ,0x8102: bridged("critter_add_trait", 4)
       ,0x8106: bridged("critter_inven_obj", 2)
       ,0x8109: bridged("inven_cmds", 3)
       ,0x80FF: bridged("critter_attempt_placement", 3)
       ,0x8127: bridged("critter_injure", 2, false)
       ,0x80E8: bridged("critter_heal", 2, false)
       ,0x8151: bridged("critter_is_fleeing", 1)
       ,0x8152: bridged("critter_set_flee_state", 2, false) // void?
       ,0x80DA: bridged("wield_obj_critter", 2, false)
       ,0x8116: bridged("add_mult_objs_to_inven", 3, false)
       ,0x8117: bridged("rm_mult_objs_from_inven", 3)
       ,0x80D8: bridged("add_obj_to_inven", 2, false)
       ,0x80DC: bridged("obj_can_see_obj", 2)
       ,0x80E9: bridged("set_light_level", 1)
       ,0x80BB: bridged("tile_contains_obj_pid", 3)
       ,0x80D3: bridged("tile_distance_objs", 2)
       ,0x80D2: bridged("tile_distance", 2)
       ,0x80A7: bridged("tile_contains_pid_obj", 3)
       ,0x814C: bridged("rotation_to_tile", 2)
       ,0x80AE: bridged("do_check", 3)
       ,0x814a: bridged("art_anim", 1)
       ,0x80F4: bridged("destroy_object", 1, false)
       ,0x80A9: bridged("override_map_start", 4, false)
       ,0x8154: bridged("debug_msg", 1, false)
       ,0x80F3: bridged("has_trait", 3)
       ,0x80C9: bridged("obj_item_subtype", 1)
       ,0x80BA: bridged("obj_is_carrying_obj_pid", 2)
       ,0x810D: bridged("obj_carrying_pid_obj", 2)
       ,0x80B6: bridged("move_to", 3)
       ,0x8147: bridged("move_obj_inven_to_obj", 2, false)
       ,0x8100: bridged("obj_pid", 1)
       ,0x80A4: bridged("obj_name", 1)
       ,0x8149: bridged("obj_art_fid", 1)
       ,0x8150: bridged("obj_on_screen", 1)
       ,0x80f5: bridged("obj_can_hear_obj", 2)
       ,0x80E3: bridged("set_obj_visibility", 2, false)
       ,0x8130: bridged("obj_is_open", 1)
       ,0x80C8: bridged("obj_type", 1)
       ,0x8131: bridged("obj_open", 1, false)
       ,0x8132: bridged("obj_close", 1, false)
       ,0x812E: bridged("obj_lock", 1, false)
       ,0x812F: bridged("obj_unlock", 1, false)
       ,0x812D: bridged("obj_is_locked", 1)
       ,0x80AC: bridged("roll_vs_skill", 3)
       ,0x80AF: bridged("is_success", 1)
       ,0x80B0: bridged("is_critical", 1)
       ,0x80AA: bridged("has_skill", 2)
       ,0x80AB: bridged("using_skill", 2)
       ,0x813C: bridged("critter_mod_skill", 3) // int or void?
       ,0x80EF: bridged("critter_dmg", 3, false)
       ,0x80ed: bridged("kill_critter", 2, false)
       ,0x811a: bridged("explosion", 3) // int?
       ,0x8123: bridged("get_poison", 1)
       ,0x8122: bridged("poison", 2, false)
       ,0x80A1: bridged("give_exp_points", 1, false)
       ,0x8138: bridged("item_caps_total", 1)
       ,0x8139: bridged("item_caps_adjust", 2)
       ,0x80FB: bridged("critter_state", 1)
       ,0x8124: bridged("party_add", 1, false)
       ,0x8125: bridged("party_remove", 1, false)
       ,0x814B: bridged("party_member_obj", 1)
       ,0x80EC: bridged("elevation", 1)
       ,0x80F2: bridged("game_ticks", 1)
       ,0x8133: bridged("game_ui_disable", 0, false)
       ,0x8134: bridged("game_ui_enable", 0, false)
       ,0x80f8: bridged("tile_is_visible", 1)
       ,0x80CF: bridged("tile_in_tile_rect", 5)
       ,0x80D4: bridged("tile_num", 1)
       ,0x80D5: bridged("tile_num_in_direction", 3)
       ,0x80CE: bridged("animate_move_obj_to_tile", 3, false)
       ,0x80CC: bridged("animate_stand_obj", 1, false)
       ,0x80D0: bridged("attack_complex", 8, false)
       ,0x8153: bridged("terminate_combat", 0, false)
       ,0x8145: bridged("use_obj_on_obj", 2, false)
       ,0x8144: bridged("use_obj", 1, false)
       ,0x80D9: bridged("rm_obj_from_inven", 2, false)
       ,0x80CB: bridged("set_critter_stat", 3)
       ,0x8148: bridged("obj_set_light_level", 3, false)
       ,0x80A5: bridged("set_exit_grids", 5, false)
       ,0x80E4: bridged("load_map", 2, false)
       ,0x8115: bridged("play_gmovie", 1, false)
       ,0x80A3: bridged("play_sfx", 1, false)
       ,0x80FC: bridged("game_time_advance", 1, false)
       ,0x8137: bridged("gfade_in", 1, false)
       ,0x8136: bridged("gfade_out", 1, false)
       ,0x810A: bridged("float_msg", 3, false)
       ,0x80F0: bridged("add_timer_event", 3, false)
       ,0x80F1: bridged("rm_timer_event", 1, false)
       ,0x80F9: bridged("dialogue_system_enter", 0, false)
       ,0x8111: bridged("proto_data", 2)
       ,0x8112: bridged("get_pc_stat", 1)
       ,0x8113: bridged("radiation_dec", 2, false)
       ,0x8114: bridged("radiation_add", 2, false)
       ,0x8129: bridged("gdialog_mod_barter", 1, false)
       ,0x80DE: bridged("start_gdialog", 5, false)
       ,0x811C: bridged("gsay_start", 0) // void?
       //,0x811D: bridged("gsay_end", 0) // void?
       ,0x811E: bridged("gsay_reply", 2, false)
       ,0x80DF: bridged("end_dialogue", 0) // void?
       ,0x8120: bridged("gsay_message", 3, false)
       //,0x806B: bridged("display", 1)
       ,0x814E: bridged("gdialog_set_barter_mod", 1, false)

       ,0x811D: function() { // gsay_end
            // halt where we are, saving our return address.
            // we will resume when the dialogue system resumes us on dialogue exit
            // usually to run cleanup code.
            console.log("halting in gsay_end (pc=0x%s)", this.pc.toString(16))
            this.retStack.push(this.pc + 2)
            this.halted = true
            this.scriptObj.gsay_end()
       }

       //,0x8121: bridged("giq_option", 5) // TODO: wrap this so that target becomes a function
       // giq_option
       ,0x8121: function() { // giq_option
            var reaction = this.pop()
            var target = this.pop()
            var msgId = this.pop()
            var msgList = this.pop()
            var iqTest = this.pop()

            // wrap target in a function
            //var targetFn = () => { this.call() }
            //console.log("TARGET=%o, proc=%o this=%o", targetFn, this.intfile.proceduresTable[target], this)
            var targetProc = this.intfile.proceduresTable[target].name
            // TODO: do we save the current PC as the return address?
            // otherwise when end_dialogue is reached, we will have
            // interrupted to this targetFn, and have no way back
            var targetFn = () => { this.call(targetProc) }

            this.scriptObj.giq_option(iqTest, msgList, msgId, targetFn, reaction)
        }

       ,0x811b: function() { // get_year: compute current game year from gameTickTime
            // Game starts in year 2241. Uses 360-day years (12 × 30-day months).
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            this.push(2241 + Math.floor(days / 360))
        }

       ,0x8155: bridged("obj_get_rot", 1)
       ,0x8156: bridged("set_obj_rot", 2, false)

       // sfall extended opcodes
       ,0x8157: bridged("get_sfall_global", 1)  // get_sfall_global(name) → value
       ,0x8158: bridged("set_sfall_global", 2, false)  // set_sfall_global(name, value)
       ,0x8159: bridged("get_radiation", 1)  // get_radiation(obj) → radiation level
       ,0x815A: bridged("get_sfall_global_int", 1)   // get_sfall_global_int(index) → value
       ,0x815B: bridged("set_sfall_global_int", 2, false)  // set_sfall_global_int(index, value)
       ,0x815C: function() {  // get_day_of_week: 0-6 from game epoch (0 = first day)
            const days = Math.floor(globalState.gameTickTime / (10 * 86400))
            this.push(days % 7)
        }
       ,0x815D: function() {  // get_game_time_in_seconds: whole-seconds elapsed since game epoch
            this.push(Math.floor(globalState.gameTickTime / 10))
        }
       ,0x815E: function() {  // in_world_map: 1 when the world-map screen is open, 0 otherwise
            this.push(globalState.uiMode === UIMode.worldMap ? 1 : 0)
        }
       ,0x815F: bridged("get_pc_base_stat", 1)       // get_pc_base_stat(stat) → value
       ,0x8160: bridged("set_pc_base_stat", 2, false) // set_pc_base_stat(stat, value)
       ,0x8161: bridged("set_critter_current_ap", 2, false) // set_critter_current_ap(obj, ap)
       ,0x8162: bridged("get_npc_level", 1)            // get_npc_level(obj) → level
       ,0x8163: bridged("get_critter_current_ap", 1)   // get_critter_current_ap(obj) → current combat AP
       ,0x8164: bridged("get_critter_max_hp", 1)       // get_critter_max_hp(obj) → max HP
       ,0x8165: bridged("get_pc_level", 0)             // get_pc_level() → PC level
       ,0x8166: bridged("get_critter_base_stat", 2)    // get_critter_base_stat(critter, stat) → base stat value
       ,0x8167: bridged("set_critter_base_stat", 3, false) // set_critter_base_stat(critter, stat, value)
       ,0x8168: bridged("in_combat", 0)                // in_combat() → 1 if engine is in combat, 0 otherwise
       ,0x8169: bridged("get_current_town", 0)         // get_current_town() → current map/area ID (sfall-style shortcut for metarule(46, 0))
       ,0x816A: bridged("critter_is_dead", 1)          // critter_is_dead(obj) → 1 if critter HP <= 0
       ,0x816B: bridged("get_dialogue_active", 0)      // get_dialogue_active() → 1 if dialogue is currently active
       ,0x816C: bridged("abs_value", 1)                // abs_value(x) → |x|
       ,0x816D: bridged("string_length", 1)            // string_length(str) → length of string
       ,0x816E: bridged("pow", 2)                      // pow(base, exp) → base^exp
       ,0x816F: bridged("obj_is_valid", 1)             // obj_is_valid(obj) → 1 if obj is a valid game object

       // sfall extended opcodes — kill counts, body type, floor2, obj count
       ,0x8170: bridged("get_critter_kills", 1)        // get_critter_kills(kill_type) → kill count
       ,0x8171: bridged("set_critter_kills", 2, false) // set_critter_kills(kill_type, amount)
       ,0x8172: bridged("get_critter_body_type", 1)    // get_critter_body_type(obj) → body type index
       ,0x8173: bridged("floor2", 1)                   // floor2(x) → math floor of x
       ,0x8174: bridged("obj_count_by_pid", 1)         // obj_count_by_pid(pid) → count of live objects with matching PID

       // sfall extended opcodes 0x8175–0x8177 — string/array utilities
       ,0x8175: bridged("string_compare", 3)           // string_compare(str1, str2, case_sensitive) → 0 if equal
       ,0x8176: bridged("substr", 3)                   // substr(str, start, len) → substring
       ,0x8177: bridged("get_uptime", 0)               // get_uptime() → session time in milliseconds

       // sfall extended opcodes 0x8178–0x817C — weapon ammo state and mouse tile
       ,0x8178: bridged("get_weapon_ammo_pid", 1)      // get_weapon_ammo_pid(weapon) → ammo type PID loaded
       ,0x8179: bridged("set_weapon_ammo_pid", 2, false) // set_weapon_ammo_pid(weapon, pid) — set ammo type
       ,0x817A: bridged("get_weapon_ammo_count", 1)    // get_weapon_ammo_count(weapon) → rounds loaded
       ,0x817B: bridged("set_weapon_ammo_count", 2, false) // set_weapon_ammo_count(weapon, count) — set rounds loaded
       ,0x817C: bridged("get_mouse_tile_num", 0)       // get_mouse_tile_num() → tile under mouse (-1 if none)

       // sfall extended opcodes 0x817D–0x817F — object names, game mode, global script repeat
       ,0x817D: bridged("get_critter_name", 1)         // get_critter_name(obj) → display name string of object
       ,0x817E: bridged("get_game_mode", 0)            // get_game_mode() → current game mode bitmask (partial: 0)
       ,0x817F: bridged("set_global_script_repeat", 1, false) // set_global_script_repeat(ms) — set global-script tick interval (partial: no-op)

       // sfall extended opcodes 0x8180–0x8182 — skill access and light level
       ,0x8180: bridged("get_critter_skill", 2)         // get_critter_skill(critter, skill) → derived skill value
       ,0x8181: bridged("set_critter_skill_points", 3, false) // set_critter_skill_points(critter, skill, value) — set base skill
       ,0x8182: bridged("get_light_level", 0)           // get_light_level() → current ambient light level (0–65536)
    }
    Object.assign(opMap, bridgeOpMap)

    // define a game-oriented Script VM that has a ScriptProto instance
    export class GameScriptVM extends ScriptVM {
        scriptObj = new Scripting.Script()
        lastOpcode: number = -1

        step(): boolean {
            if (this.halted) return false
            this.script.seek(this.pc)
            this.lastOpcode = this.script.read16()
            this.script.seek(this.pc)
            return super.step()
        }

        constructor(script: BinaryReader, intfile: IntFile) {
            super(script, intfile)

            // patch scriptObj to allow transparent procedure calls
            // TODO: maybe we should check if we're interrupting the VM
            for(const procName in this.intfile.procedures) {
                (<any>this.scriptObj)[procName] = () => { this.call(procName) }
            }
        }

        mapScript(): any {
            if(this.scriptObj._mapScript)
                return this.scriptObj._mapScript
            return this.scriptObj
        }
    }
}