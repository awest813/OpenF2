/**
 * Derived stats computation.
 *
 * Fallout 1 and 2 use the same formulae for most derived stats.
 * All derived values are recomputed from SPECIAL primaries + modifiers.
 * This is the authoritative source — no other module may invent derived values.
 *
 * Reference: Fallout 2 SPECIAL system documentation (Chris Avellone, Tim Cain).
 */

import { StatsComponent, SkillsComponent } from './components.js'

/** Effective SPECIAL value (base + mod), clamped 1–10. */
export function effectiveStat(base: number, mod: number): number {
    return Math.max(1, Math.min(10, base + mod))
}

/**
 * Recompute all derived stats on a StatsComponent in-place.
 * Call this whenever any SPECIAL primary or its modifier changes.
 */
export function recomputeDerivedStats(s: StatsComponent): void {
    const str = effectiveStat(s.strength, s.strengthMod)
    const per = effectiveStat(s.perception, s.perceptionMod)
    const end = effectiveStat(s.endurance, s.enduranceMod)
    const cha = effectiveStat(s.charisma, s.charismaMod)
    const int = effectiveStat(s.intelligence, s.intelligenceMod)
    const agi = effectiveStat(s.agility, s.agilityMod)
    const lck = effectiveStat(s.luck, s.luckMod)

    // Max HP: 15 + (STR + 2×END) at level 1; +4 HP per level (+ END bonus)
    const hpFromLevels = (s.level - 1) * (2 + Math.floor(end / 2))
    s.maxHp = 15 + str + 2 * end + hpFromLevels + (s.maxHpMod ?? 0)
    s.currentHp = Math.min(s.currentHp, s.maxHp)

    // AP: 5 + ceil(AGI/2) + any flat modifier from perks/traits
    s.maxAP = 5 + Math.ceil(agi / 2) + (s.maxAPMod ?? 0)

    // Armor Class: AGI (unarmored)
    s.armorClass = agi

    // Carry Weight: 25 + 25×STR lbs
    s.carryWeight = 25 + 25 * str + (s.carryWeightMod ?? 0)

    // Melee Damage: max(1, STR - 5) + bonus
    s.meleeDamage = Math.max(1, str - 5) + (s.meleeDamageMod ?? 0)

    // Damage Resistance (Normal): 0% base (armor adds to this)
    // (left as-is; armor system adds to dr.normal separately)

    // Poison Resistance: 5×END %
    s.poisonResistance = 5 * end + (s.poisonResistanceMod ?? 0)

    // Radiation Resistance: 2×END %
    s.radiationResistance = 2 * end + (s.radiationResistanceMod ?? 0)

    // Sequence: 2×PER
    s.sequence = 2 * per + (s.sequenceMod ?? 0)

    // Healing Rate: max(1, floor(END/3)) + bonus
    s.healingRate = Math.max(1, Math.floor(end / 3)) + (s.healingRateMod ?? 0)

    // Critical Chance: LCK %
    s.criticalChance = lck + (s.criticalChanceMod ?? 0)

    // XP to next level: cumulative triangular threshold (Fallout 2 formula)
    s.xpToNextLevel = xpForLevel(s.level + 1)
}

/**
 * Compute base skill values from SPECIAL stats.
 *
 * These are the initial (unspent) skill values before skill points are added.
 * Tagged skills receive an additional +20% on top of this base.
 */
export function computeBaseSkills(s: StatsComponent): Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'> {
    const str = effectiveStat(s.strength, s.strengthMod)
    const per = effectiveStat(s.perception, s.perceptionMod)
    const end = effectiveStat(s.endurance, s.enduranceMod)
    const cha = effectiveStat(s.charisma, s.charismaMod)
    const int = effectiveStat(s.intelligence, s.intelligenceMod)
    const agi = effectiveStat(s.agility, s.agilityMod)
    const lck = effectiveStat(s.luck, s.luckMod)

    return {
        // Combat
        smallGuns:      5 + 4 * agi,
        bigGuns:        2 * agi,
        energyWeapons:  2 * agi,
        unarmed:        30 + 2 * (agi + str),
        meleeWeapons:   20 + 2 * (agi + str),
        throwing:       4 * agi,

        // Active
        firstAid:       2 * (per + int),
        doctor:         5 + per + int,
        sneak:          5 + 3 * agi,
        lockpick:       10 + per + agi,
        steal:          3 * agi,
        traps:          10 + per + agi,

        // Knowledge
        science:        4 * int,
        repair:         3 * int,
        speech:         5 * cha,
        barter:         4 * cha,
        gambling:       5 * lck,
        outdoorsman:    2 * (end + int),
    }
}

/** Returns the number of skill points gained per level-up. */
export function skillPointsPerLevel(int: number): number {
    // Fallout 2: 5 + (2 × INT) points per level
    return 5 + 2 * int
}

/** XP required to reach `level` from level 1. */
export function xpForLevel(level: number): number {
    if (level <= 1) return 0
    // Sum of 1000 * l for l = 1..level-1
    return (level * (level - 1) / 2) * 1000
}
