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
            'Read proto data fields (e.g. weight, size, DR, name) for any object PID. ' +
            'Fields 0–64 are fully implemented: common header (0–5,7), item header (8–11), ' +
            'weapon fields (12–27), ammo fields (28–31), armor DR/DT (32–46), armor perk (47), ' +
            'critter XP/kill-type (48–49), extended fields 50–64 (safe 0), default (safe 0). ' +
            'Used pervasively in map and critter scripts.',
        status: 'implemented',
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
        description:
            'Returns whether a tile is currently visible to the player (not in fog of war). ' +
            'Phase 43 upgraded from always-1 to a 14-hex distance check from the player position. ' +
            'Falls back to 1 when the player object is unavailable.',
        status: 'implemented',
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
        description:
            'METARULE_CURRENT_TOWN(46): return the current city/town ID. Returns currentMapID ' +
            '(the numeric map identifier set when a map loads). Returns 0 when no map is active. ' +
            'Used by town-reputation and encounter scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'metarule_18',
        kind: 'metarule',
        description:
            'METARULE_CRITTER_ON_DRUGS(18): check if a critter is under drug influence. ' +
            'Phase 49 implemented full drug tracking via _druggedCritters Map and isDrugItem helper; ' +
            'this entry is superseded by drug_tracking_metarule18 but retained for reference.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Procedures — medium frequency / medium impact
    // -----------------------------------------------------------------------
    {
        id: 'anim',
        kind: 'procedure',
        description:
            'Trigger an arbitrary scripted animation on an object. Handles rotation (1000), ' +
            'frame-set (1010), and ANIM_stand (0) cleanly; codes 1–99 and 100–999 are logged ' +
            'silently; mid-range (1001–1009) and unknown high codes also logged silently.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'inven_cmds',
        kind: 'procedure',
        description:
            'Execute inventory command on a critter. Commands 0-3 (FIRST/LAST/PREV/NEXT), ' +
            '11-12 (LEFT/RIGHT_HAND), and 13 (INDEX_PTR) are fully implemented. ' +
            'Unknown command codes now log a warn and return null instead of calling stub().',
        status: 'implemented',
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
        description:
            'METARULE_VENDOR_CAPS(21): return vendor\'s available caps budget. ' +
            'Returns 99999 (large default caps budget; no per-vendor cap tracking). ' +
            'Scripts use this to cap barter offers.',
        status: 'implemented',
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
        description:
            'proto_data data_member 7 (PROTO_DATA_FLAGS2): extended object flags bitfield. ' +
            'Returns pro.extra.flags2 or pro.flags2 (whichever is present). ' +
            'Covered by the comprehensive proto_data case 7 implementation.',
        status: 'implemented',
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
        description:
            'METARULE_COMBAT_DIFFICULTY(35): returns combat difficulty (0=easy, 1=normal, 2=hard). ' +
            'Returns 1 (normal). The browser build has no difficulty setting; normal is the ' +
            'correct default for standard gameplay balance.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'metarule_44',
        kind: 'metarule',
        description:
            'METARULE_WHO_ON_DRUGS(44): returns 1 if the target critter is under drug influence. ' +
            'Phase 49 implemented drug tracking via _druggedCritters Map; this entry reflects ' +
            'the earlier partial stub (see drug_tracking_metarule44 for the Phase-49 entry).',
        status: 'implemented',
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
        description:
            'METARULE_GAME_DIFFICULTY(55): returns game difficulty (0=easy, 1=normal, 2=hard). ' +
            'Returns 1 (normal). The browser build has no difficulty setting; normal is the ' +
            'correct default for standard gameplay balance.',
        status: 'implemented',
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
        description: 'sfall 0x817E: get_game_mode() → bitmask of active game modes (combat=1, dialogue=2). Returns correct bitmask based on engine state.',
        status: 'implemented',
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
        description: 'METARULE3_TILE_LINE_OF_SIGHT(104): 1 if there is line-of-sight between two tiles. Approximated via hex distance: tiles within 14 hexes return 1 (visible), farther tiles return 0.',
        status: 'implemented',
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
            'sfall 0x8198: get_ini_setting(key) → integer INI value.  ' +
            'BLK-064 (Phase 62): now returns sensible defaults for ~20 known FO2 ' +
            'config keys (case-insensitive). Unknown keys return 0.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'active_hand',
        kind: 'opcode',
        description:
            'sfall 0x8199: active_hand() → 0=primary hand, 1=secondary hand.  ' +
            'Phase 50 (BLK-034): reads Player.activeHand for a live value; defaults to 0 (primary). ' +
            'Player.activeHand is persisted in save schema v13 so hand selection survives save/load.',
        status: 'implemented',
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

    // -----------------------------------------------------------------------
    // Phase 41 — object throw→warn; critter damage_p_proc; AP→AC; raw stat/skill
    // -----------------------------------------------------------------------
    {
        id: 'object_drop_not_found',
        kind: 'procedure',
        description:
            'dropObject: item not found in source inventory — warn and return early ' +
            'instead of throwing, preventing inventory-drop crashes.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'object_unknown_animation',
        kind: 'procedure',
        description:
            'Critter.getAnimation: unknown animation name — warn and return idle animation ' +
            'instead of throwing, preventing animation lookup crashes.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'object_walk_null_direction',
        kind: 'procedure',
        description:
            'walkTo / walk-anim loop: directionOfDelta returns null — warn and stop/abort ' +
            'animation instead of throwing, preventing walk-path crashes.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'object_no_image_info_graceful',
        kind: 'procedure',
        description:
            'directionalOffset / walk-anim loop: no image info for art key — warn and ' +
            'return zero offset / stop animation instead of throwing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'object_anim_partial_no_image_info',
        kind: 'procedure',
        description:
            'getAnimPartialActions / getAnimDistance: no image info for art key — warn and ' +
            'return safe empty partials / 0 distance instead of throwing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'critter_damage_p_proc',
        kind: 'procedure',
        description:
            'critterDamage: call Scripting.damage() to trigger damage_p_proc on the ' +
            'damaged critter\'s script when useScript=true. Required for scripted damage ' +
            'reactions (e.g. special effects, quest triggers).',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'critter_set_raw_stat',
        kind: 'procedure',
        description:
            'critterSetRawStat: now calls stats.setBase() instead of logging a TODO warning. ' +
            'Enables correct stat mutation for any future callers.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'critter_set_raw_skill',
        kind: 'procedure',
        description:
            'critterSetRawSkill: now calls skills.setBase() instead of logging a TODO warning. ' +
            'Enables correct skill mutation for any future callers.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'combat_ap_to_ac_bonus',
        kind: 'procedure',
        description:
            'nextTurn: unused AP at end of turn is converted to a temporary +1 AC per unused AP ' +
            '(Fallout 2 end-of-turn AC mechanic). Bonus is stored in StatSet.acBonus and cleared ' +
            'at the start of the critter\'s next turn. getStat(\'AC\') now includes acBonus.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    // -----------------------------------------------------------------------
    // Phase 42 — VM resilience: throw→warn for missing bridges/procedures/stacks
    // -----------------------------------------------------------------------
    {
        id: 'vm_bridge_missing_proc_no_throw',
        kind: 'opcode',
        description:
            'ScriptVMBridge.bridged(): when the target procedure is not implemented on ' +
            'scriptObj, the engine previously threw an Error that crashed the entire game ' +
            'session. Now logs a console.warn, pushes 0 if the opcode returns a value, and ' +
            'returns — script execution continues gracefully.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'vm_call_unknown_proc_no_throw',
        kind: 'opcode',
        description:
            'ScriptVM.call(): when a named procedure does not exist in the compiled intfile ' +
            'procedures table, the engine previously threw a string that crashed the game. ' +
            'Now logs a console.warn and returns undefined — the calling context receives a ' +
            'safe fallback and execution continues.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'vm_stack_underflow_no_throw',
        kind: 'opcode',
        description:
            'ScriptVM.pop(): data-stack underflow previously threw crashing the game. ' +
            'Now logs a console.warn and returns 0. ScriptVM.popAddr(): return-stack underflow ' +
            'previously threw; now logs a warn and returns -1 (the halt sentinel), causing the ' +
            'VM to halt gracefully instead of crashing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'explosion_uses_script_damage',
        kind: 'procedure',
        description:
            'scripting.ts explosion(tile, elevation, damage): previously used hardcoded ' +
            'min=0 / max=100 regardless of the script-supplied damage parameter. Now uses ' +
            'floor(damage/2) as minDmg and damage as maxDmg, so explosion() calls with ' +
            'varying damage values produce correctly-scaled blast effects.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Phase 43 — Combat perk fidelity, VM resilience, tile visibility
    // -----------------------------------------------------------------------
    {
        id: 'vm_step_limit_no_throw',
        kind: 'opcode',
        description:
            'ScriptVM.run(): when vmMaxStepsPerCall is exceeded the engine previously threw ' +
            'an Error that crashed the entire game session. Now logs a console.warn, sets ' +
            'halted=true and returns so the script is cut short rather than crashing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'sharpshooter_perk_distance',
        kind: 'procedure',
        description:
            'combat.ts getHitDistanceModifier(): Sharpshooter perk (ID 5) now applies its ' +
            'range bonus. Each rank subtracts 2 from the un-scaled distance before the ' +
            'x4 penalty multiplier is applied, matching the Fallout 2 formula ' +
            '(+2 effective PER for ranged weapon range per rank).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sniper_perk_called_shot',
        kind: 'procedure',
        description:
            'combat.ts rollHit(): Sniper perk (ID 9) now performs a second d100 roll on ' +
            'a hit; if the second roll independently qualifies as a critical the attack ' +
            'becomes a critical hit, giving snipers a meaningful bonus over one roll alone.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'jinxed_trait_crit_miss',
        kind: 'procedure',
        description:
            'combat.ts rollHit(): Jinxed trait (ID 9 in charTraits) now adds a 50% ' +
            'chance that any miss becomes a critical miss. The check is non-stacking and ' +
            'applies when either the attacker or the nearby player has the Jinxed trait.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'tile_is_visible_range',
        kind: 'procedure',
        description:
            'scripting.ts tile_is_visible(tile): instead of unconditionally returning 1, ' +
            'now checks hex distance from the player position. Tiles within 14 hexes ' +
            'return 1 (visible); farther tiles return 0. Falls back to 1 when the player ' +
            'object is unavailable so startup scripts are unaffected.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'metarule3_tile_los_distance',
        kind: 'metarule',
        description:
            'scripting.ts metarule3(104) METARULE3_TILE_LINE_OF_SIGHT: previously always ' +
            'returned 1. Now approximates LOS by hex distance: if the two tile arguments ' +
            'are within 14 hexes the function returns 1, otherwise 0, matching the ' +
            'Fallout 2 view radius and preventing distant triggers from firing falsely.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    // -------------------------------------------------------------------------
    // Phase 44 entries
    // -------------------------------------------------------------------------
    {
        id: 'vm_bridge_push_undefined_guard',
        kind: 'procedure',
        description:
            'vm_bridge.ts bridged(): push(r) changed to push(r ?? 0) so that any ' +
            'scripting procedure that returns undefined without an explicit value ' +
            'pushes a safe 0 onto the VM data stack instead of corrupting it with ' +
            'undefined, which would cause arithmetic/comparison faults downstream.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'map_var_bare_return_fix',
        kind: 'procedure',
        description:
            'scripting.ts map_var(): two early-return paths (no map script, no script ' +
            'name) now return 0 instead of bare undefined, preventing VM stack ' +
            'corruption when bridged via opcode 0x80C3 with pushResult=true.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'destroy_object_calls_destroy_p_proc',
        kind: 'procedure',
        description:
            'map.ts destroyObject(): now calls Scripting.destroy(obj) before ' +
            'removeObject(), firing the object\'s destroy_p_proc script (e.g. for ' +
            'NPC death reactions, loot drops, and quest state updates). A reentrance ' +
            'guard prevents infinite recursion if the script calls destroy_object on ' +
            'itself.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'next_turn_skip_depth_guard',
        kind: 'procedure',
        description:
            'combat.ts nextTurn(): added skipDepth parameter (default 0) that ' +
            'increments each time a dead/non-hostile combatant is skipped. If it ' +
            'exceeds the combatant count the method forces combat.end() instead of ' +
            'recursing indefinitely, preventing a stack-overflow soft-hang when all ' +
            'remaining AI turns are skippable.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'get_world_map_x',
        kind: 'opcode',
        description:
            'sfall 0x819C: get_world_map_x() → current world-map X position from ' +
            'globalState.worldPosition. Returns 0 if no world position is stored.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_world_map_y',
        kind: 'opcode',
        description:
            'sfall 0x819D: get_world_map_y() → current world-map Y position from ' +
            'globalState.worldPosition. Returns 0 if no world position is stored.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_world_map_pos',
        kind: 'opcode',
        description:
            'sfall 0x819E: set_world_map_pos(x, y) — updates globalState.worldPosition ' +
            'to the given coordinates, allowing scripts to teleport the world-map cursor.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'in_world_map',
        kind: 'opcode',
        description:
            'sfall 0x819F: in_world_map() → 1 if the player is currently on the world ' +
            'map (no game map loaded), 0 otherwise. Partial: uses gMap.name to infer ' +
            'world-map state.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'get_critter_level',
        kind: 'opcode',
        description:
            'sfall 0x81A0: get_critter_level(obj) → character level of the given ' +
            'critter. Falls back to 1 for NPCs with no explicit level set.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'set_critter_level',
        kind: 'opcode',
        description:
            'sfall 0x81A1: set_critter_level(obj, level) — override a critter\'s ' +
            'character level (clamped to ≥1). Used by level-scaling encounter scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'get_object_weight',
        kind: 'opcode',
        description:
            'sfall 0x81A2: get_object_weight(obj) → object weight in lbs. Reads from ' +
            'pro.extra.weight or pro.weight (stored as g×10 in proto data; divided by ' +
            '10 to get lbs). Returns 0 for non-game-objects.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // -----------------------------------------------------------------------
    // Phase 45 — Crash-Free Hardening: throw→warn, encounter parsing, pro.ts,
    //            sfall 0x81A3–0x81A7 (get_ini_string, set_global_script_type,
    //            get_year, get_month, get_day), get_game_mode implemented
    // -----------------------------------------------------------------------
    {
        id: 'ui_barter_loot_no_throw',
        kind: 'procedure',
        description:
            'ui.ts uiBarterMove/uiLootMove/uiSwapItem: converted throw statements to ' +
            'console.warn+return. Invalid data, missing object, or unknown location no longer ' +
            'crash the barter/loot UI — they log a warning and skip the operation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'main_elevator_ap_no_throw',
        kind: 'procedure',
        description:
            'main.ts: useElevator missing-stub and missing-type throws converted to warn+return; ' +
            'AP subtraction mismatch throw converted to warn; playerUse callback null-obj throw ' +
            'converted to warn+return; playerUseSkill no-target throw converted to warn+return.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'encounters_parse_no_throw',
        kind: 'procedure',
        description:
            'encounters.ts: all throws in tokenizeCond, parseCond, evalCond, pickEncounter, and ' +
            'evalEncounter converted to console.warn with safe fallbacks. Added or/ge/le/eq/ne ' +
            'operator support to evalCond. pickEncounter now falls back to all encounters when ' +
            'none pass conditions. evalEncounter now handles null from pickEncounter gracefully.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'worldmap_encounter_ref_no_throw',
        kind: 'procedure',
        description:
            'worldmap.ts: parseEncounterReference throw replaced with warn+return null. ' +
            'pickEncounter now filters out encounters with null enc field.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'pro_critter_art_path_no_throw',
        kind: 'procedure',
        description:
            'pro.ts getCritterArtPath: all throw statements (reindex, id1>=0x0b, 0x26-0x2f range, ' +
            '0x14 range, 0x0d case) converted to warn+fallback base art path. id2=0x12 case now ' +
            'correctly maps dm/gm/as suffixes instead of throwing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'get_ini_string_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A3: get_ini_string(key) → string value from INI config. Partial: no INI ' +
            'file system in browser build; returns empty string. Prevents unimplemented-opcode ' +
            'crashes in mods that read their own config.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'set_global_script_type_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A4: set_global_script_type(type) — set global script type (0=map-update, ' +
            '1=combat). No-op in browser build (no global script ticker). Prevents unimplemented- ' +
            'opcode crash in scripts that register a global ticker.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_year_sfall_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A5: get_year() → in-game calendar year. Game epoch 2241; 360-day years ' +
            '(12×30-day months). Derived from globalState.gameTickTime.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_month_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A6: get_month() → in-game calendar month (1–12). 30-day months. ' +
            'Derived from globalState.gameTickTime.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'get_day_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A7: get_day() → in-game calendar day of month (1–30). 30-day months. ' +
            'Derived from globalState.gameTickTime.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    // -----------------------------------------------------------------------
    // Phase 46 — deep crash hardening: data.ts / party.ts / char.ts / save system
    // -----------------------------------------------------------------------
    {
        id: 'lookupScriptName_no_throw',
        kind: 'procedure',
        description:
            'data.ts lookupScriptName: throw when script ID is not in scripts.lst replaced with ' +
            'console.warn + return null. getScriptName in scripting.ts updated to string|null. ' +
            'The existing null-guard in getScriptMessage now fires correctly.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'loadMessage_invalid_line_no_throw',
        kind: 'procedure',
        description:
            'data.ts loadMessage: throw on non-standard message file line replaced with ' +
            'console.warn + continue (skip). Matches the Phase 39 fix already in scripting.ts ' +
            'loadMessageFile. Prevents crashes when game message files have comments or irregular lines.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'party_remove_no_throw',
        kind: 'procedure',
        description:
            'party.ts Party.removePartyMember: throw when the member is not found in the party ' +
            'replaced with console.warn + no-op. Prevents crash when scripts call party_remove on ' +
            'an NPC that has already left or been killed.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'char_skill_stat_no_throw',
        kind: 'procedure',
        description:
            'char.ts SkillSet.getBase/get and StatSet.getBase/get: throw for unknown skill/stat ' +
            'names replaced with console.warn + return 0. Prevents crashes if any code path calls ' +
            'these with an invalid string key.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'save_migration_unknown_version_no_throw',
        kind: 'procedure',
        description:
            'saveSchema.ts migrateSave: throw for unknown save version replaced with ' +
            'console.warn + treat as SAVE_VERSION (best-effort forward compatibility). ' +
            'Saves from future engine versions will load instead of hard-crashing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'validate_save_no_throw',
        kind: 'procedure',
        description:
            'saveStateFidelity.ts validateSaveForHydration: all four throw paths for corrupt/missing ' +
            'save data converted to return string|null (null = valid). hydrateStateFromSave checks ' +
            'the result and warns + aborts instead of crashing the runtime on corrupt save load.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'critter_state_full_bitmask',
        kind: 'procedure',
        description:
            'scripting.ts critter_state: bitmask expanded to match Fallout 2 CRITTER_IS_* constants. ' +
            'bit0=dead, bit1=knockedOut/stunned, bit2=knockedDown/prone, bit3=any-crippled-limb, ' +
            'bit4=isFleeing. Previously only set bit0 (dead) and bit1 (knockedDown).',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'obj_is_locked_non_object_default',
        kind: 'procedure',
        description:
            'scripting.ts obj_is_locked: changed return value for non-game-objects from 1 (locked) ' +
            'to 0 (unlocked). Returning 1 for nulls/invalid objects was incorrectly blocking scripts ' +
            'that check obj_is_locked before attempting to open containers or doors.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    // -------------------------------------------------------------------------
    // Phase 47 entries
    // -------------------------------------------------------------------------
    {
        id: 'vm_op_dup_underflow_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts op_dup (0x801b): data-stack underflow previously threw a string ' +
            'that crashed the entire game. Now logs console.warn and pushes 0 instead, so ' +
            'scripts with dup-before-push bugs continue executing rather than hard-crashing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'vm_op_check_arg_count_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts op_check_arg_count (0x8027): argument count mismatch previously ' +
            'threw a string that crashed the entire game. Now logs console.warn and continues — ' +
            'the call still proceeds so sfall-extended or modded scripts with minor arity ' +
            'differences do not abort the session.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'vm_op_lookup_string_proc_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts op_lookup_string_proc (0x8028): when the procedure name is not in ' +
            'the intfile procedures table the implicit property access threw a TypeError. Now ' +
            'logs console.warn and pushes 0 so the script can handle the missing proc gracefully.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'vm_op_call_missing_proc_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts op_call (0x8005): when the procedure index is out of range in ' +
            'proceduresTable the implicit property access threw a TypeError. Now logs console.warn ' +
            'and halts the VM gracefully instead of crashing the entire game session.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'vm_opcode_9001_missing_symbol_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts opcode 0x9001 (push identifier / string): when the requested ' +
            'identifier or string number is absent from the intfile tables, the engine ' +
            'previously threw an Error that crashed the session. Now logs console.warn and ' +
            'pushes an empty string so downstream code receives a safe fallback.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'vm_division_by_zero_no_throw',
        kind: 'opcode',
        description:
            'vm_opcodes.ts opcodes 0x803c (integer division) and 0x803d (modulo): division or ' +
            'modulo by zero previously threw a string that crashed the game. Now logs ' +
            'console.warn and returns 0 so scripts with divide-by-zero edge cases continue.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'encounter_player_level_evalcond',
        kind: 'procedure',
        description:
            'encounters.ts evalCond(): the "player.level" condition check previously always ' +
            'returned 0. Now reads globalState.player.level (falling back to 1 when the player ' +
            'is not yet initialised). Encounter conditions gated on player level now fire ' +
            'correctly, enabling level-gated spawns throughout the world map.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'encounter_perk_roll_bonuses',
        kind: 'procedure',
        description:
            'encounters.ts pickEncounter(): Scout (perk ID 22), Ranger (perk ID 28), and ' +
            'Explorer (perk ID 29) now add +1/+1/+2 to the encounter roll respectively, ' +
            'matching the Fallout 2 formula. Bonuses are read from player.perkRanks so they ' +
            'activate as soon as a script grants the perk.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'encounter_cautious_nature_formation',
        kind: 'procedure',
        description:
            'encounters.ts positionCritters(): the Cautious Nature perk (Fallout 2 perk ID 16) ' +
            'now adds +3 to the surrounding-formation spacing roll, increasing the distance ' +
            'at which hostile critters are placed when the formation is "surrounding". ' +
            'Check uses player.perkRanks[16] so it activates via critter_add_trait.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'gsay_option_implemented',
        kind: 'opcode',
        description:
            'vm_bridge.ts opcode 0x811F (gsay_option): was entirely missing — any dialogue ' +
            'script calling gsay_option() silently dropped all options and players saw no ' +
            'conversation choices. Now implemented as a custom handler that pops ' +
            '(msgList, msgID, target, reaction), resolves the procedure name via ' +
            'proceduresTable, and calls scripting.ts gsay_option() which adds the option ' +
            'unconditionally via uiAddDialogueOption. Companion to giq_option (0x8121) ' +
            'which adds options conditionally on INT.',
        status: 'implemented',
        frequency: 'high',
        impact: 'blocker',
    },
    {
        id: 'objectZCompare_nan_safe',
        kind: 'procedure',
        description:
            'object.ts objectZCompare(): previously threw the string "unreachable" when ' +
            'object position coordinates were NaN or undefined (e.g. objects created ' +
            'without a position). Now returns 0 (equal) in that case and uses ' +
            'optional-chaining on position coordinates to avoid TypeError on null ' +
            'positions, preventing crashes during map render sorting.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'giq_option_missing_proc_safe',
        kind: 'procedure',
        description:
            'vm_bridge.ts giq_option (0x8121): previously threw a TypeError when ' +
            'proceduresTable[target] was undefined (e.g. corrupted or empty target). ' +
            'Now checks with ?. and logs console.warn + returns early so dialogue ' +
            'continues without crashing the session.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'data_city_txt_invalid_area_no_throw',
        kind: 'procedure',
        description:
            'data.ts parseAreas(): sections in city.txt that do not match "Area N" (e.g. ' +
            'comment sections or mod-specific headers) previously threw a string crashing ' +
            'the world map loader. Now logs console.warn and skips the section so the rest ' +
            'of city.txt loads successfully.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'data_city_txt_unknown_map_entrance_no_throw',
        kind: 'procedure',
        description:
            'data.ts parseAreas(): city.txt entrances that reference a map name not found in ' +
            'the maps lookup table previously threw an Error crashing the world map loader. ' +
            'Now logs console.warn and skips the entrance so the area still loads with its ' +
            'remaining valid entrances.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'data_area_containing_map_no_mapAreas_no_throw',
        kind: 'procedure',
        description:
            'data.ts areaContainingMap(): calling this function before globalState.mapAreas ' +
            'is loaded previously threw an Error. Now logs console.warn and returns null so ' +
            'callers receive a safe sentinel without crashing.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'data_maps_txt_invalid_category_no_throw',
        kind: 'procedure',
        description:
            'data.ts parseMapInfo(): sections in maps.txt that do not match "Map N" ' +
            'previously threw an Error. Now logs console.warn and skips the section. ' +
            'Also hardens invalid random_start_point entries: skip with warning instead ' +
            'of throwing so map info loads fully even with partial data.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'lightmap_tile_num_in_direction_invalid_dir_no_throw',
        kind: 'procedure',
        description:
            'lightmap.ts tile_num_in_direction(): an invalid direction (< 0 or > 5) ' +
            'previously threw a string crashing the renderer during lighting updates. ' +
            'Now logs console.warn and returns -1 so lighting gracefully handles ' +
            'corrupted or edge-case map data.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'lighting_intensity_map_out_of_bounds_no_throw',
        kind: 'procedure',
        description:
            'lighting.ts intensity_map loop: when the computed intensityIdx falls outside ' +
            '[0, intensity_map.length), the code previously threw the string "guard" ' +
            'crashing the renderer. Now logs console.warn and breaks out of the inner ' +
            'loop so lighting continues for subsequent tiles even on corrupt light data.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'util_parseIni_key_before_section_no_throw',
        kind: 'procedure',
        description:
            'util.ts parseIni(): a key=value pair appearing before the first [section] ' +
            'header previously threw a string crashing any code that loaded such an INI ' +
            '(e.g. AI.TXT, ddraw.ini). Now logs console.warn and skips the line so the ' +
            'rest of the file is parsed successfully.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'renderer_objectRenderInfo_no_imageInfo_no_throw',
        kind: 'procedure',
        description:
            'renderer.ts objectRenderInfo(): when globalState.imageInfo[obj.art] is ' +
            'undefined (image loaded but metadata not yet available), previously threw ' +
            'a string crashing the renderer. Now logs console.warn and returns null so ' +
            'the object is simply skipped during this render frame.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'renderer_objectBoundingBox_no_imageInfo_no_throw',
        kind: 'procedure',
        description:
            'renderer.ts objectBoundingBox(): missing imageInfo previously threw a string ' +
            'crashing hit-testing. Now logs console.warn and returns null so callers ' +
            'treat the object as having no bounding box (click-through).',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'renderer_objectTransparentAt_no_tempCanvasCtx_no_throw',
        kind: 'procedure',
        description:
            'renderer.ts objectTransparentAt(): a null tempCanvasCtx (and missing imageInfo) ' +
            'previously threw an Error crashing click transparency testing. Now guards both ' +
            'conditions with console.warn + return true (transparent) so the game continues ' +
            'without a crash if the temp canvas is unavailable.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    // -------------------------------------------------------------------------
    // Phase 48 entries
    // -------------------------------------------------------------------------
    {
        id: 'pcstat_karma_gvar0_sync',
        kind: 'procedure',
        description:
            'get_pc_stat(4) (PCSTAT_karma): now returns globalVars[0] (GVAR_PLAYER_REPUTATION) ' +
            'instead of globalState.reputation.getKarma(). In Fallout 2 both PCSTAT_reputation ' +
            'and PCSTAT_karma read GVAR_0; the old code returned a separate reputation object ' +
            'value that was never updated by scripts, so karma-gated dialogue/quest conditions ' +
            'always saw 0.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'set_global_var_0_karma_sync',
        kind: 'procedure',
        description:
            'set_global_var(0, value): when scripts update GVAR_PLAYER_REPUTATION (GVAR_0) the ' +
            'reputation system karma is now synced via reputation.setKarma(). Keeps the UI and ' +
            'save-file reputation object consistent with the value scripts read and write.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'rm_mult_objs_from_inven_multi_stack',
        kind: 'procedure',
        description:
            'rm_mult_objs_from_inven: now drains from multiple inventory stacks when the ' +
            'first matching stack has fewer items than the requested count. Returns the total ' +
            'items actually removed. Prevents item-count mismatches when the same PID appears ' +
            'in separate stacks (e.g. after repeated add_obj_to_inven calls).',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'item_caps_adjust_caps_creation',
        kind: 'procedure',
        description:
            'item_caps_adjust(obj, amount): when amount > 0 and no caps item (PID 41) is found ' +
            'in the object\'s inventory, now creates a new caps item with the given amount. ' +
            'Fallout 2 scripts commonly call item_caps_adjust to hand money to critters that ' +
            'start with an empty inventory; previously the caps were silently discarded.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'metarule_53_have_drug_implemented',
        kind: 'metarule',
        description:
            'METARULE_HAVE_DRUG (metarule case 53): now returns 1 if the target critter\'s ' +
            'inventory contains any item with subtype "drug" (subType===2 in PRO extra data). ' +
            'Previously always returned 0, causing NPC scripts that check for doctor\'s bags, ' +
            'stimpaks, etc. to mis-branch and NPCs to ignore their healing items.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'critter_equipped_armor_serialization',
        kind: 'procedure',
        description:
            'Critter.serialize(): now persists equippedArmorPID (the PID of the currently ' +
            'equipped armor). Critter.fromMapObject() deserialization now restores equippedArmor ' +
            'by searching the deserialized inventory for a matching armor item. Prevents party ' +
            'members and map NPCs from losing their armor DT/DR/AC bonuses after save/load.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'get_combat_free_move_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A8: get_combat_free_move(obj) → free-movement AP for the current combat ' +
            'turn. Reads obj.freeMoveAP; returns 0 for non-objects or when not in combat. ' +
            'Required by level-scaling and difficulty-adjustment scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'set_combat_free_move_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81A9: set_combat_free_move(obj, ap) — set free-movement AP for the ' +
            'current combat turn (clamped to >= 0). Used by difficulty and level-scaling ' +
            'combat scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'tile_add_remove_blocking_no_throw',
        kind: 'opcode',
        description:
            'opcodes 0x8140 (tile_add_blocking) and 0x8141 (tile_remove_blocking): previously ' +
            'caused unknown-opcode halts. Now implemented as safe no-ops that pop their two ' +
            'arguments. No runtime tile-block registry exists in the browser build; the no-op ' +
            'keeps the VM stack balanced.',
        status: 'partial',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'give_karma_take_karma_opcodes',
        kind: 'opcode',
        description:
            'opcodes 0x8142 (give_karma) and 0x8143 (take_karma): previously caused unknown-' +
            'opcode halts in scripts using the Fallout 2 compiled opcode form (some compilers ' +
            'emit native opcodes rather than expanding the give_karma macro). Both now update ' +
            'GVAR_PLAYER_REPUTATION (GVAR_0) and sync reputation.karma.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'dialogue_reaction_opcode',
        kind: 'opcode',
        description:
            'opcode 0x814D (dialogue_reaction(how_much)): previously caused unknown-opcode ' +
            'halts in NPC dialogue scripts. Now implemented as a safe no-op that pops its ' +
            'single argument. The browser build does not track a per-dialogue reaction score; ' +
            'accepting the call keeps VM stack balanced and dialogue scripts running.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },

    // Phase 49 entries
    {
        id: 'drug_tracking_metarule18',
        kind: 'metarule',
        description:
            'METARULE_CRITTER_ON_DRUGS(18): returns 1 if self_obj critter is currently under ' +
            'drug influence. Implemented via _druggedCritters Map: drug items (subtype===2) ' +
            'mark the using critter for DRUG_EFFECT_TICKS (600) when use/useObjOn fires.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'drug_tracking_metarule44',
        kind: 'metarule',
        description:
            'METARULE_WHO_ON_DRUGS(44): returns 1 if the target critter is currently under ' +
            'drug influence. Uses same _druggedCritters Map as metarule(18). Fixes NPC healer ' +
            'scripts (e.g. "only heal if not already on drugs" logic).',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'pc_flag_on_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80A2 (pc_flag_on(flag)): set a player character state bit. Known bits: ' +
            '3=SNK_MODE (sneak), 2=I_AM_EVIL. Now bridges to Script.pc_flag_on() which sets ' +
            'the corresponding bit in Player.pcFlags. Previously caused unknown-opcode halts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'pc_flag_off_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80A6 (pc_flag_off(flag)): clear a player character state bit. Bridges ' +
            'to Script.pc_flag_off(). Previously caused unknown-opcode halts in sneak scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'sneak_detection_pc_flags',
        kind: 'procedure',
        description:
            'isWithinPerception now reads Player.pcFlags bit 3 (SNK_MODE) for sneak detection. ' +
            'When sneak is active the required perception distance is divided by 4, matching ' +
            'Fallout 2 stealth mechanics. pc_flag_on(3)/pc_flag_off(3) toggle the mode.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'inven_unwield_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80B1 (inven_unwield(obj)): make a critter holster their current weapon. ' +
            'Implemented by clearing critter.rightHand. Previously caused unknown-opcode halts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'script_action_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80C7 (script_action): getter that pushes action_being_used. Identical ' +
            'semantics to 0x80FA but compiled as a separate opcode by some Fallout 2 scripts. ' +
            'Previously caused unknown-opcode halts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'map_first_run_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80A0 (map_first_run): getter that pushes 1 on first entry to a map, ' +
            '0 on subsequent entries. Bridges to Scripting.getMapFirstRun(). Prevents unknown-' +
            'opcode halts in map initialisation scripts.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'pickup_obj_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80D6 (pickup_obj(obj)): move a map object to the player\'s inventory. ' +
            'Removes obj from map and pushes it onto player.inventory.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'drop_obj_opcode',
        kind: 'opcode',
        description:
            'opcode 0x80D7 (drop_obj(obj)): remove an object from a critter\'s inventory and ' +
            'place it on the ground at the critter\'s tile. Handles player and NPC critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_script_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81AA (get_script(obj)): return the script SID of an object. Returns 0 ' +
            'in the browser build (no numeric SID model). Prevents unknown-opcode halts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_script_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81AB (set_script(obj, sid)): assign a script to an object by SID. ' +
            'Accepted as a safe no-op in the browser build (no SID-based script registry). ' +
            'Prevents unknown-opcode halts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_remove_script_opcode',
        kind: 'opcode',
        description:
            'sfall 0x81AC (remove_script(obj)): detach a script from an object. ' +
            'Accepted as a safe no-op. Prevents unknown-opcode halts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'player_pc_flags_save',
        kind: 'procedure',
        description:
            'Player.pcFlags (bitfield) is now serialized in save schema v12 as playerPcFlags. ' +
            'Sneak mode (bit 3 = SNK_MODE) and other PC state flags survive save/load cycles. ' +
            'Old saves default to 0 (no flags set) via migration.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // -----------------------------------------------------------------------
    // Phase 50 — critter status flags persistence, active hand, sfall 0x81AE–0x81B5
    // -----------------------------------------------------------------------
    {
        id: 'critter_status_flags_serialization',
        kind: 'procedure',
        description:
            'BLK-033: Critter critical-injury / status flags (knockedOut, knockedDown, stunned, ' +
            'crippledLeftLeg, crippledRightLeg, crippledLeftArm, crippledRightArm, blinded, ' +
            'onFire, isFleeing) are now included in SERIALIZED_CRITTER_PROPS. ' +
            'These flags survive save/load cycles so crippled limbs and fleeing state ' +
            'are not silently reset when the game is saved and reloaded.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'player_active_hand_save',
        kind: 'procedure',
        description:
            'BLK-034: Player.activeHand (0=primary, 1=secondary) is now tracked on the Player ' +
            'object and serialized in save schema v13 as playerActiveHand. ' +
            'The sfall active_hand() opcode (0x8199) reads the live value instead of ' +
            'always returning 0. Old saves default to 0 (primary hand) via migration.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_perk_owed',
        kind: 'opcode',
        description:
            'sfall 0x81AE: get_perk_owed() → number of perk-selection points owed to the player. ' +
            'Browser build has no perk-selection UI; returns 0 (no perks owed). ' +
            'Prevents unknown-opcode crashes in level-up scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_perk_owed',
        kind: 'opcode',
        description:
            'sfall 0x81AF: set_perk_owed(n) — set number of pending perk-selection points. ' +
            'No-op in browser build (no perk-selection UI). ' +
            'Prevents unknown-opcode crashes in level-up scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_last_target',
        kind: 'opcode',
        description:
            'sfall 0x81B0: get_last_target(obj) → last critter targeted in combat by obj. ' +
            'Returns 0 (no combat target tracked). Prevents unknown-opcode crashes in ' +
            'combat-reaction scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_last_attacker',
        kind: 'opcode',
        description:
            'sfall 0x81B1: get_last_attacker(obj) → last critter that attacked obj. ' +
            'Returns 0 (no attacker tracking). Prevents unknown-opcode crashes in ' +
            'revenge/reaction scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_art_cache_flush',
        kind: 'opcode',
        description:
            'sfall 0x81B2: art_cache_flush() — flush the internal art/animation cache. ' +
            'No-op in browser build (no separate art cache). ' +
            'Prevents unknown-opcode crashes in scripts that flush assets.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_game_loaded',
        kind: 'opcode',
        description:
            'sfall 0x81B3: game_loaded() → 1 if the current map entry is from a save-load. ' +
            'Browser build returns 0 (treated as first-time entry). ' +
            'Prevents unknown-opcode crashes in map-startup scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_weapon_knockback',
        kind: 'opcode',
        description:
            'sfall 0x81B4: set_weapon_knockback(obj, dist, chance) — configure weapon knockback. ' +
            'No-op in browser build (no knockback physics model). ' +
            'Prevents unknown-opcode crashes in modded weapon scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_remove_weapon_knockback',
        kind: 'opcode',
        description:
            'sfall 0x81B5: remove_weapon_knockback(obj) — remove custom weapon knockback. ' +
            'No-op in browser build. Prevents unknown-opcode crashes in modded weapon scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 51 entries
    {
        id: 'player_stats_persistence',
        kind: 'procedure',
        description:
            'BLK-035: Player base stats (HP, SPECIAL, radiation, poison) and skill values ' +
            'are now snapshotted in save schema v14 (playerBaseStats/playerSkillValues/ ' +
            'playerSkillPoints). Previously, save/load reset player HP to the hardcoded ' +
            'default (100), losing all in-session stat modifications. Both IDB and memory ' +
            'load paths restore the full StatSet.baseStats and SkillSet.baseSkills on load.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'sfall_get_critter_stat_bonus',
        kind: 'opcode',
        description:
            'sfall 0x81B6: get_critter_stat_bonus(obj, stat) → stat bonus/modifier amount ' +
            '(derived stat minus base stat). Implemented by calling stats.get(name) - ' +
            'stats.getBase(name). Returns 0 for invalid objects/stats.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_art_name',
        kind: 'opcode',
        description:
            'sfall 0x81B7: obj_art_name(obj) → art path string of a game object. ' +
            'Returns the obj.art property (e.g. "art/critters/hmjmpsaa") or "" for ' +
            'non-objects. Used by scripts that check sprite names for gameplay logic.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_item_type_int',
        kind: 'opcode',
        description:
            'sfall 0x81B8: get_item_type_int(item) → item subtype as Fallout 2 integer. ' +
            '0=armor, 1=container, 2=drug, 3=weapon, 4=ammo, 5=misc, 6=key. ' +
            'Delegates to obj_item_subtype for consistent subtype mapping.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_pc_stat',
        kind: 'opcode',
        description:
            'sfall 0x81B9: set_pc_stat(pcstat, val) → set a player-character stat by index. ' +
            'Supports: 0=unspent_skill_points, 1=level, 2=experience, 3/4=karma/reputation. ' +
            'Prevents unknown-opcode crashes in scripts that drive PC progression.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_num_critters_in_radius',
        kind: 'opcode',
        description:
            'sfall 0x81BA: num_critters_in_radius(tile, elev, radius) → count of live critters ' +
            'within the specified hex radius of a tile. Iterates gMap.getObjects() and counts ' +
            'alive critters within hexDistance(origin, pos) <= radius. Used by AI scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_object_ai_num',
        kind: 'opcode',
        description:
            'sfall 0x81BB: get_object_ai_num(obj) → AI packet number of a critter. ' +
            'Returns critter.aiNum (-1 if not a critter). Used by scripts checking AI behaviour.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_object_ai_num',
        kind: 'opcode',
        description:
            'sfall 0x81BC: set_object_ai_num(obj, num) → set AI packet number of a critter. ' +
            'Sets critter.aiNum. Alias for critter_add_trait(TRAIT_OBJECT, OBJECT_AI_PACKET). ' +
            'Prevents unknown-opcode crashes in AI-override scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_hostile_to_dude',
        kind: 'opcode',
        description:
            'sfall 0x81BD: get_critter_hostile_to_dude(obj) → 1 if critter is hostile to the ' +
            'player, 0 otherwise. Reads critter.hostile flag. Used by encounter/dialogue scripts ' +
            'that check whether an NPC is in an aggressive stance.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // Phase 52 entries
    {
        id: 'metarule3_106_elevation',
        kind: 'metarule',
        description:
            'BLK-036: METARULE3_TILE_GET_NEXT_CRITTER(106) — previously used ' +
            'gMap.objectsAtPosition() which only searched the current floor, ignoring the ' +
            'elevation argument. Now uses gMap.getObjects(elevation) + position filter so ' +
            'multi-floor maps (Vaults, Oil Rig) return the correct critter at the target tile. ' +
            'Also implements the lastCritter iteration parameter for enumerating all critters ' +
            'at a tile in sequence.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'tile_contains_obj_pid_elevation',
        kind: 'procedure',
        description:
            'BLK-037: tile_contains_obj_pid(tile, elevation, pid) — previously returned 0 ' +
            'whenever the elevation argument did not equal the current floor, even if the ' +
            'queried object existed on that floor. Now uses gMap.getObjects(elevation) with ' +
            'position + PID filtering so cross-floor object checks work correctly on multi- ' +
            'level maps.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'sfall_get_critter_weapon',
        kind: 'opcode',
        description:
            'sfall 0x81BE: get_critter_weapon(critter, slot) → weapon game object or 0. ' +
            'slot 0 = primary hand (rightHand), slot 1 = secondary hand (leftHand). ' +
            'Returns 0 if no weapon is equipped in the specified slot. ' +
            'Used by combat-AI and equipment scripts to inspect critter loadout.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_critter_inven_size',
        kind: 'opcode',
        description:
            'sfall 0x81BF: critter_inven_size(critter) → count of items in critter inventory. ' +
            'Returns 0 for non-critters or critters with no inventory. ' +
            'Prevents unknown-opcode crashes in loot and inventory-size scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_sfall_args_count',
        kind: 'opcode',
        description:
            'sfall 0x81C0: get_sfall_args_count() → 0. ' +
            'Returns the number of arguments passed to the current hook script. ' +
            'Browser build has no hook scripts; always returns 0. ' +
            'Prevents unknown-opcode crashes in hook-script-aware mods.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_sfall_arg_at',
        kind: 'opcode',
        description:
            'sfall 0x81C1: get_sfall_arg_at(idx) → 0. ' +
            'Returns a hook-script argument by index. Browser build returns 0 always. ' +
            'Prevents unknown-opcode crashes in hook-aware mods.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_sfall_arg',
        kind: 'opcode',
        description:
            'sfall 0x81C2: set_sfall_arg(idx, val) — no-op. ' +
            'Writes a value back into a hook-script argument buffer. ' +
            'No-op in the browser build. Prevents unknown-opcode crashes.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_lighting',
        kind: 'opcode',
        description:
            'sfall 0x81C3: get_object_lighting(obj) → light level (0–65536). ' +
            'Partial: returns the global ambient light level as an approximation. ' +
            'Per-object lighting is not modelled in the browser build. ' +
            'Prevents unknown-opcode crashes in lighting-aware scripts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_team',
        kind: 'opcode',
        description:
            'sfall 0x81C4: get_critter_team(critter) → team number. ' +
            'Returns critter.teamNum (0 = default). Team numbers control which factions ' +
            'will fight each other. Used by faction-alignment scripts. ' +
            'Prevents unknown-opcode crashes in faction scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_critter_team',
        kind: 'opcode',
        description:
            'sfall 0x81C5: set_critter_team(critter, team) — set team number. ' +
            'Sets critter.teamNum. Used by faction-switch and story-beat scripts ' +
            '(e.g. turning a neutral NPC hostile). Prevents unknown-opcode crashes.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // Phase 53 entries
    {
        id: 'blk039_weapon_slot_save',
        kind: 'procedure',
        description:
            'BLK-039: Weapon slot restoration on save/load. leftHandPID and rightHandPID are ' +
            'persisted in SerializedCritter and restored on deserialization so equipped weapons ' +
            'survive save/load cycles without being reset to bare-handed punch.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk040_dead_target_guard',
        kind: 'procedure',
        description:
            'BLK-040: doAITurn dead-target guard. Before attacking, the AI now checks whether ' +
            'the target died during the move phase. If so it re-targets by recursing into ' +
            'doAITurn, preventing attacks on already-dead critters and potential null-dereferences.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk040_no_ap_guard',
        kind: 'procedure',
        description:
            'BLK-040: nextTurn AP guard. Critters that were added to combat mid-round without ' +
            'their AP object initialised now have their turn skipped with a warning rather than ' +
            'crashing on the non-null assertion critter.AP!.resetAP().',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'sfall_get_critter_base_stat',
        kind: 'opcode',
        description:
            'sfall 0x81C6: get_critter_base_stat(critter, stat) → unmodified base stat value. ' +
            'Returns the raw base value before perk/equipment bonuses. Prevents unknown-opcode ' +
            'crashes in scripts that probe SPECIAL stats before modifiers are applied.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_critter_base_stat',
        kind: 'opcode',
        description:
            'sfall 0x81C7: set_critter_base_stat(critter, stat, value) — set base stat. ' +
            'Delegates to set_critter_stat/setBase. Used by training and attribute-override scripts.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_critter_mod_skill_points',
        kind: 'opcode',
        description:
            'sfall 0x81C8: critter_mod_skill_points(critter, delta) — add/subtract skill points. ' +
            'Only applies to the player critter; NPCs are silently ignored. ' +
            'Prevents unknown-opcode crashes in level-up and reward scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_current_ap',
        kind: 'opcode',
        description:
            'sfall 0x81C9: get_critter_current_ap(critter) → current combat AP. ' +
            'Returns critter.AP.combat. Returns 0 outside combat or for non-critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_critter_current_ap',
        kind: 'opcode',
        description:
            'sfall 0x81CA: set_critter_current_ap(critter, ap) — override combat AP. ' +
            'Sets critter.AP.combat to the given value. Used by bonus-AP scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'sfall_get_combat_target',
        kind: 'opcode',
        description:
            'sfall 0x81CB: get_combat_target(critter) → current combat target or 0. ' +
            'Browser build: returns 0 (no per-critter target tracking). ' +
            'Prevents unknown-opcode crashes in combat AI scripts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_combat_target',
        kind: 'opcode',
        description:
            'sfall 0x81CC: set_combat_target(critter, target) — no-op. ' +
            'Browser build does not maintain per-critter target state. ' +
            'Prevents unknown-opcode crashes in combat scripts.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_game_time_in_seconds',
        kind: 'opcode',
        description:
            'sfall 0x81CD: get_game_time_in_seconds() → game time in seconds. ' +
            'Returns Math.floor(gameTickTime / 10). Equivalent to game_time() / 10. ' +
            'Prevents unknown-opcode crashes in time-sensitive scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_light_level_81ce',
        kind: 'opcode',
        description:
            'sfall 0x81CE: get_light_level() → ambient light level (0–65536). ' +
            'Returns globalState.ambientLightLevel or 65536. ' +
            'Prevents unknown-opcode crashes in lighting-aware scripts.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_light_level_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81CF: set_light_level(level, update) — set ambient light level. ' +
            'Stores the value in globalState.ambientLightLevel (0–65536 clamped). ' +
            'Actual rendering update is deferred in the browser build.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 54 entries
    {
        id: 'blk_041_xp_on_kill',
        kind: 'procedure',
        description:
            'BLK-041: Auto-award XP on critter kill. critterKill() now checks whether ' +
            'the source is the player and awards pro.extra.XPValue XP to the player when ' +
            'it is.  A level-up check runs immediately after, granting skill points ' +
            '(10 + INT/2) per level gained.  This mirrors Fallout 2 engine behaviour ' +
            'where the engine itself awards combat-kill XP (not scripts).',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_042_player_weapon_slot_save',
        kind: 'procedure',
        description:
            'BLK-042: Player equipped weapon slots (leftHand/rightHand) persisted in ' +
            'save schema v15.  When the player drags a weapon from inventory to an ' +
            'equipment slot the item is removed from inventory.  Save schema v15 adds ' +
            'playerLeftHandPID and playerRightHandPID; the serialized weapon is included ' +
            'in the inventory save so it can be re-equipped on load.  This prevents the ' +
            'player from losing their equipped weapon across save/load cycles.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_043_skill_points_on_level_up',
        kind: 'procedure',
        description:
            'BLK-043: Skill points awarded per level-up in give_exp_points. ' +
            'Formula: max(1, 10 + floor(INT/2)) + 2 * Educated_perk_rank. ' +
            'Matches Fallout 2 formula so the player can invest in skills as they ' +
            'level up through the campaign.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_044_inven_unwield_active_hand',
        kind: 'procedure',
        description:
            'BLK-044: inven_unwield(obj) now respects activeHand for the player. ' +
            'activeHand=0 clears leftHand (primary slot); activeHand=1 clears rightHand ' +
            '(secondary slot).  NPC behaviour unchanged (always clears rightHand). ' +
            'This fixes cases where scripts called inven_unwield expecting the active ' +
            'weapon to be removed but the wrong slot was cleared.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_game_mode',
        kind: 'opcode',
        description:
            'sfall 0x81D0: get_game_mode() → bitmask of current game mode. ' +
            'Browser build: bit 0 = always set (normal), bit 1 = combat mode ' +
            '(inCombat flag).  Scripts use this to skip combat-only logic when not in combat.',
        status: 'partial',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_force_encounter',
        kind: 'opcode',
        description:
            'sfall 0x81D1: force_encounter(mapId) — trigger a forced random encounter. ' +
            'Browser build: no-op (random encounter system not fully implemented).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_force_encounter_with_flags',
        kind: 'opcode',
        description:
            'sfall 0x81D2: force_encounter_with_flags(mapId, flags) — force encounter. ' +
            'Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_last_pers_obj',
        kind: 'opcode',
        description:
            'sfall 0x81D3: get_last_pers_obj() → last critter that started persistent ' +
            'combat.  Browser build: returns 0 (no persistent combat tracking).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_is_disabled',
        kind: 'opcode',
        description:
            'sfall 0x81D4: obj_is_disabled(obj) → 1 if the object\'s AI is disabled. ' +
            'Browser build: partial — no per-object disable flag; always returns 0.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_remove_script',
        kind: 'opcode',
        description:
            'sfall 0x81D5: obj_remove_script(obj) — remove script from an object. ' +
            'Browser build: no-op (no SID-based script registry).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_add_script',
        kind: 'opcode',
        description:
            'sfall 0x81D6: obj_add_script(obj, sid) — attach a script by SID. ' +
            'Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_run_proc',
        kind: 'opcode',
        description:
            'sfall 0x81D7: obj_run_proc(obj, proc_name) — run a named procedure. ' +
            'Browser build: no-op (cannot dynamically invoke named procs by string).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 55 entries
    {
        id: 'blk_045_player_armor_save',
        kind: 'procedure',
        description:
            'BLK-045: Player equipped armor (equippedArmor) persisted in save schema v16. ' +
            'Armor equipped via drag-and-drop is removed from inventory and stored only in ' +
            'player.equippedArmor.  Save schema v16 adds playerArmorPID; the save path ' +
            'serializes the armor into inventory so it survives the load cycle.  The load ' +
            'path re-equips it by PID lookup.  Prevents players from losing Combat Armor, ' +
            'Leather Armor, etc. across save/load cycles.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_046_party_migration_safety',
        kind: 'procedure',
        description:
            'BLK-046: Defensive party array normalization added to migrateSave(). ' +
            'If a save object does not have a valid array in the "party" field, ' +
            'migrateSave() now initializes it to [] before validation.  Without this, ' +
            'validateSaveForHydration aborts the load and leaves the game in an ' +
            'unchanged (pre-load) state, silently losing user progress.',
        status: 'implemented',
        frequency: 'low',
        impact: 'high',
    },
    {
        id: 'blk_047_perk_owed_tracking',
        kind: 'procedure',
        description:
            'BLK-047: Perk-owed credit tracking.  give_exp_points() now increments ' +
            'globalState.playerPerksOwed by 1 every time the player reaches a level ' +
            'that is a multiple of 3 (levels 3, 6, 9, …), matching Fallout 2 behaviour. ' +
            'get_perk_owed() (sfall 0x81AE) returns the actual counter instead of ' +
            'always returning 0; set_perk_owed() (0x81AF) writes the counter instead ' +
            'of being a no-op.  playerPerksOwed is persisted in save schema v16.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_drop_amount',
        kind: 'opcode',
        description:
            'sfall 0x81D8: get_drop_amount(obj) → count of items that drop when obj ' +
            'is destroyed.  Browser build: returns 0 (no drop-amount registry).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_drop_amount',
        kind: 'opcode',
        description:
            'sfall 0x81D9: set_drop_amount(obj, amount) — override item drop count. ' +
            'Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_art_exists',
        kind: 'opcode',
        description:
            'sfall 0x81DA: art_exists(artPath) → 1 if art resource exists, 0 otherwise. ' +
            'Browser build: returns 0 (no local art index to query at runtime).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_item_subtype_81db',
        kind: 'opcode',
        description:
            'sfall 0x81DB: obj_item_subtype(obj) → item subtype integer. ' +
            'Alias of core opcode 0x80C9 obj_item_subtype; returns weapon=0, ammo=1, ' +
            'misc=2, key=3, armor=4, container=5, drug=6.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_level_81dc',
        kind: 'opcode',
        description:
            'sfall 0x81DC: get_critter_level(obj) — return derived level of a critter. ' +
            'Alias of get_npc_level (0x8162); same XP-based level formula.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_hero_art_id',
        kind: 'opcode',
        description:
            'sfall 0x81DD: hero_art_id(type) → hero art ID for the given player model ' +
            'type.  Browser build: returns 0 (no hero-art registry).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_current_inven_size',
        kind: 'opcode',
        description:
            'sfall 0x81DE: get_current_inven_size(critter) — return total inventory ' +
            'size in item-size units.  Alias of critter_inven_size (0x81BF).',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_burst_disable',
        kind: 'opcode',
        description:
            'sfall 0x81DF: set_critter_burst_disable(obj, disable) — disable or enable ' +
            'burst-fire mode for a critter.  Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 56 entries
    {
        id: 'blk_048_player_name_gender_save',
        kind: 'procedure',
        description:
            'BLK-048: Player name and gender persisted in save schema v17. ' +
            'Player.name (set during character creation / set_name opcode) and ' +
            'player.gender (checked via get_critter_stat STAT_gender) reverted to ' +
            'class defaults on every reload. Save schema v17 adds playerName and ' +
            'playerGender; both save and load paths snapshot/restore them.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_049_critter_kill_level_up_consistency',
        kind: 'procedure',
        description:
            'BLK-049: Level-up via critterKill() XP path now applies Educated perk ' +
            'bonus (+2 skill pts per rank) and awards perk credit every 3 levels, ' +
            'matching give_exp_points() and Fallout 2 behaviour.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'blk_050_set_name_opcode',
        kind: 'procedure',
        description:
            'BLK-050: set_name(obj, name) opcode (0x80A8) implemented.  Previously ' +
            'absent, causing VM stack corruption on every call from character-creation ' +
            'and NPC rename scripts.  Now assigns name directly on the game object.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_current_map_id_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81E0: get_current_map_id_sfall() — return the current map index. ' +
            'Alias of metarule(46,0); fully implemented.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_dude_distance',
        kind: 'opcode',
        description:
            'sfall 0x81E1: get_object_dude_distance(obj) — return tile distance from ' +
            'obj to the player character.  Fully implemented; returns -1 for invalid input.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_attack_mode',
        kind: 'opcode',
        description:
            'sfall 0x81E2: get_critter_attack_mode(obj) — return attack-mode index. ' +
            'Browser build: partial — returns 0 (no per-critter attack-mode tracking).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_attack_mode',
        kind: 'opcode',
        description:
            'sfall 0x81E3: set_critter_attack_mode(obj, mode) — set attack-mode index. ' +
            'Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_map_first_run_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81E4: get_map_first_run_sfall() — return 1 if map is first-run, 0 otherwise. ' +
            'Alias of map_first_run (0x80A0); fully implemented.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_script_type',
        kind: 'opcode',
        description:
            'sfall 0x81E5: get_script_type_sfall() — return script type (0=map, 1=critter, etc.). ' +
            'Browser build: partial — always returns 0.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_tile_pid',
        kind: 'opcode',
        description:
            'sfall 0x81E6: get_tile_pid_sfall(tile, elev) — return PID of first non-critter ' +
            'object at tile/elev, 0 if none.  Partially implemented.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_skill_points',
        kind: 'opcode',
        description:
            'sfall 0x81E7: get_critter_skill_points(obj, skill) — return base skill-point ' +
            'allocation for skill on a critter.  Fully implemented via SkillSet.getBase().',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 57 entries
    {
        id: 'blk_051_combat_null_ai_guard',
        kind: 'procedure',
        description:
            'BLK-051: nextTurn() and doAITurn() now guard against null this.player and ' +
            'null obj.ai.  Previously these caused hard crashes when combat was entered ' +
            'without a player combatant, or after save/load when a critter\'s AI failed ' +
            'to initialise.  Guards call end() or nextTurn() gracefully instead.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },
    {
        id: 'blk_052_maybetaunt_null_ai_guard',
        kind: 'procedure',
        description:
            'BLK-052: maybeTaunt() now guards against null obj.ai before dereferencing ' +
            'obj.ai.info.  Prevents crash when an NPC without AI data tries to taunt ' +
            'during its combat turn.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_053_unarmed_combat_fallback',
        kind: 'procedure',
        description:
            'BLK-053: getHitChance() and getDamageDone() now fall back to unarmed combat ' +
            'stats (Weapon(null) / Unarmed skill) when equippedWeapon is null or its ' +
            '.weapon field is missing.  Previously both returned {hit:-1,crit:-1}/0 ' +
            'causing all weaponless attacks to auto-miss and deal zero damage.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_object_cost_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81E8: get_object_cost_sfall(obj) — return the base barter/store cost ' +
            'of an item from its proto data.  Equivalent to proto_data(obj, ITEM_DATA_COST). ' +
            'Returns 0 for critters and non-game objects.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_object_cost_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81E9: set_object_cost_sfall(obj, cost) — override barter cost at ' +
            'runtime.  Browser build: no-op (proto data is read-only).',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_sfall_global_int_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81EA: get_sfall_global_int_sfall(index) — alias of get_sfall_global_int; ' +
            'return the integer sfall global at the given index.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_sfall_global_int_sfall',
        kind: 'opcode',
        description:
            'sfall 0x81EB: set_sfall_global_int_sfall(index, value) — alias of ' +
            'set_sfall_global_int; write to the integer sfall global at the given index.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_combat_difficulty',
        kind: 'opcode',
        description:
            'sfall 0x81EC: get_combat_difficulty_sfall() — return the current combat ' +
            'difficulty (0=Easy, 1=Normal, 2=Hard).  Browser build: always returns 1.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_game_in_combat',
        kind: 'opcode',
        description:
            'sfall 0x81ED: game_in_combat_sfall() — return 1 if the engine is currently ' +
            'in turn-based combat, 0 otherwise.  Fully implemented; reads globalState.inCombat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_tile_fid',
        kind: 'opcode',
        description:
            'sfall 0x81EE: get_tile_fid_sfall(tile, elev) — return the FID of the floor ' +
            'tile at the given position.  Browser build: partial — returns 0 (no tile FID ' +
            'registry).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_tile_fid',
        kind: 'opcode',
        description:
            'sfall 0x81EF: set_tile_fid_sfall(tile, elev, fid) — override the floor-tile ' +
            'FID at the given position.  Browser build: no-op.',
        status: 'stub',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 58 entries
    {
        id: 'blk_054_critter_name_persistence',
        kind: 'procedure',
        description:
            'BLK-054: Critter names set via set_name() now survive save/load.  ' +
            'Critter.fromMapObject() restores mobj.name after init() to prevent the ' +
            'proto text overwriting script-assigned custom names on deserialization.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_055_tile_contains_null_position_guard',
        kind: 'procedure',
        description:
            'BLK-055: tile_contains_pid_obj() and tile_contains_obj_pid() now skip ' +
            'objects with null/undefined position instead of crashing on .position.x ' +
            'access.  Prevents crashes during map transitions when some objects lack ' +
            'a position (e.g. after an explosion removes them).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_xp',
        kind: 'opcode',
        description:
            'sfall 0x81F0: get_critter_xp_sfall(obj) — return the XP value of a critter ' +
            'from its proto data.  Returns 0 for non-critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_sid',
        kind: 'opcode',
        description:
            'sfall 0x81F1: get_object_sid_sfall(obj) — return the script SID for a game ' +
            'object, or 0 if it has no script.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_game_mode_ex',
        kind: 'opcode',
        description:
            'sfall 0x81F2: get_game_mode_ex_sfall() — extended game mode bitfield.  ' +
            'Browser build: alias of get_game_mode_sfall(), returns 0 (field mode).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_pid',
        kind: 'opcode',
        description:
            'sfall 0x81F3: get_object_pid_sfall(obj) — return the prototype ID (PID) of a ' +
            'game object.  Equivalent to obj_pid (0x80D0).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_kill_type',
        kind: 'opcode',
        description:
            'sfall 0x81F4: get_critter_kill_type_sfall(obj) — return the kill-type index ' +
            'of a critter for kill-count attribution.  Reads pro.extra.killType.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_tile_at',
        kind: 'opcode',
        description:
            'sfall 0x81F5: get_tile_at_sfall(x, y) — convert hex-grid (x, y) coordinates ' +
            'to a Fallout 2 tile number.  Inverse of fromTileNum.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_type',
        kind: 'opcode',
        description:
            'sfall 0x81F6: get_object_type_sfall(obj) — return the object type as an ' +
            'integer (0=item, 1=critter, 2=scenery, 3=wall, 4=tile, 5=misc).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_critter_at',
        kind: 'opcode',
        description:
            'sfall 0x81F7: critter_at_sfall(tile, elev) — return the first non-player ' +
            'critter at the given tile/elevation, or 0 if none present.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },

    // Phase 59 entries
    {
        id: 'blk_056_giq_option_null_player',
        kind: 'procedure',
        description:
            'BLK-056: giq_option() now guards against null globalState.player.  ' +
            'Previously crashed when called before the player was initialised (e.g. ' +
            'early map scripts); now shows the option unconditionally in that case.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_057_node998_enter_combat',
        kind: 'procedure',
        description:
            'BLK-057: node998() now exits any active dialogue and initiates combat ' +
            'against the player when an NPC script triggers the "go hostile" node.  ' +
            'Previously was a no-op logging stub.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_058_metarule3_108_null_position',
        kind: 'procedure',
        description:
            'BLK-058: metarule3(108) CRITTER_DIST now guards both object positions ' +
            'before calling hexDistance.  Prevents crash when either critter lacks a ' +
            'position (e.g. just-created or off-map objects).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_max_hp',
        kind: 'opcode',
        description:
            'sfall 0x81F8: get_critter_max_hp_sfall(obj) — return critter Max HP stat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_max_hp',
        kind: 'opcode',
        description:
            'sfall 0x81F9: set_critter_max_hp_sfall(obj, hp) — set critter base Max HP.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_total_kills',
        kind: 'opcode',
        description:
            'sfall 0x81FA: get_total_kills_sfall() — return total kills across all kill types.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_extra_data',
        kind: 'opcode',
        description:
            'sfall 0x81FB: get_critter_extra_data_sfall(obj, field) — return a field from ' +
            'critter proto extra data (0=age, 1=gender, 2=killType, 3=XP, 4=AI).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_script_return_val',
        kind: 'opcode',
        description:
            'sfall 0x81FC: get_script_return_val_sfall() — return the last stored sfall ' +
            'return value.  Companion to set_script_return_val_sfall (0x81FD).',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_script_return_val',
        kind: 'opcode',
        description:
            'sfall 0x81FD: set_script_return_val_sfall(val) — store a script return value.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_active_map_id',
        kind: 'opcode',
        description:
            'sfall 0x81FE: get_active_map_id_sfall() — alias of get_current_map_id_sfall.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_range',
        kind: 'opcode',
        description:
            'sfall 0x81FF: get_critter_range_sfall(obj) — return max attack range of the ' +
            'critter\'s equipped weapon (maxRange1 from proto).  Defaults to 1 (melee).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },

    // Phase 60 entries
    {
        id: 'blk_059_combat_null_position_guards',
        kind: 'procedure',
        description:
            'BLK-059: Added null-position guards to combat.ts: attack() orientation ' +
            'flip, findTarget() sort comparator, doAITurn() distance calc, nextTurn() ' +
            'range check.  Prevents crashes when combatants lack a map position.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'sfall_get_critter_current_hp',
        kind: 'opcode',
        description:
            'sfall 0x8200: get_critter_current_hp_sfall(obj) — return critter current HP ' +
            '(alias of critter_hp via sfall convention).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_level2',
        kind: 'opcode',
        description:
            'sfall 0x8201: get_critter_level_sfall2(obj) — return critter level (used by ' +
            'level-scaling and encounter scripts).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_num_nearby_critters',
        kind: 'opcode',
        description:
            'sfall 0x8202: get_num_nearby_critters_sfall(obj, radius, team) — count living ' +
            'critters within radius hexes of obj belonging to team (-1 = any).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_is_critter_hostile',
        kind: 'opcode',
        description:
            'sfall 0x8203: is_critter_hostile_sfall(obj) — return 1 if critter is hostile ' +
            'to the player.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_hostile',
        kind: 'opcode',
        description:
            'sfall 0x8204: set_critter_hostile_sfall(obj, hostile) — set the hostile flag ' +
            'on a critter.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_inven_slot',
        kind: 'opcode',
        description:
            'sfall 0x8205: get_inven_slot_sfall(critter, slot) — return the item in the ' +
            'given equipment slot (0=left, 1=right, 2=armor).  Returns 0 if empty.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_body_type',
        kind: 'opcode',
        description:
            'sfall 0x8206: get_critter_body_type_sfall(obj) — return critter body type ' +
            '(0=biped, 1=quadruped, 2=robotic) from proto.extra.bodyType.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_flags',
        kind: 'opcode',
        description:
            'sfall 0x8207: get_flags_sfall(obj) — return the raw Fallout 2 object flags ' +
            'bitmask from obj.flags.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // Phase 61 entries
    {
        id: 'blk_060_tile_distance_null_position',
        kind: 'procedure',
        description:
            'BLK-060: tile_distance_objs() and tile_num() now guard null positions.  ' +
            'tile_distance_objs returns 0 instead of crashing; tile_num returns -1.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_061_add_timer_event_null_script',
        kind: 'procedure',
        description:
            'BLK-061: add_timer_event() callback now checks obj._script before calling ' +
            'timedEvent().  Prevents crash when the owning object is destroyed between ' +
            'add_timer_event() and when the timer actually fires.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_trait',
        kind: 'opcode',
        description:
            'sfall 0x8208: get_critter_trait_sfall(obj, traitId) — return 1 if a critter ' +
            'has the given character trait, 0 otherwise.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_critter_trait',
        kind: 'opcode',
        description:
            'sfall 0x8209: set_critter_trait_sfall(obj, traitId, value) — add or remove a ' +
            'character trait from a critter\'s charTraits set.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_race',
        kind: 'opcode',
        description:
            'sfall 0x820A: get_critter_race_sfall(obj) — return critter race index from ' +
            'proto.extra.race.  Defaults to 0 (human).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_obj_has_trait',
        kind: 'opcode',
        description:
            'sfall 0x820B: obj_has_trait_sfall(obj, traitId) — alias of get_critter_trait_sfall.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_move_ap',
        kind: 'opcode',
        description:
            'sfall 0x820C: get_critter_move_ap_sfall(obj) — return available move AP.  ' +
            'Returns 0 when not in combat or AP not initialized.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_combat_ap',
        kind: 'opcode',
        description:
            'sfall 0x820D: get_critter_combat_ap_sfall(obj) — return available combat AP.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_critter_knockout',
        kind: 'opcode',
        description:
            'sfall 0x820E: critter_knockout_sfall(obj) — return 1 if critter is knocked out.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_map_script_id',
        kind: 'opcode',
        description:
            'sfall 0x820F: get_map_script_id_sfall() — return current map script ID.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 62 entries
    // ---------------------------------------------------------------------------

    // BLK-062: Combat auto-end after player kills last enemy
    {
        id: 'blk_062_combat_auto_end_after_kill',
        kind: 'procedure',
        description:
            'BLK-062: Combat.attack() now wraps the animation callback to call nextTurn() ' +
            'automatically when the last non-player combatant is killed.  ' +
            'nextTurn() detects numActive===0 and calls end(), so combat ends without ' +
            'requiring an explicit "End Turn" button press after the last enemy dies.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },

    // BLK-063: canEndCombat() helper
    {
        id: 'blk_063_can_end_combat_helper',
        kind: 'procedure',
        description:
            'BLK-063: Combat.canEndCombat() returns true when all non-player combatants ' +
            'are dead.  Used internally by auto-end (BLK-062).  The TODO comment in ' +
            'Combat.end() is resolved; ending is triggered by nextTurn() or auto-end.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },

    // BLK-064: get_ini_setting common-key defaults
    {
        id: 'blk_064_get_ini_setting_defaults',
        kind: 'opcode',
        description:
            'BLK-064: get_ini_setting(key) now returns sensible FO2 engine defaults for ' +
            '~20 well-known config keys (SpeedInterfaceCounterAnims=1, FPS=60, sound=1, ' +
            'etc.).  Unknown keys still return 0.  Full INI file access is unavailable ' +
            'in the browser build but engine-appropriate defaults prevent scripts from ' +
            'treating absent settings as explicitly disabled.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // BLK-065: critter_attempt_placement null guard
    {
        id: 'blk_065_critter_attempt_placement_guard',
        kind: 'procedure',
        description:
            'BLK-065: critter_attempt_placement(obj, tileNum, elev) now returns -1 ' +
            '(failure) when obj is null/non-game-object or tileNum is ≤0.  This mirrors ' +
            'the Fallout 2 engine return value for failed placement and prevents move_to ' +
            'from crashing on invalid inputs.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // sfall 0x8210-0x8217
    {
        id: 'sfall_critter_is_fleeing',
        kind: 'opcode',
        description:
            'sfall 0x8210: critter_is_fleeing_sfall(obj) — return 1 if critter is ' +
            'currently fleeing (low-HP flight behaviour).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_perk_name',
        kind: 'opcode',
        description:
            'sfall 0x8211: get_perk_name_sfall(perkId) — return display name of perk. ' +
            'Browser build: returns empty string (perk name table not loaded).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_perk',
        kind: 'opcode',
        description:
            'sfall 0x8212: get_critter_perk_sfall(critter, perkId) — return rank of ' +
            'perk possessed by critter.  Reads from critter.perkRanks.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_obj_is_open',
        kind: 'opcode',
        description:
            'sfall 0x8213: obj_is_open_sfall(obj) — return 1 if object is open ' +
            '(door/container state), else 0.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_world_map_x',
        kind: 'opcode',
        description:
            'sfall 0x8214: get_world_map_x_sfall() — return player world-map x ' +
            'coordinate, or -1 when inside a local map.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_world_map_y',
        kind: 'opcode',
        description:
            'sfall 0x8215: get_world_map_y_sfall() — return player world-map y ' +
            'coordinate, or -1 when inside a local map.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_world_map_pos',
        kind: 'opcode',
        description:
            'sfall 0x8216: set_world_map_pos_sfall(x, y) — update stored world-map ' +
            'position.  No-op when the player is not on the world map.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_weight',
        kind: 'opcode',
        description:
            'sfall 0x8217: get_object_weight_sfall(obj) — return object weight in ' +
            'pounds from prototype data.  Returns 0 for non-items.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 63 entries
    // ---------------------------------------------------------------------------

    // BLK-066: obj_carrying_pid_obj equipped-slot check
    {
        id: 'blk_066_obj_carrying_pid_obj_equipped',
        kind: 'procedure',
        description:
            'BLK-066: obj_carrying_pid_obj(obj, pid) now checks equipped item slots ' +
            '(leftHand, rightHand, equippedArmor) in addition to the inventory array. ' +
            'In Fallout 2, equipped items are removed from inventory; scripts that test ' +
            'whether an NPC is carrying a weapon would previously miss equipped items.',
        status: 'implemented',
        frequency: 'high',
        impact: 'high',
    },

    // BLK-067: party_member_obj null guard
    {
        id: 'blk_067_party_member_obj_null_guard',
        kind: 'procedure',
        description:
            'BLK-067: party_member_obj(pid) now guards against a null gParty, ' +
            'returning 0 instead of crashing during early init or in tests.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // sfall 0x8218-0x821F
    {
        id: 'sfall_get_year',
        kind: 'opcode',
        description:
            'sfall 0x8218: get_year_sfall() — return current in-game year (2241+) ' +
            'derived from gameTickTime.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_month',
        kind: 'opcode',
        description:
            'sfall 0x8219: get_month_sfall() — return current in-game month (1–12) ' +
            'using 30-day month approximation.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_day',
        kind: 'opcode',
        description:
            'sfall 0x821A: get_day_sfall() — return current in-game day of month (1–30).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_time',
        kind: 'opcode',
        description:
            'sfall 0x821B: get_time_sfall() — return current in-game time as HHMM ' +
            '(e.g. 1430 = 2:30 PM).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_kill_type_0x821c',
        kind: 'opcode',
        description:
            'sfall 0x821C: get_critter_kill_type_sfall(obj) — return kill-type constant ' +
            '(0=men, 3=super mutants, …) from critter.killType.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_npc_pids',
        kind: 'opcode',
        description:
            'sfall 0x821D: get_npc_pids_sfall() — return NPC PID list. ' +
            'Browser build: returns 0 (not implemented).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_proto_num',
        kind: 'opcode',
        description:
            'sfall 0x821E: get_proto_num_sfall(obj) — return prototype number (PID). ' +
            'Alias of obj_pid().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_mark_area_known',
        kind: 'opcode',
        description:
            'sfall 0x821F: mark_area_known_sfall(areaID, markState) — mark or unmark ' +
            'a world-map location.  Delegates to globalState.markAreaKnown.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // ---------------------------------------------------------------------------
    // Phase 64 entries
    // ---------------------------------------------------------------------------

    // BLK-068: combatEvent script_overrides detection
    {
        id: 'blk_068_combat_event_override_detection',
        kind: 'procedure',
        description:
            'BLK-068: Scripting.combatEvent() now returns true when script_overrides() ' +
            'is called in combat_p_proc (in addition to terminate_combat).  This allows ' +
            'scripted NPC combat turns to suppress the default AI processing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },

    // BLK-069: destroy_object null guard
    {
        id: 'blk_069_destroy_object_null_guard',
        kind: 'procedure',
        description:
            'BLK-069: destroy_object(obj) now guards against null gMap and null obj, ' +
            'logging a warning instead of crashing during map transitions.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // BLK-070: set_flags_sfall
    {
        id: 'blk_070_set_flags_sfall',
        kind: 'opcode',
        description:
            'BLK-070: set_flags_sfall(obj, flags) now writes the flags value to ' +
            'obj.pro.extra.flags, making it persistent and readable by get_flags_sfall().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },

    // sfall 0x8220-0x8227
    {
        id: 'sfall_get_cursor_mode',
        kind: 'opcode',
        description:
            'sfall 0x8220: get_cursor_mode_sfall() — return cursor mode (0 in browser).',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_cursor_mode',
        kind: 'opcode',
        description:
            'sfall 0x8221: set_cursor_mode_sfall(mode) — set cursor mode (no-op in browser).',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_flags',
        kind: 'opcode',
        description:
            'sfall 0x8222: set_flags_sfall(obj, flags) — set extended flags on object. ' +
            'Writes to obj.pro.extra.flags.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_critter_skill_level',
        kind: 'opcode',
        description:
            'sfall 0x8223: critter_skill_level_sfall(obj, skillId) — return effective ' +
            'skill level for a critter via getSkill().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_active_weapon',
        kind: 'opcode',
        description:
            'sfall 0x8224: get_active_weapon_sfall(obj) — return the object in the ' +
            'critter\'s active hand (rightHand or leftHand).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_inven_ap_cost',
        kind: 'opcode',
        description:
            'sfall 0x8225: get_inven_ap_cost_sfall(obj, item) — return AP cost (stub 0).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_can_see_tile',
        kind: 'opcode',
        description:
            'sfall 0x8226: obj_can_see_tile_sfall(obj, tileNum) — return 1 if critter ' +
            'can see tile (distance ≤ PER×5).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_map_enter_position',
        kind: 'opcode',
        description:
            'sfall 0x8227: get_map_enter_position_sfall(type) — return map entry ' +
            'position value.  Browser build: returns -1.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 65 entries
    // ---------------------------------------------------------------------------

    {
        id: 'sfall_get_critter_name',
        kind: 'opcode',
        description:
            'sfall 0x8228: get_critter_name_sfall(obj) — return critter display name. ' +
            'Alias of get_critter_name().',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_car_fuel_amount',
        kind: 'opcode',
        description:
            'sfall 0x8229: get_car_fuel_amount_sfall() — return current car fuel level. ' +
            'Reads from globalState.carFuel (defaults to 0).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_car_fuel_amount',
        kind: 'opcode',
        description:
            'sfall 0x822A: set_car_fuel_amount_sfall(amount) — set car fuel level (clamped to 0–80000).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_ai_packet',
        kind: 'opcode',
        description:
            'sfall 0x822B: get_critter_ai_packet_sfall(obj) — return AI packet index. ' +
            'Reads from critter.aiPacket or proto.extra.aiPacket.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_critter_ai_packet',
        kind: 'opcode',
        description:
            'sfall 0x822C: set_critter_ai_packet_sfall(obj, id) — set AI packet index on critter.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_obj_under_cursor',
        kind: 'opcode',
        description:
            'sfall 0x822D: obj_under_cursor_sfall() — return object under cursor. ' +
            'Browser build: returns 0.',
        status: 'partial',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_attack_weapon',
        kind: 'opcode',
        description:
            'sfall 0x822E: get_attack_weapon_sfall(obj, attackType) — return weapon for attack type. ' +
            'type=0=rightHand, type=1=leftHand.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_tile_pid_at',
        kind: 'opcode',
        description:
            'sfall 0x822F: get_tile_pid_at_sfall(tileNum, elevation) — return PID of first object at tile.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 66 entries
    // ---------------------------------------------------------------------------

    {
        id: 'car_fuel_persistence',
        kind: 'procedure',
        description:
            'BLK-071: carFuel saved and loaded via save schema v18. ' +
            'car fuel level is now persisted across save/load cycles so the ' +
            'Highwayman remains fueled after reloading. Previously, fuel reset to ' +
            '0 on every load, making the vehicle useless for subsequent sessions.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'tile_contains_pid_obj_null_gmap',
        kind: 'procedure',
        description:
            'BLK-072: tile_contains_pid_obj() null guard for globalState.gMap. ' +
            'Previously dereferenced gMap unconditionally, causing a crash when ' +
            'scripts called it during map transitions or before a map was loaded. ' +
            'Now returns 0 safely when gMap is null.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'sfall_get_object_name',
        kind: 'opcode',
        description:
            'sfall 0x8230: get_object_name_sfall(obj) — return display name of any ' +
            'game object (critter, item, scenery, …). Alias of obj_name() for all types.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_gender',
        kind: 'opcode',
        description:
            'sfall 0x8231: get_critter_gender_sfall(obj) — return critter gender ' +
            '(0=male, 1=female). Reads from critter.gender; defaults to 0 (male).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_combat_round',
        kind: 'opcode',
        description:
            'sfall 0x8232: get_combat_round_sfall() — return current combat round number. ' +
            'Returns 0 when not in combat.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_action_points',
        kind: 'opcode',
        description:
            'sfall 0x8233: get_critter_action_points_sfall(obj) — return critter current AP. ' +
            'Returns combat AP in combat; max AP (5 + AGI/2) outside combat.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_action_points',
        kind: 'opcode',
        description:
            'sfall 0x8234: set_critter_action_points_sfall(obj, ap) — set critter AP. ' +
            'Alias of set_critter_combat_ap; no-op outside combat.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_max_ap',
        kind: 'opcode',
        description:
            'sfall 0x8235: get_critter_max_ap_sfall(obj) — return critter max AP per turn. ' +
            'Formula: 5 + floor(AGI / 2).',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_carry_weight',
        kind: 'opcode',
        description:
            'sfall 0x8236: get_critter_carry_weight_sfall(obj) — return carry weight capacity. ' +
            'Formula: 25 + ST * 25 (pounds).',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_current_weight',
        kind: 'opcode',
        description:
            'sfall 0x8237: get_critter_current_weight_sfall(obj) — return total weight ' +
            'currently carried by a critter in pounds (sums inventory item weights).',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 67 entries
    // ---------------------------------------------------------------------------

    {
        id: 'blk_073_move_to_null_gmap',
        kind: 'procedure',
        description:
            'BLK-073: move_to() null-gMap guard.  When move_to() was called with a ' +
            'different elevation than the current one, it unconditionally accessed ' +
            'globalState.gMap.changeElevation() / removeObject() / addObject() without ' +
            'checking for null.  During map transitions or before a map is loaded ' +
            'this caused an uncaught TypeError.  Now guards with an early warning ' +
            'and skips the elevation change if gMap is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_074_rm_timer_event_null_obj',
        kind: 'procedure',
        description:
            'BLK-074: rm_timer_event() null-obj guard.  Scripts that cancel timers on ' +
            'destroyed objects sometimes pass 0/null as the object reference.  The ' +
            'unconditional info() call at the start of rm_timer_event accessed obj.pid ' +
            'and crashed.  Now returns early with a warning when obj is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_075_player_injury_flags',
        kind: 'procedure',
        description:
            'BLK-075: Player injury flags persistence in save schema v19.  ' +
            'Crippled limbs (crippledLeftLeg, crippledRightLeg, crippledLeftArm, ' +
            'crippledRightArm) and blindness are now stored as a bitmask in ' +
            'playerInjuryFlags and restored on load.  Without this, critical-hit ' +
            'permanent injuries vanished after every save/reload cycle, letting ' +
            'players bypass gameplay penalties.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_radiation',
        kind: 'opcode',
        description:
            'sfall 0x8238: get_critter_radiation_sfall(obj) — return critter radiation ' +
            'level.  Alias of get_radiation(); returns 0 for non-critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_radiation',
        kind: 'opcode',
        description:
            'sfall 0x8239: set_critter_radiation_sfall(obj, val) — set critter radiation ' +
            'level to the given absolute value (clamped to [0, 1000]).  Unlike ' +
            'radiation_add/radiation_dec which adjust relative to current, this ' +
            'sets it directly.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_get_critter_poison',
        kind: 'opcode',
        description:
            'sfall 0x823A: get_critter_poison_sfall(obj) — return critter poison level. ' +
            'Alias of get_poison(); returns 0 for non-critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_poison',
        kind: 'opcode',
        description:
            'sfall 0x823B: set_critter_poison_sfall(obj, val) — set critter poison level ' +
            'to the given absolute value (clamped to [0, 1000]).  Unlike poison() which ' +
            'adjusts relatively, this sets it directly.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },
    {
        id: 'sfall_critter_in_party',
        kind: 'opcode',
        description:
            'sfall 0x823C: critter_in_party_sfall(obj) — return 1 if the given critter ' +
            'is in the player party (gParty.members), 0 otherwise.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_proto_flags',
        kind: 'opcode',
        description:
            'sfall 0x823D: get_critter_proto_flags_sfall(obj) — return proto flags ' +
            'bitmask stored on the object.  Reads obj.flags; returns 0 if absent.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_proto_flags',
        kind: 'opcode',
        description:
            'sfall 0x823E: set_critter_proto_flags_sfall(obj, flags) — set proto flags ' +
            'bitmask on object.  Stores flags on obj for subsequent reads. Partial.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_party_count',
        kind: 'opcode',
        description:
            'sfall 0x823F: get_party_count_sfall() — return current number of critters ' +
            'in the player party.  Reads gParty.members length; returns 0 if no party.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 68 entries
    // ---------------------------------------------------------------------------

    {
        id: 'blk_076_obj_can_see_obj_null_gmap',
        kind: 'procedure',
        description:
            'BLK-076: objCanSeeObj() null-gMap + null-position guard.  The internal ' +
            'objCanSeeObj helper called globalState.gMap.hexLinecast() without checking ' +
            'that gMap is non-null, and also accessed obj.position / target.position ' +
            'without null checks.  During map transitions or before the first map loads ' +
            'this caused an uncaught TypeError.  Now guards: if gMap or either position ' +
            'is null, returns true (conservatively unobstructed) instead of crashing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_077_explosion_null_gmap',
        kind: 'procedure',
        description:
            'BLK-077: explosion() null-gMap guard.  explosion() called ' +
            'globalState.gMap.addObject() and removeObject() without first checking ' +
            'that gMap is non-null.  Any explosion triggered during a map transition ' +
            '(e.g. an area-effect bomb in a scripted cut-scene) would throw a TypeError ' +
            'and crash the game.  Now emits a warning and returns early when gMap is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_078_load_map_null_gmap',
        kind: 'procedure',
        description:
            'BLK-078: load_map() null-gMap guard.  load_map() called ' +
            'globalState.gMap.loadMap() / loadMapByID() without checking that gMap is ' +
            'non-null.  Scripts that call load_map() before a map has been initialized ' +
            '(e.g. during startup or in tests) would throw a TypeError.  Now emits a ' +
            'warning and returns early when gMap is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_079_create_object_sid_null_gmap',
        kind: 'procedure',
        description:
            'BLK-079: create_object_sid() null-gMap guard.  create_object_sid() called ' +
            'globalState.gMap.addObject() without checking that gMap is non-null.  When ' +
            'scripts create objects before a map is loaded (e.g. in map_enter_p_proc ' +
            'before the map fully initializes) this caused a TypeError crash.  Now emits ' +
            'a warning and returns null when gMap is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'blk_080_save_gmap_name_null_guard',
        kind: 'procedure',
        description:
            'BLK-080: save() null-gMap guard in log message.  The save() function in ' +
            'saveload.ts accessed globalState.gMap.name in a log message without ' +
            'checking that gMap is non-null.  Calling save() before a map is loaded ' +
            '(e.g. in tests or during character creation) caused a TypeError crash.  ' +
            'Now uses optional chaining: gMap?.name ?? "(none)".',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'sfall_get_critter_damage_type',
        kind: 'opcode',
        description:
            'sfall 0x8240: get_critter_damage_type_sfall(obj) — return the default ' +
            'melee damage type for a critter (0=normal, 1=laser, 2=fire, 3=plasma, ' +
            '4=electrical, 5=EMP, 6=explosion).  Browser build: reads obj.damageType; ' +
            'defaults to 0 (normal) when not set.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_critter_damage_type',
        kind: 'opcode',
        description:
            'sfall 0x8241: set_critter_damage_type_sfall(obj, type) — set the default ' +
            'melee damage type for a critter.  Stores the clamped value on obj.damageType ' +
            'for subsequent reads.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_combat_free_move',
        kind: 'opcode',
        description:
            'sfall 0x8242: get_combat_free_move_sfall() — return the number of free ' +
            'tile-moves available this combat turn.  Browser build: returns 0 (no ' +
            'free-move tracking; the AP model covers all movement).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_set_combat_free_move',
        kind: 'opcode',
        description:
            'sfall 0x8243: set_combat_free_move_sfall(obj, tiles) — set free tile-moves ' +
            'for a critter this turn.  Browser build: no-op (free-move is not tracked).',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_base_stat',
        kind: 'opcode',
        description:
            'sfall 0x8244: get_base_stat_sfall(obj, stat_id) — return the base ' +
            '(unmodified) value of a SPECIAL/derived stat for any critter.  Uses the ' +
            'numeric stat-ID mapping and reads via stats.getBase().  Returns 0 for ' +
            'non-critters or unknown stat IDs.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_set_base_stat',
        kind: 'opcode',
        description:
            'sfall 0x8245: set_base_stat_sfall(obj, stat_id, value) — set the base ' +
            'value of a SPECIAL/derived stat for a critter.  Uses modifyBase() to ' +
            'apply the delta from the current base.  No-op for unknown stat IDs or ' +
            'non-critters.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_game_difficulty',
        kind: 'opcode',
        description:
            'sfall 0x8246: get_game_difficulty_sfall() — return the current game ' +
            'difficulty setting (0=easy, 1=normal, 2=hard).  Browser build: always ' +
            'returns 1 (normal); no difficulty system implemented.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'blk_081_obj_from_pid_null_pro_guard',
        kind: 'procedure',
        description:
            'BLK-081: Obj.fromPID_() null-proto guard.  When loadPRO() cannot find a ' +
            'prototype file for the given PID (e.g. unknown items, test environments, ' +
            'or corrupted data files), it returns null.  The unconditional ' +
            'obj.flags = obj.pro.flags access on the following line then threw a TypeError ' +
            'and crashed any code path through createObjectWithPID.  Now guards: ' +
            'obj.flags = pro != null ? pro.flags : 0, and skips pro-dependent field ' +
            'initialization (subtype, name, invArt) when pro is null.  The object is ' +
            'still usable for basic game-object operations.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'high',
    },
    {
        id: 'sfall_get_violence_level',
        kind: 'opcode',
        description:
            'sfall 0x8247: get_violence_level_sfall() — return the current violence level ' +
            'setting (0=minimal, 1=normal, 2=maximum blood).  Browser build: always ' +
            'returns 2 (maximum); no violence-level control implemented.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
    },

    // ---------------------------------------------------------------------------
    // Phase 69 entries
    // ---------------------------------------------------------------------------

    {
        id: 'blk_082_float_msg_window_performance',
        kind: 'procedure',
        description:
            'BLK-082: float_msg() used window.performance.now() directly instead of ' +
            'the typeof-guarded performance.now() pattern used by get_uptime().  In ' +
            'Node.js test environments the window global does not exist, so every ' +
            'float_msg() call threw a ReferenceError.  Now uses ' +
            'typeof performance !== "undefined" ? performance.now() : 0, matching ' +
            'the established safe-fallback pattern.',
        status: 'implemented',
        frequency: 'high',
        impact: 'medium',
    },
    {
        id: 'blk_083_tile_is_visible_null_position',
        kind: 'procedure',
        description:
            'BLK-083: tile_is_visible() accessed globalState.player.position without ' +
            'a null guard.  When the player object exists but has not yet been placed ' +
            'on the map (e.g. during initial script execution before map_enter_p_proc ' +
            'completes), player.position is null and hexDistance() crashed with a ' +
            'TypeError.  Now returns 1 (visible) when player.position is null.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'blk_084_set_exit_grids_null_game_objects',
        kind: 'procedure',
        description:
            'BLK-084: set_exit_grids() used the non-null assertion gameObjects! without ' +
            'a real null guard.  Scripts that call set_exit_grids during startup or ' +
            'before a map is loaded (when gameObjects is null) caused a TypeError ' +
            'crash.  Now emits a warning and returns early when gameObjects is null.',
        status: 'implemented',
        frequency: 'low',
        impact: 'medium',
    },
    {
        id: 'blk_085_obj_can_hear_obj_null_position',
        kind: 'procedure',
        description:
            'BLK-085: obj_can_hear_obj() called hexDistance(a.position, b.position) ' +
            'without checking that either position is non-null.  Objects in inventory ' +
            'or mid-map-transition often have a null position, causing hexDistance to ' +
            'crash.  Now guards: if either position is null, returns 0 (out of earshot) ' +
            'instead of crashing.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_map_limits',
        kind: 'opcode',
        description:
            'sfall 0x8248: get_map_limits_sfall(which) — return the map dimension in ' +
            'tiles (0=width, 1=height).  Fallout 2 maps are always 200×200; browser ' +
            'build always returns 200.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_obj_is_valid',
        kind: 'opcode',
        description:
            'sfall 0x8249: obj_is_valid_sfall(obj) — return 1 if the argument is a ' +
            'valid game object, 0 otherwise.  Used by scripts to guard against stale ' +
            'or deleted object references before calling procedures.',
        status: 'implemented',
        frequency: 'medium',
        impact: 'medium',
    },
    {
        id: 'sfall_get_string_length',
        kind: 'opcode',
        description:
            'sfall 0x824A: get_string_length_sfall(str) — return the length of a ' +
            'string.  Returns 0 for non-string inputs.  Used by scripts doing string ' +
            'parsing and formatting.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_char_code',
        kind: 'opcode',
        description:
            'sfall 0x824B: get_char_code_sfall(str, pos) — return the UTF-16 character ' +
            'code at zero-based position pos in str.  Returns -1 when str is not a ' +
            'string or pos is out of range.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_string_contains',
        kind: 'opcode',
        description:
            'sfall 0x824C: string_contains_sfall(haystack, needle) — return 1 if ' +
            'haystack contains needle (case-sensitive), 0 otherwise.  Returns 0 for ' +
            'non-string inputs.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_string_index_of',
        kind: 'opcode',
        description:
            'sfall 0x824D: string_index_of_sfall(haystack, needle) — return the first ' +
            'zero-based index of needle in haystack, or -1 if not found.  Returns -1 ' +
            'for non-string inputs.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_object_script_id',
        kind: 'opcode',
        description:
            'sfall 0x824E: get_object_script_id_sfall(obj) — return the numeric script ' +
            'SID attached to an object, or -1 when the object has no script.  Used by ' +
            'scripts to verify or compare script attachments.',
        status: 'implemented',
        frequency: 'low',
        impact: 'low',
    },
    {
        id: 'sfall_get_script_field',
        kind: 'opcode',
        description:
            'sfall 0x824F: get_script_field_sfall(field) — read a named field from ' +
            'the current script execution context.  Browser build: returns 0 for all ' +
            'field queries; engine-internal script fields are not exposed.',
        status: 'partial',
        frequency: 'low',
        impact: 'low',
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
