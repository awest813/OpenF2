/**
 * Parity P0-2 deepen — Critter XP / perk owed projects to ECS after give_exp_points.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { Player } from './player.js'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import {
    syncPlayerEntityFromCritter,
    recordCritterPerkGrant,
    readPlayerHudSnapshot,
} from './playerProjection.js'
import { SkillSet } from './char.js'

describe('Parity P0-2 — give_exp_points projects XP/level to ECS', () => {
    let entityId: number
    let savedPlayer: typeof globalState.player
    let savedEntityId: number
    let savedPerksOwed: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        savedPerksOwed = globalState.playerPerksOwed
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
        globalState.player = new Player()
        ;(globalState.player as Player).xp = 0
        ;(globalState.player as Player).level = 1
        ;(globalState.player as Player).skills = new SkillSet({}, [], 0)
        globalState.playerPerksOwed = 0
        entityId = createPlayerEntity({ name: 'XP Test' })
        globalState.playerEntityId = entityId
        syncPlayerEntityFromCritter()
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
        globalState.playerPerksOwed = savedPerksOwed
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
    })

    it('give_exp_points updates Critter XP and ECS stats.xp', () => {
        const script = new (Scripting as any).Script()
        script.give_exp_points(500)
        expect((globalState.player as Player).xp).toBe(500)
        const stats = EntityManager.get<'stats'>(entityId, 'stats')
        expect(stats?.xp).toBe(500)
        expect(readPlayerHudSnapshot()?.name).toBeTruthy()
    })

    it('level-up awards skill points on Critter and projects availablePoints', () => {
        const script = new (Scripting as any).Script()
        const beforeSP = (globalState.player as Player).skills.skillPoints
        script.give_exp_points(1000) // level 2
        expect((globalState.player as Player).level).toBe(2)
        expect((globalState.player as Player).skills.skillPoints).toBeGreaterThan(beforeSP)
        const skills = EntityManager.get<'skills'>(entityId, 'skills')
        expect(skills?.availablePoints).toBe((globalState.player as Player).skills.skillPoints)
    })

    it('perk owed at level 3 projects to ECS perksAvailable', () => {
        const script = new (Scripting as any).Script()
        script.give_exp_points(3000) // reaches level 3
        expect((globalState.player as Player).level).toBeGreaterThanOrEqual(3)
        expect(globalState.playerPerksOwed).toBeGreaterThanOrEqual(1)
        const playerComp = EntityManager.get<'player'>(entityId, 'player')
        expect(playerComp?.perksAvailable).toBe(globalState.playerPerksOwed)
    })

    it('recordCritterPerkGrant decrements owed and records perkRanks', () => {
        globalState.playerPerksOwed = 2
        recordCritterPerkGrant(1)
        expect(globalState.playerPerksOwed).toBe(1)
        expect((globalState.player as Player).perkRanks[1]).toBe(1)
        const playerComp = EntityManager.get<'player'>(entityId, 'player')
        expect(playerComp?.perksAvailable).toBe(1)
        expect(playerComp?.acquiredPerks).toContain(1)
    })
})
