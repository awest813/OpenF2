/**
 * Fallout damage formula and armor/DT/DR system.
 *
 * This is the canonical implementation of the Fallout 1 & 2 damage pipeline.
 * It replaces the simplified damage logic in critter.ts and combat.ts.
 *
 * Reference: Fallout 2 technical specification, DAMAGEDESC structure in
 * fallout2.exe, and the Fallout wiki damage formula article.
 *
 * Pipeline:
 *   1. Roll base damage from weapon (min–max dice)
 *   2. Apply ammo multiplier / divisor
 *   3. Subtract target's Damage Threshold (DT) for the damage type
 *   4. Multiply by attacker's bonus damage modifier (perks, etc.)
 *   5. Multiply by (1 - DR%) for the damage type
 *   6. Apply critical hit bonus damage / multiplier
 *   7. Clamp to [0, ∞)
 */

import { DamageStats } from '../ecs/components.js'
import { EventBus, DamageType } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Damage type helpers
// ---------------------------------------------------------------------------

export const DAMAGE_TYPES: DamageType[] = [
    'normal', 'fire', 'plasma', 'laser', 'explosive', 'electrical', 'emp',
]

export function dtForType(stats: DamageStats, type: DamageType): number {
    return stats[type]
}

export function drForType(stats: DamageStats, type: DamageType): number {
    return stats[type]
}

// ---------------------------------------------------------------------------
// Weapon definition (extracted from PRO file)
// ---------------------------------------------------------------------------

export interface WeaponStats {
    minDamage: number
    maxDamage: number
    damageType: DamageType
    /** AP cost for a single attack. */
    apCostSingle: number
    /** AP cost for a burst attack. */
    apCostBurst: number
    /** Minimum hex range (0 for melee). */
    minRange: number
    /** Maximum hex range. */
    maxRange: number
    /** Number of rounds per burst (-1 = no burst). */
    burstRounds: number
    /** Ammo type PID this weapon uses. */
    ammoTypePid: number
    /** Maximum ammo capacity. */
    ammoCapacity: number
}

// ---------------------------------------------------------------------------
// Ammo definition (extracted from PRO file)
// ---------------------------------------------------------------------------

export interface AmmoStats {
    pid: number
    /** Damage multiplier numerator (applied to rolled damage). */
    damageMultiplier: number
    /** Damage multiplier denominator. */
    damageDivisor: number
    /** AC modifier (negative = easier to hit). */
    acModifier: number
    /** DR modifier (percentage points subtracted from target's DR). */
    drModifier: number
}

export const DEFAULT_AMMO: AmmoStats = {
    pid: -1,
    damageMultiplier: 1,
    damageDivisor: 1,
    acModifier: 0,
    drModifier: 0,
}

// ---------------------------------------------------------------------------
// Attack descriptor
// ---------------------------------------------------------------------------

export interface AttackDescriptor {
    attackerId: number
    targetId: number
    weapon: WeaponStats
    ammo: AmmoStats
    /** Skill level of attacker for this weapon type (0–300). */
    attackerSkill: number
    /** Target's effective AC (after ammo AC modifier). */
    targetAC: number
    /** Target's DT per damage type. */
    targetDT: DamageStats
    /** Target's DR per damage type (0–100%). */
    targetDR: DamageStats
    /** Hit location (for called shots). */
    hitLocation: HitLocation
    /** Whether this is a critical hit. */
    isCritical: boolean
    /** Critical hit multiplier (1.0 = normal). */
    criticalMultiplier: number
    /** Bonus damage from perks/traits (flat). */
    bonusDamage: number
}

export type HitLocation =
    | 'torso' | 'head' | 'eyes' | 'groin' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg'

// ---------------------------------------------------------------------------
// Hit/miss resolution
// ---------------------------------------------------------------------------

export interface ToHitResult {
    hit: boolean
    roll: number
    threshold: number
}

/**
 * Compute the to-hit percentage for an attack.
 *
 * Fallout 2 formula (simplified):
 *   toHit% = skillLevel + 0 (flat) - targetAC - ammoACMod - hitLocationPenalty
 */
export function computeToHitChance(
    attackerSkill: number,
    targetAC: number,
    ammoACMod: number,
    hitLocation: HitLocation,
): number {
    const locationPenalty = HIT_LOCATION_PENALTY[hitLocation] ?? 0
    const chance = attackerSkill - targetAC - ammoACMod - locationPenalty
    return Math.max(5, Math.min(95, chance))  // clamp 5–95%
}

