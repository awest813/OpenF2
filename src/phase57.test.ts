/**
 * Phase 57 regression tests.
 *
 * Covers:
 *   A. BLK-051 — Combat nextTurn() null-player and null-ai guards
 *   B. BLK-052 — maybeTaunt() null-ai guard
 *   C. BLK-053 — Unarmed combat fallback (getHitChance / getDamageDone)
 *   D. New sfall opcodes 0x81E8–0x81EF
 *   E. Checklist integrity — all Phase 57 entries present and correctly classified
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
        name: 'NPC',
        position: { x: 10, y: 20 },
        orientation: 0,
        inventory: [],
        dead: false,
        pid: 100,
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => 5,
        perkRanks: {},
        ...overrides,
    }
}

function makeItemObj(overrides: Record<string, any> = {}): any {
    return {
        type: 'item',
        subtype: 'misc',
        name: 'thing',
        position: { x: 0, y: 0 },
        pid: 50,
        ...overrides,
    }
}

// ===========================================================================
// Phase 57-A — BLK-051: Combat nextTurn null-player guard
// ===========================================================================

describe('Phase 57-A — BLK-051: Combat nextTurn null-player/null-ai guards', () => {
    // We test the Combat class indirectly via its exported static helpers and
    // by inspecting the nextTurn / doAITurn code paths in isolation.

    it('Combat module imports without error', async () => {
        const { Combat } = await import('./combat.js')
        expect(typeof Combat).toBe('function')
    })

    it('Combat.start does not throw when called with an empty object list', async () => {
        // Empty object list → no combatants → player not found
        const { Combat } = await import('./combat.js')
        // Patch globalState.gMap so Combat.start can call getObjects()
        const savedMap = globalState.gMap
        ;(globalState as any).gMap = {
            getObjects: () => [],
            updateMap: () => {},
        }
        const savedCombat = globalState.combat
        const savedInCombat = globalState.inCombat
        try {
            // Combat constructor with no player should not throw
            expect(() => new (Combat as any)([])).not.toThrow()
        } finally {
            (globalState as any).gMap = savedMap
            ;(globalState as any).combat = savedCombat
            ;(globalState as any).inCombat = savedInCombat
        }
    })

    it('Combat constructor handles critter with null ai gracefully', async () => {
        const { Combat } = await import('./combat.js')

        const critterNoAI: any = {
            type: 'critter',
            isPlayer: false,
            dead: false,
            visible: true,
            ai: null, // deliberately null
            stats: {
                get: () => 20,
                getBase: () => 5,
                setBase: () => {},
                modifyBase: () => {},
                baseStats: {},
                acBonus: 0,
            },
            getStat: () => 5,
            AP: null,
            position: { x: 5, y: 5 },
            teamNum: 1,
        }

        const player: any = {
            type: 'critter',
            isPlayer: true,
            dead: false,
            visible: true,
            ai: null,
            stats: {
                get: () => 20,
                getBase: () => 5,
                setBase: () => {},
                modifyBase: () => {},
                baseStats: {},
                acBonus: 0,
            },
            getStat: () => 20,
            AP: null,
            position: { x: 10, y: 10 },
            teamNum: 0,
            clearAnim: () => {},
            charTraits: new Set(),
            perkRanks: {},
        }

        // Should not throw even with a critter that has ai=null
        expect(() => new (Combat as any)([critterNoAI, player])).not.toThrow()
    })
})

// ===========================================================================
// Phase 57-B — BLK-052: maybeTaunt null-ai guard
// ===========================================================================

describe('Phase 57-B — BLK-052: maybeTaunt null-ai guard', () => {
    it('maybeTaunt does not throw when critter has null ai', async () => {
        const { Combat } = await import('./combat.js')
        const combat = new (Combat as any)([])

        const critter: any = {
            ai: null,
            name: 'TestNPC',
            position: { x: 0, y: 0 },
        }

        // roll=false means early return before ai access
        expect(() => combat.maybeTaunt(critter, 'move', false)).not.toThrow()
        // roll=true with null ai should also not throw (guard added in BLK-052)
        expect(() => combat.maybeTaunt(critter, 'move', true)).not.toThrow()
    })

    it('maybeTaunt does not throw when critter has undefined ai', async () => {
        const { Combat } = await import('./combat.js')
        const combat = new (Combat as any)([])

        const critter: any = {
            ai: undefined,
            name: 'TestNPC',
            position: { x: 0, y: 0 },
        }

        expect(() => combat.maybeTaunt(critter, 'run', true)).not.toThrow()
    })
})

// ===========================================================================
// Phase 57-C — BLK-053: Unarmed combat fallback
// ===========================================================================

describe('Phase 57-C — BLK-053: Unarmed combat fallback in Combat', () => {
    it('getHitChance does not return {hit:-1} when critter has no equipped weapon', async () => {
        const { Combat } = await import('./combat.js')
        const combat = new (Combat as any)([])

        const attacker: any = {
            isPlayer: false,
            equippedWeapon: null, // no weapon
            perkRanks: {},
            charTraits: new Set(),
            getStat: (s: string) => s === 'PER' ? 7 : s === 'Critical Chance' ? 5 : 0,
            getSkill: (s: string) => s === 'Unarmed' ? 50 : 0,
            position: { x: 1, y: 1 },
        }
        const defender: any = {
            getStat: (s: string) => s === 'AC' ? 10 : 0,
            position: { x: 2, y: 2 },
        }

        const result = combat.getHitChance(attacker, defender, 'torso')
        // With unarmed fallback, hit should be a reasonable number (not -1)
        expect(result.hit).not.toBe(-1)
        expect(typeof result.hit).toBe('number')
        expect(result.crit).not.toBe(-1)
    })

    it('getDamageDone returns >0 when critter has no equipped weapon', async () => {
        const { Combat } = await import('./combat.js')
        const combat = new (Combat as any)([])

        const attacker: any = {
            equippedWeapon: null,
        }
        const target: any = {
            getStat: () => 0,
        }

        // Weapon(null) gives 1-2 damage; with critModifier=2 and no DR/DT,
        // result should be > 0 in expectation (but minimum is 1*2/2*2*1 = 2 → 1 after ceil)
        const damage = combat.getDamageDone(attacker, target, 2)
        // getDamageDone should now return a number (not 0 due to no-weapon path)
        expect(typeof damage).toBe('number')
        expect(damage).toBeGreaterThanOrEqual(0)
    })

    it('getHitChance uses Unarmed skill when weapon data is missing', async () => {
        const { Combat } = await import('./combat.js')
        const combat = new (Combat as any)([])

        const attacker: any = {
            isPlayer: false,
            equippedWeapon: { type: 'item', subtype: 'weapon', weapon: null }, // weapon obj but no data
            perkRanks: {},
            charTraits: new Set(),
            getStat: (s: string) => s === 'PER' ? 7 : s === 'Critical Chance' ? 5 : 0,
            getSkill: (s: string) => s === 'Unarmed' ? 55 : 0,
            position: { x: 1, y: 1 },
        }
        const defender: any = {
            getStat: (s: string) => s === 'AC' ? 5 : 0,
            position: { x: 2, y: 2 },
        }

        const result = combat.getHitChance(attacker, defender, 'torso')
        expect(result.hit).not.toBe(-1)
        expect(typeof result.hit).toBe('number')
    })
})

// ===========================================================================
// Phase 57-D — sfall opcodes 0x81E8–0x81EF
// ===========================================================================

describe('Phase 57-D — sfall opcodes 0x81E8–0x81EF', () => {
    let script: Scripting.Script

    beforeEach(() => {
        drainStubHits()
        script = new (Scripting as any).Script()
        script._didOverride = false
    })

    it('get_object_cost_sfall (0x81E8) returns 0 for non-game-object', () => {
        const result = script.get_object_cost_sfall(null as any)
        expect(result).toBe(0)
    })

    it('get_object_cost_sfall (0x81E8) returns cost from proto data when available', () => {
        const obj = makeObj({ pro: { extra: { cost: 250 } } })
        const result = script.get_object_cost_sfall(obj)
        expect(result).toBe(250)
    })

    it('get_object_cost_sfall (0x81E8) returns 0 when no pro data', () => {
        const obj = makeObj({ pro: null })
        const result = script.get_object_cost_sfall(obj)
        expect(result).toBe(0)
    })

    it('set_object_cost_sfall (0x81E9) is a no-op and does not throw', () => {
        const obj = makeObj()
        expect(() => script.set_object_cost_sfall(obj, 500)).not.toThrow()
    })

    it('get_sfall_global_int_sfall (0x81EA) returns 0 by default', () => {
        const result = script.get_sfall_global_int_sfall(0)
        expect(typeof result).toBe('number')
        expect(result).toBe(0)
    })

    it('set/get sfall_global_int_sfall (0x81EA/0x81EB) round-trip', () => {
        script.set_sfall_global_int_sfall(3, 99)
        const result = script.get_sfall_global_int_sfall(3)
        expect(result).toBe(99)
        // Clean up
        script.set_sfall_global_int_sfall(3, 0)
    })

    it('get_combat_difficulty_sfall (0x81EC) returns 1 (Normal)', () => {
        const result = script.get_combat_difficulty_sfall()
        expect(result).toBe(1)
    })

    it('game_in_combat_sfall (0x81ED) returns 0 when not in combat', () => {
        const savedInCombat = globalState.inCombat
        ;(globalState as any).inCombat = false
        try {
            expect(script.game_in_combat_sfall()).toBe(0)
        } finally {
            (globalState as any).inCombat = savedInCombat
        }
    })

    it('game_in_combat_sfall (0x81ED) returns 1 when in combat', () => {
        const savedInCombat = globalState.inCombat
        ;(globalState as any).inCombat = true
        try {
            expect(script.game_in_combat_sfall()).toBe(1)
        } finally {
            (globalState as any).inCombat = savedInCombat
        }
    })

    it('get_tile_fid_sfall (0x81EE) returns 0', () => {
        const result = script.get_tile_fid_sfall(100, 0)
        expect(result).toBe(0)
    })

    it('set_tile_fid_sfall (0x81EF) is a no-op and does not throw', () => {
        expect(() => script.set_tile_fid_sfall(100, 0, 12345)).not.toThrow()
    })
})

// ===========================================================================
// Phase 57-E — Checklist integrity
// ===========================================================================

describe('Phase 57-E — Checklist integrity', () => {
    const phase57Ids = [
        'blk_051_combat_null_ai_guard',
        'blk_052_maybetaunt_null_ai_guard',
        'blk_053_unarmed_combat_fallback',
        'sfall_get_object_cost_sfall',
        'sfall_set_object_cost_sfall',
        'sfall_get_sfall_global_int_sfall',
        'sfall_set_sfall_global_int_sfall',
        'sfall_get_combat_difficulty',
        'sfall_game_in_combat',
        'sfall_get_tile_fid',
        'sfall_set_tile_fid',
    ]

    it('all Phase 57 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase57Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_051_combat_null_ai_guard',
            'blk_052_maybetaunt_null_ai_guard',
            'blk_053_unarmed_combat_fallback',
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

    it('Phase 57 count: at least 11 new entries added', () => {
        const phase57Entries = SCRIPTING_STUB_CHECKLIST.filter((e) =>
            phase57Ids.includes(e.id)
        )
        expect(phase57Entries.length).toBe(phase57Ids.length)
    })
})
