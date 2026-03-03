/**
 * Regression tests for the Fallout damage formula and armor/DT/DR pipeline.
 *
 * We seed Math.random with deterministic values where needed via vi.spyOn
 * so that stochastic paths are exercised predictably.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    computeToHitChance,
    calculateDamage,
    rollCritical,
    applyArmorStats,
    HIT_LOCATION_PENALTY,
    CRIT_LOCATION_BONUS,
    DEFAULT_AMMO,
    AttackDescriptor,
    WeaponStats,
} from './damageFormula.js'
import { zeroDamageStats, DamageStats } from '../ecs/components.js'

afterEach(() => {
    vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeWeapon(overrides: Partial<WeaponStats> = {}): WeaponStats {
    return {
        minDamage: 5,
        maxDamage: 10,
        damageType: 'normal',
        apCostSingle: 4,
        apCostBurst: 6,
        minRange: 0,
        maxRange: 10,
        burstRounds: -1,
        ammoTypePid: -1,
        ammoCapacity: 0,
        ...overrides,
    }
}

function makeAttack(overrides: Partial<AttackDescriptor> = {}): AttackDescriptor {
    return {
        attackerId: 1,
        targetId: 2,
        weapon: makeWeapon(),
        ammo: { ...DEFAULT_AMMO },
        attackerSkill: 60,
        targetAC: 10,
        targetDT: zeroDamageStats(),
        targetDR: zeroDamageStats(),
        hitLocation: 'torso',
        isCritical: false,
        criticalMultiplier: 1,
        bonusDamage: 0,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// computeToHitChance
// ---------------------------------------------------------------------------

describe('computeToHitChance', () => {
    it('uses skill - AC as base chance', () => {
        expect(computeToHitChance(60, 10, 0, 'torso')).toBe(50)
    })

    it('applies hit-location penalty', () => {
        const headPenalty = HIT_LOCATION_PENALTY['head']  // 40
        expect(computeToHitChance(60, 0, 0, 'head')).toBe(60 - headPenalty)  // 20
    })

    it('applies ammo AC modifier', () => {
        // ammoACMod reduces the to-hit (subtracts from skill side)
        expect(computeToHitChance(60, 0, 10, 'torso')).toBe(50)
    })

    it('clamps to minimum 5%', () => {
        expect(computeToHitChance(0, 100, 0, 'torso')).toBe(5)
    })

    it('clamps to maximum 95%', () => {
        expect(computeToHitChance(300, 0, 0, 'torso')).toBe(95)
    })

    it('applies eyes penalty (-60)', () => {
        expect(HIT_LOCATION_PENALTY['eyes']).toBe(60)
        // eyes at full skill with no AC: 100 - 60 = 40
        expect(computeToHitChance(100, 0, 0, 'eyes')).toBe(40)
    })
})

// ---------------------------------------------------------------------------
// HIT_LOCATION_PENALTY and CRIT_LOCATION_BONUS tables
// ---------------------------------------------------------------------------

describe('HIT_LOCATION_PENALTY', () => {
    it('torso has no penalty', () => {
        expect(HIT_LOCATION_PENALTY['torso']).toBe(0)
    })

    it('eyes have the largest penalty', () => {
        const penalties = Object.values(HIT_LOCATION_PENALTY)
        expect(HIT_LOCATION_PENALTY['eyes']).toBe(Math.max(...penalties))
    })
})

describe('CRIT_LOCATION_BONUS', () => {
    it('torso has no bonus', () => {
        expect(CRIT_LOCATION_BONUS['torso']).toBe(0)
    })

    it('eyes have the highest crit bonus', () => {
        const bonuses = Object.values(CRIT_LOCATION_BONUS)
        expect(CRIT_LOCATION_BONUS['eyes']).toBe(Math.max(...bonuses))
    })
})

// ---------------------------------------------------------------------------
// calculateDamage
// ---------------------------------------------------------------------------

describe('calculateDamage', () => {
    it('respects DT: subtracts DT from rolled damage before DR', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // min roll → 5
        const targetDT = zeroDamageStats()
        targetDT.normal = 3
        const result = calculateDamage(makeAttack({ targetDT }))
        // rawRoll=5, afterAmmo=5, afterDT=max(0,5-3)=2, afterDR=2, final=max(1,2)=2
        expect(result.afterDT).toBe(2)
        expect(result.rawRoll).toBe(5)
    })

    it('respects DR: reduces damage proportionally', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // min roll → 5
        const targetDR = zeroDamageStats()
        targetDR.normal = 50  // 50% DR
        const result = calculateDamage(makeAttack({ targetDR }))
        // rawRoll=5, afterAmmo=5, afterDT=5, afterDR=floor(5*0.5)=2, final=max(1,2)=2
        expect(result.finalDamage).toBe(2)
    })

    it('applies ammo damage multiplier', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll min (5)
        const ammo = { ...DEFAULT_AMMO, damageMultiplier: 2, damageDivisor: 1 }
        const result = calculateDamage(makeAttack({ ammo }))
        // rawRoll=5, afterAmmo=floor(5*2/1)=10
        expect(result.afterAmmo).toBe(10)
    })

    it('applies ammo damage divisor', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // min roll (5)
        const ammo = { ...DEFAULT_AMMO, damageMultiplier: 1, damageDivisor: 2 }
        const result = calculateDamage(makeAttack({ ammo }))
        // afterAmmo = floor(5*1/2) = 2
        expect(result.afterAmmo).toBe(2)
    })

    it('applies critical multiplier to final damage', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll min (5)
        const result = calculateDamage(makeAttack({ criticalMultiplier: 2 }))
        // rawRoll=5, afterAmmo=5, afterDT=5, afterDR=5, withBonus=5, final=floor(5*2)=10
        expect(result.finalDamage).toBe(10)
    })

    it('adds bonus damage before applying critical multiplier', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll min (5)
        const result = calculateDamage(makeAttack({ bonusDamage: 5, criticalMultiplier: 2 }))
        // withBonus = 5 + 5 = 10, final = floor(10 * 2) = 20
        expect(result.finalDamage).toBe(20)
    })

    it('never returns less than 1 damage', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const targetDT = zeroDamageStats()
        targetDT.normal = 999  // absorb all damage
        const targetDR = zeroDamageStats()
        targetDR.normal = 100
        const result = calculateDamage(makeAttack({ targetDT, targetDR }))
        expect(result.finalDamage).toBe(1)
    })

    it('reports the correct damage type', () => {
        const weapon = makeWeapon({ damageType: 'fire' })
        const result = calculateDamage(makeAttack({ weapon }))
        expect(result.damageType).toBe('fire')
    })

    it('applies DR only for the matching damage type', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll min (5)
        const targetDR = zeroDamageStats()
        targetDR.fire = 100  // 100% fire DR — should NOT affect normal damage
        const result = calculateDamage(makeAttack({ targetDR }))  // weapon is normal
        expect(result.finalDamage).toBeGreaterThan(1)
    })
})

// ---------------------------------------------------------------------------
// rollCritical
// ---------------------------------------------------------------------------

describe('rollCritical', () => {
    it('returns true when roll is within critChance', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)  // roll = 1
        expect(rollCritical(10, 'torso')).toBe(true)
    })

    it('returns false when roll exceeds critChance', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)  // roll = 100
        expect(rollCritical(10, 'torso')).toBe(false)
    })

    it('adds location bonus before rolling', () => {
        // eyes have +40 crit bonus; with critChance=1 the effective chance is 41
        vi.spyOn(Math, 'random').mockReturnValue(0.4)  // roll = 41
        expect(rollCritical(1, 'eyes')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// applyArmorStats
// ---------------------------------------------------------------------------

describe('applyArmorStats', () => {
    it('adds armor DT/DR on equip (sign = +1)', () => {
        const targetDT = zeroDamageStats()
        const targetDR = zeroDamageStats()
        const armorDT: DamageStats = { ...zeroDamageStats(), normal: 5, fire: 2 }
        const armorDR: DamageStats = { ...zeroDamageStats(), normal: 20, laser: 30 }

        applyArmorStats(targetDT, targetDR, armorDT, armorDR, 1)

        expect(targetDT.normal).toBe(5)
        expect(targetDT.fire).toBe(2)
        expect(targetDR.normal).toBe(20)
        expect(targetDR.laser).toBe(30)
    })

    it('subtracts armor DT/DR on unequip (sign = -1)', () => {
        const targetDT: DamageStats = { ...zeroDamageStats(), normal: 5 }
        const targetDR: DamageStats = { ...zeroDamageStats(), normal: 20 }
        const armorDT: DamageStats = { ...zeroDamageStats(), normal: 5 }
        const armorDR: DamageStats = { ...zeroDamageStats(), normal: 20 }

        applyArmorStats(targetDT, targetDR, armorDT, armorDR, -1)

        expect(targetDT.normal).toBe(0)
        expect(targetDR.normal).toBe(0)
    })

    it('does not modify unrelated damage types', () => {
        const targetDT = zeroDamageStats()
        const targetDR = zeroDamageStats()
        const armorDT: DamageStats = { ...zeroDamageStats(), normal: 4 }
        const armorDR: DamageStats = { ...zeroDamageStats(), normal: 10 }

        applyArmorStats(targetDT, targetDR, armorDT, armorDR, 1)

        expect(targetDT.fire).toBe(0)
        expect(targetDR.laser).toBe(0)
    })
})
