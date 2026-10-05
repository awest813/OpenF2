/**
 * Fallout 2 combat arithmetic, ported from the original engine
 * (fallout2-ce combat.cc / item.cc / random.cc / stat.cc).
 *
 * Every function here is pure: callers gather the inputs from critters,
 * weapons and the map, and pass in a `rng(min, max)` (inclusive) so tests can
 * drive exact rolls. C integer division truncates toward zero, so `idiv`
 * is used wherever the engine divides ints.
 */

import { PerkId } from '../character/perkIds.js'

/** Inclusive random integer source: rng(1, 100) is a d100. */
export type Rng = (min: number, max: number) => number

/** C-style integer division (truncates toward zero). */
export function idiv(a: number, b: number): number {
    return Math.trunc(a / b)
}

// ---------------------------------------------------------------------------
// Hit locations
// ---------------------------------------------------------------------------

/** combat.cc hit_location_penalty_default, by engine HitLocation order. */
export const HIT_LOCATION_PENALTY: Readonly<Record<string, number>> = {
    head: -40,
    leftArm: -30,
    rightArm: -30,
    torso: 0,
    rightLeg: -20,
    leftLeg: -20,
    eyes: -60,
    groin: -30,
    uncalled: 0,
}

export function hitLocationPenalty(region: string): number {
    return HIT_LOCATION_PENALTY[region] ?? 0
}

// ---------------------------------------------------------------------------
// Rolls (random.cc)
// ---------------------------------------------------------------------------

export const enum Roll {
    CriticalFailure = 0,
    Failure = 1,
    Success = 2,
    CriticalSuccess = 3,
}

/**
 * randomRoll(): d100 against `difficulty`. delta = difficulty − d100; a
 * non-negative delta succeeds. Criticals need `criticalsAllowed` (the engine
 * suppresses them on day 0 of the game): success upgrades on
 * d100 ≤ delta/10 + critModifier, failure downgrades on d100 ≤ −delta/10.
 */
export function randomRoll(
    difficulty: number,
    criticalSuccessModifier: number,
    rng: Rng,
    criticalsAllowed = true,
): { roll: Roll; delta: number } {
    const delta = difficulty - rng(1, 100)
    if (delta < 0) {
        if (criticalsAllowed && rng(1, 100) <= idiv(-delta, 10)) {
            return { roll: Roll.CriticalFailure, delta }
        }
        return { roll: Roll.Failure, delta }
    }
    if (criticalsAllowed && rng(1, 100) <= idiv(delta, 10) + criticalSuccessModifier) {
        return { roll: Roll.CriticalSuccess, delta }
    }
    return { roll: Roll.Success, delta }
}

// ---------------------------------------------------------------------------
// To-hit (attackDetermineToHit)
// ---------------------------------------------------------------------------

export type AttackType = 'unarmed' | 'melee' | 'ranged' | 'throw'

export interface ToHitInput {
    /** Attacker is the player (dude): enables player-only rules. */
    isPlayer: boolean
    /** The script-started combat's accuracy bonus (CombatStartData), for its first turn. */
    scriptAccuracyBonus?: number
    /** The cap (95 unless a script changed it, sfall HitChanceMod) after any script bonus. */
    hitChanceCap?: (chance: number) => number
    /** Weapon skill (or Unarmed skill when no weapon). */
    skill: number
    /** A weapon is in the attacking hand (brass knuckles count; bare fists do not). */
    hasWeapon: boolean
    attackType: AttackType
    /** Weapon proto perk (PerkId), or -1. */
    weaponPerk: number
    weaponTwoHanded: boolean
    /** Weapon proto minimum Strength (0 when none). */
    weaponMinStrength: number
    /** Attacker effective Perception (already −5 when blinded). */
    perception: number
    strength: number
    sharpshooterRank: number
    weaponHandling: boolean
    oneHanderTrait: boolean
    /** Hex distance to the target, or null for a range-less check. */
    distance: number | null
    /** Critters standing on the line of fire (each −10%). */
    crittersInLineOfFire: number
    /**
     * Precomputed signed range modifier (what the range block adds to the
     * to-hit). When set, replaces the distance calculation.
     */
    rangeModifierOverride?: number
    /** Defender AC, or null when the defender is not a critter. */
    targetAC: number | null
    /** Loaded ammo's AC modifier (added to the defender's AC). */
    ammoACModifier: number
    /** Called-shot region (key of HIT_LOCATION_PENALTY). */
    region: string
    targetMultihex: boolean
    /** Received light at the defender, 0..65536 (player attacks only). */
    targetLightIntensity: number
    attackerBlind: boolean
    targetKnockedDownOrOut: boolean
    /** combat_difficulty preference: 0 easy, 1 normal, 2 hard. */
    combatDifficulty: number
    /** Attacker is not on the player's team (difficulty applies). */
    attackerIsHostileToPlayer: boolean
}

