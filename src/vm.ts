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
        this.currentProcedureName = procName

        // Args are passed in reverse order (stack-based calling convention).
        const reversedArgs = [...args].reverse()
        reversedArgs.forEach((arg) => this.push(arg))
        this.push(args.length)

        this.retStack.push(-1) // push return address (TODO: how is this handled?)

        const t0 = isTopLevel ? performance.now() : 0
        try {
            // run procedure code
            this.pc = proc.offset
            this.run()
            return this.pop()
        } finally {
            // Keep debugger state consistent even when a procedure throws.
            this.currentProcedureName = previousProcedure
            if (isTopLevel) {
                const elapsed = performance.now() - t0
                this.lastCallTimeMs = elapsed
                this.totalCallTimeMs += elapsed
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
}
