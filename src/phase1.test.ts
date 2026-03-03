/**
 * Phase 1 regression tests — Playable Core RPG Loop.
 *
 * Covers:
 *   - SPECIAL + derived stats pipeline: HP, AP, carry weight, skill points
 *   - Skills: base computation from SPECIAL, tagged skill bonus and cost halving
 *   - Traits: application, removal, and the 2-trait cap
 *   - Perks: level, SPECIAL, and skill prerequisites; rank limits; getAvailablePerks
 *   - Leveling: XP thresholds at representative levels
 */

import { describe, it, expect } from 'vitest'
import { applyTraits, removeTraits, TRAIT_MAP } from './character/traits.js'
import {
    isPerkAvailable,
    grantPerk,
    getAvailablePerks,
    PERK_MAP,
} from './character/perks.js'
import { getSkillPointCost } from './character/leveling.js'
import {
    recomputeDerivedStats,
    computeBaseSkills,
    skillPointsPerLevel,
    xpForLevel,
} from './ecs/derivedStats.js'
import { StatsComponent, SkillsComponent, zeroDamageStats } from './ecs/components.js'

// ---------------------------------------------------------------------------
// Helpers (mirrors makeStats in derivedStats.test.ts and leveling.test.ts)
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
    return {
        componentType: 'skills',
        ...computeBaseSkills(stats),
        tagged: new Set(),
        availablePoints: 0,
    }
}

// ---------------------------------------------------------------------------
// SPECIAL derived stats — HP formula (inline reference)
// ---------------------------------------------------------------------------

/**
 * Inline replica of the HP formula from recomputeDerivedStats.
 * Level 1 HP = 15 + STR + 2*END; each additional level adds (2 + floor(END/2)).
 */
function computeMaxHp(str: number, end: number, level: number): number {
    const hpFromLevels = (level - 1) * (2 + Math.floor(end / 2))
    return 15 + str + 2 * end + hpFromLevels
}

describe('HP formula', () => {
    it('level-1 character with STR=5, END=5 has 30 HP', () => {
        // 15 + 5 + 10 = 30
        expect(computeMaxHp(5, 5, 1)).toBe(30)
        expect(makeStats({ strength: 5, endurance: 5 }).maxHp).toBe(30)
    })

    it('high STR raises HP', () => {
        expect(computeMaxHp(8, 5, 1)).toBe(33)  // 15 + 8 + 10 = 33
        expect(makeStats({ strength: 8, endurance: 5 }).maxHp).toBe(33)
    })

    it('high END raises HP more (2× coefficient)', () => {
        expect(computeMaxHp(5, 8, 1)).toBe(36)  // 15 + 5 + 16 = 36
        expect(makeStats({ strength: 5, endurance: 8 }).maxHp).toBe(36)
    })

    it('HP grows with level — each level adds (2 + floor(END/2))', () => {
        // END=6: per-level gain = 2 + 3 = 5
        expect(computeMaxHp(5, 6, 2)).toBe(computeMaxHp(5, 6, 1) + 5)
        expect(computeMaxHp(5, 6, 3)).toBe(computeMaxHp(5, 6, 1) + 10)
    })
})

// ---------------------------------------------------------------------------
// AP formula (inline reference)
// ---------------------------------------------------------------------------

describe('AP formula', () => {
    it('AGI=5 gives 8 AP (5 + ceil(5/2))', () => {
        expect(makeStats({ agility: 5 }).maxAP).toBe(8)
    })

    it('AGI=6 gives 8 AP (5 + ceil(6/2))', () => {
        expect(makeStats({ agility: 6 }).maxAP).toBe(8)
    })

    it('AGI=7 gives 9 AP (5 + ceil(7/2))', () => {
        expect(makeStats({ agility: 7 }).maxAP).toBe(9)
    })

    it('maxAPMod is included in final AP', () => {
        const s = makeStats({ agility: 5, maxAPMod: 2 })
        expect(s.maxAP).toBe(10)  // 8 + 2
    })
})

// ---------------------------------------------------------------------------
// Carry weight formula (inline reference)
// ---------------------------------------------------------------------------

