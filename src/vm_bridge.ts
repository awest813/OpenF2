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
       // Scripts use this to check whether a level-up perk selection is waiting.
       // Browser build has no perk-selection UI; return 0 (no perks owed).
       ,0x81AE: function() { this.push(0) } // get_perk_owed() → 0

       // 0x81AF — set_perk_owed(n): set number of pending perk-selection points.
       // No-op in browser build (no perk-selection UI).
       ,0x81AF: function() { this.pop() } // set_perk_owed(n) — no-op

       // 0x81B0 — get_last_target(obj): return the last critter targeted in combat
       // by obj.  Returns 0 when no combat target is available.
       ,0x81B0: function() { this.pop(); this.push(0) } // get_last_target(obj) → 0

       // 0x81B1 — get_last_attacker(obj): return the last critter that attacked obj.
       // Returns 0 when no attacker is recorded.
       ,0x81B1: function() { this.pop(); this.push(0) } // get_last_attacker(obj) → 0

       // 0x81B2 — art_cache_flush(): flush the internal art/animation cache.
       // No-op in browser build (no separate art cache to manage).
       ,0x81B2: function() {} // art_cache_flush() — no-op

       // 0x81B3 — game_loaded(): returns 1 if the game was freshly loaded (i.e.
       // the current map entry is from a save-load, not a first-time visit).
       // Browser build returns 0 (treated as first-time visit always).
       ,0x81B3: function() { this.push(0) } // game_loaded() → 0 (first-time entry)

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