/**
 * Fallout 2 combat arithmetic — expected values are worked by hand from the
 * engine source (fallout2-ce combat.cc / item.cc / random.cc).
 */

import { describe, expect, it } from 'vitest'
import { PerkId } from '../character/perkIds.js'
import {
    attackApCost,
    attackCriticalChance,
    computeDamage,
    computeToHit,
    criticalEffectLevel,
    criticalFailureLevel,
    difficultyDamagePercent,
    knockbackDistance,
    overloadApPenalty,
    randomRoll,
    reloadApCost,
    Roll,
    splitBurstRounds,
    type DamageInput,
    type Rng,
    type ToHitInput,
} from './fo2Formulas.js'

/** Rng that returns queued values (asserting they fit the requested range). */
function seq(...values: number[]): Rng {
    return (min, max) => {
        if (values.length === 0) {throw new Error('rng exhausted')}
        const v = values.shift()!
        if (v < min || v > max) {throw new Error(`rng value ${v} outside [${min}, ${max}]`)}
        return v
    }
}

function toHit(overrides: Partial<ToHitInput> = {}): ToHitInput {
    return {
        isPlayer: false,
        skill: 80,
        hasWeapon: true,
        attackType: 'ranged',
        weaponPerk: -1,
        weaponTwoHanded: false,
        weaponMinStrength: 0,
        perception: 5,
        strength: 5,
        sharpshooterRank: 0,
        weaponHandling: false,
        oneHanderTrait: false,
        distance: 10,
        crittersInLineOfFire: 0,
        targetAC: 0,
        ammoACModifier: 0,
        region: 'torso',
        targetMultihex: false,
        targetLightIntensity: 65536,
        attackerBlind: false,
        targetKnockedDownOrOut: false,
        combatDifficulty: 1,
        attackerIsHostileToPlayer: false,
        ...overrides,
    }
}

describe('computeToHit — range', () => {
    it('NPC: 4% per hex beyond PER×2', () => {
        // 10 − 5×2 = 0 → no modifier
        expect(computeToHit(toHit({ distance: 10 }))).toBe(80)
        // 15 − 10 = 5 → −20
        expect(computeToHit(toHit({ distance: 15 }))).toBe(60)
    })

    it('player suffers the engine\'s PER−2 range nerf', () => {
        // 10 − 2×(5−2) = 4 → −16
        expect(computeToHit(toHit({ isPlayer: true, distance: 10 }))).toBe(64)
    })

    it('close range is a bonus, capped at 2×PER hexes (×4)', () => {
        // NPC at 1 hex: 1 − 10 = −9 → +36, then the 95 cap
        expect(computeToHit(toHit({ skill: 40, distance: 1 }))).toBe(76)
        // Clamp: −2×PER = −10 → +40 max
        expect(computeToHit(toHit({ skill: 40, distance: 0, perception: 5 }))).toBe(80)
        expect(computeToHit(toHit({ skill: 90, distance: 1 }))).toBe(95)
    })

    it('Long Range perk multiplies PER by 4', () => {
        // 25 − 20 = 5 → −20
        expect(computeToHit(toHit({ weaponPerk: PerkId.WEAPON_LONG_RANGE, distance: 25 }))).toBe(60)
    })

    it('Scope Range perk: ×5 PER, but closer than 8 hexes is penalised', () => {
        // 30 − 25 = 5 → −20
        expect(computeToHit(toHit({ weaponPerk: PerkId.WEAPON_SCOPE_RANGE, distance: 30 }))).toBe(60)
        // 3 < 8 → 3 + 8 = 11 → −44
        expect(computeToHit(toHit({ weaponPerk: PerkId.WEAPON_SCOPE_RANGE, distance: 3 }))).toBe(36)
    })

    it('Sharpshooter adds +2 PER for the player', () => {
        // 10 − 2×(5+2−2) = 0
        expect(computeToHit(toHit({ isPlayer: true, sharpshooterRank: 1, distance: 10 }))).toBe(80)
    })

    it('blind attackers lose 12% per hex beyond range and a flat 25', () => {
        // perception already reduced to 0: 5 − 0 = 5 → ×−12 = −60, −25
        expect(computeToHit(toHit({ perception: 0, attackerBlind: true, distance: 5 }))).toBe(-5)
    })

    it('each critter in the line of fire costs 10%', () => {
        expect(computeToHit(toHit({ crittersInLineOfFire: 2 }))).toBe(60)
    })

    it('range-less checks treat distance as 0 and ignore blockers', () => {
        // 0 − 10 → +40 (the engine still adds a positive modifier)
        expect(computeToHit(toHit({ skill: 40, distance: null, crittersInLineOfFire: 3 }))).toBe(80)
    })

    it('melee attacks never get range modifiers', () => {
        expect(computeToHit(toHit({ attackType: 'melee', distance: 1 }))).toBe(80)
    })
})