describe('carry weight formula', () => {
    it('STR=5 gives 150 lbs (25 + 25×5)', () => {
        expect(makeStats({ strength: 5 }).carryWeight).toBe(150)
    })

    it('STR=8 gives 225 lbs (25 + 25×8)', () => {
        expect(makeStats({ strength: 8 }).carryWeight).toBe(225)
    })

    it('STR=1 gives 50 lbs (minimum meaningful value)', () => {
        expect(makeStats({ strength: 1 }).carryWeight).toBe(50)
    })
})

// ---------------------------------------------------------------------------
// Skill points per level
// ---------------------------------------------------------------------------

describe('skill points per level', () => {
    it('INT=1 gives 7 SP/level (5 + 2×1)', () => {
        expect(skillPointsPerLevel(1)).toBe(7)
    })

    it('INT=5 gives 15 SP/level (5 + 2×5)', () => {
        expect(skillPointsPerLevel(5)).toBe(15)
    })

    it('INT=10 gives 25 SP/level (5 + 2×10)', () => {
        expect(skillPointsPerLevel(10)).toBe(25)
    })
})

// ---------------------------------------------------------------------------
// XP thresholds (Fallout 2 triangular formula)
// ---------------------------------------------------------------------------

describe('xpForLevel thresholds', () => {
    it('level 1 requires 0 XP', () => expect(xpForLevel(1)).toBe(0))
    it('level 2 requires 1000 XP', () => expect(xpForLevel(2)).toBe(1000))
    it('level 5 requires 10000 XP', () => expect(xpForLevel(5)).toBe(10000))
    it('level 10 requires 45000 XP', () => expect(xpForLevel(10)).toBe(45000))
    it('level 20 requires 190000 XP', () => expect(xpForLevel(20)).toBe(190000))
})

// ---------------------------------------------------------------------------
// Tagged skill bonus (+20%) and cost halving
// ---------------------------------------------------------------------------

describe('tagged skill cost halving', () => {
    it('tagged skill below 100 costs 1 pt (ceil(1/2)=1)', () => {
        expect(getSkillPointCost(50, true)).toBe(1)
    })

    it('tagged skill 100–124 costs 1 pt (ceil(2/2)=1)', () => {
        expect(getSkillPointCost(100, true)).toBe(1)
    })

    it('tagged skill 125–149 costs 2 pts (ceil(3/2)=2)', () => {
        expect(getSkillPointCost(125, true)).toBe(2)
    })

    it('tagged skill 150–174 costs 2 pts (ceil(4/2)=2)', () => {
        expect(getSkillPointCost(150, true)).toBe(2)
    })

    it('tagged skill 175+ costs 3 pts (ceil(5/2)=3)', () => {
        expect(getSkillPointCost(175, true)).toBe(3)
    })
})

describe('base skill computation from SPECIAL', () => {
    it('small guns uses 5 + 4*AGI', () => {
        const skills = computeBaseSkills(makeStats({ agility: 7 }))
        expect(skills.smallGuns).toBe(5 + 4 * 7)
    })

    it('lockpick uses 10 + PER + AGI', () => {
        const skills = computeBaseSkills(makeStats({ perception: 6, agility: 7 }))
        expect(skills.lockpick).toBe(10 + 6 + 7)
    })

    it('outdoorsman uses 2*(END + INT)', () => {
        const skills = computeBaseSkills(makeStats({ endurance: 6, intelligence: 7 }))
        expect(skills.outdoorsman).toBe(2 * (6 + 7))
    })
})

// ---------------------------------------------------------------------------
// Traits — additional coverage beyond leveling.test.ts
// ---------------------------------------------------------------------------

describe('Trait: Fast Metabolism (id=0)', () => {
    it('raises healing rate and radiation resistance, lowers poison resistance', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const hrBefore = stats.healingRate
        const rrBefore = stats.radiationResistance
        const prBefore = stats.poisonResistance
        applyTraits([0], stats, skills)
        expect(stats.healingRate).toBe(hrBefore + 2)
        expect(stats.radiationResistance).toBe(rrBefore + 2)
        expect(stats.poisonResistance).toBe(prBefore - 10)
    })
})

describe('Trait: Small Frame (id=2)', () => {
    it('+1 agility mod, -25 carry weight', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const carryBefore = stats.carryWeight
        applyTraits([2], stats, skills)
        expect(stats.agilityMod).toBe(1)
        expect(stats.carryWeight).toBe(carryBefore - 25)
    })
})

