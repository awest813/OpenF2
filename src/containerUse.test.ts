import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { Obj, protoExtendedFlags, useContainerAndLoot } from './object.js'

function obj(type: string, extra: Record<string, unknown>, props: Record<string, unknown> = {}): Obj {
    const o = Object.create(Obj.prototype)
    Object.assign(o, { type, pro: { extra }, open: false, locked: false, name: 'Locker', _script: undefined }, props)
    o.singleAnimation = vi.fn()
    return o
}

describe('proto extended flags (proto.cc _proto_action_can_*)', () => {
    it('rebuilds an item word from proto.py bytes', () => {
        const o = obj('item', { itemFlags: 0x08, actionFlags: 0x00, weaponFlags: 0x88, attackMode: 0x21 })
        expect(protoExtendedFlags(o)).toBe(0x08008821)
    })

    it('rebuilds a scenery word from its two halves', () => {
        expect(protoExtendedFlags(obj('scenery', { wallLightTypeFlags: 0, actionFlags: 0x0800 }))).toBe(0x0800)
    })

    it('Use is 0x0800; every container can be used', () => {
        expect(obj('item', { weaponFlags: 0x08, subType: 3 }).canUse).toBe(true)
        expect(obj('item', { weaponFlags: 0x00, actionFlags: 0x08, subType: 3 }).canUse).toBe(false)
        expect(obj('item', { weaponFlags: 0x00, subType: 1 }).canUse).toBe(true)
        expect(obj('scenery', { actionFlags: 0x0800, subType: 5 }).canUse).toBe(true)
        expect(obj('scenery', { actionFlags: 0x0008, subType: 5 }).canUse).toBe(false)
    })

    it('containers can only be carried with the PickUp flag (0x8000)', () => {
        expect(obj('item', { subType: 1, weaponFlags: 0 }).canPickUp).toBe(false)
        expect(obj('item', { subType: 1, weaponFlags: 0x80 }).canPickUp).toBe(true)
        expect(obj('item', { subType: 3 }).canPickUp).toBe(true)
    })
})

describe('clicking a container (actionPickUp → _obj_use_container → looting)', () => {
    let messages: string[]
    let off: () => void
    let saved: any
    beforeEach(() => {
        saved = { uiManager: globalState.uiManager, player: globalState.player }
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })
    afterEach(() => {
        off()
        globalState.uiManager = saved.uiManager
        globalState.player = saved.player
    })

    it('a locked container says so and stays shut', () => {
        const locker = obj('item', { subType: 1 }, { locked: true })
        useContainerAndLoot(locker, { isPlayer: true } as any)
        expect(locker.open).toBe(false)
        expect(messages).toEqual(['It is locked.'])
    })

    it('opens with "You search the …" and then loots', () => {
        const openWithLive = vi.fn()
        globalState.uiManager = { get: () => ({ openWithLive }) } as any
        globalState.player = { inventory: [] } as any
        const locker = obj('item', { subType: 1 }, { inventory: [] })
        useContainerAndLoot(locker, { isPlayer: true } as any)
        expect(locker.open).toBe(true)
        expect(messages).toEqual(['You search the Locker.'])
        expect(openWithLive).toHaveBeenCalled()
    })

    it('using an open container closes it without looting', () => {
        const savedMap = globalState.gMap
        globalState.gMap = { updateMap: () => {} } as any
        const locker = obj('item', { subType: 1 }, { open: true })
        locker.use({ isPlayer: true } as any)
        globalState.gMap = savedMap
        expect(locker.open).toBe(false)
        expect(messages).toEqual(['You close the Locker.'])
    })
})
