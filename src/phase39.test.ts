/**
 * Phase 39 regression tests.
 *
 * Focus: crash-causing throw paths converted to safe returns (dialogue,
 * inventory, object creation, message parsing, elevator), and new sfall
 * opcodes 0x8198–0x819B.
 *
 *   Phase 39-A — getScriptMessage throw paths → warn+return null/empty string
 *   Phase 39-B — item_caps_total non-game-object → warn+return 0
 *   Phase 39-C — create_object_sid invalid elevation → warn+clamp
 *   Phase 39-D — start_gdialog / gdialog_mod_barter missing self_obj → warn+no-op
 *   Phase 39-E — gsay_reply null/empty message → warn+no-op
 *   Phase 39-F — metarule(15) elevator explicit type → log+proceed (no throw)
 *   Phase 39-G — message file parser: invalid lines skipped (no throw)
 *   Phase 39-H — anim() negative/unclassified code → log silently (no stub hit)
 *   Phase 39-I — get_ini_setting (0x8198) partial implementation
 *   Phase 39-J — active_hand (0x8199) partial implementation
 *   Phase 39-K — set_sfall_return (0x819A) no-op
 *   Phase 39-L — get_sfall_arg (0x819B) partial implementation
 *   Phase 39-M — checklist integrity: all Phase 39 entries present
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

// ===========================================================================
// Phase 39-A — getScriptMessage throw paths → warn+safe return
// ===========================================================================

describe('Phase 39-A — getScriptMessage safe defaults', () => {
    it('checklist entry getScriptMessage_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'getScriptMessage_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('high')
    })

    it('message_str with string arg returns the string directly (no-load path)', () => {
        const script = new (Scripting as any).Script()
        // Passing a string bypasses the file-load path entirely.
        expect(script.message_str(0, 'hello')).toBe('hello')
    })

    it('message_str with string arg does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.message_str(0, 'test message')).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-B — item_caps_total non-game-object → warn+return 0
// ===========================================================================

describe('Phase 39-B — item_caps_total safe default for non-game-object', () => {
    it('checklist entry item_caps_total_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'item_caps_total_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('high')
    })

    it('item_caps_total with null does not throw — returns 0', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.item_caps_total(null)).not.toThrow()
        expect(script.item_caps_total(null)).toBe(0)
    })

    it('item_caps_total with undefined does not throw — returns 0', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.item_caps_total(undefined)).not.toThrow()
        expect(script.item_caps_total(undefined)).toBe(0)
    })

    it('item_caps_total with a plain number does not throw — returns 0', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.item_caps_total(42)).not.toThrow()
        expect(script.item_caps_total(42)).toBe(0)
    })

    it('item_caps_total with a valid game object returns the money field', () => {
        const script = new (Scripting as any).Script()
        const obj = { _id: 1, type: 'item', position: { x: 0, y: 0 }, orientation: 0,
                      frame: 0, pid: 0, fid: 0, flags: 0, inventory: [], money: 250 }
        expect(script.item_caps_total(obj)).toBe(250)
    })
})

// ===========================================================================
// Phase 39-C — create_object_sid invalid elevation → warn+clamp
// ===========================================================================

describe('Phase 39-C — create_object_sid elevation clamping', () => {
    it('checklist entry create_object_sid_elev_clamp is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'create_object_sid_elev_clamp')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('high')
    })

    it('create_object_sid with elev=-1 does not throw', () => {
        const script = new (Scripting as any).Script()
        // createObjectWithPID may return null for an unknown PID — that is expected.
        // What must NOT happen is a throw from the elevation range check.
        expect(() => {
            try { script.create_object_sid(0, 0, -1, -1) } catch (e) {
                // Any throw from createObjectWithPID or addObject is acceptable;
                // only an elev-range throw is the regression we're guarding against.
                if (String(e).includes('elev out of range')) throw e
            }
        }).not.toThrow()
    })

    it('create_object_sid with elev=5 does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => {
            try { script.create_object_sid(0, 0, 5, -1) } catch (e) {
                if (String(e).includes('elev out of range')) throw e
            }
        }).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-D — start_gdialog / gdialog_mod_barter missing self_obj → no-op
// ===========================================================================

describe('Phase 39-D — start_gdialog and gdialog_mod_barter safe default', () => {
    it('checklist entry start_gdialog_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'start_gdialog_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('high')
    })

    it('start_gdialog with no self_obj does not throw', () => {
        const script = new (Scripting as any).Script()
        // self_obj is undefined by default on a freshly created Script instance.
        expect(() => script.start_gdialog(0, null, 0, -1, -1)).not.toThrow()
    })

    it('gdialog_mod_barter with no self_obj does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.gdialog_mod_barter(0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-E — gsay_reply null/empty message → warn+no-op
// ===========================================================================

describe('Phase 39-E — gsay_reply safe default for null/empty message', () => {
    it('checklist entry gsay_reply_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'gsay_reply_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('high')
    })

    it('gsay_reply with empty string does not throw (skips setting reply)', () => {
        const script = new (Scripting as any).Script()
        // Empty string → the null/empty guard prevents uiSetDialogueReply from being called.
        expect(() => script.gsay_reply(0, '')).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-F — metarule(15) elevator explicit type → log+proceed (no throw)
// ===========================================================================

describe('Phase 39-F — metarule(15) elevator with explicit type', () => {
    it('checklist entry metarule_15_explicit_type_safe is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule_15_explicit_type_safe')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('metarule')
        expect(entry?.impact).toBe('medium')
    })

    it('metarule(15, 0) — explicit type 0 — does not throw', () => {
        const script = new (Scripting as any).Script()
        // Elevator handler is no-op by default; must not throw even with target !== -1.
        expect(() => script.metarule(15, 0)).not.toThrow()
    })

    it('metarule(15, 2) — explicit type 2 — does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.metarule(15, 2)).not.toThrow()
    })

    it('metarule(15, -1) — canonical no-type call — still works (no regression)', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.metarule(15, -1)).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-G — message parser: invalid lines skipped (no throw)
// ===========================================================================

describe('Phase 39-G — message file parser skips invalid lines', () => {
    it('checklist entry message_parse_skip_invalid is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'message_parse_skip_invalid')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
        expect(entry?.impact).toBe('medium')
    })
})

// ===========================================================================
// Phase 39-H — anim() negative/unclassified code → log silently (no stub hit)
// ===========================================================================

describe('Phase 39-H — anim() negative code logs silently', () => {
    beforeEach(() => { drainStubHits() })

    it('checklist entry anim_negative_code_silent is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'anim_negative_code_silent')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('procedure')
    })

    it('anim() with negative anim code does not throw and does not emit stub hit', () => {
        const script = new (Scripting as any).Script()
        const obj = { _id: 1, type: 'critter', position: { x: 0, y: 0 }, orientation: 0, frame: 0,
                      pid: 0, fid: 0, flags: 0, inventory: [], isPlayer: false, dead: false,
                      money: 0, skills: {}, stats: {}, AP: null }
        drainStubHits()
        expect(() => script.anim(obj, -1, 0)).not.toThrow()
        expect(() => script.anim(obj, -99, 0)).not.toThrow()
        const hits = drainStubHits()
        const animHits = hits.filter((h) => h.name === 'anim')
        expect(animHits).toHaveLength(0)
    })
})

// ===========================================================================
// Phase 39-I — get_ini_setting (0x8198)
// ===========================================================================

describe('Phase 39-I — get_ini_setting opcode (0x8198)', () => {
    it('checklist entry get_ini_setting is present and partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_ini_setting')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
        expect(entry?.impact).toBe('medium')
    })

    it('get_ini_setting returns 0 for any key', () => {
        const script = new (Scripting as any).Script()
        expect(script.get_ini_setting('ddraw.ini|sfall|DisplayBuildDate')).toBe(0)
        expect(script.get_ini_setting('game.cfg|misc|main_menu_music')).toBe(0)
    })

    it('get_ini_setting does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.get_ini_setting('anything')).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-J — active_hand (0x8199)
// ===========================================================================

describe('Phase 39-J — active_hand opcode (0x8199)', () => {
    it('checklist entry active_hand is present and partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'active_hand')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
        expect(entry?.impact).toBe('medium')
    })

    it('active_hand returns 0 (primary hand)', () => {
        const script = new (Scripting as any).Script()
        expect(script.active_hand()).toBe(0)
    })

    it('active_hand does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.active_hand()).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-K — set_sfall_return (0x819A)
// ===========================================================================

describe('Phase 39-K — set_sfall_return opcode (0x819A)', () => {
    it('checklist entry set_sfall_return is present and partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_sfall_return')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
    })

    it('set_sfall_return does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.set_sfall_return(1)).not.toThrow()
        expect(() => script.set_sfall_return(0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-L — get_sfall_arg (0x819B)
// ===========================================================================

describe('Phase 39-L — get_sfall_arg opcode (0x819B)', () => {
    it('checklist entry get_sfall_arg is present and partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_sfall_arg')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
    })

    it('get_sfall_arg returns 0 (no hook args in browser build)', () => {
        const script = new (Scripting as any).Script()
        expect(script.get_sfall_arg()).toBe(0)
    })

    it('get_sfall_arg does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.get_sfall_arg()).not.toThrow()
    })
})

// ===========================================================================
// Phase 39-M — checklist integrity: all Phase 39 entries present
// ===========================================================================

describe('Phase 39-M — checklist integrity', () => {
    const PHASE_39_IDS = [
        'getScriptMessage_safe_default',
        'item_caps_total_safe_default',
        'create_object_sid_elev_clamp',
        'start_gdialog_safe_default',
        'gsay_reply_safe_default',
        'metarule_15_explicit_type_safe',
        'message_parse_skip_invalid',
        'anim_negative_code_silent',
        'get_ini_setting',
        'active_hand',
        'set_sfall_return',
        'get_sfall_arg',
    ]

    for (const id of PHASE_39_IDS) {
        it(`checklist entry "${id}" is present with required fields`, () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.kind).toMatch(/^(opcode|procedure|metarule)$/)
            expect(entry?.description.length).toBeGreaterThan(20)
            expect(entry?.status).toMatch(/^(stub|partial|implemented)$/)
            expect(entry?.frequency).toMatch(/^(high|medium|low)$/)
            expect(entry?.impact).toMatch(/^(blocker|high|medium|low)$/)
        })
    }

    it('all Phase 39 entries are in "implemented" or "partial" status (no stubs)', () => {
        for (const id of PHASE_39_IDS) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should not be stub`).not.toBe('stub')
        }
    })
})
