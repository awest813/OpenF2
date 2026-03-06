/**
 * Phase 27 regression tests.
 *
 * Focus: dialogue/barter/interaction lifecycle stability across repeated
 * open/close cycles.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventBus } from './eventBus.js'
import { DialoguePanel } from './ui2/dialoguePanel.js'
import { BarterPanel } from './ui2/barterPanel.js'
import { LootPanel } from './ui2/lootPanel.js'
import { InventoryPanel } from './ui2/inventoryPanel.js'

afterEach(() => {
    EventBus.clear()
    vi.restoreAllMocks()
})

describe('Phase 27-A — repeated dialogue exchange lifecycle', () => {
    it('new dialogue replies/options do not leak selections from prior exchange', () => {
        const panel = new DialoguePanel(800, 600)
        const selected: number[] = []
        EventBus.on('dialogue:optionSelected', ({ optionID }) => selected.push(optionID))

        panel.setReply('First exchange')
        panel.addOption('Old path', 101)
        panel.onMouseDown(200, 160, 'l')
        expect(selected).toEqual([101])

        panel.setReply('Second exchange')
        panel.addOption('New path', 202)
        panel.onMouseDown(200, 160, 'l')
        expect(selected).toEqual([101, 202])
    })
})

describe('Phase 27-B — repeated barter rounds retain correct ownership', () => {
    it('accepted first-round exchange is committed before second round begins', () => {
        const panel = new BarterPanel(800, 600)
        panel.openWith(
            [{ name: 'Stimpak', amount: 1, value: 100 }],
            [{ name: 'Knife', amount: 1, value: 50 }],
        )

        // Round 1: exchange Stimpak for Knife
        panel.onMouseDown(12, 42, 'l')    // select Stimpak from player inventory
        panel.onMouseDown(150, 42, 'l')   // move to player table
        panel.onMouseDown(432, 42, 'l')   // select Knife from merchant inventory
        panel.onMouseDown(300, 42, 'l')   // move to merchant table
        const offerX = panel.bounds.width / 2 - 70 - 6
        const btnY = panel.bounds.height - 40
        panel.onMouseDown(offerX + 10, btnY + 5, 'l')

        expect(panel.playerInventory).toContainEqual({ name: 'Knife', amount: 1, value: 50 })
        expect(panel.merchantInventory).toContainEqual({ name: 'Stimpak', amount: 1, value: 100 })

        // Round 2: move Knife from player's inventory to player's table (still owned by player).
        panel.onMouseDown(12, 42, 'l')
        panel.onMouseDown(150, 42, 'l')
        expect(panel.playerTable).toContainEqual({ name: 'Knife', amount: 1, value: 50 })
    })
})

describe('Phase 27-C — loot/inventory loop consistency', () => {
    it('loot close payload reflects current inventories after take-all and remains stable on reopen', () => {
        const panel = new LootPanel(800, 600)
        const closedPayloads: any[] = []
        EventBus.on('loot:closed', (payload) => closedPayloads.push(payload))

        panel.openWith(
            [{ name: 'Knife', amount: 1 }],
            [{ name: 'Ammo', amount: 5 }],
        )
        const takeAllX = panel.bounds.width / 2 - 80 - 4
        const btnY = panel.bounds.height - 36
        panel.onMouseDown(takeAllX + 1, btnY + 1, 'l') // TAKE ALL
        const closeX = panel.bounds.width / 2 + 4
        panel.onMouseDown(closeX + 1, btnY + 1, 'l')   // CLOSE

        expect(closedPayloads).toHaveLength(1)
        expect(closedPayloads[0].containerInventory).toEqual([])
        expect(closedPayloads[0].playerInventory).toContainEqual({ name: 'Ammo', amount: 5 })

        // Re-open with new container data; prior payload should not mutate panel state.
        panel.openWith(
            [{ name: 'Knife', amount: 1 }],
            [{ name: 'Rope', amount: 1 }],
        )
        expect(panel.containerInventory).toEqual([{ name: 'Rope', amount: 1 }])
    })

    it('inventory use/drop sequence remains index-stable across repeated interactions', () => {
        const panel = new InventoryPanel(800, 600)
        const used: number[] = []
        const dropped: number[] = []
        EventBus.on('inventory:useItem', ({ index }) => used.push(index))
        EventBus.on('inventory:dropItem', ({ index }) => dropped.push(index))

        panel.items = [
            { name: 'Stimpak', amount: 1, canUse: true },
            { name: 'Rope', amount: 1, canUse: false },
        ]
        panel.show()

        panel.onMouseDown(20, 90, 'l')    // select index 0
        panel.onMouseDown(285, 90, 'l')   // use
        panel.onMouseDown(20, 112, 'l')   // select index 1
        panel.onMouseDown(285, 118, 'l')  // drop

        expect(used).toEqual([0])
        expect(dropped).toEqual([1])
        expect(panel.items).toEqual([{ name: 'Stimpak', amount: 1, canUse: true }])
    })
})