/**
 * The signed range term of attackDetermineToHit for ranged/thrown attacks:
 * −4% per hex beyond Perception×2 (×4 Long Range, ×5 Scope Range; the player
 * counts Perception as 2 lower), up to +8×PER at point blank, −12% per hex
 * when blind. Scoped weapons are penalised inside 8 hexes.
 */
export function rangeToHitModifier(i: Pick<ToHitInput, 'isPlayer' | 'weaponPerk' | 'perception' | 'sharpshooterRank' | 'distance' | 'attackerBlind'>): number {
    let perceptionBonusMult = 2
    let minEffectiveDist = 0
    if (i.weaponPerk === PerkId.WEAPON_LONG_RANGE) {
        perceptionBonusMult = 4
    } else if (i.weaponPerk === PerkId.WEAPON_SCOPE_RANGE) {
        perceptionBonusMult = 5
        minEffectiveDist = 8
    }

    let perception = i.perception
    if (i.isPlayer) {perception += 2 * i.sharpshooterRank}

    const useDistance = i.distance !== null
    let distanceMod = i.distance ?? 0
    if (distanceMod >= minEffectiveDist) {
        const perceptionBonus = i.isPlayer
            ? perceptionBonusMult * (perception - 2)
            : perceptionBonusMult * perception
        distanceMod -= perceptionBonus
    } else {
        distanceMod += minEffectiveDist
    }

    if (distanceMod < -2 * perception) {distanceMod = -2 * perception}

    if (distanceMod >= 0 && i.attackerBlind) {
        distanceMod *= -12
    } else {
        distanceMod *= -4
    }

    return useDistance || distanceMod > 0 ? distanceMod : 0
}

export function computeToHit(i: ToHitInput): number {
    let toHit = i.skill
    let isRanged = false

    if (i.hasWeapon) {
        if (i.attackType === 'ranged' || i.attackType === 'throw') {
            isRanged = true

            toHit += i.rangeModifierOverride ?? rangeToHitModifier(i)

            toHit -= 10 * (i.distance !== null ? i.crittersInLineOfFire : 0)
        }

        if (i.isPlayer && i.oneHanderTrait) {
            toHit += i.weaponTwoHanded ? -40 : 20
        }

        let minStrengthMod = i.weaponMinStrength - i.strength
        if (i.isPlayer && i.weaponHandling) {minStrengthMod -= 3}
        if (minStrengthMod > 0) {toHit -= 20 * minStrengthMod}

        if (i.weaponPerk === PerkId.WEAPON_ACCURATE) {toHit += 20}
    }

    if (i.targetAC !== null) {
        const armorClass = Math.max(0, i.targetAC + i.ammoACModifier)
        toHit -= armorClass
    }

    const locPenalty = hitLocationPenalty(i.region)
    toHit += isRanged ? locPenalty : idiv(locPenalty, 2)

    if (i.targetMultihex) {toHit += 15}

    if (i.isPlayer) {
        const light = i.weaponPerk === PerkId.WEAPON_NIGHT_SIGHT ? 65536 : i.targetLightIntensity
        if (light <= 26214) {toHit -= 40}
        else if (light <= 39321) {toHit -= 25}
        else if (light <= 52428) {toHit -= 10}
    }

    toHit += i.scriptAccuracyBonus ?? 0

    if (i.attackerBlind) {toHit -= 25}
    if (i.targetKnockedDownOrOut) {toHit += 40}

    if (i.attackerIsHostileToPlayer) {
        if (i.combatDifficulty === 0) {toHit -= 20}
        else if (i.combatDifficulty === 2) {toHit += 20}
    }

    return i.hitChanceCap ? i.hitChanceCap(toHit) : Math.min(95, toHit)
}

