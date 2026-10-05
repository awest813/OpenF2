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
