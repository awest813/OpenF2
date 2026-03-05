/**
 * Regression tests for the scripting VM opcode handlers.
 *
 * We test the exported opMap functions directly, calling them with a minimal
 * mock of the VM rather than loading real INT files. This exercises the
 * arithmetic, comparison, logic, and stack-manipulation primitives in
 * isolation and is stable against changes to game-data loading paths.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Config } from './config.js'
import { opMap, VMContext } from './vm_opcodes.js'
import { ScriptVM } from './vm.js'

afterEach(() => {
    vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Minimal VM stub — only the fields / methods actually used by opMap handlers.
// ---------------------------------------------------------------------------

type MinimalVM = VMContext

function makeVM(initialStack: any[] = []): MinimalVM {
    const vm: MinimalVM = {
        dataStack: [...initialStack],
        retStack: [],
        pc: 0,
        halted: false,
        svarBase: 0,
        dvarBase: 0,
        script: { read32: () => 0, peek16: () => 0 },
        intfile: { procedures: {}, proceduresTable: [], strings: {}, identifiers: {} },
        push(v: any) { this.dataStack.push(v) },
        pop() {
            if (this.dataStack.length === 0) throw 'data stack underflow'
            return this.dataStack.pop()
        },
        popAddr() {
            if (this.retStack.length === 0) throw 'return stack underflow'
            return this.retStack.pop()
        },
    }
    return vm
}

function exec(opcode: number, vm: MinimalVM): void {
    opMap[opcode].call(vm)
}

// ---------------------------------------------------------------------------
// Arithmetic opcodes
// ---------------------------------------------------------------------------

describe('op_add (0x8039)', () => {
    it('pushes the sum of two values', () => {
        const vm = makeVM([3, 4])
        exec(0x8039, vm)
        expect(vm.dataStack).toEqual([7])
    })

    it('adds negative numbers correctly', () => {
        const vm = makeVM([-5, 3])
        exec(0x8039, vm)
        expect(vm.pop()).toBe(-2)
    })
})

describe('op_sub (0x803a)', () => {
    it('pushes lhs - rhs', () => {
        const vm = makeVM([10, 3])
        exec(0x803a, vm)
        expect(vm.pop()).toBe(7)
    })
})

describe('op_mul (0x803b)', () => {
    it('pushes the product', () => {
        const vm = makeVM([6, 7])
        exec(0x803b, vm)
        expect(vm.pop()).toBe(42)
    })
})

describe('op_div (0x803c)', () => {
    it('performs integer (truncating) division', () => {
        const vm = makeVM([10, 3])
        exec(0x803c, vm)
        expect(vm.pop()).toBe(3)  // 10/3 truncated
    })

    it('truncates toward zero for negative results', () => {
        const vm = makeVM([-7, 2])
        exec(0x803c, vm)
        expect(vm.pop()).toBe(-3)
    })

    it('throws on division by zero', () => {
        const vm = makeVM([10, 0])
        expect(() => exec(0x803c, vm)).toThrow('division by zero')
    })
})

describe('op_mod (0x803d)', () => {
    it('pushes the remainder', () => {
        const vm = makeVM([10, 3])
        exec(0x803d, vm)
        expect(vm.pop()).toBe(1)
    })

    it('throws on modulo by zero', () => {
        const vm = makeVM([10, 0])
        expect(() => exec(0x803d, vm)).toThrow('modulo by zero')
    })
})

// ---------------------------------------------------------------------------
// Negation / floor opcodes
// ---------------------------------------------------------------------------

describe('op_negate (0x8046)', () => {
    it('negates a positive value', () => {
        const vm = makeVM([5])
        exec(0x8046, vm)
        expect(vm.pop()).toBe(-5)
    })

    it('negates a negative value', () => {
        const vm = makeVM([-3])
        exec(0x8046, vm)
        expect(vm.pop()).toBe(3)
    })
})

describe('op_floor (0x8044)', () => {
    it('floors a float value', () => {
        const vm = makeVM([3.7])
        exec(0x8044, vm)
        expect(vm.pop()).toBe(3)
    })

    it('floors a negative float toward negative infinity', () => {
        const vm = makeVM([-1.2])
        exec(0x8044, vm)
        expect(vm.pop()).toBe(-2)
    })
})

// ---------------------------------------------------------------------------
// Comparison opcodes
// ---------------------------------------------------------------------------

describe('op_eq (0x8033)', () => {
    it('returns truthy for equal values', () => {
        const vm = makeVM([5, 5])
        exec(0x8033, vm)
        expect(vm.pop()).toBeTruthy()
    })

    it('returns falsy for unequal values', () => {
        const vm = makeVM([5, 6])
        exec(0x8033, vm)
        expect(vm.pop()).toBeFalsy()
    })
})

describe('op_neq (0x8034)', () => {
    it('returns truthy for different values', () => {
        const vm = makeVM([5, 6])
        exec(0x8034, vm)
        expect(vm.pop()).toBeTruthy()
    })
})

describe('op_lt (0x8037)', () => {
    it('returns true when lhs < rhs', () => {
        const vm = makeVM([3, 5])
        exec(0x8037, vm)
        expect(vm.pop()).toBeTruthy()
    })

    it('returns false when lhs >= rhs', () => {
        const vm = makeVM([5, 3])
        exec(0x8037, vm)
        expect(vm.pop()).toBeFalsy()
    })
})

describe('op_gt (0x8038)', () => {
    it('returns true when lhs > rhs', () => {
        const vm = makeVM([5, 3])
        exec(0x8038, vm)
        expect(vm.pop()).toBeTruthy()
    })
})

describe('op_lte (0x8035)', () => {
    it('returns true when lhs <= rhs', () => {
        const vm = makeVM([3, 3])
        exec(0x8035, vm)
        expect(vm.pop()).toBeTruthy()
    })
})

describe('op_gte (0x8036)', () => {
    it('returns true when lhs >= rhs', () => {
        const vm = makeVM([5, 3])
        exec(0x8036, vm)
        expect(vm.pop()).toBeTruthy()
    })
})

// ---------------------------------------------------------------------------
// Logic opcodes
// ---------------------------------------------------------------------------

describe('op_not (0x8045)', () => {
    it('negates a truthy value to false', () => {
        const vm = makeVM([1])
        exec(0x8045, vm)
        expect(vm.pop()).toBe(false)
    })

    it('negates a falsy value to true', () => {
        const vm = makeVM([0])
        exec(0x8045, vm)
        expect(vm.pop()).toBe(true)
    })
})

describe('op_and (0x803e)', () => {
    it('returns truthy when both operands are truthy', () => {
        const vm = makeVM([1, 1])
        exec(0x803e, vm)
        expect(vm.pop()).toBeTruthy()
    })

    it('returns falsy when either operand is falsy', () => {
        const vm = makeVM([1, 0])
        exec(0x803e, vm)
        expect(vm.pop()).toBeFalsy()
    })
})

describe('op_or (0x803f)', () => {
    it('returns truthy when at least one operand is truthy', () => {
        const vm = makeVM([0, 1])
        exec(0x803f, vm)
        expect(vm.pop()).toBeTruthy()
    })

    it('returns falsy when both operands are falsy', () => {
        const vm = makeVM([0, 0])
        exec(0x803f, vm)
        expect(vm.pop()).toBeFalsy()
    })
})

describe('op_bwand (0x8040)', () => {
    it('performs bitwise AND', () => {
        const vm = makeVM([0b1100, 0b1010])
        exec(0x8040, vm)
        expect(vm.pop()).toBe(0b1000)
    })
})

describe('op_bwor (0x8041)', () => {
    it('performs bitwise OR', () => {
        const vm = makeVM([0b1100, 0b1010])
        exec(0x8041, vm)
        expect(vm.pop()).toBe(0b1110)
    })
})

describe('op_bwxor (0x8042)', () => {
    it('performs bitwise XOR', () => {
        const vm = makeVM([0b1100, 0b1010])
        exec(0x8042, vm)
        expect(vm.pop()).toBe(0b0110)
    })

    it('XOR of equal values is 0', () => {
        const vm = makeVM([0xFF, 0xFF])
        exec(0x8042, vm)
        expect(vm.pop()).toBe(0)
    })
})

describe('op_bwnot (0x8043)', () => {
    it('inverts all bits (bitwise NOT)', () => {
        const vm = makeVM([0])
        exec(0x8043, vm)
        expect(vm.pop()).toBe(~0)
    })

    it('bitwise NOT of 0xFF is ~0xFF', () => {
        const vm = makeVM([0xFF])
        exec(0x8043, vm)
        expect(vm.pop()).toBe(~0xFF)
    })
})

// ---------------------------------------------------------------------------
// Stack manipulation opcodes
// ---------------------------------------------------------------------------

describe('op_swap (0x8018)', () => {
    it('swaps the top two data-stack values', () => {
        const vm = makeVM([1, 2, 3])
        exec(0x8018, vm)
        expect(vm.dataStack).toEqual([1, 3, 2])
    })
})

describe('op_pop (0x801a)', () => {
    it('removes the top of the data stack', () => {
        const vm = makeVM([1, 2, 3])
        exec(0x801a, vm)
        expect(vm.dataStack).toEqual([1, 2])
    })
})

describe('op_dup (0x801b)', () => {
    it('duplicates the top of the data stack', () => {
        const vm = makeVM([1, 2, 3])
        exec(0x801b, vm)
        expect(vm.dataStack).toEqual([1, 2, 3, 3])
    })

    it('throws on data stack underflow', () => {
        const vm = makeVM()
        expect(() => exec(0x801b, vm)).toThrow('data stack underflow')
    })
})

describe('op_exit_prog (0x8010)', () => {
    it('sets halted flag', () => {
        const vm = makeVM()
        exec(0x8010, vm)
        expect(vm.halted).toBe(true)
    })
})

describe('op_if (0x802f)', () => {
    it('falls through (pops target) when condition is truthy', () => {
        // Stack: [jumpTarget, condition]  (condition on top)
        const vm = makeVM([999, 1])  // condition = 1 (truthy)
        exec(0x802f, vm)
        // When condition is truthy we pop it and the jump target is also discarded
        expect(vm.dataStack).toEqual([])
        expect(vm.pc).toBe(0)  // pc unchanged
    })

    it('jumps when condition is falsy', () => {
        const vm = makeVM([42, 0])  // condition = 0 (falsy)
        exec(0x802f, vm)
        expect(vm.pc).toBe(42)
        expect(vm.dataStack).toEqual([])
    })
})

describe('op_while (0x8030)', () => {
    it('falls through (pops target) when condition is truthy', () => {
        const vm = makeVM([999, 1])
        exec(0x8030, vm)
        expect(vm.dataStack).toEqual([])
        expect(vm.pc).toBe(0)
    })

    it('jumps when condition is falsy', () => {
        const vm = makeVM([42, 0])
        exec(0x8030, vm)
        expect(vm.pc).toBe(42)
        expect(vm.dataStack).toEqual([])
    })
})

describe('op_jmp (0x8004)', () => {
    it('sets pc to popped value', () => {
        const vm = makeVM([0x100])
        exec(0x8004, vm)
        expect(vm.pc).toBe(0x100)
    })
})

// ---------------------------------------------------------------------------
// op_store / op_fetch (local variable access)
// ---------------------------------------------------------------------------

describe('op_store (0x8031) / op_fetch (0x8032)', () => {
    it('stores a value at a local var index and fetches it back', () => {
        const vm = makeVM()
        vm.dvarBase = 0
        // Grow the stack to accommodate 3 locals
        vm.dataStack = [0, 0, 0]

        // Store 42 at local[1]: push value, then push varIndex
        vm.push(42)  // value
        vm.push(1)   // varNum
        exec(0x8031, vm)

        // Fetch local[1]: push varIndex
        vm.push(1)
        exec(0x8032, vm)

        expect(vm.pop()).toBe(42)
    })
})

describe('op_pop_return (0x801c)', () => {
    it('halts when popping top-level return sentinel (-1)', () => {
        const vm = makeVM()
        vm.retStack.push(-1)
        exec(0x801c, vm)
        expect(vm.halted).toBe(true)
    })

    it('jumps to the popped return address for nested returns', () => {
        const vm = makeVM()
        vm.retStack.push(0x1234)
        exec(0x801c, vm)
        expect(vm.halted).toBe(false)
        expect(vm.pc).toBe(0x1234)
    })
})

describe('ScriptVM.call argument handling', () => {
    it('does not mutate caller-provided args array', () => {
        class TestScriptVM extends ScriptVM {
            run(): void {
                this.push('return-value')
            }
        }

        const vm = new TestScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            { procedures: { foo: { index: 0, offset: 0x40 } }, proceduresTable: [], strings: {}, identifiers: {} } as any
        )

        const args = [1, 2, 3]
        const result = vm.call('foo', args)

        expect(result).toBe('return-value')
        expect(args).toEqual([1, 2, 3])
        expect(vm.dataStack).toEqual([3, 2, 1, 3])
    })

    it('restores currentProcedureName when run throws', () => {
        class ThrowingScriptVM extends ScriptVM {
            run(): void {
                throw new Error('boom')
            }
        }

        const vm = new ThrowingScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            { procedures: { foo: { index: 0, offset: 0x40 } }, proceduresTable: [], strings: {}, identifiers: {} } as any
        )

        vm.currentProcedureName = 'outer_proc'

        expect(() => vm.call('foo', [1])).toThrow('boom')
        expect(vm.currentProcedureName).toBe('outer_proc')
    })

    it('restores currentProcedureName to null when top-level call throws', () => {
        class ThrowingScriptVM extends ScriptVM {
            run(): void {
                throw new Error('boom')
            }
        }

        const vm = new ThrowingScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            { procedures: { foo: { index: 0, offset: 0x40 } }, proceduresTable: [], strings: {}, identifiers: {} } as any
        )

        expect(vm.currentProcedureName).toBeNull()
        expect(() => vm.call('foo')).toThrow('boom')
        expect(vm.currentProcedureName).toBeNull()
    })

    it('preserves nested call state and return-stack balance', () => {
        class NestedScriptVM extends ScriptVM {
            run(): void {
                if (this.currentProcedureName === 'outer') {
                    this.stepCount++
                    const nested = this.call('inner')
                    this.stepCount++
                    this.push(`outer:${nested}`)
                    opMap[0x801c].call(this)
                    return
                }

                if (this.currentProcedureName === 'inner') {
                    this.stepCount++
                    this.push('inner-value')
                    opMap[0x801c].call(this)
                    return
                }

                throw new Error('unexpected procedure')
            }
        }

        const vm = new NestedScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            {
                procedures: {
                    outer: { index: 0, offset: 0x10 },
                    inner: { index: 1, offset: 0x20 },
                },
                proceduresTable: [],
                strings: {},
                identifiers: {},
            } as any
        )

        const result = vm.call('outer')
        expect(result).toBe('outer:inner-value')
        expect(vm.currentProcedureName).toBeNull()
        expect(vm.retStack).toEqual([])
        expect(vm.stepCount).toBe(3)
    })

    it('does not inject a new top-level sentinel for continuation event calls', () => {
        class ContinuationScriptVM extends ScriptVM {
            run(): void {
                // Return from the option target procedure.
                this.push('from-option')
                opMap[0x801c].call(this)

                // Then return from the resumed cleanup frame.
                this.push('cleanup-complete')
                opMap[0x801c].call(this)
            }
        }

        const vm = new ContinuationScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            { procedures: { option_proc: { index: 0, offset: 0x30 } }, proceduresTable: [], strings: {}, identifiers: {} } as any
        )

        // Simulate a paused chain: top-level sentinel + saved resume address.
        vm.retStack.push(-1, 0x120)

        const result = vm.call('option_proc')
        expect(result).toBe('cleanup-complete')
        expect(vm.retStack).toEqual([])
        expect(vm.halted).toBe(true)
    })

    it('restores return stack and execution state when a continuation call throws', () => {
        class ThrowingScriptVM extends ScriptVM {
            run(): void {
                throw new Error('call failed')
            }
        }

        const vm = new ThrowingScriptVM(
            { seek() {}, read16() { return 0 }, offset: 0 } as any,
            { procedures: { option_proc: { index: 0, offset: 0x30 } }, proceduresTable: [], strings: {}, identifiers: {} } as any
        )

        vm.retStack.push(-1, 0x120)
        vm.pc = 0x99
        vm.halted = true

        expect(() => vm.call('option_proc')).toThrow('call failed')
        expect(vm.retStack).toEqual([-1, 0x120])
        expect(vm.pc).toBe(0x99)
        expect(vm.halted).toBe(true)
        expect(vm.currentProcedureName).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// ScriptVM — call execution-time telemetry
// ---------------------------------------------------------------------------

describe('ScriptVM — call execution-time telemetry', () => {
    /** Minimal ScriptVM stub whose run() is a no-op (so call() completes immediately). */
    class InstantScriptVM extends ScriptVM {
        run(): void {
            // no-op — overrides the real run() so we don't need real opcodes
            this.halted = true
        }
    }

    function makeTimingVM(): InstantScriptVM {
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = {
            procedures: { testProc: { index: 0, offset: 0x10 } },
            proceduresTable: [],
            strings: {},
            identifiers: {},
        } as any
        const vm = new InstantScriptVM(script, intfile)
        // Prime the data stack so pop() in call() succeeds
        vm.push(undefined)
        return vm
    }

    it('lastCallTimeMs starts at 0', () => {
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = { procedures: {}, proceduresTable: [], strings: {}, identifiers: {} } as any
        expect(new ScriptVM(script, intfile).lastCallTimeMs).toBe(0)
    })

    it('totalCallTimeMs starts at 0', () => {
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = { procedures: {}, proceduresTable: [], strings: {}, identifiers: {} } as any
        expect(new ScriptVM(script, intfile).totalCallTimeMs).toBe(0)
    })

    it('lastCallTimeMs is non-negative after a call()', () => {
        const vm = makeTimingVM()
        vm.call('testProc')
        expect(vm.lastCallTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('lastCallTimeMs is a finite number after a call()', () => {
        const vm = makeTimingVM()
        vm.call('testProc')
        expect(Number.isFinite(vm.lastCallTimeMs)).toBe(true)
    })

    it('totalCallTimeMs accumulates across multiple calls()', () => {
        const vm = makeTimingVM()
        // Give additional stack entries so each call's pop() can succeed
        vm.push(undefined)
        vm.call('testProc')
        const after1 = vm.totalCallTimeMs
        expect(after1).toBeGreaterThanOrEqual(0)

        vm.push(undefined)
        vm.call('testProc')
        const after2 = vm.totalCallTimeMs
        expect(after2).toBeGreaterThanOrEqual(after1)
    })

    it('lastCallTimeMs is updated on each call()', () => {
        const vm = makeTimingVM()
        vm.call('testProc')
        const t1 = vm.lastCallTimeMs
        vm.push(undefined)
        vm.call('testProc')
        const t2 = vm.lastCallTimeMs
        // Both are finite non-negative numbers
        expect(Number.isFinite(t1)).toBe(true)
        expect(Number.isFinite(t2)).toBe(true)
    })

    it('lastCallTimeMs is still set when call() throws', () => {
        class ThrowingScriptVM extends ScriptVM {
            run(): void {
                throw new Error('vm error')
            }
        }
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = {
            procedures: { boom: { index: 0, offset: 0x10 } },
            proceduresTable: [],
            strings: {},
            identifiers: {},
        } as any
        const vm = new ThrowingScriptVM(script, intfile)
        expect(() => vm.call('boom')).toThrow('vm error')
        expect(vm.lastCallTimeMs).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(vm.lastCallTimeMs)).toBe(true)
    })
})

