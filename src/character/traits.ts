/**
 * Traits — chosen at character creation, immutable thereafter.
 *
 * Each trait provides flat SPECIAL or skill modifiers plus special flags.
 * The full Fallout 1/2 trait list is defined here.
 *
 * Reference: Fallout 1 & 2 design docs, game data in TRAITS.MSG.
 */

import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { recomputeDerivedStats } from '../ecs/derivedStats.js'

export interface Trait {
    id: number
    name: string
    description: string
    apply(stats: StatsComponent, skills: SkillsComponent): void
    remove(stats: StatsComponent, skills: SkillsComponent): void
}

function simpleTrait(
    id: number,
    name: string,
    description: string,
    statsDeltas: Partial<Record<keyof StatsComponent, number>>,
    skillDeltas: Partial<Record<keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>, number>>,
): Trait {
    return {
        id, name, description,
        apply(s, sk) {
            for (const [k, v] of Object.entries(statsDeltas) as Array<[keyof StatsComponent, number]>) {
                (s as any)[k] += v
            }
            for (const [k, v] of Object.entries(skillDeltas) as Array<[keyof SkillsComponent, number]>) {
                (sk as any)[k] += v
            }
            recomputeDerivedStats(s)
        },
        remove(s, sk) {
            for (const [k, v] of Object.entries(statsDeltas) as Array<[keyof StatsComponent, number]>) {
                (s as any)[k] -= v
            }
            for (const [k, v] of Object.entries(skillDeltas) as Array<[keyof SkillsComponent, number]>) {
                (sk as any)[k] -= v
            }
            recomputeDerivedStats(s)
        },
    }
}

export const TRAITS: Trait[] = [
    simpleTrait(0, 'Fast Metabolism',
        'Your metabolic rate is twice normal: +2 Healing Rate, but your Radiation and Poison Resistance start at 0%.',
        { healingRateMod: 2, radiationResistanceMod: -100, poisonResistanceMod: -100 }, {}),

    simpleTrait(1, 'Bruiser',
        '+2 Strength, -2 AP. Harder hitting, but slower in combat.',
        { strengthMod: 2, maxAPMod: -2 }, {}),

    simpleTrait(2, 'Small Frame',
        'You are not quite as big as everyone else: +1 Agility, but your Carry Weight is only 25 + 15 lbs per point of Strength.',
        { agilityMod: 1, carryWeightMod: -50 }, {}),

    simpleTrait(3, 'One Hander',
        'One of your hands is very dominant: +20% to hit with one-handed weapons, -40% to hit with two-handed weapons.',
        {}, {}),
    // NOTE: a to-hit modifier, applied in combat (attackDetermineToHit), not a skill change.

    simpleTrait(4, 'Finesse',
        'Your attacks show a lot of finesse: +10% Critical Chance, but targets get +30% Damage Resistance against your attacks.',
        { criticalChanceMod: 10 }, {}),
    // NOTE: the +30 DR is applied in the damage formula.

    simpleTrait(5, 'Kamikaze',
        'By not paying attention to threats, you act faster: +5 Sequence, but you lose your natural Armor Class.',
        { sequenceMod: 5 }, {}),
    // NOTE: the natural AC loss is applied by Critter.getStat('AC').

    simpleTrait(6, 'Heavy Handed',
        'You swing harder, not better: +4 Melee Damage, but your critical hits are 30% less severe.',
        { meleeDamageMod: 4 }, {}),
    // NOTE: the -30 Better Criticals is applied by Critter.getStat.

    simpleTrait(7, 'Fast Shot',
        'You don\'t have time for a targeted attack: attacks with ranged weapons cost 1 less AP, but you cannot aim.',
        {}, {}),
    // NOTE: flags handled in attack AP cost calculation.

    simpleTrait(8, 'Bloody Mess',
        'Always see the most gruesome death animation.',
        {}, {}),

    simpleTrait(9, 'Jinxed',
        'Things just go wrong around you: every miss in combat, yours or anyone else\'s, has a 50% chance to become a critical failure.',
        {}, {}),

    simpleTrait(10, 'Good Natured',
        '+15% First Aid, Doctor, Speech, Barter; -10% to all combat skills.',
        {},
        { firstAid: 15, doctor: 15, speech: 15, barter: 15, smallGuns: -10, bigGuns: -10, energyWeapons: -10, unarmed: -10, meleeWeapons: -10, throwing: -10 }),

    simpleTrait(11, 'Chem Reliant',
        'Twice as likely to be addicted, but recovers from addiction twice as fast.',
        {}, {}),

    simpleTrait(12, 'Chem Resistant',
        'Half as likely to become addicted to chems.',
        {}, {}),

    simpleTrait(13, 'Sex Appeal',
        '+9 Charisma as far as the opposite sex is concerned.',
        {}, {}),

    simpleTrait(14, 'Skilled',
        '+5 skill points per level, but one fewer perk every level-up.',
        {}, {}),
    // NOTE: SP gain handled in level-up logic.

    simpleTrait(15, 'Gifted',
        '+1 to each SPECIAL stat, but -10% to all skills and 5 fewer skill points per level.',
        { strengthMod: 1, perceptionMod: 1, enduranceMod: 1, charismaMod: 1, intelligenceMod: 1, agilityMod: 1, luckMod: 1 },
        { smallGuns: -10, bigGuns: -10, energyWeapons: -10, unarmed: -10, meleeWeapons: -10, throwing: -10, firstAid: -10, doctor: -10, sneak: -10, lockpick: -10, steal: -10, traps: -10, science: -10, repair: -10, speech: -10, barter: -10, gambling: -10, outdoorsman: -10 }),
]

export const TRAIT_MAP: Map<number, Trait> = new Map(TRAITS.map((t) => [t.id, t]))

/**
 * Apply a set of trait IDs to a character's stats and skills.
 * Maximum of 2 traits allowed (Fallout 1 & 2 rule).
 */
export function applyTraits(
    traitIds: number[],
    stats: StatsComponent,
    skills: SkillsComponent,
): void {
    const ids = traitIds.slice(0, 2)
    for (const id of ids) {
        const trait = TRAIT_MAP.get(id)
        if (trait) {trait.apply(stats, skills)}
    }
}

export function removeTraits(
    traitIds: number[],
    stats: StatsComponent,
    skills: SkillsComponent,
): void {
    for (const id of traitIds) {
        const trait = TRAIT_MAP.get(id)
        if (trait) {trait.remove(stats, skills)}
    }
}
