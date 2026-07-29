/**
 * Player projection helpers (parity Slice B / P0-2).
 *
 * Gameplay combat and scripting mutate `globalState.player` (Critter / StatSet).
 * Several UI2 panels historically read a separate ECS `playerEntityId`. This
 * module projects the live Critter onto the ECS stats/combat/skills components so the
 * HUD, Pip-Boy, character sheet, and related panels show the same values as combat.
 *
 * Longer term the ECS player entity should become a thin view; until then,
 * call `syncPlayerEntityFromCritter()` before UI reads that still go through
 * EntityManager.
 */

import globalState from './globalState.js'
import { EntityManager } from './ecs/entityManager.js'
import type { SkillsComponent, StatsComponent } from './ecs/components.js'

const SPECIAL_TO_ECS: Array<[string, keyof StatsComponent]> = [
    ['STR', 'strength'],
    ['PER', 'perception'],
    ['END', 'endurance'],
    ['CHA', 'charisma'],
    ['INT', 'intelligence'],
    ['AGI', 'agility'],
    ['LUK', 'luck'],
]

/** Display name (Critter SkillSet) ↔ ECS SkillsComponent key. */
export const SKILL_DISPLAY_TO_ECS: Array<[string, keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>]> = [
    ['Small Guns', 'smallGuns'],
    ['Big Guns', 'bigGuns'],
    ['Energy Weapons', 'energyWeapons'],
    ['Unarmed', 'unarmed'],
    ['Melee Weapons', 'meleeWeapons'],
    ['Throwing', 'throwing'],
    ['First Aid', 'firstAid'],
    ['Doctor', 'doctor'],
    ['Sneak', 'sneak'],
    ['Lockpick', 'lockpick'],
    ['Steal', 'steal'],
    ['Traps', 'traps'],
    ['Science', 'science'],
    ['Repair', 'repair'],
    ['Speech', 'speech'],
    ['Barter', 'barter'],
    ['Gambling', 'gambling'],
    ['Outdoorsman', 'outdoorsman'],
]

export const ECS_SKILL_TO_DISPLAY: Record<string, string> = Object.fromEntries(
    SKILL_DISPLAY_TO_ECS.map(([display, ecs]) => [ecs, display]),
)

function readStat(player: any, name: string, fallback = 0): number {
    if (!player || typeof player.getStat !== 'function') {
        return fallback
    }
    const value = player.getStat(name)
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Snapshot of the live player used by HUD tests and panels. */
export interface PlayerHudSnapshot {
    name: string
    currentHp: number
    maxHp: number
    currentAP: number
    maxAP: number
}

/**
 * Read HP/AP/name from the gameplay Critter (`globalState.player`).
 * Returns null when no player is available.
 */
export function readPlayerHudSnapshot(): PlayerHudSnapshot | null {
    const player = globalState.player as any
    if (!player) {
        return null
    }
    const maxHp = Math.max(1, readStat(player, 'Max HP', readStat(player, 'HP', 100)))
    const currentHp = Math.max(0, readStat(player, 'HP', maxHp))
    const maxAP = Math.max(0, readStat(player, 'AP', 0))
    let currentAP = maxAP
    if (player.AP) {
        if (typeof player.AP.getAvailableCombatAP === 'function') {
            currentAP = Math.max(0, player.AP.getAvailableCombatAP())
        } else if (typeof player.AP.combat === 'number') {
            currentAP = Math.max(0, player.AP.combat)
        }
        if (typeof player.AP.getMaxAP === 'function') {
            const caps = player.AP.getMaxAP()
            if (caps && typeof caps.combat === 'number') {
                return {
                    name: typeof player.name === 'string' && player.name ? player.name : 'Player',
                    currentHp,
                    maxHp,
                    currentAP,
                    maxAP: Math.max(maxAP, caps.combat),
                }
            }
        }
    }
    return {
        name: typeof player.name === 'string' && player.name ? player.name : 'Player',
        currentHp,
        maxHp,
        currentAP,
        maxAP,
    }
}

/**
 * Copy live Critter stats/skills into the ECS player entity so UI panels that still
 * read EntityManager stay consistent with combat/scripting.
 *
 * Safe no-op when the ECS entity or Critter is missing.
 */
export function syncPlayerEntityFromCritter(): void {
    const player = globalState.player as any
    const entityId = globalState.playerEntityId
    if (!player || !entityId) {
        return
    }

    const stats = EntityManager.get<'stats'>(entityId, 'stats')
    if (stats) {
        const snap = readPlayerHudSnapshot()
        if (snap) {
            stats.currentHp = snap.currentHp
            stats.maxHp = snap.maxHp
            stats.maxAP = snap.maxAP
        }
        for (const [statName, ecsKey] of SPECIAL_TO_ECS) {
            const value = readStat(player, statName, NaN)
            if (Number.isFinite(value)) {
                ;(stats as any)[ecsKey] = value
            }
        }
        const armorClass = readStat(player, 'AC', NaN)
        if (Number.isFinite(armorClass)) {
            stats.armorClass = armorClass
        }
        if (typeof player.level === 'number') {
            stats.level = player.level
        }
        if (typeof player.xp === 'number') {
            stats.xp = player.xp
        }
    }

    const combat = EntityManager.get<'combat'>(entityId, 'combat')
    if (combat) {
        const snap = readPlayerHudSnapshot()
        if (snap) {
            combat.combatAP = snap.currentAP
        }
    }

    const skills = EntityManager.get<'skills'>(entityId, 'skills')
    if (skills && player.skills && typeof player.skills.get === 'function') {
        for (const [display, ecsKey] of SKILL_DISPLAY_TO_ECS) {
            try {
                ;(skills as any)[ecsKey] = player.skills.get(display, player.stats)
            } catch {
                // skill missing in SkillSet — leave ECS value
            }
        }
        if (typeof player.skills.skillPoints === 'number') {
            skills.availablePoints = player.skills.skillPoints
        }
        if (Array.isArray(player.skills.tagged)) {
            skills.tagged = new Set(
                player.skills.tagged
                    .map((name: string) => SKILL_DISPLAY_TO_ECS.find(([d]) => d === name)?.[1])
                    .filter(Boolean) as Array<keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>>,
            )
        }
    }

    const playerComp = EntityManager.get<'player'>(entityId, 'player')
    if (playerComp) {
        if (typeof player.name === 'string' && player.name) {
            playerComp.name = player.name
        }
        if (player.charTraits instanceof Set) {
            playerComp.acquiredTraits = [...player.charTraits]
        } else if (Array.isArray(globalState.playerCharTraits)) {
            playerComp.acquiredTraits = [...globalState.playerCharTraits]
        }
    }
}

/**
 * Spend one skill rank on the Critter SkillSet (source of truth), then project to ECS.
 * Returns true if the spend succeeded.
 */
export function spendCritterSkillPoint(skillDisplayName: string): boolean {
    const player = globalState.player as any
    if (!player?.skills || typeof player.skills.incBase !== 'function') {
        return false
    }
    const ok = player.skills.incBase(skillDisplayName, true)
    if (ok) {
        syncPlayerEntityFromCritter()
    }
    return ok
}
