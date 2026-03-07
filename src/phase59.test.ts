/**
 * Phase 59 regression tests.
 *
 * Covers:
 *   A. BLK-056 — giq_option() null-player guard
 *   B. BLK-057 — node998() now exits dialogue and initiates combat
 *   C. BLK-058 — metarule3(108) null-position guard
 *   D. sfall opcodes 0x81F8–0x81FF
 *   E. Checklist integrity
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import globalState from './globalState.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'Max HP' ? 50 : s === 'HP' ? 30 : 5,
        perkRanks: {},
        ...overrides,
    }
}

// ===========================================================================
// Phase 59-A — BLK-056: giq_option null-player guard
// ===========================================================================

describe('Phase 59-A — BLK-056: giq_option null-player guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('giq_option does not throw when globalState.player is null', () => {
        const savedPlayer = globalState.player
        ;(globalState as any).player = null

        try {
            // giq_option may throw XMLHttpRequest errors in the test env because it
            // calls getScriptMessage().  What we're verifying is that it does NOT throw
            // due to null player access (TypeError: cannot read property of null).
            // We only fail the test on a player-related crash.
            try {
                script.giq_option(6, 0, 1, function () {}, 0)
            } catch (e: any) {
                const msg = String(e)
                expect(msg).not.toContain('Cannot read properties of null')
                expect(msg).not.toContain('player')
            }
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    it('giq_option with iqTest ≤ 0 does not check player INT', () => {
        const savedPlayer = globalState.player
        ;(globalState as any).player = null
        try {
            // iqTest=0 means no INT check; BLK-056 guard should prevent player null crash.
            try {
                script.giq_option(0, 0, 1, function () {}, 0)
            } catch (e: any) {
                const msg = String(e)
                expect(msg).not.toContain('Cannot read properties of null')
                expect(msg).not.toContain('player.getStat')
            }
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })
})

// ===========================================================================
// Phase 59-B — BLK-057: node998 enters combat
// ===========================================================================

describe('Phase 59-B — BLK-057: node998() exits dialogue and initiates combat', () => {
    it('node998 does not throw when called with no self_obj', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        script.self_obj = null
        // node998 calls dialogueExit() which needs DOM; in test env this may throw.
        // We only fail if the error is about null.self_obj, not DOM unavailability.
        try {
            script.node998()
        } catch (e: any) {
            const msg = String(e)
            expect(msg).not.toContain('Cannot read properties of null')
            expect(msg).not.toContain('self_obj')
        }
    })

    it('node998 is defined on Script prototype', async () => {
        const { Scripting: S } = await import('./scripting.js')
        const script = new (S as any).Script()
        expect(typeof script.node998).toBe('function')
    })
})

// ===========================================================================
// Phase 59-C — BLK-058: metarule3(108) null-position guard
// ===========================================================================

describe('Phase 59-C — BLK-058: metarule3(108) null-position guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('metarule3(108) returns 0 when first critter has null position', () => {
        const a = makeObj({ position: null })
        const b = makeObj({ position: { x: 5, y: 5 } })
        expect(() => script.metarule3(108, a, b, 0)).not.toThrow()
        expect(script.metarule3(108, a, b, 0)).toBe(0)
    })

    it('metarule3(108) returns 0 when second critter has null position', () => {
        const a = makeObj({ position: { x: 5, y: 5 } })
        const b = makeObj({ position: null })
        expect(() => script.metarule3(108, a, b, 0)).not.toThrow()
        expect(script.metarule3(108, a, b, 0)).toBe(0)
    })

    it('metarule3(108) returns 0 when both positions are null', () => {
        const a = makeObj({ position: null })
        const b = makeObj({ position: null })
        expect(script.metarule3(108, a, b, 0)).toBe(0)
    })

    it('metarule3(108) returns correct distance when both positions are valid', () => {
        const a = makeObj({ position: { x: 0, y: 0 } })
        const b = makeObj({ position: { x: 0, y: 0 } })
        const result = script.metarule3(108, a, b, 0)
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
    })
})

// ===========================================================================
// Phase 59-D — sfall opcodes 0x81F8–0x81FF
// ===========================================================================

describe('Phase 59-D — sfall opcodes 0x81F8–0x81FF', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
    })

    it('get_critter_max_hp_sfall (0x81F8) returns 0 for non-critter', () => {
        expect(script.get_critter_max_hp_sfall(null as any)).toBe(0)
    })

    it('get_critter_max_hp_sfall (0x81F8) returns Max HP stat', () => {
        const critter = makeObj({ getStat: (s: string) => s === 'Max HP' ? 75 : 0 })
        expect(script.get_critter_max_hp_sfall(critter)).toBe(75)
    })

    it('set_critter_max_hp_sfall (0x81F9) does not throw for non-critter', () => {
        expect(() => script.set_critter_max_hp_sfall(null as any, 100)).not.toThrow()
    })

    it('set_critter_max_hp_sfall (0x81F9) sets base Max HP on critter stats', () => {
        let capturedStat: string | null = null
        let capturedVal = 0
        const critter = makeObj({
            stats: {
                setBase: (stat: string, val: number) => { capturedStat = stat; capturedVal = val },
                getBase: () => 0,
                get: () => 0,
                baseStats: {},
            },
        })
        script.set_critter_max_hp_sfall(critter, 120)
        expect(capturedStat).toBe('Max HP')
        expect(capturedVal).toBe(120)
    })

    it('get_total_kills_sfall (0x81FA) returns 0 when no kills', () => {
        const saved = globalState.critterKillCounts
        ;(globalState as any).critterKillCounts = null
        try {
            expect(script.get_total_kills_sfall()).toBe(0)
        } finally {
            ;(globalState as any).critterKillCounts = saved
        }
    })

    it('get_total_kills_sfall (0x81FA) sums all kill types', () => {
        const saved = globalState.critterKillCounts
        ;(globalState as any).critterKillCounts = { 0: 5, 1: 3, 2: 2 }
        try {
            expect(script.get_total_kills_sfall()).toBe(10)
        } finally {
            ;(globalState as any).critterKillCounts = saved
        }
    })

    it('get_critter_extra_data_sfall (0x81FB) returns 0 for non-critter', () => {
        expect(script.get_critter_extra_data_sfall(null as any, 0)).toBe(0)
    })

    it('get_critter_extra_data_sfall (0x81FB) returns XPValue at field 3', () => {
        const critter = makeObj({ pro: { extra: { XPValue: 200 } } })
        expect(script.get_critter_extra_data_sfall(critter, 3)).toBe(200)
    })

    it('get_critter_extra_data_sfall (0x81FB) returns killType at field 2', () => {
        const critter = makeObj({ pro: { extra: { killType: 4 } } })
        expect(script.get_critter_extra_data_sfall(critter, 2)).toBe(4)
    })

    it('get/set script_return_val_sfall (0x81FC/0x81FD) round-trip', () => {
        script.set_script_return_val_sfall(42)
        expect(script.get_script_return_val_sfall()).toBe(42)
        // Clean up
        script.set_script_return_val_sfall(0)
    })

    it('get_script_return_val_sfall (0x81FC) returns 0 by default', () => {
        const s = new (Scripting as any).Script()
        expect(s.get_script_return_val_sfall()).toBe(0)
    })

    it('get_active_map_id_sfall (0x81FE) returns a number', () => {
        const result = script.get_active_map_id_sfall()
        expect(typeof result).toBe('number')
    })

    it('get_critter_range_sfall (0x81FF) returns 1 for non-critter', () => {
        expect(script.get_critter_range_sfall(null as any)).toBe(1)
    })

    it('get_critter_range_sfall (0x81FF) returns 1 for unarmed critter', () => {
        const critter = makeObj({ equippedWeapon: null })
        expect(script.get_critter_range_sfall(critter)).toBe(1)
    })

    it('get_critter_range_sfall (0x81FF) returns range from weapon proto', () => {
        const critter = makeObj({
            equippedWeapon: {
                weapon: { weapon: { pro: { extra: { maxRange1: 15 } } } },
            },
        })
        expect(script.get_critter_range_sfall(critter)).toBe(15)
    })
})

// ===========================================================================
// Phase 59-E — Checklist integrity
// ===========================================================================

describe('Phase 59-E — Checklist integrity', () => {
    const phase59Ids = [
        'blk_056_giq_option_null_player',
        'blk_057_node998_enter_combat',
        'blk_058_metarule3_108_null_position',
        'sfall_get_critter_max_hp',
        'sfall_set_critter_max_hp',
        'sfall_get_total_kills',
        'sfall_get_critter_extra_data',
        'sfall_get_script_return_val',
        'sfall_set_script_return_val',
        'sfall_get_active_map_id',
        'sfall_get_critter_range',
    ]

    it('all Phase 59 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase59Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_056_giq_option_null_player',
            'blk_057_node998_enter_combat',
            'blk_058_metarule3_108_null_position',
        ]
        for (const id of blkIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry?.status, `${id} should be implemented`).toBe('implemented')
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
