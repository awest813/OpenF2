/**
 * Engine settings sfall scripts can change (sfall's Stats, Inventory,
 * Combat, Perks and Worldmap modules), kept apart from the script functions
 * so the game systems that honour them can import them without a cycle.
 */

import { statDependencies } from './skills.js'

export interface FakePerk {
    name: string
    level: number
    image: number
    desc: string
    owner: number
}

function defaultSettings() {
    return {
        xpMod: 100,
        perkLevelMod: 0,
        perkFreq: 0,
        /** The to-hit cap and bonus, for everyone (base) or one critter (Combat.cpp HitChanceMod). */
        hitChance: { base: { max: 95, mod: 0 }, byCritter: new WeakMap<object, { max: number; mod: number }>() },
        /** The skill cap (Skills.cpp skillMaxMods). */
        skillMax: { base: 300, byCritter: new WeakMap<object, number>() },
        /** The steal-chance cap and bonus (Skills.cpp pickpocketMods). */
        pickpocket: { base: { max: 95, mod: 0 }, byCritter: new WeakMap<object, { max: number; mod: number }>() },
        inventoryApCost: 4,
        /** Perk level × this is taken off the inventory AP cost (Quick Pockets). */
        inventoryApQuickPocketsReduction: 2,
        unspentApBonus: 4,
        unspentApPerkBonus: 4,
        swiftLearnerMod: 5,
        /** The constant in Max HP per level, END/2 + this (stat.cc; 2 unless set_hp_per_level_mod). */
        hpPerLevelMod: 2,
        pyromaniacMod: 5,
        /** apply_heaveho_fix: Heave Ho! adds 6 hexes per rank past the 3×STR cap. */
        heaveHoFix: false,
        mapTimeMulti: 1,
        combatBlocked: false,
        combatBlockedMessage: '',
        pcStatMax: {} as Record<number, number>,
        pcStatMin: {} as Record<number, number>,
        npcStatMax: {} as Record<number, number>,
        npcStatMin: {} as Record<number, number>,
        aimedShots: new Map<number, boolean>(),
        /** Knockback modifiers (Combat.cpp mWeapons, mTargets, mAttackers): type 0 sets, 1 multiplies. */
        knockback: {
            weapons: new WeakMap<object, { type: number; value: number }>(),
            targets: new WeakMap<object, { type: number; value: number }>(),
            attackers: new WeakMap<object, { type: number; value: number }>(),
        },
        ifaceTags: new Set<number>(),
        /** Fake perks and traits by owner id (0 for the player), then by name. */
        fakePerks: new Map<string, FakePerk>(),
        fakeTraits: new Map<string, FakePerk>(),
        /** Perks offered in the perk box (set_selectable_perk). */
        selectablePerks: new Map<string, FakePerk>(),
        /** hide_real_perks: the perk box offers only the selectable ones. */
        hideRealPerks: false,
        perkboxTitle: '',
        /** perk_add_mode: 1 adds a chosen selectable perk as a trait, 2 as a perk, 4 removes it from the box. */
        perkAddMode: 2,
        hooks: new Map<number, unknown>(),
        forcedEncounter: null as null | { map: number; flags: number },
        carTown: -1,
        pipboyAvailable: 1,
        /** The explosives item_make_explosive adds: pid → active pid and damage. */
        explosives: new Map<number, { activePid: number; min: number; max: number }>(),
        restHealTime: 180,
        restMode: 0,
        worldmapHealTime: 0,
        unjamLocksTime: 24,
        encounterDetection: true,
        npcEngineLevelUp: true,
        fo1HitChance: false,
        townNames: true,
        reactionThresholds: null as null | { neutral: number; good: number },
        spray: { centerMult: 1, centerDiv: 3, targetMult: 1, targetDiv: 2 },
        questFailureValues: new Map<number, number>(),
        terrainNames: new Map<string, string>(),
        townTitles: new Map<number, string>(),
        canRestOnMap: new Map<string, number>(),
        drugNumEffects: new Map<number, number>(),
        drugAddictTimeOff: new Map<number, number>(),
    }
}

export const sfallSettings = defaultSettings()

/** Back to the engine's values (sfall resets these when a game starts or loads). */
export function resetSfallSettings(): void {
    Object.assign(sfallSettings, defaultSettings())
}