describe('computeToHit — weapon, target and environment', () => {
    it('One Hander: +20 one-handed / −40 two-handed (player only)', () => {
        expect(computeToHit(toHit({ skill: 60, isPlayer: true, oneHanderTrait: true, distance: 6 }))).toBe(80)
        expect(computeToHit(toHit({ isPlayer: true, oneHanderTrait: true, weaponTwoHanded: true, distance: 6 }))).toBe(40)
        expect(computeToHit(toHit({ oneHanderTrait: true, weaponTwoHanded: true }))).toBe(80)
    })

    it('−20 per point of Strength below the weapon minimum; Weapon Handling gives 3', () => {
        expect(computeToHit(toHit({ weaponMinStrength: 7, strength: 5 }))).toBe(40)
        expect(computeToHit(toHit({ isPlayer: true, distance: 6, weaponMinStrength: 7, strength: 5, weaponHandling: true }))).toBe(80)
    })

    it('Accurate weapon perk adds 20', () => {
        expect(computeToHit(toHit({ skill: 50, weaponPerk: PerkId.WEAPON_ACCURATE }))).toBe(70)
    })

    it('AC plus ammo AC modifier, never below zero', () => {
        expect(computeToHit(toHit({ targetAC: 20, ammoACModifier: -5 }))).toBe(65)
        expect(computeToHit(toHit({ targetAC: 5, ammoACModifier: -10 }))).toBe(80)
        expect(computeToHit(toHit({ targetAC: null }))).toBe(80)
    })

    it('called-shot penalty: full for ranged, halved for melee and unarmed', () => {
        expect(computeToHit(toHit({ region: 'eyes' }))).toBe(20)
        expect(computeToHit(toHit({ attackType: 'melee', region: 'eyes' }))).toBe(50)
        expect(computeToHit(toHit({ hasWeapon: false, attackType: 'unarmed', region: 'head' }))).toBe(60)
    })

    it('multihex targets are 15% easier; knocked-down targets 40%', () => {
        expect(computeToHit(toHit({ skill: 50, targetMultihex: true }))).toBe(65)
        expect(computeToHit(toHit({ skill: 50, targetKnockedDownOrOut: true }))).toBe(90)
    })

    it('darkness penalises only the player, in 40/25/10 bands', () => {
        const p = (light: number, perk = -1) =>
            computeToHit(toHit({ isPlayer: true, distance: 6, targetLightIntensity: light, weaponPerk: perk }))
        expect(p(0)).toBe(40)
        expect(p(26214)).toBe(40)
        expect(p(26215)).toBe(55)
        expect(p(39322)).toBe(70)
        expect(p(52429)).toBe(80)
        expect(p(0, PerkId.WEAPON_NIGHT_SIGHT)).toBe(80)
        expect(computeToHit(toHit({ targetLightIntensity: 0 }))).toBe(80)
    })

    it('difficulty shifts hostile attackers by ∓20', () => {
        expect(computeToHit(toHit({ attackerIsHostileToPlayer: true, combatDifficulty: 0 }))).toBe(60)
        expect(computeToHit(toHit({ attackerIsHostileToPlayer: true, combatDifficulty: 1 }))).toBe(80)
        expect(computeToHit(toHit({ attackerIsHostileToPlayer: true, combatDifficulty: 2 }))).toBe(95)
        expect(computeToHit(toHit({ attackerIsHostileToPlayer: false, combatDifficulty: 2 }))).toBe(80)
    })

    it('critical chance uses the full location penalty', () => {
        expect(attackCriticalChance(5, 'eyes')).toBe(65)
        expect(attackCriticalChance(5, 'torso')).toBe(5)
    })
})

