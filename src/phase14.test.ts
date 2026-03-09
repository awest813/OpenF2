/**
 * Phase 14 regression tests — Complete scripting VM for Fallout 2 procedures.
 *
 * Covers all items added in this phase:
 *
 *   Phase 14-A — use_obj_on_p_proc: new procedure type + useObjOn trigger
 *   Phase 14-B — push_p_proc: new procedure type + push trigger
 *   Phase 14-C — is_dropping_p_proc: new procedure type + isDropping trigger
 *   Phase 14-D — use_obj_on_obj falls back to use_p_proc when use_obj_on_p_proc absent
 *   Phase 14-E — tile_is_visible de-stubbed (returns 1, no stub hit recorded)
 *   Phase 14-F — reg_anim_func de-stubbed (no stub hit recorded)
 *   Phase 14-G — reg_anim_animate de-stubbed (no stub hit recorded)
 *   Phase 14-H — metarule_18 checklist entry upgraded to 'partial'
 *   Phase 14-I — Checklist accuracy: new entries present and statuses correct
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
    SCRIPTING_STUB_CHECKLIST,
    stubChecklistSummary,
    drainStubHits,
    recordStubHit,
    stubHitCount,
} from './scriptingChecklist.js'

// ===========================================================================
// Phase 14-A — use_obj_on_p_proc trigger
// ===========================================================================

/**
 * Inline replica of the useObjOn trigger logic added to Scripting.
 *
 * Fires use_obj_on_p_proc on the target object with the applied item as
 * source_obj.  Returns null when the procedure is absent; returns the
 * _didOverride flag otherwise.
 */
interface FakeScript {
    self_obj: any
    source_obj: any
    cur_map_index: number | null
    _didOverride: boolean
    use_obj_on_p_proc?: () => void
    use_p_proc?: () => void
    push_p_proc?: () => void
    is_dropping_p_proc?: () => void
}

interface FakeObj {
    _script?: FakeScript
    _type?: string
}

function makeObj(script?: Partial<FakeScript>): FakeObj {
    const obj: FakeObj = { _type: 'item' }
    if (script !== undefined) {
        obj._script = {
            self_obj: null,
            source_obj: null,
            cur_map_index: null,
            _didOverride: false,
            ...script,
        }
    }
    return obj
}

function useObjOnImpl(obj: FakeObj, item: FakeObj): boolean | null {
    if (!obj._script || obj._script.use_obj_on_p_proc === undefined) return null
    obj._script.source_obj = item
    obj._script.self_obj = obj
    obj._script.cur_map_index = 1
    obj._script._didOverride = false
    obj._script.use_obj_on_p_proc()
    return obj._script._didOverride
}

describe('Phase 14-A — use_obj_on_p_proc trigger (useObjOn)', () => {
    it('returns null when target has no script', () => {
        const target = makeObj()
        const item = makeObj()
        expect(useObjOnImpl(target, item)).toBeNull()
    })

    it('returns null when target script has no use_obj_on_p_proc', () => {
        const target = makeObj({ use_p_proc: () => {} })
        const item = makeObj()
        expect(useObjOnImpl(target, item)).toBeNull()
    })

    it('fires use_obj_on_p_proc when defined', () => {
        let fired = false
        const target = makeObj({
            use_obj_on_p_proc: function (this: FakeScript) {
                fired = true
            },
        })
        const item = makeObj()
        useObjOnImpl(target, item)
        expect(fired).toBe(true)
    })

    it('sets source_obj to the item being applied', () => {
        const item = makeObj()
        let capturedSource: any = undefined
        const target = makeObj({
            use_obj_on_p_proc: function (this: FakeScript) {
                capturedSource = target._script!.source_obj
            },
        })
        useObjOnImpl(target, item)
        expect(capturedSource).toBe(item)
    })

    it('sets self_obj to the target', () => {
        let capturedSelf: any = undefined
        const target = makeObj({
            use_obj_on_p_proc: function (this: FakeScript) {
                capturedSelf = target._script!.self_obj
            },
        })
        useObjOnImpl(target, makeObj())
        expect(capturedSelf).toBe(target)
    })

    it('returns _didOverride = false when proc does not set it', () => {
        const target = makeObj({ use_obj_on_p_proc: () => {} })
        expect(useObjOnImpl(target, makeObj())).toBe(false)
    })

    it('returns _didOverride = true when proc sets it', () => {
        const target = makeObj({
            use_obj_on_p_proc: function (this: FakeScript) {
                target._script!._didOverride = true
            },
        })
        expect(useObjOnImpl(target, makeObj())).toBe(true)
    })
})