describe('ScriptVM — slow-call warning telemetry', () => {
    class InstantScriptVM extends ScriptVM {
        run(): void {
            this.halted = true
        }
    }

    function makeTimingVM(): InstantScriptVM {
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = {
            procedures: { testProc: { index: 0, offset: 0x10 } },
            proceduresTable: [],
            strings: {},
            identifiers: {},
        } as any
        const vm = new InstantScriptVM(script, intfile)
        vm.push(undefined)
        return vm
    }

    it('slow-call counters start at 0', () => {
        const script = { seek() {}, read16() { return 0 }, offset: 0 } as any
        const intfile = { procedures: {}, proceduresTable: [], strings: {}, identifiers: {} } as any
        const vm = new ScriptVM(script, intfile)
        expect(vm.slowCallCount).toBe(0)
        expect(vm.lastSlowCallTimeMs).toBe(0)
    })

    it('records a slow-call warning when threshold is exceeded', () => {
        const vm = makeTimingVM()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const oldThreshold = Config.engine.vmSlowCallWarnThresholdMs
        Config.engine.vmSlowCallWarnThresholdMs = 0

        try {
            vm.call('testProc')
            expect(vm.slowCallCount).toBe(1)
            expect(vm.lastSlowCallTimeMs).toBeGreaterThanOrEqual(0)
            expect(warnSpy).toHaveBeenCalledTimes(1)
        } finally {
            Config.engine.vmSlowCallWarnThresholdMs = oldThreshold
        }
    })

    it('does not warn when call duration is below threshold', () => {
        const vm = makeTimingVM()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const oldThreshold = Config.engine.vmSlowCallWarnThresholdMs
        Config.engine.vmSlowCallWarnThresholdMs = Number.MAX_SAFE_INTEGER

        try {
            vm.call('testProc')
            expect(vm.slowCallCount).toBe(0)
            expect(vm.lastSlowCallTimeMs).toBe(0)
            expect(warnSpy).not.toHaveBeenCalled()
        } finally {
            Config.engine.vmSlowCallWarnThresholdMs = oldThreshold
        }
    })
})


