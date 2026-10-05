/**
 * Dynamic stat and skill modifiers from traits and perks, as the Fallout 2
 * engine applies them on every read (stat.cc critterGetStat, trait.cc
 * traitGetStatModifier / traitGetSkillModifier, perk.cc perkGetSkillModifier,
 * skill.cc skillGetGameDifficultyModifier).
 *
 * SPECIAL changes from traits (Bruiser, Small Frame, Gifted) and the Good
 * Natured / Gifted skill offsets are folded into the base values at character
 * creation, so they are deliberately not repeated here.
 */

import { GAIN_STAT_PERKS, PERK_STAT_EFFECTS, PerkId, perkRank, perkSkillModifier } from './perkIds.js'

/** trait_defs.h */
export const TraitId = {
    FAST_METABOLISM: 0,
    BRUISER: 1,
    SMALL_FRAME: 2,
    ONE_HANDER: 3,
    FINESSE: 4,
    KAMIKAZE: 5,
    HEAVY_HANDED: 6,
    FAST_SHOT: 7,
    BLOODY_MESS: 8,
    JINXED: 9,
    GOOD_NATURED: 10,
    CHEM_RELIANT: 11,
    CHEM_RESISTANT: 12,
    SEX_APPEAL: 13,
    SKILLED: 14,
    GIFTED: 15,
} as const

interface ModifierSubject {
    perkRanks?: Record<number, number>
    charTraits?: Set<number>
}

function hasTrait(c: ModifierSubject, trait: number): boolean {
    return c.charTraits?.has(trait) ?? false
}

/**
 * Trait modifier for a derived stat. `base(stat)` must return the stat
 * without trait/perk modifiers (the engine's critterGetBaseStat).
 */
export function traitStatModifier(c: ModifierSubject, stat: string, base: (stat: string) => number): number {
    switch (stat) {
        case 'AP':
            return hasTrait(c, TraitId.BRUISER) ? -2 : 0
        case 'AC':
            return hasTrait(c, TraitId.KAMIKAZE) ? -base('AC') : 0
        case 'Melee':
            return hasTrait(c, TraitId.HEAVY_HANDED) ? 4 : 0
        case 'Carry':
            return hasTrait(c, TraitId.SMALL_FRAME) ? -10 * base('STR') : 0
        case 'Sequence':
            return hasTrait(c, TraitId.KAMIKAZE) ? 5 : 0
        case 'Healing Rate':
            return hasTrait(c, TraitId.FAST_METABOLISM) ? 2 : 0
        case 'Critical Chance':
            return hasTrait(c, TraitId.FINESSE) ? 10 : 0
        case 'Better Criticals':
            return hasTrait(c, TraitId.HEAVY_HANDED) ? -30 : 0
        case 'DR Radiation':
        case 'DR Poison':
            return hasTrait(c, TraitId.FAST_METABOLISM) ? -base(stat) : 0
        default:
            return 0
    }
}

/** Per-rank perk bonus to a stat (perk.cc perkAddEffect). */
export function perkStatModifier(c: ModifierSubject, stat: string): number {
    if (!c.perkRanks) {return 0}
    let total = 0
    for (const [perk, effect] of PERK_STAT_EFFECTS) {
        if (effect.stat === stat) {total += perkRank(c, perk) * effect.perRank}
    }
    return total
}

/** +1 SPECIAL from a Gain <Stat> perk (player only in the engine). */
export function gainPerkSpecialBonus(c: ModifierSubject, stat: string): number {
    for (const [perk, special] of GAIN_STAT_PERKS) {
        if (special === stat && perkRank(c, perk) > 0) {return 1}
    }
    return 0
}

/** Adrenaline Rush: +1 STR while below half of max HP. */
export function adrenalineRushBonus(c: ModifierSubject, hp: number, maxHp: number): number {
    if (perkRank(c, PerkId.ADRENALINE_RUSH) <= 0) {return 0}
    return hp < Math.trunc(maxHp / 2) ? 1 : 0
}

const DIFFICULTY_SKILLS = new Set([
    'First Aid', 'Doctor', 'Sneak', 'Lockpick', 'Steal', 'Traps', 'Science',
    'Repair', 'Speech', 'Barter', 'Gambling', 'Outdoorsman',
])

/** Game difficulty skill modifier: non-combat skills +20 on easy, −10 on hard. */
export function gameDifficultySkillModifier(skill: string, gameDifficulty: number): number {
    if (!DIFFICULTY_SKILLS.has(skill)) {return 0}
    if (gameDifficulty === 0) {return 20}
    if (gameDifficulty === 2) {return -10}
    return 0
}

/**
 * Player-only skill modifiers applied on read: perk bonuses, Ghost and game
 * difficulty. Ghost's +20 Sneak is granted when the received light is ABOVE
 * 45875 of 65536 — the engine compares the wrong way round, and this keeps
 * the original behaviour.
 */
export function playerSkillModifier(
    c: ModifierSubject,
    skill: string,
    gameDifficulty: number,
    lightIntensity: number,
): number {
    let mod = perkSkillModifier(c.perkRanks, skill)
    if (skill === 'Sneak' && perkRank(c, PerkId.GHOST) > 0 && lightIntensity > 45875) {mod += 20}
    mod += gameDifficultySkillModifier(skill, gameDifficulty)
    return mod
}
