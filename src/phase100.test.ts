/**
 * First-Three-Areas Integration Test — Phase 100
 *
 * Validates that every real Fallout 2 .INT script for the first three
 * progression areas (Arroyo, Klamath, Modoc) can be:
 *   1. Parsed by parseIntFile without throwing
 *   2. Execute their map_enter_p_proc and map_update_p_proc lifecycle hooks
 *      on the real ScriptVM without uncaught exceptions
 *   3. Not infinite-loop (steps capped at vmMaxStepsPerCall)
 *
 * The ScriptVM is run in non-strict mode (failOnUnknownVmOpcode=false) so
 * that bridge-stub gaps produce a warning rather than a crash — matching the
 * production runtime behaviour.  Any hard throws from the VM itself are
 * failures.
 *
 * Covered areas:
 *   Area 1 — Arroyo (arbridge, arcaves, ardead, argarden, artemple,
 *             artif act, arvillag)
 *   Area 2 — Klamath (klacanyn, kladwtwn, klagraz, klamall, klatoxcv,
 *             klatrap)
 *   Area 3 — Modoc  (modbrah, modgard, modinn, modmain, modshit, modwell)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { BinaryReader } from './util.js'
import { parseIntFile, IntFile } from './intfile.js'
import { ScriptVM } from './vm.js'
import './vm_bridge.js' // Ensure bridge opcodes are injected into opMap
import { Config } from './config.js'

// ---------------------------------------------------------------------------
// Resolve the data/scripts directory relative to this file
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, '..', 'data', 'scripts')

// ---------------------------------------------------------------------------
// Lifecycle procedure names in priority order (try each until found)
// ---------------------------------------------------------------------------

const LIFECYCLE_PROCS = [
    'map_enter_p_proc',
    'map_update_p_proc',
    'critter_p_proc',
    'talk_p_proc',
    'use_p_proc',
    'start',
]

// ---------------------------------------------------------------------------
// Area script manifests
// ---------------------------------------------------------------------------

const AREA_1_ARROYO = [
    'arbridge',
    'arcaves',
    'ardead',
    'argarden',
    'artemple',
    'artif act',  // intentionally checked — actual filename: artifact
    'arvillag',
]

// fix: the filename is artifact, not artif act
const ARROYO_SCRIPTS = [
    'arbridge', 'arcaves', 'ardead', 'argarden', 'artemple', 'artifact', 'arvillag',
]

const KLAMATH_SCRIPTS = [
    'klacanyn', 'kladwtwn', 'klagraz', 'klamall', 'klatoxcv', 'klatrap',
]

const MODOC_SCRIPTS = [
    'modbrah', 'modgard', 'modinn', 'modmain', 'modshit', 'modwell',
]

// All scripts for the three areas
const ALL_AREA_SCRIPTS = [...ARROYO_SCRIPTS, ...KLAMATH_SCRIPTS, ...MODOC_SCRIPTS]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    // rewind reader to code section
    reader.seek(intfile.codeOffset)
    return { intfile, reader }
}

/**
 * Try to run one lifecycle procedure on a freshly-constructed VM.
 * Returns { ran: true, steps, unsupported } on success.
 * Returns { ran: false } if the procedure is not defined in this script.
 * Throws if the VM throws (hard failure).
 */
