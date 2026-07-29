/**
 * Parity Slice C — main menu + character creation (P0-1) and Critter sheet sync (P0-2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
    applyCharacterCreation,
    validateCharacterCreation,
    defaultCharacterCreation,
    defaultSpecial,
    specialPointsSpent,
    CHARGEN_TOTAL_SPECIAL_POINTS,
    CHARGEN_SKILLS,
    shouldSkipMainMenu,
} from './character/chargen.js'
import { skillDependencies } from './skills.js'
import { Player } from './player.js'
import globalState from './globalState.js'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import {
    syncPlayerEntityFromCritter,
    spendCritterSkillPoint,
} from './playerProjection.js'
import { UIManagerImpl } from './ui2/uiPanel.js'
import { registerDefaultPanels } from './ui2/registerPanels.js'
import { QuestLog } from './quest/questLog.js'
import { EventBus } from './eventBus.js'
import { MainMenuPanel } from './ui2/mainMenuPanel.js'
import { CharacterCreationPanel } from './ui2/characterCreationPanel.js'

function destroyAllEntities(): void {
    for (const id of EntityManager.allIds()) {
        EntityManager.destroy(id)
    }
}

describe('Parity Slice C — chargen validate/apply', () => {
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedPlayer = globalState.player
        globalState.player = new Player()
        globalState.playerCharTraits = []
    })

    afterEach(() => {
        globalState.player = savedPlayer
    })

    it('default SPECIAL starts at 35 with 5 points remaining (F2)', () => {
        expect(specialPointsSpent(defaultSpecial())).toBe(35)
        expect(CHARGEN_TOTAL_SPECIAL_POINTS - 35).toBe(5)
    })

    it('rejects incomplete sheets', () => {
        const data = defaultCharacterCreation()
        const v = validateCharacterCreation(data)
        expect(v.ok).toBe(false)
        expect(v.errors.some((e) => /tagged/i.test(e) || /SPECIAL/i.test(e))).toBe(true)
    })

    it('applies a valid sheet onto Critter and clears debug loadout', () => {
        const data = defaultCharacterCreation()
        data.name = 'Test Runner'
        data.special = { STR: 6, PER: 6, END: 6, CHA: 5, INT: 6, AGI: 6, LUK: 5 }
        data.taggedSkills = ['Small Guns', 'Speech', 'Lockpick']
        data.traitIds = [1] // Bruiser

        const result = applyCharacterCreation(data)
        expect(result.ok).toBe(true)

        const player = globalState.player as Player
        expect(player.name).toBe('Test Runner')
        expect(player.stats.getBase('STR')).toBe(8) // 6 + Bruiser +2
        expect(player.skills.isTagged('Small Guns')).toBe(true)
        expect(player.charTraits.has(1)).toBe(true)
        expect(player.inventory.length).toBe(0)
        expect(player.leftHand).toBeNull()
        expect(player.level).toBe(1)
        expect(player.xp).toBe(0)
    })

    it('Gifted folds +1 SPECIAL and −10 skill bases', () => {
        const data = defaultCharacterCreation()
        data.taggedSkills = ['Science', 'Repair', 'Outdoorsman']
        data.traitIds = [15]
        // 40 SPECIAL points before Gifted's +1-each fold
        data.special = { STR: 6, PER: 6, END: 6, CHA: 5, INT: 6, AGI: 6, LUK: 5 }

        expect(applyCharacterCreation(data).ok).toBe(true)
        const player = globalState.player as Player
        expect(player.stats.getBase('INT')).toBe(7) // 6 + Gifted
        const start = skillDependencies['Small Guns'].startValue
        expect(player.skills.getBase('Small Guns')).toBe(start - 10)
    })

    it('shouldSkipMainMenu is false without a browser location query', () => {
        expect(shouldSkipMainMenu()).toBe(false)
    })
})

describe('Parity Slice C — Critter skill spend projects to ECS', () => {
    let entityId: number
    let savedPlayer: typeof globalState.player
    let savedEntityId: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        destroyAllEntities()
        globalState.player = new Player()
        ;(globalState.player as Player).skills.skillPoints = 20
        entityId = createPlayerEntity({ name: 'VAULT DWELLER' })
        globalState.playerEntityId = entityId
        syncPlayerEntityFromCritter()
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
        destroyAllEntities()
    })

    it('spendCritterSkillPoint lowers Critter skillPoints and updates ECS', () => {
        const before = (globalState.player as Player).skills.skillPoints
        const ok = spendCritterSkillPoint('Small Guns')
        expect(ok).toBe(true)
        expect((globalState.player as Player).skills.skillPoints).toBeLessThan(before)

        const skills = EntityManager.get<'skills'>(entityId, 'skills')
        expect(skills?.availablePoints).toBe((globalState.player as Player).skills.skillPoints)
    })
})

describe('Parity Slice C — main menu / chargen panels', () => {
    it('registers mainMenu and characterCreation panels', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())
        expect(mgr.get('mainMenu')).toBeInstanceOf(MainMenuPanel)
        expect(mgr.get('characterCreation')).toBeInstanceOf(CharacterCreationPanel)
        expect(mgr.get('mainMenu').visible).toBe(false)
        expect(mgr.get('characterCreation').visible).toBe(false)
    })

    it('New Game emits game:newGameRequested', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())
        const menu = mgr.get<MainMenuPanel>('mainMenu')
        menu.show()

        let got = false
        const handler = () => { got = true }
        EventBus.on('game:newGameRequested', handler)
        try {
            menu.onKeyDown('Enter')
            expect(got).toBe(true)
        } finally {
            EventBus.off('game:newGameRequested', handler)
        }
    })

    it('lists all chargen skills', () => {
        expect(CHARGEN_SKILLS.length).toBe(18)
    })
})
