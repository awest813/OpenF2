/**
 * Machine-readable checklist of all known Fallout 2 scripting stubs and
 * unsupported opcodes/procedures in the OpenF2 engine.
 *
 * Each entry records:
 *   - `id`         : unique key (opcode hex or procedure name)
 *   - `kind`       : 'opcode' | 'procedure' | 'metarule'
 *   - `description`: human-readable explanation
 *   - `status`     : 'stub' | 'partial' | 'implemented'
 *   - `frequency`  : rough call frequency from Fallout 2 data ('high'|'medium'|'low')
 *   - `impact`     : progression impact if missing ('blocker'|'high'|'medium'|'low')
 *
 * Runtime instrumentation is provided via `recordStubHit` / `drainStubHits`.
 * These are automatically called by the `stub()` helper in scripting.ts.
 * They are deterministic FIFO queues — safe to use in tests.
 */

// ---------------------------------------------------------------------------
// Checklist entries
// ---------------------------------------------------------------------------

export type StubStatus = 'stub' | 'partial' | 'implemented'
export type StubFrequency = 'high' | 'medium' | 'low'
export type StubImpact = 'blocker' | 'high' | 'medium' | 'low'

export interface StubEntry {
    id: string
    kind: 'opcode' | 'procedure' | 'metarule'
    description: string
    status: StubStatus
    frequency: StubFrequency
    impact: StubImpact
}

/**
 * SCRIPTING_STUB_CHECKLIST — single source of truth for all known gaps.
 *
 * Sorted by impact DESC, frequency DESC.
 */
