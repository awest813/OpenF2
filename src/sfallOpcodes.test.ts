import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import './vm_bridge.js'
import { opMap } from './vm_opcodes.js'
import { SFALL_OPCODES } from './sfallOpcodes.js'
import { deleteTempArrays, deserializeSfallArrays, lenArray, resetSfallArrays, serializeSfallArrays } from './sfallArrays.js'
import { sfallSettings } from './sfallFunctions.js'

/** Run an opcode on a fresh VM stack and return what it left. */
function run(opcode: number, ...args: unknown[]): unknown[] {
    const vm: any = {
        stack: [...args],
        scriptObj: new (Scripting as any).Script(),
        lastOpcode: opcode,
        intfile: { name: 'test', identifiers: {} },
        recordUnsupportedProcedure() {},
        push(v: unknown) { this.stack.push(v) },
        pop() { return this.stack.pop() },
    }
    opMap[opcode].call(vm)
    return vm.stack
}

describe('sfall opcode numbering (sfall Opcodes.cpp)', () => {
    it('matches sfall for well-known functions', () => {
        const byName = new Map(SFALL_OPCODES.map(([op, name]) => [name, op]))
        expect(byName.get('read_byte')).toBe(0x8156)
        expect(byName.get('set_pc_base_stat')).toBe(0x815A)
        expect(byName.get('get_year')).toBe(0x8163)
        expect(byName.get('set_sfall_global')).toBe(0x819D)
        expect(byName.get('get_sfall_global_int')).toBe(0x819E)
        expect(byName.get('create_array')).toBe(0x822D)
        expect(byName.get('get_array')).toBe(0x822F)
        expect(byName.get('sfall_func0')).toBe(0x8276)
        expect(byName.get('div')).toBe(0x827F)
        expect(byName.get('sfall_func8')).toBe(0x8281)
    })

    it('every sfall opcode is wired, and nothing past 0x8281 is', () => {
        for (const [op] of SFALL_OPCODES) {expect(typeof opMap[op]).toBe('function')}
        expect(opMap[0x8290]).toBeUndefined()
        expect(opMap[0x8300]).toBeUndefined()
    })

    it('pops exactly its arguments and pushes only when it returns a value', () => {
        expect(run(0x81EC, 16)).toEqual([4]) // sqrt
        expect(run(0x81ED, -3)).toEqual([3]) // abs
        expect(run(0x8263, 2, 10)).toEqual([1024]) // power
        expect(run(0x8267, 2.5)).toEqual([3]) // round (half away from zero)
        expect(run(0x8267, -2.5)).toEqual([-3])
        expect(run(0x827F, 7, 2)).toEqual([3]) // div
        expect(run(0x8237, '0x1F')).toEqual([31]) // atoi
        expect(run(0x824F, 'hello')).toEqual([5]) // strlen
        expect(run(0x8253, 'x')).toEqual([3]) // typeof string
        expect(run(0x8253, 1.5)).toEqual([2])
        expect(run(0x8210)).toEqual([4]) // sfall_ver_major
        expect(run(0x822A, 2)).toEqual([]) // set_map_time_multi: no return
    })
})

describe('sfall arrays (sfall_arrays.cc)', () => {
    beforeEach(() => resetSfallArrays())

    it('lists: create, set, get, length, resize, scan', () => {
        const [id] = run(0x822D, 3, 0) as number[]
        run(0x822E, id, 1, 'b')
        expect(run(0x822F, id, 1)).toEqual(['b'])
        expect(run(0x8231, id)).toEqual([3])
        run(0x8232, id, 5)
        expect(run(0x8231, id)).toEqual([5])
        expect(run(0x8239, id, 'b')).toEqual([1])
        expect(run(0x8239, id, 'z')).toEqual([-1])
    })

    it('associative arrays: setting 0 removes a key; array_key walks keys', () => {
        const [id] = run(0x822D, -1, 0) as number[]
        run(0x822E, id, 'hp', 10)
        run(0x822E, id, 'ap', 5)
        expect(run(0x8231, id)).toEqual([2])
        expect(run(0x8256, id, -1)).toEqual([1]) // associative
        expect(run(0x8256, id, 0)).toEqual(['hp'])
        run(0x822E, id, 'hp', 0)
        expect(run(0x8231, id)).toEqual([1])
        expect(run(0x822F, id, 'missing')).toEqual([0])
    })

    it('sorting via resize_array: -2 sort, -3 reverse sort, -4 reverse', () => {
        const [id] = run(0x822D, 3, 0) as number[]
        run(0x822E, id, 0, 3)
        run(0x822E, id, 1, 1)
        run(0x822E, id, 2, 2)
        run(0x8232, id, -2)
        expect([0, 1, 2].map((i) => run(0x822F, id, i)[0])).toEqual([1, 2, 3])
        run(0x8232, id, -3)
        expect([0, 1, 2].map((i) => run(0x822F, id, i)[0])).toEqual([3, 2, 1])
    })

    it('temporary arrays vanish at the end of the frame unless fixed', () => {
        const [a] = run(0x8233, 2, 0) as number[]
        const [b] = run(0x8233, 2, 0) as number[]
        run(0x8234, b)
        deleteTempArrays()
        expect(lenArray(a)).toBe(-1)
        expect(lenArray(b)).toBe(2)
    })

    it('string_split and get_array on strings', () => {
        const [id] = run(0x8235, 'a,b,c', ',') as number[]
        expect(run(0x8231, id)).toEqual([3])
        expect(run(0x822F, id, 2)).toEqual(['c'])
        expect(run(0x822F, 'hey', 1)).toEqual(['e'])
    })

    it('arrayexpr fills the last array made', () => {
        const [id] = run(0x822D, 0, 0) as number[]
        run(0x8257, 0, 'x')
        run(0x8257, 1, 'y')
        expect(run(0x8231, id)).toEqual([2])
        expect(run(0x822F, id, 1)).toEqual(['y'])
    })

    it('save_array keeps an array across a save', () => {
        const [id] = run(0x822D, 2, 0) as number[]
        run(0x822E, id, 0, 42)
        run(0x8254, 'mykey', id)
        const data = serializeSfallArrays()
        resetSfallArrays()
        deserializeSfallArrays(data)
        const [loaded] = run(0x8255, 'mykey') as number[]
        expect(run(0x822F, loaded, 0)).toEqual([42])
    })
})

describe('sfall_funcN metarules', () => {
    it('dispatches by name and returns 0 for unknown functions', () => {
        expect(run(0x8277, 'metarule_exist', 'car_gas_amount')).toEqual([1])
        expect(run(0x8276, 'no_such_function')).toEqual([0])
    })

    it('force_encounter is recorded for the next encounter check', () => {
        run(0x8171, 42)
        expect(sfallSettings.forcedEncounter).toEqual({ map: 42, flags: 0 })
        sfallSettings.forcedEncounter = null
    })
})
