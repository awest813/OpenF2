/**
 * Phase 65 regression tests.
 *
 * Covers:
 *   A. sfall opcodes 0x8228–0x822F (critter name, car fuel, AI packet, attack weapon, tile pid)
 *   B. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

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
// Phase 65-A — sfall opcodes 0x8228–0x822F
// ===========================================================================

describe('Phase 65-A — sfall opcodes 0x8228–0x822F', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    // ---- 0x8228 get_critter_name_sfall ----
    it('get_critter_name_sfall returns empty string for null', () => {
        expect(script.get_critter_name_sfall(null as any)).toBe('')
    })

    it('get_critter_name_sfall returns critter name', () => {
        const critter = makeObj({ name: 'Sulik' })
        expect(script.get_critter_name_sfall(critter)).toBe('Sulik')
    })

    it('get_critter_name_sfall returns empty string when name is absent', () => {
        const critter = makeObj({ name: undefined })
        expect(script.get_critter_name_sfall(critter)).toBe('')
    })

    // ---- 0x8229 get_car_fuel_amount_sfall ----
    it('get_car_fuel_amount_sfall returns 0 by default', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = (gs as any).carFuel
        delete (gs as any).carFuel
        expect(script.get_car_fuel_amount_sfall()).toBe(0)
        ;(gs as any).carFuel = orig
    })

    it('get_car_fuel_amount_sfall returns stored fuel level', async () => {
        const gs = (await import('./globalState.js')).default
        ;(gs as any).carFuel = 5000
        expect(script.get_car_fuel_amount_sfall()).toBe(5000)
        delete (gs as any).carFuel
    })

    // ---- 0x822A set_car_fuel_amount_sfall ----
    it('set_car_fuel_amount_sfall stores fuel level', async () => {
        const gs = (await import('./globalState.js')).default
        script.set_car_fuel_amount_sfall(10000)
        expect((gs as any).carFuel).toBe(10000)
        delete (gs as any).carFuel
    })

    it('set_car_fuel_amount_sfall clamps at 80000', async () => {
        const gs = (await import('./globalState.js')).default
        script.set_car_fuel_amount_sfall(999999)
        expect((gs as any).carFuel).toBe(80000)
        delete (gs as any).carFuel
    })

    it('set_car_fuel_amount_sfall clamps at 0', async () => {
        const gs = (await import('./globalState.js')).default
        script.set_car_fuel_amount_sfall(-100)
        expect((gs as any).carFuel).toBe(0)
        delete (gs as any).carFuel
    })

    // ---- 0x822B get_critter_ai_packet_sfall ----
    it('get_critter_ai_packet_sfall returns -1 for null', () => {
        expect(script.get_critter_ai_packet_sfall(null as any)).toBe(-1)
    })

    it('get_critter_ai_packet_sfall returns 0 when aiPacket is absent', () => {
        const critter = makeObj()
        expect(script.get_critter_ai_packet_sfall(critter)).toBe(0)
    })

    it('get_critter_ai_packet_sfall returns aiPacket from critter', () => {
        const critter = makeObj({ aiPacket: 7 })
        expect(script.get_critter_ai_packet_sfall(critter)).toBe(7)
    })

    it('get_critter_ai_packet_sfall reads from proto.extra.aiPacket as fallback', () => {
        const critter = makeObj({ pro: { extra: { aiPacket: 12 } } })
        expect(script.get_critter_ai_packet_sfall(critter)).toBe(12)
    })

    // ---- 0x822C set_critter_ai_packet_sfall ----
    it('set_critter_ai_packet_sfall does not throw for null', () => {
        expect(() => script.set_critter_ai_packet_sfall(null as any, 5)).not.toThrow()
    })

    it('set_critter_ai_packet_sfall sets aiPacket on critter', () => {
        const critter = makeObj()
        script.set_critter_ai_packet_sfall(critter, 3)
        expect(critter.aiPacket).toBe(3)
    })

    it('set_critter_ai_packet_sfall is readable back via get_critter_ai_packet_sfall', () => {
        const critter = makeObj()
        script.set_critter_ai_packet_sfall(critter, 9)
        expect(script.get_critter_ai_packet_sfall(critter)).toBe(9)
    })

    // ---- 0x822D obj_under_cursor_sfall ----
    it('obj_under_cursor_sfall returns 0 (no cursor in browser)', () => {
        expect(script.obj_under_cursor_sfall()).toBe(0)
    })

    // ---- 0x822E get_attack_weapon_sfall ----
    it('get_attack_weapon_sfall returns 0 for null', () => {
        expect(script.get_attack_weapon_sfall(null as any, 0)).toBe(0)
    })

    it('get_attack_weapon_sfall returns 0 when no weapon equipped', () => {
        const critter = makeObj()
        expect(script.get_attack_weapon_sfall(critter, 0)).toBe(0)
        expect(script.get_attack_weapon_sfall(critter, 1)).toBe(0)
    })

    it('get_attack_weapon_sfall returns rightHand for attackType=0', () => {
        const weapon = { pid: 55 }
        const critter = makeObj({ rightHand: weapon })
        expect(script.get_attack_weapon_sfall(critter, 0)).toBe(weapon)
    })

    it('get_attack_weapon_sfall returns leftHand for attackType=1', () => {
        const weapon = { pid: 66 }
        const critter = makeObj({ leftHand: weapon })
        expect(script.get_attack_weapon_sfall(critter, 1)).toBe(weapon)
    })

    it('get_attack_weapon_sfall returns 0 for unknown attackType', () => {
        const critter = makeObj({ rightHand: { pid: 1 } })
        expect(script.get_attack_weapon_sfall(critter, 99)).toBe(0)
    })

    // ---- 0x822F get_tile_pid_at_sfall ----
    it('get_tile_pid_at_sfall returns 0 when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const orig = gs.gMap
        ;(gs as any).gMap = null
        expect(script.get_tile_pid_at_sfall(100, 0)).toBe(0)
        gs.gMap = orig
    })

    it('get_tile_pid_at_sfall returns 0 for invalid tile number', async () => {
        expect(script.get_tile_pid_at_sfall(-1, 0)).toBe(0)
    })
})

// ===========================================================================
// Phase 65-B — Checklist integrity
// ===========================================================================

describe('Phase 65-B — Checklist integrity', () => {
    const phase65Ids = [
        'sfall_get_critter_name',
        'sfall_get_car_fuel_amount',
        'sfall_set_car_fuel_amount',
        'sfall_get_critter_ai_packet',
        'sfall_set_critter_ai_packet',
        'sfall_obj_under_cursor',
        'sfall_get_attack_weapon',
        'sfall_get_tile_pid_at',
    ]

    it('all Phase 65 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase65Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
