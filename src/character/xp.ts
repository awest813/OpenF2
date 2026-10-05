/**
 * Critter XP and level-up (parity P0-2).
 *
 * Single source of truth for script/combat XP awards on `globalState.player`.
 * ECS stats are projected via `syncPlayerEntityFromCritter()` after changes.
 */

import { sfallSettings } from '../sfallSettings.js'
import globalState from '../globalState.js'
import type { Player } from '../player.js'
import type { Critter } from '../object.js'

type XpCritter = Critter & Pick<Player, 'xp' | 'level' | 'perkRanks'>
import { educatedPerkRanks } from './perks.js'
import { PerkId, perkRank } from './perkIds.js'

/** trait_defs.h */
const TRAIT_SKILLED = 14
const TRAIT_GIFTED = 15
/** stat_defs.h PC_LEVEL_MAX */
const PC_LEVEL_MAX = 99
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import { EventBus } from '../eventBus.js'
import { getMessage } from '../util.js'

/** Base SPECIAL with trait modifiers (critterGetBaseStatWithTraitModifier). */
function baseStat(player: XpCritter, stat: string): number {
    const stats = (player as any).stats
    if (stats && typeof stats.get === 'function') {return stats.get(stat)}
    const v = typeof player.getStat === 'function' ? player.getStat(stat) : undefined
    return typeof v === 'number' && Number.isFinite(v) ? v : 5
}

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

    // pcAddExperienceWithOptions: Swift Learner adds 5% per rank (integer math);
    // sfall's set_xp_mod scales the award first, set_swiftlearner_mod the 5.
    if (sfallSettings.xpMod !== 100) {amount = Math.round(amount * sfallSettings.xpMod / 100)}
    const swiftLearner = perkRank(player as any, PerkId.SWIFT_LEARNER)
    const gained = amount + Math.trunc(swiftLearner * sfallSettings.swiftLearnerMod * amount / 100)
    player.xp = (player.xp ?? 0) + gained
    opts.onGain?.(gained)

    const traits: Set<number> | undefined = (player as any).charTraits
    const hasSkilled = traits?.has(TRAIT_SKILLED) ?? false
    const hasGifted = traits?.has(TRAIT_GIFTED) ?? false

    while ((player.level ?? 1) < PC_LEVEL_MAX && (player.xp ?? 0) >= xpThresholdForLevel(player.level ?? 1)) {
        player.level = (player.level ?? 1) + 1

        // character_editor.cc characterEditorUpdateLevel: 5 + 2×INT + 2×Educated
        // (+5 Skilled, −5 Gifted), clamped to [0, 99] unspent points.
        if (player.skills) {
            const baseInt = baseStat(player, 'INT')
            let sp = player.skills.skillPoints + 5 + baseInt * 2
            sp += educatedPerkRanks((player as any).perkRanks) * 2
            if (hasSkilled) {sp += 5}
            if (hasGifted) {sp = Math.max(0, sp - 5)}
            player.skills.skillPoints = Math.min(99, sp)
        }

        // stat.cc: +(END/2 + 2) Max HP per level (+4 per Lifegiver rank), healed by the same amount.
        if (player.stats && typeof player.stats.modifyBase === 'function') {
            const baseEnd = baseStat(player, 'END')
            const hpPerLevel = Math.trunc(baseEnd / 2) + sfallSettings.hpPerLevelMod + perkRank(player as any, PerkId.LIFEGIVER) * 4
            player.stats.modifyBase('Max HP', hpPerLevel)
            player.stats.modifyBase('HP', hpPerLevel)
        }

        // stat.cc pcAddExperienceWithOptions: "You have gone up a level." and the jingle.
        if ((player as any).isPlayer || player === (globalState.player as any)) {
            let text: string | null = null
            try {
                text = getMessage('stat', 600)
            } catch {
                text = null
            }
            EventBus.emit('ui:message', { text: text || 'You have gone up a level.' })
            EventBus.emit('audio:playSound', { soundId: 'levelup' })
        }
        opts.onLevelUp?.(player.level)
        // A perk every 3 levels (every 4 with Skilled), unless set_perk_freq says otherwise.
        const perkRate = sfallSettings.perkFreq || (hasSkilled ? 4 : 3)
        if ((player.level ?? 1) % perkRate === 0) {
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
