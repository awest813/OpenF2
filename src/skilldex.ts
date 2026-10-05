/**
 * Skilldex helpers.
 *
 * The eight Skilldex skills map to Fallout 2 skill IDs used by
 * `use_skill_on_p_proc` / `action_being_used`. Sneak toggles the player's
 * sneak state (dudeToggleState); the others are used on a target through
 * actionUseSkill → _obj_use_skill_on → skillUse (see skillUse.ts).
 */

import { Skills, skillRequiresTarget } from './skills.js'
import { Critter, Obj } from './object.js'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { playerInSneakMode, setPlayerSneakMode } from './combat/aiPacket.js'
import { canUseSkillOn, useSkillOn } from './skillUse.js'

/** Fallout 2 engine skill IDs (same table as scripting `skillNumToName`). */
export const FALLOUT_SKILL_ID: Record<Exclude<Skills, Skills.None>, number> = {
    [Skills.FirstAid]: 6,
    [Skills.Doctor]: 7,
    [Skills.Sneak]: 8,
    [Skills.Lockpick]: 9,
    [Skills.Steal]: 10,
    [Skills.Traps]: 11,
    [Skills.Science]: 12,
    [Skills.Repair]: 13,
}

export interface SkilldexEntry {
    skill: Skills
    label: string
    /** Approximate Y offset on the classic skldxbox art. */
    labelY: number
}

/** Skilldex order matches SKILLDEX.MSG (Sneak … Repair). */
export const SKILLDEX_ENTRIES: readonly SkilldexEntry[] = [
    { skill: Skills.Sneak, label: 'Sneak', labelY: 45 },
    { skill: Skills.Lockpick, label: 'Lockpick', labelY: 85 },
    { skill: Skills.Steal, label: 'Steal', labelY: 125 },
    { skill: Skills.Traps, label: 'Traps', labelY: 165 },
    { skill: Skills.FirstAid, label: 'First Aid', labelY: 205 },
    { skill: Skills.Doctor, label: 'Doctor', labelY: 245 },
    { skill: Skills.Science, label: 'Science', labelY: 285 },
    { skill: Skills.Repair, label: 'Repair', labelY: 300 },
]

export function getFalloutSkillId(skill: Skills): number {
    if (skill === Skills.None) {return -1}
    return FALLOUT_SKILL_ID[skill] ?? -1
}

export function isPlayerSneaking(player: { pcFlags?: number } | null | undefined): boolean {
    return playerInSneakMode(player)
}

/** dudeToggleState(DUDE_STATE_SNEAKING): silent; the SNEAK indicator shows the state. */
export function togglePlayerSneak(): boolean {
    const player = globalState.player as any
    if (!player) {return false}
    const on = !playerInSneakMode(player)
    setPlayerSneakMode(player, on)
    return on
}

/** actionUseSkill's checks for the player using a Skilldex skill on `obj`. */
export function canPlayerUseSkillOn(skill: Skills, obj: Obj): boolean {
    return canUseSkillOn(globalState.player, obj, getFalloutSkillId(skill))
}

/** _obj_use_skill_on for the player: the target's script, then the engine's skillUse. */
export function applyPlayerSkill(skill: Skills, obj: Obj): void {
    useSkillOn(globalState.player, obj, getFalloutSkillId(skill), (source, target, id) =>
        Scripting.useSkillOn(source as Critter, id, target as Obj)
    )
}

/**
 * Dispatch a Skilldex skill use. For target skills, `obj` must be provided.
 * Returns true if the action was handled.
 */
export function useSkilldexSkill(skill: Skills, obj?: Obj | null): boolean {
    if (skill === Skills.None) {return false}

    if (skill === Skills.Sneak) {
        togglePlayerSneak()
        return true
    }

    if (skillRequiresTarget(skill)) {
        if (!obj) {return false}
        if (canPlayerUseSkillOn(skill, obj)) {applyPlayerSkill(skill, obj)}
        return true
    }

    return false
}

export { skillRequiresTarget }