function runProcedure(
    intfile: IntFile,
    reader: BinaryReader,
    procName: string
): { ran: boolean; steps?: number; unsupported?: number } {
    if (!intfile.procedures[procName]) {
        return { ran: false }
    }

    // Clone the DataView so each run starts from fresh binary state
    const dv = new DataView(reader.data.buffer.slice(0))
    const freshReader = new BinaryReader(dv)
    freshReader.seek(intfile.codeOffset)

    const vm = new ScriptVM(freshReader, intfile) as any
    vm.scriptObj = new Proxy({}, {
        get: (target, prop) => {
            if (prop === 'scriptName') return intfile.name
            if (prop === '_mapScript') return undefined
            
            // Known properties accessed by bridge opcodes without ()
            const scalarProps = [
                'action_being_used', 'game_time', 'cur_map_index', 
                'combat_is_initialized', 'fixed_param', 'self_obj', 
                'source_obj', 'target_obj'
            ]
            if (typeof prop === 'string' && scalarProps.includes(prop)) {
                return 0
            }
            
            // Everything else is treated as a procedure stub returning 0
            return () => 0
        }
    })

    // Non-strict: bridge stubs produce WARNING, not a throw
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

// ---------------------------------------------------------------------------
// Parse-only phase — all 19 scripts must parse without throwing
// ---------------------------------------------------------------------------

describe('Phase 100-A — First-Three-Areas: all scripts parse without error', () => {
    for (const name of ALL_AREA_SCRIPTS) {
        it(`${name}.int parses cleanly`, () => {
            expect(() => {
                const result = loadIntFile(name)
                expect(result).not.toBeNull()
            }).not.toThrow()
        })
    }
})

// ---------------------------------------------------------------------------
// Lifecycle proc phase — every script's available procs run without hard crash
// ---------------------------------------------------------------------------

describe('Phase 100-B — Arroyo scripts: lifecycle procs execute without crash', () => {
    for (const name of ARROYO_SCRIPTS) {
        it(`${name}: at least one lifecycle proc runs without throwing`, () => {
            const loaded = loadIntFile(name)
            expect(loaded).not.toBeNull()
            if (!loaded) {return}
            const { intfile, reader } = loaded

            let ranAtLeastOne = false
            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) {continue}
                // Must not throw
                expect(() => {
                    const result = runProcedure(intfile, reader, proc)
                    if (result.ran) {ranAtLeastOne = true}
                }).not.toThrow()
            }
            // Every script in these areas should define at least one lifecycle proc
            expect(ranAtLeastOne).toBe(true)
        })

        it(`${name}: map_enter_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_enter_p_proc')
            }).not.toThrow()
        })

        it(`${name}: map_update_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_update_p_proc')
            }).not.toThrow()
        })
    }
})

describe('Phase 100-C — Klamath scripts: lifecycle procs execute without crash', () => {
    for (const name of KLAMATH_SCRIPTS) {
        it(`${name}: at least one lifecycle proc runs without throwing`, () => {
            const loaded = loadIntFile(name)
            expect(loaded).not.toBeNull()
            if (!loaded) {return}
            const { intfile, reader } = loaded

            let ranAtLeastOne = false
            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) {continue}
                expect(() => {
                    const result = runProcedure(intfile, reader, proc)
                    if (result.ran) {ranAtLeastOne = true}
                }).not.toThrow()
            }
            expect(ranAtLeastOne).toBe(true)
        })

        it(`${name}: map_enter_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_enter_p_proc')
            }).not.toThrow()
        })

        it(`${name}: map_update_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_update_p_proc')
            }).not.toThrow()
        })
    }
})

