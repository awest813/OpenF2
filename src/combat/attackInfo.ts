/**
 * Everything combat needs to know about the weapon a critter attacks with,
 * read from its item and ammo protos the way the Fallout 2 engine reads them
 * (item.cc weaponGet* helpers).
 */

import { PerkId, perkRank } from '../character/perkIds.js'
import { TraitId } from '../character/statModifiers.js'
import { loadPRO } from '../pro.js'
import { weaponAmmoPid } from './ammo.js'
import { attackApCost, attackTypeForMode, type AttackType } from './fo2Formulas.js'

/** Primary (1) or secondary (2) attack of the weapon in hand. */
export type HitMode = 1 | 2

/** item.cc weapon proto extended flag: two-handed (byte 2, 0x02 → 0x200). */
const WEAPON_FLAG_TWO_HANDED = 0x02

export interface AttackWeaponInfo {
    /** The weapon item, or null for bare fists. */
    weapon: any | null
    hitMode: HitMode
    /** Raw proto attack mode (1 punch … 8 flame). */
    mode: number
    attackType: AttackType
    isBurst: boolean
    /** Proto AP cost, or null for bare fists. */
    protoApCost: number | null
    range: number
    skill: string
    perk: number
    minStrength: number
    twoHanded: boolean
    /** Damage type name as used by DT/DR stats ('Normal', 'Laser', …). */
    damageType: string
    minDamage: number
    maxDamage: number
    /** Proto critical failure table index (0 when none). */
    critFailType: number
    /** Proto burst size. */
    burstRounds: number
}

const DAMAGE_TYPE_NAMES = ['Normal', 'Laser', 'Fire', 'Plasma', 'Electrical', 'EMP', 'Explosive']

/** Engine weapon skill by attack type when the proto skill cannot be resolved. */
function fallbackSkill(attackType: AttackType): string {
    switch (attackType) {
        case 'melee': return 'Melee Weapons'
        case 'throw': return 'Throwing'
        case 'ranged': return 'Small Guns'
        default: return 'Unarmed'
    }
}

function protoExtra(weapon: any): any {
    return weapon?.pro?.extra ?? weapon?.weapon?.weapon?.pro?.extra ?? {}
}

/** Weapon details for `critter`'s equipped weapon (bare fists when none). */
export function getAttackWeaponInfo(critter: any, hitMode: HitMode = 1): AttackWeaponInfo {
    const weapon = critter?.equippedWeapon ?? null
    // Critters with empty hands carry a proto-less placeholder "punch" weapon.
    const bareFists = !weapon || !weapon.weapon || (!weapon.pro && weapon.weapon.name === 'punch')
    if (bareFists) {
        // HIT_MODE_PUNCH: 1–2 damage + Melee Damage, 3 AP, 1 hex.
        return {
            weapon: null,
            hitMode: 1,
            mode: 1,
            attackType: 'unarmed',
            isBurst: false,
            protoApCost: null,
            range: 1,
            skill: 'Unarmed',
            perk: -1,
            minStrength: 0,
            twoHanded: false,
            damageType: 'Normal',
            minDamage: 1,
            maxDamage: 2,
            critFailType: 0,
            burstRounds: 0,
        }
    }

    const extra = protoExtra(weapon)
    let modes = typeof extra.attackMode === 'number' ? extra.attackMode : 0
    if (modes === 0) {
        // No proto attack modes (synthetic weapons): infer from the weapon
        // class, else from the skill it uses.
        const kind = weapon.weapon?.type
        const skillName = weapon.weapon?.weaponSkillType
        if (kind === 'gun' || skillName === 'Small Guns' || skillName === 'Big Guns' || skillName === 'Energy Weapons') {modes = 6}
        else if (kind === 'throwing' || skillName === 'Throwing') {modes = 5}
        else if (kind === 'melee' || skillName === 'Melee Weapons') {modes = 3}
        else {modes = 1}
    }
    let mode = hitMode === 2 ? (modes >> 4) & 0x0f : modes & 0x0f
    // A weapon without a secondary mode attacks with its primary.
    if (hitMode === 2 && mode === 0) {mode = modes & 0x0f}
    const attackType = attackTypeForMode(mode)

    let range = (hitMode === 2 ? extra.maxRange2 : extra.maxRange1)
        ?? weapon.weapon?.getMaximumRange?.(hitMode)
        ?? 1
    if (attackType === 'throw') {
        // weaponGetRange: thrown range is capped at 3×STR (+2 STR per Heave Ho! rank, max 10).
        let str = critter.getStat?.('STR') ?? 5
        if (critter.isPlayer) {str = Math.min(10, str + 2 * perkRank(critter, PerkId.HEAVE_HO))}
        range = Math.min(range, 3 * str)
    }

    const apCost = (hitMode === 2 ? extra.APCost2 : extra.APCost1)
        ?? weapon.weapon?.getAPCost?.(hitMode)
        ?? 4
    const dmgType = typeof extra.dmgType === 'number' ? extra.dmgType : 0
    const skill = weapon.weapon?.weaponSkillType ?? fallbackSkill(attackType)

    return {
        weapon,
        hitMode,
        mode,
        attackType,
        isBurst: mode === 7,
        protoApCost: typeof apCost === 'number' ? apCost : null,
        range,
        skill,
        perk: typeof extra.perk === 'number' ? extra.perk : -1,
        minStrength: typeof extra.minST === 'number' ? extra.minST : 0,
        twoHanded: ((extra.weaponFlags ?? 0) & WEAPON_FLAG_TWO_HANDED) !== 0 || !!extra.twoHanded,
        damageType: DAMAGE_TYPE_NAMES[dmgType] ?? 'Normal',
        minDamage: extra.minDmg ?? weapon.weapon?.minDmg ?? 0,
        maxDamage: extra.maxDmg ?? weapon.weapon?.maxDmg ?? 0,
        critFailType: typeof extra.critFail === 'number' && extra.critFail >= 0 ? extra.critFail : 0,
        burstRounds: typeof extra.rounds === 'number' ? extra.rounds : (extra.burstRounds ?? 0),
    }
}

