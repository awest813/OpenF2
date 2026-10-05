/**
 * Interface bar behaviour that touches game state (interface.cc,
 * inventory.cc): reload from the item button and the inventory AP cost.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GamePanel } from './gamePanel.js'
import { EventBus } from '../eventBus.js'
import globalState from '../globalState.js'
import { createPlayerEntity } from '../ecs/entityFactory.js'
import { PerkId } from '../character/perkIds.js'

function makePlayer(ap: number, perks: Record<number, number> = {}) {
    const AP = {
        combat: ap,
        move: 0,
        getAvailableCombatAP() { return this.combat },
        subtractCombatAP(v: number) { if (v > this.combat) {return false} this.combat -= v; return true },
    }
    const ammo = { pid: 40, amount: 20, type: 'item' }
    const ammo2 = { pid: 40, amount: 20, type: 'item' }
    const weapon: any = {
        pid: 8,
        pro: { extra: { attackMode: 6, maxAmmo: 30, ammoPID: 40, perk: -1 } },
        extra: { ammoLoaded: 0, ammoType: 40 },
        weapon: {
            mode: 'reload',
            cycleMode() { this.mode = 'primary' },
            hitMode: () => 1,
            isCalled: () => false,
        },
    }
    return { isPlayer: true, AP, perkRanks: perks, inventory: [ammo, ammo2], equippedWeapon: weapon, getStat: () => 5 }
}

let saved: any
let savedCombat: any
let savedInCombat: boolean

beforeEach(() => {
    saved = globalState.player
    savedCombat = globalState.combat
    savedInCombat = globalState.inCombat
    EventBus.clear('ui:openPanel')
    EventBus.clear('ui:message')
})

afterEach(() => {
    globalState.player = saved
    globalState.combat = savedCombat
    globalState.inCombat = savedInCombat
    EventBus.clear('ui:openPanel')
    EventBus.clear('ui:message')
    vi.restoreAllMocks()
})

describe('interface bar actions', () => {
    it('RELOAD fills the weapon from several stacks for one 2 AP charge, then cycles', () => {
        const player = makePlayer(5)
        globalState.player = player as any
        globalState.inCombat = true
        globalState.combat = { inPlayerTurn: true } as any
        const panel = new GamePanel(640, 480, createPlayerEntity({ name: 'R' }))
        panel.onMouseDown(267 + 20, 26 + 20, 'l')
        expect(player.equippedWeapon.extra.ammoLoaded).toBe(30)
        expect(player.AP.combat).toBe(3)
        expect(player.equippedWeapon.weapon.mode).toBe('primary')
    })

    it('opening the inventory in combat costs 4 AP, 2 with Quick Pockets, and is refused when short', () => {
        globalState.inCombat = true
        globalState.combat = { inPlayerTurn: true } as any
        const opened: string[] = []
        const messages: string[] = []
        EventBus.on('ui:openPanel', (e) => opened.push(e.panelName))
        EventBus.on('ui:message', (e) => messages.push(e.text))
        const panel = new GamePanel(640, 480, createPlayerEntity({ name: 'I' }))

        const p1 = makePlayer(5)
        globalState.player = p1 as any
        panel.onKeyDown('i')
        expect(p1.AP.combat).toBe(1)
        expect(opened).toEqual(['inventory'])

        const p2 = makePlayer(3)
        globalState.player = p2 as any
        panel.onKeyDown('i')
        expect(p2.AP.combat).toBe(3)
        expect(opened).toEqual(['inventory'])
        expect(messages.length).toBe(1)

        const p3 = makePlayer(3, { [PerkId.QUICK_POCKETS]: 1 })
        globalState.player = p3 as any
        panel.onKeyDown('i')
        expect(p3.AP.combat).toBe(1)
        expect(opened).toEqual(['inventory', 'inventory'])
    })
})
