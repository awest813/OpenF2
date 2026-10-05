import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import './scripting.js'
import globalState from './globalState.js'
import { sfallMetarules } from './sfallFunctions.js'
import { sfallSprintf } from './sfallPrintf.js'
import { getArray } from './sfallArrays.js'
import { toTileNum } from './tile.js'

describe('sprintf_lite (sfall Utils.cpp)', () => {
    it('formats C conversions with flags, width and precision', () => {
        expect(sfallSprintf('%d apples', [5])).toBe('5 apples')
        expect(sfallSprintf('%05d|%-4d|%+d', [42])).toBe('00042|42  |+42')
        expect(sfallSprintf('%x %X %#x %o', [255])).toBe('ff FF 0xff 377')
        expect(sfallSprintf('%.2f', [3.14159])).toBe('3.14')
        expect(sfallSprintf('%s and %s', ['a', 'b'])).toBe('a and b')
        expect(sfallSprintf('%s', [7])).toBe('7') // %s on a number prints it as %d
        expect(sfallSprintf('100%%', [])).toBe('100%')
        expect(sfallSprintf('%c', [65])).toBe('A')
        expect(sfallSprintf('%d %d', [1])).toBe('1 1') // a missing value reuses the last
        expect(sfallSprintf('%ld', [9])).toBe('9') // size prefixes are ignored
    })
})

describe('sfall metarules (Metarule.cpp)', () => {
    let saved: any
    beforeEach(() => { saved = { gMap: globalState.gMap, player: globalState.player } })
    afterEach(() => { globalState.gMap = saved.gMap; globalState.player = saved.player })

    it('strings', () => {
        expect(sfallMetarules.string_compare('Hello', 'hELLO')).toBe(1)
        expect(sfallMetarules.string_compare('Hello', 'Help')).toBe(0)
        expect(sfallMetarules.string_find('abcabc', 'c')).toBe(2)
        expect(sfallMetarules.string_find('abcabc', 'c', 3)).toBe(5)
        expect(sfallMetarules.string_find('abcabc', 'c', -2)).toBe(5)
        expect(sfallMetarules.string_find('abc', 'c', 3)).toBe(-1)
        expect(sfallMetarules.string_to_case('MiXed', 1)).toBe('MIXED')
        expect(sfallMetarules.string_format('%s=%d', 'hp', 12)).toBe('hp=12')
        expect(sfallMetarules.floor2(-1.5)).toBe(-2)
    })

    it('objects_in_radius: by type and distance, in tile order', () => {
        const near = { type: 'critter', position: { x: 10, y: 11 } }
        const far = { type: 'critter', position: { x: 10, y: 20 } }
        const item = { type: 'item', position: { x: 10, y: 10 } }
        globalState.gMap = { objects: [[far, near, item], [], []] } as any
        const tile = toTileNum({ x: 10, y: 10 })
        const all = getArray(sfallMetarules.objects_in_radius(tile, 2, 0))!
        expect(all.size).toBe(2)
        const critters = getArray(sfallMetarules.objects_in_radius(tile, 2, 0, 1))!
        expect(critters.size).toBe(1)
        expect(critters.get(0)).toBe(near)
    })

    it('object data by offset', () => {
        const c: any = { type: 'critter', position: { x: 3, y: 4 }, orientation: 2, crippledLeftArm: true, AP: { combat: 6 } }
        expect(sfallMetarules.get_object_data(c, 0x04)).toBe(toTileNum({ x: 3, y: 4 }))
        expect(sfallMetarules.get_object_data(c, 0x1c)).toBe(2)
        expect(sfallMetarules.get_object_data(c, 0x44)).toBe(0x10)
        expect(sfallMetarules.get_object_data(c, 0x40)).toBe(6)
        sfallMetarules.set_object_data(c, 0x44, 0x40)
        expect(c.blinded).toBe(true)
        expect(c.crippledLeftArm).toBe(false)
    })

    it('unwield_slot takes the item out of the hand, leaving it carried', () => {
        const gun: any = { type: 'item', pid: 8 }
        const c: any = { type: 'critter', inventory: [gun], rightHand: gun }
        expect(sfallMetarules.unwield_slot(c, 1)).toBe(0)
        expect(c.rightHand).toBeFalsy()
        expect(c.inventory).toContain(gun)
        expect(sfallMetarules.unwield_slot(c, 3)).toBe(-1)
    })

    it('add_trait fills the player\'s two trait slots', () => {
        const p: any = { charTraits: new Set<number>() }
        globalState.player = p
        sfallMetarules.add_trait(1)
        sfallMetarules.add_trait(2)
        sfallMetarules.add_trait(3)
        expect([...p.charTraits]).toEqual([1, 2])
    })

    it('metarule_exist and the table', () => {
        expect(sfallMetarules.metarule_exist('string_format')).toBe(1)
        expect(sfallMetarules.metarule_exist('nope')).toBe(0)
        expect(getArray(sfallMetarules.get_metarule_table())!.size).toBe(Object.keys(sfallMetarules).length)
    })
})
