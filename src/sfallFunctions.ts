/**
 * sfall script functions (sfall Modules/Scripting/Handlers, fallout2-ce
 * sfall_opcodes.cc / sfall_metarules.cc), installed on the Script class for
 * every sfall name it does not already implement.
 *
 * Functions that poke the Windows executable's memory, Direct3D shaders,
 * DirectInput, the sfall virtual file system or the hero appearance mod do
 * nothing here and return 0 (or −1 where sfall reports failure that way):
 * there is no executable or graphics pipeline of that kind in a browser.
 * Settings that tweak engine formulas are recorded in `sfallSettings` for
 * the systems that read them.
 */

import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getMessage } from './util.js'
import {
    arrayOf,
    createArray,
    createTempArray,
    fixArray,
    freeArray,
    getArray,
    lenArray,
    loadArray,
    saveArray,
    stackArray,
    stringSplit,
} from './sfallArrays.js'
import { hexDistance, hexFromScreen, hexLine } from './geometry.js'
import { fromTileNum, toTileNum } from './tile.js'
import { HIT_LOCATION_PENALTY } from './combat/fo2Formulas.js'
import { CRITICAL_HIT_TABLES, HIT_LOCATION_ORDER, PLAYER_CRITICAL_HIT_TABLE } from './combat/criticalTables.js'
import { playerInSneakMode, playerIsSneaking } from './combat/aiPacket.js'
import { getRandomInt } from './util.js'
import { getProtoData, setProtoData } from './protoOffsets.js'
import { sfallSettings } from './sfallSettings.js'

export { sfallSettings }

/** sfall version reported to scripts (fallout2-ce's). */
const VERSION = [4, 3, 4]

const STAT_NAMES: Record<number, string> = {
    0: 'STR', 1: 'PER', 2: 'END', 3: 'CHA', 4: 'INT', 5: 'AGI', 6: 'LUK',
    7: 'Max HP', 8: 'AP', 9: 'AC', 11: 'Melee', 12: 'Carry', 13: 'Sequence', 14: 'Healing Rate',
    15: 'Critical Chance', 16: 'Better Criticals',
    17: 'DT Normal', 18: 'DT Laser', 19: 'DT Fire', 20: 'DT Plasma', 21: 'DT Electrical', 22: 'DT EMP', 23: 'DT Explosive',
    24: 'DR Normal', 25: 'DR Laser', 26: 'DR Fire', 27: 'DR Plasma', 28: 'DR Electrical', 29: 'DR EMP', 30: 'DR Explosive',
    31: 'DR Radiation', 32: 'DR Poison', 33: 'Age', 35: 'HP',
}

const SKILL_NAMES = [
    'Small Guns', 'Big Guns', 'Energy Weapons', 'Unarmed', 'Melee Weapons', 'Throwing',
    'First Aid', 'Doctor', 'Sneak', 'Lockpick', 'Steal', 'Traps', 'Science', 'Repair',
    'Speech', 'Barter', 'Gambling', 'Outdoorsman',
]

/** sfall list types (LIST_CRITTERS … LIST_ALL). */
const LIST_TYPES: Record<number, (o: any) => boolean> = {
    0: (o) => o?.type === 'critter',
    1: (o) => o?.type === 'item',
    2: (o) => o?.type === 'scenery',
    3: (o) => o?.type === 'wall',
    4: () => false, // tiles are not objects here
    5: (o) => o?.type === 'misc',
    6: (o) => o?.type === 'spatial',
    9: () => true,
}

function isObject(o: unknown): o is any {
    return !!o && typeof o === 'object'
}

function mapObjects(): any[] {
    try {
        return (globalState.gMap?.getObjects?.() ?? []) as any[]
    } catch {
        return []
    }
}

/** sfall's round: away from zero at .5. */
function sfallRound(x: number): number {
    const i = Math.trunc(x)
    const mod = x - i
    return Math.abs(mod) >= 0.5 ? i + (mod > 0 ? 1 : -1) : i
}

function extraStats(critter: any): Record<string, number> {
    if (!critter._extraStats) {critter._extraStats = {}}
    return critter._extraStats
}

