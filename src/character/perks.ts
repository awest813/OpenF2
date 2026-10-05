/**
 * Perks — earned at every 3rd level (Fallout 2 default).
 *
 * Perks are persistent buffs with prerequisites (level, SPECIAL, skill).
 * This file defines all Fallout 2 perks. Fallout 1 perks are a strict subset.
 *
 * Reference: Fallout 2 PERKS.MSG, perks data in fallout2.exe.
 */

import { sfallSettings } from '../sfallSettings.js'
import { perkCanAdd } from './perkTable.js'
import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { recomputeDerivedStats } from '../ecs/derivedStats.js'
import { GAIN_STAT_PERKS, PERK_STAT_EFFECTS, PerkId, perkSkillBonusesFor } from './perkIds.js'

export { PerkId } from './perkIds.js'

type SkillKey = keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>

export interface PerkPrerequisite {
    minLevel?: number
    minStrength?: number
    minPerception?: number
    minEndurance?: number
    minCharisma?: number
    minIntelligence?: number
    minAgility?: number
    minLuck?: number
    /** Stat must be strictly below this value (negative entries in perk.cc). */
    maxStrength?: number
    maxPerception?: number
    maxEndurance?: number
    maxCharisma?: number
    maxIntelligence?: number
    maxAgility?: number
    maxLuck?: number
    minSkill?: { skill: SkillKey; value: number }
    /** Second skill gate (perk.cc param2). */
    minSkill2?: { skill: SkillKey; value: number }
    /** How minSkill and minSkill2 combine: 'and' (both) or 'or' (either). */
    skillMode?: 'and' | 'or'
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

const SKILL_ORDER = [
    'smallGuns', 'bigGuns', 'energyWeapons', 'unarmed', 'meleeWeapons', 'throwing', 'firstAid', 'doctor', 'sneak',
    'lockpick', 'steal', 'traps', 'science', 'repair', 'speech', 'barter', 'gambling', 'outdoorsman',
] as const
const SPECIAL_ORDER = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const

let gvarReader: (index: number) => number = () => 0

/** Global variables for perks whose requirement is a global variable (set by the script engine). */
export function setPerkGvarReader(read: (index: number) => number): void {
    gvarReader = read
}

/** perk.cc perkCanAdd for the player, from the ECS projection of their stats and skills. */
export function isPerkAvailable(
    perk: Perk,
    stats: StatsComponent,
    skills: SkillsComponent,
    currentRank: number,
): boolean {
    return perkCanAdd({
        isPlayer: true,
        level: stats.level,
        rank: currentRank,
        stat: (i) => {
            const key = SPECIAL_ORDER[i]
            return ((stats as any)[key] ?? 0) + ((stats as any)[key + 'Mod'] ?? 0)
        },
        skill: (i) => ((skills as any)[SKILL_ORDER[i]] as number) ?? 0,
        gvar: (i) => gvarReader(i),
    }, perk.id, sfallSettings.perkLevelMod)
}

/**
 * Mirror a perk's effect onto the ECS projection so prerequisite checks made
 * between Critter→ECS syncs see it. The Critter (object.ts getStat/getSkill)
 * applies the authoritative, dynamic effect.
 */
function applyPerkToEcs(id: number, s: StatsComponent, sk: SkillsComponent): void {
    const effect = PERK_STAT_EFFECTS.get(id)
    if (effect) {
        switch (effect.stat) {
            case 'Melee': s.meleeDamageMod += effect.perRank; break
            case 'Sequence': s.sequenceMod += effect.perRank; break
            case 'Healing Rate': s.healingRateMod += effect.perRank; break
            case 'Critical Chance': s.criticalChanceMod += effect.perRank; break
            case 'DR Radiation': s.radiationResistanceMod += effect.perRank; break
            case 'DR Poison': s.poisonResistanceMod += effect.perRank; break
            case 'DR Normal': s.dr.normal += effect.perRank; break
            case 'Carry': s.carryWeightMod += effect.perRank; break
            case 'AP': s.maxAPMod += effect.perRank; break
            default: break
        }
    }
    const gain = GAIN_STAT_PERKS.get(id)
    if (gain) {
        const key = ({ STR: 'strength', PER: 'perception', END: 'endurance', CHA: 'charisma',
            INT: 'intelligence', AGI: 'agility', LUK: 'luck' } as const)[gain as 'STR']
        ;(s as any)[key] += 1
    }
    if (id === PerkId.LIFEGIVER) {s.maxHpMod += 4}
    for (const [skill, bonus] of Object.entries(perkSkillBonusesFor(id))) {
        ;(sk as any)[skill] += bonus
    }
    recomputeDerivedStats(s)
}

// ---------------------------------------------------------------------------
// Perk definitions — every player-selectable Fallout 2 perk, keyed by the
// engine perk ID. Ranks, level and prerequisites mirror perk.cc.
// ---------------------------------------------------------------------------

export const PERKS: Perk[] = [
    {
        id: PerkId.AWARENESS, name: 'Awareness', ranks: 1,
        description: 'With Awareness, you are given detailed information about any critter you examine: their hit points and the weapon they are equipped with.',
        prerequisites: { minLevel: 3, minPerception: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.AWARENESS, s, sk) },
    },
    {
        id: PerkId.BONUS_HTH_ATTACKS, name: 'Bonus HtH Attacks', ranks: 1,
        description: 'You have learned the secret arts of the East, or you just punch faster. Hand-to-hand and melee attacks cost 1 less Action Point.',
        prerequisites: { minLevel: 15, minAgility: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.BONUS_HTH_ATTACKS, s, sk) },
    },
    {
        id: PerkId.BONUS_HTH_DAMAGE, name: 'Bonus HtH Damage', ranks: 3,
        description: 'Experience in unarmed and melee combat gives you +2 Melee Damage per level of this perk.',
        prerequisites: { minLevel: 3, minStrength: 6, minAgility: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.BONUS_HTH_DAMAGE, s, sk) },
    },
    {
        id: PerkId.BONUS_MOVE, name: 'Bonus Move', ranks: 2,
        description: 'For each level of this perk, you get 2 extra Action Points each combat turn that can only be used for movement.',
        prerequisites: { minLevel: 6, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.BONUS_MOVE, s, sk) },
    },
    {
        id: PerkId.BONUS_RANGED_DAMAGE, name: 'Bonus Ranged Damage', ranks: 2,
        description: 'Your training with ranged weapons adds +2 points of damage per bullet per level of this perk.',
        prerequisites: { minLevel: 6, minAgility: 6, minLuck: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.BONUS_RANGED_DAMAGE, s, sk) },
    },
    {
        id: PerkId.BONUS_RATE_OF_FIRE, name: 'Bonus Rate of Fire', ranks: 1,
        description: 'Ranged weapon attacks cost 1 less Action Point.',
        prerequisites: { minLevel: 15, minPerception: 6, minIntelligence: 6, minAgility: 7 },
        apply(s, sk) { applyPerkToEcs(PerkId.BONUS_RATE_OF_FIRE, s, sk) },
    },
    {
        id: PerkId.EARLIER_SEQUENCE, name: 'Earlier Sequence', ranks: 3,
        description: 'You are more likely to move before your opponents in combat: +2 Sequence per level of this perk.',
        prerequisites: { minLevel: 3, minPerception: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.EARLIER_SEQUENCE, s, sk) },
    },
    {
        id: PerkId.FASTER_HEALING, name: 'Faster Healing', ranks: 3,
        description: 'You heal faster: +2 Healing Rate per level of this perk.',
        prerequisites: { minLevel: 3, minEndurance: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.FASTER_HEALING, s, sk) },
    },
    {
        id: PerkId.MORE_CRITICALS, name: 'More Criticals', ranks: 3,
        description: 'You are more likely to cause critical hits in combat: +5% Critical Chance per level of this perk.',
        prerequisites: { minLevel: 6, minLuck: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.MORE_CRITICALS, s, sk) },
    },
    {
        id: PerkId.NIGHT_VISION, name: 'Night Vision', ranks: 1,
        description: 'With Night Vision, you can see better in the dark: darkness penalizes your attacks less.',
        prerequisites: { minLevel: 3, minPerception: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.NIGHT_VISION, s, sk) },
    },
    {
        id: PerkId.PRESENCE, name: 'Presence', ranks: 3,
        description: 'People are more likely to react favorably to you: +10% initial reaction per level of this perk.',
        prerequisites: { minLevel: 3, minCharisma: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.PRESENCE, s, sk) },
    },
    {
        id: PerkId.RAD_RESISTANCE, name: 'Rad Resistance', ranks: 2,
        description: 'You are better able to avoid radiation: +15% Radiation Resistance per level of this perk.',
        prerequisites: { minLevel: 6, minEndurance: 6, minIntelligence: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.RAD_RESISTANCE, s, sk) },
    },
    {
        id: PerkId.TOUGHNESS, name: 'Toughness', ranks: 3,
        description: 'You are tougher than the average person: +10% Damage Resistance (normal) per level of this perk.',
        prerequisites: { minLevel: 3, minEndurance: 6, minLuck: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.TOUGHNESS, s, sk) },
    },
    {
        id: PerkId.STRONG_BACK, name: 'Strong Back', ranks: 3,
        description: 'You can carry an extra 50 lbs. of equipment per level of this perk.',
        prerequisites: { minLevel: 3, minStrength: 6, minEndurance: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.STRONG_BACK, s, sk) },
    },
    {
        id: PerkId.SHARPSHOOTER, name: 'Sharpshooter', ranks: 1,
        description: 'You have a talent for hitting things at longer distances: +2 Perception for the purposes of ranged attack distance.',
        prerequisites: { minLevel: 9, minPerception: 7, minIntelligence: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.SHARPSHOOTER, s, sk) },
    },
    {
        id: PerkId.SILENT_RUNNING, name: 'Silent Running', ranks: 1,
        description: 'You can run while sneaking without penalty.',
        prerequisites: { minLevel: 6, minAgility: 6, minSkill: { skill: 'sneak', value: 50 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SILENT_RUNNING, s, sk) },
    },
    {
        id: PerkId.SURVIVALIST, name: 'Survivalist', ranks: 1,
        description: 'You are a master of the outdoors: +25% to Outdoorsman.',
        prerequisites: { minLevel: 3, minEndurance: 6, minIntelligence: 6, minSkill: { skill: 'outdoorsman', value: 40 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SURVIVALIST, s, sk) },
    },
    {
        id: PerkId.MASTER_TRADER, name: 'Master Trader', ranks: 1,
        description: 'You have mastered one aspect of bartering: buying goods far more cheaply than normal (25% discount).',
        prerequisites: { minLevel: 12, minCharisma: 7, minSkill: { skill: 'barter', value: 75 } },
        apply(s, sk) { applyPerkToEcs(PerkId.MASTER_TRADER, s, sk) },
    },
    {
        id: PerkId.EDUCATED, name: 'Educated', ranks: 3,
        description: 'You gain +2 skill points every time you advance a level, per level of this perk.',
        prerequisites: { minLevel: 6, minIntelligence: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.EDUCATED, s, sk) },
    },
    {
        id: PerkId.HEALER, name: 'Healer', ranks: 2,
        description: 'The healing of bodies comes easier to you: +4-10 hit points healed with First Aid and Doctor per level of this perk.',
        prerequisites: { minLevel: 3, minPerception: 7, minIntelligence: 5, minAgility: 6, minSkill: { skill: 'firstAid', value: 40 } },
        apply(s, sk) { applyPerkToEcs(PerkId.HEALER, s, sk) },
    },
    {
        id: PerkId.FORTUNE_FINDER, name: 'Fortune Finder', ranks: 1,
        description: 'You have the talent of finding money: more money in random encounters.',
        prerequisites: { minLevel: 6, minLuck: 8 },
        apply(s, sk) { applyPerkToEcs(PerkId.FORTUNE_FINDER, s, sk) },
    },
    {
        id: PerkId.BETTER_CRITICALS, name: 'Better Criticals', ranks: 1,
        description: 'The critical hits you cause in combat are more devastating: +20% to the critical hit table roll.',
        prerequisites: { minLevel: 9, minPerception: 6, minAgility: 4, minLuck: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.BETTER_CRITICALS, s, sk) },
    },
    {
        id: PerkId.EMPATHY, name: 'Empathy', ranks: 1,
        description: 'You have studied other people: the best and worst dialogue replies are highlighted.',
        prerequisites: { minLevel: 6, minPerception: 7, minIntelligence: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.EMPATHY, s, sk) },
    },
    {
        id: PerkId.SLAYER, name: 'Slayer', ranks: 1,
        description: 'The Slayer walks the earth! In hand-to-hand combat, all of your successful hits are upgraded to critical hits.',
        prerequisites: { minLevel: 24, minStrength: 8, minAgility: 8, minSkill: { skill: 'unarmed', value: 80 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SLAYER, s, sk) },
    },
    {
        id: PerkId.SNIPER, name: 'Sniper', ranks: 1,
        description: 'You have mastered the firearm as a source of pain. Any successful ranged hit has a chance (d10 against your Luck) of being upgraded to a critical hit.',
        prerequisites: { minLevel: 24, minPerception: 8, minAgility: 8, minSkill: { skill: 'smallGuns', value: 80 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SNIPER, s, sk) },
    },
    {
        id: PerkId.SILENT_DEATH, name: 'Silent Death', ranks: 1,
        description: 'While sneaking, if you hit an opponent in the back with a hand-to-hand attack, you do double damage.',
        prerequisites: { minLevel: 18, minAgility: 10, minSkill: { skill: 'sneak', value: 80 }, minSkill2: { skill: 'unarmed', value: 80 }, skillMode: 'or' },
        apply(s, sk) { applyPerkToEcs(PerkId.SILENT_DEATH, s, sk) },
    },
    {
        id: PerkId.ACTION_BOY, name: 'Action Boy', ranks: 2,
        description: 'Each level of Action Boy gives you an additional Action Point to spend every combat turn.',
        prerequisites: { minLevel: 12, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.ACTION_BOY, s, sk) },
    },
    {
        id: PerkId.MENTAL_BLOCK, name: 'Mental Block', ranks: 1,
        description: 'You have learned to control your mind: resistance to mental intrusion.',
        prerequisites: { minLevel: 310 },
        apply(s, sk) { applyPerkToEcs(PerkId.MENTAL_BLOCK, s, sk) },
    },
    {
        id: PerkId.LIFEGIVER, name: 'Lifegiver', ranks: 2,
        description: 'You gain an additional 4 hit points every time you advance a level, per level of this perk.',
        prerequisites: { minLevel: 12, minEndurance: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.LIFEGIVER, s, sk) },
    },
    {
        id: PerkId.DODGER, name: 'Dodger', ranks: 1,
        description: 'You are less likely to be hit in combat: +5 Armor Class.',
        prerequisites: { minLevel: 9, minAgility: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.DODGER, s, sk) },
    },
    {
        id: PerkId.SNAKEATER, name: 'Snakeater', ranks: 2,
        description: 'You have built up an immunity to poison: +25% Poison Resistance per level of this perk.',
        prerequisites: { minLevel: 6, minEndurance: 3 },
        apply(s, sk) { applyPerkToEcs(PerkId.SNAKEATER, s, sk) },
    },
    {
        id: PerkId.MR_FIXIT, name: 'Mr. Fixit', ranks: 1,
        description: 'This perk gives you +10% to Repair and Science.',
        prerequisites: { minLevel: 12, minSkill: { skill: 'repair', value: 40 }, minSkill2: { skill: 'science', value: 40 }, skillMode: 'and' },
        apply(s, sk) { applyPerkToEcs(PerkId.MR_FIXIT, s, sk) },
    },
    {
        id: PerkId.MEDIC, name: 'Medic', ranks: 1,
        description: 'This perk gives you +10% to First Aid and Doctor.',
        prerequisites: { minLevel: 12, minSkill: { skill: 'firstAid', value: 40 }, minSkill2: { skill: 'doctor', value: 40 }, skillMode: 'and' },
        apply(s, sk) { applyPerkToEcs(PerkId.MEDIC, s, sk) },
    },
    {
        id: PerkId.MASTER_THIEF, name: 'Master Thief', ranks: 1,
        description: 'A little extra edge at the thieving arts: +15% to Lockpick and Steal.',
        prerequisites: { minLevel: 12, minSkill: { skill: 'steal', value: 50 }, minSkill2: { skill: 'lockpick', value: 50 }, skillMode: 'or' },
        apply(s, sk) { applyPerkToEcs(PerkId.MASTER_THIEF, s, sk) },
    },
    {
        id: PerkId.SPEAKER, name: 'Speaker', ranks: 1,
        description: 'Being an expert speaker means you gain +20% to Speech.',
        prerequisites: { minLevel: 9, minSkill: { skill: 'speech', value: 50 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SPEAKER, s, sk) },
    },
    {
        id: PerkId.HEAVE_HO, name: 'Heave Ho!', ranks: 3,
        description: 'Each level of this perk gives you +2 Strength for purposes of determining range with thrown weapons only.',
        prerequisites: { minLevel: 6, maxStrength: 9 },
        apply(s, sk) { applyPerkToEcs(PerkId.HEAVE_HO, s, sk) },
    },
    {
        id: PerkId.FRIENDLY_FOE, name: 'Friendly Foe', ranks: 1,
        description: 'You can detect friends from foes in combat: friends are highlighted in green.',
        prerequisites: { minLevel: 310, minPerception: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.FRIENDLY_FOE, s, sk) },
    },
    {
        id: PerkId.PICKPOCKET, name: 'Pickpocket', ranks: 1,
        description: 'You are much more adept at stealing: size and facing modifiers are ignored when stealing.',
        prerequisites: { minLevel: 15, minAgility: 8, minSkill: { skill: 'steal', value: 80 } },
        apply(s, sk) { applyPerkToEcs(PerkId.PICKPOCKET, s, sk) },
    },
    {
        id: PerkId.GHOST, name: 'Ghost', ranks: 1,
        description: 'When the sun sets or in poorly lit areas, you move like a ghost: +20% to Sneak.',
        prerequisites: { minLevel: 6, minSkill: { skill: 'sneak', value: 60 } },
        apply(s, sk) { applyPerkToEcs(PerkId.GHOST, s, sk) },
    },
    {
        id: PerkId.CULT_OF_PERSONALITY, name: 'Cult Of Personality', ranks: 1,
        description: 'Everyone likes you: your karma is always treated as positive in reactions.',
        prerequisites: { minLevel: 12, minCharisma: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.CULT_OF_PERSONALITY, s, sk) },
    },
    {
        id: PerkId.SCROUNGER, name: 'Scrounger', ranks: 1,
        description: 'You can find more ammo than the normal post-nuclear survivor.',
        prerequisites: { minLevel: 310, minLuck: 8 },
        apply(s, sk) { applyPerkToEcs(PerkId.SCROUNGER, s, sk) },
    },
    {
        id: PerkId.EXPLORER, name: 'Explorer', ranks: 1,
        description: 'The mark of the Explorer is to find more special encounters on the world map.',
        prerequisites: { minLevel: 9 },
        apply(s, sk) { applyPerkToEcs(PerkId.EXPLORER, s, sk) },
    },
    {
        id: PerkId.FLOWER_CHILD, name: 'Flower Child', ranks: 1,
        description: 'You are less likely to be addicted to chems and your withdrawal time is halved.',
        prerequisites: { minLevel: 310, minEndurance: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.FLOWER_CHILD, s, sk) },
    },
    {
        id: PerkId.PATHFINDER, name: 'Pathfinder', ranks: 2,
        description: 'The Pathfinder is better able to find the shortest route: world map travel time is reduced by 25% per level of this perk.',
        prerequisites: { minLevel: 6, minEndurance: 6, minSkill: { skill: 'outdoorsman', value: 40 } },
        apply(s, sk) { applyPerkToEcs(PerkId.PATHFINDER, s, sk) },
    },
    {
        id: PerkId.ANIMAL_FRIEND, name: 'Animal Friend', ranks: 1,
        description: 'Animals will not attack you unless you attack them first.',
        prerequisites: { minLevel: 310, minIntelligence: 5, minSkill: { skill: 'outdoorsman', value: 25 } },
        apply(s, sk) { applyPerkToEcs(PerkId.ANIMAL_FRIEND, s, sk) },
    },
    {
        id: PerkId.SCOUT, name: 'Scout', ranks: 1,
        description: 'You have improved your ability to see distant locations: the world map view radius increases by one square.',
        prerequisites: { minLevel: 3, minPerception: 7 },
        apply(s, sk) { applyPerkToEcs(PerkId.SCOUT, s, sk) },
    },
    {
        id: PerkId.MYSTERIOUS_STRANGER, name: 'Mysterious Stranger', ranks: 1,
        description: 'You have gained the attention of a Mysterious Stranger, who may appear to aid you in random encounters.',
        prerequisites: { minLevel: 9, minLuck: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.MYSTERIOUS_STRANGER, s, sk) },
    },
    {
        id: PerkId.RANGER, name: 'Ranger', ranks: 1,
        description: 'You gain +15% to Outdoorsman and find fewer hostile random encounters.',
        prerequisites: { minLevel: 6, minPerception: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.RANGER, s, sk) },
    },
    {
        id: PerkId.QUICK_POCKETS, name: 'Quick Pockets', ranks: 1,
        description: 'You have learned to pack your equipment better: accessing your inventory in combat costs 2 Action Points instead of 4.',
        prerequisites: { minLevel: 3, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.QUICK_POCKETS, s, sk) },
    },
    {
        id: PerkId.SMOOTH_TALKER, name: 'Smooth Talker', ranks: 3,
        description: 'A Smooth Talker is treated as having +1 Intelligence for dialogue purposes per level of this perk.',
        prerequisites: { minLevel: 3, minIntelligence: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.SMOOTH_TALKER, s, sk) },
    },
    {
        id: PerkId.SWIFT_LEARNER, name: 'Swift Learner', ranks: 3,
        description: 'You gain 5% more experience per level of this perk whenever experience is earned.',
        prerequisites: { minLevel: 3, minIntelligence: 4 },
        apply(s, sk) { applyPerkToEcs(PerkId.SWIFT_LEARNER, s, sk) },
    },
    {
        id: PerkId.TAG, name: 'Tag!', ranks: 1,
        description: 'Your skills have improved to the point where you can choose an extra tag skill.',
        prerequisites: { minLevel: 12 },
        apply(s, sk) { applyPerkToEcs(PerkId.TAG, s, sk) },
    },
    {
        id: PerkId.MUTATE, name: 'Mutate', ranks: 1,
        description: 'The radiation has changed you: you may swap one trait for another.',
        prerequisites: { minLevel: 9 },
        apply(s, sk) { applyPerkToEcs(PerkId.MUTATE, s, sk) },
    },
    {
        id: PerkId.ADRENALINE_RUSH, name: 'Adrenaline Rush', ranks: 1,
        description: 'With this perk you gain +1 Strength when your hit points drop below 50% of maximum.',
        prerequisites: { minLevel: 6, maxStrength: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.ADRENALINE_RUSH, s, sk) },
    },
    {
        id: PerkId.CAUTIOUS_NATURE, name: 'Cautious Nature', ranks: 1,
        description: 'You are more careful: +3 Perception when determining placement in random encounters.',
        prerequisites: { minLevel: 3, minPerception: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.CAUTIOUS_NATURE, s, sk) },
    },
    {
        id: PerkId.COMPREHENSION, name: 'Comprehension', ranks: 1,
        description: 'You gain 50% more skill points from reading books.',
        prerequisites: { minLevel: 3, minIntelligence: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.COMPREHENSION, s, sk) },
    },
    {
        id: PerkId.DEMOLITION_EXPERT, name: 'Demolition Expert', ranks: 1,
        description: 'You are an expert with explosives: they do more damage and always go off on time.',
        prerequisites: { minLevel: 9, minAgility: 4, minSkill: { skill: 'traps', value: 75 } },
        apply(s, sk) { applyPerkToEcs(PerkId.DEMOLITION_EXPERT, s, sk) },
    },
    {
        id: PerkId.GAMBLER, name: 'Gambler', ranks: 1,
        description: 'You gain +20% to Gambling.',
        prerequisites: { minLevel: 6, minSkill: { skill: 'gambling', value: 50 } },
        apply(s, sk) { applyPerkToEcs(PerkId.GAMBLER, s, sk) },
    },
    {
        id: PerkId.GAIN_STRENGTH, name: 'Gain Strength', ranks: 1,
        description: 'With this perk you gain +1 to Strength.',
        prerequisites: { minLevel: 12, maxStrength: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_STRENGTH, s, sk) },
    },
    {
        id: PerkId.GAIN_PERCEPTION, name: 'Gain Perception', ranks: 1,
        description: 'With this perk you gain +1 to Perception.',
        prerequisites: { minLevel: 12, maxPerception: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_PERCEPTION, s, sk) },
    },
    {
        id: PerkId.GAIN_ENDURANCE, name: 'Gain Endurance', ranks: 1,
        description: 'With this perk you gain +1 to Endurance.',
        prerequisites: { minLevel: 12, maxEndurance: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_ENDURANCE, s, sk) },
    },
    {
        id: PerkId.GAIN_CHARISMA, name: 'Gain Charisma', ranks: 1,
        description: 'With this perk you gain +1 to Charisma.',
        prerequisites: { minLevel: 12, maxCharisma: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_CHARISMA, s, sk) },
    },
    {
        id: PerkId.GAIN_INTELLIGENCE, name: 'Gain Intelligence', ranks: 1,
        description: 'With this perk you gain +1 to Intelligence.',
        prerequisites: { minLevel: 12, maxIntelligence: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_INTELLIGENCE, s, sk) },
    },
    {
        id: PerkId.GAIN_AGILITY, name: 'Gain Agility', ranks: 1,
        description: 'With this perk you gain +1 to Agility.',
        prerequisites: { minLevel: 12, maxAgility: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_AGILITY, s, sk) },
    },
    {
        id: PerkId.GAIN_LUCK, name: 'Gain Luck', ranks: 1,
        description: 'With this perk you gain +1 to Luck.',
        prerequisites: { minLevel: 12, maxLuck: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.GAIN_LUCK, s, sk) },
    },
    {
        id: PerkId.HARMLESS, name: 'Harmless', ranks: 1,
        description: 'Your innocent demeanor makes stealing easier: +20% to Steal.',
        prerequisites: { minLevel: 6, minSkill: { skill: 'steal', value: 50 } },
        apply(s, sk) { applyPerkToEcs(PerkId.HARMLESS, s, sk) },
    },
    {
        id: PerkId.HERE_AND_NOW, name: 'Here and Now', ranks: 1,
        description: 'With this perk you immediately gain enough experience to advance to the next level.',
        prerequisites: { minLevel: 3 },
        apply(s, sk) { applyPerkToEcs(PerkId.HERE_AND_NOW, s, sk) },
    },
    {
        id: PerkId.HTH_EVADE, name: 'HtH Evade', ranks: 1,
        description: 'If you have no weapon in either hand, each unused Action Point is worth 2 Armor Class instead of 1, plus 1/12 of your Unarmed skill.',
        prerequisites: { minLevel: 12, minSkill: { skill: 'unarmed', value: 75 } },
        apply(s, sk) { applyPerkToEcs(PerkId.HTH_EVADE, s, sk) },
    },
    {
        id: PerkId.KAMA_SUTRA_MASTER, name: 'Kama Sutra Master', ranks: 1,
        description: 'You have mastered the arts of love: improved stamina and success in amorous encounters.',
        prerequisites: { minLevel: 3, minEndurance: 5, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.KAMA_SUTRA_MASTER, s, sk) },
    },
    {
        id: PerkId.KARMA_BEACON, name: 'Karma Beacon', ranks: 1,
        description: 'Your karma is doubled for purposes of NPC reactions.',
        prerequisites: { minLevel: 9, minCharisma: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.KARMA_BEACON, s, sk) },
    },
    {
        id: PerkId.LIGHT_STEP, name: 'Light Step', ranks: 1,
        description: 'You are agile and lucky: you have a 50% lesser chance of setting off a trap.',
        prerequisites: { minLevel: 9, minAgility: 5, minLuck: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.LIGHT_STEP, s, sk) },
    },
    {
        id: PerkId.LIVING_ANATOMY, name: 'Living Anatomy', ranks: 1,
        description: 'You have a better understanding of living creatures: +10% to Doctor and +5 damage to living creatures.',
        prerequisites: { minLevel: 12, minSkill: { skill: 'doctor', value: 60 } },
        apply(s, sk) { applyPerkToEcs(PerkId.LIVING_ANATOMY, s, sk) },
    },
    {
        id: PerkId.MAGNETIC_PERSONALITY, name: 'Magnetic Personality', ranks: 1,
        description: 'You are naturally attractive to others: +1 to the number of companions you can have.',
        prerequisites: { minLevel: 6, maxCharisma: 10 },
        apply(s, sk) { applyPerkToEcs(PerkId.MAGNETIC_PERSONALITY, s, sk) },
    },
    {
        id: PerkId.NEGOTIATOR, name: 'Negotiator', ranks: 1,
        description: 'You are a very skilled negotiator: +10% to Barter and Speech.',
        prerequisites: { minLevel: 6, minSkill: { skill: 'barter', value: 50 }, minSkill2: { skill: 'speech', value: 50 }, skillMode: 'or' },
        apply(s, sk) { applyPerkToEcs(PerkId.NEGOTIATOR, s, sk) },
    },
    {
        id: PerkId.PACK_RAT, name: 'Pack Rat', ranks: 1,
        description: 'You are better at packing equipment: +50 lbs. carry weight.',
        prerequisites: { minLevel: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.PACK_RAT, s, sk) },
    },
    {
        id: PerkId.PYROMANIAC, name: 'Pyromaniac', ranks: 1,
        description: 'You do +5 damage with fire-based weapons.',
        prerequisites: { minLevel: 9, minSkill: { skill: 'bigGuns', value: 75 } },
        apply(s, sk) { applyPerkToEcs(PerkId.PYROMANIAC, s, sk) },
    },
    {
        id: PerkId.QUICK_RECOVERY, name: 'Quick Recovery', ranks: 1,
        description: 'You are quick at recovering from being knocked down: standing up costs 1 Action Point instead of 3.',
        prerequisites: { minLevel: 6, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.QUICK_RECOVERY, s, sk) },
    },
    {
        id: PerkId.SALESMAN, name: 'Salesman', ranks: 1,
        description: 'You are an adept salesperson: +20% to Barter.',
        prerequisites: { minLevel: 6, minSkill: { skill: 'barter', value: 50 } },
        apply(s, sk) { applyPerkToEcs(PerkId.SALESMAN, s, sk) },
    },
    {
        id: PerkId.STONEWALL, name: 'Stonewall', ranks: 1,
        description: 'You are much less likely to be knocked down or knocked back in combat.',
        prerequisites: { minLevel: 3, minStrength: 6 },
        apply(s, sk) { applyPerkToEcs(PerkId.STONEWALL, s, sk) },
    },
    {
        id: PerkId.THIEF, name: 'Thief', ranks: 1,
        description: 'The blood of a thief runs through your veins: +10% to Sneak, Lockpick, Steal and Traps.',
        prerequisites: { minLevel: 3 },
        apply(s, sk) { applyPerkToEcs(PerkId.THIEF, s, sk) },
    },
    {
        id: PerkId.WEAPON_HANDLING, name: 'Weapon Handling', ranks: 1,
        description: 'You treat your Strength as 3 points higher for purposes of weapon Strength requirements.',
        prerequisites: { minLevel: 12, maxStrength: 7, minAgility: 5 },
        apply(s, sk) { applyPerkToEcs(PerkId.WEAPON_HANDLING, s, sk) },
    },
]