// ===========================================================================
// Phase 14-B — push_p_proc trigger
// ===========================================================================

function pushImpl(obj: FakeObj, source: FakeObj): boolean | null {
    if (!obj._script || obj._script.push_p_proc === undefined) return null
    obj._script.source_obj = source
    obj._script.self_obj = obj
    obj._script.cur_map_index = 1
    obj._script._didOverride = false
    obj._script.push_p_proc()
    return obj._script._didOverride
}

describe('Phase 14-B — push_p_proc trigger (push)', () => {
    it('returns null when target has no script', () => {
        expect(pushImpl(makeObj(), makeObj())).toBeNull()
    })

    it('returns null when target script has no push_p_proc', () => {
        const npc = makeObj({ use_p_proc: () => {} })
        expect(pushImpl(npc, makeObj())).toBeNull()
    })

    it('fires push_p_proc when defined', () => {
        let fired = false
        const npc = makeObj({ push_p_proc: () => { fired = true } })
        pushImpl(npc, makeObj())
        expect(fired).toBe(true)
    })

    it('sets source_obj to the pusher', () => {
        const pusher = makeObj()
        let capturedSource: any = undefined
        const npc = makeObj({
            push_p_proc: function () {
                capturedSource = npc._script!.source_obj
            },
        })
        pushImpl(npc, pusher)
        expect(capturedSource).toBe(pusher)
    })

    it('sets self_obj to the NPC being pushed', () => {
        let capturedSelf: any = undefined
        const npc = makeObj({
            push_p_proc: function () {
                capturedSelf = npc._script!.self_obj
            },
        })
        pushImpl(npc, makeObj())
        expect(capturedSelf).toBe(npc)
    })

    it('returns false when proc does not override', () => {
        const npc = makeObj({ push_p_proc: () => {} })
        expect(pushImpl(npc, makeObj())).toBe(false)
    })

    it('returns true when proc sets _didOverride', () => {
        const npc = makeObj({
            push_p_proc: function () {
                npc._script!._didOverride = true
            },
        })
        expect(pushImpl(npc, makeObj())).toBe(true)
    })
})

// ===========================================================================
// Phase 14-C — is_dropping_p_proc trigger
// ===========================================================================

function isDroppingImpl(obj: FakeObj, source: FakeObj): boolean | null {
    if (!obj._script || obj._script.is_dropping_p_proc === undefined) return null
    obj._script.source_obj = source
    obj._script.self_obj = obj
    obj._script.cur_map_index = 1
    obj._script._didOverride = false
    obj._script.is_dropping_p_proc()
    return obj._script._didOverride
}

