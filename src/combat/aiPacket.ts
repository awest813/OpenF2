/**
 * AI.TXT packets as the Fallout 2 engine reads them (combat_ai.cc aiInit,
 * aiGetPacket) plus the per-critter combat state the AI works from
 * (CritterCombatData: whoHitMe, maneuver, damageLastTurn).
 *
 * Enumerated keys are stored as engine indices (−1 when absent);
 * run_away_mode is shifted down by one so "none" reads −1, "coward" 0 …
 * "never" 5, exactly like the engine.
 */

import { hexDirectionTo, hexDistance } from '../geometry.js'
import globalState from '../globalState.js'
import { Dam } from './criticalTables.js'
import { randomRoll, Roll, type Rng } from './fo2Formulas.js'

/** CritterCombatData.maneuver bits. */
export const Maneuver = {
    NONE: 0,
    ENGAGING: 0x01,
    DISENGAGING: 0x02,
    FLEEING: 0x04,
} as const

export const AREA_ATTACK_MODE_KEYS = ['always', 'sometimes', 'be_sure', 'be_careful', 'be_absolutely_sure'] as const
export const ATTACK_WHO_KEYS = ['whomever_attacking_me', 'strongest', 'weakest', 'whomever', 'closest'] as const
export const BEST_WEAPON_KEYS = [
    'no_pref', 'melee', 'melee_over_ranged', 'ranged_over_melee', 'ranged', 'unarmed', 'unarmed_over_thrown', 'random',
] as const
export const CHEM_USE_KEYS = ['clean', 'stims_when_hurt_little', 'stims_when_hurt_lots', 'sometimes', 'anytime', 'always'] as const
export const DISTANCE_KEYS = ['stay_close', 'charge', 'snipe', 'on_your_own', 'stay'] as const
export const RUN_AWAY_MODE_KEYS = ['none', 'coward', 'finger_hurts', 'bleeding', 'not_feeling_good', 'tourniquet', 'never'] as const
export const DISPOSITION_KEYS = ['none', 'custom', 'coward', 'defensive', 'aggressive', 'berserk'] as const

export const AreaAttackMode = { ALWAYS: 0, SOMETIMES: 1, BE_SURE: 2, BE_CAREFUL: 3, BE_ABSOLUTELY_SURE: 4 } as const
export const AttackWho = { WHOMEVER_ATTACKING_ME: 0, STRONGEST: 1, WEAKEST: 2, WHOMEVER: 3, CLOSEST: 4 } as const
export const BestWeapon = {
    NO_PREF: 0, MELEE: 1, MELEE_OVER_RANGED: 2, RANGED_OVER_MELEE: 3, RANGED: 4, UNARMED: 5, UNARMED_OVER_THROWN: 6, RANDOM: 7,
} as const
export const ChemUse = { CLEAN: 0, STIMS_WHEN_HURT_LITTLE: 1, STIMS_WHEN_HURT_LOTS: 2, SOMETIMES: 3, ANYTIME: 4, ALWAYS: 5 } as const
export const Distance = { STAY_CLOSE: 0, CHARGE: 1, SNIPE: 2, ON_YOUR_OWN: 3, STAY: 4 } as const
/** Disposition after the engine's decrement: none −1, custom 0, coward 1 … berserk 4. */
export const Disposition = { NONE: -1, CUSTOM: 0, COWARD: 1, DEFENSIVE: 2, AGGRESSIVE: 3, BERSERK: 4 } as const

/** hurt_too_much keys and the damage flags each one matches (_rmatchHurtVals). */
const HURT_TOO_MUCH: Record<string, number> = {
    blind: Dam.BLIND,
    crippled: Dam.CRIP_LEG_LEFT | Dam.CRIP_LEG_RIGHT | Dam.CRIP_ARM_LEFT | Dam.CRIP_ARM_RIGHT,
    crippled_legs: Dam.CRIP_LEG_LEFT | Dam.CRIP_LEG_RIGHT,
    crippled_arms: Dam.CRIP_ARM_LEFT | Dam.CRIP_ARM_RIGHT,
}

