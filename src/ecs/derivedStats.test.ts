/**
 * Regression tests for ECS derived stats computation.
 *
 * These tests pin the Fallout 2 SPECIAL formulae so regressions in
 * recomputeDerivedStats or computeBaseSkills are caught immediately.
 */

import { describe, it, expect } from 'vitest'
import {
    effectiveStat,
    recomputeDerivedStats,
    computeBaseSkills,
    skillPointsPerLevel,
    xpForLevel,
} from './derivedStats.js'
import { StatsComponent, zeroDamageStats } from './components.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<Omit<StatsComponent, 'componentType'>> = {}): StatsComponent {
    const s: StatsComponent = {
        componentType: 'stats',
        strength: 5, perception: 5, endurance: 5,
        charisma: 5, intelligence: 5, agility: 5, luck: 5,
        strengthMod: 0, perceptionMod: 0, enduranceMod: 0,
        charismaMod: 0, intelligenceMod: 0, agilityMod: 0, luckMod: 0, maxAPMod: 0,
        maxHp: 0, currentHp: 0, maxAP: 0,
        armorClass: 0, carryWeight: 0, meleeDamage: 0,
        damageResistance: 0, poisonResistance: 0, radiationResistance: 0,
        sequence: 0, healingRate: 0, criticalChance: 0,
        level: 1, xp: 0, xpToNextLevel: 1000,
        dt: zeroDamageStats(), dr: zeroDamageStats(),
        ...overrides,
    }
    recomputeDerivedStats(s)
    s.currentHp = s.maxHp
    return s
}

// ---------------------------------------------------------------------------
// effectiveStat
// ---------------------------------------------------------------------------

describe('effectiveStat', () => {
    it('returns base + mod when in range', () => {
        expect(effectiveStat(5, 2)).toBe(7)
    })

    it('clamps to minimum of 1', () => {
        expect(effectiveStat(1, -5)).toBe(1)
    })

    it('clamps to maximum of 10', () => {
        expect(effectiveStat(9, 5)).toBe(10)
    })

    it('returns base when mod is 0', () => {
        expect(effectiveStat(7, 0)).toBe(7)
    })
})

// ---------------------------------------------------------------------------
// recomputeDerivedStats — Fallout 2 formulae
// ---------------------------------------------------------------------------

describe('recomputeDerivedStats', () => {
    it('computes max AP as 5 + ceil(AGI/2)', () => {
        const s = makeStats({ agility: 6 })
        expect(s.maxAP).toBe(5 + Math.ceil(6 / 2))  // 8
    })

    it('computes armor class equal to AGI (unarmored)', () => {
        const s = makeStats({ agility: 7 })
        expect(s.armorClass).toBe(7)
    })

    it('computes carry weight as 25 + 25 * STR', () => {
        const s = makeStats({ strength: 6 })
        expect(s.carryWeight).toBe(25 + 25 * 6)  // 175
    })

    it('computes melee damage as max(1, STR - 5)', () => {
        expect(makeStats({ strength: 7 }).meleeDamage).toBe(2)
        // STR 3: max(1, 3-5) = 1
        expect(makeStats({ strength: 3 }).meleeDamage).toBe(1)
    })

    it('computes sequence as 2 * PER', () => {
        const s = makeStats({ perception: 8 })
        expect(s.sequence).toBe(16)
    })

    it('computes healing rate as max(1, floor(END/3))', () => {
        expect(makeStats({ endurance: 3 }).healingRate).toBe(1)
        expect(makeStats({ endurance: 6 }).healingRate).toBe(2)
        expect(makeStats({ endurance: 9 }).healingRate).toBe(3)
    })

    it('computes critical chance equal to LUK', () => {
        const s = makeStats({ luck: 7 })
        expect(s.criticalChance).toBe(7)
    })

    it('computes max HP using 15 + STR + 2*END at level 1', () => {
        const s = makeStats({ strength: 6, endurance: 6 })
        // Level 1 HP: 15 + STR + 2*END
        expect(s.maxHp).toBe(15 + 6 + 12)  // 33
    })

    it('incorporates level into max HP', () => {
        const s = makeStats({ endurance: 5, level: 3 })
        // hpFromLevels = (3-1) * (2 + floor(5/2)) = 2 * 4 = 8
        const base = 15 + 5 + 2 * 5  // 30
        expect(s.maxHp).toBe(base + 8)  // 38
    })

    it('does not let currentHp exceed maxHp on recompute', () => {
        const s = makeStats()
        s.currentHp = s.maxHp + 100
        recomputeDerivedStats(s)
        expect(s.currentHp).toBeLessThanOrEqual(s.maxHp)
    })

    it('applies stat modifiers before computing derived values', () => {
        const s = makeStats({ agility: 5, agilityMod: 2 })  // effective AGI = 7
        expect(s.maxAP).toBe(5 + Math.ceil(7 / 2))  // 9
    })
})

// ---------------------------------------------------------------------------
// computeBaseSkills
// ---------------------------------------------------------------------------

describe('computeBaseSkills', () => {
    it('computes small guns as 5 + 4*AGI', () => {
        const s = makeStats({ agility: 6 })
        const skills = computeBaseSkills(s)
        expect(skills.smallGuns).toBe(5 + 4 * 6)  // 29
    })

    it('computes unarmed as 30 + 2*(AGI+STR)', () => {
        const s = makeStats({ agility: 6, strength: 7 })
        const skills = computeBaseSkills(s)
        expect(skills.unarmed).toBe(30 + 2 * (6 + 7))  // 56
    })

    it('computes speech as 5 * CHA', () => {
        const s = makeStats({ charisma: 8 })
        const skills = computeBaseSkills(s)
        expect(skills.speech).toBe(40)
    })

    it('computes science as 4 * INT', () => {
        const s = makeStats({ intelligence: 7 })
        const skills = computeBaseSkills(s)
        expect(skills.science).toBe(28)
    })

    it('computes gambling as 5 * LUK', () => {
        const s = makeStats({ luck: 6 })
        const skills = computeBaseSkills(s)
        expect(skills.gambling).toBe(30)
    })
})

// ---------------------------------------------------------------------------
// skillPointsPerLevel
// ---------------------------------------------------------------------------

describe('skillPointsPerLevel', () => {
    it('returns 5 + 2*INT points per level', () => {
        expect(skillPointsPerLevel(5)).toBe(15)
        expect(skillPointsPerLevel(8)).toBe(21)
        expect(skillPointsPerLevel(1)).toBe(7)
    })
})

// ---------------------------------------------------------------------------
// xpForLevel
// ---------------------------------------------------------------------------

describe('xpForLevel', () => {
    it('returns 0 for level 1', () => {
        expect(xpForLevel(1)).toBe(0)
    })

    it('returns 1000 for level 2', () => {
        expect(xpForLevel(2)).toBe(1000)
    })

    it('returns cumulative XP for higher levels', () => {
        // Level 3: 1000 (for L2) + 2000 (for L3) = 3000
        expect(xpForLevel(3)).toBe(3000)
        // Level 4: 3000 + 3000 = 6000
        expect(xpForLevel(4)).toBe(6000)
    })
})
