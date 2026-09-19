/**
 * Critter XP and level-up (parity P0-2).
 *
 * Single source of truth for script/combat XP awards on `globalState.player`.
 * ECS stats are projected via `syncPlayerEntityFromCritter()` after changes.
 */

import globalState from '../globalState.js'
import type { Player } from '../player.js'
import type { Critter } from '../object.js'

type XpCritter = Critter & Pick<Player, 'xp' | 'level' | 'perkRanks'>
import { educatedPerkRanks } from './perks.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'

/** Total XP required to reach `level` (Fallout 2 triangular threshold). */
export function xpThresholdForLevel(level: number): number {
    const n = typeof level === 'number' && Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1
    return (n * (n + 1) / 2) * 1000
}

export interface AwardCritterXpOptions {
    /** Called when XP is successfully added (after validation). */
    onGain?: (amount: number) => void
    /** Called once per level gained during this award. */
    onLevelUp?: (newLevel: number) => void
    /** Project Critter fields onto the ECS player entity (default true). */
    syncEcs?: boolean
    /** Advance companion party.txt tiers on level-up (default true). */
    applyPartyTiers?: boolean
}

/**
 * Add XP to a Critter and apply Fallout 2 level-ups (skill points + perk owed).
 * Returns the number of levels gained (0 when XP is rejected).
 */
export function awardCritterXp(
    player: XpCritter | null | undefined,
    amount: number,
    opts: AwardCritterXpOptions = {},
): number {
    if (!player) {
        return 0
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return 0
    }

    const syncEcs = opts.syncEcs !== false
    const applyPartyTiers = opts.applyPartyTiers !== false
    const startLevel = player.level ?? 1

    player.xp = (player.xp ?? 0) + amount
    opts.onGain?.(amount)

    while ((player.xp ?? 0) >= xpThresholdForLevel(player.level ?? 1)) {
        player.level = (player.level ?? 1) + 1
        const intScore = typeof player.getStat === 'function' ? (player.getStat('INT') ?? 5) : 5
        const educatedBonus = educatedPerkRanks((player as any).perkRanks) * 2
        const pointsGained = Math.max(1, 10 + Math.floor(intScore / 2) + educatedBonus)
        if (player.skills) {
            player.skills.skillPoints += pointsGained
        }
        opts.onLevelUp?.(player.level)
        if ((player.level ?? 1) % 3 === 0) {
            globalState.playerPerksOwed = (globalState.playerPerksOwed ?? 0) + 1
        }
        if (applyPartyTiers && globalState.gParty?.applyLevelTiersForPlayerLevel) {
            globalState.gParty.applyLevelTiersForPlayerLevel(player.level)
        }
    }

    if (syncEcs) {
        syncPlayerEntityFromCritter()
    }
    return (player.level ?? 1) - startLevel
}