/** Percent of max HP lost before each run-away mode flees (_hp_run_away_value). */
export const HP_RUN_AWAY_VALUE = [0, 25, 40, 60, 75, 100] as const

/** Engine attack types (ATTACK_TYPE_*). */
export const AttackTypeId = { NONE: 0, UNARMED: 1, MELEE: 2, THROW: 3, RANGED: 4 } as const

/** _weapPrefOrderings, indexed by best_weapon + 1. */
export const WEAPON_PREF_ORDERINGS: readonly (readonly number[])[] = [
    [4, 3, 2, 1, 0],
    [4, 3, 2, 1, 0], // no_pref
    [2, 0, 0, 0, 0], // melee
    [2, 4, 0, 0, 0], // melee_over_ranged
    [4, 2, 0, 0, 0], // ranged_over_melee
    [4, 0, 0, 0, 0], // ranged
    [1, 0, 0, 0, 0], // unarmed
    [1, 3, 0, 0, 0], // unarmed_over_thrown
    [0, 0, 0, 0, 0], // random
]

export function attackTypeId(type: string): number {
    switch (type) {
        case 'unarmed': return AttackTypeId.UNARMED
        case 'melee': return AttackTypeId.MELEE
        case 'throw': return AttackTypeId.THROW
        case 'ranged': return AttackTypeId.RANGED
        default: return AttackTypeId.NONE
    }
}

export interface MessageRange { start: number; end: number }

export interface AiPacket {
    name: string
    packetNum: number
    maxDist: number
    minToHit: number
    minHp: number
    aggression: number
    /** Damage flags that make the critter flee (hurt_too_much). */
    hurtTooMuch: number
    secondaryFreq: number
    calledFreq: number
    font: number
    color: number
    outlineColor: number
    /** Percent chance to taunt. */
    chance: number
    run: MessageRange
    move: MessageRange
    attack: MessageRange
    miss: MessageRange
    /** Hit taunts by engine hit location index. */
    hit: MessageRange[]
    areaAttackMode: number
    runAwayMode: number
    bestWeapon: number
    distance: number
    attackWho: number
    chemUse: number
    chemPrimaryDesire: number[]
    disposition: number
    bodyType: string | null
    generalType: string | null
}

function int(raw: unknown, fallback: number): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {return Math.trunc(raw)}
    if (typeof raw === 'string' && raw.trim() !== '') {
        const n = parseInt(raw, 10)
        if (Number.isFinite(n)) {return n}
    }
    return fallback
}

/** _cai_match_str_to_list: case-insensitive index, −1 when absent or unknown. */
function match(raw: unknown, keys: readonly string[]): number {
    if (raw === undefined || raw === null) {return -1}
    if (typeof raw === 'number') {return raw >= 0 && raw < keys.length ? raw : -1}
    const key = String(raw).trim().toLowerCase()
    return keys.indexOf(key)
}

/** _parse_hurt_str. */
export function parseHurtTooMuch(raw: unknown): number {
    if (typeof raw === 'number') {return raw}
    if (typeof raw !== 'string') {return 0}
    let flags = 0
    for (const part of raw.toLowerCase().split(',')) {
        flags |= HURT_TOO_MUCH[part.trim()] ?? 0
    }
    return flags
}

const HIT_KEYS = ['head', 'left_arm', 'right_arm', 'torso', 'right_leg', 'left_leg', 'eyes', 'groin']

