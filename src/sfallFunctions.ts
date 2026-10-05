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
import { getObjectData, setObjectData } from './objectData.js'
import { sfallSprintf } from './sfallPrintf.js'
import { inventoryApCost, statMax, statMin } from './sfallSettings.js'
import { inventorySize, itemWeight } from './critterInventory.js'
import { aiPacketFor } from './combat/aiPacket.js'
import { unequipSlot } from './equipment.js'
import { loadMessage } from './data.js'
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
    /** message_str_game(file, number): the game's files (0–20), the protos' (0x1000–0x1005) or added ones. */
    message_str_game(fileId: number, msgId: number) {
        const files = ['combat', 'ai', 'scrname', 'misc', 'custom', 'inventory', 'item', 'lsgame', 'map', 'options', 'perk',
            'pipboy', 'quests', 'proto', 'script', 'skill', 'skilldex', 'stat', 'trait', 'worldmap', 'editor']
        const protoFiles = ['pro_item', 'pro_crit', 'pro_scen', 'pro_wall', 'pro_tile', 'pro_misc']
        const name = fileId >= 0 && fileId <= 20 ? files[fileId]
            : fileId >= 0x1000 && fileId <= 0x1005 ? protoFiles[fileId - 0x1000]
            : extraMsgFiles.get(fileId)
        if (!name) {return 'Error'}
        try {
            return getMessage(name, msgId) ?? 'Error'
        } catch {
            return 'Error'
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

/** OpenF2 object type → the engine's object type number (obj->Type()). */
const OBJ_TYPE: Record<string, number> = { item: 0, critter: 1, scenery: 2, wall: 3, tile: 4, misc: 5 }

/** Message files added by add_extra_msg_file, by the number it handed out. */
const extraMsgFiles = new Map<number, string>()
let nextExtraMsgFile = 0x3000

/** sfall's iface tags past the engine's five boxes, from add_iface_tag. */
let lastIfaceTag = 4

function tileOf(obj: any): number {
    return obj?.position ? toTileNum(obj.position) : -1
}

function messageBox(text: string, flags: number): number {
    const yesNo = (flags & 0x10) !== 0
    const g: any = globalThis as any
    if (yesNo && typeof g.confirm === 'function') {return g.confirm(text) ? 1 : 0}
    if (typeof g.alert === 'function') {g.alert(text)}
    else {EventBus.emit('ui:messageBox', { text })}
    return 1
}

/** FalloutStringCompare: ASCII letters match regardless of case. */
function falloutStringEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {return false}
    for (let i = 0; i < a.length; i++) {
        let c1 = a.charCodeAt(i)
        let c2 = b.charCodeAt(i)
        if (c1 === c2) {continue}
        if (c1 >= 65 && c1 <= 90) {c1 |= 32}
        if (c2 >= 65 && c2 <= 90) {c2 |= 32}
        if (c1 !== c2) {return false}
    }
    return true
}

function partyMembers(): any[] {
    try {
        return (globalState.gParty?.getPartyMembersAndPlayer?.() ?? []) as any[]
    } catch {
        return []
    }
}

function isPartyMember(obj: any): boolean {
    return obj === globalState.player || partyMembers().includes(obj)
}

/** The fake-perk owner sfall uses: 0 for the player, else the critter's id. */
function fakeOwner(obj: any): number {
    return obj === globalState.player ? 0 : objectId(obj)
}

/**
 * The sfall_funcN metarules (sfall Metarule.cpp metaruleTable), by name;
 * each receives the arguments after the name. Window, image and INI
 * functions have nothing to act on in a browser and report failure.
 */
export const sfallMetarules: Record<string, (this: any, ...args: any[]) => any> = {
    add_extra_msg_file(name: string) {
        const file = String(name ?? '').toLowerCase().replace(/\\/g, '/').replace(/\.msg$/, '')
        for (const [id, f] of extraMsgFiles) {if (f === file) {return id}}
        if (nextExtraMsgFile > 0x3fff) {return -3}
        try {
            loadMessage(file)
        } catch {
            return -2
        }
        if (!globalState.messageFiles[file] || Object.keys(globalState.messageFiles[file]).length === 0) {return -2}
        const id = nextExtraMsgFile++
        extraMsgFiles.set(id, file)
        return id
    },
    add_iface_tag() {
        if (lastIfaceTag >= 126) {return -1}
        return ++lastIfaceTag
    },
    add_g_timer_event: noop,
    /** add_trait: the player's free trait slot (two at most). */
    add_trait(trait: number) {
        const player: any = globalState.player
        if (!player) {return -1}
        if (!(trait >= 0 && trait <= 15)) {return 0}
        const traits: Set<number> = player.charTraits ?? (player.charTraits = new Set())
        if (!traits.has(trait) && traits.size < 2) {traits.add(trait)}
        return 0
    },
    art_cache_clear: noop,
    art_frame_data: () => 0,
    /** attack_is_aimed: whether the attack mode on the interface is a called shot. */
    attack_is_aimed() {
        const player: any = globalState.player
        return player?.calledShot || (globalState as any).aimedAttack ? 1 : 0
    },
    car_gas_amount: () => globalState.carFuel ?? 0,
    /** combat_data: the attack being computed; OpenF2 has no such record to hand out. */
    combat_data: () => 0,
    create_win: () => -1,
    critter_inven_obj2(obj: any, slot: number) {
        if (!isObject(obj)) {return 0}
        switch (slot) {
            case 0: return obj.equippedArmor ?? 0
            case 1: return obj.rightHand ?? 0
            case 2: return obj.leftHand ?? 0
            case -2: return Array.isArray(obj.inventory) ? obj.inventory.length : 0
        }
        return 0
    },
    /** dialog_message: a line in the dialogue window while it is open. */
    dialog_message(text: string) {
        if (globalState.dialogueObject) {EventBus.emit('ui:message', { text: String(text ?? '') })}
    },
    dialog_obj: () => globalState.dialogueObject ?? 0,
    display_stats() { EventBus.emit('ui:refreshStats' as any, {} as any) },
    draw_image: () => -1,
    draw_image_scaled: () => -1,
    encounter_detection(on: number) { sfallSettings.encounterDetection = !!on },
    exec_map_update_scripts(this: any) {
        for (const obj of mapObjects()) {
            const script = obj?._script
            if (script && typeof script.map_update_p_proc === 'function') {
                script.self_obj = obj
                script.map_update_p_proc()
            }
        }
        const mapScript = (globalState.gMap as any)?.mapScript
        if (mapScript && typeof mapScript.map_update_p_proc === 'function') {mapScript.map_update_p_proc()}
    },
    floor2: (x: number) => Math.floor(Number(x) || 0),
    get_can_rest_on_map: (map: number, elev: number) => sfallSettings.canRestOnMap.get(map + ':' + elev) ?? -1,
    /** get_combat_free_move: the move-only AP left this turn (Bonus Move). */
    get_combat_free_move: () => (globalState.player as any)?.AP?.move ?? 0,
    get_current_inven_size: (obj: any) => (isObject(obj) ? inventorySize(obj) : 0),
    get_cursor_mode: () => ({ move: 0, arrow: 1, crosshair: 2 } as Record<string, number>)[globalState.mouseMode ?? 'move'] ?? 0,
    get_flags: (obj: any) => (isObject(obj) ? obj.flags ?? 0 : 0),
    get_ini_config: () => 0,
    get_ini_section: () => arrayOf([]),
    get_ini_sections: () => arrayOf([]),
    get_inven_ap_cost() {
        const player: any = globalState.player
        return inventoryApCost(player?.perkRanks?.[48] ?? 0)
    },
    /** get_map_enter_position: [tile, elevation, rotation] the player entered at. */
    get_map_enter_position() {
        const p: any = globalState.player
        return arrayOf([tileOf(p), globalState.currentElevation ?? 0, p?.orientation ?? 0])
    },
    get_metarule_table: () => arrayOf(Object.keys(sfallMetarules)),
    /** get_object_ai_data(critter, param): a field of the critter's AI packet (AI_CAP_*). */
    get_object_ai_data(obj: any, param: number) {
        if (!isCritter(obj)) {return -1}
        const cap = aiPacketFor(obj)
        switch (param) {
            case 0: return cap.aggression
            case 1: return cap.areaAttackMode
            case 2: return cap.attackWho
            case 3: return cap.bestWeapon
            case 4: return cap.chemUse
            case 5: return cap.disposition
            case 6: return cap.distance
            case 7: return cap.maxDist
            case 8: return cap.minHp
            case 9: return cap.minToHit
            case 10: return cap.hurtTooMuch
            case 11: return cap.runAwayMode
            case 12: return cap.secondaryFreq
            case 13: return cap.calledFreq
            case 14: return arrayOf((cap.chemPrimaryDesire ?? []).slice(0, 3))
        }
        return -1
    },
    get_object_data(obj: any, offset: number) {
        return offset === 0 ? objectId(obj) : getObjectData(obj, Number(offset))
    },
    get_outline: (obj: any) => (isObject(obj) ? obj.outline ?? 0 : 0),
    get_sfall_arg_at(this: any, id: number) { return this.get_sfall_arg_at?.(id) ?? 0 },
    get_stat_max: (stat: number, who = 0) => statMax(Number(stat), !!who),
    get_stat_min: (stat: number, who = 0) => statMin(Number(stat), !!who),
    get_string_pointer: (s: string) => s,
    get_terrain_name(x?: number, y?: number) {
        const key = x === undefined ? 'current' : x + ':' + y
        return sfallSettings.terrainNames.get(key) ?? (globalState as any).currentTerrainName ?? ''
    },
    get_text_width: (text: string) => String(text ?? '').length * 7,
    get_window_attribute: () => -1,
    has_fake_perk_npc(obj: any, name: string) {
        if (!isCritter(obj) || !isPartyMember(obj)) {return 0}
        return sfallSettings.fakePerks.get(fakeKey(fakeOwner(obj), name))?.level ?? 0
    },
    has_fake_trait_npc(obj: any, name: string) {
        if (!isCritter(obj) || !isPartyMember(obj)) {return 0}
        return sfallSettings.fakeTraits.has(fakeKey(fakeOwner(obj), name)) ? 1 : 0
    },
    hide_window: noop,
    interface_art_draw: () => -1,
    interface_overlay: () => -1,
    interface_print: () => -1,
    intface_hide() { (globalState as any).interfaceHidden = true; EventBus.emit('ui:interfaceVisible' as any, { visible: false } as any) },
    intface_is_hidden: () => ((globalState as any).interfaceHidden ? 1 : 0),
    intface_redraw: noop,
    intface_show() { (globalState as any).interfaceHidden = false; EventBus.emit('ui:interfaceVisible' as any, { visible: true } as any) },
    inventory_redraw: noop,
    item_make_explosive(pid: number, activePid: number, min: number, max?: number) {
        if (!(pid > 0 && activePid > 0)) {return -1}
        const hi = max === undefined ? min : Math.max(min, max)
        sfallSettings.explosives.set(pid, { activePid, min, max: hi })
        return 0
    },
    item_weight: (obj: any) => (isObject(obj) && obj.type === 'item' ? itemWeight(obj) : 0),
    lock_is_jammed: (obj: any) => (isObject(obj) && obj.lockJammed === true ? 1 : 0),
    loot_obj: () => globalState.lootObject ?? 0,
    message_box(text: string, flags = -1) {
        return messageBox(String(text ?? ''), flags === -1 ? 0x11 : flags)
    },
    metarule_exist: (name: string) => (name && sfallMetarules[String(name)] ? 1 : 0),
    npc_engine_level_up(on: number) { sfallSettings.npcEngineLevelUp = !!on },
    /** obj_is_openable: doors and containers whose art has more than one frame. */
    obj_is_openable(obj: any) {
        if (!isObject(obj)) {return 0}
        const sub = obj.pro?.extra?.subType
        const openable = (obj.type === 'scenery' && sub === 0) || (obj.type === 'item' && sub === 1)
        return openable ? 1 : 0
    },
    obj_under_cursor: () => globalState.objUnderCursor ?? 0,
    /** objects_in_radius(tile, radius, elevation, type): by tile, within the radius (0–50). */
    objects_in_radius(tile: number, radius: number, elev: number, type = -1) {
        const r = Math.max(0, Math.min(50, Math.trunc(radius)))
        const e = Math.max(0, Math.min(2, Math.trunc(elev)))
        const center = fromTileNum(tile)
        const level: any[] = (globalState.gMap as any)?.objects?.[e] ?? []
        const found = level.filter((o) => {
            if (!o?.position) {return false}
            if (type !== -1 && OBJ_TYPE[o.type] !== type) {return false}
            const multiHex = ((o.flags ?? 0) & 0x800) !== 0 ? 1 : 0
            return hexDistance(center, o.position) <= r + multiHex
        })
        found.sort((a, b) => tileOf(a) - tileOf(b))
        return arrayOf(found)
    },
    /** opcode_exists: answered by the interpreter (vm_bridge sfallFunc). */
    opcode_exists: () => 0,
    outlined_object: () => (globalState as any).outlinedObject ?? 0,
    real_dude_obj: () => globalState.player ?? 0,
    reg_anim_animate_and_move(this: any, obj: any, tile: number, anim: number, delay: number) {
        this.reg_anim_obj_move_to_tile?.(obj, tile, delay)
    },
    remove_timer_event: noop,
    remove_wm_town_names(on: number) { sfallSettings.townNames = !on },
    set_can_rest_on_map(map: number, elev: number, value: number) {
        sfallSettings.canRestOnMap.set(map + ':' + elev, value)
    },
    set_car_intface_art: noop,
    set_combat_free_move(value: number) {
        const ap = (globalState.player as any)?.AP
        if (ap) {ap.move = Math.max(0, Math.trunc(value))}
    },
    set_cursor_mode(mode: number) {
        globalState.mouseMode = mode === 2 ? 'crosshair' : mode === 1 ? 'arrow' : 'move'
    },
    set_drugs_data(type: number, pid: number, value: number) {
        if (type === 0) {sfallSettings.drugNumEffects.set(pid, value)}
        else if (type === 1) {sfallSettings.drugAddictTimeOff.set(pid, value)}
    },
    /** set_dude_obj: controlling another critter is not supported; only the player. */
    set_dude_obj: (obj: any) => (obj === 0 || obj === null || obj === globalState.player ? 0 : -1),
    set_fake_perk_npc(obj: any, name: string, level: number, image: number, desc: string) {
        if (!isCritter(obj) || !isPartyMember(obj)) {return -1}
        setFake(sfallSettings.fakePerks, 100, fakeOwner(obj), name, level, image, desc)
        return 0
    },
    set_fake_trait_npc(obj: any, name: string, active: number, image: number, desc: string) {
        if (!isCritter(obj) || !isPartyMember(obj)) {return -1}
        setFake(sfallSettings.fakeTraits, 1, fakeOwner(obj), name, active, image, desc)
        return 0
    },
    set_flags(obj: any, flags: number) { if (isObject(obj)) {obj.flags = flags} },
    set_fo1_hit_chance(on: number) { sfallSettings.fo1HitChance = !!on },
    set_iface_tag_text(tag: number, text: string, color: number) {
        if (!(tag > 4 && tag <= lastIfaceTag)) {return -1}
        ;(sfallSettings as any).ifaceTagText ??= new Map()
        ;(sfallSettings as any).ifaceTagText.set(tag, { text: String(text ?? ''), color })
        return 0
    },
    set_ini_setting: () => -1,
    set_map_enter_position(tile: number, elev: number, rot: number) {
        const p: any = globalState.player
        if (!p) {return}
        if (tile > -1 && tile < 40000) {p.position = fromTileNum(tile)}
        if (rot > -1 && rot < 6) {p.orientation = rot}
        void elev
    },
    set_object_data(obj: any, offset: number, value: number) { return setObjectData(obj, Number(offset), Number(value)) },
    set_outline(obj: any, color: number) { if (isObject(obj)) {obj.outline = color} },
    set_quest_failure_value(gvar: number, value: number) { sfallSettings.questFailureValues.set(gvar, value) },
    set_reaction_thresholds(neutral: number, good: number) {
        const n = Math.max(-125, Math.min(125, Math.trunc(neutral)))
        sfallSettings.reactionThresholds = { neutral: n, good: Math.max(n, Math.min(125, Math.trunc(good))) }
    },
    set_rest_heal_time(v: number) { sfallSettings.restHealTime = Math.trunc(v) },
    set_rest_mode(v: number) { sfallSettings.restMode = Math.trunc(v) },
    /** set_scr_name: the name this script's object shows. */
    set_scr_name(this: any, name?: string) {
        const self = this.self_obj
        if (isObject(self)) {self.sfallName = name === undefined || name === '' ? undefined : String(name)}
    },
    set_selectable_perk_npc: (obj: any) => (isCritter(obj) && isPartyMember(obj) ? 0 : -1),
    set_spray_settings(centerMult: number, centerDiv: number, targetMult: number, targetDiv: number) {
        const cd = Math.max(1, Math.trunc(centerDiv))
        const td = Math.max(1, Math.trunc(targetDiv))
        sfallSettings.spray = {
            centerMult: Math.min(cd, Math.max(1, Math.trunc(centerMult))), centerDiv: cd,
            targetMult: Math.min(td, Math.max(1, Math.trunc(targetMult))), targetDiv: td,
        }
    },
    set_terrain_name(x: number, y: number, name: string) { sfallSettings.terrainNames.set(x + ':' + y, String(name ?? '')) },
    set_town_title(area: number, title: string) { sfallSettings.townTitles.set(area, String(title ?? '')) },
    /** set_unique_id(obj[, -1]): give the object a lasting id, or (with -1) a fresh ordinary one. */
    set_unique_id(obj: any, flag?: number) {
        if (!isObject(obj)) {return 0}
        if (flag === -1) {
            delete obj.id
            return objectId(obj)
        }
        if (typeof obj.id !== 'number') {obj.id = objectId(obj)}
        return obj.id
    },
    set_unjam_locks_time(time: number) {
        if (!(time >= 0 && time <= 127)) {return -1}
        sfallSettings.unjamLocksTime = time
        return 0
    },
    set_window_flag: noop,
    set_worldmap_heal_time(v: number) { sfallSettings.worldmapHealTime = Math.trunc(v) },
    show_window: noop,
    signal_close_game: noop,
    spatial_radius: (obj: any) => (isObject(obj) ? obj.radius ?? obj._script?.spatialRadius ?? 0 : 0),
    /** string_compare(a, b[, codepage]): 1 when equal ignoring ASCII case. */
    string_compare: (a: string, b: string) => (falloutStringEquals(String(a ?? ''), String(b ?? '')) ? 1 : 0),
    string_find(haystack: string, needle: string, pos?: number) {
        const h = String(haystack ?? '')
        let start = 0
        if (pos !== undefined) {
            start = Math.trunc(pos)
            if (start >= h.length) {return -1}
            if (start < 0) {start += h.length}
        }
        return h.indexOf(String(needle ?? ''), Math.max(0, start))
    },
    string_format: (format: string, ...args: unknown[]) => sfallSprintf(format, args),
    string_to_case: (s: string, upper: number) => (upper ? String(s ?? '').toUpperCase() : String(s ?? '').toLowerCase()),
    tile_by_position(x: number, y: number) {
        const cam = globalState.cameraPosition ?? { x: 0, y: 0 }
        return toTileNum(hexFromScreen(x + cam.x, y + cam.y))
    },
    tile_refresh_display: noop,
    unjam_lock(obj: any) { if (isObject(obj)) {obj.lockJammed = false} },
    /** unwield_slot(critter, slot): 0 armor, 1 right hand, 2 left hand. */
    unwield_slot(obj: any, slot: number) {
        if (!(slot >= 0 && slot <= 2) || !isCritter(obj)) {return -1}
        unequipSlot(obj, slot === 0 ? 'equippedArmor' : slot === 1 ? 'rightHand' : 'leftHand')
        return 0
    },
    win_fill_color: noop,
    validate_test: noop,
}
