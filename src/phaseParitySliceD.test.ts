/**
 * Parity Slice D — Skilldex 8 skills (P0-3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Skills, skillRequiresTarget } from './skills.js'
import {
    SKILLDEX_ENTRIES,
    FALLOUT_SKILL_ID,
    getFalloutSkillId,
    togglePlayerSneak,
    isPlayerSneaking,
    useSkilldexSkill,
} from './skilldex.js'
import { Player } from './player.js'
import globalState from './globalState.js'

import { UIManagerImpl } from './ui2/uiPanel.js'
import { registerDefaultPanels } from './ui2/registerPanels.js'
import { QuestLog } from './quest/questLog.js'
import { SkilldexPanel } from './ui2/skilldexPanel.js'

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

    it('toggles the sneaking state (dude state bit 0)', () => {
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

describe('Parity Slice D — SkilldexPanel', () => {
    it('is registered with UIManager', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())
        expect(mgr.get('skilldex')).toBeInstanceOf(SkilldexPanel)
        expect(mgr.get('skilldex').visible).toBe(false)
    })
})