export const HIT_LOCATION_PENALTY: Record<HitLocation, number> = {
    torso:      0,
    head:      40,
    eyes:      60,
    groin:     30,
    left_arm:  20,
    right_arm: 20,
    left_leg:  20,
    right_leg: 20,
}

export function rollToHit(toHitChance: number): ToHitResult {
    const roll = Math.floor(Math.random() * 100) + 1
    return { hit: roll <= toHitChance, roll, threshold: toHitChance }
}

// ---------------------------------------------------------------------------
// Damage calculation
// ---------------------------------------------------------------------------

export interface DamageResult {
    rawRoll: number         // Dice roll before any modifiers
    afterAmmo: number       // After ammo multiplier/divisor
    afterDT: number         // After subtracting DT
    finalDamage: number     // After DR, bonuses, critical multiplier
    damageType: DamageType
}

/**
 * Roll and compute final damage for a single attack.
 *
 * The Fallout damage formula:
 *   raw    = roll(minDmg, maxDmg)
 *   ammo   = floor(raw × ammoDmgMult / ammoDmgDiv)
 *   postDT = max(0, ammo - DT[type])
 *   postDR = floor(postDT × (1 - DR[type]/100))
 *   final  = max(1, floor((postDR + bonusDamage) × critMult))
 */
export function calculateDamage(attack: AttackDescriptor): DamageResult {
    const { weapon, ammo, targetDT, targetDR } = attack
    const type = weapon.damageType

    // Step 1: roll base damage
    const rawRoll = rollDice(weapon.minDamage, weapon.maxDamage)

    // Step 2: apply ammo multiplier
    const afterAmmo = Math.floor(rawRoll * ammo.damageMultiplier / Math.max(1, ammo.damageDivisor))

    // Step 3: subtract DT
    const dtValue = dtForType(targetDT, type)
    const afterDT = Math.max(0, afterAmmo - dtValue)

    // Step 4: apply DR
    const drPercent = Math.max(0, drForType(targetDR, type) + ammo.drModifier)
    const afterDR = Math.floor(afterDT * (1 - Math.min(100, drPercent) / 100))

    // Step 5: bonus damage + critical multiplier
    const withBonus = afterDR + attack.bonusDamage
    const finalDamage = Math.max(1, Math.floor(withBonus * attack.criticalMultiplier))

    return { rawRoll, afterAmmo, afterDT, finalDamage, damageType: type }
}

function rollDice(min: number, max: number): number {
    if (min >= max) {return min}
    return min + Math.floor(Math.random() * (max - min + 1))
}

// ---------------------------------------------------------------------------
// Critical hit table
// ---------------------------------------------------------------------------

export interface CriticalEffect {
    damageMultiplier: number  // e.g. 2.0 for double damage
    knockback: boolean
    knockout: boolean
    knockdown: boolean
    blinds: boolean
    cripplesLimb: HitLocation | null
    instantKill: boolean
    /** Descriptive message key. */
    messageKey: string
}

export const DEFAULT_CRIT: CriticalEffect = {
    damageMultiplier: 1,
    knockback: false,
    knockout: false,
    knockdown: false,
    blinds: false,
    cripplesLimb: null,
    instantKill: false,
    messageKey: 'crit_generic',
}

/**
 * Determine whether an attack is a critical hit.
 * Uses attacker's Critical Chance stat plus any location modifier.
 */
export function rollCritical(critChance: number, hitLocation: HitLocation): boolean {
    const locationBonus = CRIT_LOCATION_BONUS[hitLocation] ?? 0
    const effectiveChance = Math.max(0, Math.min(100, critChance + locationBonus))
    return Math.floor(Math.random() * 100) + 1 <= effectiveChance
}

export const CRIT_LOCATION_BONUS: Record<HitLocation, number> = {
    torso:      0,
    head:      20,
    eyes:      40,
    groin:     20,
    left_arm:   0,
    right_arm:  0,
    left_leg:   0,
    right_leg:  0,
}

// ---------------------------------------------------------------------------
// Armor equip helpers
// ---------------------------------------------------------------------------

/**
 * Merge armor DT/DR stats into an entity's StatsComponent.
 * Call on equip (add armor values) and unequip (subtract them).
 */
export function applyArmorStats(
    targetDT: DamageStats,
    targetDR: DamageStats,
    armorDT: DamageStats,
    armorDR: DamageStats,
    sign: 1 | -1,
): void {
    for (const type of DAMAGE_TYPES) {
        targetDT[type] += sign * armorDT[type]
        targetDR[type] += sign * armorDR[type]
        // Also accumulate AC bonus stored separately by caller
    }
}
