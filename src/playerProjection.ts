/**
 * Player projection helpers (parity Slice B / P0-2).
 *
 * Gameplay combat and scripting mutate `globalState.player` (Critter / StatSet).
 * Several UI2 panels historically read a separate ECS `playerEntityId`. This
 * module projects the live Critter onto the ECS stats/combat components so the
 * HUD, Pip-Boy, and related panels show the same HP/AP/SPECIAL as combat.
 *
 * Longer term the ECS player entity should become a thin view; until then,
 * call `syncPlayerEntityFromCritter()` before UI reads that still go through
 * EntityManager.
 */

import globalState from './globalState.js'
import { EntityManager } from './ecs/entityManager.js'
import type { StatsComponent } from './ecs/components.js'

const SPECIAL_TO_ECS: Array<[string, keyof StatsComponent]> = [
    ['STR', 'strength'],
    ['PER', 'perception'],
    ['END', 'endurance'],
    ['CHA', 'charisma'],
    ['INT', 'intelligence'],
    ['AGI', 'agility'],
    ['LUK', 'luck'],
]

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
 * Copy live Critter stats into the ECS player entity so UI panels that still
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
    }

    const combat = EntityManager.get<'combat'>(entityId, 'combat')
    if (combat) {
        const snap = readPlayerHudSnapshot()
        if (snap) {
            combat.combatAP = snap.currentAP
        }
    }
}
