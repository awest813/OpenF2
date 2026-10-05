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

describe('kill / damage / destroy / timers', () => {
    let savedImageInfo: any
    afterEach(() => {
        if (savedImageInfo !== undefined) {globalState.imageInfo = savedImageInfo}
        Scripting.timeEventList.length = 0
    })

    function critter(extra: Record<string, unknown> = {}): any {
        const stats: Record<string, number> = { HP: 30 }
        return {
            _type: 'obj', type: 'critter', pid: 0x01000005, art: 'art/critters/hmjmpsaa',
            getBase() { return 'art/critters/hmjmps' },
            stats: { setBase: (k: string, v: number) => { stats[k] = v }, getBase: (k: string) => stats[k] ?? 0, modifyBase: (k: string, d: number) => { stats[k] = (stats[k] ?? 0) + d } },
            getStat: (k: string) => stats[k] ?? 0,
            _script: {},
            ...extra,
        }
    }

    it('kill_critter shows the single-frame death at once and drops the script', () => {
        savedImageInfo = globalState.imageInfo
        globalState.imageInfo = new Proxy({}, { get: () => ({ numFrames: 1, fps: 10 }) }) as any
        const script: any = new (Scripting as any).Script()
        const c = critter()
        script.kill_critter(c, 48)
        expect(c.dead).toBe(true)
        expect(c.art).toBe('art/critters/hmjmpsra')
        expect(c._script).toBeNull()
    })

    it("critter_dmg applies the type's DT and DR unless armor is bypassed", () => {
        const script: any = new (Scripting as any).Script()
        const stats: Record<string, number> = { HP: 100, 'DT Laser': 4, 'DR Laser': 50 }
        const c = critter({ getStat: (k: string) => stats[k] ?? 0 })
        c.stats.modifyBase = (k: string, d: number) => { stats[k] = (stats[k] ?? 0) + d }
        script.critter_dmg(c, 24, 1 | 0x200) // laser, no animation: (24-4) - 50% = 10
        expect(stats.HP).toBe(90)
        script.critter_dmg(c, 24, 1 | 0x100 | 0x200) // armor bypassed
        expect(stats.HP).toBe(66)
    })

    it("destroy_object takes a carried item out of its owner's inventory; rm_timer_event is per object", () => {
        const script: any = new (Scripting as any).Script()
        const item: any = { _type: 'obj', type: 'item', pid: 9, amount: 1 }
        const saved = globalState.player
        const owner: any = { _type: 'obj', type: 'critter', inventory: [item], rightHand: item }
        globalState.player = owner
        script.destroy_object(item)
        expect(owner.inventory).toEqual([])
        expect(owner.rightHand).toBeUndefined()
        globalState.player = saved

        const a: any = { _type: 'obj', type: 'item', pid: 3 }
        const b: any = { _type: 'obj', type: 'item', pid: 3 }
        Scripting.timeEventList.push({ obj: a, ticks: 1, userdata: 0 } as any, { obj: b, ticks: 1, userdata: 0 } as any)
        script.rm_timer_event(a)
        expect(Scripting.timeEventList.map((e: any) => e.obj)).toEqual([b])
    })
})

describe('messages, lights, floating text, dialogue entry', () => {
    it('message_str gives Error for a negative line', () => {
        const script: any = new (Scripting as any).Script()
        expect(script.message_str(1, -1)).toBe('Error')
    })

    it('float_msg floats over the given object; empty text clears it', () => {
        const script: any = new (Scripting as any).Script()
        const saved = globalState.floatMessages
        globalState.floatMessages = []
        const other: any = { _type: 'obj', type: 'critter', position: { x: 1, y: 1 } }
        script.self_obj = { _type: 'obj', type: 'critter' }
        script.float_msg(other, 'Hey', 2)
        expect(globalState.floatMessages[0].obj).toBe(other)
        expect(globalState.floatMessages[0].color).toBe('rgb(255,0,0)')
        script.float_msg(other, '', 0)
        expect(globalState.floatMessages).toEqual([])
        globalState.floatMessages = saved
    })

    it('obj_pid gives -1 for no object; dialogue_system_enter does nothing in combat', () => {
        const script: any = new (Scripting as any).Script()
        expect(script.obj_pid(null)).toBe(-1)
        script.self_obj = { _type: 'obj', type: 'critter', _script: {} }
        globalState.inCombat = true
        expect(() => script.dialogue_system_enter()).not.toThrow()
        globalState.inCombat = false
    })
})

