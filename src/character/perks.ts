/**
 * Perks — earned at every 3rd level (Fallout 2 default).
 *
 * Perks are persistent buffs with prerequisites (level, SPECIAL, skill).
 * This file defines all Fallout 2 perks. Fallout 1 perks are a strict subset.
 *
 * Reference: Fallout 2 PERKS.MSG, perks data in fallout2.exe.
 */

import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { recomputeDerivedStats } from '../ecs/derivedStats.js'

export interface PerkPrerequisite {
    minLevel?: number
    minStrength?: number
    minPerception?: number
    minEndurance?: number
    minCharisma?: number
    minIntelligence?: number
    minAgility?: number
    minLuck?: number
    minSkill?: { skill: keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>; value: number }
    /** Can only take this perk once (default true). */
    unique?: boolean
    /** Maximum times this perk can be taken. */
    maxRanks?: number
}

export interface Perk {
    id: number
    name: string
    description: string
    ranks: number  // how many times can be taken
    prerequisites: PerkPrerequisite
    apply(stats: StatsComponent, skills: SkillsComponent, rank: number): void
}

function checkPrereqs(
    p: PerkPrerequisite,
    stats: StatsComponent,
    skills: SkillsComponent,
): boolean {
    if (p.minLevel !== undefined && stats.level < p.minLevel) return false
    if (p.minStrength !== undefined && stats.strength + stats.strengthMod < p.minStrength) return false
    if (p.minPerception !== undefined && stats.perception + stats.perceptionMod < p.minPerception) return false
    if (p.minEndurance !== undefined && stats.endurance + stats.enduranceMod < p.minEndurance) return false
    if (p.minCharisma !== undefined && stats.charisma + stats.charismaMod < p.minCharisma) return false
    if (p.minIntelligence !== undefined && stats.intelligence + stats.intelligenceMod < p.minIntelligence) return false
    if (p.minAgility !== undefined && stats.agility + stats.agilityMod < p.minAgility) return false
    if (p.minLuck !== undefined && stats.luck + stats.luckMod < p.minLuck) return false
    if (p.minSkill !== undefined) {
        const val = (skills as any)[p.minSkill.skill] as number
        if (val < p.minSkill.value) return false
    }
    return true
}

export function isPerkAvailable(
    perk: Perk,
    stats: StatsComponent,
    skills: SkillsComponent,
    currentRank: number,
): boolean {
    if (currentRank >= perk.ranks) return false
    return checkPrereqs(perk.prerequisites, stats, skills)
}

// ---------------------------------------------------------------------------
// Perk definitions — a representative selection covering the full list
// ---------------------------------------------------------------------------

