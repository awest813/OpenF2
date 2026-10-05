/**
 * The Fallout 2 opcode numbers in the vanilla range must reach the same
 * procedures, and pop / push the same number of values, as fallout2-ce's
 * interpreter_extra.cc registrations.
 */
import { describe, it, expect, vi } from 'vitest'
import { opMap } from './vm_opcodes.js'
import './vm_bridge.js'

function run(opcode: number, stack: any[], scriptObj: any) {
    const vm: any = {
        dataStack: [...stack],
        scriptObj,
        lastOpcode: opcode,
        intfile: { name: 'test.int', identifiers: {} },
        pop() { return this.dataStack.pop() },
        push(v: any) { this.dataStack.push(v) },
        recordUnsupportedProcedure: vi.fn(),
    }
    opMap[opcode].call(vm)
    return vm.dataStack
}

describe('vanilla opcode table (interpreter_extra.cc)', () => {
    const cases: Array<[number, string, number, boolean]> = [
        [0x80A2, 'scr_return', 1, false],
        [0x80A6, 'get_pc_stat', 1, true],
        [0x80A8, 'set_map_start', 4, false],
        [0x80B1, 'how_much', 1, true],
        [0x80DD, 'attack_complex', 8, false],
        [0x80DF, 'end_dialogue', 0, false],
        [0x80FD, 'radiation_add', 2, false],
        [0x80FE, 'radiation_dec', 2, false],
        [0x8104, 'proto_data', 2, true],
        [0x8110, 'reg_anim_animate_reverse', 3, false],
        [0x8111, 'reg_anim_obj_move_to_obj', 3, false],
        [0x8112, 'reg_anim_obj_run_to_obj', 3, false],
        [0x8113, 'reg_anim_obj_move_to_tile', 3, false],
        [0x8114, 'reg_anim_obj_run_to_tile', 3, false],
        [0x811B, 'days_since_visited', 0, true],
        [0x812C, 'inven_unwield_self', 0, false],
        [0x8143, 'attack_setup', 2, false],
        [0x8144, 'destroy_mult_objs', 2, true],
        [0x814D, 'jam_lock', 1, false],
        [0x8155, 'critter_stop_attacking', 1, false],
    ]

    for (const [opcode, proc, pops, pushes] of cases) {
        it(`0x${opcode.toString(16).toUpperCase()} → ${proc}: pops ${pops}, ${pushes ? 'pushes 1' : 'pushes nothing'}`, () => {
            const fn = vi.fn().mockReturnValue(7)
            const args = Array.from({ length: pops }, (_, i) => `a${i}`)
            const out = run(opcode, ['sentinel', ...args], { [proc]: fn })
            expect(fn).toHaveBeenCalledWith(...args)
            expect(out).toEqual(pushes ? ['sentinel', 7] : ['sentinel'])
        })
    }

    it('0x80A5 is sfx_build_open_name, not set_exit_grids (which is 0x80E6)', () => {
        const sfx = vi.fn().mockReturnValue('')
        const exits = vi.fn()
        run(0x80A5, ['obj', 1], { sfx_build_open_name: sfx, set_exit_grids: exits })
        expect(sfx).toHaveBeenCalled()
        run(0x80E6, [0, 1, 2, 3, 4], { sfx_build_open_name: sfx, set_exit_grids: exits })
        expect(exits).toHaveBeenCalledWith(0, 1, 2, 3, 4)
    })
})

describe('roll and visit opcodes', () => {
    it('do_check is a d10 against the stat plus modifier, keeping the margin for how_much', async () => {
        const util = await import('./util.js')
        const { Scripting } = await import('./scripting.js')
        const script: any = new (Scripting as any).Script()
        const critter: any = { type: 'critter', position: { x: 0, y: 0 }, getStat: () => 6, inventory: [] }
        vi.spyOn(util, 'getRandomInt').mockReturnValue(4)
        expect(script.do_check(critter, 0, 1)).toBe(2) // ROLL_SUCCESS: 4 ≤ 7
        expect(script.how_much(0)).toBe(3)
        vi.spyOn(util, 'getRandomInt').mockReturnValue(9)
        expect(script.do_check(critter, 0, 0)).toBe(1) // ROLL_FAILURE
        vi.restoreAllMocks()
    })

    it('days_since_visited is −1 on a first visit and whole days after', async () => {
        const gs = (await import('./globalState.js')).default
        const { Scripting } = await import('./scripting.js')
        const script: any = new (Scripting as any).Script()
        const savedMap = gs.gMap
        const savedTime = gs.gameTickTime
        try {
            ;(gs as any).gMap = { lastVisitTime: 0 }
            expect(script.days_since_visited()).toBe(-1)
            ;(gs as any).gMap = { lastVisitTime: 1000 }
            gs.gameTickTime = 1000 + 3 * 864000 + 5
            expect(script.days_since_visited()).toBe(3)
        } finally {
            ;(gs as any).gMap = savedMap
            gs.gameTickTime = savedTime
        }
    })
})