/** set_*_stat_max/min: stats 0–34 only. */
function setStatLimit(table: 'pcStatMax' | 'pcStatMin' | 'npcStatMax' | 'npcStatMin', stat: number, value: number): void {
    if (stat >= 0 && stat < 35) {sfallSettings[table][stat] = Math.trunc(value)}
}

type FakeTable = typeof sfallSettings.fakePerks

function fakeKey(owner: number, name: unknown): string {
    return owner + ':' + String(name ?? '')
}

/** Perks::SetFakePerk / SetFakeTrait: level 0 removes; the level is capped. */
function setFake(table: FakeTable, cap: number, owner: number, name: string, level: number, image: number, desc: string): void {
    if (!(level >= 0)) {return}
    const key = fakeKey(owner, name)
    if (level === 0) {
        table.delete(key)
        return
    }
    table.set(key, { level: Math.min(cap, Math.trunc(level)), image, desc: String(desc ?? ''), owner })
}

let nextObjectId = 0x10000000
const objectIds = new WeakMap<object, number>()

/** An object's id (the player's is 18000, PLAYER_ID); others get one when first asked. */
export function objectId(obj: any): number {
    if (!isObject(obj)) {return 0}
    if (obj === globalState.player) {return 18000}
    if (typeof obj.id === 'number') {return obj.id}
    let id = objectIds.get(obj)
    if (id === undefined) {
        id = nextObjectId++
        objectIds.set(obj, id)
    }
    return id
}

function isCritter(o: unknown): o is any {
    return isObject(o) && (o as any).type === 'critter'
}

/** A script integer clamped as sfall's cmovs/cmova pairs do. */
function clampInt(v: number, min: number, max: number): number {
    const n = Math.trunc(Number(v) || 0)
    return n < min ? min : n > max ? max : n
}

function noop(): number {
    return 0
}

function critTable(critterType: number): any[] | null {
    if (critterType === 38) {return PLAYER_CRITICAL_HIT_TABLE as any[]}
    return (CRITICAL_HIT_TABLES as any[])[critterType] ?? null
}

const CRIT_DEFAULTS = JSON.parse(JSON.stringify([CRITICAL_HIT_TABLES, PLAYER_CRITICAL_HIT_TABLE])) as [any[], any[]]