describe('Phase 100-D — Modoc scripts: lifecycle procs execute without crash', () => {
    for (const name of MODOC_SCRIPTS) {
        it(`${name}: at least one lifecycle proc runs without throwing`, () => {
            const loaded = loadIntFile(name)
            expect(loaded).not.toBeNull()
            if (!loaded) {return}
            const { intfile, reader } = loaded

            let ranAtLeastOne = false
            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) {continue}
                expect(() => {
                    const result = runProcedure(intfile, reader, proc)
                    if (result.ran) {ranAtLeastOne = true}
                }).not.toThrow()
            }
            expect(ranAtLeastOne).toBe(true)
        })

        it(`${name}: map_enter_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_enter_p_proc')
            }).not.toThrow()
        })

        it(`${name}: map_update_p_proc runs without throw (if present)`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded
            expect(() => {
                runProcedure(intfile, reader, 'map_update_p_proc')
            }).not.toThrow()
        })
    }
})

// ---------------------------------------------------------------------------
// Procedure inventory — document what each script exposes
// ---------------------------------------------------------------------------

describe('Phase 100-E — Procedure inventory: all scripts define expected procs', () => {
    it('arvillag.int defines map_enter_p_proc (Arroyo village entry)', () => {
        const loaded = loadIntFile('arvillag')
        expect(loaded).not.toBeNull()
        if (!loaded) {return}
        expect(loaded.intfile.procedures['map_enter_p_proc']).toBeDefined()
    })

    it('artemple.int defines map_enter_p_proc (Temple of Trials)', () => {
        const loaded = loadIntFile('artemple')
        expect(loaded).not.toBeNull()
        if (!loaded) {return}
        expect(loaded.intfile.procedures['map_enter_p_proc']).toBeDefined()
    })

    it('kladwtwn.int defines map_enter_p_proc (Klamath downtown)', () => {
        const loaded = loadIntFile('kladwtwn')
        expect(loaded).not.toBeNull()
        if (!loaded) {return}
        expect(loaded.intfile.procedures['map_enter_p_proc']).toBeDefined()
    })

    it('modmain.int defines map_enter_p_proc (Modoc main area)', () => {
        const loaded = loadIntFile('modmain')
        expect(loaded).not.toBeNull()
        if (!loaded) {return}
        expect(loaded.intfile.procedures['map_enter_p_proc']).toBeDefined()
    })

    it('All 19 area scripts are present on disk', () => {
        for (const name of ALL_AREA_SCRIPTS) {
            const filePath = path.join(SCRIPTS_DIR, name + '.int')
            expect(fs.existsSync(filePath), `${name}.int is missing from data/scripts/`).toBe(true)
        }
    })
})

// ---------------------------------------------------------------------------
// Step-count sanity — scripts must not infinite-loop
// ---------------------------------------------------------------------------

describe('Phase 100-F — Step-count sanity: scripts halt within step budget', () => {
    const MAX_STEPS = Config.engine.vmMaxStepsPerCall > 0
        ? Config.engine.vmMaxStepsPerCall
        : 1_000_000

    for (const name of ALL_AREA_SCRIPTS) {
        it(`${name}: lifecycle procs stay within ${MAX_STEPS.toLocaleString()} step budget`, () => {
            const loaded = loadIntFile(name)
            if (!loaded) {return}
            const { intfile, reader } = loaded

            for (const proc of LIFECYCLE_PROCS) {
                if (!intfile.procedures[proc]) {continue}
                const result = runProcedure(intfile, reader, proc)
                if (!result.ran) {continue}
                // If step count is defined, it must be within budget
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

// ---------------------------------------------------------------------------
// Save/load continuity — ensure map state survives a round-trip
// ---------------------------------------------------------------------------

describe('Phase 100-G — Map progression continuity: area-level save/load round-trip', () => {
    it('progression: Arroyo → Klamath → Modoc map names are stable across schema migration', async () => {
        const { migrateSave } = await import('./saveSchema.js')

        const arroyo = migrateSave({
            version: 3,
            name: 'phase100-test',
            timestamp: 1000,
            currentMap: 'arvillag',
            currentElevation: 0,
            player: { position: { x: 94, y: 109 }, orientation: 3, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: { karma: 0, reputations: {} },
        })
        expect(arroyo.currentMap).toBe('arvillag')

        const klamath = migrateSave({
            ...JSON.parse(JSON.stringify(arroyo)),
            currentMap: 'kladwtwn',
        })
        expect(klamath.currentMap).toBe('kladwtwn')

        const modoc = migrateSave({
            ...JSON.parse(JSON.stringify(klamath)),
            currentMap: 'modmain',
        })
        expect(modoc.currentMap).toBe('modmain')
    })

    it('player position is preserved through Arroyo→Klamath save migration', async () => {
        const { migrateSave } = await import('./saveSchema.js')
        const save = migrateSave({
            version: 3,
            name: 'phase100-pos',
            timestamp: 2000,
            currentMap: 'arvillag',
            currentElevation: 0,
            player: { position: { x: 100, y: 120 }, orientation: 2, inventory: [], xp: 500, level: 2, karma: 10 },
            party: [],
            savedMaps: {},
            questLog: { entries: [{ id: 'temple_trials', state: 'completed', stateChangedAt: 1999 }] },
            reputation: { karma: 10, reputations: {} },
        })
        expect(save.player.position).toEqual({ x: 100, y: 120 })
        expect(save.player.xp).toBe(500)
        expect(save.player.level).toBe(2)
        expect(save.questLog.entries.some((e: any) => e.id === 'temple_trials' && e.state === 'completed')).toBe(true)
    })
})