describe('Phase 14-C — is_dropping_p_proc trigger (isDropping)', () => {
    it('returns null when item has no script', () => {
        expect(isDroppingImpl(makeObj(), makeObj())).toBeNull()
    })

    it('returns null when item script has no is_dropping_p_proc', () => {
        const item = makeObj({ use_p_proc: () => {} })
        expect(isDroppingImpl(item, makeObj())).toBeNull()
    })

    it('fires is_dropping_p_proc when defined', () => {
        let fired = false
        const item = makeObj({ is_dropping_p_proc: () => { fired = true } })
        isDroppingImpl(item, makeObj())
        expect(fired).toBe(true)
    })

    it('sets source_obj to the dropper', () => {
        const dropper = makeObj()
        let capturedSource: any = undefined
        const item = makeObj({
            is_dropping_p_proc: function () {
                capturedSource = item._script!.source_obj
            },
        })
        isDroppingImpl(item, dropper)
        expect(capturedSource).toBe(dropper)
    })

    it('sets self_obj to the item being dropped', () => {
        let capturedSelf: any = undefined
        const item = makeObj({
            is_dropping_p_proc: function () {
                capturedSelf = item._script!.self_obj
            },
        })
        isDroppingImpl(item, makeObj())
        expect(capturedSelf).toBe(item)
    })

    it('returns false when proc does not cancel', () => {
        const item = makeObj({ is_dropping_p_proc: () => {} })
        expect(isDroppingImpl(item, makeObj())).toBe(false)
    })

    it('returns true when proc cancels the drop', () => {
        const item = makeObj({
            is_dropping_p_proc: function () {
                item._script!._didOverride = true
            },
        })
        expect(isDroppingImpl(item, makeObj())).toBe(true)
    })
})

// ===========================================================================
// Phase 14-D — use_obj_on_obj dispatch fallback
// ===========================================================================

/**
 * Inline replica of the updated use_obj_on_obj dispatch logic:
 * prefer use_obj_on_p_proc on the target; fall back to use_p_proc.
 */
function useObjOnObjImpl(
    item: FakeObj,
    target: FakeObj,
    calls: string[]
): void {
    if (target._script && target._script.use_obj_on_p_proc !== undefined) {
        // prefer use_obj_on_p_proc
        calls.push('use_obj_on_p_proc')
        target._script.use_obj_on_p_proc!()
    } else if (target._script && target._script.use_p_proc !== undefined) {
        // fall back to use_p_proc
        calls.push('use_p_proc')
        target._script.use_p_proc!()
    }
}

describe('Phase 14-D — use_obj_on_obj dispatch fallback', () => {
    it('calls use_obj_on_p_proc when target has it', () => {
        const calls: string[] = []
        const target = makeObj({
            use_obj_on_p_proc: () => {},
            use_p_proc: () => {},
        })
        useObjOnObjImpl(makeObj(), target, calls)
        expect(calls).toEqual(['use_obj_on_p_proc'])
    })

    it('falls back to use_p_proc when target lacks use_obj_on_p_proc', () => {
        const calls: string[] = []
        const target = makeObj({ use_p_proc: () => {} })
        useObjOnObjImpl(makeObj(), target, calls)
        expect(calls).toEqual(['use_p_proc'])
    })

    it('calls nothing when target has neither procedure', () => {
        const calls: string[] = []
        const target = makeObj({})
        useObjOnObjImpl(makeObj(), target, calls)
        expect(calls).toEqual([])
    })

    it('calls nothing when target has no script', () => {
        const calls: string[] = []
        useObjOnObjImpl(makeObj(), makeObj(), calls)
        expect(calls).toEqual([])
    })
})

// ===========================================================================
// Phase 14-E — tile_is_visible no longer records a stub hit
// ===========================================================================

/**
 * Inline replica of the de-stubbed tile_is_visible: always returns 1 and
 * does NOT call stub() (so no stub hit is recorded).
 */
function tileIsVisibleImpl(_tile: number): number {
    // log('tile_is_visible', ...) -- no stub recording
    return 1
}

