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
                // Warn and return a safe 0 instead of throwing so the script can
                // continue executing — a missing bridge is a stub gap, not a fatal error.
                console.warn(
                    `[ScriptVMBridge] missing procedure "${procName}" for opcode 0x${this.lastOpcode.toString(16)} in ${this.intfile.name}; returning 0`
                )
                if(pushResult) this.push(0)
                return
            }

            var r = targetFn.apply(this.scriptObj, args)
            if(pushResult)
                // Guard against undefined returns from stub/partial procedures.
                // Any procedure that returns without an explicit value would push
                // `undefined` onto the VM data stack, corrupting subsequent arithmetic
                // and comparisons.  Coerce to 0 (the Fallout 2 "false/null" sentinel)
                // so the stack stays in a known state.
                this.push(r ?? 0)
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

       // ---------------------------------------------------------------------------
       // Phase 49 — new core opcodes
       // ---------------------------------------------------------------------------

       // 0x80A0 — map_first_run: 1 if this is the first time entering the current
       // map in this session, 0 otherwise.  Scripts use this to run one-time setup
       // logic (placing critters, setting up quest state) only on the first visit.
       ,0x80A0: function() { this.push(Scripting.getMapFirstRun()) }

       // 0x80A2 — pc_flag_on(flag): set a player character state bit.
       // Known bits: 3 = SNK_MODE (sneak mode), 2 = I_AM_EVIL.
       ,0x80A2: bridged("pc_flag_on", 1, false)

       // 0x80A6 — pc_flag_off(flag): clear a player character state bit.
       ,0x80A6: bridged("pc_flag_off", 1, false)

       // 0x80B1 — inven_unwield(obj): make a critter holster their current weapon.
       ,0x80B1: bridged("inven_unwield", 1, false)

       // 0x80C7 — script_action: push the current script context action being used.
       // Identical semantics to action_being_used (0x80FA); both map to the same
       // script property.
       ,0x80C7: function() { this.push(this.scriptObj.action_being_used) } // script_action

       // 0x80D6 — pickup_obj(obj): move an object from the map into the player's
       // inventory.  Used by scripted item hand-offs.
       ,0x80D6: bridged("pickup_obj", 1, false)

       // 0x80D7 — drop_obj(obj): remove an object from a critter's inventory and
       // place it at the critter's current tile.
       ,0x80D7: bridged("drop_obj", 1, false)

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
       ,0x80A8: bridged("set_name", 2, false)           // set_name(obj, name) — BLK-050
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
            var targetProc = this.intfile.proceduresTable[target]?.name
            if (!targetProc) {
                console.warn(`[vm_bridge] giq_option: procedure at index ${target} not found — option skipped`)
                return
            }
            // TODO: do we save the current PC as the return address?
            // otherwise when end_dialogue is reached, we will have
            // interrupted to this targetFn, and have no way back
            var targetFn = () => { this.call(targetProc!) }

            this.scriptObj.giq_option(iqTest, msgList, msgId, targetFn, reaction)
        }

       // gsay_option (0x811F) — adds a dialogue option without an INT requirement.
       // Opcode takes 4 args: msgList, msgID, target (procedure index), reaction.
       ,0x811F: function() { // gsay_option
            var reaction = this.pop()
            var target = this.pop()
            var msgId = this.pop()
            var msgList = this.pop()

            var targetProc = this.intfile.proceduresTable[target]?.name
            if (!targetProc) {
                console.warn(`[vm_bridge] gsay_option: procedure at index ${target} not found — option skipped`)
                return
            }
            var targetFn = () => { this.call(targetProc!) }

            this.scriptObj.gsay_option(msgList, msgId, targetFn, reaction)
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

       // sfall extended opcodes 0x8183–0x8185 — HP helpers and max AP
       ,0x8183: bridged("get_critter_hp", 1)            // get_critter_hp(obj) → current HP of critter
       ,0x8184: bridged("set_critter_hp", 2, false)     // set_critter_hp(obj, hp) — set current HP of critter
       ,0x8185: bridged("get_critter_max_ap", 1)        // get_critter_max_ap(obj) → max action points for critter

       // sfall extended opcodes 0x8186–0x8188 — object list iteration
       ,0x8186: bridged("list_begin", 1)                // list_begin(type) → first object in iteration (LIST_ALL=0, LIST_CRITTERS=1, LIST_GROUNDITEMS=2)
       ,0x8187: bridged("list_next", 0)                 // list_next() → next object in current iteration (null/0 when exhausted)
       ,0x8188: bridged("list_end", 0, false)           // list_end() — dispose the current object-list iterator

       // sfall extended opcodes 0x8189–0x818A — tile navigation and object elevation
       ,0x8189: bridged("tile_num_in_direction", 3)     // tile_num_in_direction(tile, dir, count) → tile N steps in direction dir
       ,0x818A: bridged("get_obj_elevation", 1)         // get_obj_elevation(obj) → elevation index of the given object

       // sfall extended opcodes 0x818B–0x818F — art FID, combat AP, hook return value
       ,0x818B: bridged("get_object_art_fid", 1)        // get_object_art_fid(obj) → current art FID of the object
       ,0x818C: bridged("set_object_art_fid", 2, false) // set_object_art_fid(obj, fid) — change object art sprite FID
       ,0x818D: bridged("get_critter_combat_ap", 1)     // get_critter_combat_ap(obj) → current in-combat AP
       ,0x818E: bridged("set_critter_combat_ap", 2, false) // set_critter_combat_ap(obj, ap) — set in-combat AP
       ,0x818F: bridged("get_script_return_value", 0)   // get_script_return_value() → last hook-script return value (partial: 0)

       // sfall extended opcodes 0x8190–0x8191 — type conversion
       ,0x8190: bridged("string_to_int", 1)             // string_to_int(str) → parse string as base-10 integer (0 on failure)
       ,0x8191: bridged("int_to_string", 1)             // int_to_string(n) → decimal string representation of integer

       // sfall extended opcodes 0x8192–0x8193 — string format and script detection
       ,0x8192: bridged("sprintf", 2)                   // sprintf(format, arg) → C-style single-arg formatted string
       ,0x8193: bridged("obj_has_script", 1)            // obj_has_script(obj) → 1 if obj has a script, 0 otherwise

       // sfall extended opcodes 0x8194–0x8197 — tile FID and critter flags
       ,0x8194: bridged("get_tile_fid", 2)              // get_tile_fid(tile, elev) → FID of floor tile (partial: 0)
       ,0x8195: bridged("set_tile_fid", 3, false)       // set_tile_fid(tile, elev, fid) — override floor tile art (no-op)
       ,0x8196: bridged("get_critter_flags", 1)         // get_critter_flags(obj) → critter injury/state flags bitmask
       ,0x8197: bridged("set_critter_flags", 2, false)  // set_critter_flags(obj, flags) — bulk-set critter injury flags

       // sfall extended opcodes 0x8198–0x819B — INI settings, active hand, hook return/arg
       ,0x8198: bridged("get_ini_setting", 1)           // get_ini_setting(key) → INI value as int (partial: 0)
       ,0x8199: bridged("active_hand", 0)               // active_hand() → 0=primary/1=secondary (partial: 0)
       ,0x819A: bridged("set_sfall_return", 1, false)   // set_sfall_return(val) — set hook-script return value (no-op)
       ,0x819B: bridged("get_sfall_arg", 0)             // get_sfall_arg() → hook-script argument (partial: 0)

       // sfall extended opcodes 0x819C–0x81A2 — world-map, critter level, misc
       ,0x819C: bridged("get_world_map_x", 0)           // get_world_map_x() → current world-map X position
       ,0x819D: bridged("get_world_map_y", 0)           // get_world_map_y() → current world-map Y position
       ,0x819E: bridged("set_world_map_pos", 2, false)  // set_world_map_pos(x, y) — teleport world-map cursor
       ,0x819F: bridged("in_world_map", 0)              // in_world_map() → 1 if player is on world map
       ,0x81A0: bridged("get_critter_level", 1)         // get_critter_level(obj) → character level of critter
       ,0x81A1: bridged("set_critter_level", 2, false)  // set_critter_level(obj, level) — override critter level
       ,0x81A2: bridged("get_object_weight", 1)         // get_object_weight(obj) → weight of object in lbs

       // sfall extended opcodes 0x81A3–0x81A7 — ini strings, global script type, game calendar
       ,0x81A3: bridged("get_ini_string", 1)            // get_ini_string(key) → INI value as string (partial: "")
       ,0x81A4: bridged("set_global_script_type", 1, false) // set_global_script_type(type) — set global script type (0=map, 1=combat)
       ,0x81A5: bridged("get_year", 0)                  // get_year() → in-game calendar year
       ,0x81A6: bridged("get_month", 0)                 // get_month() → in-game calendar month (1–12)
       ,0x81A7: bridged("get_day", 0)                   // get_day() → in-game calendar day of month (1–31)

       // sfall extended opcodes 0x81A8–0x81A9 — combat free movement
       ,0x81A8: bridged("get_combat_free_move", 1)       // get_combat_free_move(obj) → free AP for movement this combat turn
       ,0x81A9: bridged("set_combat_free_move", 2, false) // set_combat_free_move(obj, ap) — set free movement AP

       // Phase 48 — gap opcodes in 0x8140–0x814D range
       // tile_add_blocking / tile_remove_blocking — safe no-ops (no runtime tile-block registry)
       ,0x8140: function() { this.pop(); this.pop() } // tile_add_blocking(tile, rotation) — no-op
       ,0x8141: function() { this.pop(); this.pop() } // tile_remove_blocking(tile, rotation) — no-op

       // give_karma / take_karma — add or subtract from GVAR_PLAYER_REPUTATION (GVAR_0).
       // In Fallout 2 these are sometimes compiled as standalone opcodes when the
       // macro expansion is inlined by the script compiler.
       ,0x8142: function() { // give_karma(obj, amount) — award karma to GVAR_0
            const amount = this.pop()
            this.pop() // obj — Fallout 2 apply karma to player only
            const current = this.scriptObj.global_var(0)
            this.scriptObj.set_global_var(0, (typeof current === 'number' ? current : 0) + (typeof amount === 'number' ? amount : 0))
        }
       ,0x8143: function() { // take_karma(obj, amount) — penalise karma
            const amount = this.pop()
            this.pop() // obj
            const current = this.scriptObj.global_var(0)
            this.scriptObj.set_global_var(0, (typeof current === 'number' ? current : 0) - (typeof amount === 'number' ? amount : 0))
        }

       // dialogue_reaction — adjust current NPC reaction during dialogue.
       // The browser build does not track a per-dialogue reaction score; we
       // accept the argument and return 0 rather than crashing on unknown opcode.
       ,0x814D: function() { this.pop() } // dialogue_reaction(how_much) — no-op (no reaction system)

       // -----------------------------------------------------------------------
       // Phase 49 — sfall extended opcodes 0x81AA–0x81AD
       // -----------------------------------------------------------------------

       // 0x81AA — get_script(obj): return the script SID attached to an object.
       // The browser build does not expose script handles as integers; return 0
       // (no-script / unknown) rather than crashing.  Scripts that use the
       // return value for further calls will see a falsy 0, which typically
       // causes them to skip script-manipulation logic gracefully.
       ,0x81AA: function() {
            const obj = this.pop()
            // Guard: obj must be a non-null object with a _script property.
            // _sid is not present in the browser build; always return 0.
            const hasScript = obj !== null && obj !== 0 && typeof obj === 'object' && !!(obj as any)._script
            this.push(hasScript ? 0 : 0) // always 0 — no numeric SID model
        } // get_script(obj) → 0 (partial: no SID model in browser build)

       // 0x81AB — set_script(obj, sid): assign a script to an object by SID.
       // The browser build loads scripts by name rather than numeric SID; accept
       // the arguments and no-op rather than crashing.
       ,0x81AB: function() {
            this.pop() // sid
            this.pop() // obj
        } // set_script(obj, sid) — no-op (no SID-based script registry)

       // 0x81AC — remove_script(obj): detach the script from an object.
       // Accepted but not implemented; scripts that remove their own script will
       // continue to run (cannot self-terminate from within the VM call chain).
       ,0x81AC: function() {
            this.pop() // obj
        } // remove_script(obj) — no-op

       // 0x81AD — get_critter_current_hp2 (alias): same as get_critter_hp (0x8183).
       // Some sfall-using mods call this opcode for NPC heal checks.
       ,0x81AD: bridged("get_critter_hp", 1) // get_critter_hp(obj) → current HP

       // Phase 50 — sfall extended opcodes 0x81AE–0x81B5
       // 0x81AE — get_perk_owed(): return number of pending perk-selection points.
       // BLK-047: Now returns the actual playerPerksOwed counter (incremented by 1
       // every 3 levels in give_exp_points).  Previously always returned 0.
       ,0x81AE: function() { this.push(globalState.playerPerksOwed ?? 0) } // get_perk_owed() → count

       // 0x81AF — set_perk_owed(n): set number of pending perk-selection points.
       // BLK-047: Now writes the actual playerPerksOwed counter so scripts and
       // the perk-selection screen can correctly clear the perk debt.
       ,0x81AF: function() { globalState.playerPerksOwed = Math.max(0, this.pop() | 0) } // set_perk_owed(n)

       // 0x81B0 — get_last_target(obj): return the last critter targeted in combat
       // by obj.  BLK-117: now reads the per-critter lastCombatTarget property set
       // during combat.attack(); returns 0 when no target has been recorded.
       ,0x81B0: function() {
           const obj = this.pop()
           const target = (obj !== null && obj !== 0 && typeof obj === 'object') ? (obj as any).lastCombatTarget ?? 0 : 0
           this.push(target)
       } // get_last_target(obj) → last target or 0

       // 0x81B1 — get_last_attacker(obj): return the last critter that attacked obj.
       // BLK-117: now reads the per-critter lastCombatAttacker property set by
       // combat.attack(); returns 0 when no attacker has been recorded.
       ,0x81B1: function() {
           const obj = this.pop()
           const attacker = (obj !== null && obj !== 0 && typeof obj === 'object') ? (obj as any).lastCombatAttacker ?? 0 : 0
           this.push(attacker)
       } // get_last_attacker(obj) → last attacker or 0

       // 0x81B2 — art_cache_flush(): flush the internal art/animation cache.
       // No-op in browser build (no separate art cache to manage).
       ,0x81B2: function() {} // art_cache_flush() — no-op

       // 0x81B3 — game_loaded(): returns 1 if the current map was entered via a
       // save/load rather than a first-time visit.  BLK-111: now reads the real
       // globalState.mapLoadedFromSave flag set by the save/load system.
       ,0x81B3: function() { this.push(globalState.mapLoadedFromSave ? 1 : 0) } // game_loaded() → real flag

       // 0x81B4 — set_weapon_knockback(obj, dist, chance): set weapon knockback
       // parameters for an object.  No-op in browser build (no knockback model).
       ,0x81B4: function() { this.pop(); this.pop(); this.pop() } // set_weapon_knockback — no-op

       // 0x81B5 — remove_weapon_knockback(obj): clear weapon knockback.
       // No-op in browser build.
       ,0x81B5: function() { this.pop() } // remove_weapon_knockback — no-op

       // Phase 51 — sfall extended opcodes 0x81B6–0x81BD

       // 0x81B6 — get_critter_stat_bonus(obj, stat): return the stat modifier bonus
       // (derived stat minus base stat).  Partial: mostly 0, implemented for all stats.
       ,0x81B6: bridged("get_critter_stat_bonus", 2) // get_critter_stat_bonus(obj, stat) → bonus

       // 0x81B7 — obj_art_name(obj): return the art path/filename of a game object.
       // Used by scripts checking or logging object sprites.
       ,0x81B7: bridged("obj_art_name", 1) // obj_art_name(obj) → art path string

       // 0x81B8 — get_item_type_int(item): return item subtype as Fallout 2 integer.
       // 0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key.
       ,0x81B8: bridged("get_item_type_int", 1) // get_item_type_int(item) → subtype int

       // 0x81B9 — set_pc_stat(pcstat, val): set a player-character stat by index.
       // Supported indices: 0=unspent_skill_points, 1=level, 2=experience, 3/4=karma.
       ,0x81B9: bridged("set_pc_stat", 2, false) // set_pc_stat(pcstat, val) — set PC stat

       // 0x81BA — num_critters_in_radius(tile, elev, radius): count critters within
       // the specified hex radius of a tile.  Used by AI and encounter scripts.
       ,0x81BA: bridged("num_critters_in_radius", 3) // num_critters_in_radius(tile, elev, rad) → count

       // 0x81BB — get_object_ai_num(obj): return the AI packet number of a critter.
       ,0x81BB: bridged("get_object_ai_num", 1) // get_object_ai_num(obj) → ai_num

       // 0x81BC — set_object_ai_num(obj, num): set the AI packet number of a critter.
       ,0x81BC: bridged("set_object_ai_num", 2, false) // set_object_ai_num(obj, num) — set AI num

       // 0x81BD — get_critter_hostile_to_dude(obj): 1 if critter is hostile to player, 0 otherwise.
       ,0x81BD: bridged("get_critter_hostile_to_dude", 1) // get_critter_hostile_to_dude(obj) → 0/1

       // Phase 52 — sfall extended opcodes 0x81BE–0x81C5

       // 0x81BE — get_critter_weapon(critter, slot): return the weapon in the specified hand.
       //   slot 0 = primary hand (rightHand); slot 1 = secondary hand (leftHand).
       // Returns the weapon game object or 0 if no weapon is equipped in that slot.
       ,0x81BE: bridged("get_critter_weapon", 2) // get_critter_weapon(critter, slot) → weapon obj | 0

       // 0x81BF — critter_inven_size(critter): return count of items in critter's inventory.
       // Enables scripts to check how many items a critter is carrying (e.g. for loot scripts).
       ,0x81BF: bridged("critter_inven_size", 1) // critter_inven_size(critter) → count

       // 0x81C0 — get_sfall_args_count(): return number of arguments for the current hook script.
       // Browser build has no hook scripts; always returns 0.
       ,0x81C0: bridged("get_sfall_args_count", 0) // get_sfall_args_count() → 0

       // 0x81C1 — get_sfall_arg_at(idx): return hook-script argument at index.
       // Browser build has no hook scripts; always returns 0.
       ,0x81C1: bridged("get_sfall_arg_at", 1) // get_sfall_arg_at(idx) → 0

       // 0x81C2 — set_sfall_arg(idx, val): write a value back into a hook-script argument.
       // No-op in the browser build (no hook script argument buffer).
       ,0x81C2: bridged("set_sfall_arg", 2, false) // set_sfall_arg(idx, val) — no-op

       // 0x81C3 — get_object_lighting(obj): return the light level received by obj (0–65536).
       // Partial: returns the global ambient light level.
       ,0x81C3: bridged("get_object_lighting", 1) // get_object_lighting(obj) → light level

       // 0x81C4 — get_critter_team(critter): return the team number of a critter.
       // Team numbers control which factions are allied/hostile to each other.
       ,0x81C4: bridged("get_critter_team", 1) // get_critter_team(critter) → teamNum

       // 0x81C5 — set_critter_team(critter, team): set the team number of a critter.
       // Used by faction-switch and story-beat scripts.
       ,0x81C5: bridged("set_critter_team", 2, false) // set_critter_team(critter, team) — set

       // Phase 53 — sfall extended opcodes 0x81C6–0x81CF

       // 0x81C6 — get_critter_base_stat(critter, stat): return the unmodified base
       // value of a critter stat (before perk/equipment bonuses).
       ,0x81C6: bridged("get_critter_base_stat", 2) // get_critter_base_stat(critter, stat) → base val

       // 0x81C7 — set_critter_base_stat(critter, stat, value): set the base value
       // of a critter stat. Delegates to existing set_critter_stat implementation.
       ,0x81C7: bridged("set_critter_base_stat", 3, false) // set_critter_base_stat(critter, stat, val)

       // 0x81C8 — critter_mod_skill_points(critter, delta): add/subtract raw skill
       // points from a critter. No-op for NPCs; adjusts player SkillSet.skillPoints.
       ,0x81C8: bridged("critter_mod_skill_points", 2, false) // critter_mod_skill_points(critter, delta)

       // 0x81C9 — get_critter_current_ap(critter): return available combat AP for
       // the critter on its current turn. Returns 0 outside combat.
       ,0x81C9: bridged("get_critter_current_ap", 1) // get_critter_current_ap(critter) → ap

       // 0x81CA — set_critter_current_ap(critter, ap): override a critter's current
       // AP on its turn. Used by scripts that grant bonus AP mid-turn.
       ,0x81CA: bridged("set_critter_current_ap", 2, false) // set_critter_current_ap(critter, ap)

       // 0x81CB — get_combat_target(critter): return the current combat target of
       // a critter. Browser build: returns 0 (no target tracking per-critter).
       ,0x81CB: bridged("get_combat_target", 1) // get_combat_target(critter) → target | 0

       // 0x81CC — set_combat_target(critter, target): set a critter's combat target.
       // No-op in the browser build (AI targeting handled differently).
       ,0x81CC: bridged("set_combat_target", 2, false) // set_combat_target(critter, target) — no-op

       // 0x81CD — get_game_time_in_seconds: return game time in real seconds.
       // Equivalent to game_time() / 10.
       ,0x81CD: bridged("get_game_time_in_seconds", 0) // get_game_time_in_seconds() → seconds

       // 0x81CE — get_light_level: return the current global ambient light level
       // (0–65536). Same as globalState.ambientLightLevel or 65536 when unknown.
       ,0x81CE: bridged("get_light_level", 0) // get_light_level() → 0-65536

       // 0x81CF — set_light_level(level, update): set the global ambient light level.
       // Browser build accepts the call but defers actual rendering update.
       ,0x81CF: bridged("set_light_level_sfall", 2, false) // set_light_level(level, update) — partial

       // -----------------------------------------------------------------------
       // Phase 54 — sfall extended opcodes 0x81D0–0x81D7
       // -----------------------------------------------------------------------

       // 0x81D0 — get_game_mode(): return game mode bitmask.
       // Bits: 0x01=normal, 0x02=combat, 0x04=dialogue, 0x08=barter, 0x10=world-map.
       // Browser build: return current mode as a best-effort flag set.
       ,0x81D0: bridged("get_game_mode_sfall", 0) // get_game_mode() → mode bitmask

       // 0x81D1 — force_encounter(mapId): trigger a forced random encounter.
       // Browser build: no-op (random encounter system not fully implemented).
       ,0x81D1: function() { this.pop() } // force_encounter(mapId) — no-op

       // 0x81D2 — force_encounter_with_flags(mapId, flags): force encounter with options.
       // Browser build: no-op.
       ,0x81D2: function() { this.pop(); this.pop() } // force_encounter_with_flags — no-op

       // 0x81D3 — get_last_pers_obj(): return the last critter that started persistent combat.
       // Browser build: returns 0 (no persistent combat tracking).
       ,0x81D3: function() { this.push(0) } // get_last_pers_obj() → 0

       // 0x81D4 — obj_is_disabled(obj): return 1 if object's AI is disabled.
       // Browser build: partial — always returns 0 (no per-object disable flag).
       ,0x81D4: bridged("obj_is_disabled_sfall", 1) // obj_is_disabled(obj) → 0

       // 0x81D5 — obj_remove_script(obj): remove script from an object.
       // Equivalent to remove_script; accepted as a safe no-op.
       ,0x81D5: function() { this.pop() } // obj_remove_script(obj) — no-op

       // 0x81D6 — obj_add_script(obj, script_id): attach a script by SID.
       // Browser build: no SID-based script registry; no-op.
       ,0x81D6: function() { this.pop(); this.pop() } // obj_add_script(obj, sid) — no-op

       // 0x81D7 — obj_run_proc(obj, proc_name): run a named procedure on an object.
       // BLK-120: now attempts to call the named procedure on obj._script.  The proc
       // argument may be a string name or a procedure function reference.  If the
       // procedure doesn't exist on the object's script, silently no-ops.
       ,0x81D7: function(this: GameScriptVM) {
           const proc = this.pop()  // procedure name or function ref
           const obj  = this.pop()  // target game object
           if (!obj || typeof obj !== 'object') return // null/invalid object — no-op
           const script = (obj as any)._script
           if (!script) return // no script attached — no-op
           // Resolve to a callable: string → method name, function → direct call
           let fn: Function | null = null
           if (typeof proc === 'string' && typeof script[proc] === 'function') {
               fn = script[proc].bind(script)
           } else if (typeof proc === 'function') {
               fn = proc.bind(script)
           }
           if (!fn) return // procedure not found — silent no-op
           try {
               // Set self_obj so the called procedure sees the correct object context.
               const prevSelf = script.self_obj
               script.self_obj = obj
               fn()
               script.self_obj = prevSelf
           } catch (e) {
               console.warn('[obj_run_proc] procedure threw: ' + e)
           }
       } // obj_run_proc(obj, proc) — implemented (BLK-120)

       // -----------------------------------------------------------------------
       // Phase 55 — sfall extended opcodes 0x81D8–0x81DF
       // -----------------------------------------------------------------------

       // 0x81D8 — get_drop_amount(obj): return the count of items that drop when
       // an object is destroyed.  Browser build: returns 0 (no drop-amount registry).
       ,0x81D8: function() { this.pop(); this.push(0) } // get_drop_amount(obj) → 0

       // 0x81D9 — set_drop_amount(obj, amount): override how many items drop from an
       // object on destruction.  Browser build: no-op.
       ,0x81D9: function() { this.pop(); this.pop() } // set_drop_amount(obj, amount) — no-op

       // 0x81DA — art_exists(artPath): check whether an art resource exists.
       // Browser build: returns 0 (no local art index; cannot check at runtime).
       ,0x81DA: function() { this.pop(); this.push(0) } // art_exists(artPath) → 0

       // 0x81DB — obj_item_subtype(obj): return the item subtype of an object as an
       // integer (0=weapon, 1=ammo, 2=misc, 3=key, 4=armor, 5=container, 6=drug).
       // Falls back to 2 (misc) for unknown subtypes.  Alias of 0x80C9.
       ,0x81DB: bridged("obj_item_subtype", 1) // obj_item_subtype(obj) → subtype int

       // 0x81DC — get_critter_level(obj): return a critter's derived level based on
       // its current XP.  Equivalent to the existing get_npc_level (0x8162).
       ,0x81DC: bridged("get_npc_level", 1) // get_critter_level(obj) → level

       // 0x81DD — hero_art_id(type): return the art ID for the player character model
       // of the given gender/type.  Browser build: returns 0 (no hero-art registry).
       ,0x81DD: function() { this.pop(); this.push(0) } // hero_art_id(type) → 0

       // 0x81DE — get_current_inven_size(critter): return the current total size
       // (in item-size units) of a critter's inventory.  Equivalent to critter_inven_size.
       ,0x81DE: bridged("critter_inven_size", 1) // get_current_inven_size(critter) → size

       // 0x81DF — set_critter_burst_disable(obj, disable): disable or enable the
       // burst-fire mode for a critter's weapon.  Browser build: no-op.
       ,0x81DF: function() { this.pop(); this.pop() } // set_critter_burst_disable — no-op

       // -----------------------------------------------------------------------
       // Phase 56 — sfall extended opcodes 0x81E0–0x81E7
       // -----------------------------------------------------------------------

       // 0x81E0 — get_current_map_id_sfall(): return the current map index.
       // Alias of metarule(46, 0) / metarule(55, 0).  Useful for map-specific branches.
       ,0x81E0: bridged("get_current_map_id_sfall", 0) // get_current_map_id() → mapID

       // 0x81E1 — get_object_dude_distance(obj): return tile distance from obj to dude_obj.
       // Useful for range/proximity checks in AI and encounter scripts.
       ,0x81E1: bridged("get_object_dude_distance", 1) // get_object_dude_distance(obj) → tiles

       // 0x81E2 — get_critter_attack_mode(obj): return attack-mode index (0=unarmed).
       // Browser build: partial — no per-critter attack-mode flag; returns 0.
       ,0x81E2: bridged("get_critter_attack_mode_sfall", 1) // get_critter_attack_mode(obj) → 0

       // 0x81E3 — set_critter_attack_mode(obj, mode): set attack-mode index.
       // Browser build: no-op.
       ,0x81E3: bridged("set_critter_attack_mode_sfall", 2, false) // set_critter_attack_mode — no-op

       // 0x81E4 — get_map_first_run_sfall(): return 1 if map is being run for first time.
       // Alias of map_first_run (0x80A0); exposed as a dedicated sfall opcode.
       ,0x81E4: bridged("get_map_first_run_sfall", 0) // get_map_first_run() → 0|1

       // 0x81E5 — get_script_type_sfall(): return script type (0=map, 1=critter, etc.).
       // Browser build: partial — returns 0 (no per-script type tracking).
       ,0x81E5: bridged("get_script_type_sfall", 0) // get_script_type() → 0

       // 0x81E6 — get_tile_pid_sfall(tile, elev): return PID of first non-critter
       // object at tile/elev, or 0 if none.  Useful for floor-probe scripts.
       ,0x81E6: bridged("get_tile_pid_sfall", 2) // get_tile_pid(tile, elev) → pid | 0

       // 0x81E7 — get_critter_skill_points(obj, skill): return base skill-point
       // allocation for the given skill number on a critter.
       ,0x81E7: bridged("get_critter_skill_points", 2) // get_critter_skill_points(obj, skill) → points

       // -----------------------------------------------------------------------
       // Phase 57 — sfall extended opcodes 0x81E8–0x81EF
       // -----------------------------------------------------------------------

       // 0x81E8 — get_object_cost_sfall(obj): return base barter/store cost from
       // proto data.  Equivalent to proto_data(obj, ITEM_DATA_COST).
       ,0x81E8: bridged("get_object_cost_sfall", 1) // get_object_cost_sfall(obj) → cost

       // 0x81E9 — set_object_cost_sfall(obj, cost): override barter cost.
       // Browser build: no-op (proto data is read-only at runtime).
       ,0x81E9: bridged("set_object_cost_sfall", 2, false) // set_object_cost — no-op

       // 0x81EA — get_sfall_global_int_sfall(index): alias of get_sfall_global_int.
       // Alternate calling convention used by some script authors.
       ,0x81EA: bridged("get_sfall_global_int_sfall", 1) // get_sfall_global_int(idx) → value

       // 0x81EB — set_sfall_global_int_sfall(index, value): alias of set_sfall_global_int.
       ,0x81EB: bridged("set_sfall_global_int_sfall", 2, false) // set_sfall_global_int(idx, val)

       // 0x81EC — get_combat_difficulty_sfall(): return current difficulty (0=Easy,
       // 1=Normal, 2=Hard).  Browser build: always 1 (Normal).
       ,0x81EC: bridged("get_combat_difficulty_sfall", 0) // get_combat_difficulty() → 1

       // 0x81ED — game_in_combat_sfall(): return 1 if in turn-based combat, 0 otherwise.
       // Faster than checking GVAR_IN_COMBAT via global_var() in tight-loop AI scripts.
       ,0x81ED: bridged("game_in_combat_sfall", 0) // game_in_combat() → 0|1

       // 0x81EE — get_tile_fid_sfall(tile, elev): return the floor-tile FID at the
       // given tile number and elevation.  Browser build: returns 0 (no tile FID registry).
       ,0x81EE: bridged("get_tile_fid_sfall", 2) // get_tile_fid(tile, elev) → fid | 0

       // 0x81EF — set_tile_fid_sfall(tile, elev, fid): override floor-tile FID.
       // Browser build: no-op (no tile-override system).
       ,0x81EF: bridged("set_tile_fid_sfall", 3, false) // set_tile_fid — no-op

       // -----------------------------------------------------------------------
       // Phase 58 — sfall extended opcodes 0x81F0–0x81F7
       // -----------------------------------------------------------------------

       // 0x81F0 — get_critter_xp_sfall(obj): return critter's XP value from proto.
       // Used by loot/reward scripts; returns 0 for non-critters.
       ,0x81F0: bridged("get_critter_xp_sfall", 1) // get_critter_xp(obj) → xp

       // 0x81F1 — get_object_sid_sfall(obj): return the script SID for an object.
       // Returns 0 if the object has no script.
       ,0x81F1: bridged("get_object_sid_sfall", 1) // get_object_sid(obj) → sid | 0

       // 0x81F2 — get_game_mode_ex_sfall(): extended game mode bitfield; alias of
       // get_game_mode_sfall in the browser build (returns 0 = field mode).
       ,0x81F2: bridged("get_game_mode_ex_sfall", 0) // get_game_mode_ex() → 0

       // 0x81F3 — get_object_pid_sfall(obj): return the prototype ID of an object.
       // Equivalent to obj_pid (0x80D0) but exposed as a dedicated sfall opcode.
       ,0x81F3: bridged("get_object_pid_sfall", 1) // get_object_pid(obj) → pid

       // 0x81F4 — get_critter_kill_type_sfall(obj): return kill-type index for a
       // critter.  Used to attribute kill-counts per species.
       ,0x81F4: bridged("get_critter_kill_type_sfall", 1) // get_critter_kill_type(obj) → type

       // 0x81F5 — get_tile_at_sfall(x, y): convert hex-grid coordinates to a
       // Fallout 2 tile number.  Inverse of fromTileNum.
       ,0x81F5: bridged("get_tile_at_sfall", 2) // get_tile_at(x, y) → tile

       // 0x81F6 — get_object_type_sfall(obj): return the object type as an integer
       // (0=item, 1=critter, 2=scenery, 3=wall, 4=tile, 5=misc).
       ,0x81F6: bridged("get_object_type_sfall", 1) // get_object_type(obj) → type int

       // 0x81F7 — critter_at_sfall(tile, elev): return the first non-player critter
       // at the given tile/elevation, or 0 if none.
       ,0x81F7: bridged("critter_at_sfall", 2) // critter_at(tile, elev) → obj | 0

       // -----------------------------------------------------------------------
       // Phase 59 — sfall extended opcodes 0x81F8–0x81FF
       // -----------------------------------------------------------------------

       // 0x81F8 — get_critter_max_hp_sfall(obj): return critter's Max HP stat.
       ,0x81F8: bridged("get_critter_max_hp_sfall", 1) // get_critter_max_hp(obj) → hp

       // 0x81F9 — set_critter_max_hp_sfall(obj, hp): set critter's base Max HP.
       ,0x81F9: bridged("set_critter_max_hp_sfall", 2, false) // set_critter_max_hp(obj, hp)

       // 0x81FA — get_total_kills_sfall(): return total kills across all kill types.
       ,0x81FA: bridged("get_total_kills_sfall", 0) // get_total_kills() → count

       // 0x81FB — get_critter_extra_data_sfall(obj, field): return a proto extra field
       // by numeric index (0=age, 1=gender, 2=killType, 3=XPValue, 4=AI).
       ,0x81FB: bridged("get_critter_extra_data_sfall", 2) // get_critter_extra_data(obj, field) → val

       // 0x81FC — get_script_return_val_sfall(): return the stored sfall return value.
       ,0x81FC: bridged("get_script_return_val_sfall", 0) // get_script_return_val() → val

       // 0x81FD — set_script_return_val_sfall(val): store a script return value.
       ,0x81FD: bridged("set_script_return_val_sfall", 1, false) // set_script_return_val(val)

       // 0x81FE — get_active_map_id_sfall(): alias of get_current_map_id.
       ,0x81FE: bridged("get_active_map_id_sfall", 0) // get_active_map_id() → map id

       // 0x81FF — get_critter_range_sfall(obj): return max attack range of equipped weapon.
       ,0x81FF: bridged("get_critter_range_sfall", 1) // get_critter_range(obj) → range

       // -----------------------------------------------------------------------
       // Phase 60 — sfall extended opcodes 0x8200–0x8207
       // -----------------------------------------------------------------------

       // 0x8200 — get_critter_current_hp_sfall(obj): return critter's current HP.
       // Alias of critter_hp(obj) (opcode 0x8107) exposed as sfall convention.
       ,0x8200: bridged("get_critter_current_hp_sfall", 1) // get_critter_current_hp(obj) → hp

       // 0x8201 — get_critter_level_sfall(obj): return critter's current level.
       // Used by level-scaling and encounter scripts.
       ,0x8201: bridged("get_critter_level_sfall2", 1) // get_critter_level(obj) → level

       // 0x8202 — get_num_nearby_critters_sfall(obj, radius, team):
       // Return the number of living critters within radius hexes of obj that belong
       // to team.  Pass -1 for team to count all critters regardless of team.
       ,0x8202: bridged("get_num_nearby_critters_sfall", 3) // get_num_nearby_critters(obj, radius, team) → count

       // 0x8203 — is_critter_hostile_sfall(obj):
       // Return 1 if the critter is currently hostile to the player, else 0.
       ,0x8203: bridged("is_critter_hostile_sfall", 1) // is_critter_hostile(obj) → 0|1

       // 0x8204 — set_critter_hostile_sfall(obj, hostile):
       // Set the hostile flag on a critter.
       ,0x8204: bridged("set_critter_hostile_sfall", 2, false) // set_critter_hostile(obj, hostile)

       // 0x8205 — get_inven_slot_sfall(critter, slot):
       // Return the item in the given inventory slot (0=left, 1=right, 2=armor).
       // Returns 0 if the slot is empty or the object is not a critter.
       ,0x8205: bridged("get_inven_slot_sfall", 2) // get_inven_slot(critter, slot) → obj | 0

       // 0x8206 — get_critter_body_type_sfall(obj):
       // Return the critter body type (0=biped, 1=quadruped, 2=robotic).
       ,0x8206: bridged("get_critter_body_type_sfall", 1) // get_critter_body_type(obj) → int

       // 0x8207 — get_flags_sfall(obj):
       // Return the raw flags bitmask stored on a game object.
       ,0x8207: bridged("get_flags_sfall", 1) // get_flags(obj) → flags

       // -----------------------------------------------------------------------
       // Phase 61 — sfall extended opcodes 0x8208–0x820F
       // -----------------------------------------------------------------------

       // 0x8208 — get_critter_trait_sfall(obj, traitId):
       // Return 1 if the critter has the given character trait, 0 otherwise.
       ,0x8208: bridged("get_critter_trait_sfall", 2) // get_critter_trait(obj, id) → 0|1

       // 0x8209 — set_critter_trait_sfall(obj, traitId, value):
       // Add (value≠0) or remove (value=0) a trait from a critter.
       ,0x8209: bridged("set_critter_trait_sfall", 3, false) // set_critter_trait(obj, id, val)

       // 0x820A — get_critter_race_sfall(obj): return critter race index.
       ,0x820A: bridged("get_critter_race_sfall", 1) // get_critter_race(obj) → race

       // 0x820B — obj_has_trait_sfall(obj, traitId): alias of get_critter_trait_sfall.
       ,0x820B: bridged("obj_has_trait_sfall", 2) // obj_has_trait(obj, id) → 0|1

       // 0x820C — get_critter_move_ap_sfall(obj): return available move AP.
       ,0x820C: bridged("get_critter_move_ap_sfall", 1) // get_critter_move_ap(obj) → ap

       // 0x820D — get_critter_combat_ap_sfall(obj): return available combat AP.
       ,0x820D: bridged("get_critter_combat_ap_sfall", 1) // get_critter_combat_ap(obj) → ap

       // 0x820E — critter_knockout_sfall(obj): return 1 if critter is knocked out.
       ,0x820E: bridged("critter_knockout_sfall", 1) // critter_knockout(obj) → 0|1

       // 0x820F — get_map_script_id_sfall(): return current map script ID.
       ,0x820F: bridged("get_map_script_id_sfall", 0) // get_map_script_id() → sid

       // -----------------------------------------------------------------------
       // Phase 62 — sfall extended opcodes 0x8210–0x8217
       // -----------------------------------------------------------------------

       // 0x8210 — critter_is_fleeing_sfall(obj): return 1 if critter is fleeing.
       ,0x8210: bridged("critter_is_fleeing_sfall", 1) // critter_is_fleeing(obj) → 0|1

       // 0x8211 — get_perk_name_sfall(perkId): return perk display name string.
       ,0x8211: bridged("get_perk_name_sfall", 1) // get_perk_name(perkId) → string

       // 0x8212 — get_critter_perk_sfall(critter, perkId): return perk rank.
       ,0x8212: bridged("get_critter_perk_sfall", 2) // get_critter_perk(obj, id) → rank

       // 0x8213 — obj_is_open_sfall(obj): return 1 if object is open.
       ,0x8213: bridged("obj_is_open_sfall", 1) // obj_is_open(obj) → 0|1

       // 0x8214 — get_world_map_x_sfall(): return worldmap x position.
       ,0x8214: bridged("get_world_map_x_sfall", 0) // get_world_map_x() → x

       // 0x8215 — get_world_map_y_sfall(): return worldmap y position.
       ,0x8215: bridged("get_world_map_y_sfall", 0) // get_world_map_y() → y

       // 0x8216 — set_world_map_pos_sfall(x, y): set worldmap position.
       ,0x8216: bridged("set_world_map_pos_sfall", 2, false) // set_world_map_pos(x, y)

       // 0x8217 — get_object_weight_sfall(obj): return object weight in pounds.
       ,0x8217: bridged("get_object_weight_sfall", 1) // get_object_weight(obj) → pounds

       // -----------------------------------------------------------------------
       // Phase 63 — sfall extended opcodes 0x8218–0x821F
       // -----------------------------------------------------------------------

       // 0x8218 — get_year_sfall(): return current in-game year.
       ,0x8218: bridged("get_year_sfall", 0) // get_year() → year (2241+)

       // 0x8219 — get_month_sfall(): return current in-game month (1–12).
       ,0x8219: bridged("get_month_sfall", 0) // get_month() → month

       // 0x821A — get_day_sfall(): return current in-game day of month.
       ,0x821A: bridged("get_day_sfall", 0) // get_day() → day

       // 0x821B — get_time_sfall(): return current in-game time (HHMM).
       ,0x821B: bridged("get_time_sfall", 0) // get_time() → HHMM

       // 0x821C — get_critter_kill_type_sfall(obj): return kill-type constant.
       ,0x821C: bridged("get_critter_kill_type_sfall", 1) // get_critter_kill_type(obj) → type

       // 0x821D — get_npc_pids_sfall(): return NPC PID list (stub → 0).
       ,0x821D: bridged("get_npc_pids_sfall", 0) // get_npc_pids() → 0

       // 0x821E — get_proto_num_sfall(obj): return prototype number (PID).
       ,0x821E: bridged("get_proto_num_sfall", 1) // get_proto_num(obj) → pid

       // 0x821F — mark_area_known_sfall(areaID, markState): mark world-map area.
       ,0x821F: bridged("mark_area_known_sfall", 2, false) // mark_area_known(areaID, state)

       // -----------------------------------------------------------------------
       // Phase 64 — sfall extended opcodes 0x8220–0x8227
       // -----------------------------------------------------------------------

       // 0x8220 — get_cursor_mode_sfall(): return current cursor mode.
       ,0x8220: bridged("get_cursor_mode_sfall", 0) // get_cursor_mode() → 0

       // 0x8221 — set_cursor_mode_sfall(mode): set cursor mode (no-op).
       ,0x8221: bridged("set_cursor_mode_sfall", 1, false) // set_cursor_mode(mode)

       // 0x8222 — set_flags_sfall(obj, flags): set extended flags on object.
       ,0x8222: bridged("set_flags_sfall", 2, false) // set_flags(obj, flags)

       // 0x8223 — critter_skill_level_sfall(obj, skillId): return skill level.
       ,0x8223: bridged("critter_skill_level_sfall", 2) // critter_skill_level(obj, id) → level

       // 0x8224 — get_active_weapon_sfall(obj): return active weapon object.
       ,0x8224: bridged("get_active_weapon_sfall", 1) // get_active_weapon(obj) → obj|0

       // 0x8225 — get_inven_ap_cost_sfall(obj, item): return AP cost (stub 0).
       ,0x8225: bridged("get_inven_ap_cost_sfall", 2) // get_inven_ap_cost(obj, item) → 0

       // 0x8226 — obj_can_see_tile_sfall(obj, tileNum): LOS check to tile.
       ,0x8226: bridged("obj_can_see_tile_sfall", 2) // obj_can_see_tile(obj, tile) → 0|1

       // 0x8227 — get_map_enter_position_sfall(type): return map-entry position.
       ,0x8227: bridged("get_map_enter_position_sfall", 1) // get_map_enter_position(type) → -1

       // -----------------------------------------------------------------------
       // Phase 65 — sfall extended opcodes 0x8228–0x822F
       // -----------------------------------------------------------------------

       // 0x8228 — get_critter_name_sfall(obj): return critter display name.
       ,0x8228: bridged("get_critter_name_sfall", 1) // get_critter_name(obj) → name

       // 0x8229 — get_car_fuel_amount_sfall(): return car fuel level.
       ,0x8229: bridged("get_car_fuel_amount_sfall", 0) // get_car_fuel() → fuel

       // 0x822A — set_car_fuel_amount_sfall(amount): set car fuel level.
       ,0x822A: bridged("set_car_fuel_amount_sfall", 1, false) // set_car_fuel(amount)

       // 0x822B — get_critter_ai_packet_sfall(obj): return AI packet index.
       ,0x822B: bridged("get_critter_ai_packet_sfall", 1) // get_critter_ai_packet(obj) → id

       // 0x822C — set_critter_ai_packet_sfall(obj, id): set AI packet index.
       ,0x822C: bridged("set_critter_ai_packet_sfall", 2, false) // set_critter_ai_packet(obj, id)

       // 0x822D — obj_under_cursor_sfall(): return object under cursor (stub 0).
       ,0x822D: bridged("obj_under_cursor_sfall", 0) // obj_under_cursor() → 0

       // 0x822E — get_attack_weapon_sfall(obj, attackType): return weapon for attack type.
       ,0x822E: bridged("get_attack_weapon_sfall", 2) // get_attack_weapon(obj, type) → obj|0

       // 0x822F — get_tile_pid_at_sfall(tileNum, elevation): return PID at tile.
       ,0x822F: bridged("get_tile_pid_at_sfall", 2) // get_tile_pid_at(tile, elev) → pid

       // -----------------------------------------------------------------------
       // Phase 66 — sfall extended opcodes 0x8230–0x8237
       // -----------------------------------------------------------------------

       // 0x8230 — get_object_name_sfall(obj): return display name of any object.
       ,0x8230: bridged("get_object_name_sfall", 1) // get_object_name(obj) → name

       // 0x8231 — get_critter_gender_sfall(obj): return critter gender (0=male,1=female).
       ,0x8231: bridged("get_critter_gender_sfall", 1) // get_critter_gender(obj) → 0|1

       // 0x8232 — get_combat_round_sfall(): return current combat round (0 outside combat).
       ,0x8232: bridged("get_combat_round_sfall", 0) // get_combat_round() → round

       // 0x8233 — get_critter_action_points_sfall(obj): return critter AP.
       ,0x8233: bridged("get_critter_action_points_sfall", 1) // get_critter_ap(obj) → ap

       // 0x8234 — set_critter_action_points_sfall(obj, ap): set critter AP.
       ,0x8234: bridged("set_critter_action_points_sfall", 2, false) // set_critter_ap(obj, ap)

       // 0x8235 — get_critter_max_ap_sfall(obj): return critter max AP per turn.
       ,0x8235: bridged("get_critter_max_ap_sfall", 1) // get_critter_max_ap(obj) → max_ap

       // 0x8236 — get_critter_carry_weight_sfall(obj): return carry weight capacity.
       ,0x8236: bridged("get_critter_carry_weight_sfall", 1) // get_critter_carry_weight(obj) → lbs

       // 0x8237 — get_critter_current_weight_sfall(obj): return current carried weight.
       ,0x8237: bridged("get_critter_current_weight_sfall", 1) // get_critter_current_weight(obj) → lbs

       // -----------------------------------------------------------------------
       // Phase 67 — sfall extended opcodes 0x8238–0x823F
       // -----------------------------------------------------------------------

       // 0x8238 — get_critter_radiation_sfall(obj): return radiation level.
       ,0x8238: bridged("get_critter_radiation_sfall", 1) // get_critter_radiation(obj) → level

       // 0x8239 — set_critter_radiation_sfall(obj, val): set radiation level (absolute).
       ,0x8239: bridged("set_critter_radiation_sfall", 2, false) // set_critter_radiation(obj, val)

       // 0x823A — get_critter_poison_sfall(obj): return poison level.
       ,0x823A: bridged("get_critter_poison_sfall", 1) // get_critter_poison(obj) → level

       // 0x823B — set_critter_poison_sfall(obj, val): set poison level (absolute).
       ,0x823B: bridged("set_critter_poison_sfall", 2, false) // set_critter_poison(obj, val)

       // 0x823C — critter_in_party_sfall(obj): return 1 if critter is in party.
       ,0x823C: bridged("critter_in_party_sfall", 1) // critter_in_party(obj) → 0|1

       // 0x823D — get_critter_proto_flags_sfall(obj): return proto flags bitmask.
       ,0x823D: bridged("get_critter_proto_flags_sfall", 1) // get_critter_proto_flags(obj) → flags

       // 0x823E — set_critter_proto_flags_sfall(obj, flags): set proto flags.
       ,0x823E: bridged("set_critter_proto_flags_sfall", 2, false) // set_critter_proto_flags(obj, flags)

       // 0x823F — get_party_count_sfall(): return party member count.
       ,0x823F: bridged("get_party_count_sfall", 0) // get_party_count() → count

       // -----------------------------------------------------------------------
       // Phase 68 — sfall extended opcodes 0x8240–0x8247
       // -----------------------------------------------------------------------

       // 0x8240 — get_critter_damage_type_sfall(obj): return default damage type.
       ,0x8240: bridged("get_critter_damage_type_sfall", 1) // get_critter_damage_type(obj) → type

       // 0x8241 — set_critter_damage_type_sfall(obj, type): set damage type.
       ,0x8241: bridged("set_critter_damage_type_sfall", 2, false) // set_critter_damage_type(obj, type)

       // 0x8242 — get_combat_free_move_sfall(): return free tile-move count this turn.
       ,0x8242: bridged("get_combat_free_move_sfall", 0) // get_combat_free_move() → tiles

       // 0x8243 — set_combat_free_move_sfall(obj, tiles): set free tile-moves for critter.
       ,0x8243: bridged("set_combat_free_move_sfall", 2, false) // set_combat_free_move(obj, tiles)

       // 0x8244 — get_base_stat_sfall(obj, stat_id): return base stat value.
       ,0x8244: bridged("get_base_stat_sfall", 2) // get_base_stat(obj, stat_id) → value

       // 0x8245 — set_base_stat_sfall(obj, stat_id, value): set base stat value.
       ,0x8245: bridged("set_base_stat_sfall", 3, false) // set_base_stat(obj, stat_id, value)

       // 0x8246 — get_game_difficulty_sfall(): return game difficulty (0=easy,1=normal,2=hard).
       ,0x8246: bridged("get_game_difficulty_sfall", 0) // get_game_difficulty() → 0|1|2

       // 0x8247 — get_violence_level_sfall(): return violence level (0=minimal,1=normal,2=max).
       ,0x8247: bridged("get_violence_level_sfall", 0) // get_violence_level() → 0|1|2

       // -----------------------------------------------------------------------
       // Phase 69 — sfall extended opcodes 0x8248–0x824F
       // -----------------------------------------------------------------------

       // 0x8248 — get_map_limits_sfall(which): return map width (which=0) or height (which=1).
       ,0x8248: bridged("get_map_limits_sfall", 1) // get_map_limits(which) → 200

       // 0x8249 — obj_is_valid_sfall(obj): return 1 if obj is a valid game object.
       ,0x8249: bridged("obj_is_valid_sfall", 1) // obj_is_valid(obj) → 0|1

       // 0x824A — get_string_length_sfall(str): return length of string.
       ,0x824A: bridged("get_string_length_sfall", 1) // get_string_length(str) → length

       // 0x824B — get_char_code_sfall(str, pos): return char code at pos.
       ,0x824B: bridged("get_char_code_sfall", 2) // get_char_code(str, pos) → code|-1

       // 0x824C — string_contains_sfall(haystack, needle): 1 if found.
       ,0x824C: bridged("string_contains_sfall", 2) // string_contains(hay, needle) → 0|1

       // 0x824D — string_index_of_sfall(haystack, needle): first index or -1.
       ,0x824D: bridged("string_index_of_sfall", 2) // string_index_of(hay, needle) → index|-1

       // 0x824E — get_object_script_id_sfall(obj): return numeric script SID or -1.
       ,0x824E: bridged("get_object_script_id_sfall", 1) // get_object_script_id(obj) → sid|-1

       // 0x824F — get_script_field_sfall(field): return 0 (browser context field read).
       ,0x824F: bridged("get_script_field_sfall", 1) // get_script_field(field) → 0

       // -----------------------------------------------------------------------
       // Phase 70 — sfall extended opcodes 0x8250–0x8257
       // -----------------------------------------------------------------------

       // 0x8250 — get_object_art_fid_sfall(obj): return FID of game object.
       ,0x8250: bridged("get_object_art_fid_sfall", 1) // get_object_art_fid(obj) → fid

       // 0x8251 — set_object_art_fid_sfall(obj, fid): set art FID on game object.
       ,0x8251: bridged("set_object_art_fid_sfall", 2, false) // set_object_art_fid(obj, fid)

       // 0x8252 — get_item_subtype_sfall(obj): return item subtype index (-1 for non-items).
       ,0x8252: bridged("get_item_subtype_sfall", 1) // get_item_subtype(obj) → -1|0..6

       // 0x8253 — get_combat_target_sfall(obj): return combat target critter or 0.
       ,0x8253: bridged("get_combat_target_sfall", 1) // get_combat_target(obj) → obj|0

       // 0x8254 — set_combat_target_sfall(obj, target): set combat target for critter.
       ,0x8254: bridged("set_combat_target_sfall", 2, false) // set_combat_target(obj, target)

       // 0x8255 — combat_is_initialized_sfall(): return 1 if in combat, 0 otherwise.
       ,0x8255: bridged("combat_is_initialized_sfall", 0) // combat_is_initialized() → 0|1

       // 0x8256 — get_attack_type_sfall(obj, slot): return attack type for critter slot.
       ,0x8256: bridged("get_attack_type_sfall", 2) // get_attack_type(obj, slot) → 0

       // 0x8257 — get_map_script_idx_sfall(): return current map script index or -1.
       ,0x8257: bridged("get_map_script_idx_sfall", 0) // get_map_script_idx() → -1

       // -----------------------------------------------------------------------
       // Phase 71 — sfall extended opcodes 0x8258–0x825F
       // -----------------------------------------------------------------------

       // 0x8258 — get_critter_hurt_state_sfall(obj): return critter-state bitmask.
       ,0x8258: bridged("get_critter_hurt_state_sfall", 1) // get_critter_hurt_state(obj) → bitmask

       // 0x8259 — set_critter_hurt_state_sfall(obj, state): write critter-state bitmask.
       ,0x8259: bridged("set_critter_hurt_state_sfall", 2, false) // set_critter_hurt_state(obj, state)

       // 0x825A — get_critter_is_fleeing_sfall(obj): return 1 if critter is fleeing.
       ,0x825A: bridged("get_critter_is_fleeing_sfall", 1) // get_critter_is_fleeing(obj) → 0|1

       // 0x825B — set_critter_is_fleeing_sfall(obj, flag): set or clear fleeing state.
       ,0x825B: bridged("set_critter_is_fleeing_sfall", 2, false) // set_critter_is_fleeing(obj, flag)

       // 0x825C — get_tile_blocked_sfall(tileNum, elev): 1 if tile has blocking obj.
       ,0x825C: bridged("get_tile_blocked_sfall", 2) // get_tile_blocked(tile, elev) → 0|1

       // 0x825D — get_critter_hit_pts_sfall(obj): return Max HP for critter.
       ,0x825D: bridged("get_critter_hit_pts_sfall", 1) // get_critter_hit_pts(obj) → max_hp

       // 0x825E — critter_add_trait_sfall(obj, traitType, trait, amount): no-op.
       ,0x825E: bridged("critter_add_trait_sfall", 4, false) // critter_add_trait(obj, tt, t, amt)

       // 0x825F — get_num_new_obj_sfall(): return count of scripted objects created.
       ,0x825F: bridged("get_num_new_obj_sfall", 0) // get_num_new_obj() → 0

       // -----------------------------------------------------------------------
       // Phase 72 — sfall extended opcodes 0x8260–0x8267
       // -----------------------------------------------------------------------

       // 0x8260 — get_critter_weapon (second opcode alias for 0x81BE).
       ,0x8260: bridged("get_critter_weapon", 2) // get_critter_weapon(obj, slot) → obj|0

       // 0x8261 — set_critter_weapon_sfall(obj, slot, weapon): equip weapon in slot.
       ,0x8261: bridged("set_critter_weapon_sfall", 3, false) // set_critter_weapon(obj, slot, weapon)

       // 0x8262 — get_object_type_sfall (second opcode alias for 0x81F6).
       ,0x8262: bridged("get_object_type_sfall", 1) // get_object_type(obj) → 0|1|2|3

       // 0x8263 — get_critter_team (second opcode alias for 0x81C4).
       ,0x8263: bridged("get_critter_team", 1) // get_critter_team(obj) → team

       // 0x8264 — set_critter_team (second opcode alias for 0x81C5).
       ,0x8264: bridged("set_critter_team", 2, false) // set_critter_team(obj, team)

       // 0x8265 — get_ambient_light_sfall(): return ambient light level (0–65536).
       ,0x8265: bridged("get_ambient_light_sfall", 0) // get_ambient_light() → 0..65536

       // 0x8266 — set_ambient_light_sfall(level): set ambient light level.
       ,0x8266: bridged("set_ambient_light_sfall", 1, false) // set_ambient_light(level)

       // 0x8267 — get_map_local_var_sfall(idx): return map local variable by index.
       ,0x8267: bridged("get_map_local_var_sfall", 1) // get_map_local_var(idx) → value

       // -----------------------------------------------------------------------
       // Phase 73 — sfall extended opcodes 0x8268–0x826F
       // -----------------------------------------------------------------------

       // 0x8268 — get_critter_ap_sfall(obj): current combat AP or max AP stat.
       ,0x8268: bridged("get_critter_ap_sfall", 1) // get_critter_ap(obj) → ap

       // 0x8269 — set_critter_ap_sfall(obj, ap): set current combat AP.
       ,0x8269: bridged("set_critter_ap_sfall", 2, false) // set_critter_ap(obj, ap)

       // 0x826A — get_object_flags_sfall(obj): return Fallout 2 flags bitmask.
       ,0x826A: bridged("get_object_flags_sfall", 1) // get_object_flags(obj) → flags

       // 0x826B — set_object_flags_sfall(obj, flags): write flags bitmask.
       ,0x826B: bridged("set_object_flags_sfall", 2, false) // set_object_flags(obj, flags)

       // 0x826C — critter_is_dead_sfall(obj): 1 if critter is dead, 0 otherwise.
       ,0x826C: bridged("critter_is_dead_sfall", 1) // critter_is_dead(obj) → 0|1

       // 0x826D — get_obj_light_level_sfall(obj): return object light emission level (0–65536).
       ,0x826D: bridged("get_obj_light_level_sfall", 1) // get_obj_light_level(obj) → 0..65536

       // 0x826E — set_obj_light_level_sfall(obj, level): set object light emission level.
       ,0x826E: bridged("set_obj_light_level_sfall", 2, false) // set_obj_light_level(obj, level)

       // 0x826F — get_elevation_sfall(): return current map elevation (0–2).
       ,0x826F: bridged("get_elevation_sfall", 0) // get_elevation() → 0|1|2

       // -----------------------------------------------------------------------
       // Phase 74 — sfall extended opcodes 0x8270–0x8277
       // -----------------------------------------------------------------------

       // 0x8270 — get_tile_at_object_sfall(obj): tile number of obj or -1
       ,0x8270: bridged("get_tile_at_object_sfall", 1) // get_tile_at_object(obj) → tile|-1

       // 0x8271 — critter_get_flee_state_sfall(obj): 1 if fleeing, 0 otherwise
       ,0x8271: bridged("critter_get_flee_state_sfall", 1) // critter_get_flee_state(obj) → 0|1

       // 0x8272 — critter_set_flee_state_sfall(obj, fleeing): set flee flag
       ,0x8272: bridged("critter_set_flee_state_sfall", 2, false) // critter_set_flee_state(obj, val)

       // 0x8273 — get_combat_difficulty_sfall(): 0=easy, 1=normal, 2=hard
       ,0x8273: bridged("get_combat_difficulty_sfall", 0) // get_combat_difficulty() → 1

       // 0x8274 — get_object_proto_sfall(obj): return proto data or 0
       ,0x8274: bridged("get_object_proto_sfall", 1) // get_object_proto(obj) → 0

       // 0x8275 — get_critter_hit_chance_sfall(attacker, target): hit chance 0–100
       ,0x8275: bridged("get_critter_hit_chance_sfall", 2) // get_critter_hit_chance(a, t) → 0..100

       // 0x8276 — get_tile_distance_sfall(tile1, tile2): hex distance
       ,0x8276: bridged("get_tile_distance_sfall", 2) // get_tile_distance(t1, t2) → dist

       // 0x8277 — get_tile_in_direction_sfall(tile, dir, count): tile alias
       ,0x8277: bridged("get_tile_in_direction_sfall", 3) // get_tile_in_direction(t, d, n) → tile

       // -----------------------------------------------------------------------
       // Phase 75 — sfall extended opcodes 0x8278–0x827F
       // -----------------------------------------------------------------------

       // 0x8278 — get_critter_knockout_sfall(obj): 1 if critter is knocked out, 0 otherwise.
       ,0x8278: bridged("get_critter_knockout_sfall", 1) // get_critter_knockout(obj) → 0|1

       // 0x8279 — get_critter_knockdown_sfall(obj): 1 if critter is knocked down, 0 otherwise.
       ,0x8279: bridged("get_critter_knockdown_sfall", 1) // get_critter_knockdown(obj) → 0|1

       // 0x827A — get_critter_crippled_legs_sfall(obj): bitmask, bit0=left, bit1=right
       ,0x827A: bridged("get_critter_crippled_legs_sfall", 1) // get_critter_crippled_legs(obj) → mask

       // 0x827B — get_critter_crippled_arms_sfall(obj): bitmask, bit0=left, bit1=right
       ,0x827B: bridged("get_critter_crippled_arms_sfall", 1) // get_critter_crippled_arms(obj) → mask

       // 0x827C — get_critter_dead_sfall(obj): 1 if critter is dead, 0 otherwise.
       ,0x827C: bridged("get_critter_dead_sfall", 1) // get_critter_dead(obj) → 0|1

       // 0x827D — get_map_loaded_sfall(): 1 if map was loaded from save (alias of game_loaded).
       ,0x827D: bridged("get_map_loaded_sfall", 0) // get_map_loaded() → 0|1

       // 0x827E — get_critter_poison_level_sfall(obj): current poison level.
       ,0x827E: bridged("get_critter_poison_level_sfall", 1) // get_critter_poison_level(obj) → int

       // 0x827F — get_critter_radiation_level_sfall(obj): current radiation level.
       ,0x827F: bridged("get_critter_radiation_level_sfall", 1) // get_critter_radiation_level(obj) → int

       // -----------------------------------------------------------------------
       // Phase 76 — sfall extended opcodes 0x8280–0x8287
       // -----------------------------------------------------------------------

       // 0x8280 — get_last_target_sfall(obj): alias for get_last_target (BLK-117).
       ,0x8280: bridged("get_last_target_sfall", 1) // get_last_target_sfall(obj) → last target or 0

       // 0x8281 — get_last_attacker_sfall(obj): alias for get_last_attacker (BLK-117).
       ,0x8281: bridged("get_last_attacker_sfall", 1) // get_last_attacker_sfall(obj) → last attacker or 0

       // 0x8282 — get_critter_level_sfall(obj): return the critter's level (1-based).
       ,0x8282: bridged("get_critter_level_sfall", 1) // get_critter_level(obj) → level

       // 0x8283 — get_critter_current_xp_sfall(obj): return the critter's current (accumulated) XP.
       ,0x8283: bridged("get_critter_current_xp_sfall", 1) // get_critter_current_xp(obj) → xp

       // 0x8284 — set_critter_level_sfall(obj, level): set critter level.
       ,0x8284: bridged("set_critter_level_sfall", 2, false) // set_critter_level(obj, level) — partial

       // 0x8285 — get_critter_base_stat_sfall(obj, stat): return base stat before modifiers.
       ,0x8285: bridged("get_critter_base_stat_sfall", 2) // get_critter_base_stat(obj, stat) → value

       // 0x8286 — set_critter_base_stat_sfall(obj, stat, value): set base stat.
       ,0x8286: bridged("set_critter_base_stat_sfall", 3, false) // set_critter_base_stat(obj, stat, val)

       // 0x8287 — get_obj_weight_sfall(obj): return object weight in lbs.
       ,0x8287: bridged("get_obj_weight_sfall", 1) // get_obj_weight(obj) → weight
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