describe('randomRoll', () => {
    it('a roll equal to the to-hit succeeds (delta 0)', () => {
        expect(randomRoll(50, 0, seq(50, 100)).roll).toBe(Roll.Success)
        expect(randomRoll(50, 0, seq(51, 100)).roll).toBe(Roll.Failure)
    })

    it('critical success on d100 ≤ delta/10 + crit chance', () => {
        // delta 40 → 4 + 5 = 9
        expect(randomRoll(90, 5, seq(50, 9)).roll).toBe(Roll.CriticalSuccess)
        expect(randomRoll(90, 5, seq(50, 10)).roll).toBe(Roll.Success)
    })

    it('critical failure on d100 ≤ −delta/10', () => {
        // delta −45 → 4
        expect(randomRoll(50, 0, seq(95, 4)).roll).toBe(Roll.CriticalFailure)
        expect(randomRoll(50, 0, seq(95, 5)).roll).toBe(Roll.Failure)
    })

    it('no criticals while they are suppressed (first game day)', () => {
        expect(randomRoll(90, 100, seq(1), false).roll).toBe(Roll.Success)
        expect(randomRoll(10, 0, seq(100), false).roll).toBe(Roll.Failure)
    })
})

describe('critical tables', () => {
    it('critical effect level uses 20/45/70/90/100 bands', () => {
        expect(criticalEffectLevel(20, 0)).toBe(0)
        expect(criticalEffectLevel(21, 0)).toBe(1)
        expect(criticalEffectLevel(45, 0)).toBe(1)
        expect(criticalEffectLevel(70, 0)).toBe(2)
        expect(criticalEffectLevel(90, 0)).toBe(3)
        expect(criticalEffectLevel(100, 0)).toBe(4)
        expect(criticalEffectLevel(90, 20)).toBe(5)
        // Heavy Handed: −30 Better Criticals
        expect(criticalEffectLevel(50, -30)).toBe(0)
    })

    it('critical failure level shifts 5 per point of Luck', () => {
        expect(criticalFailureLevel(20, 5)).toBe(0)
        expect(criticalFailureLevel(50, 5)).toBe(1)
        expect(criticalFailureLevel(75, 5)).toBe(2)
        expect(criticalFailureLevel(95, 5)).toBe(3)
        expect(criticalFailureLevel(96, 5)).toBe(4)
        expect(criticalFailureLevel(96, 10)).toBe(2)
        expect(criticalFailureLevel(1, 1)).toBe(1)
    })
})

function dmg(overrides: Partial<DamageInput> = {}): DamageInput {
    return {
        minDamage: 10,
        maxDamage: 10,
        rounds: 1,
        damageBonus: 0,
        damageMultiplier: 2,
        ammoDamageMultiplier: 1,
        ammoDamageDivisor: 1,
        ammoDRModifier: 0,
        damageThreshold: 0,
        damageResistance: 0,
        bypassArmor: false,
        isEmp: false,
        penetrate: false,
        finesse: false,
        difficultyPercent: 100,
        flatAfter: 0,
        ...overrides,
    }
}