describe('Trait: Finesse (id=4)', () => {
    it('+10% critical chance', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const critBefore = stats.criticalChance
        applyTraits([4], stats, skills)
        expect(stats.criticalChance).toBe(critBefore + 10)
    })
})

describe('Trait: Kamikaze (id=5)', () => {
    it('+10 sequence', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const seqBefore = stats.sequence
        applyTraits([5], stats, skills)
        expect(stats.sequence).toBe(seqBefore + 10)
    })
})

describe('Trait: Heavy Handed (id=6)', () => {
    it('+4 melee damage', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const meleeBefore = stats.meleeDamage
        applyTraits([6], stats, skills)
        expect(stats.meleeDamage).toBe(meleeBefore + 4)
    })
})

describe('Trait cap: only the first 2 traits are applied', () => {
    it('applies exactly 2 of 3 provided trait IDs', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const critBefore = stats.criticalChance  // Finesse = +10 crit
        const meleeBefore = stats.meleeDamage    // Heavy Handed = +4 melee
        const hrBefore = stats.healingRate       // Fast Metabolism = +2 heal
        // Provide 3 traits; only first 2 should be applied
        applyTraits([4 /* Finesse */, 6 /* Heavy Handed */, 0 /* Fast Metabolism */], stats, skills)
        expect(stats.criticalChance).toBe(critBefore + 10)  // Finesse applied
        expect(stats.meleeDamage).toBe(meleeBefore + 4)     // Heavy Handed applied
        expect(stats.healingRate).toBe(hrBefore)            // Fast Metabolism NOT applied
    })
})

describe('removeTraits reverses effects', () => {
    it('Kamikaze removal restores sequence', () => {
        const stats = makeStats()
        const skills = makeSkills(stats)
        const seqBefore = stats.sequence
        applyTraits([5], stats, skills)
        removeTraits([5], stats, skills)
        expect(stats.sequence).toBe(seqBefore)
    })
})

// ---------------------------------------------------------------------------
// Perks — additional coverage beyond leveling.test.ts
// ---------------------------------------------------------------------------