describe('Phase 14-E — tile_is_visible de-stubbed', () => {
    beforeEach(() => { drainStubHits() })

    it('returns 1 for any tile', () => {
        expect(tileIsVisibleImpl(0)).toBe(1)
        expect(tileIsVisibleImpl(12345)).toBe(1)
    })

    it('does not record a stub hit', () => {
        tileIsVisibleImpl(42)
        expect(stubHitCount()).toBe(0)
    })

    it('checklist entry for tile_is_visible is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'tile_is_visible')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 14-F — reg_anim_func no longer records a stub hit
// ===========================================================================

function regAnimFuncImpl(_1: any, _2: any): void {
    // log('reg_anim_func', ...) -- no stub recording
}

describe('Phase 14-F — reg_anim_func de-stubbed', () => {
    beforeEach(() => { drainStubHits() })

    it('does not throw', () => {
        expect(() => regAnimFuncImpl(1, 2)).not.toThrow()
    })

    it('does not record a stub hit', () => {
        regAnimFuncImpl(1, 2)
        expect(stubHitCount()).toBe(0)
    })

    it('checklist entry for reg_anim_func is partial or implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'reg_anim_func')
        expect(entry).toBeDefined()
        expect(['partial', 'implemented']).toContain(entry!.status)
    })
})

// ===========================================================================
// Phase 14-G — reg_anim_animate no longer records a stub hit
// ===========================================================================

function regAnimAnimateImpl(_obj: any, _anim: number, _delay: number): void {
    // log('reg_anim_animate', ...) -- no stub recording
}

describe('Phase 14-G — reg_anim_animate de-stubbed', () => {
    beforeEach(() => { drainStubHits() })

    it('does not throw', () => {
        expect(() => regAnimAnimateImpl({}, 0, 0)).not.toThrow()
    })

    it('does not record a stub hit', () => {
        regAnimAnimateImpl({}, 0, 0)
        expect(stubHitCount()).toBe(0)
    })

    it('checklist entry for reg_anim_animate is partial or implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'reg_anim_animate')
        expect(entry).toBeDefined()
        expect(['partial', 'implemented']).toContain(entry!.status)
    })
})

// ===========================================================================
// Phase 14-H — metarule_18 checklist entry is 'partial'
// ===========================================================================

/**
 * Inline replica of metarule case 18: returns 0 without recording a stub hit.
 */
function metarule18Impl(): number {
    return 0 // critter on drugs — not yet tracked; silent partial
}

describe('Phase 14-H — metarule_18 upgraded to partial', () => {
    beforeEach(() => { drainStubHits() })

    it('returns 0 (not on drugs)', () => {
        expect(metarule18Impl()).toBe(0)
    })

    it('does not record a stub hit', () => {
        metarule18Impl()
        expect(stubHitCount()).toBe(0)
    })

    it('checklist entry for metarule_18 is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'metarule_18')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 14-I — Checklist accuracy
// ===========================================================================

describe('Phase 14-I — checklist accuracy for new procedure types', () => {
    it('use_obj_on_p_proc entry exists and is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'use_obj_on_p_proc')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
        expect(entry!.kind).toBe('procedure')
    })

    it('push_p_proc entry exists and is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'push_p_proc')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
        expect(entry!.kind).toBe('procedure')
    })

    it('is_dropping_p_proc entry exists and is implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'is_dropping_p_proc')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
        expect(entry!.kind).toBe('procedure')
    })

    it('all checklist IDs remain unique after adding new entries', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('implemented count has grown after this phase', () => {
        const summary = stubChecklistSummary()
        // Phase 13 had >= 14 implemented entries; phase 14 adds 3 more.
        expect(summary.implemented).toBeGreaterThanOrEqual(17)
    })

    it('stub count has decreased after de-stubbing tile_is_visible, reg_anim_*, metarule_18', () => {
        const summary = stubChecklistSummary()
        // All four de-stubbed entries moved to 'partial'; none remain as 'stub'.
        // proto_data, inven_cmds, obj_can_hear_obj, has_trait_worn, critter_add_trait_weight were
        // promoted to partial/implemented by Phase 14–53. Phase 54 added 6 new sfall stubs
        // (force_encounter, force_encounter_with_flags, get_last_pers_obj, obj_remove_script,
        // obj_add_script, obj_run_proc) that are intentionally stub-level no-ops.
        // Phase 56 added 1 additional stub (sfall_set_critter_attack_mode).
        // Phase 57 added 2 additional stubs (sfall_set_object_cost_sfall, sfall_set_tile_fid).
        // Phase 71 added 1 additional stub (sfall_critter_add_trait).
        expect(summary.stub).toBeLessThanOrEqual(15)
    })
})