/**
 * Critical chance handed to randomRoll for a single attack:
 * STAT_CRITICAL_CHANCE − hit_location_penalty (the full penalty, even for melee).
 */
export function attackCriticalChance(criticalChance: number, region: string): number {
    return criticalChance - hitLocationPenalty(region)
}

// ---------------------------------------------------------------------------
// Critical hits / failures
// ---------------------------------------------------------------------------

/** attackComputeCriticalHit: d100 + Better Criticals → effect row 0..5. */
export function criticalEffectLevel(roll: number, betterCriticals: number): number {
    const chance = roll + betterCriticals
    if (chance <= 20) {return 0}
    if (chance <= 45) {return 1}
    if (chance <= 70) {return 2}
    if (chance <= 90) {return 3}
    if (chance <= 100) {return 4}
    return 5
}

/** attackComputeCriticalFailure: d100 − 5×(LUK−5) → effect column 0..4. */
export function criticalFailureLevel(roll: number, luck: number): number {
    const chance = roll - 5 * (luck - 5)
    if (chance <= 20) {return 0}
    if (chance <= 50) {return 1}
    if (chance <= 75) {return 2}
    if (chance <= 95) {return 3}
    return 4
}

// ---------------------------------------------------------------------------
// Damage (attackComputeDamage, vanilla calculation)
// ---------------------------------------------------------------------------

export interface DamageInput {
    /** Weapon damage range; melee/unarmed callers add Melee Damage to max. */
    minDamage: number
    maxDamage: number
    /** Rounds that hit (1 for single attacks). */
    rounds: number
    /** Flat per-round bonus (player Bonus Ranged Damage: 2×rank). */
    damageBonus: number
    /** 2 = normal hit; critical table multipliers are 3..6 (×1.5..×3). */
    damageMultiplier: number
    ammoDamageMultiplier: number
    ammoDamageDivisor: number
    ammoDRModifier: number
    damageThreshold: number
    damageResistance: number
    /** Critical "bypass armor" flag (DT/DR at 20%; ignored for EMP). */
    bypassArmor: boolean
    isEmp: boolean
    /** Weapon Penetrate perk: DT at 20%. */
    penetrate: boolean
    /** Player Finesse trait: +30 DR (not with bypass). */
    finesse: boolean
    /** Combat difficulty damage modifier in percent (75 / 100 / 125). */
    difficultyPercent: number
    /** Flat additions after the per-round loop (Living Anatomy, Pyromaniac). */
    flatAfter: number
}

export function computeDamage(i: DamageInput, rng: Rng): number {
    let dt = i.damageThreshold
    let dr = i.damageResistance

    if (i.bypassArmor && !i.isEmp) {
        dt = idiv(20 * dt, 100)
        dr = idiv(20 * dr, 100)
    } else {
        if (i.penetrate) {dt = idiv(20 * dt, 100)}
        if (i.finesse) {dr += 30}
    }

    dr += i.ammoDRModifier
    dr = Math.max(0, Math.min(100, dr))

    const multiplier = i.damageMultiplier * i.ammoDamageMultiplier
    const divisor = i.ammoDamageDivisor

    let total = 0
    for (let n = 0; n < i.rounds; n++) {
        let damage = rng(i.minDamage, i.maxDamage)
        damage += i.damageBonus
        damage *= multiplier
        if (divisor !== 0) {damage = idiv(damage, divisor)}
        damage = idiv(damage, 2)
        damage = idiv(damage * i.difficultyPercent, 100)
        damage -= dt
        if (damage > 0) {damage -= idiv(damage * dr, 100)}
        if (damage > 0) {total += damage}
    }

    return total + i.flatAfter
}

/** Combat difficulty damage percent for attackers hostile to the player. */
export function difficultyDamagePercent(combatDifficulty: number, attackerIsHostileToPlayer: boolean): number {
    if (!attackerIsHostileToPlayer) {return 100}
    if (combatDifficulty === 0) {return 75}
    if (combatDifficulty === 2) {return 125}
    return 100
}