export const PERK_MAP: Map<number, Perk> = new Map(PERKS.map((p) => [p.id, p]))

/** Educated is FO2 perk 18 (perk_defs.h). */
export const EDUCATED_PERK_IDS = [PerkId.EDUCATED] as const

/** Total ranks of Educated across known ID aliases. */
export function educatedPerkRanks(perkRanks: Record<number, number> | null | undefined): number {
    if (!perkRanks) return 0
    let best = 0
    for (const id of EDUCATED_PERK_IDS) {
        best = Math.max(best, perkRanks[id] ?? 0)
    }
    return best
}

/**
 * Returns all perks available to the player at their current level/stats.
 */
export function getAvailablePerks(
    stats: StatsComponent,
    skills: SkillsComponent,
    currentPerks: Map<number, number>,  // perkId → current rank
): Perk[] {
    const real = sfallSettings.hideRealPerks ? [] : PERKS.filter((p) => {
        const rank = currentPerks.get(p.id) ?? 0
        return isPerkAvailable(p, stats, skills, rank)
    })
    return real.concat(selectablePerks())
}

/** The first number the perk box gives sfall's selectable perks (PERK_count). */
export const FAKE_PERK_START = 119

/** sfall set_selectable_perk entries for the player, as perks for the perk box. */
export function selectablePerks(): Perk[] {
    return [...sfallSettings.selectablePerks.values()]
        .filter((p) => p.owner === 0)
        .map((p, i) => ({
            id: FAKE_PERK_START + i, name: p.name, description: p.desc, ranks: 1, prerequisites: {},
            apply() {},
        }))
}

