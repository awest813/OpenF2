/**
 * Canonical Fallout 2 perk IDs and per-rank stat effects.
 *
 * These numbers are the engine's `Perk` enum (perk_defs.h) — the same IDs
 * scripts pass to `has_trait(TRAIT_PERK, …)` / `critter_add_trait`, and the
 * same IDs stored in a weapon proto's `perk` field (Long Range, Scope Range,
 * Accurate, …). Every `perkRanks` lookup in the engine must use these.
 */

export const PerkId = {
    AWARENESS: 0,
    BONUS_HTH_ATTACKS: 1,
    BONUS_HTH_DAMAGE: 2,
    BONUS_MOVE: 3,
    BONUS_RANGED_DAMAGE: 4,
    BONUS_RATE_OF_FIRE: 5,
    EARLIER_SEQUENCE: 6,
    FASTER_HEALING: 7,
    MORE_CRITICALS: 8,
    NIGHT_VISION: 9,
    PRESENCE: 10,
    RAD_RESISTANCE: 11,
    TOUGHNESS: 12,
    STRONG_BACK: 13,
    SHARPSHOOTER: 14,
    SILENT_RUNNING: 15,
    SURVIVALIST: 16,
    MASTER_TRADER: 17,
    EDUCATED: 18,
    HEALER: 19,
    FORTUNE_FINDER: 20,
    BETTER_CRITICALS: 21,
    EMPATHY: 22,
    SLAYER: 23,
    SNIPER: 24,
    SILENT_DEATH: 25,
    ACTION_BOY: 26,
    MENTAL_BLOCK: 27,
    LIFEGIVER: 28,
    DODGER: 29,
    SNAKEATER: 30,
    MR_FIXIT: 31,
    MEDIC: 32,
    MASTER_THIEF: 33,
    SPEAKER: 34,
    HEAVE_HO: 35,
    FRIENDLY_FOE: 36,
    PICKPOCKET: 37,
    GHOST: 38,
    CULT_OF_PERSONALITY: 39,
    SCROUNGER: 40,
    EXPLORER: 41,
    FLOWER_CHILD: 42,
    PATHFINDER: 43,
    ANIMAL_FRIEND: 44,
    SCOUT: 45,
    MYSTERIOUS_STRANGER: 46,
    RANGER: 47,
    QUICK_POCKETS: 48,
    SMOOTH_TALKER: 49,
    SWIFT_LEARNER: 50,
    TAG: 51,
    MUTATE: 52,
    NUKA_COLA_ADDICTION: 53,
    BUFFOUT_ADDICTION: 54,
    MENTATS_ADDICTION: 55,
    PSYCHO_ADDICTION: 56,
    RADAWAY_ADDICTION: 57,
    WEAPON_LONG_RANGE: 58,
    WEAPON_ACCURATE: 59,
    WEAPON_PENETRATE: 60,
    WEAPON_KNOCKBACK: 61,
    POWERED_ARMOR: 62,
    COMBAT_ARMOR: 63,
    WEAPON_SCOPE_RANGE: 64,
    WEAPON_FAST_RELOAD: 65,
    WEAPON_NIGHT_SIGHT: 66,
    WEAPON_FLAMEBOY: 67,
    ARMOR_ADVANCED_I: 68,
    ARMOR_ADVANCED_II: 69,
    JET_ADDICTION: 70,
    TRAGIC_ADDICTION: 71,
    ARMOR_CHARISMA: 72,
    GECKO_SKINNING: 73,
    DERMAL_IMPACT_ARMOR: 74,
    DERMAL_IMPACT_ASSAULT_ENHANCEMENT: 75,
    PHOENIX_ARMOR_IMPLANTS: 76,
    PHOENIX_ASSAULT_ENHANCEMENT: 77,
    VAULT_CITY_INOCULATIONS: 78,
    ADRENALINE_RUSH: 79,
    CAUTIOUS_NATURE: 80,
    COMPREHENSION: 81,
    DEMOLITION_EXPERT: 82,
    GAMBLER: 83,
    GAIN_STRENGTH: 84,
    GAIN_PERCEPTION: 85,
    GAIN_ENDURANCE: 86,
    GAIN_CHARISMA: 87,
    GAIN_INTELLIGENCE: 88,
    GAIN_AGILITY: 89,
    GAIN_LUCK: 90,
    HARMLESS: 91,
    HERE_AND_NOW: 92,
    HTH_EVADE: 93,
    KAMA_SUTRA_MASTER: 94,
    KARMA_BEACON: 95,
    LIGHT_STEP: 96,
    LIVING_ANATOMY: 97,
    MAGNETIC_PERSONALITY: 98,
    NEGOTIATOR: 99,
    PACK_RAT: 100,
    PYROMANIAC: 101,
    QUICK_RECOVERY: 102,
    SALESMAN: 103,
    STONEWALL: 104,
    THIEF: 105,
    WEAPON_HANDLING: 106,
    VAULT_CITY_TRAINING: 107,
    ALCOHOL_RAISED_HIT_POINTS: 108,
    ALCOHOL_RAISED_HIT_POINTS_II: 109,
    ALCOHOL_LOWERED_HIT_POINTS: 110,
    ALCOHOL_LOWERED_HIT_POINTS_II: 111,
    AUTODOC_RAISED_HIT_POINTS: 112,
    AUTODOC_RAISED_HIT_POINTS_II: 113,
    AUTODOC_LOWERED_HIT_POINTS: 114,
    AUTODOC_LOWERED_HIT_POINTS_II: 115,
    EXPERT_EXCREMENT_EXPEDITOR: 116,
    WEAPON_ENHANCED_KNOCKOUT: 117,
    JINXED: 118,
} as const

