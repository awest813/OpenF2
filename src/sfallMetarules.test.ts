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

describe('INI settings (IniFiles.cpp)', () => {
    it('reads "file|section|key", -1 for a malformed name or a missing number', async () => {
        const { setIniFile } = await import('./iniFiles.js')
        const { Scripting } = await import('./scripting.js')
        setIniFile('mods/test.ini', '[Main]\nSpeed=12 ; fast\nName=Vault Dweller\n[Other]\nx=1\n')
        const script: any = new (Scripting as any).Script()
        expect(script.get_ini_setting('mods\\test.ini|main|speed')).toBe(12)
        expect(script.get_ini_setting('mods/test.ini|Main|Missing')).toBe(-1)
        expect(script.get_ini_setting('nofile')).toBe(-1)
        expect(script.get_ini_string('mods/test.ini|Main|Name')).toBe('Vault Dweller')
        expect(getArray(sfallMetarules.get_ini_sections('mods/test.ini'))!.size).toBe(2)
        const section = getArray(sfallMetarules.get_ini_section('mods/test.ini', 'main'))!
        expect(section.get('Speed')).toBe('12')
        sfallMetarules.set_ini_setting('mods/test.ini|Main|Speed', 3)
        expect(script.get_ini_setting('mods/test.ini|Main|Speed')).toBe(3)
    })
})

describe('object lists (Arrays.cpp list_begin)', () => {
    it('hands out list ids; list_next walks every elevation', async () => {
        const { sfallMethods } = await import('./sfallFunctions.js')
        const a = { type: 'critter' }
        const b = { type: 'item' }
        const c = { type: 'critter' }
        const saved = globalState.gMap
        globalState.gMap = { objects: [[a, b], [], [c]] } as any
        const id = sfallMethods.list_begin(0)
        expect(sfallMethods.list_next(id)).toBe(a)
        expect(sfallMethods.list_next(id)).toBe(c)
        expect(sfallMethods.list_next(id)).toBe(0)
        sfallMethods.list_end(id)
        expect(sfallMethods.list_next(id)).toBe(0)
        globalState.gMap = saved
    })
})

describe('input state (InputFuncs.cpp)', () => {
    it('key_pressed takes DirectInput scan codes, 256+ for mouse buttons', async () => {
        const { noteKey, noteMouseButton, clearInputState } = await import('./inputState.js')
        const { sfallMethods } = await import('./sfallFunctions.js')
        noteKey('KeyA', 65, true)
        expect(sfallMethods.key_pressed(30)).toBe(1) // DIK_A
        expect(sfallMethods.key_pressed(0x80000000 | 65)).toBe(1) // VK_A
        noteMouseButton(2, true)
        expect(sfallMethods.get_mouse_buttons()).toBe(2)
        expect(sfallMethods.key_pressed(257)).toBe(1)
        clearInputState()
        expect(sfallMethods.key_pressed(30)).toBe(0)
    })
})

describe('sfall reg_anim steps (Anims.cpp)', () => {
    it('run in the sequence, and only in combat after reg_anim_combat_check(0)', async () => {
        const { Scripting } = await import('./scripting.js')
        const { resetAnimSequences, tickAnimSequences, setRegAnimCombatCheck } = await import('./animSequence.js')
        resetAnimSequences()
        const script: any = new (Scripting as any).Script()
        const obj: any = { type: 'scenery', position: { x: 5, y: 5 }, orientation: 0, _type: 'obj' }
        script.reg_anim_func(1, 1)
        script.reg_anim_turn_towards(obj, toTileNum({ x: 5, y: 9 }))
        script.reg_anim_func(3, 0)
        tickAnimSequences()
        expect(obj.orientation).not.toBe(0)

        globalState.inCombat = true
        obj.visible = true
        script.reg_anim_func(1, 1)
        script.reg_anim_animate_and_hide(obj, 0, -1)
        script.reg_anim_func(3, 0)
        expect(obj.visible).toBe(true) // ignored in combat
        script.reg_anim_combat_check(0)
        script.reg_anim_func(1, 1)
        script.reg_anim_destroy(obj)
        script.reg_anim_func(3, 0)
        setRegAnimCombatCheck(true)
        globalState.inCombat = false
        resetAnimSequences()
    })
})