export const SCRIPTING_STUB_CHECKLIST: readonly StubEntry[] = Object.freeze([
    // -----------------------------------------------------------------------
    // Procedures — high frequency / high impact
    // -----------------------------------------------------------------------
    {
        id: 'proto_data',
        kind: 'procedure',
        description:
            'Read proto data fields (e.g. weight, size, DR, name) for any object PID. Used pervasively in map and critter scripts.',
        status: 'partial',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj',
        kind: 'procedure',
        description: 'Player uses an object. Delegates to object use flow (`obj.use`) and uses source_obj when it is a critter; falls back to player.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj_on_obj',
        kind: 'procedure',
        description: 'Use one object on another (e.g. key on lock, stimpack on critter). Prefers target `use_obj_on_p_proc`; falls back to `use_p_proc`.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'use_obj_on_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on a target object when another item is used on it (e.g. key on lock, stimpack on critter). Sets source_obj to the applied item.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'push_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on an NPC when the player pushes them. Sets source_obj to the pusher. Returns _didOverride to suppress default bump.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'is_dropping_p_proc',
        kind: 'procedure',
        description: 'Procedure triggered on an item when it is about to be dropped. Sets source_obj to the dropper. Returns _didOverride to cancel the drop.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'tile_is_visible',
        kind: 'procedure',
        description: 'Returns whether a tile is currently visible to the player (not in fog of war). Always returns 1 (partial).',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_animate',
        kind: 'procedure',
        description: 'Play a one-shot scripted animation on an object. Used extensively for NPC reactions and environmental effects.',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'reg_anim_func',
        kind: 'procedure',
        description:
            'Register a function callback in the animation queue (ANIM_BEGIN/ANIM_COMPLETE signals). ' +
            'ANIM_COMPLETE (signal=2) callbacks are now called immediately since the browser build ' +
            'has no async animation queue, preventing script continuation logic from being blocked.',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Metarule sub-cases
    // -----------------------------------------------------------------------
    {
        id: 'metarule_17',
        kind: 'metarule',
        description: 'METARULE_IS_AREA_KNOWN(17): check if a world-map area has been discovered. Reads globalState.mapAreas[target].state; returns 0 for unknown areas.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'metarule_46',
        kind: 'metarule',
        description: 'METARULE_CURRENT_TOWN(46): return the current city/town ID. Returns currentMapID. Used by town-reputation and encounter scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_18',
        kind: 'metarule',
        description: 'METARULE_CRITTER_ON_DRUGS(18): check if a critter is under drug influence. Returns 0 (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Procedures — medium frequency / medium impact
    // -----------------------------------------------------------------------
    {
        id: 'anim',
        kind: 'procedure',
        description: 'Trigger an arbitrary scripted animation on an object. Handles rotation (1000) and frame-set (1010) cleanly; stubs unknown animation codes.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'inven_cmds',
        kind: 'procedure',
        description: 'Execute inventory command on a critter. INVEN_CMD_INDEX_PTR (13) returns inventory entry by index; other commands remain stubbed.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_inven_obj_worn',
        kind: 'procedure',
        description: 'critter_inven_obj with INVEN_TYPE_WORN (0): get currently worn armor. Returns equippedArmor field.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'gsay_message',
        kind: 'procedure',
        description: 'Display a floating dialogue message (no option, just [Done]). Calls uiSetDialogueReply with the looked-up message string.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'gdialog_set_barter_mod',
        kind: 'procedure',
        description: 'Set a one-time barter modifier for the current dialogue. Stored in _barterMod on the script object.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    {
        id: 'has_trait_perk',
        kind: 'procedure',
        description: 'has_trait TRAIT_PERK (type 0): returns the critter\'s perk rank for the given perk ID from perkRanks. 0 = not present.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'critter_add_trait_perk',
        kind: 'procedure',
        description: 'critter_add_trait TRAIT_PERK (type 0): sets the perk rank for a perk ID on the critter via perkRanks. Clamped to >= 0.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'inven_cmds_hands',
        kind: 'procedure',
        description: 'inven_cmds INVEN_CMD_LEFT_HAND (11) and INVEN_CMD_RIGHT_HAND (12): return the critter\'s currently equipped left/right hand items.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'game_time_hour_dynamic',
        kind: 'procedure',
        description: 'game_time_hour field in map-update and enter-map triggers now computed from gameTickTime instead of hardcoded 1200.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'metarule_21',
        kind: 'metarule',
        description: 'METARULE_VENDOR_CAPS(21): return vendor\'s available caps budget. Returns 99999 (large default; no vendor cap system yet).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule_24',
        kind: 'metarule',
        description: 'METARULE_PARTY_COUNT(24): return number of NPCs currently in the party. Uses gParty.getPartyMembers().length.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'proto_data_flags2',
        kind: 'procedure',
        description: 'proto_data data_member 7 (PROTO_DATA_FLAGS2): extended object flags bitfield. Returns pro.extra.flags2 or pro.flags2.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'mapvars_persistence',
        kind: 'procedure',
        description: 'Map variables (MVAR_*) are now persisted in save schema v7. getMapVars()/setMapVars() round-trip through saveload.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'string_compare',
        kind: 'opcode',
        description: 'sfall 0x8175: string_compare(str1, str2, caseSensitive) → 0 if equal. Used by scripts doing string equality checks.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'substr',
        kind: 'opcode',
        description: 'sfall 0x8176: substr(str, start, len) → substring. Used by scripts doing string manipulation.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_uptime',
        kind: 'opcode',
        description: 'sfall 0x8177: get_uptime() → session time in milliseconds. Used by anti-exploit and timing scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Phase 19 — weapon ammo state, anim de-stub, proto_data extensions
    // -----------------------------------------------------------------------
    {
        id: 'get_weapon_ammo_pid',
        kind: 'opcode',
        description: 'sfall 0x8178: get_weapon_ammo_pid(weapon) → ammo type PID loaded in weapon. Falls back to proto ammoPID when no runtime ammo set.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_weapon_ammo_pid',
        kind: 'opcode',
        description: 'sfall 0x8179: set_weapon_ammo_pid(weapon, pid) — set the ammo type PID loaded in a weapon. Stored in weapon.extra.ammoType.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_weapon_ammo_count',
        kind: 'opcode',
        description: 'sfall 0x817A: get_weapon_ammo_count(weapon) → rounds currently loaded in the weapon. Reads weapon.extra.ammoLoaded.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_weapon_ammo_count',
        kind: 'opcode',
        description: 'sfall 0x817B: set_weapon_ammo_count(weapon, count) — set rounds loaded in a weapon. Writes weapon.extra.ammoLoaded.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_mouse_tile_num',
        kind: 'opcode',
        description: 'sfall 0x817C: get_mouse_tile_num() → tile number under mouse cursor (-1 if none). Returns -1 in VM context.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'anim_standard_codes',
        kind: 'procedure',
        description: 'anim() with standard ANIM_* constants (0=stand, 1=walk, 2-99). Code 0 resets to idle; codes 1-99 are logged silently without stub warnings.',
        status: 'partial',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'get_pc_stat_max',
        kind: 'procedure',
        description: 'get_pc_stat(PCSTAT_max_pc_stat=5): returns 5 (the count of valid PC stat indices 0–4).',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'inven_cmds_nav',
        kind: 'procedure',
        description: 'inven_cmds INVEN_CMD_FIRST(0), INVEN_CMD_LAST(1), INVEN_CMD_PREV(2), INVEN_CMD_NEXT(3): inventory cursor navigation commands.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'proto_data_weapon_extended',
        kind: 'procedure',
        description: 'proto_data data_member 12 (animCode), 17 (attack_mode_1), 18 (attack_mode_2), 19 (projPID), 20 (minST), 32 (armor AC), 33 (armor DR Normal), 34 (burst rounds).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // sfall opcodes — implemented
    // -----------------------------------------------------------------------
    {
        id: 'get_critter_base_stat',
        kind: 'opcode',
        description: 'sfall 0x8166: get_critter_base_stat(critter, stat) — read a base SPECIAL/derived stat for any critter (not just PC). Uses the same statMap as get_critter_stat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_base_stat',
        kind: 'opcode',
        description: 'sfall 0x8167: set_critter_base_stat(critter, stat, value) — write a base SPECIAL/derived stat for any critter. Mirrors set_pc_base_stat but for arbitrary critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'in_combat',
        kind: 'opcode',
        description: 'sfall 0x8168: in_combat() → 1 when the engine is in combat, 0 otherwise. Used by scripts to gate combat-only logic.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_current_town',
        kind: 'opcode',
        description: 'sfall 0x8169: get_current_town() → current map/area ID. Sfall-style shortcut for metarule(46, 0). Used by town-scoped NPC dialogue.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_is_dead',
        kind: 'opcode',
        description: 'sfall 0x816A: critter_is_dead(obj) → 1 if the critter\'s HP <= 0, 0 otherwise. Used by combat and scripted encounter checks.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_dialogue_active',
        kind: 'opcode',
        description: 'sfall 0x816B: get_dialogue_active() → 1 if a dialogue is currently open, 0 otherwise. Used to guard dialogue-only script branches.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'abs_value',
        kind: 'opcode',
        description: 'sfall 0x816C: abs_value(x) → |x|. Returns the absolute value of a number. Used by scripts performing distance/difference calculations.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'string_length',
        kind: 'opcode',
        description: 'sfall 0x816D: string_length(str) → length of string as integer. Used by scripts doing string manipulation or validation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'pow',
        kind: 'opcode',
        description: 'sfall 0x816E: pow(base, exp) → base^exp. Exponentiation for script formula calculations.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'obj_is_valid',
        kind: 'opcode',
        description: 'sfall 0x816F: obj_is_valid(obj) → 1 if obj is a valid game object, 0 otherwise. Used as a safe null-check before using objects in scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_critter_kills',
        kind: 'opcode',
        description: 'sfall 0x8170: get_critter_kills(kill_type) → number of kills of given kill type. Used by karma/perk calculations and scripted kill-count checks.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'set_critter_kills',
        kind: 'opcode',
        description: 'sfall 0x8171: set_critter_kills(kill_type, amount) — overwrite kill count for a type. Used by scripted tests and quest reward scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_critter_body_type',
        kind: 'opcode',
        description: 'sfall 0x8172: get_critter_body_type(obj) → body-type index (0=biped, 1=quadruped, 2=robotic, …). Used by combat AI and animation gating scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'floor2',
        kind: 'opcode',
        description: 'sfall 0x8173: floor2(x) → Math.floor(x). Integer floor used by drug-duration and formula scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'obj_count_by_pid',
        kind: 'opcode',
        description: 'sfall 0x8174: obj_count_by_pid(pid) → number of live objects on the current map with matching PID. Used by scripted encounter clean-up.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Procedures — lower frequency / lower impact
    // -----------------------------------------------------------------------
    {
        id: 'obj_can_hear_obj',
        kind: 'procedure',
        description: 'Check whether obj can hear target (vs. line-of-sight version). Implemented as short-range proximity hearing (<= 12 hexes).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_worn',
        kind: 'procedure',
        description: 'has_trait TRAIT_OBJECT supports INVEN_TYPE_WORN (0), OBJECT_AI_PACKET (5), and OBJECT_TEAM_NUM (6) for critters.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_add_trait_weight',
        kind: 'procedure',
        description: 'critter_add_trait OBJECT_CUR_WEIGHT (669): set critter carry weight via stats.setBase(\'Carry\', amount). Clamped to >= 0.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'gfade_out',
        kind: 'procedure',
        description: 'gfade_out(time): screen fade-out over `time` game ticks. Logged but not visually implemented (no FMV/fade pipeline yet).',
        status: 'partial',
        frequency: 'high',
        impact: 'low',
    },
    {
        id: 'gfade_in',
        kind: 'procedure',
        description: 'gfade_in(time): screen fade-in over `time` game ticks. Logged but not visually implemented.',
        status: 'partial',
        frequency: 'high',
        impact: 'low',
    },
    {
        id: 'play_gmovie',
        kind: 'procedure',
        description: 'play_gmovie(id): play an FMV cut-scene by ID. Logged but skipped (no FMV pipeline in browser build).',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Phase 20 — metarule completeness, has_trait extensions, sfall 0x817D–0x817F
    // -----------------------------------------------------------------------
    {
        id: 'metarule_30',
        kind: 'metarule',
        description: 'METARULE_CHECK_WEAPON_LOADED(30): 1 if the weapon object passed as target has ammo loaded (extra.ammoLoaded > 0), 0 otherwise.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_35',
        kind: 'metarule',
        description: 'METARULE_COMBAT_DIFFICULTY(35): returns combat difficulty (0=easy, 1=normal, 2=hard). Returns 1 (normal) — partial.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'metarule_44',
        kind: 'metarule',
        description: 'METARULE_WHO_ON_DRUGS(44): returns 1 if the target critter is under drug influence. Returns 0 — no drug system implemented.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule_47',
        kind: 'metarule',
        description: 'METARULE_MAP_KNOWN(47): 1 if the world-map area with the given numeric map ID is discovered. Mirrors case 17 logic.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_55',
        kind: 'metarule',
        description: 'METARULE_GAME_DIFFICULTY(55): returns game difficulty (0=easy, 1=normal, 2=hard). Returns 1 (normal) — partial.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'metarule3_101',
        kind: 'metarule',
        description: 'METARULE3_RAND(101): random integer in range [obj..userdata] inclusive. Uses getRandomInt(min, max).',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'metarule3_107',
        kind: 'metarule',
        description: 'METARULE3_TILE_VISIBLE(107): returns 1 if the given tile is currently visible. Always 1 — no fog-of-war system yet (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_hands_count',
        kind: 'procedure',
        description: 'has_trait TRAIT_OBJECT cases 1 (INVEN_TYPE_RIGHT_HAND), 2 (INVEN_TYPE_LEFT_HAND), 3 (INVEN_TYPE_INV_COUNT): hand-equip and inventory count queries.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'has_trait_flat_noblock',
        kind: 'procedure',
        description: 'has_trait TRAIT_OBJECT cases 667 (OBJECT_IS_FLAT) and 668 (OBJECT_NO_BLOCK): flat/blocking flags read from obj.extra.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_add_trait_flat_noblock',
        kind: 'procedure',
        description: 'critter_add_trait TRAIT_OBJECT cases 667 (OBJECT_IS_FLAT) and 668 (OBJECT_NO_BLOCK): write flat/blocking flags to obj.extra.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_critter_name',
        kind: 'opcode',
        description: 'sfall 0x817D: get_critter_name(obj) → display name string of any game object. Returns empty string for non-objects.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_game_mode',
        kind: 'opcode',
        description: 'sfall 0x817E: get_game_mode() → bitmask of active game modes. Returns 0 — no mode-flags register in engine (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'set_global_script_repeat',
        kind: 'opcode',
        description: 'sfall 0x817F: set_global_script_repeat(ms) — set the repeat interval for the global map script in milliseconds. No-op — no global script ticker (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Phase 21 — critter_inven_obj INV_COUNT, proto_data armor DR, obj_item_subtype,
    //            sfall 0x8180–0x8182
    // -----------------------------------------------------------------------
    {
        id: 'critter_inven_obj_inv_count',
        kind: 'procedure',
        description: 'critter_inven_obj(critter, INVEN_TYPE_INV_COUNT=-2): return total number of items in critter inventory. Was returning 0 with a warning.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'proto_data_armor_dr',
        kind: 'procedure',
        description: 'proto_data data_member 34-39: ARMOR_DATA_DR_LASER/FIRE/PLASMA/ELECTRICAL/EMP/EXPLOSIVE. Case 34 dispatches by subtype to disambiguate weapon burst_rounds vs armor DR Laser.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'obj_item_subtype_fallback',
        kind: 'procedure',
        description: 'obj_item_subtype: silent fallback returns 0 (rather than stub) when object has no pro and no recognized string subtype.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'get_critter_skill',
        kind: 'opcode',
        description: 'sfall 0x8180: get_critter_skill(critter, skill_num) → derived skill value for any critter. Mirrors has_skill().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_skill_points',
        kind: 'opcode',
        description: 'sfall 0x8181: set_critter_skill_points(critter, skill_num, value) — set base skill allocation directly on any critter.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_light_level',
        kind: 'opcode',
        description: 'sfall 0x8182: get_light_level() → current ambient light level (0–65536). Reads globalState.ambientLightLevel.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Phase 22 — proto_data armor DT fields, metarule3 IDs 102–105,
    //            sfall opcodes 0x8183–0x8185
    // -----------------------------------------------------------------------
    {
        id: 'proto_data_armor_dt',
        kind: 'procedure',
        description: 'proto_data data_member 40-46: ARMOR_DATA_DT_NORMAL through ARMOR_DATA_DT_EXPLOSIVE. Damage Threshold values for all 7 damage types on armor protos.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'proto_data_armor_perk',
        kind: 'procedure',
        description: 'proto_data data_member 47: ARMOR_DATA_PERK / WEAPON_DATA_PERK — perk PID granted by wearing/wielding this item. Returns -1 when no perk is assigned.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'proto_data_critter_xp_kill',
        kind: 'procedure',
        description: 'proto_data data_member 48 (CRITTER_DATA_EXPERIENCE) and 49 (CRITTER_DATA_KILL_TYPE): base XP reward and kill-type category for critter protos.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule3_102',
        kind: 'metarule',
        description: 'METARULE3_CHECK_WALKING_ALLOWED(102): 1 if movement is allowed at the given tile. No path-blocking registry in VM; always returns 1 (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule3_103',
        kind: 'metarule',
        description: 'METARULE3_CRITTER_IN_COMBAT(103): 1 if the given critter is in combat. Uses active combat roster membership when available; falls back to global inCombat in legacy contexts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule3_104',
        kind: 'metarule',
        description: 'METARULE3_TILE_LINE_OF_SIGHT(104): 1 if there is line-of-sight between two tiles. No LOS system in script VM yet; always returns 1 (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule3_105',
        kind: 'metarule',
        description: 'METARULE3_OBJ_CAN_HEAR_OBJ(105): 1 if source object can hear target (proximity <= 12 hexes). Mirrors obj_can_hear_obj logic.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_critter_hp',
        kind: 'opcode',
        description: 'sfall 0x8183: get_critter_hp(obj) → current HP of critter. Convenience wrapper for get_critter_stat(obj, STAT_HP/35).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_hp',
        kind: 'opcode',
        description: 'sfall 0x8184: set_critter_hp(obj, hp) — set current HP of a critter directly. Writes stats.base[\'HP\'] clamped to >= 0.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_critter_max_ap',
        kind: 'opcode',
        description: 'sfall 0x8185: get_critter_max_ap(obj) → max action points for a critter. Returns derived AP stat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    // -----------------------------------------------------------------------
    // Phase 23 — TRAIT_CHAR, list opcodes, metarule expansion
    // -----------------------------------------------------------------------
    {
        id: 'has_trait_char',
        kind: 'procedure',
        description:
            'has_trait(TRAIT_CHAR=2, obj, traitId): check if the critter has the given character-creation trait (0–15). ' +
            'Reads critter.charTraits (Set<number>). Required for scripts that branch on player mutation choices.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'critter_add_trait_char',
        kind: 'procedure',
        description:
            'critter_add_trait(obj, TRAIT_CHAR=2, traitId, amount): grant (amount>0) or revoke (amount<=0) a ' +
            'character-creation trait on a critter.  Writes critter.charTraits (Set<number>).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'list_begin',
        kind: 'opcode',
        description:
            'sfall 0x8186: list_begin(type) → first object in a new iteration over game objects. ' +
            'type: 0=LIST_ALL, 1=LIST_CRITTERS, 2=LIST_GROUNDITEMS. Iterates the current elevation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'list_next',
        kind: 'opcode',
        description:
            'sfall 0x8187: list_next() → advance the object-list iterator and return the next object ' +
            '(null/0 when exhausted). Must be called after list_begin().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'list_end',
        kind: 'opcode',
        description:
            'sfall 0x8188: list_end() — dispose the current object-list iterator. ' +
            'Should always be paired with list_begin() to avoid iterator leaks.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'metarule_1_to_13',
        kind: 'metarule',
        description:
            'metarule IDs 1–13: signal_end_game, timer_fired, first_time, radiation_gauge, movie, ' +
            'armor_worn, critter_in_party, critter_on_team, cur_town, tile_locked, map_info, ' +
            'critter_reaction, critter_reaction_to_pc. All implemented with safe defaults or real values.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_16_20_25_32',
        kind: 'metarule',
        description:
            'metarule IDs 16 (is_big_gun), 19 (party_follow), 20 (is_big_gun_equipped), ' +
            '25 (party_member_state), 26 (critical_hit_adjust), 27 (hostile_to_pc), ' +
            '28 (critter_state), 29 (area_reachable), 31–43 (various critter conditions), ' +
            '45 (blinded), 50–54 (misc). All implemented with safe defaults.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'save_schema_v9_char_traits',
        kind: 'procedure',
        description:
            'Save schema v9: playerCharTraits (number[]) added to SaveGame. Persists player ' +
            'character-creation trait choices across save/load cycles so has_trait(TRAIT_CHAR) ' +
            'returns correct results after loading a save.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },

    // -----------------------------------------------------------------------
    // Phase 24 — browser-runtime blockers, critter_state, anim, proto_data 13,
    //            metarule3 108–115, sfall opcodes 0x8189–0x818A
    // -----------------------------------------------------------------------
    {
        id: 'metarule_49_damage_types',
        kind: 'metarule',
        description:
            'METARULE_W_DAMAGE_TYPE(49): map weapon damage-type string to FO2 DMG_* integer ' +
            '(0=Normal, 1=Laser, 2=Fire, 3=Plasma, 4=Electrical, 5=EMP, 6=Explosion). ' +
            'Previously only "explosion" was handled; all types now covered.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'objectGetDamageType_safe_fallback',
        kind: 'procedure',
        description:
            'objectGetDamageType(): returns "Normal" as a safe fallback when the object has ' +
            'no dmgType property, instead of throwing a runtime exception. Prevents crashes ' +
            'when metarule(49) is called on non-weapon objects or untyped objects.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'spatial_no_throw',
        kind: 'procedure',
        description:
            'spatial(): no longer throws when the spatial object has no script or no ' +
            'spatial_p_proc.  Returns silently so map entry is not aborted by spatial ' +
            'objects that lack a scripted trigger.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'combatEvent_no_throw',
        kind: 'procedure',
        description:
            'combatEvent(): no longer throws when the target object has no script. ' +
            'Returns false (no override) gracefully so combat proceeds normally.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'useSkillOn_no_throw',
        kind: 'procedure',
        description:
            'useSkillOn(): no longer throws when the target object has no script. ' +
            'Returns false (no override) so skill-use falls through to default handling.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'pickup_no_throw',
        kind: 'procedure',
        description:
            'pickup(): no longer throws when the target object has no script. ' +
            'Returns false (no override) so pickup falls through to default item behaviour.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_state_prone',
        kind: 'procedure',
        description:
            'critter_state(): now sets bit 1 (value 2) when the critter has knockedDown===true, ' +
            'indicating a prone / knocked-down critter. Required for combat AI scripts that ' +
            'check prone state before applying standing-up animations.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'proto_data_13_material',
        kind: 'procedure',
        description:
            'proto_data data_member 13 (ITEM_DATA_MATERIAL): returns the material type of an ' +
            'item (0=glass, 1=metal, 2=plastic, etc.). Reads pro.extra.material; returns 0 ' +
            'when not set. Eliminates stub hits for material-reading scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule3_108_115',
        kind: 'metarule',
        description:
            'metarule3 IDs 108–115: de-stubbed with meaningful or safe-default implementations. ' +
            '108=critter distance, 109=tile distance, 110=critter tile number, ' +
            '111=critter is dead, 112=inventory slot lookup, 113–115=safe 0.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'anim_extended_codes',
        kind: 'procedure',
        description:
            'anim(): codes 100–999 and > 1010 now log silently instead of emitting a stub hit ' +
            'and a console warning. Eliminates noise from scripts using extended or engine-internal ' +
            'animation constants that the browser build does not yet drive.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'tile_num_in_direction',
        kind: 'opcode',
        description:
            'sfall 0x8189: tile_num_in_direction(tile, dir, count) → tile number that is ' +
            'count steps in direction dir (0–5) from tile. Uses hexInDirectionDistance. ' +
            'Required by AI patrol-path and movement scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_obj_elevation',
        kind: 'opcode',
        description:
            'sfall 0x818A: get_obj_elevation(obj) → elevation index (0-based floor) of the ' +
            'given object. Returns globalState.currentElevation; all visible objects share ' +
            'the current elevation in this implementation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Phase 25 — anim mid-range, proto_data 50-64, get_critter_stat fallback,
    //            has_trait/critter_add_trait extended TRAIT_OBJECT, metarule3 116+,
    //            critter_inven_obj silent fallback, sfall 0x818B-0x818F,
    //            perkRanks serialization, save schema v10
    // -----------------------------------------------------------------------
    {
        id: 'anim_mid_range_1001_1009',
        kind: 'procedure',
        description:
            'anim(): codes 1001–1009 (between rotation marker 1000 and frame-set marker 1010) ' +
            'now log silently instead of emitting a stub hit. Eliminates console noise from ' +
            'scripts using engine-internal animation constants.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'proto_data_50_64',
        kind: 'procedure',
        description:
            'proto_data(): field indices 50–64 now return 0 silently (logged at debug level) ' +
            'instead of emitting a stub hit. These indices appear in modded or sfall-extended ' +
            'scripts but are not defined in vanilla Fallout 2 PRO headers.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_critter_stat_graceful_fallback',
        kind: 'procedure',
        description:
            'get_critter_stat(): unknown stat numbers (> 35) now emit a warning and return 0 ' +
            'instead of calling stub(). Prevents console flooding from scripts that probe ' +
            'optional or sfall-extended stat IDs.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_trait_object_extended',
        kind: 'procedure',
        description:
            'has_trait(TRAIT_OBJECT): added cases 4 (object type code), 7 (locked state), ' +
            '8 (open state), 9 (PID), 11 (SID). Unknown sub-cases now return 0 silently ' +
            'instead of stubbing, preventing console noise from scripts probing optional ' +
            'object attributes.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_add_trait_trait_object_extended',
        kind: 'procedure',
        description:
            'critter_add_trait(TRAIT_OBJECT): added cases 7 (locked state) and 8 (open state). ' +
            'Unknown sub-cases now return silently instead of stubbing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'has_trait_unknown_traittype',
        kind: 'procedure',
        description:
            'has_trait(): unknown traitType values (not 0=PERK, 1=OBJECT, 2=CHAR) now log ' +
            'silently and return 0 instead of emitting a stub hit.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_add_trait_unknown_traittype',
        kind: 'procedure',
        description:
            'critter_add_trait(): unknown traitType values now log silently and return without ' +
            'action instead of emitting a stub hit.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'metarule3_116_plus',
        kind: 'metarule',
        description:
            'metarule3(): IDs above 115 now return 0 silently instead of emitting a stub hit. ' +
            'Prevents crashes from scripts using future or sfall-specific metarule3 extensions ' +
            'not yet defined in the vanilla Fallout 2 engine.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_inven_obj_silent_fallback',
        kind: 'procedure',
        description:
            'critter_inven_obj(): unknown where values now return null with a silent log ' +
            'instead of emitting a stub hit.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_object_art_fid',
        kind: 'opcode',
        description:
            'sfall 0x818B: get_object_art_fid(obj) → returns the current art FID ' +
            '(frmType<<24 | frmPID) of the given object. Used by appearance and disguise scripts ' +
            'to read which sprite a critter or item currently uses.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'set_object_art_fid',
        kind: 'opcode',
        description:
            'sfall 0x818C: set_object_art_fid(obj, fid) — sets the object\'s art FID so it ' +
            'renders a different sprite. Used by disguise and appearance-change scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'get_critter_combat_ap',
        kind: 'opcode',
        description:
            'sfall 0x818D: get_critter_combat_ap(obj) → returns critter.AP.combat (current ' +
            'in-combat action points). Returns 0 outside of combat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_combat_ap',
        kind: 'opcode',
        description:
            'sfall 0x818E: set_critter_combat_ap(obj, ap) — sets critter.AP.combat to the given ' +
            'value (clamped to 0). Used by combat scripts that adjust AP mid-turn.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'get_script_return_value',
        kind: 'opcode',
        description:
            'sfall 0x818F: get_script_return_value() → last hook-script return value. ' +
            'Hook scripts are not implemented in the browser build; returns 0 (partial).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'critter_perk_ranks_serialization',
        kind: 'procedure',
        description:
            'Critter perkRanks (script-granted perks) are now included in SERIALIZED_CRITTER_PROPS ' +
            'and round-trip through save/load. Older saves with missing perkRanks default to {}. ' +
            'Fixes stat-bonus perks (Action Boy, Toughness, etc.) being silently dropped on reload.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'save_schema_v10_player_perk_ranks',
        kind: 'procedure',
        description:
            'Save schema v10: playerPerkRanks (Record<number,number>) added to SaveGame. ' +
            'Persists script-granted player perks across save/load cycles so perk-based ' +
            'stat bonuses (e.g. Action Boy +AP) remain correct in long campaigns. ' +
            'v9→v10 migration sets playerPerkRanks={}.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'save_schema_v11_sfall_globals',
        kind: 'procedure',
        description:
            'Save schema v11: sfallGlobals ({stringKeyed, intIndexed}) added to SaveGame. ' +
            'Persists sfall string-keyed and integer-indexed global variables across save/load cycles. ' +
            'Prevents mods and scripts using set_sfall_global/get_sfall_global from losing cross-map ' +
            'state on every reload. v10→v11 migration sets sfallGlobals={}.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'metarule_default_safe_return',
        kind: 'metarule',
        description:
            'metarule() now returns 0 after the switch instead of undefined for any case that ' +
            'falls through via break (e.g. default stub case, elevator case 15). ' +
            'Prevents undefined from being pushed onto the VM stack and causing NaN comparisons.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'string_to_int',
        kind: 'opcode',
        description:
            'sfall 0x8190: string_to_int(str) → parse string as base-10 integer. ' +
            'Returns 0 for non-numeric or non-string inputs. Commonly used in sfall-enhanced ' +
            'scripts to convert string arguments or user input to numeric values.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'int_to_string',
        kind: 'opcode',
        description:
            'sfall 0x8191: int_to_string(n) → decimal string representation of integer. ' +
            'Mirrors the sfall sprintf("%d", n) pattern commonly used for display and logging ' +
            'in sfall-enhanced scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'reg_anim_func_anim_complete',
        kind: 'procedure',
        description:
            'reg_anim_func ANIM_COMPLETE (signal=2) callbacks are now called immediately. ' +
            'Since the browser build has no async animation queue, deferring callbacks would ' +
            'permanently block script continuation logic (next-dialogue-step, follow-up events). ' +
            'Immediate callback ensures animation-chained script flows complete correctly.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Phase 37 — sprintf, obj_has_script, game_mode bitmask, kill tracking,
    //            metarule unknown-id silence
    // -----------------------------------------------------------------------
    {
        id: 'critter_kill_count_tracking',
        kind: 'procedure',
        description:
            'critterKill() now increments globalState.critterKillCounts[killType] when a ' +
            'non-player critter is killed.  Previously kills were never counted so ' +
            'get_critter_kills() always returned 0; scripts that check kill tallies for ' +
            'quest completion or perk eligibility now receive accurate counts.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'sprintf',
        kind: 'opcode',
        description:
            'sfall 0x8192: sprintf(format, arg) → C-style single-argument formatted string. ' +
            'Supports %d/%i (decimal), %s (string), %x (hex), %c (char), %% (literal %). ' +
            'One of the most commonly used sfall opcodes for building display strings, UI ' +
            'labels, and debug output in Fallout 2 scripts.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'obj_has_script',
        kind: 'opcode',
        description:
            'sfall 0x8193: obj_has_script(obj) → 1 if the object has a script attached, ' +
            '0 otherwise.  Used to safely gate conditional script calls and prevent ' +
            'crashes when triggering interactions on unscripted objects.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_game_mode_bitmask',
        kind: 'opcode',
        description:
            'get_game_mode() now returns a meaningful bitmask: 0x01=combat active, ' +
            '0x02=dialogue active.  Previously returned 0 always.  Scripts that gate ' +
            'combat-only or dialogue-only logic on this value now behave correctly.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_unknown_silent',
        kind: 'metarule',
        description:
            'metarule() unknown IDs (above the currently defined range of 1–56) now ' +
            'log silently instead of emitting a stub hit.  Eliminates console flooding ' +
            'from scripts that probe sfall-specific or future metarule IDs that are ' +
            'not yet defined in the browser build.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    // -----------------------------------------------------------------------
    // Phase 38 — runtime hardening and sfall opcode expansion
    // -----------------------------------------------------------------------
    {
        id: 'get_pc_stat_safe_default',
        kind: 'procedure',
        description:
            'get_pc_stat(pcstat) unknown-index default path changed from throw to ' +
            'warn+return 0.  Prevents runtime crash when scripts probe sfall-extended ' +
            'or future pcstat indices not yet mapped in the browser build.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'mark_area_known_safe_default',
        kind: 'procedure',
        description:
            'mark_area_known(areaType, ...) unknown area-type (> 1) path changed from ' +
            'throw to log+no-op.  Prevents runtime crash when scripts pass sfall-specific ' +
            'area type constants (e.g. type 2 for map-level markers) not yet handled.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'set_map_var_safe_default',
        kind: 'procedure',
        description:
            'set_map_var(mvar, value) when no _mapScript is attached changed from ' +
            'throw to warn+no-op.  Prevents runtime crash when non-map critter or ' +
            'item scripts call set_map_var without a map-script context being set.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'critter_inven_obj_safe_default',
        kind: 'procedure',
        description:
            'critter_inven_obj(obj, where) when obj is not a game object changed from ' +
            'throw to warn+return null.  Prevents runtime crash when scripts pass ' +
            'deleted or invalid object references to inventory query calls.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'metarule3_id100_fallthrough_fix',
        kind: 'metarule',
        description:
            'metarule3(100, ...) CLR_FIXED_TIMED_EVENTS now returns 0 after the event ' +
            'loop regardless of whether a matching event was found.  Previously the ' +
            'loop fell through to the stub() call when no event matched, causing a ' +
            'spurious stub hit and undefined return value.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule3_id_below_100_safe_default',
        kind: 'metarule',
        description:
            'metarule3(id, ...) for id < 100 now returns 0 silently rather than calling ' +
            'stub().  These IDs are not defined in vanilla Fallout 2 but may appear in ' +
            'sfall mods; the silent 0 eliminates console flooding without affecting gameplay.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'proto_data_default_silent',
        kind: 'procedure',
        description:
            'proto_data(pid, field) default case for unmapped field indices now logs ' +
            'silently rather than emitting a stub hit.  Mods that probe non-standard ' +
            'field indices no longer flood the console with stub warnings.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_tile_fid',
        kind: 'opcode',
        description:
            'sfall 0x8194: get_tile_fid(tile, elevation) → FID of the floor tile at the ' +
            'given position.  Partial: returns 0 (tile FID readback not yet wired to the ' +
            'renderer cache).  Prevents unknown-opcode crashes in map-modification scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_tile_fid',
        kind: 'opcode',
        description:
            'sfall 0x8195: set_tile_fid(tile, elevation, fid) — override floor tile art. ' +
            'Partial no-op: the browser renderer does not yet support runtime tile art ' +
            'patching.  Calls are logged rather than crashing on unknown opcode.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'get_critter_flags',
        kind: 'opcode',
        description:
            'sfall 0x8196: get_critter_flags(obj) → integer bitmask of engine-level ' +
            'critter flags (dead, knocked-out, knocked-down, crippled limbs, blinded). ' +
            'Reads live injury state from Critter object fields.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_flags',
        kind: 'opcode',
        description:
            'sfall 0x8197: set_critter_flags(obj, flags) — bulk-set engine-level critter ' +
            'flags.  Writes flag bits back to the corresponding Critter injury fields ' +
            '(dead, knockedOut, knockedDown, crippled limbs, blinded).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    // -----------------------------------------------------------------------
    // Phase 39 — crash hardening (throw → safe return) and sfall expansion
    // -----------------------------------------------------------------------
    {
        id: 'getScriptMessage_safe_default',
        kind: 'procedure',
        description:
            'getScriptMessage() throw paths converted to warn+safe return: missing ' +
            'message file now returns null with a warning; missing message key returns ' +
            'an empty string with a warning.  Prevents runtime crash in any dialogue ' +
            'script that references a message ID that failed to load.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'item_caps_total_safe_default',
        kind: 'procedure',
        description:
            'item_caps_total(obj) throw-on-non-game-object path converted to ' +
            'warn+return 0.  Prevents runtime crash when a non-object (e.g. deleted ' +
            'reference) is passed in barter or inventory scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'create_object_sid_elev_clamp',
        kind: 'procedure',
        description:
            'create_object_sid(pid, tile, elev, sid) throw-on-invalid-elevation path ' +
            'converted to warn+clamp to [0, 2].  Prevents runtime crash when a script ' +
            'passes an out-of-range elevation (e.g. -1 or 3) due to a data error.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'start_gdialog_safe_default',
        kind: 'procedure',
        description:
            'start_gdialog() and gdialog_mod_barter() throw-on-missing-self_obj paths ' +
            'converted to warn+no-op.  Prevents runtime crash when a dialogue script ' +
            'is called without a valid self_obj context.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'gsay_reply_safe_default',
        kind: 'procedure',
        description:
            'gsay_reply() throw-on-null-msg path converted to warn+no-op.  Prevents ' +
            'runtime crash when a dialogue reply message is null (e.g. missing message ' +
            'file).  Dialogue continues without setting a reply text.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'metarule_15_explicit_type_safe',
        kind: 'metarule',
        description:
            'metarule(15) elevator call with explicit type (target !== -1) no longer ' +
            'throws.  The explicit type is logged and the elevator handler is still ' +
            'invoked, preventing a runtime crash in scripts that pass a type constant.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'message_parse_skip_invalid',
        kind: 'procedure',
        description:
            'Message file parser no longer throws on invalid lines.  Malformed lines ' +
            'are skipped with a warning so the rest of the message file is still loaded.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'anim_negative_code_silent',
        kind: 'procedure',
        description:
            'anim() else branch (negative or otherwise unclassified anim code) no longer ' +
            'calls stub() — logs silently instead.  Eliminates stub-hit noise from scripts ' +
            'that pass vendor-specific negative anim constants.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_ini_setting',
        kind: 'opcode',
        description:
            'sfall 0x8198: get_ini_setting(key) → integer INI value.  Partial: the ' +
            'browser build has no INI file layer; always returns 0.  Prevents ' +
            'unknown-opcode crashes in sfall/modded scripts that read INI options.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'active_hand',
        kind: 'opcode',
        description:
            'sfall 0x8199: active_hand() → 0=primary hand, 1=secondary hand.  ' +
            'Partial: always returns 0 (primary); active-hand state is not tracked ' +
            'per-session.  Prevents unknown-opcode crashes in weapon/hand scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_sfall_return',
        kind: 'opcode',
        description:
            'sfall 0x819A: set_sfall_return(val) — set hook-script return value.  ' +
            'No-op: hook scripts are not implemented in the browser build.  Prevents ' +
            'unknown-opcode crashes in sfall hook scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'get_sfall_arg',
        kind: 'opcode',
        description:
            'sfall 0x819B: get_sfall_arg() → hook-script argument value.  ' +
            'Partial: returns 0; hook scripts are not implemented.  Prevents ' +
            'unknown-opcode crashes in sfall hook scripts.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    // -----------------------------------------------------------------------
    // Phase 40 — combat/critter/object crash-path hardening
    // -----------------------------------------------------------------------
    {
        id: 'combat_ai_txt_missing',
        kind: 'procedure',
        description:
            'AI.init(): AI.TXT not found or unparseable — warn and continue with empty AI table ' +
            'so combat can still start without crashing the browser.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'combat_ai_packet_missing',
        kind: 'procedure',
        description:
            'AI constructor: no AI packet for critter aiNum — warn and use a sensible default ' +
            'packet so the critter can still participate in combat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'combat_critter_no_stats',
        kind: 'procedure',
        description:
            'Combat constructor: critter has no stats object — warn and exclude from combatants ' +
            'rather than throwing, preventing a hard browser crash.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'combat_player_not_found',
        kind: 'procedure',
        description:
            'Combat constructor: player not found among combatants — warn and return early ' +
            'rather than throwing, so the game can recover.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'combat_get_hit_chance_no_weapon',
        kind: 'procedure',
        description:
            'getHitChance: weapon object present but has no weapon data — warn and return ' +
            '{hit:-1,crit:-1} so combat continues without crashing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'combat_get_hit_chance_nan',
        kind: 'procedure',
        description:
            'getHitChance: NaN result from hit chance calculation — warn and clamp to 0 ' +
            'rather than throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'combat_get_damage_no_weapon',
        kind: 'procedure',
        description:
            'getDamageDone: no weapon equipped or weapon has no data — warn and return 0 ' +
            'rather than throwing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'combat_walk_ap_desync',
        kind: 'procedure',
        description:
            'walkUpTo / doAITurn movement: AP subtraction desync — warn, force AP to 0, and ' +
            'continue rather than throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'combat_ai_no_weapon',
        kind: 'procedure',
        description:
            'doAITurn: AI critter has no equipped weapon or weapon data — warn and skip turn ' +
            'rather than throwing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'combat_force_turn_not_found',
        kind: 'procedure',
        description:
            'forceTurn: critter not found in combatant list — warn and return early rather ' +
            'than throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'critter_invalid_attack_type',
        kind: 'procedure',
        description:
            'WeaponData.getMaximumRange: unknown attackType — warn and return 1 rather than ' +
            'throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'critter_get_attack_skin_todo',
        kind: 'procedure',
        description:
            'WeaponData.getAttackSkin: no attack mode mapping — warn and return default skin "a" ' +
            'rather than throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'combat_event_unknown_event',
        kind: 'procedure',
        description:
            'Scripting.combatEvent: unknown event type — warn and return false rather than ' +
            'throwing, so combat script dispatch continues.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'object_swap_item_not_found',
        kind: 'procedure',
        description:
            'objectSwapItem: item not found in source inventory — warn and return early ' +
            'rather than throwing, preventing inventory management crashes.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
])

// ---------------------------------------------------------------------------
// Runtime stub-hit telemetry
// ---------------------------------------------------------------------------

export interface StubHit {
    /** Procedure / metarule / opcode name that was called as a stub. */
    name: string
    /** ISO timestamp of the hit. */
    timestamp: number
    /** Optional extra context string (e.g. script name, args). */
    context?: string
}

/** FIFO queue of stub hits accumulated since last drain. */
const _stubHits: StubHit[] = []

/**
 * Record that a stub was called at runtime.
 *
 * Called by the `stub()` helper in `scripting.ts` — not intended for direct
 * use outside of scripting internals.
 */
export function recordStubHit(name: string, context?: string): void {
    _stubHits.push({ name, timestamp: Date.now(), context })
}

/**
 * Return and clear all stub hits accumulated since the last drain.
 *
 * Safe to call from tests: returns a snapshot and resets the buffer.
 */
export function drainStubHits(): StubHit[] {
    const hits = [..._stubHits]
    _stubHits.length = 0
    return hits
}

/**
 * Return the current stub hit count without clearing the buffer.
 */
export function stubHitCount(): number {
    return _stubHits.length
}

/**
 * Return the number of stubs in each status category.
 *
 * Useful for CI dashboards and progress tracking.
 */
export function stubChecklistSummary(): { stub: number; partial: number; implemented: number } {
    const summary = { stub: 0, partial: 0, implemented: 0 }
    for (const entry of SCRIPTING_STUB_CHECKLIST) summary[entry.status]++
    return summary
}