export type PerkIdValue = (typeof PerkId)[keyof typeof PerkId]

/**
 * Per-rank stat bonus granted by a perk (perk.cc gPerkDescriptions `stat` /
 * `statModifier`), keyed by this engine's stat names. Only the perks whose
 * description table names a stat appear here; addiction and armor "perks"
 * are excluded because the drug / armor systems apply their own effects.
 */
export const PERK_STAT_EFFECTS: ReadonlyMap<number, { stat: string; perRank: number }> = new Map([
    [PerkId.BONUS_HTH_DAMAGE, { stat: 'Melee', perRank: 2 }],
    [PerkId.EARLIER_SEQUENCE, { stat: 'Sequence', perRank: 2 }],
    [PerkId.FASTER_HEALING, { stat: 'Healing Rate', perRank: 2 }],
    [PerkId.MORE_CRITICALS, { stat: 'Critical Chance', perRank: 5 }],
    [PerkId.RAD_RESISTANCE, { stat: 'DR Radiation', perRank: 15 }],
    [PerkId.TOUGHNESS, { stat: 'DR Normal', perRank: 10 }],
    [PerkId.STRONG_BACK, { stat: 'Carry', perRank: 50 }],
    [PerkId.BETTER_CRITICALS, { stat: 'Better Criticals', perRank: 20 }],
    [PerkId.ACTION_BOY, { stat: 'AP', perRank: 1 }],
    [PerkId.DODGER, { stat: 'AC', perRank: 5 }],
    [PerkId.SNAKEATER, { stat: 'DR Poison', perRank: 25 }],
    [PerkId.PACK_RAT, { stat: 'Carry', perRank: 50 }],
])

/** Perks whose only effect is +1 to one SPECIAL stat (stat.cc critterGetStat). */
export const GAIN_STAT_PERKS: ReadonlyMap<number, string> = new Map([
    [PerkId.GAIN_STRENGTH, 'STR'],
    [PerkId.GAIN_PERCEPTION, 'PER'],
    [PerkId.GAIN_ENDURANCE, 'END'],
    [PerkId.GAIN_CHARISMA, 'CHA'],
    [PerkId.GAIN_INTELLIGENCE, 'INT'],
    [PerkId.GAIN_AGILITY, 'AGI'],
    [PerkId.GAIN_LUCK, 'LUK'],
])

/** Rank of `perk` in a critter's perkRanks map (0 when absent). */
export function perkRank(critter: { perkRanks?: Record<number, number> } | null | undefined, perk: number): number {
    const ranks = critter?.perkRanks
    if (!ranks) {return 0}
    const v = ranks[perk]
    return typeof v === 'number' && v > 0 ? v : 0
}

/**
 * Flat skill bonuses granted while a perk is held (perk.cc
 * perkGetSkillModifier). Keyed by skill display name. Ghost (+20 Sneak in
 * darkness) is light-dependent and handled by the caller.
 */
export const PERK_SKILL_BONUSES: ReadonlyMap<number, Readonly<Record<string, number>>> = new Map([
    [PerkId.MEDIC, { 'First Aid': 10, Doctor: 10 }],
    [PerkId.VAULT_CITY_TRAINING, { 'First Aid': 5, Doctor: 5 }],
    [PerkId.LIVING_ANATOMY, { Doctor: 10 }],
    [PerkId.THIEF, { Sneak: 10, Lockpick: 10, Steal: 10, Traps: 10 }],
    [PerkId.MASTER_THIEF, { Lockpick: 15, Steal: 15 }],
    [PerkId.HARMLESS, { Steal: 20 }],
    [PerkId.MR_FIXIT, { Science: 10, Repair: 10 }],
    [PerkId.SPEAKER, { Speech: 20 }],
    [PerkId.EXPERT_EXCREMENT_EXPEDITOR, { Speech: 5 }],
    [PerkId.NEGOTIATOR, { Speech: 10, Barter: 10 }],
    [PerkId.SALESMAN, { Barter: 20 }],
    [PerkId.GAMBLER, { Gambling: 20 }],
    [PerkId.RANGER, { Outdoorsman: 15 }],
    [PerkId.SURVIVALIST, { Outdoorsman: 25 }],
])

const SKILL_DISPLAY_TO_ECS_KEY: Readonly<Record<string, string>> = {
    'First Aid': 'firstAid', Doctor: 'doctor', Sneak: 'sneak', Lockpick: 'lockpick',
    Steal: 'steal', Traps: 'traps', Science: 'science', Repair: 'repair',
    Speech: 'speech', Barter: 'barter', Gambling: 'gambling', Outdoorsman: 'outdoorsman',
}

/** Skill bonuses for one perk, keyed by ECS skill field name. */
export function perkSkillBonusesFor(perk: number): Record<string, number> {
    const out: Record<string, number> = {}
    const bonuses = PERK_SKILL_BONUSES.get(perk)
    if (!bonuses) {return out}
    for (const [display, bonus] of Object.entries(bonuses)) {
        const key = SKILL_DISPLAY_TO_ECS_KEY[display]
        if (key) {out[key] = bonus}
    }
    return out
}

/** Sum of perk skill bonuses for `skill` (display name) given a perkRanks map. */
export function perkSkillModifier(perkRanks: Record<number, number> | null | undefined, skill: string): number {
    if (!perkRanks) {return 0}
    let total = 0
    for (const [perk, bonuses] of PERK_SKILL_BONUSES) {
        if ((perkRanks[perk] ?? 0) > 0 && bonuses[skill] !== undefined) {total += bonuses[skill]}
    }
    return total
}