/** True when the weapon has a burst (secondary fire burst) mode. */
export function weaponHasBurst(critter: any): boolean {
    const extra = protoExtra(critter?.equippedWeapon)
    return (((extra.attackMode ?? 0) >> 4) & 0x0f) === 7
}

export interface AmmoModifiers {
    acModifier: number
    drModifier: number
    damageMultiplier: number
    damageDivisor: number
}

const NO_AMMO: AmmoModifiers = { acModifier: 0, drModifier: 0, damageMultiplier: 1, damageDivisor: 1 }

/** Modifiers of the ammo loaded in `weapon` (item.cc weaponGetAmmo*). */
export function getAmmoModifiers(weapon: any | null): AmmoModifiers {
    if (!weapon) {return NO_AMMO}
    const extra = protoExtra(weapon)
    let ammo: any = null
    const pid = typeof extra.ammoPID === 'number' && extra.ammoPID > 0 ? weaponAmmoPid(weapon) : -1
    if (pid > 0) {
        try {
            ammo = loadPRO(pid, pid & 0xffffff)?.extra ?? null
        } catch {
            ammo = null
        }
    }
    const pick = (ammoKey: string, legacyKey: string, fallback: number): number => {
        const v = ammo?.[ammoKey] ?? extra[legacyKey]
        return typeof v === 'number' && Number.isFinite(v) ? v : fallback
    }
    return {
        acModifier: pick('AC modifier', 'acModifier', 0),
        drModifier: pick('DR modifier', 'drModifier', 0),
        damageMultiplier: pick('damMult', 'ammoDmgMult', 1),
        damageDivisor: pick('damDiv', 'ammoDmgDiv', 1),
    }
}

/** AP to attack with `info` (item.cc weaponGetActionPointCost). */
export function attackApCostFor(critter: any, info: AttackWeaponInfo, aiming = false): number {
    const isPlayer = critter?.isPlayer === true
    return attackApCost({
        isPlayer,
        weaponApCost: info.protoApCost,
        attackType: info.attackType,
        weaponRange: info.range,
        fastShotTrait: critter?.charTraits?.has?.(TraitId.FAST_SHOT) ?? false,
        bonusHthAttacks: perkRank(critter, PerkId.BONUS_HTH_ATTACKS) > 0,
        bonusRateOfFire: perkRank(critter, PerkId.BONUS_RATE_OF_FIRE) > 0,
        aiming,
    })
}

/** Whether the attacker may aim (called shot) with this attack (item.cc critterCanAim). */
export function canAimAttack(critter: any, info: AttackWeaponInfo): boolean {
    // Fast Shot: the player can never aim.
    if (critter?.isPlayer && critter?.charTraits?.has?.(TraitId.FAST_SHOT)) {return false}
    if (info.isBurst || info.mode === 8) {return false}
    const t = info.damageType
    if (t === 'Explosive' || t === 'Fire' || t === 'EMP') {return false}
    if (t === 'Plasma' && info.attackType === 'throw') {return false}
    return true
}
