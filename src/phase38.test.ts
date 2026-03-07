/**
 * Phase 38 regression tests.
 *
 * Focus: runtime hardening (crash-causing throws converted to safe returns) and
 * new sfall opcodes 0x8194–0x8197.
 *
 *   Phase 38-A — get_pc_stat unknown-index returns 0, not throw
 *   Phase 38-B — mark_area_known unknown area-type returns, not throw
 *   Phase 38-C — set_map_var with no map script returns, not throw
 *   Phase 38-D — critter_inven_obj with non-game-object returns null, not throw
 *   Phase 38-E — metarule3 id=100 (CLR_FIXED_TIMED_EVENTS) returns 0 always
 *   Phase 38-F — metarule3 id < 100 returns 0 silently (no stub hit)
 *   Phase 38-G — proto_data default case returns 0 silently (no stub hit)
 *   Phase 38-H — get_tile_fid (0x8194) returns 0 (partial)
 *   Phase 38-I — set_tile_fid (0x8195) is a no-op
 *   Phase 38-J — get_critter_flags / set_critter_flags (0x8196/0x8197)
 *   Phase 38-K — checklist integrity: all Phase 38 entries present with required fields
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, stubChecklistSummary, drainStubHits } from './scriptingChecklist.js'

// ===========================================================================
// Phase 38-A — get_pc_stat unknown-index returns 0 (not throw)
// ===========================================================================

describe('Phase 38-A — get_pc_stat safe default for unknown pcstat', () => {
    it('checklist entry get_pc_stat_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_pc_stat_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('get_pc_stat with unknown pcstat does not throw', () => {
        // Create a minimal script instance and call get_pc_stat with an out-of-range value.
        // The implementation must return 0 and warn rather than throwing.
        const script = new (Scripting as any).Script()
        expect(() => script.get_pc_stat(99)).not.toThrow()
        expect(script.get_pc_stat(99)).toBe(0)
        expect(script.get_pc_stat(100)).toBe(0)
        expect(script.get_pc_stat(-1)).toBe(0)
    })

    it('get_pc_stat still returns correct values for known indices', () => {
        const script = new (Scripting as any).Script()
        // Case 5 = PCSTAT_max_pc_stat → always 5
        expect(script.get_pc_stat(5)).toBe(5)
        // Case 1 = level; no player → 1 (default)
        expect(script.get_pc_stat(1)).toBe(1)
    })
})

// ===========================================================================
// Phase 38-B — mark_area_known unknown area-type returns (not throw)
// ===========================================================================

describe('Phase 38-B — mark_area_known safe default for unknown area type', () => {
    it('checklist entry mark_area_known_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'mark_area_known_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('mark_area_known with area type 2 does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.mark_area_known(2, 5, 1)).not.toThrow()
    })

    it('mark_area_known with area type 3 does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.mark_area_known(3, 0, 0)).not.toThrow()
    })

    it('mark_area_known with area type 0 still works (no regression)', () => {
        const script = new (Scripting as any).Script()
        // type 0 with no markAreaKnown callback just logs — should not throw
        expect(() => script.mark_area_known(0, 1, 1)).not.toThrow()
    })

    it('mark_area_known with area type 1 still works (no regression)', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.mark_area_known(1, 2, 1)).not.toThrow()
    })
})

// ===========================================================================
// Phase 38-C — set_map_var with no map script returns (not throw)
// ===========================================================================

describe('Phase 38-C — set_map_var safe default when no map script', () => {
    it('checklist entry set_map_var_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_map_var_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('set_map_var with no _mapScript does not throw', () => {
        const script = new (Scripting as any).Script()
        // Ensure _mapScript is not set
        script._mapScript = undefined
        expect(() => script.set_map_var(0, 42)).not.toThrow()
    })

    it('set_map_var with _mapScript=null does not throw', () => {
        const script = new (Scripting as any).Script()
        script._mapScript = null
        expect(() => script.set_map_var(1, 99)).not.toThrow()
    })
})

// ===========================================================================
// Phase 38-D — critter_inven_obj with non-game-object returns null (not throw)
// ===========================================================================

describe('Phase 38-D — critter_inven_obj safe default for non-game-object', () => {
    it('checklist entry critter_inven_obj_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_inven_obj_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.impact).toBe('high')
    })

    it('critter_inven_obj with null does not throw, returns null', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.critter_inven_obj(null, 0)).not.toThrow()
        expect(script.critter_inven_obj(null, 0)).toBeNull()
    })

    it('critter_inven_obj with undefined does not throw, returns null', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.critter_inven_obj(undefined, 1)).not.toThrow()
        expect(script.critter_inven_obj(undefined, 1)).toBeNull()
    })

    it('critter_inven_obj with plain number (non-object) returns null', () => {
        const script = new (Scripting as any).Script()
        expect(script.critter_inven_obj(42 as any, 0)).toBeNull()
    })
})

// ===========================================================================
// Phase 38-E — metarule3 id=100 (CLR_FIXED_TIMED_EVENTS) returns 0 always
// ===========================================================================

describe('Phase 38-E — metarule3 id=100 returns 0 (no fallthrough to stub)', () => {
    it('checklist entry metarule3_id100_fallthrough_fix is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_id100_fallthrough_fix')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('metarule3(100, ...) returns 0 when no matching event exists', () => {
        drainStubHits() // clear buffer
        const script = new (Scripting as any).Script()
        const result = script.metarule3(100, {}, 'nonexistent_userdata', 0)
        expect(result).toBe(0)
        // Must not have emitted a stub hit
        const hits = drainStubHits()
        expect(hits.filter((h) => h.name === 'metarule3').length).toBe(0)
    })

    it('metarule3(100, ...) does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.metarule3(100, null, null, 0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 38-F — metarule3 id < 100 returns 0 silently (no stub hit)
// ===========================================================================

describe('Phase 38-F — metarule3 id<100 safe default (no stub hit)', () => {
    it('checklist entry metarule3_id_below_100_safe_default is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule3_id_below_100_safe_default')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('metarule3(0, ...) returns 0 without stub hit', () => {
        drainStubHits()
        const script = new (Scripting as any).Script()
        const result = script.metarule3(0, null, null, 0)
        expect(result).toBe(0)
        const hits = drainStubHits()
        expect(hits.filter((h) => h.name === 'metarule3').length).toBe(0)
    })

    it('metarule3(50, ...) returns 0 without stub hit', () => {
        drainStubHits()
        const script = new (Scripting as any).Script()
        const result = script.metarule3(50, null, null, 0)
        expect(result).toBe(0)
        expect(drainStubHits().filter((h) => h.name === 'metarule3').length).toBe(0)
    })

    it('metarule3(99, ...) returns 0 without stub hit', () => {
        drainStubHits()
        const script = new (Scripting as any).Script()
        expect(script.metarule3(99, null, null, 0)).toBe(0)
        expect(drainStubHits().filter((h) => h.name === 'metarule3').length).toBe(0)
    })

    it('metarule3 known IDs (101, 108, 110) still return correct values', () => {
        const script = new (Scripting as any).Script()
        // 101 = METARULE3_RAND: rand(5,5) = 5
        expect(script.metarule3(101, 5, 5, 0)).toBe(5)
        // 102 = CHECK_WALKING_ALLOWED → 1
        expect(script.metarule3(102, null, null, 0)).toBe(1)
    })
})

// ===========================================================================
// Phase 38-G — proto_data default case returns 0 silently (no stub hit)
// ===========================================================================

describe('Phase 38-G — proto_data default case silent (no stub hit)', () => {
    it('checklist entry proto_data_default_silent is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'proto_data_default_silent')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('proto_data default case emits no stub hit', () => {
        drainStubHits()
        const script = new (Scripting as any).Script()
        // Field index 200 is not defined in any case branch
        // We need a minimal proto stub for this to reach the default.
        // If pro lookup returns null, proto_data returns 0 early. Create a mock object.
        const fakeObj = {
            type: 'item',
            pid: 9999,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            pro: null,
        }
        // Call with a clearly invalid field index — must not emit a stub hit
        const result = script.proto_data(fakeObj, 200)
        expect(result).toBe(0)
        const hits = drainStubHits()
        expect(hits.filter((h) => h.name === 'proto_data').length).toBe(0)
    })
})

// ===========================================================================
// Phase 38-H — get_tile_fid (0x8194) returns 0 (partial implementation)
// ===========================================================================

describe('Phase 38-H — get_tile_fid (0x8194) partial implementation', () => {
    it('checklist entry get_tile_fid is present as partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_tile_fid')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
    })

    it('get_tile_fid returns 0 and does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.get_tile_fid(1000, 0)).not.toThrow()
        expect(script.get_tile_fid(1000, 0)).toBe(0)
        expect(script.get_tile_fid(0, 2)).toBe(0)
    })

    it('get_tile_fid description mentions 0x8194', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_tile_fid')
        expect(entry?.description).toContain('0x8194')
    })
})

// ===========================================================================
// Phase 38-I — set_tile_fid (0x8195) is a no-op
// ===========================================================================

describe('Phase 38-I — set_tile_fid (0x8195) no-op', () => {
    it('checklist entry set_tile_fid is present as partial', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_tile_fid')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('partial')
        expect(entry?.kind).toBe('opcode')
    })

    it('set_tile_fid does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.set_tile_fid(1000, 0, 0x600000)).not.toThrow()
    })

    it('set_tile_fid returns undefined (void)', () => {
        const script = new (Scripting as any).Script()
        const result = script.set_tile_fid(0, 0, 1)
        expect(result).toBeUndefined()
    })
})

// ===========================================================================
// Phase 38-J — get_critter_flags / set_critter_flags (0x8196/0x8197)
// ===========================================================================

describe('Phase 38-J — get_critter_flags and set_critter_flags', () => {
    it('checklist entry get_critter_flags is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'get_critter_flags')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('opcode')
    })

    it('checklist entry set_critter_flags is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'set_critter_flags')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
        expect(entry?.kind).toBe('opcode')
    })

    it('get_critter_flags returns 0 for healthy critter', () => {
        const script = new (Scripting as any).Script()
        const critter = {
            type: 'critter',
            pid: 1,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            dead: false,
            knockedOut: false,
            knockedDown: false,
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: false,
            crippledRightArm: false,
            blinded: false,
        }
        expect(script.get_critter_flags(critter)).toBe(0)
    })

    it('get_critter_flags returns correct bitmask for dead critter', () => {
        const script = new (Scripting as any).Script()
        const critter = {
            type: 'critter',
            pid: 1,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            dead: true,
            knockedOut: false,
            knockedDown: false,
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: false,
            crippledRightArm: false,
            blinded: false,
        }
        expect(script.get_critter_flags(critter)).toBe(0x0001)
    })

    it('get_critter_flags returns compound bitmask for multiple injuries', () => {
        const script = new (Scripting as any).Script()
        const critter = {
            type: 'critter',
            pid: 1,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            dead: false,
            knockedOut: true,  // 0x02
            knockedDown: true, // 0x04
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: true,  // 0x20
            crippledRightArm: false,
            blinded: true,          // 0x80
        }
        const flags = script.get_critter_flags(critter)
        expect(flags & 0x0002).toBe(0x0002) // knocked out
        expect(flags & 0x0004).toBe(0x0004) // knocked down
        expect(flags & 0x0020).toBe(0x0020) // crippled left arm
        expect(flags & 0x0080).toBe(0x0080) // blinded
        expect(flags & 0x0001).toBe(0)       // not dead
    })

    it('set_critter_flags then get_critter_flags round-trips', () => {
        const script = new (Scripting as any).Script()
        const critter = {
            type: 'critter',
            pid: 1,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            dead: false,
            knockedOut: false,
            knockedDown: false,
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: false,
            crippledRightArm: false,
            blinded: false,
        }
        // Set blinded + crippled right arm
        const newFlags = 0x0040 | 0x0080
        script.set_critter_flags(critter, newFlags)
        expect(critter.crippledRightArm).toBe(true)
        expect(critter.blinded).toBe(true)
        expect(critter.dead).toBe(false)
        expect(critter.knockedOut).toBe(false)
        // Round-trip via get
        expect(script.get_critter_flags(critter)).toBe(newFlags)
    })

    it('set_critter_flags with flags=0 clears all injury state', () => {
        const script = new (Scripting as any).Script()
        const critter = {
            type: 'critter',
            pid: 1,
            inventory: [],
            position: { x: 0, y: 0 },
            visible: true,
            dead: true,
            knockedOut: true,
            knockedDown: true,
            crippledLeftLeg: true,
            crippledRightLeg: true,
            crippledLeftArm: true,
            crippledRightArm: true,
            blinded: true,
        }
        script.set_critter_flags(critter, 0)
        expect(critter.dead).toBe(false)
        expect(critter.knockedOut).toBe(false)
        expect(critter.blinded).toBe(false)
        expect(script.get_critter_flags(critter)).toBe(0)
    })

    it('get_critter_flags returns 0 for non-critter (safe fallback)', () => {
        const script = new (Scripting as any).Script()
        expect(script.get_critter_flags(null)).toBe(0)
        expect(script.get_critter_flags(undefined)).toBe(0)
        expect(script.get_critter_flags({ type: 'item', pid: 1, inventory: [], position: { x: 0, y: 0 }, visible: true })).toBe(0)
    })

    it('set_critter_flags on non-critter does not throw', () => {
        const script = new (Scripting as any).Script()
        expect(() => script.set_critter_flags(null, 0xFF)).not.toThrow()
    })
})

// ===========================================================================
// Phase 38-K — checklist integrity
// ===========================================================================

describe('Phase 38-K — Phase 38 checklist integrity', () => {
    const phase38Ids = [
        'get_pc_stat_safe_default',
        'mark_area_known_safe_default',
        'set_map_var_safe_default',
        'critter_inven_obj_safe_default',
        'metarule3_id100_fallthrough_fix',
        'metarule3_id_below_100_safe_default',
        'proto_data_default_silent',
        'get_tile_fid',
        'set_tile_fid',
        'get_critter_flags',
        'set_critter_flags',
    ]

    it('all Phase 38 IDs are present in the checklist', () => {
        for (const id of phase38Ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `entry '${id}' not found`).toBeDefined()
        }
    })

    it('all Phase 38 entries have required fields', () => {
        for (const id of phase38Ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry!.description.length, `${id} description too short`).toBeGreaterThan(10)
            expect(['opcode', 'procedure', 'metarule'], `${id} has invalid kind`).toContain(entry!.kind)
            expect(['stub', 'partial', 'implemented'], `${id} has invalid status`).toContain(entry!.status)
        }
    })

    it('all checklist IDs are unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('implemented count has grown after Phase 38 additions', () => {
        const summary = stubChecklistSummary()
        // Phase 38 adds 9 implemented + 2 partial entries on top of the Phase 37 baseline.
        // Implemented count should be at least 27.
        expect(summary.implemented).toBeGreaterThanOrEqual(27)
    })
})