/** Build an engine packet from an AI.TXT section (string or numeric values). */
export function parseAiPacket(info: any): AiPacket {
    const i = info ?? {}
    const range = (prefix: string): MessageRange => ({ start: int(i[prefix + '_start'], 0), end: int(i[prefix + '_end'], -1) })
    const hit = HIT_KEYS.map((k) => range('hit_' + k))
    // aiInit: the groin range end is stored one past the file value.
    hit[7] = { start: hit[7].start, end: hit[7].end + 1 }
    let runAwayMode = match(i.run_away_mode, RUN_AWAY_MODE_KEYS)
    if (runAwayMode >= 0) {runAwayMode--}
    let disposition = match(i.disposition, DISPOSITION_KEYS)
    if (i.disposition !== undefined) {disposition--}
    const desires = typeof i.chem_primary_desire === 'string'
        ? i.chem_primary_desire.split(',').map((s: string) => int(s, -1))
        : Array.isArray(i.chem_primary_desire) ? i.chem_primary_desire.map((s: unknown) => int(s, -1)) : []
    while (desires.length < 3) {desires.push(-1)}
    return {
        name: String(i.keyName ?? i.name ?? ''),
        packetNum: int(i.packet_num, 0),
        maxDist: int(i.max_dist, 0),
        minToHit: int(i.min_to_hit, 0),
        minHp: int(i.min_hp, 0),
        aggression: int(i.aggression, 0),
        hurtTooMuch: parseHurtTooMuch(i.hurt_too_much),
        secondaryFreq: int(i.secondary_freq, 1),
        calledFreq: int(i.called_freq, 1),
        font: int(i.font, 0),
        color: int(i.color, 0),
        outlineColor: int(i.outline_color, 0),
        chance: int(i.chance, 0),
        run: range('run'),
        move: range('move'),
        attack: range('attack'),
        miss: range('miss'),
        hit,
        areaAttackMode: match(i.area_attack_mode, AREA_ATTACK_MODE_KEYS),
        runAwayMode,
        bestWeapon: match(i.best_weapon, BEST_WEAPON_KEYS),
        distance: match(i.distance, DISTANCE_KEYS),
        attackWho: match(i.attack_who, ATTACK_WHO_KEYS),
        chemUse: match(i.chem_use, CHEM_USE_KEYS),
        chemPrimaryDesire: desires.slice(0, 3),
        disposition,
        bodyType: typeof i.body_type === 'string' ? i.body_type : null,
        generalType: typeof i.general_type === 'string' ? i.general_type : null,
    }
}

/**
 * The packet `critter` fights with. Party members' combat-control choices
 * are written into the packet the way the engine's aiSet* calls do; picking
 * a run-away mode also sets min_hp (aiSetRunAwayMode).
 */
export function aiPacketFor(critter: any): AiPacket {
    const ai = critter?.ai
    let packet: AiPacket | undefined = ai?.packet
    if (!packet || ai?.packetSource !== ai?.info) {
        packet = parseAiPacket(ai?.info)
        if (ai) {
            ai.packet = packet
            ai.packetSource = ai.info
        }
    }
    const ctrl = globalState.gParty?.getControl?.(critter)
    if (!ctrl) {return packet}
    const out: AiPacket = { ...packet }
    const pick = (raw: unknown, keys: readonly string[], cur: number) => {
        const v = match(raw, keys)
        return v >= 0 ? v : cur
    }
    out.areaAttackMode = pick(ctrl.areaAttackMode, AREA_ATTACK_MODE_KEYS, out.areaAttackMode)
    out.attackWho = pick(ctrl.attackWho, ATTACK_WHO_KEYS, out.attackWho)
    out.bestWeapon = pick(ctrl.bestWeapon, BEST_WEAPON_KEYS, out.bestWeapon)
    out.chemUse = pick(ctrl.chemUse, CHEM_USE_KEYS, out.chemUse)
    out.distance = pick(ctrl.distance, DISTANCE_KEYS, out.distance)
    const disposition = match(ctrl.disposition, DISPOSITION_KEYS)
    if (disposition >= 0) {out.disposition = disposition - 1}
    const runAway = match(ctrl.runAwayMode, RUN_AWAY_MODE_KEYS) - 1
    if (runAway >= 0) {
        out.runAwayMode = runAway
        const maxHp = statOf(critter, 'Max HP')
        out.minHp = maxHp - Math.trunc(maxHp * HP_RUN_AWAY_VALUE[runAway] / 100)
    }
    return out
}

