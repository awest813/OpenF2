/**
 * Parity P0-2 deepen — unified Critter XP + combat HP projection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import { syncPlayerEntityFromCritter } from './playerProjection.js'
import { awardCritterXp, xpThresholdForLevel } from './character/xp.js'
import { critterDamage, critterKill } from './critter.js'
import { SkillSet } from './char.js'
import { Scripting } from './scripting.js'

describe('Parity P0-2 — unified Critter XP', () => {
    let entityId: number
    let savedPlayer: typeof globalState.player
    let savedEntityId: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
        globalState.player = new Player()
        ;(globalState.player as Player).xp = 0
        ;(globalState.player as Player).level = 1
        ;(globalState.player as Player).skills = new SkillSet({}, [], 0)
        entityId = createPlayerEntity({ name: 'Combat XP' })
        globalState.playerEntityId = entityId
        syncPlayerEntityFromCritter()
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
    })

    it('xpThresholdForLevel matches FO2 triangular totals', () => {
        expect(xpThresholdForLevel(1)).toBe(1000)
        expect(xpThresholdForLevel(2)).toBe(3000)
    })

    it('awardCritterXp and give_exp_points share the same level-up path', () => {
        const before = (globalState.player as Player).skills.skillPoints
        awardCritterXp(globalState.player as Player, 1000)
        expect((globalState.player as Player).level).toBe(2)
        const script = new (Scripting as any).Script()
        script.give_exp_points(2000)
        expect((globalState.player as Player).level).toBeGreaterThanOrEqual(3)
        expect((globalState.player as Player).skills.skillPoints).toBeGreaterThan(before)
    })

    it('critterKill combat XP uses awardCritterXp and projects to ECS', () => {
        const player = globalState.player as Player
        const victim: any = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            stats: { modifyBase: vi.fn(), get: () => 0, getBase: () => 0 },
            getStat: () => 0,
            hasAnimation: () => false,
            staticAnimation: (_a: string, cb: () => void) => cb(),
            pro: { extra: { XPValue: 1000 } },
            killType: null,
        }
        vi.spyOn(Scripting, 'destroy').mockImplementation(() => {})
        critterKill(victim, player, false)
        expect(player.xp).toBe(1000)
        expect(player.level).toBe(2)
        const stats = EntityManager.get<'stats'>(entityId, 'stats')
        expect(stats?.xp).toBe(1000)
        expect(stats?.level).toBe(2)
    })
})

describe('Parity P0-2 — combat damage projects to ECS', () => {
    let entityId: number
    let savedPlayer: typeof globalState.player
    let savedEntityId: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
        globalState.player = new Player()
        ;(globalState.player as Player).stats.baseStats['Max HP'] = 80
        ;(globalState.player as Player).stats.baseStats['HP'] = 80
        entityId = createPlayerEntity({ name: 'Damage Sync' })
        globalState.playerEntityId = entityId
        syncPlayerEntityFromCritter()
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
        for (const id of EntityManager.allIds()) {
            EntityManager.destroy(id)
        }
        vi.restoreAllMocks()
    })

    it('critterDamage on the player updates ECS currentHp', () => {
        const player = globalState.player as Player
        vi.spyOn(Scripting, 'damage').mockImplementation(() => {})
        critterDamage(player, 25, player, false, false)
        const stats = EntityManager.get<'stats'>(entityId, 'stats')
        expect(player.stats.get('HP')).toBe(55)
        expect(stats?.currentHp).toBe(55)
    })
})
