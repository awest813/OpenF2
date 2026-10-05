/**
 * Chem save/load + companion trade (Slice F persist + G polish).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { Party } from './party.js'
import {
    canTradeWithPartyMember,
    openCompanionTrade,
    transferInventoryItem,
} from './partyTrade.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { Critter } from './object.js'
import { LootPanel } from './ui2/lootPanel.js'

describe('Companion trade', () => {
    let savedPlayer: typeof globalState.player
    let savedParty: typeof globalState.gParty
    let savedCombat: boolean
    let savedMgr: typeof globalState.uiManager

    beforeEach(() => {
        savedPlayer = globalState.player
        savedParty = globalState.gParty
        savedCombat = globalState.inCombat
        savedMgr = globalState.uiManager
        globalState.player = new Player()
        ;(globalState.player as Player).inventory = [
            { name: 'Stimpak', pid: 40, amount: 2 } as any,
        ]
        globalState.gParty = new Party()
        globalState.inCombat = false
        globalState.uiManager = null
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.gParty = savedParty
        globalState.inCombat = savedCombat
        globalState.uiManager = savedMgr
    })

    it('canTradeWithPartyMember requires living party member out of combat', () => {
        const buddy = {
            pid: 16777278,
            name: 'Vic',
            type: 'critter',
            dead: false,
            inventory: [{ name: 'Crowbar', pid: 20, amount: 1 }],
        } as any as Critter
        expect(canTradeWithPartyMember(buddy)).toBe(false)
        globalState.gParty.addPartyMember(buddy)
        expect(canTradeWithPartyMember(buddy)).toBe(true)
        globalState.inCombat = true
        expect(canTradeWithPartyMember(buddy)).toBe(false)
    })

    it('transferInventoryItem moves a stack between inventories', () => {
        const from = [{ name: 'Knife', pid: 4, amount: 1 } as any]
        const to: any[] = []
        expect(transferInventoryItem(from, to, 0)).toBe(true)
        expect(from).toHaveLength(0)
        expect(to).toHaveLength(1)
        expect(to[0].name).toBe('Knife')
    })

    it('LootPanel.openWithLive mutates Critter inventories on take-all', () => {
        const playerInv: any[] = []
        const companionInv: any[] = [{ name: 'Leather Armor', pid: 1, amount: 1 }]
        const panel = new LootPanel(800, 600)
        panel.openWithLive(playerInv, companionInv)
        // Simulate take-all via private method
        ;(panel as any)._takeAll()
        expect(companionInv).toHaveLength(0)
        expect(playerInv).toHaveLength(1)
        expect(playerInv[0].name).toBe('Leather Armor')
    })

    it('openCompanionTrade returns false without uiManager but allows inventory helpers', () => {
        const buddy = {
            pid: 16777313,
            name: 'Sulik',
            type: 'critter',
            dead: false,
            inventory: [],
        } as any as Critter
        globalState.gParty.addPartyMember(buddy)
        expect(openCompanionTrade(buddy)).toBe(false)
    })
})
