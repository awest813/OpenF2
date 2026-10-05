import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { chargesOf, isOn, processChargedItemsUpTo, useChargedItem, PID_STEALTH_BOY, PID_STEALTH_BOY_ON } from './chargedItems.js'

describe('charged items (_item_m_use_charged_item)', () => {
    let saved: any
    let messages: string[]
    let off: () => void
    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime, map: globalState.gMap }
        globalState.gMap = null as any
        globalState.gameTickTime = 0
        messages = []
        const h = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', h)
        off = () => EventBus.off('ui:message', h)
    })
    afterEach(() => {
        off()
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
        globalState.gMap = saved.map
    })

    it('a Stealth Boy turns on, hides its carrier, burns a charge a minute and runs out', () => {
        const boy: any = { pid: PID_STEALTH_BOY, name: 'Stealth Boy', pro: { extra: { charges: 2 } } }
        const player: any = { type: 'critter', isPlayer: true, inventory: [boy], flags: 0 }
        globalState.player = player
        useChargedItem(boy)
        expect(isOn(boy)).toBe(true)
        expect(boy.pid).toBe(PID_STEALTH_BOY_ON)
        expect(player.flags & 0x20000).toBeTruthy()
        expect(chargesOf(boy)).toBe(1)
        processChargedItemsUpTo(600)
        expect(chargesOf(boy)).toBe(0)
        processChargedItemsUpTo(1200)
        expect(isOn(boy)).toBe(false)
        expect(player.flags & 0x20000).toBe(0)
        expect(messages).toEqual(['Stealth Boy is on.', 'Stealth Boy has no charges left.', 'Stealth Boy is off.'])
    })

    it('using a lit one turns it off', () => {
        const boy: any = { pid: PID_STEALTH_BOY, name: 'Stealth Boy', pro: { extra: { charges: 5 } } }
        globalState.player = { type: 'critter', isPlayer: true, inventory: [boy], flags: 0 } as any
        useChargedItem(boy)
        useChargedItem(boy)
        expect(isOn(boy)).toBe(false)
        expect(boy.pid).toBe(PID_STEALTH_BOY)
    })
})
