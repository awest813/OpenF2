/**
 * Character creation (chargen) — Slice C / P0-1.
 *
 * Pure apply/validate helpers used by CharacterCreationPanel and tests.
 * Writes the live Critter model (`globalState.player`), not the ECS entity.
 */

import { SkillSet, StatSet } from '../char.js'
import { TRAIT_MAP } from './traits.js'
import { Player } from '../player.js'
import globalState from '../globalState.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'

/** Fallout 2 SPECIAL keys used by StatSet. */
export const SPECIAL_KEYS = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LUK'] as const
export type SpecialKey = (typeof SPECIAL_KEYS)[number]

/** Skill display names accepted by SkillSet.tag / get. */
export const CHARGEN_SKILLS = [
    'Small Guns',
    'Big Guns',
    'Energy Weapons',
    'Unarmed',
    'Melee Weapons',
    'Throwing',
    'First Aid',
    'Doctor',
    'Sneak',
    'Lockpick',
    'Steal',
    'Traps',
    'Science',
    'Repair',
    'Speech',
    'Barter',
    'Gambling',
    'Outdoorsman',
] as const

export type ChargenSkillName = (typeof CHARGEN_SKILLS)[number]

export const CHARGEN_TOTAL_SPECIAL_POINTS = 40
export const CHARGEN_SPECIAL_MIN = 1
export const CHARGEN_SPECIAL_MAX = 10
export const CHARGEN_REQUIRED_TAGS = 3
export const CHARGEN_MAX_TRAITS = 2
export const CHARGEN_DEFAULT_AGE = 25

export interface CharacterCreationData {
    name: string
    age: number
    gender: 'male' | 'female'
    /** SPECIAL base values before trait mods (each 1–10). */
    special: Record<SpecialKey, number>
    /** Exactly 3 tagged skill display names. */
    taggedSkills: ChargenSkillName[]
    /** 0–2 trait IDs from TRAITS. */
    traitIds: number[]
}

export interface ChargenValidation {
    ok: boolean
    errors: string[]
}

export function defaultSpecial(): Record<SpecialKey, number> {
    return { STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LUK: 5 }
}

export function defaultCharacterCreation(): CharacterCreationData {
    return {
        name: 'Chosen One',
        age: CHARGEN_DEFAULT_AGE,
        gender: 'male',
        special: defaultSpecial(),
        taggedSkills: [],
        traitIds: [],
    }
}

export function specialPointsSpent(special: Record<SpecialKey, number>): number {
    return SPECIAL_KEYS.reduce((sum, k) => sum + (special[k] ?? 0), 0)
}

export function specialPointsRemaining(special: Record<SpecialKey, number>): number {
    return CHARGEN_TOTAL_SPECIAL_POINTS - specialPointsSpent(special)
}

export function validateCharacterCreation(data: CharacterCreationData): ChargenValidation {
    const errors: string[] = []
    const name = (data.name ?? '').trim()
    if (!name) {
        errors.push('Name is required')
    }
    if (data.age < 16 || data.age > 35) {
        errors.push('Age must be between 16 and 35')
    }
    if (data.gender !== 'male' && data.gender !== 'female') {
        errors.push('Gender must be male or female')
    }
    for (const key of SPECIAL_KEYS) {
        const v = data.special[key]
        if (typeof v !== 'number' || v < CHARGEN_SPECIAL_MIN || v > CHARGEN_SPECIAL_MAX) {
            errors.push(`${key} must be between ${CHARGEN_SPECIAL_MIN} and ${CHARGEN_SPECIAL_MAX}`)
        }
    }
    const spent = specialPointsSpent(data.special)
    if (spent !== CHARGEN_TOTAL_SPECIAL_POINTS) {
        errors.push(`SPECIAL must total ${CHARGEN_TOTAL_SPECIAL_POINTS} (currently ${spent})`)
    }
    if (data.taggedSkills.length !== CHARGEN_REQUIRED_TAGS) {
        errors.push(`Select exactly ${CHARGEN_REQUIRED_TAGS} tagged skills`)
    }
    const uniqueTags = new Set(data.taggedSkills)
    if (uniqueTags.size !== data.taggedSkills.length) {
        errors.push('Tagged skills must be unique')
    }
    for (const skill of data.taggedSkills) {
        if (!(CHARGEN_SKILLS as readonly string[]).includes(skill)) {
            errors.push(`Unknown skill: ${skill}`)
        }
    }
    if (data.traitIds.length > CHARGEN_MAX_TRAITS) {
        errors.push(`At most ${CHARGEN_MAX_TRAITS} traits`)
    }
    const uniqueTraits = new Set(data.traitIds)
    if (uniqueTraits.size !== data.traitIds.length) {
        errors.push('Traits must be unique')
    }
    for (const id of data.traitIds) {
        if (!TRAIT_MAP.has(id)) {
            errors.push(`Unknown trait id: ${id}`)
        }
    }
    return { ok: errors.length === 0, errors }
}

