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
        '+2 Healing Rate, +2 Radiation Resistance, -10 Poison Resistance. Cannot benefit as much from RadAway and Stimpaks.',
        { healingRate: 2, radiationResistance: 2, poisonResistance: -10 }, {}),

    simpleTrait(1, 'Bruiser',
        '+2 Strength, -2 AP. Harder hitting, but slower in combat.',
        { strengthMod: 2, maxAP: -2 }, {}),

    simpleTrait(2, 'Small Frame',
        '+1 Agility, -25 Carry Weight. Nimble but limited in cargo.',
        { agilityMod: 1, carryWeight: -25 }, {}),

    simpleTrait(3, 'One Hander',
        '+20% one-handed weapons skill, -40% two-handed weapons skill.',
        {}, { smallGuns: 20, bigGuns: -40, meleeWeapons: 20 }),

    simpleTrait(4, 'Finesse',
        '+10% Critical Chance, but all attacks do -30% damage.',
        { criticalChance: 10 }, {}),
    // NOTE: Finesse damage penalty is handled specially in the damage formula.

    simpleTrait(5, 'Kamikaze',
        '+10 Sequence, but -AC equal to worn armor AC bonus.',
        { sequence: 10 }, {}),
    // NOTE: AC penalty is handled in the armor equip path.

    simpleTrait(6, 'Heavy Handed',
        'Melee attacks do +4 damage but have worse critical hit results.',
        { meleeDamage: 4 }, {}),
    // NOTE: critical table penalty handled in critical hit resolution.

    simpleTrait(7, 'Fast Shot',
        'Can use ranged weapons without aiming (no called shots), costs 1 less AP per ranged attack.',
        {}, {}),
    // NOTE: flags handled in attack AP cost calculation.

    simpleTrait(8, 'Bloody Mess',
        'Always see the most gruesome death animation.',
        {}, {}),

    simpleTrait(9, 'Jinxed',
        'Both the player and nearby enemies have a higher chance of critical failures.',
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
        if (trait) trait.apply(stats, skills)
    }
}

export function removeTraits(
    traitIds: number[],
    stats: StatsComponent,
    skills: SkillsComponent,
): void {
    for (const id of traitIds) {
        const trait = TRAIT_MAP.get(id)
        if (trait) trait.remove(stats, skills)
    }
}