export function isFakePerkId(id: number): boolean {
    return id >= FAKE_PERK_START
}

/**
 * Perks.cpp AddFakePerk: a chosen selectable perk becomes a fake trait
 * (perk_add_mode bit 1), a fake perk or another level of it (bit 2), and
 * leaves the box (bit 4).
 */
export function chooseSelectablePerk(id: number): boolean {
    const entries = [...sfallSettings.selectablePerks.entries()].filter(([, p]) => p.owner === 0)
    const entry = entries[id - FAKE_PERK_START]
    if (!entry) {return false}
    const [key, chosen] = entry
    const mode = sfallSettings.perkAddMode
    if (mode & 1 && !sfallSettings.fakeTraits.has(key)) {sfallSettings.fakeTraits.set(key, { ...chosen })}
    if (mode & 2) {
        const held = sfallSettings.fakePerks.get(key)
        if (held) {held.level++}
        else {sfallSettings.fakePerks.set(key, { ...chosen })}
    }
    if (mode & 4) {sfallSettings.selectablePerks.delete(key)}
    return true
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
    if (isFakePerkId(perkId)) {return chooseSelectablePerk(perkId)}
    const perk = PERK_MAP.get(perkId)
    if (!perk) {return false}

    const rank = currentPerks.get(perkId) ?? 0
    if (!isPerkAvailable(perk, stats, skills, rank)) {return false}

    const newRank = rank + 1
    currentPerks.set(perkId, newRank)
    perk.apply(stats, skills, newRank)
    recomputeDerivedStats(stats)
    return true
}
