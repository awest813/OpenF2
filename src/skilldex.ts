/**
 * Skilldex helpers (parity Slice D / P0-3).
 *
 * The eight Skilldex skills map to Fallout 2 skill IDs used by
 * `use_skill_on_p_proc` / `action_being_used`. Passive Sneak toggles
 * `pcFlags` SNK_MODE (bit 3). First Aid / Doctor get a Critter-side heal
 * fallback when the target has no script override.
 */

import { Skills, skillRequiresTarget } from './skills.js'
import { rollSkillCheck } from './skillCheck.js'
import { Critter, Obj } from './object.js'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { syncPlayerEntityFromCritter } from './playerProjection.js'

function skilldexLog(msg: string): void {
    console.log('[skilldex]', msg)
    // Avoid importing ui.ts (circular): push into the DOM log if present.
    try {
        const el = typeof document !== 'undefined' ? document.getElementById('logList') : null
        if (el) {
            const li = document.createElement('li')
            li.textContent = msg
            el.insertBefore(li, el.firstChild)
        }
    } catch {
        // ignore
    }
}

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

const SNK_MODE_BIT = 3
const HEAL_USES_PER_DAY = 3

interface HealUseTracker {
    dayKey: number
    firstAid: number
    doctor: number
}

let healUses: HealUseTracker = { dayKey: 0, firstAid: 0, doctor: 0 }

function currentDayKey(): number {
    // Approximate in-game day from engine tick; fine for uses/day gating.
    return Math.floor((globalState.gameTickTime ?? 0) / (1000 * 60 * 60 * 24))
}

function refreshHealDay(): void {
    const day = currentDayKey()
    if (healUses.dayKey !== day) {
        healUses = { dayKey: day, firstAid: 0, doctor: 0 }
    }
}

/** Test helper — reset First Aid / Doctor daily use counters. */
export function resetSkilldexHealUses(): void {
    healUses = { dayKey: currentDayKey(), firstAid: 0, doctor: 0 }
}

export function getFalloutSkillId(skill: Skills): number {
    if (skill === Skills.None) return -1
    return FALLOUT_SKILL_ID[skill] ?? -1
}

export function isPlayerSneaking(player: { pcFlags?: number } | null | undefined): boolean {
    return !!((player?.pcFlags ?? 0) & (1 << SNK_MODE_BIT))
}

/** Toggle SNK_MODE on the live player. Returns the new sneaking state. */
export function togglePlayerSneak(): boolean {
    const player = globalState.player as any
    if (!player) return false
    if (typeof player.pcFlags !== 'number') player.pcFlags = 0
    const on = isPlayerSneaking(player)
    if (on) {
        player.pcFlags &= ~(1 << SNK_MODE_BIT)
        skilldexLog('You stop sneaking.')
        return false
    }
    // Soft skill gate: always allow toggle, but warn on very low Sneak.
    const sneak = typeof player.getSkill === 'function' ? player.getSkill('Sneak') : 0
    player.pcFlags |= 1 << SNK_MODE_BIT
    if (sneak < 20) {
        skilldexLog('You attempt to sneak (poorly).')
    } else {
        skilldexLog('You begin sneaking.')
    }
    return true
}

function skillDisplayName(skill: Skills): string {
    switch (skill) {
        case Skills.FirstAid: return 'First Aid'
        case Skills.Doctor: return 'Doctor'
        case Skills.Sneak: return 'Sneak'
        case Skills.Lockpick: return 'Lockpick'
        case Skills.Steal: return 'Steal'
        case Skills.Traps: return 'Traps'
        case Skills.Science: return 'Science'
        case Skills.Repair: return 'Repair'
        default: return 'Unknown'
    }
}

/**
 * Apply First Aid / Doctor heal when the target script does not override.
 * Returns true if a heal attempt was made (success or fail).
 */
export function applyHealingSkillFallback(skill: Skills, target: Obj): boolean {
    if (skill !== Skills.FirstAid && skill !== Skills.Doctor) return false
    if (!target || (target as Critter).type !== 'critter') {
        skilldexLog('That cannot be healed.')
        return true
    }

    refreshHealDay()
    const uses = skill === Skills.FirstAid ? healUses.firstAid : healUses.doctor
    if (uses >= HEAL_USES_PER_DAY) {
        skilldexLog("You're too tired to try that again today.")
        return true
    }

    const player = globalState.player as Critter
    const skillName = skillDisplayName(skill)
    const skillValue = typeof player.getSkill === 'function' ? player.getSkill(skillName) : 0
    const check = rollSkillCheck(skillValue, 0)

    if (skill === Skills.FirstAid) healUses.firstAid++
    else healUses.doctor++

    const critter = target as Critter
    if (!critter.stats) {
        skilldexLog('Nothing happens.')
        return true
    }

    const maxHp = critter.getStat?.('Max HP') ?? critter.stats.get?.('Max HP') ?? 0
    const hp = critter.getStat?.('HP') ?? critter.stats.get?.('HP') ?? 0
    if (hp >= maxHp && skill === Skills.FirstAid) {
        skilldexLog('They do not need First Aid.')
        return true
    }

    if (!check.success) {
        skilldexLog(`You fail the ${skillName} attempt.`)
        return true
    }

    // FO2-ish: First Aid heals a modest amount; Doctor heals more / can help cripples later.
    const heal = skill === Skills.FirstAid
        ? Math.max(1, Math.floor(skillValue / 10) + 1)
        : Math.max(2, Math.floor(skillValue / 5) + 2)
    const newHp = Math.min(maxHp, hp + heal)
    if (critter.stats.baseStats) {
        critter.stats.baseStats['HP'] = newHp
    }
    if (critter === globalState.player) {
        syncPlayerEntityFromCritter()
    }
    skilldexLog(`You heal ${newHp - hp} HP with ${skillName}.`)
    return true
}

/**
 * Dispatch a Skilldex skill use. For target skills, `obj` must be provided.
 * Returns true if the action was handled.
 */
export function useSkilldexSkill(skill: Skills, obj?: Obj | null): boolean {
    if (skill === Skills.None) return false

    if (skill === Skills.Sneak) {
        togglePlayerSneak()
        return true
    }

    if (skillRequiresTarget(skill)) {
        if (!obj) {
            console.warn('[skilldex] skill', skill, 'requires a target')
            return false
        }
        const skillId = getFalloutSkillId(skill)
        const overridden = Scripting.useSkillOn(globalState.player as Critter, skillId, obj)
        if (!overridden && (skill === Skills.FirstAid || skill === Skills.Doctor)) {
            applyHealingSkillFallback(skill, obj)
        }
        return true
    }

    return false
}

export { skillRequiresTarget }
