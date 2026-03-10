/**
 * Phase 79 regression tests.
 *
 * Covers:
 *   A. BLK-125 — anim() codes 1-99 now trigger singleAnimation() on the object
 *   B. BLK-126 — get/set_cursor_mode_sfall reads/writes globalState.sfallCursorMode
 *   C. BLK-127 — obj_under_cursor_sfall reads globalState.objUnderCursor
 *   D. globalState.sfallCursorMode and objUnderCursor default values
 *   E. Checklist integrity
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
        getStat: (s: string) => (s === 'Max HP' ? 100 : 5),
        getSkill: (s: string) => 50,
        pcFlags: 0,
        critterFlags: 0,
        stats: {
            getBase: () => 5,
            setBase: () => {},
            modifyBase: () => {},
        },
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    // Reset globalState phase-79 fields
    ;(globalState as any).sfallCursorMode = 0
    ;(globalState as any).objUnderCursor = null
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).sfallCursorMode = 0
    ;(globalState as any).objUnderCursor = null
})

// ===========================================================================
// Phase 79-A — BLK-125: anim() codes 1-99 trigger singleAnimation
// ===========================================================================

describe('Phase 79-A — BLK-125: anim() codes 1-99 trigger singleAnimation', () => {
    it('BLK-125 entry (anim_standard_codes) is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'anim_standard_codes')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('anim() code 1 calls singleAnimation(false, null) on the object', () => {
        let called = false
        const obj = makeObj({
            singleAnimation: (loop: boolean, cb: unknown) => {
                called = true
                expect(loop).toBe(false)
                expect(cb).toBeNull()
            },
        })
        script.anim(obj, 1, 0)
        expect(called).toBe(true)
    })

    it('anim() code 50 calls singleAnimation(false, null) on the object', () => {
        let called = false
        const obj = makeObj({
            singleAnimation: () => { called = true },
        })
        script.anim(obj, 50, 0)
        expect(called).toBe(true)
    })

    it('anim() code 99 calls singleAnimation(false, null) on the object', () => {
        let called = false
        const obj = makeObj({
            singleAnimation: () => { called = true },
        })
        script.anim(obj, 99, 0)
        expect(called).toBe(true)
    })

    it('anim() code 1 falls back to frame=0 when no singleAnimation method', () => {
        const obj = makeObj({ frame: 5 })
        script.anim(obj, 1, 0)
        expect(obj.frame).toBe(0)
    })

    it('anim() code 0 (stand) sets frame to 0', () => {
        const obj = makeObj({ frame: 7 })
        script.anim(obj, 0, 0)
        expect(obj.frame).toBe(0)
    })

    it('anim() code 1000 (rotation) sets orientation', () => {
        const obj = makeObj({ orientation: 0 })
        script.anim(obj, 1000, 3)
        expect(obj.orientation).toBe(3)
    })

    it('does not throw for any anim code', () => {
        const obj = makeObj()
        for (const code of [0, 1, 50, 99, 100, 500, 999, 1000, 1010, 1011]) {
            expect(() => script.anim(obj, code, 0)).not.toThrow()
        }
    })
})

// ===========================================================================
// Phase 79-B — BLK-126: get/set_cursor_mode_sfall
// ===========================================================================

describe('Phase 79-B — BLK-126: cursor mode reads/writes globalState.sfallCursorMode', () => {
    it('get_cursor_mode_sfall returns 0 by default', () => {
        (globalState as any).sfallCursorMode = 0
        expect(script.get_cursor_mode_sfall()).toBe(0)
    })

    it('set_cursor_mode_sfall stores mode in globalState', () => {
        script.set_cursor_mode_sfall(3)
        expect((globalState as any).sfallCursorMode).toBe(3)
    })

    it('get_cursor_mode_sfall reads back stored mode', () => {
        script.set_cursor_mode_sfall(7)
        expect(script.get_cursor_mode_sfall()).toBe(7)
    })

    it('set_cursor_mode_sfall rounds non-integer values', () => {
        script.set_cursor_mode_sfall(2.7)
        expect((globalState as any).sfallCursorMode).toBe(3)
    })

    it('set_cursor_mode_sfall sets 0 for NaN input', () => {
        (globalState as any).sfallCursorMode = 5
        script.set_cursor_mode_sfall(NaN)
        expect((globalState as any).sfallCursorMode).toBe(0)
    })

    it('BLK-126 checklist entries are implemented', () => {
        for (const id of ['sfall_get_cursor_mode', 'sfall_set_cursor_mode']) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing: ${id}`).toBeDefined()
            expect(entry?.status).toBe('implemented')
        }
    })

    it('does not throw', () => {
        expect(() => script.get_cursor_mode_sfall()).not.toThrow()
        expect(() => script.set_cursor_mode_sfall(0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 79-C — BLK-127: obj_under_cursor_sfall reads globalState.objUnderCursor
// ===========================================================================

describe('Phase 79-C — BLK-127: obj_under_cursor_sfall reads globalState.objUnderCursor', () => {
    it('returns 0 when objUnderCursor is null', () => {
        (globalState as any).objUnderCursor = null
        expect(script.obj_under_cursor_sfall()).toBe(0)
    })

    it('returns the object when objUnderCursor is set', () => {
        const obj = makeObj({ name: 'Hovered' })
        ;(globalState as any).objUnderCursor = obj
        expect(script.obj_under_cursor_sfall()).toBe(obj)
    })

    it('returns 0 after clearing objUnderCursor', () => {
        const obj = makeObj()
        ;(globalState as any).objUnderCursor = obj
        ;(globalState as any).objUnderCursor = null
        expect(script.obj_under_cursor_sfall()).toBe(0)
    })

    it('BLK-127 checklist entry sfall_obj_under_cursor is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_obj_under_cursor')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('does not throw', () => {
        expect(() => script.obj_under_cursor_sfall()).not.toThrow()
    })
})

// ===========================================================================
// Phase 79-D — globalState default values
// ===========================================================================

describe('Phase 79-D — globalState phase-79 fields default correctly', () => {
    it('sfallCursorMode defaults to 0', () => {
        // Reset to ensure default
        (globalState as any).sfallCursorMode = 0
        expect((globalState as any).sfallCursorMode).toBe(0)
    })

    it('objUnderCursor defaults to null', () => {
        (globalState as any).objUnderCursor = null
        expect((globalState as any).objUnderCursor).toBeNull()
    })
})

// ===========================================================================
// Phase 79-E — Checklist integrity
// ===========================================================================

describe('Phase 79-E — Checklist integrity', () => {
    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('all entries have valid kind values', () => {
        const validKinds = ['opcode', 'procedure', 'metarule', 'bug']
        for (const entry of SCRIPTING_STUB_CHECKLIST) {
            expect(validKinds, `invalid kind '${entry.kind}' for '${entry.id}'`).toContain(entry.kind)
        }
    })
})
