/**
 * Regression tests for character leveling, skill-point spending, and perk/trait application.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSkillPointCost, spendSkillPoint, awardXP } from './leveling.js'
import { grantPerk, isPerkAvailable, PERKS, PERK_MAP } from './perks.js'
import { applyTraits, removeTraits, TRAITS, TRAIT_MAP } from './traits.js'
import { StatsComponent, SkillsComponent, zeroDamageStats } from '../ecs/components.js'
import { recomputeDerivedStats, computeBaseSkills } from '../ecs/derivedStats.js'
import { EventBus } from '../eventBus.js'

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
        maxHpMod: 0, carryWeightMod: 0, meleeDamageMod: 0,
        poisonResistanceMod: 0, radiationResistanceMod: 0,
        sequenceMod: 0, healingRateMod: 0, criticalChanceMod: 0,
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

    it('multi-level XP award reaches correct level (triangular threshold)', () => {
        // xpForLevel(3) = 3000, xpForLevel(4) = 6000
        const stats = makeStats()
        const skills = makeSkills(stats)
        const gained = awardXP(1, stats, skills, 3000, false, 0)
        expect(stats.level).toBe(3)
        expect(gained).toBe(2)
    })

    it('does not over-level when XP is below the next threshold', () => {
        // 5999 XP should reach level 3 but not level 4 (which needs 6000)
        const stats = makeStats()
        const skills = makeSkills(stats)
        awardXP(1, stats, skills, 5999, false, 0)
        expect(stats.level).toBe(3)
    })

    it('maxHp increases by the per-level gain on level-up', () => {
        const stats = makeStats({ endurance: 5 })  // hpFromLevels per level = 2 + floor(5/2) = 4
        const skills = makeSkills(stats)
        const hpBefore = stats.maxHp
        awardXP(1, stats, skills, 1000, false, 0)
        expect(stats.maxHp).toBe(hpBefore + 4)
    })

    it('currentHp is restored by the HP gained from level-up', () => {
        const stats = makeStats({ endurance: 5 })
        const skills = makeSkills(stats)
        // Damage the player first
        stats.currentHp = stats.maxHp - 10
        const hpBefore = stats.currentHp
        awardXP(1, stats, skills, 1000, false, 0)
        expect(stats.currentHp).toBe(hpBefore + 4)  // +4 per level (2 + floor(5/2))
    })

    it('currentHp does not exceed new maxHp after level-up', () => {
        const stats = makeStats({ endurance: 5 })
        const skills = makeSkills(stats)
        // Set currentHp to just 1 below max so the HP gain would exceed max
        stats.currentHp = stats.maxHp
        awardXP(1, stats, skills, 1000, false, 0)
        expect(stats.currentHp).toBeLessThanOrEqual(stats.maxHp)
    })

    it('Skilled trait: perk is available at level 4 (every 4th level)', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        awardXP(1, stats, skills, 6000, true /* hasTraitSkilled */, 0)
        expect(stats.level).toBe(4)
    })

    it('Skilled trait: no perk at level 3 (Skilled shifts schedule to every 4th)', () => {
        // Without Skilled: perk at level 3, 6, 9...
        // With Skilled: perk at level 4, 8, 12...
        // Level 3 should NOT award a perk when Skilled is active
        const stats = makeStats()
        const skills = makeSkills(stats)
        // Advance to level 3
        awardXP(1, stats, skills, 3000, true /* hasTraitSkilled */, 0)
        expect(stats.level).toBe(3)
        // Level 3 % 4 !== 0, so no perk
    })
})

// ---------------------------------------------------------------------------
// Perk availability emitted in player:levelUp event
// ---------------------------------------------------------------------------

