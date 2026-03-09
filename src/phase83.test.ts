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
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_experience_sfall(0 as any)).toBe(0)
        expect(script.get_critter_experience_sfall(null as any)).toBe(0)
    })

    it('returns critter.xp when set', () => {
        const npc = makeObj({ xp: 500 })
        expect(script.get_critter_experience_sfall(npc)).toBe(500)
    })

    it('returns critter.experience when xp not set', () => {
        const npc = makeObj({ experience: 300 })
        expect(script.get_critter_experience_sfall(npc)).toBe(300)
    })

    it('returns 0 when neither xp nor experience is set', () => {
        const npc = makeObj()
        expect(script.get_critter_experience_sfall(npc)).toBe(0)
    })

    it('does not throw for invalid input', () => {
        expect(() => script.get_critter_experience_sfall(undefined as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_experience_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-2 — sfall 0x82A9: set_critter_experience_sfall
// ===========================================================================

describe('Phase 83-B-2 — sfall 0x82A9: set_critter_experience_sfall', () => {
    it('sets critter.xp for critter', () => {
        const npc = makeObj()
        script.set_critter_experience_sfall(npc, 750)
        expect(npc.xp).toBe(750)
    })

    it('also sets critter.experience for NPC', () => {
        const npc = makeObj()
        script.set_critter_experience_sfall(npc, 750)
        expect(npc.experience).toBe(750)
    })

    it('clamps to 0 for negative values', () => {
        const npc = makeObj()
        script.set_critter_experience_sfall(npc, -100)
        expect(npc.experience).toBe(0)
    })

    it('clamps to 2^31-1 for excessive values', () => {
        const npc = makeObj()
        script.set_critter_experience_sfall(npc, 3_000_000_000)
        expect(npc.experience).toBe(2_147_483_647)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_experience_sfall(0 as any, 100)).not.toThrow()
    })

    it('does not throw for non-finite val', () => {
        const npc = makeObj()
        expect(() => script.set_critter_experience_sfall(npc, NaN)).not.toThrow()
        expect(() => script.set_critter_experience_sfall(npc, Infinity)).not.toThrow()
    })

    it('sets both xp and experience on the same critter', () => {
        const critter = makeObj()
        script.set_critter_experience_sfall(critter, 9999)
        expect(critter.xp).toBe(9999)
        expect(critter.experience).toBe(9999)
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_experience_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-3 — sfall 0x82AA: get_critter_crit_chance_sfall
// ===========================================================================

describe('Phase 83-B-3 — sfall 0x82AA: get_critter_crit_chance_sfall', () => {
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_crit_chance_sfall(0 as any)).toBe(0)
    })

    it('returns 0 when critChanceMod not set', () => {
        const npc = makeObj()
        expect(script.get_critter_crit_chance_sfall(npc)).toBe(0)
    })

    it('returns critChanceMod when set', () => {
        const npc = makeObj({ critChanceMod: 15 })
        expect(script.get_critter_crit_chance_sfall(npc)).toBe(15)
    })

    it('returns negative critChanceMod correctly', () => {
        const npc = makeObj({ critChanceMod: -20 })
        expect(script.get_critter_crit_chance_sfall(npc)).toBe(-20)
    })

    it('does not throw for invalid input', () => {
        expect(() => script.get_critter_crit_chance_sfall(undefined as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_crit_chance_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-4 — sfall 0x82AB: set_critter_crit_chance_sfall
// ===========================================================================

describe('Phase 83-B-4 — sfall 0x82AB: set_critter_crit_chance_sfall', () => {
    it('sets critChanceMod on critter', () => {
        const npc = makeObj()
        script.set_critter_crit_chance_sfall(npc, 25)
        expect(npc.critChanceMod).toBe(25)
    })

    it('clamps at -100', () => {
        const npc = makeObj()
        script.set_critter_crit_chance_sfall(npc, -200)
        expect(npc.critChanceMod).toBe(-100)
    })

    it('clamps at 100', () => {
        const npc = makeObj()
        script.set_critter_crit_chance_sfall(npc, 200)
        expect(npc.critChanceMod).toBe(100)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_crit_chance_sfall(0 as any, 10)).not.toThrow()
    })

    it('does not throw for non-finite val', () => {
        const npc = makeObj()
        expect(() => script.set_critter_crit_chance_sfall(npc, NaN)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_crit_chance_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-5 — sfall 0x82AC: get_critter_npc_flag_sfall
// ===========================================================================

describe('Phase 83-B-5 — sfall 0x82AC: get_critter_npc_flag_sfall', () => {
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_npc_flag_sfall(0 as any, 0)).toBe(0)
    })

    it('returns 0 when npcFlags not set', () => {
        const npc = makeObj()
        expect(script.get_critter_npc_flag_sfall(npc, 0)).toBe(0)
        expect(script.get_critter_npc_flag_sfall(npc, 7)).toBe(0)
    })

    it('returns 1 for a set bit', () => {
        const npc = makeObj({ npcFlags: 0b0101 })
        expect(script.get_critter_npc_flag_sfall(npc, 0)).toBe(1)
        expect(script.get_critter_npc_flag_sfall(npc, 2)).toBe(1)
    })

    it('returns 0 for an unset bit', () => {
        const npc = makeObj({ npcFlags: 0b0101 })
        expect(script.get_critter_npc_flag_sfall(npc, 1)).toBe(0)
        expect(script.get_critter_npc_flag_sfall(npc, 3)).toBe(0)
    })

    it('returns 0 for out-of-range flag', () => {
        const npc = makeObj({ npcFlags: 0xFF })
        expect(script.get_critter_npc_flag_sfall(npc, 32)).toBe(0)
        expect(script.get_critter_npc_flag_sfall(npc, -1)).toBe(0)
    })

    it('does not throw for invalid input', () => {
        expect(() => script.get_critter_npc_flag_sfall(undefined as any, 0)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_npc_flag_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-6 — sfall 0x82AD: set_critter_npc_flag_sfall
// ===========================================================================

describe('Phase 83-B-6 — sfall 0x82AD: set_critter_npc_flag_sfall', () => {
    it('sets a specific bit in npcFlags', () => {
        const npc = makeObj()
        script.set_critter_npc_flag_sfall(npc, 3, 1)
        expect(npc.npcFlags).toBe(0b1000)
    })

    it('clears a specific bit in npcFlags', () => {
        const npc = makeObj({ npcFlags: 0b1111 })
        script.set_critter_npc_flag_sfall(npc, 2, 0)
        expect(npc.npcFlags & (1 << 2)).toBe(0)
    })

    it('does not affect other bits when setting', () => {
        const npc = makeObj({ npcFlags: 0b0001 })
        script.set_critter_npc_flag_sfall(npc, 3, 1)
        expect(npc.npcFlags & 0b0001).toBe(1) // bit 0 still set
        expect(npc.npcFlags & 0b1000).toBe(0b1000) // bit 3 now set
    })

    it('initializes npcFlags to 0 if absent before setting', () => {
        const npc = makeObj()
        delete npc.npcFlags
        script.set_critter_npc_flag_sfall(npc, 5, 1)
        expect(npc.npcFlags).toBe(1 << 5)
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_npc_flag_sfall(0 as any, 0, 1)).not.toThrow()
    })

    it('does not throw for out-of-range flag', () => {
        const npc = makeObj()
        expect(() => script.set_critter_npc_flag_sfall(npc, 32, 1)).not.toThrow()
        expect(() => script.set_critter_npc_flag_sfall(npc, -1, 1)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_npc_flag_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-7 — sfall 0x82AE: get_critter_outline_color_sfall
// ===========================================================================

describe('Phase 83-B-7 — sfall 0x82AE: get_critter_outline_color_sfall', () => {
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_outline_color_sfall(0 as any)).toBe(0)
    })

    it('returns 0 when sfallOutlineColor not set', () => {
        const npc = makeObj()
        expect(script.get_critter_outline_color_sfall(npc)).toBe(0)
    })

    it('returns sfallOutlineColor when set', () => {
        const npc = makeObj({ sfallOutlineColor: 5 })
        expect(script.get_critter_outline_color_sfall(npc)).toBe(5)
    })

    it('does not throw for invalid input', () => {
        expect(() => script.get_critter_outline_color_sfall(undefined as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_outline_color_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-B-8 — sfall 0x82AF: set_critter_outline_color_sfall
// ===========================================================================

describe('Phase 83-B-8 — sfall 0x82AF: set_critter_outline_color_sfall', () => {
    it('sets sfallOutlineColor on critter', () => {
        const npc = makeObj()
        script.set_critter_outline_color_sfall(npc, 3)
        expect(npc.sfallOutlineColor).toBe(3)
    })

    it('sets sfallOutlineColor to 0 when color is 0 (remove outline)', () => {
        const npc = makeObj({ sfallOutlineColor: 5 })
        script.set_critter_outline_color_sfall(npc, 0)
        expect(npc.sfallOutlineColor).toBe(0)
    })

    it('clamps negative color to 0', () => {
        const npc = makeObj()
        script.set_critter_outline_color_sfall(npc, -1)
        expect(npc.sfallOutlineColor).toBe(0)
    })

    it('calls invalidate() if present and does not throw', () => {
        const invalidateSpy = vi.fn()
        const npc = makeObj({ invalidate: invalidateSpy })
        expect(() => script.set_critter_outline_color_sfall(npc, 2)).not.toThrow()
        expect(invalidateSpy).toHaveBeenCalled()
    })

    it('does not throw if invalidate() throws', () => {
        const npc = makeObj({ invalidate: () => { throw new Error('renderer error') } })
        expect(() => script.set_critter_outline_color_sfall(npc, 2)).not.toThrow()
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_outline_color_sfall(0 as any, 1)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_critter_outline_color_83')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 83-C — sfall method registration check (0x82A8–0x82AF)
// ===========================================================================

describe('Phase 83-C — sfall 0x82A8–0x82AF scripting methods exist', () => {
    const phase83Methods = [
        'get_critter_experience_sfall',
        'set_critter_experience_sfall',
        'get_critter_crit_chance_sfall',
        'set_critter_crit_chance_sfall',
        'get_critter_npc_flag_sfall',
        'set_critter_npc_flag_sfall',
        'get_critter_outline_color_sfall',
        'set_critter_outline_color_sfall',
    ]

    for (const methodName of phase83Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

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
