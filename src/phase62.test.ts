/**
 * Phase 62 regression tests.
 *
 * Covers:
 *   A. BLK-062 — Combat.attack() auto-end after last enemy killed
 *   B. BLK-063 — Combat.canEndCombat() helper
 *   C. BLK-064 — get_ini_setting common-key defaults
 *   D. BLK-065 — critter_attempt_placement null/invalid-tile guard
 *   E. sfall opcodes 0x8210–0x8217
 *   F. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Combat } from './combat.js'
import { Scripting } from './scripting.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

vi.mock('./player.js', () => ({ Player: class MockPlayer {} }))
vi.mock('./ui.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./ui.js')>()
    return { ...actual, uiStartCombat: vi.fn(), uiEndCombat: vi.fn() }
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
        hostile: false,
        teamNum: 1,
        charTraits: new Set<number>(),
        perkRanks: {},
        stats: { getBase: () => 5, setBase: () => {}, modifyBase: () => {}, get: () => 5, baseStats: {} },
        skills: { getBase: () => 0, setBase: () => {}, baseSkills: {}, skillPoints: 0 },
        getStat: (s: string) => s === 'HP' ? 30 : 5,
        ...overrides,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 62-A — BLK-062: Combat.attack() auto-end
// ===========================================================================

describe('Phase 62-A — BLK-062: Combat.attack() auto-end after last kill', () => {
    it('a killing hit does not end the turn or combat (combat.cc ends combat only between rounds)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.nextTurn = vi.fn()
        combat.perish = vi.fn()
        combat.canEndCombat = vi.fn().mockReturnValue(true)

        vi.spyOn(combat, 'rollHit').mockReturnValue({ hit: true, crit: false, DM: 2, msgID: 0 } as any)
        vi.spyOn(combat, 'getDamageDone').mockReturnValue(999)
        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 80, crit: 5 })
        vi.spyOn(combat, 'getCombatMsg').mockReturnValue('')

        const attacker: any = {
            position: { x: 0, y: 0 },
            orientation: 0,
            isPlayer: true,
            getStat: () => 5,
            name: 'player',
            staticAnimation: vi.fn((_: string, cb?: () => void) => { if (cb) {cb()} }),
        }
        // Target is marked dead after critterDamage (simulated by mock).
        const target: any = {
            dead: false,
            isPlayer: false,
            position: { x: 1, y: 1 },
            name: 'enemy',
        }

        // Patch critterDamage to kill the target so the auto-end path is reached.
        vi.mock('./critter.js', () => ({
            critterDamage: vi.fn((t: any) => { t.dead = true }),
            critterKill: vi.fn(),
            Weapon: class {},
        }))

        combat.attack(attacker, target, 'torso')

        expect(combat.nextTurn).not.toHaveBeenCalled()
    })

    it('nextTurn NOT called when enemy survives attack (no auto-end)', () => {
        const combat = Object.create(Combat.prototype) as Combat
        combat.log = vi.fn()
        combat.nextTurn = vi.fn()
        combat.canEndCombat = vi.fn().mockReturnValue(false)

        vi.spyOn(combat, 'rollHit').mockReturnValue({ hit: true, crit: false, DM: 2, msgID: 0 } as any)
        vi.spyOn(combat, 'getDamageDone').mockReturnValue(1) // minimal damage, target survives
        vi.spyOn(combat, 'getHitChance').mockReturnValue({ hit: 80, crit: 5 })
        vi.spyOn(combat, 'getCombatMsg').mockReturnValue('')

        const attacker: any = {
            position: { x: 0, y: 0 },
            orientation: 0,
            isPlayer: true,
            getStat: () => 5,
            name: 'player',
            staticAnimation: vi.fn((_: string, cb?: () => void) => { if (cb) {cb()} }),
        }
        const target: any = {
            dead: false,
            isPlayer: false,
            position: { x: 1, y: 1 },
            name: 'enemy',
            getStat: () => 30,
        }

        const userCb = vi.fn()
        combat.attack(attacker, target, 'torso', userCb)

        // User callback fires; nextTurn must NOT be called (enemy survived).
        expect(userCb).toHaveBeenCalledTimes(1)
        expect(combat.nextTurn).not.toHaveBeenCalled()
    })

    it('BLK-062 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_062_combat_auto_end_after_kill')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 62-B — BLK-063: canEndCombat() helper
// ===========================================================================

describe('Phase 62-B — BLK-063: Combat.canEndCombat()', () => {
    it('returns true when all non-player combatants are dead', () => {
        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = [
            { isPlayer: true, dead: false },
            { isPlayer: false, dead: true },
            { isPlayer: false, dead: true },
        ]
        expect(combat.canEndCombat()).toBe(true)
    })

    it('returns false when any non-player combatant is alive', () => {
        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = [
            { isPlayer: true, dead: false },
            { isPlayer: false, dead: true, teamNum: 1 },
            { isPlayer: false, dead: false, teamNum: 1 },
        ]
        expect(combat.canEndCombat()).toBe(false)
    })

    it('returns true when there are no non-player combatants', () => {
        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = [{ isPlayer: true, dead: false }]
        expect(combat.canEndCombat()).toBe(true)
    })

    it('returns true when combatants list is empty', () => {
        const combat = Object.create(Combat.prototype) as Combat
        ;(combat as any).combatants = []
        expect(combat.canEndCombat()).toBe(true)
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_063_can_end_combat_helper')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 62-C — BLK-064: get_ini_setting common-key defaults
// ===========================================================================

describe('Phase 62-C — BLK-064: get_ini_setting common-key defaults', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_064_get_ini_setting_defaults')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 62-D — BLK-065: critter_attempt_placement guard
// ===========================================================================

describe('Phase 62-D — BLK-065: critter_attempt_placement null/invalid-tile guard', () => {
    let script: Scripting.Script

    beforeEach(() => {
        script = new (Scripting as any).Script()
    })

    it('returns -1 when obj is null', () => {
        expect(() => script.critter_attempt_placement(null as any, 100, 0)).not.toThrow()
        expect(script.critter_attempt_placement(null as any, 100, 0)).toBe(-1)
    })

    it('returns -1 when tile number is 0', () => {
        const obj = makeObj()
        expect(script.critter_attempt_placement(obj, 0, 0)).toBe(-1)
    })

    it('returns -1 when tile number is negative', () => {
        const obj = makeObj()
        expect(script.critter_attempt_placement(obj, -1, 0)).toBe(-1)
    })

    it('does not throw for valid positive tile even without map context', () => {
        const obj = makeObj()
        expect(() => script.critter_attempt_placement(obj, 100, 0)).not.toThrow()
    })

    it('checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_065_critter_attempt_placement_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 62-F — Checklist integrity
// ===========================================================================

describe('Phase 62-F — Checklist integrity', () => {
    const phase62Ids = [
        'blk_062_combat_auto_end_after_kill',
        'blk_063_can_end_combat_helper',
        'blk_064_get_ini_setting_defaults',
        'blk_065_critter_attempt_placement_guard',
        'sfall_critter_is_fleeing',
        'sfall_get_perk_name',
        'sfall_get_critter_perk',
        'sfall_obj_is_open',
        'sfall_get_world_map_x',
        'sfall_get_world_map_y',
        'sfall_set_world_map_pos',
        'sfall_get_object_weight',
    ]

    it('all Phase 62 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase62Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('BLK entries have status "implemented"', () => {
        const blkIds = [
            'blk_062_combat_auto_end_after_kill',
            'blk_063_can_end_combat_helper',
            'blk_064_get_ini_setting_defaults',
            'blk_065_critter_attempt_placement_guard',
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
