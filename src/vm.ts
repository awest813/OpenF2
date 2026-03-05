/*
Copyright 2015 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { transpile } from './transpiler.js'
import { IntFile } from './intfile.js'
import { arrayIncludes, BinaryReader } from './util.js'
import { Config } from './config.js'
import { opMap } from './vm_opcodes.js'

// Scripting VM for .INT files

export { opMap }

export interface UnsupportedVmOperation {
    opcode: number
    scriptName: string
    procedureName: string | null
    pc: number
    bridgedProcedureName?: string
}

export class ScriptVM {
    script: BinaryReader
    intfile: IntFile
    pc: number = 0
    dataStack: any[] = []
    retStack: number[] = []
    svarBase: number = 0
    dvarBase: number = 0
    halted: boolean = false
    /** Total number of opcode steps executed by this VM instance. */
    stepCount: number = 0
    /** Name of the procedure currently being executed, or null when idle. */
    currentProcedureName: string | null = null
    /** Wall-clock time spent in the most recent top-level call(), in milliseconds. */
    lastCallTimeMs: number = 0
    /** Cumulative wall-clock time spent in all top-level call() invocations, in milliseconds. */
    totalCallTimeMs: number = 0
    /** Number of top-level call() invocations that exceeded the configured slow-call threshold. */
    slowCallCount: number = 0
    /** Wall-clock time of the most recent top-level call() that exceeded the slow-call threshold, in milliseconds. */
    lastSlowCallTimeMs: number = 0
    /** Deterministic FIFO log of unsupported VM operations encountered during execution. */
    unsupportedOperations: UnsupportedVmOperation[] = []

    constructor(script: BinaryReader, intfile: IntFile) {
        this.script = script
        this.intfile = intfile
    }

    push(value: any): void {
        this.dataStack.push(value)
    }

    pop(): any {
        if (this.dataStack.length === 0) throw 'VM data stack underflow'
        return this.dataStack.pop()
    }

    popAddr(): any {
        if (this.retStack.length === 0) throw 'VM return stack underflow'
        return this.retStack.pop()
    }

    dis(): string {
        var offset = this.script.offset
        var disassembly = transpile(this.intfile, this.script)
        this.script.seek(offset)
        return disassembly
    }

    // call a named procedure
    call(procName: string, args: any[] = []): any {
        var proc = this.intfile.procedures[procName]
        // console.log("CALL " + procName + " @ " + proc.offset + " from " + this.scriptObj.scriptName)
        if (!proc) throw 'ScriptVM: unknown procedure ' + procName

        const isTopLevel = this.currentProcedureName === null
        const previousProcedure = this.currentProcedureName
        const previousPc = this.pc
        const previousHalted = this.halted
        const previousRetDepth = this.retStack.length

        // Continuation calls (e.g. resumed script events) already have an
        // active return chain on retStack and must not add a new top-level
        // sentinel. Nested direct VM.call() invocations do get a sentinel so
        // each call frame can terminate independently.
        const shouldPushTopLevelReturnSentinel = previousProcedure !== null || previousRetDepth === 0

        this.currentProcedureName = procName

        // Args are passed in reverse order (stack-based calling convention).
        const reversedArgs = [...args].reverse()
        reversedArgs.forEach((arg) => this.push(arg))
        this.push(args.length)

        if (shouldPushTopLevelReturnSentinel) this.retStack.push(-1)

        const t0 = isTopLevel ? performance.now() : 0
        let completed = false
        try {
            // run procedure code
            this.halted = false
            this.pc = proc.offset
            this.run()
            completed = true
            return this.pop()
        } finally {
            if (!completed) {
                // A throwing procedure should not leak/consume return frames.
                this.retStack.length = previousRetDepth
                this.pc = previousPc
                this.halted = previousHalted
            }

            // Keep debugger state consistent even when a procedure throws.
            this.currentProcedureName = previousProcedure
            if (isTopLevel) {
                const elapsed = performance.now() - t0
                this.lastCallTimeMs = elapsed
                this.totalCallTimeMs += elapsed
                if (elapsed >= Config.engine.vmSlowCallWarnThresholdMs) {
                    this.slowCallCount++
                    this.lastSlowCallTimeMs = elapsed
                    console.warn(
                        '[ScriptVM] slow top-level call: %s took %dms (threshold=%dms, slowCallCount=%d)',
                        procName,
                        elapsed,
                        Config.engine.vmSlowCallWarnThresholdMs,
                        this.slowCallCount
                    )
                }
            }
        }
    }

    step(): boolean {
        if (this.halted) return false

        // fetch op
        var pc = this.pc
        this.script.seek(pc)
        var opcode = this.script.read16()

        // dispatch based on opMap
        if (opMap[opcode] !== undefined) opMap[opcode].call(this)
        else {
            this.recordUnsupportedOpcode(opcode, this.pc)
            console.warn(
                'unimplemented opcode %s (pc=%s) in %s',
                opcode.toString(16),
                this.pc.toString(16),
                this.intfile.name
            )
            if (Config.engine.doDisasmOnUnimplOp) {
                console.log('disassembly:')
                console.log(transpile(this.intfile, this.script))
            }
            return false
        }

        this.stepCount++
        if (this.pc === pc)
            // PC wasn't explicitly set, let's advance it to the current file offset
            this.pc = this.script.offset
        return true
    }

    run(): void {
        this.halted = false
        while (this.step()) {}
    }

    recordUnsupportedOpcode(opcode: number, pc: number): void {
        this.unsupportedOperations.push({
            opcode,
            pc,
            scriptName: this.intfile.name,
            procedureName: this.currentProcedureName,
        })
    }

    recordUnsupportedProcedure(opcode: number, procName: string): void {
        this.unsupportedOperations.push({
            opcode,
            pc: this.pc,
            scriptName: this.intfile.name,
            procedureName: this.currentProcedureName,
            bridgedProcedureName: procName,
        })
    }

    drainUnsupportedOperations(): UnsupportedVmOperation[] {
        const buffered = [...this.unsupportedOperations]
        this.unsupportedOperations.length = 0
        return buffered
    }
}
