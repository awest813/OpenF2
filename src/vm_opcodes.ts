/*
 * Scripting VM opcode handlers — pure logic with no browser dependencies.
 *
 * Each entry in `opMap` is a function called with the VM instance as `this`.
 * The only external dependency is `arrayIncludes` from util.js, which is
 * inlined here to keep this module free of the browser-dependent import chain.
 */

// ---------------------------------------------------------------------------
// Minimal interface for the VM context used by opMap handlers.
// The full ScriptVM class (in vm.ts) satisfies this interface.
// ---------------------------------------------------------------------------

export interface VMContext {
    script: { read32(): number; peek16(): number }
    intfile: {
        procedures: { [name: string]: { index: number; offset: number } }
        proceduresTable: Array<{ offset: number; argc: number; name: string }>
        strings: { [idx: number]: string }
        identifiers: { [idx: number]: string }
    }
    pc: number
    dataStack: any[]
    retStack: number[]
    svarBase: number
    dvarBase: number
    halted: boolean
    push(value: any): void
    pop(): any
    popAddr(): any
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function binop(f: (x: any, y: any) => any): (this: VMContext) => void {
    return function (this: VMContext) {
        const rhs = this.pop()
        this.push(f(this.pop(), rhs))
    }
}

/** Inline replacement for util.arrayIncludes — avoids the browser dep chain. */
function includes(arr: number[], item: number): boolean {
    return arr.indexOf(item) !== -1
}

// ---------------------------------------------------------------------------
// Opcode dispatch table
// ---------------------------------------------------------------------------

export const opMap: { [opcode: number]: (this: VMContext) => void } = {
    0x8002: function () {}, // start critical (nop)
    0xc001: function () {
        this.push(this.script.read32())
    }, // op_push_d
    0x800d: function () {
        this.retStack.push(this.pop())
    }, // op_d_to_a
    0x800c: function () {
        this.push(this.popAddr())
    }, // op_a_to_d
    0x801a: function () {
        this.pop()
    }, // op_pop
    0x8004: function () {
        this.pc = this.pop()
    }, // op_jmp
    0x8003: function () {}, // op_critical_done (nop)
    0x802b: function () {
        // op_push_base
        const argc = this.pop()
        this.retStack.push(this.dvarBase)
        this.dvarBase = this.dataStack.length - argc
    },
    0x8019: function () {
        // op_swapa
        const a = this.popAddr()
        const b = this.popAddr()
        this.retStack.push(a)
        this.retStack.push(b)
    },
    0x8018: function () {
        // op_swap
        const a = this.pop()
        const b = this.pop()
        this.push(a)
        this.push(b)
    },
    0x802a: function () {
        this.dataStack.splice(this.dvarBase)
    }, // op_pop_to_base
    0x8029: function () {
        this.dvarBase = this.popAddr()
    }, // op_pop_base
    0x802c: function () {
        this.svarBase = this.dataStack.length
    }, // op_set_global
    0x8013: function () {
        const num = this.pop()
        this.dataStack[this.svarBase + num] = this.pop()
    }, // op_store_global
    0x8012: function () {
        const num = this.pop()
        this.push(this.dataStack[this.svarBase + num])
    }, // op_fetch_global
    0x801c: function () {
        // op_pop_return
        const addr = this.popAddr()
        if (addr === -1) {this.halted = true}
        else {this.pc = addr}
    },
    0x8010: function () {
        this.halted = true
    }, // op_exit_prog

    0x802f: function () {
        if (!this.pop()) {
            this.pc = this.pop()
        } else {this.pop()}
    }, // op_if
    0x8031: function () {
        const varNum = this.pop()
        this.dataStack[this.dvarBase + varNum] = this.pop()
    }, // op_store
    0x8032: function () {
        this.push(this.dataStack[this.dvarBase + this.pop()])
    }, // op_fetch
    0x8046: function () {
        this.push(-this.pop())
    }, // op_negate
    0x8044: function () {
        this.push(Math.floor(this.pop()))
    }, // op_floor
    0x801b: function () {
        if (this.dataStack.length === 0) {
            // Data stack underflow: push 0 rather than crashing.
            console.warn('[ScriptVM] op_dup: data stack underflow — pushing 0')
            this.push(0)
            return
        }
        this.push(this.dataStack[this.dataStack.length - 1])
    }, // op_dup

    0x8030: function () {
        // op_while
        const cond = this.pop()
        if (!cond) {
            this.pc = this.pop()
        } else {this.pop()}
    },

    0x8028: function () {
        // op_lookup_string_proc
        const name = this.pop()
        const proc = this.intfile.procedures[name]
        if (!proc) {
            console.warn('[ScriptVM] op_lookup_string_proc: unknown procedure "' + name + '" — pushing 0')
            this.push(0)
            return
        }
        this.push(proc.index)
    },
    0x8027: function () {
        // op_check_arg_count
        const argc = this.pop()
        const procIdx = this.pop()
        const proc = this.intfile.proceduresTable[procIdx]
        if (!proc) {
            // Missing procedure table entry — warn and skip validation.
            console.warn('[ScriptVM] op_check_arg_count: no procedure at index ' + procIdx + ' — skipping check')
            return
        }
        if (argc !== proc.argc) {
            // Arg count mismatch is a script-level bug; warn but continue so the
            // call can still proceed rather than crashing the entire game.
            console.warn(
                `[ScriptVM] op_check_arg_count: expected ${proc.argc} args, got ${argc} args when calling ${proc.name} — continuing`
            )
        }
    },

    0x8005: function () {
        // op_call
        const procIdx = this.pop()
        const proc = this.intfile.proceduresTable[procIdx]
        if (!proc) {
            console.warn('[ScriptVM] op_call: no procedure at index ' + procIdx + ' — halting')
            this.halted = true
            return
        }
        this.pc = proc.offset
    },
    0x9001: function () {
        const num = this.script.read32()
        const nextOpcode = this.script.peek16()

        if (includes([0x8014, 0x8015, 0x8016], nextOpcode)) {
            if (this.intfile.identifiers[num] === undefined) {
                console.warn('[ScriptVM] 0x9001: identifier ' + num + ' not in intfile — pushing empty string')
                this.push('')
                return
            }
            this.push(this.intfile.identifiers[num])
        } else {
            if (this.intfile.strings[num] === undefined) {
                console.warn('[ScriptVM] 0x9001: string ' + num + ' not in intfile — pushing empty string')
                this.push('')
                return
            }
            this.push(this.intfile.strings[num])
        }
    },

    // logic/comparison
    0x8045: function () {
        this.push(!this.pop())
    },
    0x8033: binop((x, y) => x == y),
    0x8034: binop((x, y) => x != y),
    0x8035: binop((x, y) => x <= y),
    0x8036: binop((x, y) => x >= y),
    0x8037: binop((x, y) => x < y),
    0x8038: binop((x, y) => x > y),
    0x803e: binop((x, y) => x && y),
    0x803f: binop((x, y) => x || y),
    0x8040: binop((x, y) => x & y),
    0x8041: binop((x, y) => x | y),
    0x8042: binop((x, y) => x ^ y), // op_bwxor
    0x8043: function () { this.push(~this.pop()) }, // op_bwnot
    0x8039: binop((x, y) => x + y),
    0x803a: binop((x, y) => x - y),
    0x803b: binop((x, y) => x * y),
    0x803d: binop((x, y) => {
        if (y === 0) {
            console.warn('[ScriptVM] modulo by zero — returning 0')
            return 0
        }
        return x % y
    }),
    0x803c: binop((x, y) => {
        if (y === 0) {
            console.warn('[ScriptVM] division by zero — returning 0')
            return 0
        }
        return (x / y) | 0
    }), // integer division (truncate toward zero)
}
