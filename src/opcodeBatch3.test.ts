import { describe, it, expect, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { sfxAmbientName, sfxCharName, sfxInterfaceName, sfxOpenName, sfxSceneryName, sfxWeaponName } from './sfxNames.js'

describe('sound effect names (game_sound.cc)', () => {
    it('pads like printf %6s / %4s and upper-cases', () => {
        expect(sfxAmbientName('wind')).toBe('A  WIND1')
        expect(sfxInterfaceName('ib1p1xx')).toBe('NIB1P1XX1')
        expect(sfxSceneryName(1, 0, 'dor')).toBe('SAO DOR1')
        expect(sfxSceneryName(0, 4, 'lift')).toBe('SPULIFT1')
    })

    it('doors and containers use their proto sound code', () => {
        expect(sfxOpenName({ type: 'scenery', pro: { extra: { soundID: 'b'.charCodeAt(0) } } }, 0)).toBe('SODOORSB')
        expect(sfxOpenName({ type: 'item', pro: { extra: { soundID: 'a'.charCodeAt(0) } } }, 1)).toBe('ICCNTNRA')
    })

    it('critter sounds: art name, animation letters, and the death/contact variants', () => {
        const c = { type: 'critter', art: 'art/critters/hmjmpsaa', getBase() { return 'art/critters/hmjmps' } }
        expect(sfxCharName(c, 16, 0)).toBe('HMJMPSAQ')
        expect(sfxCharName(c, 16, 4)).toBe('HMJMPSZQ') // punch contact
        expect(sfxCharName(c, 20, 3)).toBe('HMJMPSZA') // dying fall
    })

    it('weapon sounds: effect, weapon code, variant and material', () => {
        const gun = { pro: { extra: { soundID: 'k'.charCodeAt(0), dmgType: 0 } } }
        expect(sfxWeaponName(1, gun, 0, null)).toBe('WAK1XXX1')
        expect(sfxWeaponName(4, gun, 1, { type: 'scenery', pro: { extra: { materialID: 3 } } })).toBe('WHK2WXX1')
        expect(sfxWeaponName(4, gun, 0, { type: 'critter' })).toBe('WHK1FXX1')
    })
})

describe('object and dialogue opcodes', () => {
    afterEach(() => {
        globalState.inCombat = false
    })

    it('move_to returns the new tile; create_object makes nothing for pid 0', () => {
        const script: any = new (Scripting as any).Script()
        const obj: any = { _type: 'obj', type: 'item', position: { x: 0, y: 0 } }
        expect(script.move_to(obj, 2050, globalState.currentElevation)).toBe(2050)
        expect(script.create_object_sid(0, 100, 0, -1)).toBeNull()
    })

    it('pickup_obj puts the item in the script critter\'s inventory, not the player\'s', () => {
        const script: any = new (Scripting as any).Script()
        const critter: any = { _type: 'obj', type: 'critter', inventory: [] }
        const item: any = { _type: 'obj', type: 'item', pid: 7, amount: 1, approxEq(o: any) { return o.pid === 7 } }
        script.self_obj = critter
        script.pickup_obj(item)
        expect(critter.inventory).toEqual([item])
    })

    it('start_gdialog does nothing in combat', () => {
        const script: any = new (Scripting as any).Script()
        script.self_obj = { _type: 'obj', type: 'critter' }
        globalState.inCombat = true
        expect(() => script.start_gdialog(0, script.self_obj, 4, -1, -1)).not.toThrow()
    })
})