/** The sfall functions, by sfall name. `this` is the calling Script. */
export const sfallMethods: Record<string, (this: any, ...args: any[]) => any> = {
    // ── memory, shaders, input and files: not available in a browser ──
    read_byte: noop, read_short: noop, read_int: noop, read_string: () => '',
    write_byte: noop, write_short: noop, write_int: noop, write_string: noop,
    call_offset_v0: noop, call_offset_v1: noop, call_offset_v2: noop, call_offset_v3: noop, call_offset_v4: noop,
    call_offset_r0: noop, call_offset_r1: noop, call_offset_r2: noop, call_offset_r3: noop, call_offset_r4: noop,
    graphics_funcs_available: noop, load_shader: () => -1, free_shader: noop, activate_shader: noop, deactivate_shader: noop,
    set_shader_int: noop, set_shader_float: noop, set_shader_vector: noop, get_shader_version: noop, set_shader_mode: noop,
    get_shader_texture: noop, set_shader_texture: noop, force_graphics_refresh: noop, set_palette: noop,
    eax_available: noop, set_eax_environment: noop,
    input_funcs_available: () => 1, tap_key: noop, key_pressed: noop,
    fs_create: () => -1, fs_copy: () => -1, fs_find: () => -1, fs_write_byte: noop, fs_write_short: noop, fs_write_int: noop,
    fs_write_string: noop, fs_write_bstring: noop, fs_delete: noop, fs_size: noop, fs_pos: () => -1, fs_seek: noop, fs_resize: noop,
    fs_read_byte: noop, fs_read_short: noop, fs_read_int: noop, fs_read_float: noop,
    set_dm_model: noop, set_df_model: noop, set_movie_path: noop, hero_select_win: noop, set_hero_race: noop, set_hero_style: noop,
    nb_create_char: noop, refresh_pc_art: noop, modified_ini: noop, get_window_under_mouse: noop, get_mouse_buttons: noop,
    stop_game: noop, resume_game: noop, reg_anim_callback: noop, play_sfall_sound: noop, stop_sfall_sound: noop,
    create_spatial: noop, tile_light: () => -1,

    // ── version and state ──
    sfall_ver_major: () => VERSION[0],
    sfall_ver_minor: () => VERSION[1],
    sfall_ver_build: () => VERSION[2],
    /** game_loaded: 1 the first time a script asks after a load or a new game. */
    game_loaded(this: any) {
        if (this._gameLoadedSeen) {return 0}
        this._gameLoadedSeen = true
        return 1
    },
    available_global_script_types: () => 0,
    init_hook: noop,
    register_hook(this: any, id: number) { sfallSettings.hooks.set(id, this) },
    register_hook_proc(this: any, id: number, proc: unknown) { sfallSettings.hooks.set(id, proc) },
    register_hook_proc_spec(this: any, id: number, proc: unknown) { sfallSettings.hooks.set(id, proc) },
    get_sfall_args(this: any) {
        const args: unknown[] = Array.isArray(this._sfallArgs) ? this._sfallArgs : []
        return arrayOf(args)
    },

    // ── stats and skills ──
    set_pc_extra_stat(stat: number, value: number) {
        const name = STAT_NAMES[stat]
        if (name && globalState.player) {extraStats(globalState.player)[name] = Math.trunc(value)}
    },
    get_pc_extra_stat(stat: number) {
        const name = STAT_NAMES[stat]
        return name ? ((globalState.player as any)?._extraStats?.[name] ?? 0) : 0
    },
    set_critter_extra_stat(this: any, obj: any, stat: number, value: number) {
        return this.set_critter_extra_stat_sfall?.(obj, stat, value)
    },
    get_critter_extra_stat(this: any, obj: any, stat: number) {
        return this.get_critter_extra_stat_sfall?.(obj, stat) ?? 0
    },
    /** set_stat_max / set_stat_min change the limits for the player and everyone else. */
    set_stat_max(stat: number, v: number) { setStatLimit('pcStatMax', stat, v); setStatLimit('npcStatMax', stat, v) },
    set_stat_min(stat: number, v: number) { setStatLimit('pcStatMin', stat, v); setStatLimit('npcStatMin', stat, v) },
    set_pc_stat_max(stat: number, v: number) { setStatLimit('pcStatMax', stat, v) },
    set_pc_stat_min(stat: number, v: number) { setStatLimit('pcStatMin', stat, v) },
    set_npc_stat_max(stat: number, v: number) { setStatLimit('npcStatMax', stat, v) },
    set_npc_stat_min(stat: number, v: number) { setStatLimit('npcStatMin', stat, v) },
    set_available_skill_points(v: number) {
        const skills = (globalState.player as any)?.skills
        if (skills) {skills.skillPoints = Math.max(0, Math.trunc(v))}
    },
    get_available_skill_points: () => (globalState.player as any)?.skills?.skillPoints ?? 0,
    mod_skill_points_per_level: noop,
    set_skill_max(v: number) { sfallSettings.skillMax.base = clampInt(v, 0, 300) },
    set_base_skill_mod(v: number) { sfallSettings.skillMax.base = clampInt(v, 0, 300) },
    set_critter_skill_mod(obj: any, max: number) { if (isCritter(obj)) {sfallSettings.skillMax.byCritter.set(obj, Math.trunc(max))} },
    set_hit_chance_max(v: number) { sfallSettings.hitChance.base = { max: clampInt(v, 0, 999), mod: 0 } },
    set_base_hit_chance_mod(max: number, mod: number) { sfallSettings.hitChance.base = { max: Math.trunc(max), mod: Math.trunc(mod) } },
    set_critter_hit_chance_mod(obj: any, max: number, mod: number) {
        if (isCritter(obj)) {sfallSettings.hitChance.byCritter.set(obj, { max: Math.trunc(max), mod: Math.trunc(mod) })}
    },
    set_pickpocket_max(v: number) { sfallSettings.pickpocket.base = { max: clampInt(v, 0, 999), mod: 0 } },
    set_base_pickpocket_mod(max: number, mod: number) { sfallSettings.pickpocket.base = { max: Math.trunc(max), mod: Math.trunc(mod) } },
    set_critter_pickpocket_mod(obj: any, max: number, mod: number) {
        if (isCritter(obj)) {sfallSettings.pickpocket.byCritter.set(obj, { max: Math.trunc(max), mod: Math.trunc(mod) })}
    },
    set_xp_mod(v: number) { sfallSettings.xpMod = Math.trunc(v) & 0xffff },
    set_perk_level_mod(v: number) { if (v >= -25 && v <= 25) {sfallSettings.perkLevelMod = Math.trunc(v)} },
    set_perk_freq(v: number) { sfallSettings.perkFreq = Math.trunc(v) },
    set_swiftlearner_mod(v: number) { sfallSettings.swiftLearnerMod = Math.trunc(v) },
    set_hp_per_level_mod(v: number) { sfallSettings.hpPerLevelMod = (Math.trunc(v) << 24) >> 24 },
    set_pyromaniac_mod(v: number) { sfallSettings.pyromaniacMod = (Math.trunc(v) << 24) >> 24 },
    apply_heaveho_fix: noop,
    remove_trait(trait: number) { (globalState.player as any)?.charTraits?.delete?.(trait) },
    inc_npc_level: noop,

    // ── perks ──
    get_perk_owed: () => globalState.playerPerksOwed ?? 0,
    set_perk_owed(v: number) { globalState.playerPerksOwed = Math.max(0, Math.min(250, Math.trunc(v))) },
    get_perk_available(perk: number) {
        const ranks = (globalState.player as any)?.perkRanks ?? {}
        return typeof perk === 'number' && (ranks[perk] ?? 0) === 0 ? 1 : 0
    },
    set_perk_image: noop, set_perk_ranks: noop, set_perk_level: noop, set_perk_stat: noop, set_perk_stat_mag: noop,
    set_perk_skill1: noop, set_perk_skill1_mag: noop, set_perk_type: noop, set_perk_skill2: noop, set_perk_skill2_mag: noop,
    set_perk_str: noop, set_perk_per: noop, set_perk_end: noop, set_perk_chr: noop, set_perk_int: noop, set_perk_agl: noop,
    set_perk_lck: noop, set_perk_name: noop, set_perk_desc: noop,
    set_fake_perk(name: string, level: number, image: number, desc: string) { setFake(sfallSettings.fakePerks, 100, 0, name, level, image, desc) },
    set_fake_trait(name: string, active: number, image: number, desc: string) { setFake(sfallSettings.fakeTraits, 1, 0, name, active, image, desc) },
    /** has_fake_perk(name), or by the number the perk box gives fake perks (119 and up). */
    has_fake_perk(name: unknown) {
        if (typeof name === 'number') {return name >= 119 ? [...sfallSettings.fakePerks.values()][name - 119]?.level ?? 0 : 0}
        return sfallSettings.fakePerks.get(fakeKey(0, name))?.level ?? 0
    },
    has_fake_trait(name: unknown) {
        return sfallSettings.fakeTraits.has(fakeKey(0, name)) ? 1 : 0
    },
    set_selectable_perk: noop, set_perkbox_title: noop, hide_real_perks: noop, show_real_perks: noop,
    perk_add_mode: noop, clear_selectable_perks: noop,

    // ── interface ──
    set_pipboy_available(v: number) { sfallSettings.pipboyAvailable = v },
    show_iface_tag(tag: number) { sfallSettings.ifaceTags.add(tag) },
    hide_iface_tag(tag: number) { sfallSettings.ifaceTags.delete(tag) },
    is_iface_tag_active(tag: number) {
        // 0 sneak, 3 level up, 4 addict are the engine's own indicators.
        const player: any = globalState.player
        if (tag === 0) {return playerInSneakMode(player) ? 1 : 0}
        return sfallSettings.ifaceTags.has(tag) ? 1 : 0
    },
    get_viewport_x: () => globalState.cameraPosition?.x ?? 0,
    get_viewport_y: () => globalState.cameraPosition?.y ?? 0,
    set_viewport_x(v: number) { if (globalState.cameraPosition) {globalState.cameraPosition.x = v} },
    set_viewport_y(v: number) { if (globalState.cameraPosition) {globalState.cameraPosition.y = v} },
    get_mouse_x: () => (globalState as any).mouseX ?? 0,
    get_mouse_y: () => (globalState as any).mouseY ?? 0,
    get_screen_width: () => (globalState as any).screenWidth ?? 640,
    get_screen_height: () => (globalState as any).screenHeight ?? 480,
    tile_under_cursor() {
        const x = ((globalState as any).mouseX ?? 0) + (globalState.cameraPosition?.x ?? 0)
        const y = ((globalState as any).mouseY ?? 0) + (globalState.cameraPosition?.y ?? 0)
        return toTileNum(hexFromScreen(x, y))
    },
    /** create_message_window: a one-button message box (first line is the title). */
    create_message_window(text: string) {
        if (typeof text === 'string' && text !== '') {EventBus.emit('ui:messageBox', { text })}
    },
    mark_movie_played: noop,
    block_combat(v: number) { sfallSettings.combatBlocked = v !== 0 },
    set_inven_ap_cost(v: number) { sfallSettings.inventoryApCost = v },
    set_unspent_ap_bonus(v: number) { sfallSettings.unspentApBonus = v },
    get_unspent_ap_bonus: () => sfallSettings.unspentApBonus,
    set_unspent_ap_perk_bonus(v: number) { sfallSettings.unspentApPerkBonus = v },
    get_unspent_ap_perk_bonus: () => sfallSettings.unspentApPerkBonus,
    gdialog_get_barter_mod(this: any) { return this._barterMod ?? 0 },
    set_map_time_multi(v: number) { sfallSettings.mapTimeMulti = Number(v) },

    // ── world map ──
    get_world_map_x_pos: () => globalState.worldPosition?.x ?? 0,
    get_world_map_y_pos: () => globalState.worldPosition?.y ?? 0,
    force_encounter(map: number) { sfallSettings.forcedEncounter = { map, flags: 0 } },
    force_encounter_with_flags(map: number, flags: number) { sfallSettings.forcedEncounter = { map, flags } },
    set_car_current_town(town: number) { sfallSettings.carTown = town },

    // ── combat ──
    get_kill_counter(this: any, type: number) { return this.get_critter_kills?.(type) ?? 0 },
    mod_kill_counter(this: any, type: number, amount: number) {
        const current = this.get_critter_kills?.(type) ?? 0
        this.set_critter_kills?.(type, current + amount)
    },
    get_last_attacker(obj: any) { return isObject(obj) ? (obj.lastCombatAttacker ?? obj.whoHitMe ?? 0) : 0 },
    get_last_target(obj: any) { return isObject(obj) ? (obj.aiLastTarget ?? obj.lastCombatTarget ?? 0) : 0 },
    get_attack_type(this: any) { return this.get_attack_type_sfall?.() ?? -1 },
    toggle_active_hand() {
        const p: any = globalState.player
        if (p) {p.activeHand = p.activeHand === 1 ? 0 : 1}
    },
    set_weapon_knockback(obj: any, type: number, value: number) { if (isObject(obj)) {obj.sfallWeaponKnockback = { type, value }} },
    set_target_knockback(obj: any, type: number, value: number) { if (isObject(obj)) {obj.sfallTargetKnockback = { type, value }} },
    set_attacker_knockback(obj: any, type: number, value: number) { if (isObject(obj)) {obj.sfallAttackerKnockback = { type, value }} },
    remove_weapon_knockback(obj: any) { if (isObject(obj)) {delete obj.sfallWeaponKnockback} },
    remove_target_knockback(obj: any) { if (isObject(obj)) {delete obj.sfallTargetKnockback} },
    remove_attacker_knockback(obj: any) { if (isObject(obj)) {delete obj.sfallAttackerKnockback} },
    set_critter_burst_disable(obj: any, v: number) { if (isObject(obj)) {obj.burstDisabled = v !== 0} },
    force_aimed_shots(pid: number) { sfallSettings.aimedShots.set(pid, true) },
    disable_aimed_shots(pid: number) { sfallSettings.aimedShots.set(pid, false) },
    /** get_bodypart_hit_modifier / set_bodypart_hit_modifier: the called-shot penalties. */
    get_bodypart_hit_modifier(part: number) {
        const region = HIT_LOCATION_ORDER[part]
        return region ? ((HIT_LOCATION_PENALTY as Record<string, number>)[region] ?? 0) : 0
    },
    set_bodypart_hit_modifier(part: number, value: number) {
        const region = HIT_LOCATION_ORDER[part]
        if (region) {(HIT_LOCATION_PENALTY as Record<string, number>)[region] = Math.trunc(value)}
    },
    /** set_critical_table(critterType, bodypart, level, field, value); type 38 is the player. */
    set_critical_table(type: number, part: number, level: number, field: number, value: number) {
        const row = critTable(type)?.[part]?.[level]
        if (row && field >= 0 && field < 7) {row[field] = Math.trunc(value)}
    },
    get_critical_table(type: number, part: number, level: number, field: number) {
        return critTable(type)?.[part]?.[level]?.[field] ?? 0
    },
    reset_critical_table(type: number, part: number, level: number, field: number) {
        const row = critTable(type)?.[part]?.[level]
        const def = type === 38 ? CRIT_DEFAULTS[1]?.[part]?.[level] : CRIT_DEFAULTS[0]?.[type]?.[part]?.[level]
        if (row && def && field >= 0 && field < 7) {row[field] = def[field]}
    },
    sneak_success: () => (playerIsSneaking((min, max) => getRandomInt(min, max)) ? 1 : 0),

    // ── scripts ──
    remove_script(obj: any) { if (isObject(obj)) {obj._script = undefined} },
    set_script: noop,
    get_script(obj: any) { return isObject(obj) && typeof obj.scriptIndex === 'number' ? obj.scriptIndex + 1 : (isObject(obj) && obj._script ? 1 : 0) },
    /** set_self: the next functions act on this object as self_obj. */
    set_self(this: any, obj: any) { if (isObject(obj)) {this.self_obj = obj} },

    // ── maths and strings ──
    sqrt: (x: number) => Math.sqrt(Number(x)),
    abs: (x: number) => Math.abs(Number(x)),
    sin: (x: number) => Math.sin(Number(x)),
    cos: (x: number) => Math.cos(Number(x)),
    tan: (x: number) => Math.tan(Number(x)),
    arctan: (x: number, y: number) => Math.atan2(Number(x), Number(y)),
    power(base: number, exp: number) {
        const r = Math.pow(Number(base), Number(exp))
        return Number.isInteger(base) && Number.isInteger(exp) ? Math.trunc(r) : r
    },
    log: (x: number) => Math.log(Number(x)),
    exponent: (x: number) => Math.exp(Number(x)),
    ceil: (x: number) => Math.ceil(Number(x)),
    round: (x: number) => sfallRound(Number(x)),
    div(a: number, b: number) {
        if (!b) {return 0}
        if (!Number.isInteger(a) || !Number.isInteger(b)) {return a / b}
        return Math.trunc((a >>> 0) / (b >>> 0))
    },
    /** atoi: strtol with base 0 (0x… hex, 0… octal). */
    atoi(s: string) {
        const t = String(s ?? '').trim()
        const m = /^([+-]?)(0x[0-9a-f]+|0[0-7]*|[1-9][0-9]*)/i.exec(t)
        if (!m) {return 0}
        const sign = m[1] === '-' ? -1 : 1
        const body = m[2]
        const v = /^0x/i.test(body) ? parseInt(body, 16) : body.length > 1 && body[0] === '0' ? parseInt(body, 8) : parseInt(body, 10)
        return sign * (v | 0)
    },
    atof: (s: string) => parseFloat(String(s ?? '')) || 0,
    strlen: (s: string) => String(s ?? '').length,
    charcode: (s: string) => (String(s ?? '').length > 0 ? String(s).charCodeAt(0) : 0),
    typeof: (v: unknown) => (typeof v === 'string' ? 3 : typeof v === 'number' && !Number.isInteger(v) ? 2 : 1),
    message_str_game(fileId: number, msgId: number) {
        const files = ['combat', 'ai', 'scrname', 'misc', 'custom', 'inventory', 'item', 'lsgame', 'map', 'options', 'perk', 'pipboy', 'quests', 'proto', 'script', 'skill', 'skilldex', 'stat', 'trait', 'worldmap']
        const name = files[fileId]
        if (!name) {return ''}
        try {
            return getMessage(name, msgId) ?? ''
        } catch {
            return ''
        }
    },

    // ── arrays ──
    create_array: (len: number, flags: number) => createArray(Math.trunc(len), Math.trunc(flags)),
    temp_array: (len: number, flags: number) => createTempArray(Math.trunc(len), Math.trunc(flags)),
    fix_array: (id: number) => fixArray(id),
    free_array: (id: number) => freeArray(id),
    len_array: (id: number) => lenArray(id),
    resize_array(id: number, len: number) { getArray(id)?.resize(Math.trunc(len)) },
    set_array(id: number, key: unknown, value: unknown) { getArray(id)?.set(key, value, true) },
    /** get_array also reads one character of a string. */
    get_array(id: unknown, key: unknown) {
        if (typeof id === 'string') {
            const i = Number(key)
            return Number.isInteger(i) && i >= 0 && i < id.length ? id[i] : ''
        }
        return getArray(Number(id))?.get(key) ?? 0
    },
    scan_array: (id: number, value: unknown) => getArray(id)?.scan(value) ?? -1,
    array_key: (id: number, index: number) => getArray(id)?.keyAt(Math.trunc(index)) ?? 0,
    arrayexpr: (key: unknown, value: unknown) => stackArray(key, value),
    string_split: (s: string, sep: string) => stringSplit(String(s ?? ''), String(sep ?? '')),
    save_array: (key: unknown, id: number) => saveArray(key, id),
    load_array: (key: unknown) => loadArray(key),
    /** list_as_array: a temporary list of the objects of a list type. */
    list_as_array(type: number) {
        const test = LIST_TYPES[type] ?? (() => false)
        return arrayOf(mapObjects().filter(test))
    },
    party_member_list(includeHidden: number) {
        let members: any[] = []
        try {
            members = (globalState.gParty?.getPartyMembersAndPlayer?.() ?? []) as any[]
        } catch {
            members = []
        }
        if (!includeHidden) {members = members.filter((m) => m?.visible !== false && !m?.dead)}
        return arrayOf(members, 4)
    },
    tile_get_objs(tile: number, elevation: number) {
        const pos = fromTileNum(tile)
        const level = globalState.gMap?.objects?.[elevation] ?? []
        return arrayOf(level.filter((o: any) => o?.position && o.position.x === pos.x && o.position.y === pos.y))
    },

    // ── objects and tiles ──
    obj_is_carrying_obj(holder: any, item: any) {
        if (!isObject(holder) || !isObject(item)) {return 0}
        const inv: any[] = holder.inventory ?? []
        const found = inv.find((o) => o === item)
        return found ? (typeof found.amount === 'number' ? found.amount : 1) : 0
    },
    /** obj_blocking_tile(tile, elevation, type): what stands on a hex (shoot-through objects don't block shots). */
    obj_blocking_tile(tile: number, elevation: number, type: number) {
        const pos = fromTileNum(tile)
        const level = globalState.gMap?.objects?.[elevation] ?? []
        const blocker = level.find((o: any) => {
            if (!o?.position || o.position.x !== pos.x || o.position.y !== pos.y) {return false}
            if (o.type === 'critter') {return !o.dead}
            return typeof o.blocks === 'function' && o.blocks()
        })
        if (blocker && type === 1 && ((blocker.flags ?? 0) & 0x80000000) !== 0) {return 0}
        return blocker ?? 0
    },
    /** obj_blocking_line(obj, tile, type): the first thing on the line from obj to tile. */
    obj_blocking_line(obj: any, tile: number, type: number) {
        if (!isObject(obj) || !obj.position) {return 0}
        const dest = fromTileNum(tile)
        const elevation = obj.elevation ?? globalState.currentElevation ?? 0
        for (const hex of hexLine(obj.position, dest).slice(1)) {
            const hit = sfallMethods.obj_blocking_tile(toTileNum(hex), elevation, type)
            if (hit) {return hit}
        }
        return 0
    },
    /** path_find_to(obj, tile, type): the directions of a path, or −1-free empty list. */
    path_find_to(obj: any, tile: number) {
        if (!isObject(obj) || !obj.position || !globalState.gMap) {return arrayOf([])}
        const path: number[][] = (globalState.gMap as any).recalcPath?.(obj.position, fromTileNum(tile), false) ?? []
        const dirs: number[] = []
        for (let i = 1; i < path.length; i++) {
            const a = { x: path[i - 1][0], y: path[i - 1][1] }
            const b = { x: path[i][0], y: path[i][1] }
            if (hexDistance(a, b) === 1) {
                const d = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
                dirs.push(Math.max(0, d.findIndex(([dx, dy]) => dx === b.x - a.x && dy === b.y - a.y)))
            }
        }
        return arrayOf(dirs)
    },
    /** get_proto_data / set_proto_data: a proto field by its byte offset (sfall PROTO_*). */
    get_proto_data: (pid: number, offset: number) => getProtoData(Number(pid), Number(offset)),
    set_proto_data(pid: number, offset: number, value: number) { setProtoData(Number(pid), Number(offset), Number(value)) },
    art_exists(fid: number) {
        return typeof fid === 'number' && fid > 0 ? 1 : 0
    },

    /** metarule2_explosions: only the queries this port can answer. */
    metarule2_explosions(rule: number, p1: number) {
        if (rule === 6) {
            const dynamite = p1 === 51 || p1 === 206
            return arrayOf(dynamite ? [30, 50] : [40, 80])
        }
        return 0
    },

    // ── reg_anim extras ──
    reg_anim_destroy(this: any, obj: any) { this.destroy_object?.(obj) },
    reg_anim_animate_and_hide(this: any, obj: any, anim: number, delay: number) { this.reg_anim_animate?.(obj, anim, delay) },
    reg_anim_combat_check: noop,
    reg_anim_light(this: any, obj: any, radius: number, intensity: number) { this.obj_set_light_level?.(obj, intensity, radius) },
    reg_anim_change_fid(this: any, obj: any, fid: number) { this.art_change_fid_num?.(obj, fid) },
    reg_anim_take_out: noop,
    reg_anim_turn_towards(this: any, obj: any, tile: number) {
        if (isObject(obj) && obj.position) {this.anim?.(obj, 1000, this.tile_dir?.(toTileNum(obj.position), tile) ?? 0)}
    },
}