describe('computeDamage', () => {
    it('normal hit: raw damage, then DT, then DR', () => {
        const rng = () => 10
        expect(computeDamage(dmg(), rng)).toBe(10)
        // 10 − 4 = 6; 6 − 6×25/100 (=1) = 5
        expect(computeDamage(dmg({ damageThreshold: 4, damageResistance: 25 }), rng)).toBe(5)
    })

    it('critical multiplier applies before armor', () => {
        // ×3 (DM 6): 10×6/2 = 30; −4 DT = 26; −26×25/100 (=6) = 20
        expect(computeDamage(dmg({ damageMultiplier: 6, damageThreshold: 4, damageResistance: 25 }), () => 10)).toBe(20)
    })

    it('ammo multiplier/divisor and DR modifier (JHP: 2/1, DR −35)', () => {
        // 10×2×2/1/2 = 20; DR 30−35 → 0
        expect(computeDamage(dmg({ ammoDamageMultiplier: 2, damageResistance: 30, ammoDRModifier: -35 }), () => 10)).toBe(20)
    })

    it('bonus damage is added per round before multipliers', () => {
        expect(computeDamage(dmg({ damageBonus: 4 }), () => 10)).toBe(14)
        expect(computeDamage(dmg({ damageBonus: 2, rounds: 3 }), () => 10)).toBe(36)
    })

    it('bypass armor uses 20% of DT and DR; Penetrate 20% of DT', () => {
        expect(computeDamage(dmg({ bypassArmor: true, damageThreshold: 10, damageResistance: 50 }), () => 10)).toBe(8 - Math.trunc(8 * 10 / 100))
        expect(computeDamage(dmg({ penetrate: true, damageThreshold: 10 }), () => 10)).toBe(8)
        // EMP ignores bypass
        expect(computeDamage(dmg({ bypassArmor: true, isEmp: true, damageThreshold: 5 }), () => 10)).toBe(5)
    })

    it('Finesse adds 30 DR', () => {
        expect(computeDamage(dmg({ finesse: true }), () => 10)).toBe(7)
    })

    it('difficulty percent scales damage before armor', () => {
        expect(computeDamage(dmg({ difficultyPercent: 75 }), () => 10)).toBe(7)
        expect(computeDamage(dmg({ difficultyPercent: 125 }), () => 10)).toBe(12)
        expect(difficultyDamagePercent(0, true)).toBe(75)
        expect(difficultyDamagePercent(2, true)).toBe(125)
        expect(difficultyDamagePercent(0, false)).toBe(100)
    })

    it('rounds stopped by armor deal nothing, but flat bonuses still apply', () => {
        expect(computeDamage(dmg({ damageThreshold: 50 }), () => 10)).toBe(0)
        expect(computeDamage(dmg({ damageThreshold: 50, flatAfter: 5 }), () => 10)).toBe(5)
    })

    it('rolls damage once per round within [min, max]', () => {
        expect(computeDamage(dmg({ minDamage: 1, maxDamage: 6, rounds: 3 }), seq(1, 6, 3))).toBe(10)
    })
})

describe('burst, AP and knockback', () => {
    it('splits bursts into thirds with half the centre on the target', () => {
        expect(splitBurstRounds(10)).toEqual({ mainTargetRounds: 1, centerRounds: 3, leftRounds: 3, rightRounds: 4 })
        expect(splitBurstRounds(30)).toEqual({ mainTargetRounds: 5, centerRounds: 10, leftRounds: 10, rightRounds: 10 })
        expect(splitBurstRounds(1)).toEqual({ mainTargetRounds: 1, centerRounds: 0, leftRounds: 0, rightRounds: 0 })
    })

    it('attack AP: weapon cost, punch 3, perks/traits −1, aimed +1, min 1', () => {
        const base = { isPlayer: true, weaponApCost: 5, attackType: 'ranged' as const, weaponRange: 20, fastShotTrait: false, bonusHthAttacks: false, bonusRateOfFire: false, aiming: false }
        expect(attackApCost(base)).toBe(5)
        expect(attackApCost({ ...base, aiming: true })).toBe(6)
        expect(attackApCost({ ...base, fastShotTrait: true })).toBe(4)
        expect(attackApCost({ ...base, fastShotTrait: true, weaponRange: 2 })).toBe(5)
        expect(attackApCost({ ...base, bonusRateOfFire: true })).toBe(4)
        expect(attackApCost({ ...base, isPlayer: false, fastShotTrait: true, bonusRateOfFire: true })).toBe(5)
        expect(attackApCost({ ...base, weaponApCost: null, attackType: 'unarmed', weaponRange: 1 })).toBe(3)
        expect(attackApCost({ ...base, weaponApCost: 3, attackType: 'melee', bonusHthAttacks: true })).toBe(2)
        expect(attackApCost({ ...base, weaponApCost: 1, attackType: 'melee', bonusHthAttacks: true })).toBe(1)
    })

    it('reload costs 2 AP (1 with Fast Reload)', () => {
        expect(reloadApCost(-1)).toBe(2)
        expect(reloadApCost(PerkId.WEAPON_FAST_RELOAD)).toBe(1)
    })

    it('overloaded critters lose 1 AP plus 1 per 40 lbs over', () => {
        expect(overloadApPenalty(150, 150)).toBe(0)
        expect(overloadApPenalty(150, 151)).toBe(1)
        expect(overloadApPenalty(150, 190)).toBe(2)
    })

    it('knockback is damage/10 hexes (/5 with Knockback perk), halved by Stonewall', () => {
        expect(knockbackDistance(25, -1, false)).toBe(2)
        expect(knockbackDistance(25, PerkId.WEAPON_KNOCKBACK, false)).toBe(5)
        expect(knockbackDistance(25, -1, true)).toBe(1)
    })
})
