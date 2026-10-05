/**
 * Choosing a critter's death animation (actions.cc _pick_death,
 * _check_death, _is_hit_from_front), with sfall's HOOK_DEATHANIM1/2.
 */

import globalState from '../globalState.js'
import { critterArt } from '../animSequence.js'
import { violenceToIni } from '../settings.js'
import { HOOK, runHook } from '../hookScripts.js'
import { PerkId, perkRank } from '../character/perkIds.js'
import { TraitId } from '../character/statModifiers.js'

export const ANIM_THROW_PUNCH = 16
export const ANIM_KICK_LEG = 17
export const ANIM_THROW_ANIM = 18
export const ANIM_FALL_BACK = 20
export const ANIM_FALL_FRONT = 21
export const ANIM_BIG_HOLE = 23
export const ANIM_CHARRED_BODY = 24
export const ANIM_CHUNKS_OF_FLESH = 25
export const ANIM_DANCING_AUTOFIRE = 26
export const ANIM_ELECTRIFY = 27
export const ANIM_SLICED_IN_HALF = 28
export const ANIM_BURNED_TO_NOTHING = 29
export const ANIM_ELECTRIFIED_TO_NOTHING = 30
export const ANIM_EXPLODED_TO_NOTHING = 31
export const ANIM_MELTED_TO_NOTHING = 32
export const ANIM_FIRE_DANCE = 33
export const ANIM_THRUST_ANIM = 41
export const ANIM_SWING_ANIM = 42
export const ANIM_FIRE_SINGLE = 45
export const ANIM_FIRE_BURST = 46
export const ANIM_FIRE_CONTINUOUS = 47

const VIOLENCE_NONE = 0
const VIOLENCE_MINIMAL = 1
const VIOLENCE_NORMAL = 2
const VIOLENCE_MAXIMUM_BLOOD = 3

const DAMAGE_TYPE_NORMAL = 0
const DAMAGE_TYPE_FIRE = 2
const DAMAGE_TYPE_EXPLOSION = 6
const DAMAGE_TYPE_NAMES = ['Normal', 'Laser', 'Fire', 'Plasma', 'Electrical', 'EMP', 'Explosive']

const PROTO_ID_MOLOTOV_COCKTAIL = 159
const CRITTER_SPECIAL_DEATH = 0x1000

const NORMAL_DEATH = [
    ANIM_DANCING_AUTOFIRE, ANIM_SLICED_IN_HALF, ANIM_CHARRED_BODY, ANIM_CHARRED_BODY,
    ANIM_ELECTRIFY, ANIM_FALL_BACK, ANIM_BIG_HOLE,
]
const MAXIMUM_BLOOD_DEATH = [
    ANIM_CHUNKS_OF_FLESH, ANIM_SLICED_IN_HALF, ANIM_FIRE_DANCE, ANIM_MELTED_TO_NOTHING,
    ANIM_ELECTRIFIED_TO_NOTHING, ANIM_FALL_BACK, ANIM_EXPLODED_TO_NOTHING,
]

/** item.cc _attack_anim: the attacker's animation for each proto attack mode. */
const ATTACK_ANIM = [
    0, ANIM_THROW_PUNCH, ANIM_KICK_LEG, ANIM_SWING_ANIM, ANIM_THRUST_ANIM,
    ANIM_THROW_ANIM, ANIM_FIRE_SINGLE, ANIM_FIRE_BURST, ANIM_FIRE_CONTINUOUS,
]

/** weaponGetAnimationForHitMode, from the proto attack mode (1 punch … 8 flame). */
export function attackAnimationForMode(mode: number, kick: boolean): number {
    if (kick) {return ANIM_KICK_LEG}
    return ATTACK_ANIM[mode] ?? ANIM_THROW_PUNCH
}

/** _is_hit_from_front: true unless the two face (nearly) the same way. */
export function isHitFromFront(attacker: any, defender: any): boolean {
    const diff = Math.abs((attacker?.orientation ?? 0) - (defender?.orientation ?? 0))
    return diff !== 0 && diff !== 1 && diff !== 5
}

function violenceLevel(): number {
    return violenceToIni(globalState.violenceLevel ?? 2)
}

/** _check_death: the animation if allowed and drawn, else a fall the critter has. */
export function checkDeath(critter: any, anim: number, minViolence: number, hitFromFront: boolean): number {
    if (violenceLevel() >= minViolence && critterArt(critter, anim)) {return anim}
    if (hitFromFront) {return ANIM_FALL_BACK}
    return critterArt(critter, ANIM_FALL_FRONT) ? ANIM_FALL_BACK : ANIM_FALL_FRONT
}

function damageTypeIndex(name: string | undefined): number {
    const i = DAMAGE_TYPE_NAMES.indexOf(name ?? 'Normal')
    return i < 0 ? DAMAGE_TYPE_NORMAL : i
}

