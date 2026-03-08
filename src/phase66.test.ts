/**
 * Phase 66 regression tests.
 *
 * Covers:
 *   A. BLK-071 — carFuel save schema v18 migration and round-trip
 *   B. BLK-072 — tile_contains_pid_obj null-gMap guard
 *   C. sfall opcodes 0x8230–0x8237 (object name, gender, combat round, AP, carry weight)
 *   D. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn(), uiLog: vi.fn() }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'critter',
        name: 'TestNPC',
        position: { x: 5, y: 5 },
        inventory: [],
        dead: false,
        pid: 100,
        getStat: (s: string) => 5,
        getSkill: (s: string) => 50,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 66-A — BLK-071: carFuel save schema v18
// ===========================================================================

describe('Phase 66-A — BLK-071: carFuel save schema v18 migration', () => {
    it('SAVE_VERSION is 18', () => {
        expect(SAVE_VERSION).toBe(18)
    })

    it('migrates a v17 save to v18 and sets carFuel = 0', () => {
        const raw = {
            version: 17,
            currentMap: 'artemple',
            currentElevation: 0,
            gameTickTime: 0,
            scriptGlobalVars: {},
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: {},
            playerSkillValues: {},
            playerName: 'TestChar',
            playerGender: 'male',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(18)
        expect(save.carFuel).toBe(0)
    })

    it('migrates a v1 save all the way to v18 with carFuel = 0', () => {
        const raw = {
            version: 1,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(18)
        expect(save.carFuel).toBe(0)
    })

    it('preserves an existing carFuel value when already present', () => {
        const raw = {
            version: 17,
            currentMap: 'artemple',
            currentElevation: 0,
            gameTickTime: 0,
            scriptGlobalVars: {},
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: {},
            playerSkillValues: {},
            playerName: 'Player',
            playerGender: 'male',
            carFuel: 35000,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.carFuel).toBe(35000)
    })

    it('sanitizes out-of-range carFuel to 0', () => {
        const raw = {
            version: 17,
            currentMap: 'artemple',
            currentElevation: 0,
            gameTickTime: 0,
            scriptGlobalVars: {},
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: {},
            playerSkillValues: {},
            playerName: 'Player',
            playerGender: 'male',
            carFuel: -500,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.carFuel).toBe(0)
    })

    it('sanitizes carFuel > 80000 to 80000', () => {
        const raw = {
            version: 17,
            currentMap: 'artemple',
            currentElevation: 0,
            gameTickTime: 0,
            scriptGlobalVars: {},
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: {},
            playerSkillValues: {},
            playerName: 'Player',
            playerGender: 'male',
            carFuel: 999999,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.carFuel).toBe(80000)
    })

    it('sanitizes NaN carFuel to 0', () => {
        const raw: any = {
            version: 17,
            currentMap: 'artemple',
            currentElevation: 0,
            gameTickTime: 0,
            scriptGlobalVars: {},
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: {},
            playerCharTraits: [],
            playerPerkRanks: {},
            sfallGlobals: {},
            playerPcFlags: 0,
            playerActiveHand: 0,
            playerBaseStats: {},
            playerSkillValues: {},
            playerName: 'Player',
            playerGender: 'male',
            carFuel: NaN,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.carFuel).toBe(0)
    })
})

// ===========================================================================
// Phase 66-B — BLK-072: tile_contains_pid_obj null-gMap guard
// ===========================================================================

describe('Phase 66-B — BLK-072: tile_contains_pid_obj null-gMap guard', () => {
    let script: Scripting.Script

    beforeEach(async () => {
        const gs = (await import('./globalState.js')).default
        ;(gs as any).gMap = null
        script = new (Scripting as any).Script()
    })

    it('returns 0 when gMap is null instead of crashing', async () => {
        expect(script.tile_contains_pid_obj(100, 0, 999)).toBe(0)
    })
})

// ===========================================================================
// Phase 66-C — sfall opcodes 0x8230–0x8237
// ===========================================================================

describe('Phase 66-C — sfall opcodes 0x8230–0x8237', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    // ---- 0x8230 get_object_name_sfall ----
    it('get_object_name_sfall returns empty string for null', () => {
        expect(script.get_object_name_sfall(null as any)).toBe('')
    })

    it('get_object_name_sfall returns name for any game object', () => {
        const obj = makeObj({ name: 'Rusty Knife' })
        expect(script.get_object_name_sfall(obj)).toBe('Rusty Knife')
    })

    it('get_object_name_sfall returns empty string when name is absent', () => {
        const obj = makeObj({ name: undefined })
        expect(script.get_object_name_sfall(obj)).toBe('')
    })

    // ---- 0x8231 get_critter_gender_sfall ----
    it('get_critter_gender_sfall returns 0 for null', () => {
        expect(script.get_critter_gender_sfall(null as any)).toBe(0)
    })

    it('get_critter_gender_sfall returns 0 for male critter', () => {
        const critter = makeObj({ gender: 'male' })
        expect(script.get_critter_gender_sfall(critter)).toBe(0)
    })

    it('get_critter_gender_sfall returns 1 for female critter', () => {
        const critter = makeObj({ gender: 'female' })
        expect(script.get_critter_gender_sfall(critter)).toBe(1)
    })

    it('get_critter_gender_sfall defaults to 0 when gender is undefined', () => {
        const critter = makeObj()
        expect(script.get_critter_gender_sfall(critter)).toBe(0)
    })

    // ---- 0x8232 get_combat_round_sfall ----
    it('get_combat_round_sfall returns 0 when not in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.inCombat
        gs.inCombat = false
        expect(script.get_combat_round_sfall()).toBe(0)
        gs.inCombat = origCombat
    })

    it('get_combat_round_sfall returns 0 when in combat but no round set', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.inCombat
        const origCombatObj = gs.combat
        gs.inCombat = true
        ;(gs as any).combat = {}
        expect(script.get_combat_round_sfall()).toBe(0)
        gs.inCombat = origCombat
        gs.combat = origCombatObj
    })

    it('get_combat_round_sfall returns round number when in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.inCombat
        const origCombatObj = gs.combat
        gs.inCombat = true
        ;(gs as any).combat = { round: 3 }
        expect(script.get_combat_round_sfall()).toBe(3)
        gs.inCombat = origCombat
        gs.combat = origCombatObj
    })

    // ---- 0x8233 get_critter_action_points_sfall ----
    it('get_critter_action_points_sfall returns 0 for null', () => {
        expect(script.get_critter_action_points_sfall(null as any)).toBe(0)
    })

    it('get_critter_action_points_sfall returns AP from AP.combat when in combat', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.inCombat
        gs.inCombat = true
        const critter = makeObj({ AP: { combat: 7 } })
        expect(script.get_critter_action_points_sfall(critter)).toBe(7)
        gs.inCombat = origCombat
    })

    it('get_critter_action_points_sfall returns max AP outside combat', async () => {
        const gs = (await import('./globalState.js')).default
        const origCombat = gs.inCombat
        gs.inCombat = false
        // AGI=5 → max_ap = 5 + floor(5/2) = 5+2 = 7
        const critter = makeObj({ getStat: (s: string) => (s === 'AGI' ? 5 : 0) })
        expect(script.get_critter_action_points_sfall(critter)).toBe(7)
        gs.inCombat = origCombat
    })

    // ---- 0x8234 set_critter_action_points_sfall ----
    it('set_critter_action_points_sfall does not throw for null', () => {
        expect(() => script.set_critter_action_points_sfall(null as any, 5)).not.toThrow()
    })

    it('set_critter_action_points_sfall sets AP.combat on critter', () => {
        const critter = makeObj({ AP: { combat: 3 } })
        script.set_critter_action_points_sfall(critter, 6)
        expect(critter.AP.combat).toBe(6)
    })

    it('set_critter_action_points_sfall clamps to 0 minimum', () => {
        const critter = makeObj({ AP: { combat: 3 } })
        script.set_critter_action_points_sfall(critter, -5)
        expect(critter.AP.combat).toBe(0)
    })

    it('set_critter_action_points_sfall is a no-op when AP is absent', () => {
        const critter = makeObj()
        expect(() => script.set_critter_action_points_sfall(critter, 5)).not.toThrow()
    })

    // ---- 0x8235 get_critter_max_ap_sfall ----
    it('get_critter_max_ap_sfall returns 0 for null', () => {
        expect(script.get_critter_max_ap_sfall(null as any)).toBe(0)
    })

    it('get_critter_max_ap_sfall derives max AP from Agility', () => {
        // AGI=8 → 5 + floor(8/2) = 5+4 = 9
        const critter = makeObj({ getStat: (s: string) => (s === 'AGI' ? 8 : 5) })
        expect(script.get_critter_max_ap_sfall(critter)).toBe(9)
    })

    it('get_critter_max_ap_sfall returns at least 1', () => {
        const critter = makeObj({ getStat: (s: string) => (s === 'AGI' ? 0 : 0) })
        expect(script.get_critter_max_ap_sfall(critter)).toBeGreaterThanOrEqual(1)
    })

    // ---- 0x8236 get_critter_carry_weight_sfall ----
    it('get_critter_carry_weight_sfall returns 0 for null', () => {
        expect(script.get_critter_carry_weight_sfall(null as any)).toBe(0)
    })

    it('get_critter_carry_weight_sfall derives capacity from Strength', () => {
        // STR=5 → 25 + 5*25 = 150
        const critter = makeObj({ getStat: (s: string) => (s === 'STR' ? 5 : 0) })
        expect(script.get_critter_carry_weight_sfall(critter)).toBe(150)
    })

    it('get_critter_carry_weight_sfall uses STR=10 → 275', () => {
        const critter = makeObj({ getStat: (s: string) => (s === 'STR' ? 10 : 0) })
        expect(script.get_critter_carry_weight_sfall(critter)).toBe(275)
    })

    // ---- 0x8237 get_critter_current_weight_sfall ----
    it('get_critter_current_weight_sfall returns 0 for null', () => {
        expect(script.get_critter_current_weight_sfall(null as any)).toBe(0)
    })

    it('get_critter_current_weight_sfall returns 0 for empty inventory', () => {
        const critter = makeObj({ inventory: [] })
        expect(script.get_critter_current_weight_sfall(critter)).toBe(0)
    })

    it('get_critter_current_weight_sfall sums item weights from proto.extra.weight', () => {
        // weight is in tenths of pounds: 50 → 5 lbs, 30 → 3 lbs
        const critter = makeObj({
            inventory: [
                { pro: { extra: { weight: 50 } }, amount: 1 },
                { pro: { extra: { weight: 30 } }, amount: 2 },
            ],
        })
        // 5 + 3*2 = 5 + 6 = 11
        expect(script.get_critter_current_weight_sfall(critter)).toBe(11)
    })

    it('get_critter_current_weight_sfall returns 0 for items without proto weight', () => {
        const critter = makeObj({
            inventory: [{ pid: 1, amount: 3 }],
        })
        expect(script.get_critter_current_weight_sfall(critter)).toBe(0)
    })
})

// ===========================================================================
// Phase 66-D — Checklist integrity
// ===========================================================================

describe('Phase 66-D — Checklist integrity', () => {
    const phase66Ids = [
        'car_fuel_persistence',
        'tile_contains_pid_obj_null_gmap',
        'sfall_get_object_name',
        'sfall_get_critter_gender',
        'sfall_get_combat_round',
        'sfall_get_critter_action_points',
        'sfall_set_critter_action_points',
        'sfall_get_critter_max_ap',
        'sfall_get_critter_carry_weight',
        'sfall_get_critter_current_weight',
    ]

    it('all Phase 66 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase66Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
