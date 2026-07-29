/**
 * Parity Slice D — Skilldex 8 skills (P0-3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Skills, skillRequiresTarget } from './skills.js'
import {
    SKILLDEX_ENTRIES,
    FALLOUT_SKILL_ID,
    getFalloutSkillId,
    togglePlayerSneak,
    isPlayerSneaking,
    applyHealingSkillFallback,
    useSkilldexSkill,
    resetSkilldexHealUses,
} from './skilldex.js'
import { Player } from './player.js'
import globalState from './globalState.js'
import { UIManagerImpl } from './ui2/uiPanel.js'
import { registerDefaultPanels } from './ui2/registerPanels.js'
import { QuestLog } from './quest/questLog.js'
import { SkilldexPanel } from './ui2/skilldexPanel.js'
import * as skillCheck from './skillCheck.js'

describe('Parity Slice D — Skilldex catalog', () => {
    it('exposes all 8 Skilldex skills', () => {
        expect(SKILLDEX_ENTRIES).toHaveLength(8)
        const labels = SKILLDEX_ENTRIES.map((e) => e.label)
        expect(labels).toEqual([
            'Sneak', 'Lockpick', 'Steal', 'Traps', 'First Aid', 'Doctor', 'Science', 'Repair',
        ])
    })

    it('maps to Fallout 2 skill IDs', () => {
        expect(getFalloutSkillId(Skills.FirstAid)).toBe(6)
        expect(getFalloutSkillId(Skills.Doctor)).toBe(7)
        expect(getFalloutSkillId(Skills.Sneak)).toBe(8)
        expect(getFalloutSkillId(Skills.Lockpick)).toBe(9)
        expect(getFalloutSkillId(Skills.Steal)).toBe(10)
        expect(getFalloutSkillId(Skills.Traps)).toBe(11)
        expect(getFalloutSkillId(Skills.Science)).toBe(12)
        expect(getFalloutSkillId(Skills.Repair)).toBe(13)
        expect(Object.keys(FALLOUT_SKILL_ID)).toHaveLength(8)
    })

    it('only Sneak is passive among Skilldex skills', () => {
        expect(skillRequiresTarget(Skills.Sneak)).toBe(false)
        for (const entry of SKILLDEX_ENTRIES) {
            if (entry.skill === Skills.Sneak) continue
            expect(skillRequiresTarget(entry.skill)).toBe(true)
        }
    })
})

describe('Parity Slice D — Sneak toggle', () => {
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedPlayer = globalState.player
        globalState.player = new Player()
        ;(globalState.player as Player).pcFlags = 0
    })

    afterEach(() => {
        globalState.player = savedPlayer
    })

    it('toggles SNK_MODE bit 3', () => {
        expect(isPlayerSneaking(globalState.player)).toBe(false)
        expect(togglePlayerSneak()).toBe(true)
        expect(isPlayerSneaking(globalState.player)).toBe(true)
        expect(togglePlayerSneak()).toBe(false)
        expect(isPlayerSneaking(globalState.player)).toBe(false)
    })

    it('useSkilldexSkill(Sneak) does not need a target', () => {
        expect(useSkilldexSkill(Skills.Sneak)).toBe(true)
        expect(isPlayerSneaking(globalState.player)).toBe(true)
    })
})

describe('Parity Slice D — First Aid fallback heal', () => {
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedPlayer = globalState.player
        globalState.player = new Player()
        resetSkilldexHealUses()
        vi.spyOn(skillCheck, 'rollSkillCheck').mockReturnValue({
            success: true,
            roll: 1,
            threshold: 95,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        globalState.player = savedPlayer
    })

    it('heals the player Critter on successful First Aid', () => {
        const player = globalState.player as Player
        player.stats.baseStats['Max HP'] = 50
        player.stats.baseStats['HP'] = 10
        const ok = applyHealingSkillFallback(Skills.FirstAid, player)
        expect(ok).toBe(true)
        expect(player.stats.baseStats['HP']).toBeGreaterThan(10)
    })
})

describe('Parity Slice D — SkilldexPanel', () => {
    it('is registered with UIManager', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())
        expect(mgr.get('skilldex')).toBeInstanceOf(SkilldexPanel)
        expect(mgr.get('skilldex').visible).toBe(false)
    })
})