/** Add the sfall functions the Script class does not define itself. */
export function installSfallFunctions(proto: Record<string, unknown>): void {
    for (const [name, fn] of Object.entries(sfallMethods)) {
        if (typeof proto[name] !== 'function') {proto[name] = fn}
    }
}

/**
 * sfall_funcN metarules (sfall_metarules.cc), by name. Each receives the
 * arguments after the name.
 */
export const sfallMetarules: Record<string, (this: any, ...args: any[]) => any> = {
    car_gas_amount: () => globalState.carFuel ?? 0,
    combat_data: () => 0,
    critter_inven_obj2(obj: any, slot: number) {
        if (!isObject(obj)) {return 0}
        if (slot === 0) {return obj.equippedArmor ?? 0}
        if (slot === 1) {return obj.rightHand ?? 0}
        if (slot === 2) {return obj.leftHand ?? 0}
        return 0
    },
    dialog_obj: () => (globalState as any).dialogueTarget ?? 0,
    get_cursor_mode: () => ({ move: 0, arrow: 1, crosshair: 2 } as Record<string, number>)[globalState.mouseMode ?? 'move'] ?? 0,
    set_cursor_mode(mode: number) {
        globalState.mouseMode = mode === 2 ? 'crosshair' : mode === 1 ? 'arrow' : 'move'
    },
    get_flags: (obj: any) => (isObject(obj) ? obj.flags ?? 0 : 0),
    set_flags(obj: any, flags: number) { if (isObject(obj)) {obj.flags = flags} },
    get_object_data: () => 0,
    get_text_width: (text: string) => String(text ?? '').length * 7,
    intface_redraw: noop,
    loot_obj: () => (globalState as any).lootTarget ?? 0,
    metarule_exist: (name: string) => (sfallMetarules[String(name)] ? 1 : 0),
    outlined_object: () => 0,
    set_ini_setting: noop,
    set_outline(obj: any, color: number) { if (isObject(obj)) {obj.outline = color} },
    show_window: noop,
    tile_refresh_display: noop,
}