/** _pick_death. */
export function pickDeath(
    attacker: any, defender: any, weapon: any, damage: number,
    damageTypeName: string | undefined, attackerAnimation: number, hitFromFront: boolean
): number {
    let normalThreshold = 15
    let maxBloodThreshold = 45
    let damageType = damageTypeIndex(damageTypeName)

    if (weapon && weapon.pid === PROTO_ID_MOLOTOV_COCKTAIL) {
        normalThreshold = 5
        maxBloodThreshold = 15
        damageType = DAMAGE_TYPE_FIRE
        attackerAnimation = ANIM_FIRE_SINGLE
    }
    const isDude = attacker != null && attacker === globalState.player
    if (isDude && perkRank(attacker, PerkId.PYROMANIAC) > 0 && damageType === DAMAGE_TYPE_FIRE) {
        normalThreshold = 1
        maxBloodThreshold = 1
    }
    if (weapon && (weapon.pro?.extra?.perk ?? -1) === PerkId.WEAPON_FLAMEBOY) {
        normalThreshold = Math.trunc(normalThreshold / 3)
        maxBloodThreshold = Math.trunc(maxBloodThreshold / 3)
    }

    const violence = violenceLevel()
    if (((defender?.pro?.extra?.flags ?? 0) & CRITTER_SPECIAL_DEATH) !== 0) {
        return checkDeath(defender, ANIM_EXPLODED_TO_NOTHING, VIOLENCE_NORMAL, hitFromFront)
    }

    const bloodyMess = isDude && (attacker.charTraits?.has?.(TraitId.BLOODY_MESS) ?? false)
    let deathAnim = ANIM_FALL_BACK
    if ((attackerAnimation === ANIM_THROW_PUNCH && damageType === DAMAGE_TYPE_NORMAL)
        || attackerAnimation === ANIM_KICK_LEG
        || attackerAnimation === ANIM_THRUST_ANIM
        || attackerAnimation === ANIM_SWING_ANIM
        || (attackerAnimation === ANIM_THROW_ANIM && damageType !== DAMAGE_TYPE_EXPLOSION)) {
        if (violence === VIOLENCE_MAXIMUM_BLOOD && bloodyMess) {deathAnim = ANIM_BIG_HOLE}
    } else if (attackerAnimation === ANIM_FIRE_SINGLE && damageType === DAMAGE_TYPE_NORMAL) {
        if (violence === VIOLENCE_MAXIMUM_BLOOD && (bloodyMess || maxBloodThreshold <= damage)) {deathAnim = ANIM_BIG_HOLE}
    } else if (violence > VIOLENCE_MINIMAL && (bloodyMess || normalThreshold <= damage)) {
        if (violence > VIOLENCE_NORMAL && (bloodyMess || maxBloodThreshold <= damage)) {
            deathAnim = MAXIMUM_BLOOD_DEATH[damageType]
            if (checkDeath(defender, deathAnim, VIOLENCE_MAXIMUM_BLOOD, hitFromFront) !== deathAnim) {
                deathAnim = NORMAL_DEATH[damageType]
            }
        } else {
            deathAnim = NORMAL_DEATH[damageType]
        }
    }

    if (!hitFromFront && deathAnim === ANIM_FALL_BACK) {deathAnim = ANIM_FALL_FRONT}
    return checkDeath(defender, deathAnim, VIOLENCE_NONE, hitFromFront)
}

/**
 * sfall CalcDeathAnimHook_Script: HOOK_DEATHANIM1 may swap the weapon the
 * engine sees (by pid), then _pick_death, then HOOK_DEATHANIM2 may replace
 * the result outright.
 */
export function deathAnimationFor(
    attacker: any, defender: any, weapon: any, damage: number,
    damageTypeName: string | undefined, attackerAnimation: number, hitFromFront: boolean,
    protoFor?: (pid: number) => any
): number {
    let weaponPid = weapon ? (weapon.pid ?? -1) : -1
    const hook1 = runHook(HOOK.DEATHANIM1, [weaponPid, attacker, defender, damage, -1])
    if (hook1 && hook1.rets.length > 0) {
        weaponPid = Number(hook1.rets[0]) | 0
        const replacement = protoFor?.(weaponPid)
        if (replacement) {
            weapon = replacement
            const t = replacement.pro?.extra?.dmgType
            if (typeof t === 'number') {damageTypeName = DAMAGE_TYPE_NAMES[t] ?? damageTypeName}
        }
    }
    let anim = pickDeath(attacker, defender, weapon, damage, damageTypeName, attackerAnimation, hitFromFront)
    const hook2 = runHook(HOOK.DEATHANIM2, [weaponPid, attacker, defender, damage, anim])
    if (hook2 && hook2.rets.length > 0) {anim = Number(hook2.rets[0]) | 0}
    return anim
}