/**
 * Apply trait SPECIAL / AP side-effects onto a StatSet at chargen time.
 * Skill % deltas from traits are applied as base skill offsets.
 */
function applyTraitEffectsToPlayer(player: Player, traitIds: number[]): void {
    player.charTraits = new Set(traitIds)
    globalState.playerCharTraits = [...traitIds]

    // SPECIAL mods: fold into StatSet base at chargen (Critter model has no *Mod fields).
    // Bruiser AP −2 is applied at runtime via charTraits in ActionPoints.getMaxAP — do not
    // also subtract apBonus here or the penalty doubles.
    const specialMods: Partial<Record<SpecialKey, number>> = {}
    const bump = (key: SpecialKey, delta: number) => {
        specialMods[key] = (specialMods[key] ?? 0) + delta
    }
    for (const id of traitIds) {
        switch (id) {
            case 1: bump('STR', 2); break // Bruiser
            case 2: bump('AGI', 1); break // Small Frame
            case 15: // Gifted
                for (const k of SPECIAL_KEYS) bump(k, 1)
                break
            default:
                break
        }
    }
    for (const k of SPECIAL_KEYS) {
        const delta = specialMods[k] ?? 0
        if (delta === 0) continue
        const cur = player.stats.baseStats[k] ?? 5
        player.stats.baseStats[k] = Math.max(1, Math.min(10, cur + delta))
    }

    // Gifted skill penalty / Good Natured as base skill offsets
    for (const id of traitIds) {
        if (id === 15) {
            for (const skill of CHARGEN_SKILLS) {
                player.skills.setBase(skill, player.skills.getBase(skill) - 10)
            }
        }
        if (id === 10) {
            for (const skill of ['First Aid', 'Doctor', 'Speech', 'Barter'] as ChargenSkillName[]) {
                player.skills.setBase(skill, player.skills.getBase(skill) + 15)
            }
            for (const skill of [
                'Small Guns', 'Big Guns', 'Energy Weapons', 'Unarmed', 'Melee Weapons', 'Throwing',
            ] as ChargenSkillName[]) {
                player.skills.setBase(skill, player.skills.getBase(skill) - 10)
            }
        }
    }
}

/**
 * Apply a validated chargen sheet onto `player` (or globalState.player).
 * Clears the debug 1337-caps loadout and resets XP/level.
 */
export function applyCharacterCreation(
    data: CharacterCreationData,
    player: Player = globalState.player as Player,
): ChargenValidation {
    const validation = validateCharacterCreation(data)
    if (!validation.ok) {
        return validation
    }

    const name = data.name.trim()
    player.name = name
    player.gender = data.gender
    player.xp = 0
    player.level = 1
    player.karma = 0
    player.pcFlags = 0
    player.activeHand = 0

    // Fresh SPECIAL + Age
    const base: { [name: string]: number } = {
        STR: data.special.STR,
        PER: data.special.PER,
        END: data.special.END,
        CHA: data.special.CHA,
        INT: data.special.INT,
        AGI: data.special.AGI,
        LUK: data.special.LUK,
        Age: data.age,
    }
    player.stats = new StatSet(base, true, 0)

    // Fresh skills (defaults from skillDependencies start values) + tags
    player.skills = new SkillSet({}, [], 0)
    for (const skill of data.taggedSkills) {
        player.skills.tag(skill)
    }

    applyTraitEffectsToPlayer(player, data.traitIds)

    // Derived HP: set current HP = Max HP
    const maxHp = player.stats.get('Max HP')
    player.stats.baseStats['Max HP'] = maxHp
    player.stats.baseStats['HP'] = maxHp

    // Starter inventory: no debug 1337 caps — a modest purse
    player.inventory = []
    try {
        // Lazy import avoided — createObjectWithPID is on object.js via Player default;
        // use empty inventory for New Game cleanliness (P0-1).
    } catch {
        player.inventory = []
    }
    player.leftHand = null as any
    player.rightHand = null as any
    player.equippedArmor = null as any

    // Keep ECS HUD in sync
    syncPlayerEntityFromCritter()

    return validation
}

/** True when the URL query requests a direct map load (dev shortcut). */
export function shouldSkipMainMenu(): boolean {
    if (typeof location === 'undefined') {
        return false
    }
    return location.search !== ''
}