/**
 * Knockback distance in hexes for melee/unarmed/explosive hits on a
 * single-hex critter: damage / 10 (Knockback weapon perk: / 5); Stonewall
 * halves it and has already had its 50% chance to cancel it.
 */
export function knockbackDistance(damage: number, weaponPerk: number, stonewall: boolean, modify?: (value: number) => number): number {
    const divisor = weaponPerk === PerkId.WEAPON_KNOCKBACK ? 5 : 10
    // sfall CalcKnockbackMod: script modifiers act on damage / divisor before it is floored.
    let dist = modify ? Math.floor(modify(damage / divisor)) : idiv(damage, divisor)
    if (stonewall) {dist = idiv(dist, 2)}
    return dist
}

// ---------------------------------------------------------------------------
// Burst (_compute_spray)
// ---------------------------------------------------------------------------

export interface BurstSplit {
    /** Rounds rolled individually against the main target. */
    mainTargetRounds: number
    /** Remaining rounds sent down the centre line. */
    centerRounds: number
    leftRounds: number
    rightRounds: number
}

/** Vanilla burst split: thirds left/centre/right, half the centre at the target. */
export function splitBurstRounds(rounds: number): BurstSplit {
    let centerRounds = idiv(rounds, 3)
    if (centerRounds === 0) {centerRounds = 1}
    const leftRounds = idiv(rounds, 3)
    const rightRounds = rounds - centerRounds - leftRounds
    let mainTargetRounds = idiv(centerRounds, 2)
    if (mainTargetRounds === 0) {
        mainTargetRounds = 1
        centerRounds -= 1
    }
    return { mainTargetRounds, centerRounds, leftRounds, rightRounds }
}

// ---------------------------------------------------------------------------
// Action points (item.cc weaponGetActionPointCost, stat.cc)
// ---------------------------------------------------------------------------

export interface AttackApInput {
    isPlayer: boolean
    /** Proto AP cost for the hit mode; null when no weapon (unarmed punch: 3). */
    weaponApCost: number | null
    attackType: AttackType
    /** Weapon range for the hit mode (Fast Shot needs range > 2). */
    weaponRange: number
    fastShotTrait: boolean
    bonusHthAttacks: boolean
    bonusRateOfFire: boolean
    /** Called shot (+1 AP). */
    aiming: boolean
}

export function attackApCost(i: AttackApInput): number {
    let ap: number
    if (i.weaponApCost === null) {
        ap = 3
    } else {
        ap = i.weaponApCost
        if (i.isPlayer && i.fastShotTrait && i.weaponRange > 2) {ap -= 1}
    }

    if (i.isPlayer) {
        if (i.bonusHthAttacks && (i.attackType === 'melee' || i.attackType === 'unarmed')) {ap -= 1}
        if (i.bonusRateOfFire && i.attackType === 'ranged') {ap -= 1}
    }

    if (i.aiming) {ap += 1}
    return Math.max(1, ap)
}

/** Reload cost: 2 AP, 1 with the Fast Reload weapon perk. */
export function reloadApCost(weaponPerk: number): number {
    return weaponPerk === PerkId.WEAPON_FAST_RELOAD ? 1 : 2
}

/** Max-AP penalty for carrying more than the limit (stat.cc). */
export function overloadApPenalty(carryLimit: number, inventoryWeight: number): number {
    const remaining = carryLimit - inventoryWeight
    if (remaining >= 0) {return 0}
    return idiv(-remaining, 40) + 1
}

// ---------------------------------------------------------------------------
// Weapon attack type from the proto attack-mode nibble
// ---------------------------------------------------------------------------

/**
 * Proto attack modes (item.cc): 0 none, 1 punch, 2 kick, 3 swing, 4 thrust,
 * 5 throw, 6 fire single, 7 fire burst, 8 flame.
 */
export function attackTypeForMode(mode: number): AttackType {
    switch (mode) {
        case 1:
        case 2:
            return 'unarmed'
        case 3:
        case 4:
            return 'melee'
        case 5:
            return 'throw'
        case 6:
        case 7:
        case 8:
            return 'ranged'
        default:
            return 'unarmed'
    }
}