describe('ScriptVM unsupported operation buffer', () => {
    it('records unimplemented opcode context in FIFO order', () => {
        const script = {
            offset: 0,
            seek(pos: number) { this.offset = pos },
            read16() { return 0xDEAD },
        } as any
        const intfile = { name: 'stub.int', procedures: {}, proceduresTable: [], strings: {}, identifiers: {} } as any
        const vm = new ScriptVM(script, intfile)
        vm.currentProcedureName = 'map_enter_p_proc'

        expect(vm.step()).toBe(false)
        expect(vm.unsupportedOperations).toEqual([
            { opcode: 0xDEAD, pc: 0, scriptName: 'stub.int', procedureName: 'map_enter_p_proc' },
        ])
    })

    it('drainUnsupportedOperations returns and clears the buffer', () => {
        const script = {
            offset: 0,
            seek(pos: number) { this.offset = pos },
            read16() { return 0xBEEF },
        } as any
        const intfile = { name: 'stub.int', procedures: {}, proceduresTable: [], strings: {}, identifiers: {} } as any
        const vm = new ScriptVM(script, intfile)

        vm.recordUnsupportedOpcode(0xABCD, 123)
        vm.recordUnsupportedProcedure(0x80B4, 'random')

        expect(vm.drainUnsupportedOperations()).toEqual([
            { opcode: 0xABCD, pc: 123, scriptName: 'stub.int', procedureName: null },
            { opcode: 0x80B4, pc: 0, scriptName: 'stub.int', procedureName: null, bridgedProcedureName: 'random' },
        ])
        expect(vm.unsupportedOperations).toEqual([])
    })
})