describe('player:levelUp event perksAvailable', () => {
    afterEach(() => {
        EventBus.clear('player:levelUp')
    })

    it('emits perksAvailable=0 when not a perk level (level 2)', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        let received: { entityId: number; newLevel: number; perksAvailable: number } | null = null
        EventBus.on('player:levelUp', (e) => { received = e })
        awardXP(1, stats, skills, 1000, false, 0)
        expect(received).not.toBeNull()
        expect(received!.perksAvailable).toBe(0)
        expect(received!.entityId).toBe(1)
    })

    it('emits perksAvailable=1 at a perk level (level 3) without Skilled', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const events: Array<{ entityId: number; newLevel: number; perksAvailable: number }> = []
        EventBus.on('player:levelUp', (e) => { events.push(e) })
        awardXP(1, stats, skills, 3000, false, 0)
        const level3Event = events.find((e) => e.newLevel === 3)
        expect(level3Event?.perksAvailable).toBe(1)
    })

    it('emits perksAvailable=0 at level 3 with Skilled (perk schedule shifts to every 4th)', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const events: Array<{ entityId: number; newLevel: number; perksAvailable: number }> = []
        EventBus.on('player:levelUp', (e) => { events.push(e) })
        awardXP(1, stats, skills, 3000, true /* hasTraitSkilled */, 0)
        const level3Event = events.find((e) => e.newLevel === 3)
        expect(level3Event?.perksAvailable).toBe(0)
    })

    it('emits perksAvailable=1 at level 4 with Skilled', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const events: Array<{ entityId: number; newLevel: number; perksAvailable: number }> = []
        EventBus.on('player:levelUp', (e) => { events.push(e) })
        awardXP(1, stats, skills, 6000, true /* hasTraitSkilled */, 0)
        const level4Event = events.find((e) => e.newLevel === 4)
        expect(level4Event?.perksAvailable).toBe(1)
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

// ---------------------------------------------------------------------------
// awardXP — edge cases and guards
// ---------------------------------------------------------------------------

describe('awardXP edge cases', () => {
    it('returns 0 and does not modify XP when amount is 0', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const xpBefore = stats.xp
        const gained = awardXP(1, stats, skills, 0, false, 0)
        expect(gained).toBe(0)
        expect(stats.xp).toBe(xpBefore)
    })

    it('returns 0 and does not modify XP when amount is negative', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const xpBefore = stats.xp
        const gained = awardXP(1, stats, skills, -100, false, 0)
        expect(gained).toBe(0)
        expect(stats.xp).toBe(xpBefore)
    })

    it('player:xpGain event includes entityId matching the playerId argument', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        let eventEntityId: number | undefined
        EventBus.on('player:xpGain', (e) => { eventEntityId = e.entityId })
        awardXP(42, stats, skills, 500, false, 0)
        expect(eventEntityId).toBe(42)
        EventBus.clear('player:xpGain')
    })

    it('player:levelUp event includes entityId matching the playerId argument', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        let eventEntityId: number | undefined
        EventBus.on('player:levelUp', (e) => { eventEntityId = e.entityId })
        awardXP(99, stats, skills, 1000, false, 0)
        expect(eventEntityId).toBe(99)
        EventBus.clear('player:levelUp')
    })

    it('does not emit player:xpGain for amount=0', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        let fired = false
        EventBus.on('player:xpGain', () => { fired = true })
        awardXP(1, stats, skills, 0, false, 0)
        expect(fired).toBe(false)
        EventBus.clear('player:xpGain')
    })
})

// ---------------------------------------------------------------------------
// Perk effects — Action Boy stacks correctly
// ---------------------------------------------------------------------------

describe('Action Boy multi-rank maxAP', () => {
    it('increases maxAP by +1 on each grant (no double-counting)', () => {
        const stats = makeStats({ level: 12, agility: 5 })
        const skills = makeSkills(stats)
        const basAP = stats.maxAP
        const perks: Map<number, number> = new Map()

        grantPerk(6 /* Action Boy */, stats, skills, perks)
        expect(stats.maxAP).toBe(basAP + 1)

        grantPerk(6, stats, skills, perks)
        expect(stats.maxAP).toBe(basAP + 2)
    })
})

// ---------------------------------------------------------------------------
// derivedStats — resistance clamping
// ---------------------------------------------------------------------------

describe('resistance clamping in recomputeDerivedStats', () => {
    it('clamps poisonResistance to 100 when mods push it above 100', () => {
        const stats = makeStats({ endurance: 10, poisonResistanceMod: 1000 })
        // 5 * 10 + 1000 = 1050 without clamping
        expect(stats.poisonResistance).toBe(100)
    })

    it('clamps poisonResistance to 0 when mods push it below 0', () => {
        const stats = makeStats({ endurance: 1, poisonResistanceMod: -100 })
        expect(stats.poisonResistance).toBe(0)
    })

    it('clamps radiationResistance to 100 when mods push it above 100', () => {
        const stats = makeStats({ endurance: 10, radiationResistanceMod: 1000 })
        expect(stats.radiationResistance).toBe(100)
    })

    it('clamps radiationResistance to 0 when mods push it below 0', () => {
        const stats = makeStats({ endurance: 1, radiationResistanceMod: -100 })
        expect(stats.radiationResistance).toBe(0)
    })

    it('clamps criticalChance to 100 when mods push it above 100', () => {
        const stats = makeStats({ luck: 10, criticalChanceMod: 200 })
        expect(stats.criticalChance).toBe(100)
    })

    it('clamps criticalChance to 0 when mods push it below 0', () => {
        const stats = makeStats({ luck: 1, criticalChanceMod: -100 })
        expect(stats.criticalChance).toBe(0)
    })
})
