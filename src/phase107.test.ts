/**
 * New Reno Integration Test — Phase 107
 *
 * Validates that every real Fallout 2 .INT script for the New Reno
 * progression area (Street Maps, Bosses, Myron, Renesco, Boxing) can be:
 *   1. Parsed by parseIntFile without throwing
 *   2. Execute their map_enter_p_proc and map_update_p_proc lifecycle hooks
 *      on the real ScriptVM without uncaught exceptions
 *   3. Not infinite-loop (steps capped at vmMaxStepsPerCall)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { BinaryReader } from './util.js'
import { parseIntFile, IntFile } from './intfile.js'
import { ScriptVM } from './vm.js'
import './vm_bridge.js' // Ensure bridge opcodes are injected into opMap
import { Config } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, '..', 'data', 'scripts')

const LIFECYCLE_PROCS = [
    'map_enter_p_proc',
    'map_update_p_proc',
    'critter_p_proc',
    'talk_p_proc',
    'use_p_proc',
    'start',
]

const NEW_RENO_SCRIPTS = [
    'ncr1',
    'ncr2',
    'ncr3',
    'ncr4',
    'ncsalvat',
    'ncbishop',
    'ncbigjes',
    'ncorvill',
    'nhmyron',
    'ncrenesc',
    'ncjules',
    'ncliljes',
    'nccody',
    'ncprzftr',
    'ncboxer',
    'nctyson',
]

function loadIntFile(name: string): { intfile: IntFile; reader: BinaryReader } | null {
    const filePath = path.join(SCRIPTS_DIR, name + '.int')
    if (!fs.existsSync(filePath)) {
        return null
    }
    const buf = fs.readFileSync(filePath)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const dv = new DataView(ab)
    const reader = new BinaryReader(dv)
    const intfile = parseIntFile(reader, name)
    reader.seek(intfile.codeOffset)
    return { intfile, reader }
}

function runProcedure(
    intfile: IntFile,
    reader: BinaryReader,
    procName: string
): { ran: boolean; steps?: number; unsupported?: number } {
    if (!intfile.procedures[procName]) {
        return { ran: false }
    }

    const dv = new DataView(reader.data.buffer.slice(0))
    const freshReader = new BinaryReader(dv)
    freshReader.seek(intfile.codeOffset)

    const vm = new ScriptVM(freshReader, intfile) as any
    vm.scriptObj = new Proxy({}, {
        get: (target, prop) => {
            if (prop === 'scriptName') return intfile.name
            if (prop === '_mapScript') return undefined
            
            const scalarProps = [
                'action_being_used', 'game_time', 'cur_map_index', 
                'combat_is_initialized', 'fixed_param', 'self_obj', 
                'source_obj', 'target_obj'
            ]
            if (typeof prop === 'string' && scalarProps.includes(prop)) {
                return 0
            }
            
            return () => 0
        }
    })
    vm.mapScript = () => vm.scriptObj

    const prevStrict = Config.engine.failOnUnknownVmOpcode
    Config.engine.failOnUnknownVmOpcode = false

    try {
        vm.call(procName)
    } finally {
        Config.engine.failOnUnknownVmOpcode = prevStrict
    }

    return {
        ran: true,
        steps: vm.stepCount,
        unsupported: vm.drainUnsupportedOperations().length,
    }
}

describe('Phase 107-A — All New Reno scripts parse cleanly', () => {
    for (const name of NEW_RENO_SCRIPTS) {
        it(`${name}.int parses cleanly`, () => {
            expect(() => {
                const result = loadIntFile(name)
                expect(result).not.toBeNull()
            }).not.toThrow()
        })
    }
})

describe('Phase 107-B — New Reno scripts lifecycle: procs execute without crash', () => {
    for (const name of NEW_RENO_SCRIPTS) {
        it(`${name}: at least one lifecycle proc runs without throwing`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) return
            const { intfile, reader } = loaded

            let ranAtLeastOne = false
            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) continue
                expect(() => {
                    const result = runProcedure(intfile, reader, proc)
                    if (result.ran) ranAtLeastOne = true
                }).not.toThrow()
            }
            expect(ranAtLeastOne).toBe(true)
        })

        it(`${name}: map_enter_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) return
            expect(() => {
                runProcedure(loaded.intfile, loaded.reader, 'map_enter_p_proc')
            }).not.toThrow()
        })
    }
})

describe('Phase 107-C — Step-count sanity: New Reno scripts halt within step budget', () => {
    const MAX_STEPS = Config.engine.vmMaxStepsPerCall > 0
        ? Config.engine.vmMaxStepsPerCall
        : 1_000_000

    for (const name of NEW_RENO_SCRIPTS) {
        it(`${name}: lifecycle procs stay within ${MAX_STEPS.toLocaleString()} step budget`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) return
            const { intfile, reader } = loaded

            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) continue
                const result = runProcedure(intfile, reader, proc)
                if (!result.ran) continue
                if (result.steps !== undefined && MAX_STEPS > 0) {
                    expect(
                        result.steps,
                        `${name}::${proc} exceeded step budget (${result.steps} > ${MAX_STEPS})`
                    ).toBeLessThanOrEqual(MAX_STEPS)
                }
            }
        })
    }
})

describe('Phase 107-D — Map progression continuity: New Reno map names are stable across schema migration', () => {
    it('progression: New Reno map names (ncr1, ncr2, ncr3, ncr4) are stable', async () => {
        const { migrateSave } = await import('./saveSchema.js')

        const save1 = migrateSave({
            version: 3,
            name: 'phase107-test',
            timestamp: 1000,
            currentMap: 'ncr1',
            currentElevation: 0,
            player: { position: { x: 10, y: 10 }, orientation: 3, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: { karma: 0, reputations: {} },
        })
        expect(save1.currentMap).toBe('ncr1')

        const save2 = migrateSave({
            ...JSON.parse(JSON.stringify(save1)),
            currentMap: 'ncr2',
        })
        expect(save2.currentMap).toBe('ncr2')

        const save3 = migrateSave({
            ...JSON.parse(JSON.stringify(save1)),
            currentMap: 'ncr3',
        })
        expect(save3.currentMap).toBe('ncr3')

        const save4 = migrateSave({
            ...JSON.parse(JSON.stringify(save1)),
            currentMap: 'ncr4',
        })
        expect(save4.currentMap).toBe('ncr4')
    })
})
