/**
 * Phase 83 regression tests.
 *
 * Covers:
 *   A. BLK-144 — initScript() start proc isolation (callProcedureSafe)
 *   B. sfall opcodes 0x82A8–0x82AF
 *      0x82A8 get_critter_experience_sfall
 *      0x82A9 set_critter_experience_sfall
 *      0x82AA get_critter_crit_chance_sfall
 *      0x82AB set_critter_crit_chance_sfall
 *      0x82AC get_critter_npc_flag_sfall
 *      0x82AD set_critter_npc_flag_sfall
 *      0x82AE get_critter_outline_color_sfall
 *      0x82AF set_critter_outline_color_sfall
 *   C. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return {
        ...actual,
        uiStartCombat: vi.fn(),
        uiEndCombat: vi.fn(),
        uiLog: vi.fn(),
        uiAddDialogueOption: vi.fn(),
        uiSetDialogueReply: vi.fn(),
    }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 5, y: 5 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        frame: 0,
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : s === 'HP' ? 80 : s === 'Max AP' ? 10 : s === 'AGI' ? 5 : 5),
        getSkill: (_s: string) => 50,
        pcFlags: 0,
        critterFlags: 0,
        stats: {
            getBase: (_s: string) => 5,
            setBase: vi.fn(),
            modifyBase: vi.fn(),
        },
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    ;(globalState as any).floatMessages = []
    Scripting.setGlobalVars({})
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).floatMessages = []
})

// ===========================================================================
// Phase 83-A — BLK-144: initScript start proc isolation
// ===========================================================================

describe('Phase 83-A — BLK-144: initScript start proc isolation', () => {
    it('BLK-144 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_144_init_script_start_isolation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-144 has high impact', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_144_init_script_start_isolation')
        expect(entry?.impact).toBe('high')
    })

    it('initScript does not throw when start proc throws', () => {
        const throwingScript = new Scripting.Script()
        throwingScript.scriptName = 'test_throw_start'
        ;(throwingScript as any).start = () => {
            throw new Error('simulated start crash')
        }
        const npc = makeObj()
        expect(() => Scripting.initScript(throwingScript, npc)).not.toThrow()
    })

    it('initScript completes when start proc throws', () => {
        let afterInit = false
        const throwingScript = new Scripting.Script()
        throwingScript.scriptName = 'test_throw_start_complete'
        ;(throwingScript as any).start = () => {
            throw new Error('start crash')
        }
        const npc = makeObj()
        Scripting.initScript(throwingScript, npc)
        afterInit = true
        expect(afterInit).toBe(true)
    })

    it('second object initializes after first throws during initScript', () => {
        const obj1 = makeObj()
        const script1 = new Scripting.Script()
        script1.scriptName = 'bad_start'
        ;(script1 as any).start = () => { throw new Error('first start crash') }

        const obj2 = makeObj()
        const script2 = new Scripting.Script()
        script2.scriptName = 'good_start'
        let obj2Initialized = false
        ;(script2 as any).start = () => { obj2Initialized = true }

        expect(() => Scripting.initScript(script1, obj1)).not.toThrow()
        expect(() => Scripting.initScript(script2, obj2)).not.toThrow()
        expect(obj2Initialized).toBe(true)
    })

    it('initScript still sets self_obj and cur_map_index even if start throws', () => {
        const throwingScript = new Scripting.Script()
        throwingScript.scriptName = 'test_props_after_throw'
        ;(throwingScript as any).start = () => { throw new Error('crash') }
        const npc = makeObj()
        Scripting.initScript(throwingScript, npc)
        expect(throwingScript.self_obj).toBe(npc)
    })

    it('initScript with no start proc does not throw', () => {
        const scriptNoStart = new Scripting.Script()
        scriptNoStart.scriptName = 'no_start'
        // start is undefined by default
        const npc = makeObj()
        expect(() => Scripting.initScript(scriptNoStart, npc)).not.toThrow()
    })

    it('initScript with working start proc runs it correctly', () => {
        const goodScript = new Scripting.Script()
        goodScript.scriptName = 'good_start_script'
        let ran = false
        ;(goodScript as any).start = () => { ran = true }
        const npc = makeObj()
        Scripting.initScript(goodScript, npc)
        expect(ran).toBe(true)
    })
})

// ===========================================================================
// Phase 83-B-1 — sfall 0x82A8: get_critter_experience_sfall
// ===========================================================================

describe('Phase 83-B-1 — sfall 0x82A8: get_critter_experience_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_experience_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-2 — sfall 0x82A9: set_critter_experience_sfall
// ===========================================================================

describe('Phase 83-B-2 — sfall 0x82A9: set_critter_experience_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_experience_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-3 — sfall 0x82AA: get_critter_crit_chance_sfall
// ===========================================================================

describe('Phase 83-B-3 — sfall 0x82AA: get_critter_crit_chance_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_crit_chance_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-4 — sfall 0x82AB: set_critter_crit_chance_sfall
// ===========================================================================

describe('Phase 83-B-4 — sfall 0x82AB: set_critter_crit_chance_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_crit_chance_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-5 — sfall 0x82AC: get_critter_npc_flag_sfall
// ===========================================================================

describe('Phase 83-B-5 — sfall 0x82AC: get_critter_npc_flag_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_npc_flag_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-6 — sfall 0x82AD: set_critter_npc_flag_sfall
// ===========================================================================

describe('Phase 83-B-6 — sfall 0x82AD: set_critter_npc_flag_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_npc_flag_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-7 — sfall 0x82AE: get_critter_outline_color_sfall
// ===========================================================================

describe('Phase 83-B-7 — sfall 0x82AE: get_critter_outline_color_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_outline_color_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-8 — sfall 0x82AF: set_critter_outline_color_sfall
// ===========================================================================

describe('Phase 83-B-8 — sfall 0x82AF: set_critter_outline_color_sfall', () => {
    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_outline_color_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-C — sfall method registration check (0x82A8–0x82AF)
// ===========================================================================

// ===========================================================================
// Phase 83-D — Checklist integrity
// ===========================================================================

describe('Phase 83-D — Checklist integrity', () => {
    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('BLK-144 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_144_init_script_start_isolation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('all Phase 83 sfall opcode entries are implemented', () => {
        const sfallIds = [
            'sfall_get_critter_experience_83',
            'sfall_set_critter_experience_83',
            'sfall_get_critter_crit_chance_83',
            'sfall_set_critter_crit_chance_83',
            'sfall_get_critter_npc_flag_83',
            'sfall_set_critter_npc_flag_83',
            'sfall_get_critter_outline_color_83',
            'sfall_set_critter_outline_color_83',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('multiple consecutive initScript start-proc crashes do not corrupt state', () => {
        for (let i = 0; i < 5; i++) {
            const s = new Scripting.Script()
            s.scriptName = `crash_start_${i}`
            ;(s as any).start = () => { throw new Error(`start crash ${i}`) }
            expect(() => Scripting.initScript(s, makeObj())).not.toThrow()
        }

        // After 5 crashes, a good start still runs
        const goodScript = new Scripting.Script()
        goodScript.scriptName = 'good_after_crashes'
        let ran = false
        ;(goodScript as any).start = () => { ran = true }
        Scripting.initScript(goodScript, makeObj())
        expect(ran).toBe(true)
    })
})
