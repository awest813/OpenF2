import { describe, expect, it, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

describe('Phase 15-A — has_trait object cases no longer stubbed', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('returns worn-state for INVEN_TYPE_WORN on critters', () => {
        const script = new Scripting.Script()
        const critter: any = { type: 'critter', equippedArmor: { pid: 1 }, visible: true, orientation: 0, aiNum: 2, teamNum: 3 }

        expect(script.has_trait(1, critter, 0)).toBe(1)
        critter.equippedArmor = null
        expect(script.has_trait(1, critter, 0)).toBe(0)
        expect(stubHitCount()).toBe(0)
    })

    it('returns AI/team numbers for critter object traits', () => {
        const script = new Scripting.Script()
        const critter: any = { type: 'critter', equippedArmor: null, visible: true, orientation: 0, aiNum: 9, teamNum: 4 }

        expect(script.has_trait(1, critter, 5)).toBe(9)
        expect(script.has_trait(1, critter, 6)).toBe(4)
        expect(stubHitCount()).toBe(0)
    })
})

describe('Phase 15-B — inven_cmds index lookup', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('returns inventory item for INVEN_CMD_INDEX_PTR', () => {
        const script = new Scripting.Script()
        const itemA: any = { pid: 40 }
        const itemB: any = { pid: 41 }
        const critter: any = { type: 'critter', inventory: [itemA, itemB] }

        expect(script.inven_cmds(critter, 13, 1)).toBe(itemB)
        expect(script.inven_cmds(critter, 13, 2)).toBeNull()
        expect(stubHitCount()).toBe(0)
    })

    it('still records stub hit for unsupported inventory commands', () => {
        const script = new Scripting.Script()
        const critter: any = { type: 'critter', inventory: [] }

        expect(script.inven_cmds(critter, 99, 0)).toBeNull()
        expect(stubHitCount()).toBe(1)
    })
})

describe('Phase 15-C — obj_can_hear_obj proximity check', () => {
    it('returns 1 inside hearing range and 0 beyond range', () => {
        const script = new Scripting.Script()
        const a: any = { _type: 'obj', type: 'misc', position: { x: 0, y: 0 } }
        const near: any = { _type: 'obj', type: 'misc', position: { x: 3, y: 3 } }
        const far: any = { _type: 'obj', type: 'misc', position: { x: 30, y: 30 } }

        expect(script.obj_can_hear_obj(a, near)).toBe(1)
        expect(script.obj_can_hear_obj(a, far)).toBe(0)
    })
})

describe('Phase 15-D — checklist reflects de-stubbed procedures', () => {
    it('has_trait_worn is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'has_trait_worn')
        expect(entry?.status).toBe('implemented')
    })

    it('inven_cmds and obj_can_hear_obj are now partial', () => {
        const inven = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'inven_cmds')
        const hearing = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'obj_can_hear_obj')

        expect(inven?.status).toBe('partial')
        expect(hearing?.status).toBe('partial')
    })
})
