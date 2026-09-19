/**
 * Parity P0-2 deepen — Critter carry weight enforcement + ECS projection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Player } from './player.js'
import globalState from './globalState.js'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import {
    canCritterCarryMore,
    getCritterCarryLimitLbs,
    getCritterInventoryWeightLbs,
    getItemWeightLbs,
} from './critterInventory.js'
import { syncPlayerEntityFromCritter } from './playerProjection.js'
import { Obj } from './object.js'

function makeItem(weight: number, pid = 99): Obj {
    const item = Object.create(Obj.prototype) as Obj
    ;(item as any).weight = weight
    item.pid = pid
    item.type = 'item'
    item.amount = 1
    item.approxEq = (other: Obj) => other?.pid === item.pid
    item.clone = function clone(this: Obj) {
        const copy = Object.create(Obj.prototype) as Obj
        Object.assign(copy, this)
        copy.amount = this.amount
        return copy
    }
    item.setAmount = function setAmount(this: Obj, n: number) {
        this.amount = n
        return this
    }
    return item
}

describe('Parity P0-2 — critter carry weight', () => {
    let savedPlayer: typeof globalState.player
    let savedEntityId: typeof globalState.playerEntityId

    beforeEach(() => {
        savedPlayer = globalState.player
        savedEntityId = globalState.playerEntityId
        globalState.player = new Player()
        globalState.playerEntityId = createPlayerEntity({ name: 'TESTER' })
        const player = globalState.player as Player
        player.stats.useBonuses = false
        player.stats.setBase('STR', 5)
        player.stats.setBase('Carry', 50)
        player.inventory = []
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.playerEntityId = savedEntityId
    })

    it('computes item and inventory weight from runtime weight fields', () => {
        const item = makeItem(10)
        expect(getItemWeightLbs(item, 3)).toBe(30)
        const player = globalState.player as Player
        player.addInventoryItem(makeItem(5), 2)
        expect(getCritterInventoryWeightLbs(player)).toBe(10)
        expect(getCritterCarryLimitLbs(player)).toBe(50)
    })

    it('refuses pickup when carry weight would be exceeded', () => {
        const player = globalState.player as Player
        player.addInventoryItem(makeItem(40), 1)
        expect(canCritterCarryMore(player, makeItem(15), 1)).toBe(false)
        const before = player.inventory.length
        player.addInventoryItem(makeItem(15), 1)
        expect(player.inventory.length).toBe(before)
    })

    it('projects carried weight onto ECS inventory after Critter pickup', () => {
        const player = globalState.player as Player
        player.addInventoryItem(makeItem(12), 2)
        syncPlayerEntityFromCritter()
        const inv = EntityManager.get<'inventory'>(globalState.playerEntityId!, 'inventory')
        const stats = EntityManager.get<'stats'>(globalState.playerEntityId!, 'stats')
        expect(inv?.currentWeight).toBe(24)
        expect(stats?.carryWeight).toBe(50)
    })
})