describe('Perk prerequisites — SPECIAL', () => {
    it('Sharpshooter (id=5) requires PER≥7 and INT≥6 and level≥9', () => {
        const sharpshooter = PERK_MAP.get(5)!
        const stats = makeStats({ level: 9, perception: 7, intelligence: 6 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(sharpshooter, stats, skills, 0)).toBe(true)
    })

    it('Sharpshooter blocked when PER is below 7', () => {
        const sharpshooter = PERK_MAP.get(5)!
        const stats = makeStats({ level: 9, perception: 6, intelligence: 6 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(sharpshooter, stats, skills, 0)).toBe(false)
    })

    it('Better Criticals (id=7) requires PER≥6, AGI≥4, LUK≥6', () => {
        const bc = PERK_MAP.get(7)!
        const stats = makeStats({ level: 9, perception: 6, agility: 4, luck: 6 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(bc, stats, skills, 0)).toBe(true)
    })

    it('Better Criticals blocked when LUK is below 6', () => {
        const bc = PERK_MAP.get(7)!
        const stats = makeStats({ level: 9, perception: 6, agility: 4, luck: 5 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(bc, stats, skills, 0)).toBe(false)
    })

    it('Sniper (id=9) requires level≥18, PER≥8, AGI≥8', () => {
        const sniper = PERK_MAP.get(9)!
        const hiStats = makeStats({ level: 18, perception: 8, agility: 8 })
        const lowStats = makeStats({ level: 18, perception: 8, agility: 7 })
        const skills = makeSkills(hiStats)
        const skillsLow = makeSkills(lowStats)
        expect(isPerkAvailable(sniper, hiStats, skills, 0)).toBe(true)
        expect(isPerkAvailable(sniper, lowStats, skillsLow, 0)).toBe(false)
    })
})

describe('Perk prerequisites — skill threshold', () => {
    it('Master Trader (id=13) requires barter≥75', () => {
        const mt = PERK_MAP.get(13)!
        const stats = makeStats({ level: 9, charisma: 7 })
        const skills = makeSkills(stats)
        skills.barter = 74
        expect(isPerkAvailable(mt, stats, skills, 0)).toBe(false)
        skills.barter = 75
        expect(isPerkAvailable(mt, stats, skills, 0)).toBe(true)
    })

    it('Ghost (id=14) requires sneak≥60', () => {
        const ghost = PERK_MAP.get(14)!
        const stats = makeStats({ level: 6, agility: 6 })
        const skills = makeSkills(stats)
        skills.sneak = 59
        expect(isPerkAvailable(ghost, stats, skills, 0)).toBe(false)
        skills.sneak = 60
        expect(isPerkAvailable(ghost, stats, skills, 0)).toBe(true)
    })
})

describe('Perk rank limit', () => {
    it('Toughness (id=3) can be taken up to 3 times', () => {
        const toughness = PERK_MAP.get(3)!
        const stats = makeStats({ level: 3, endurance: 6 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(toughness, stats, skills, 0)).toBe(true)
        expect(isPerkAvailable(toughness, stats, skills, 2)).toBe(true)
        expect(isPerkAvailable(toughness, stats, skills, 3)).toBe(false)  // at cap
    })

    it('Lifegiver (id=8) can be taken twice', () => {
        const lifegiver = PERK_MAP.get(8)!
        const stats = makeStats({ level: 9, endurance: 4 })
        const skills = makeSkills(stats)
        expect(isPerkAvailable(lifegiver, stats, skills, 1)).toBe(true)
        expect(isPerkAvailable(lifegiver, stats, skills, 2)).toBe(false)  // at cap
    })
})

describe('grantPerk — stat effects', () => {
    it('Toughness (id=3) adds 10 to all DR values per rank', () => {
        const stats = makeStats({ level: 3, endurance: 6 })
        const skills = makeSkills(stats)
        const perks: Map<number, number> = new Map()
        const drBefore = stats.dr.normal
        grantPerk(3, stats, skills, perks)
        expect(stats.dr.normal).toBe(drBefore + 10)
        expect(stats.dr.fire).toBe(drBefore + 10)
    })

    it('Lifegiver (id=8) adds 4 to max HP per rank', () => {
        const stats = makeStats({ level: 9, endurance: 4 })
        const skills = makeSkills(stats)
        const perks: Map<number, number> = new Map()
        const hpBefore = stats.maxHp
        grantPerk(8, stats, skills, perks)
        expect(stats.maxHp).toBe(hpBefore + 4)
    })

    it('Survivalist (id=12) adds 25 to outdoorsman skill', () => {
        const stats = makeStats({ level: 3, endurance: 6, agility: 6, intelligence: 6 })
        const skills = makeSkills(stats)
        const perks: Map<number, number> = new Map()
        const outBefore = skills.outdoorsman
        grantPerk(12, stats, skills, perks)
        expect(skills.outdoorsman).toBe(outBefore + 25)
    })
})

describe('getAvailablePerks', () => {
    it('returns only perks whose prerequisites are met', () => {
        // Level 1 player: very few (or no) perks should be available
        const stats = makeStats({ level: 1 })
        const skills = makeSkills(stats)
        const available = getAvailablePerks(stats, skills, new Map())
        // All available perks must require level ≤ 1
        for (const perk of available) {
            expect((perk.prerequisites.minLevel ?? 0)).toBeLessThanOrEqual(1)
        }
    })

    it('returns more perks at higher level', () => {
        const statsLow = makeStats({ level: 1 })
        const statsHigh = makeStats({ level: 12, perception: 7, agility: 5, intelligence: 6 })
        const skills = makeSkills(statsHigh)
        const lowAvail = getAvailablePerks(statsLow, makeSkills(statsLow), new Map())
        const highAvail = getAvailablePerks(statsHigh, skills, new Map())
        expect(highAvail.length).toBeGreaterThanOrEqual(lowAvail.length)
    })

    it('excludes perks already at max rank', () => {
        const stats = makeStats({ level: 3 })
        const skills = makeSkills(stats)
        // Grant both ranks of Bonus Move (id=1, ranks=2)
        const perks: Map<number, number> = new Map([[1, 2]])
        const available = getAvailablePerks(stats, skills, perks)
        expect(available.find((p) => p.id === 1)).toBeUndefined()
    })
})