export const PERKS: Perk[] = [
    // --- Tier 1 (Level 3) ---
    {
        id: 0, name: 'Awareness', ranks: 1,
        description: 'With Awareness you have a better understanding of other creatures. You are given detailed information about a target\'s condition when you examine them.',
        prerequisites: { minLevel: 3, minPerception: 5 },
        apply() {},  // handled in examine code
    },
    {
        id: 1, name: 'Bonus Move', ranks: 2,
        description: 'For each rank of this perk, you receive 2 free Action Points each combat turn that can only be used for movement.',
        prerequisites: { minLevel: 3 },
        apply(s) { s.maxAPMod += 2; s.maxAP += 2 },
    },
    {
        id: 2, name: 'Empathy', ranks: 1,
        description: 'You can tell what kind of response you\'ll get from an NPC before you say it in dialogue.',
        prerequisites: { minLevel: 3, minPerception: 7 },
        apply() {},  // handled in dialogue UI
    },
    {
        id: 3, name: 'Toughness', ranks: 3,
        description: '+10% to all Damage Resistance per rank.',
        prerequisites: { minLevel: 3, minEndurance: 6 },
        apply(s, _, rank) {
            s.dr.normal += 10
            s.dr.fire += 10
            s.dr.plasma += 10
            s.dr.laser += 10
            s.dr.explosive += 10
            s.dr.electrical += 10
            s.dr.emp += 10
        },
    },
    {
        id: 4, name: 'Strong Back', ranks: 3,
        description: '+50 lbs carry weight per rank.',
        prerequisites: { minLevel: 3, minStrength: 6, minEndurance: 6 },
        apply(s) { s.carryWeight += 50 },
    },
    {
        id: 5, name: 'Sharpshooter', ranks: 1,
        description: '+2 Perception for the purpose of ranged weapon range.',
        prerequisites: { minLevel: 9, minPerception: 7, minIntelligence: 6 },
        apply(s) { s.perceptionMod += 2 },
    },
    {
        id: 6, name: 'Action Boy', ranks: 2,
        description: '+1 AP per rank.',
        prerequisites: { minLevel: 12, minAgility: 5 },
        apply(s) { s.maxAPMod += 1; s.maxAP += 1 },
    },
    {
        id: 7, name: 'Better Criticals', ranks: 1,
        description: '+20% to the critical hit table. You cause better critical hits.',
        prerequisites: { minLevel: 9, minPerception: 6, minAgility: 4, minLuck: 6 },
        apply(s) { s.criticalChance += 20 },
    },
    {
        id: 8, name: 'Lifegiver', ranks: 2,
        description: '+4 Max HP per rank.',
        prerequisites: { minLevel: 9, minEndurance: 4 },
        apply(s) {
            s.maxHp += 4
            s.currentHp = Math.min(s.currentHp + 4, s.maxHp)
        },
    },
    {
        id: 9, name: 'Sniper', ranks: 1,
        description: 'When you make a ranged attack you may make a second d100 roll for the location hit using the best of the two rolls.',
        prerequisites: { minLevel: 18, minPerception: 8, minAgility: 8 },
        apply() {},  // handled in called-shot resolution
    },
    {
        id: 10, name: 'Healer', ranks: 4,
        description: '+1 to +5 HP healed per use of First Aid or Doctor per rank.',
        prerequisites: { minLevel: 3, minPerception: 7, minAgility: 6, minIntelligence: 5 },
        apply() {},  // handled in skill use
    },
    {
        id: 11, name: 'Educated', ranks: 3,
        description: '+2 skill points per level per rank.',
        prerequisites: { minLevel: 3, minIntelligence: 6 },
        apply() {},  // handled in level-up logic
    },
    {
        id: 12, name: 'Survivalist', ranks: 1,
        description: '+25% Outdoorsman skill.',
        prerequisites: { minLevel: 3, minEndurance: 6, minAgility: 6, minIntelligence: 6 },
        apply(_s, sk) { sk.outdoorsman += 25 },
    },
    {
        id: 13, name: 'Master Trader', ranks: 1,
        description: '+30% Barter skill.',
        prerequisites: { minLevel: 9, minCharisma: 7, minSkill: { skill: 'barter', value: 75 } },
        apply(_s, sk) { sk.barter += 30 },
    },
    {
        id: 14, name: 'Ghost', ranks: 1,
        description: '+20% Sneak in darkness.',
        prerequisites: { minLevel: 6, minAgility: 6, minSkill: { skill: 'sneak', value: 60 } },
        apply(_s, sk) { sk.sneak += 20 },
    },
    {
        id: 15, name: 'Pickpocket', ranks: 1,
        description: '+30% Steal when stealing items with lower weight.',
        prerequisites: { minLevel: 9, minAgility: 8, minSkill: { skill: 'steal', value: 80 } },
        apply(_s, sk) { sk.steal += 30 },
    },
]

export const PERK_MAP: Map<number, Perk> = new Map(PERKS.map((p) => [p.id, p]))

/**
 * Returns all perks available to the player at their current level/stats.
 */
export function getAvailablePerks(
    stats: StatsComponent,
    skills: SkillsComponent,
    currentPerks: Map<number, number>,  // perkId → current rank
): Perk[] {
    return PERKS.filter((p) => {
        const rank = currentPerks.get(p.id) ?? 0
        return isPerkAvailable(p, stats, skills, rank)
    })
}

/**
 * Grant a perk to a character. Returns false if prerequisites not met.
 */
export function grantPerk(
    perkId: number,
    stats: StatsComponent,
    skills: SkillsComponent,
    currentPerks: Map<number, number>,
): boolean {
    const perk = PERK_MAP.get(perkId)
    if (!perk) return false

    const rank = currentPerks.get(perkId) ?? 0
    if (!isPerkAvailable(perk, stats, skills, rank)) return false

    const newRank = rank + 1
    currentPerks.set(perkId, newRank)
    perk.apply(stats, skills, newRank)
    recomputeDerivedStats(stats)
    return true
}
