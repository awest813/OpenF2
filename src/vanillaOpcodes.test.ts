import { describe, it, expect } from 'vitest'
import { Scripting } from './scripting.js'
import { ScriptVMBridge } from './vm_bridge.js'
import { opMap } from './vm_opcodes.js'

/** Run an opcode on a fresh VM stack and return what it left. */
function run(opcode: number, scriptObj: any, ...args: unknown[]): unknown[] {
    const vm: any = {
        stack: [...args],
        scriptObj,
        lastOpcode: opcode,
        intfile: { name: 'test', identifiers: {} },
        recordUnsupportedProcedure() {},
        push(v: unknown) { this.stack.push(v) },
        pop() { return this.stack.pop() },
    }
    opMap[opcode].call(vm)
    return vm.stack
}

/** What each vanilla opcode leaves on the stack must match interpreter_extra.cc. */
describe('vanilla opcode stack effects', () => {
    it('critter_heal returns a value; set_light_level, explosion and gsay_start do not', () => {
        const obj: any = {
            critter_heal: () => 0,
            set_light_level: () => 1,
            explosion: () => 1,
            gsay_start: () => 1,
        }
        expect(run(0x80e8, obj, {}, 5)).toEqual([0])
        expect(run(0x80e9, obj, 50)).toEqual([])
        expect(run(0x811a, obj, 100, 0, 20)).toEqual([])
        expect(run(0x811c, obj)).toEqual([])
    })

    it('script_action gives the number of the running procedure', () => {
        const script: any = new (Scripting as any).Script()
        script._action = 6 // use_p_proc
        expect(run(0x80c7, script)).toEqual([6])
    })
})

describe('tokenize (0x80A0, intlib opTokenize)', () => {
    const comma = ','.charCodeAt(0)

    it('walks the fields of a string', () => {
        expect(run(0x80a0, {}, 'a,bb,c', 0, comma)).toEqual(['a'])
        expect(run(0x80a0, {}, 'a,bb,c', 'a', comma)).toEqual(['bb'])
        expect(run(0x80a0, {}, 'a,bb,c', 'bb', comma)).toEqual(['c'])
        expect(run(0x80a0, {}, 'a,bb,c', 'c', comma)).toEqual([0])
    })

    it('a string without the separator is one field', () => {
        expect(ScriptVMBridge.tokenize('word', 0, ',')).toBe('word')
    })
})

describe('has_trait / critter_add_trait / critter_state (interpreter_extra.cc)', () => {
    const critter = (extra: Record<string, unknown> = {}): any => ({
        _type: 'obj', type: 'critter', perkRanks: {}, inventory: [], orientation: 3, aiNum: 7, teamNum: 2, ...extra,
    })

    it('has_trait object fields: AI packet, team, rotation, visibility, inventory weight; others 0', () => {
        const script: any = new (Scripting as any).Script()
        const c = critter({ inventory: [{ pro: { extra: { weight: 4 } }, amount: 3 }] })
        expect(script.has_trait(1, c, 5)).toBe(7)
        expect(script.has_trait(1, c, 6)).toBe(2)
        expect(script.has_trait(1, c, 10)).toBe(3)
        expect(script.has_trait(1, c, 666)).toBe(1)
        expect(script.has_trait(1, c, 669)).toBe(12)
        for (const other of [0, 1, 2, 3, 7, 8, 9, 667, 668]) {expect(script.has_trait(1, c, other)).toBe(0)}
    })

    it('has_trait(TRAIT_TRAIT) asks about the player\'s traits, whoever is passed', async () => {
        const { default: globalState } = await import('./globalState.js')
        const saved = globalState.player
        globalState.player = { charTraits: new Set([4]) } as any
        const script: any = new (Scripting as any).Script()
        expect(script.has_trait(2, critter(), 4)).toBe(1)
        expect(script.has_trait(2, critter({ charTraits: new Set([5]) }), 5)).toBe(0)
        globalState.player = saved
    })

    it('critter_add_trait adds or takes one perk rank and returns -1', () => {
        const script: any = new (Scripting as any).Script()
        const c = critter()
        expect(script.critter_add_trait(c, 0, 10, 1)).toBe(-1)
        script.critter_add_trait(c, 0, 10, 5)
        expect(c.perkRanks[10]).toBe(2)
        script.critter_add_trait(c, 0, 10, 0)
        expect(c.perkRanks[10]).toBe(1)
        script.critter_add_trait(c, 1, 6, 9)
        expect(c.teamNum).toBe(9)
        script.critter_add_trait(c, 2, 3, 1) // traits cannot be added
        expect(c.charTraits).toBeUndefined()
    })

    it('critter_state: dead 1; knocked out 2 with no limb bits; else prone and crippled bits', () => {
        const script: any = new (Scripting as any).Script()
        expect(script.critter_state(critter({ dead: true }))).toBe(1)
        expect(script.critter_state({ _type: 'obj', type: 'item' })).toBe(1)
        expect(script.critter_state(critter({ knockedOut: true, crippledLeftLeg: true }))).toBe(2)
        expect(script.critter_state(critter({ knockedDown: true, crippledLeftLeg: true }))).toBe(0x06)
        expect(script.critter_state(critter({ blinded: true }))).toBe(0x40)
    })
})