/** Stat numbers 0–34 by OpenF2 stat name (stat.cc order). */
export const STAT_BY_NAME: Record<string, number> = {
    STR: 0, PER: 1, END: 2, CHA: 3, INT: 4, AGI: 5, LUK: 6, 'Max HP': 7, AP: 8, AC: 9, 'Unarmed Damage': 10,
    Melee: 11, Carry: 12, Sequence: 13, 'Healing Rate': 14, 'Critical Chance': 15, 'Better Criticals': 16,
    'DT Normal': 17, 'DT Laser': 18, 'DT Fire': 19, 'DT Plasma': 20, 'DT Electrical': 21, 'DT EMP': 22, 'DT Explosive': 23,
    'DR Normal': 24, 'DR Laser': 25, 'DR Fire': 26, 'DR Plasma': 27, 'DR Electrical': 28, 'DR EMP': 29, 'DR Explosive': 30,
    'DR Radiation': 31, 'DR Poison': 32, Age: 33, Gender: 34,
}
const STAT_NAMES = Object.fromEntries(Object.entries(STAT_BY_NAME).map(([k, v]) => [v, k])) as Record<number, string>

function defaultLimit(stat: number, which: 'min' | 'max'): number {
    if (stat === 10) {return which === 'min' ? 0 : 2147483647}
    const dep = statDependencies[STAT_NAMES[stat]]
    return dep ? dep[which] : 0
}

/** Stats::GetStatMax / GetStatMin: the limits of a stat for the player or for other critters. */
export function statMax(stat: number, isNPC: boolean): number {
    if (!(stat >= 0 && stat < 35)) {return 0}
    return (isNPC ? sfallSettings.npcStatMax : sfallSettings.pcStatMax)[stat] ?? defaultLimit(stat, 'max')
}

export function statMin(stat: number, isNPC: boolean): number {
    if (!(stat >= 0 && stat < 35)) {return 0}
    return (isNPC ? sfallSettings.npcStatMin : sfallSettings.pcStatMin)[stat] ?? defaultLimit(stat, 'min')
}

/** stat_level's clamp, with any limits sfall scripts set. */
export function clampStatValue(stat: string, value: number, isPlayer: boolean): number {
    const index = STAT_BY_NAME[stat]
    if (index === undefined) {
        const dep = statDependencies[stat]
        return dep ? Math.max(dep.min, Math.min(dep.max, value)) : value
    }
    const min = statMin(index, !isPlayer)
    const max = statMax(index, !isPlayer)
    return value < min ? min : value > max ? max : value
}

/** Inventory::GetInvenApCost: the AP an inventory action costs in combat. */
export function inventoryApCost(quickPocketsLevel: number): number {
    return Math.max(0, sfallSettings.inventoryApCost - sfallSettings.inventoryApQuickPocketsReduction * quickPocketsLevel)
}

/** CalcApToAcBonus: unspent AP as AC (the HtH Evade part only with empty hands). */
export function apToAcBonus(ap: number, hthEvadeLevel: number): number {
    if (ap <= 0) {return 0}
    const perkBonus = hthEvadeLevel * sfallSettings.unspentApPerkBonus * ap
    return Math.trunc((perkBonus + ap * sfallSettings.unspentApBonus) / 4)
}

/** HitChanceMod: the to-hit chance after a script's bonus, under its cap (95 by default). */
export function capHitChance(chance: number, attacker: object | null | undefined): number {
    const m = (attacker && sfallSettings.hitChance.byCritter.get(attacker)) || sfallSettings.hitChance.base
    return Math.min(chance + m.mod, m.max, 999)
}

/** The skill level under the cap scripts set (300 by default). */
export function capSkill(value: number, critter: object | null | undefined): number {
    const max = (critter && sfallSettings.skillMax.byCritter.get(critter)) ?? sfallSettings.skillMax.base
    return Math.min(value, max)
}

/** The steal chance after a script's bonus, under its cap (95 by default). */
export function capPickpocket(chance: number, thief: object | null | undefined): number {
    const m = (thief && sfallSettings.pickpocket.byCritter.get(thief)) || sfallSettings.pickpocket.base
    return Math.min(chance + m.mod, m.max)
}

/** CalcKnockbackMod's modifiers on damage / knockValue: the weapon's, the attacker's, then the target's. */
export function knockbackModifier(weapon: object | null | undefined, attacker: object | null | undefined, target: object | null | undefined): (value: number) => number {
    return (value) => {
        const apply = (map: WeakMap<object, { type: number; value: number }>, o: object | null | undefined) => {
            const mod = o ? map.get(o) : undefined
            if (mod?.type === 0) {value = mod.value}
            else if (mod?.type === 1) {value *= mod.value}
        }
        apply(sfallSettings.knockback.weapons, weapon)
        apply(sfallSettings.knockback.attackers, attacker)
        apply(sfallSettings.knockback.targets, target)
        return value
    }
}
