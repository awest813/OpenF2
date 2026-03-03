/**
 * Regression tests for character leveling, skill-point spending, and perk/trait application.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getSkillPointCost, spendSkillPoint, awardXP } from './leveling.js'
import { grantPerk, isPerkAvailable, PERKS, PERK_MAP } from './perks.js'
import { applyTraits, removeTraits, TRAITS, TRAIT_MAP } from './traits.js'
import { StatsComponent, SkillsComponent, zeroDamageStats } from '../ecs/components.js'
import { recomputeDerivedStats, computeBaseSkills } from '../ecs/derivedStats.js'

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

function makeSkills(stats: StatsComponent): SkillsComponent {
    const base = computeBaseSkills(stats)
    return {
        componentType: 'skills',
        ...base,
        tagged: new Set(),
        availablePoints: 0,
    }
}

// ---------------------------------------------------------------------------
// getSkillPointCost
// ---------------------------------------------------------------------------

describe('getSkillPointCost', () => {
    it('costs 1 point for skills below 100 (untagged)', () => {
        expect(getSkillPointCost(50, false)).toBe(1)
        expect(getSkillPointCost(99, false)).toBe(1)
    })

    it('costs 2 points for skills 100-124', () => {
        expect(getSkillPointCost(100, false)).toBe(2)
        expect(getSkillPointCost(124, false)).toBe(2)
    })

    it('costs 3 points for skills 125-149', () => {
        expect(getSkillPointCost(125, false)).toBe(3)
        expect(getSkillPointCost(149, false)).toBe(3)
    })

    it('halves cost for tagged skills (ceil)', () => {
        expect(getSkillPointCost(50, true)).toBe(1)   // ceil(1/2) = 1
        expect(getSkillPointCost(100, true)).toBe(1)  // ceil(2/2) = 1
        expect(getSkillPointCost(125, true)).toBe(2)  // ceil(3/2) = 2
    })
})

// ---------------------------------------------------------------------------
// spendSkillPoint
// ---------------------------------------------------------------------------

describe('spendSkillPoint', () => {
    let stats: StatsComponent
    let skills: SkillsComponent

    beforeEach(() => {
        stats = makeStats()
        skills = makeSkills(stats)
        skills.availablePoints = 10
    })

    it('raises the skill by 1 on success', () => {
        const before = skills.smallGuns
        spendSkillPoint(stats, skills, 'smallGuns')
        expect(skills.smallGuns).toBe(before + 1)
    })

    it('deducts the skill point cost', () => {
        const before = skills.availablePoints
        spendSkillPoint(stats, skills, 'smallGuns')
        expect(skills.availablePoints).toBe(before - 1)
    })

    it('returns true on success', () => {
        expect(spendSkillPoint(stats, skills, 'smallGuns')).toBe(true)
    })

    it('returns false when insufficient points', () => {
        skills.availablePoints = 0
        expect(spendSkillPoint(stats, skills, 'smallGuns')).toBe(false)
    })

    it('returns false when skill is at hard cap (300)', () => {
        skills.smallGuns = 300
        expect(spendSkillPoint(stats, skills, 'smallGuns')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// awardXP / leveling up
// ---------------------------------------------------------------------------

describe('awardXP', () => {
    it('accumulates XP without leveling up when below threshold', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const gained = awardXP(1, stats, skills, 500, false, 0)
        expect(stats.xp).toBe(500)
        expect(stats.level).toBe(1)
        expect(gained).toBe(0)
    })

    it('levels up when XP meets threshold', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const gained = awardXP(1, stats, skills, 1000, false, 0)
        expect(stats.level).toBe(2)
        expect(gained).toBe(1)
    })

    it('grants skill points on level up', () => {
        const stats = makeStats({ intelligence: 5 })  // SP/level = 5 + 2*5 = 15
        const skills = makeSkills(stats)
        awardXP(1, stats, skills, 1000, false, 0)
        expect(skills.availablePoints).toBe(15)
    })

    it('Skilled trait grants +5 extra skill points per level', () => {
        const stats = makeStats({ intelligence: 5 })
        const skills = makeSkills(stats)
        awardXP(1, stats, skills, 1000, true /* hasTraitSkilled */, 0)
        expect(skills.availablePoints).toBe(20)  // 15 + 5
    })

    it('Educated perk grants +2 extra skill points per rank', () => {
        const stats = makeStats({ intelligence: 5 })
        const skills = makeSkills(stats)
        awardXP(1, stats, skills, 1000, false, 2 /* educatedRanks */)
        expect(skills.availablePoints).toBe(19)  // 15 + 4
    })
})

// ---------------------------------------------------------------------------
// Perks
// ---------------------------------------------------------------------------

describe('isPerkAvailable', () => {
    it('returns false when level prerequisite is not met', () => {
        const bonusMove = PERK_MAP.get(1)!  // Bonus Move, minLevel=3
        const stats = makeStats({ level: 1 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(bonusMove, stats, skills, 0)).toBe(false)
    })

    it('returns true when all prerequisites are met', () => {
        const bonusMove = PERK_MAP.get(1)!
        const stats = makeStats({ level: 3 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(bonusMove, stats, skills, 0)).toBe(true)
    })

    it('returns false when rank limit is reached', () => {
        const bonusMove = PERK_MAP.get(1)!  // ranks = 2
        const stats = makeStats({ level: 3 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(bonusMove, stats, skills, 2)).toBe(false)
    })
})

describe('grantPerk', () => {
    it('applies perk effects on grant', () => {
        const stats = makeStats({ level: 3 })
        const skills = makeSkills(stats)
        const before = stats.maxAP
        const perks: Map<number, number> = new Map()
        grantPerk(1 /* Bonus Move */, stats, skills, perks)
        expect(stats.maxAP).toBe(before + 2)
    })

    it('records the perk rank', () => {
        const stats = makeStats({ level: 3 })
        const skills = makeSkills(stats)
        const perks: Map<number, number> = new Map()
        grantPerk(1, stats, skills, perks)
        expect(perks.get(1)).toBe(1)
    })

    it('returns false for an unknown perk ID', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const perks: Map<number, number> = new Map()
        expect(grantPerk(9999, stats, skills, perks)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

describe('applyTraits', () => {
    it('applies Bruiser trait: +2 STR mod, -2 maxAP', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const apBefore = stats.maxAP
        applyTraits([1 /* Bruiser */], stats, skills)
        expect(stats.strengthMod).toBe(2)
        expect(stats.maxAP).toBe(apBefore - 2)
    })

    it('applies Good Natured trait: combat skills reduced, social skills raised', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const smallGunsBefore = skills.smallGuns
        const speechBefore = skills.speech
        applyTraits([10 /* Good Natured */], stats, skills)
        expect(skills.smallGuns).toBe(smallGunsBefore - 10)
        expect(skills.speech).toBe(speechBefore + 15)
    })

    it('applies Gifted trait: +1 to each SPECIAL mod, -10 to all skills', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const smallGunsBefore = skills.smallGuns
        applyTraits([15 /* Gifted */], stats, skills)
        expect(stats.strengthMod).toBe(1)
        expect(stats.agilityMod).toBe(1)
        expect(skills.smallGuns).toBe(smallGunsBefore - 10)
    })
})

describe('removeTraits', () => {
    it('reverses all trait effects', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const maxAPBefore = stats.maxAP
        applyTraits([1 /* Bruiser */], stats, skills)
        removeTraits([1], stats, skills)
        expect(stats.strengthMod).toBe(0)
        expect(stats.maxAP).toBe(maxAPBefore)
    })
})