export function statOf(critter: any, stat: string): number {
    let v: unknown = 0
    try {
        v = typeof critter?.getStat === 'function' ? critter.getStat(stat) : 0
    } catch {
        v = 0
    }
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function skillOf(critter: any, skill: string): number {
    let v: unknown = 0
    try {
        v = typeof critter?.getSkill === 'function' ? critter.getSkill(skill) : 0
    } catch {
        v = 0
    }
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** The engine's combat result flags, built from a critter's state fields. */
export function resultFlags(critter: any): number {
    if (!critter) {return 0}
    let flags = 0
    if (critter.knockedOut) {flags |= Dam.KNOCKED_OUT}
    if (critter.knockedDown) {flags |= Dam.KNOCKED_DOWN}
    if (critter.crippledLeftLeg) {flags |= Dam.CRIP_LEG_LEFT}
    if (critter.crippledRightLeg) {flags |= Dam.CRIP_LEG_RIGHT}
    if (critter.crippledLeftArm) {flags |= Dam.CRIP_ARM_LEFT}
    if (critter.crippledRightArm) {flags |= Dam.CRIP_ARM_RIGHT}
    if (critter.blinded) {flags |= Dam.BLIND}
    if (critter.dead) {flags |= Dam.DEAD}
    if (critter.onFire) {flags |= Dam.ON_FIRE}
    if (critter.loseNextTurn) {flags |= Dam.LOSE_TURN}
    return flags
}

export function maneuverOf(critter: any): number {
    return typeof critter?.combatManeuver === 'number' ? critter.combatManeuver : 0
}

export function isFleeing(critter: any): boolean {
    return (maneuverOf(critter) & Maneuver.FLEEING) !== 0
}

export function teamOf(critter: any): number {
    return typeof critter?.teamNum === 'number' ? critter.teamNum : 0
}

/** objectIsPartyMember: the player or a recruited companion. */
export function isPartyMember(critter: any): boolean {
    if (!critter) {return false}
    if (critter.isPlayer) {return true}
    try {
        return globalState.gParty?.isPartyMember?.(critter) === true
    } catch {
        return false
    }
}

/** statRoll: d10 against stat + modifier. */
export function statRollSucceeds(critter: any, stat: string, modifier: number, rng: Rng): boolean {
    return rng(1, 10) <= statOf(critter, stat) + modifier
}

/**
 * critter.cc _critter_set_who_hit_me: remember who to fight back. A teammate
 * is only blamed when an Intelligence roll fails, and party members never
 * blame each other.
 */
export function setWhoHitMe(critter: any, attacker: any, rng: Rng): void {
    if (!critter) {return}
    if (attacker && typeof attacker.getStat !== 'function' && attacker.type !== 'critter') {return}
    if (!attacker
        || teamOf(critter) !== teamOf(attacker)
        || (!statRollSucceeds(critter, 'INT', -1, rng) && (!isPartyMember(critter) || !isPartyMember(attacker)))) {
        critter.whoHitMe = attacker ?? null
    }
}

/** _combatai_rating: best of melee damage and weapon max damage, plus AC. */
export function combatRating(critter: any): number {
    if (!critter || critter.dead || critter.knockedOut) {return 0}
    let damage = statOf(critter, 'Melee Damage')
    for (const slot of [critter.leftHand, critter.rightHand]) {
        const w = slot?.weapon
        if (!slot?.pro || !w) {continue}
        const max = slot.pro?.extra?.maxDmg ?? w.maxDmg
        if (typeof max === 'number' && damage < max) {damage = max}
    }
    return damage + statOf(critter, 'AC')
}

/** _combatai_check_retaliation: switch to a stronger attacker. */
export function checkRetaliation(critter: any, attacker: any, rng: Rng): void {
    const current = critter?.whoHitMe
    if (current) {
        if (combatRating(attacker) > combatRating(current)) {setWhoHitMe(critter, attacker, rng)}
    } else {
        setWhoHitMe(critter, attacker, rng)
    }
}

/** actions.cc _can_see: the target is in the critter's forward arc. */
export function canSee(critter: any, target: any): boolean {
    if (!critter?.position || !target?.position) {return false}
    if (critter.position.x === target.position.x && critter.position.y === target.position.y) {return true}
    const dir = hexDirectionTo(critter.position, target.position)
    if (dir === null || dir === undefined) {return false}
    const diff = Math.abs((critter.orientation ?? 0) - dir)
    return diff === 0 || diff === 1 || diff === 5
}

const OBJECT_TRANS_GLASS = 0x20000
/** DUDE_STATE_SNEAKING is state bit 0 (bit 3 is LEVEL_UP_AVAILABLE, bit 4 ADDICTED). */
export const PC_FLAG_SNEAKING = 1 << 0

/** dudeHasState(DUDE_STATE_SNEAKING). */
export function playerInSneakMode(player: any = globalState.player): boolean {
    return typeof player?.pcFlags === 'number' && (player.pcFlags & PC_FLAG_SNEAKING) !== 0
}

/**
 * dudeEnableState / dudeDisableState(DUDE_STATE_SNEAKING). Turning sneak on
 * makes the first Sneak roll at once (sneakEventProcess); turning it off
 * drops the pending one.
 */
export function setPlayerSneakMode(player: any, on: boolean, rng?: Rng): void {
    if (!player) {return}
    if (typeof player.pcFlags !== 'number') {player.pcFlags = 0}
    player.sneakCheckTick = undefined
    player.sneakWorking = false
    if (on) {
        player.pcFlags |= PC_FLAG_SNEAKING
        playerIsSneaking(rng ?? ((min, max) => min + Math.floor(Math.random() * (max - min + 1))), player)
    } else {
        player.pcFlags &= ~PC_FLAG_SNEAKING
    }
}

/**
 * dudeIsSneaking: in sneak mode and the last Sneak roll worked. The engine
 * rolls Sneak on a timer (sneakEventProcess); this rolls lazily when the
 * previous result has expired.
 */
export function playerIsSneaking(rng: Rng, player: any = globalState.player): boolean {
    if (!playerInSneakMode(player)) {return false}
    const now = globalState.gameTickTime ?? 0
    if (typeof player.sneakCheckTick !== 'number' || now >= player.sneakCheckTick) {
        const sneak = skillOf(player, 'Sneak')
        const ok = randomRoll(sneak, 0, rng, false).roll >= Roll.Success
        let time = 600
        if (!ok) {
            if (sneak > 250) {time = 100}
            else if (sneak > 200) {time = 120}
            else if (sneak > 170) {time = 150}
            else if (sneak > 135) {time = 200}
            else if (sneak > 100) {time = 300}
            else if (sneak > 80) {time = 400}
        }
        player.sneakWorking = ok
        player.sneakCheckTick = now + time
    }
    return player.sneakWorking === true
}

/** combat_ai.cc isWithinPerception. */
export function isWithinPerception(critter: any, target: any, rng: Rng): boolean {
    if (!critter?.position || !target?.position) {return false}
    const distance = hexDistance(target.position, critter.position)
    const perception = statOf(critter, 'PER')
    const sneak = skillOf(target, 'Sneak')
    const isDude = target === globalState.player || target?.isPlayer === true
    const sneakAdjust = (maxDistance: number): number => {
        if (!isDude) {return maxDistance}
        if (playerIsSneaking(rng, target)) {
            maxDistance = Math.trunc(maxDistance / 4)
            if (sneak > 120) {maxDistance -= 1}
        } else if (playerInSneakMode(target)) {
            maxDistance = Math.trunc(maxDistance * 2 / 3)
        }
        return maxDistance
    }

    if (canSee(critter, target)) {
        let maxDistance = perception * 5
        if ((target.flags ?? 0) & OBJECT_TRANS_GLASS) {maxDistance = Math.trunc(maxDistance / 2)}
        if (distance <= sneakAdjust(maxDistance)) {return true}
    }

    const maxDistance = globalState.inCombat ? perception * 2 : perception
    return distance <= sneakAdjust(maxDistance)
}
