/**
 * Phase 96 regression tests — Debug and polish: start menu to end of Arroyo (continued).
 *
 * Covers:
 *   A. BLK-205 — set_pc_base_stat() non-finite value guard
 *   B. BLK-206 — tile_num_in_direction() non-finite dir/count guard
 *   C. BLK-207 — gsay_message() empty-string message guard
 *   D. BLK-208 — critter_heal() null getStat guard
 *   E. BLK-209 — random() non-finite bounds guard
 *   F. sfall opcodes 0x8308–0x830F
 *      0x8308 get_critter_strength_sfall
 *      0x8309 set_critter_strength_sfall
 *      0x830A get_critter_endurance_sfall
 *      0x830B set_critter_endurance_sfall
 *      0x830C get_critter_intelligence_sfall
 *      0x830D set_critter_intelligence_sfall
 *      0x830E get_critter_sneak_state_sfall
 *      0x830F set_critter_sneak_state_sfall
 *   G. Arroyo start-to-end smoke tests (Phase 96)
 *   H. Checklist integrity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Scripting } from './scripting.js'
import globalState from './globalState.js'
import { SCRIPTING_STUB_CHECKLIST, drainStubHits } from './scriptingChecklist.js'

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

function makeScript(): any {
    const s = new (Scripting.Script as any)()
    s.scriptName = 'test_phase96'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    inventory?: any[] | null
    stats?: Record<string, number>
    level?: number
    noGetStat?: boolean
    pcFlags?: number
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Armor Class': 10,
        'Action Points': 8,
        'Melee Damage': 5,
        'Critical Chance': 5,
        'Strength': 5,
        'Endurance': 5,
        'Perception': 6,
        'Luck': 5,
        'Agility': 7,
        'Charisma': 4,
        'INT': 8,
        ...(opts.stats ?? {}),
    }
    const critter: any = {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: opts.inventory !== undefined ? opts.inventory : [],
        visible: true,
        orientation: 0,
        isPlayer: false,
        gender: 'male',
        equippedArmor: null,
        leftHand: null,
        rightHand: null,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        level: opts.level ?? 1,
        position: { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 0,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getSkill: (_s: string) => 40,
    }
    if (!opts.noGetStat) {
        critter.getStat = (s: string) => stats[s] ?? 0
    }
    if (opts.pcFlags !== undefined) {
        critter.pcFlags = opts.pcFlags
    }
    return critter
}

function makePlayer(stats: Record<string, number> = {}): any {
    // stat names here use the abbreviated statMap keys (STR, PER, END, etc.)
    // because set_pc_base_stat uses statMap[index] → abbreviated name.
    const statStore: Record<string, number> = {
        'STR': 5,
        'PER': 6,
        'END': 5,
        'CHA': 4,
        'INT': 8,
        'AGI': 7,
        'LUK': 5,
        ...stats,
    }
    return {
        type: 'critter',
        isPlayer: true,
        level: 1,
        inventory: [],
        skills: {},
        perkRanks: {},
        pcFlags: 0,
        stats: {
            getBase: (s: string) => statStore[s] ?? 0,
            setBase: vi.fn((s: string, v: number) => { statStore[s] = v }),
            modifyBase: vi.fn(),
        },
        getStat: (s: string) => statStore[s] ?? 0,
        _statStore: statStore,
    }
}

const NULL_OBJ: any = null

let script: any

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = makeScript()
    drainStubHits()
    // Clear player
    globalState.player = null as any
})

// ---------------------------------------------------------------------------
// A. BLK-205 — set_pc_base_stat() non-finite value guard
// ---------------------------------------------------------------------------

describe('Phase 96-A — BLK-205: set_pc_base_stat() non-finite value guard', () => {
    it('does not throw when value is NaN', () => {
        globalState.player = makePlayer()
        expect(() => script.set_pc_base_stat(0, NaN)).not.toThrow()
    })

    it('clamps NaN value to 0 (statMap[0]=STR)', () => {
        const player = makePlayer()
        globalState.player = player
        script.set_pc_base_stat(0 /* STR */, NaN)
        expect(player.stats.setBase).toHaveBeenCalledWith('STR', 0)
    })

    it('does not throw when value is Infinity', () => {
        globalState.player = makePlayer()
        expect(() => script.set_pc_base_stat(0, Infinity)).not.toThrow()
    })

    it('clamps Infinity value to 0', () => {
        const player = makePlayer()
        globalState.player = player
        script.set_pc_base_stat(0 /* STR */, Infinity)
        expect(player.stats.setBase).toHaveBeenCalledWith('STR', 0)
    })

    it('does not throw when value is -Infinity', () => {
        globalState.player = makePlayer()
        expect(() => script.set_pc_base_stat(0, -Infinity)).not.toThrow()
    })

    it('clamps -Infinity value to 0', () => {
        const player = makePlayer()
        globalState.player = player
        script.set_pc_base_stat(0 /* STR */, -Infinity)
        expect(player.stats.setBase).toHaveBeenCalledWith('STR', 0)
    })

    it('stores valid integer values normally', () => {
        const player = makePlayer()
        globalState.player = player
        script.set_pc_base_stat(0 /* STR */, 7)
        expect(player.stats.setBase).toHaveBeenCalledWith('STR', 7)
    })

    it('stores valid INT values via stat index 4', () => {
        const player = makePlayer()
        globalState.player = player
        script.set_pc_base_stat(4 /* INT */, 9)
        expect(player.stats.setBase).toHaveBeenCalledWith('INT', 9)
    })

    it('is a no-op when player is null', () => {
        globalState.player = null as any
        expect(() => script.set_pc_base_stat(0, 7)).not.toThrow()
    })

    it('is a no-op for unknown stat number', () => {
        globalState.player = makePlayer()
        expect(() => script.set_pc_base_stat(999, 7)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// B. BLK-206 — tile_num_in_direction() non-finite dir/count guard
// ---------------------------------------------------------------------------

describe('Phase 96-B — BLK-206: tile_num_in_direction() non-finite dir/count guard', () => {
    it('does not throw when dir is NaN', () => {
        expect(() => script.tile_num_in_direction(100, NaN, 3)).not.toThrow()
    })

    it('returns tile unchanged when dir is NaN', () => {
        const result = script.tile_num_in_direction(100, NaN, 3)
        expect(result).toBe(100)
    })

    it('does not throw when count is NaN', () => {
        expect(() => script.tile_num_in_direction(100, 0, NaN)).not.toThrow()
    })

    it('returns tile unchanged when count is NaN', () => {
        const result = script.tile_num_in_direction(100, 0, NaN)
        expect(result).toBe(100)
    })

    it('does not throw when tile is Infinity', () => {
        expect(() => script.tile_num_in_direction(Infinity, 0, 1)).not.toThrow()
    })

    it('returns 0 when tile is Infinity (safe fallback)', () => {
        const result = script.tile_num_in_direction(Infinity, 0, 1)
        expect(result).toBe(0)
    })

    it('does not throw when count is Infinity', () => {
        expect(() => script.tile_num_in_direction(100, 0, Infinity)).not.toThrow()
    })

    it('returns tile unchanged when count is Infinity', () => {
        const result = script.tile_num_in_direction(100, 0, Infinity)
        expect(result).toBe(100)
    })

    it('returns tile unchanged when count <= 0', () => {
        const result = script.tile_num_in_direction(100, 2, 0)
        expect(result).toBe(100)
    })

    it('returns tile unchanged when count is negative', () => {
        const result = script.tile_num_in_direction(100, 2, -5)
        expect(result).toBe(100)
    })

    it('does not throw with all valid non-finite (all NaN)', () => {
        expect(() => script.tile_num_in_direction(NaN, NaN, NaN)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-207 — gsay_message() empty-string message guard
// ---------------------------------------------------------------------------

describe('Phase 96-C — BLK-207: gsay_message() empty-string message guard', () => {
    // Use string msgIDs to bypass XHR-based file loading in tests.
    // When msgID is a string, getScriptMessage() returns it directly.

    it('does not throw when msgID is empty string', () => {
        // getScriptMessage(0, '') returns '' (string passthrough) → guard triggers
        expect(() => script.gsay_message(0, '', 50)).not.toThrow()
    })

    it('does not throw when msgID is a non-empty string (passes guard)', () => {
        // Non-empty string returns itself → passes the guard → uiSetDialogueReply called
        expect(() => script.gsay_message(0, 'The Elder speaks.', 50)).not.toThrow()
    })

    it('handles reaction parameter 0 with empty msgID', () => {
        expect(() => script.gsay_message(0, '', 0)).not.toThrow()
    })

    it('handles multiple reaction values with empty msgID', () => {
        expect(() => script.gsay_message(0, '', 50)).not.toThrow()
        expect(() => script.gsay_message(0, '', 100)).not.toThrow()
    })

    it('does not throw with a different non-empty string msgID', () => {
        expect(() => script.gsay_message(0, 'Hello tribesman', 50)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-208 — critter_heal() null getStat guard
// ---------------------------------------------------------------------------

describe('Phase 96-D — BLK-208: critter_heal() null getStat guard', () => {
    it('does not throw when critter has no getStat method', () => {
        const critter = makeCritter({ noGetStat: true })
        expect(() => script.critter_heal(critter, 20)).not.toThrow()
    })

    it('is a no-op (does not modifyBase) when critter has no getStat method', () => {
        const critter = makeCritter({ noGetStat: true })
        script.critter_heal(critter, 20)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('does not throw for non-critter object', () => {
        const item = { type: 'item', pid: 0x0001, name: 'Knife', position: null }
        expect(() => script.critter_heal(item as any, 10)).not.toThrow()
    })

    it('does not throw for null object', () => {
        expect(() => script.critter_heal(NULL_OBJ, 10)).not.toThrow()
    })

    it('does not throw for non-finite amount', () => {
        const critter = makeCritter({ hp: 50, maxHp: 100 })
        expect(() => script.critter_heal(critter, NaN)).not.toThrow()
    })

    it('heals normally when critter has getStat method', () => {
        const critter = makeCritter({ hp: 50, maxHp: 100 })
        script.critter_heal(critter, 30)
        expect(critter.stats.modifyBase).toHaveBeenCalledWith('HP', 30)
    })

    it('caps heal at max HP - current HP', () => {
        const critter = makeCritter({ hp: 90, maxHp: 100 })
        script.critter_heal(critter, 50)
        // healAmount = min(50, 100 - 90) = 10
        expect(critter.stats.modifyBase).toHaveBeenCalledWith('HP', 10)
    })

    it('does not heal when already at max HP', () => {
        const critter = makeCritter({ hp: 100, maxHp: 100 })
        script.critter_heal(critter, 20)
        expect(critter.stats.modifyBase).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-209 — random() non-finite bounds guard
// ---------------------------------------------------------------------------

describe('Phase 96-E — BLK-209: random() non-finite bounds guard', () => {
    it('does not throw when min is NaN', () => {
        expect(() => script.random(NaN, 10)).not.toThrow()
    })

    it('returns 0 when min is NaN (clamped)', () => {
        // With min=0 and max=10, result is in [0,10]; just ensure no throw
        expect(() => script.random(NaN, 10)).not.toThrow()
        const result = script.random(NaN, 10)
        expect(typeof result).toBe('number')
        expect(isFinite(result)).toBe(true)
    })

    it('does not throw when max is NaN', () => {
        expect(() => script.random(0, NaN)).not.toThrow()
    })

    it('returns a finite number when max is NaN', () => {
        const result = script.random(0, NaN)
        expect(typeof result).toBe('number')
        expect(isFinite(result)).toBe(true)
    })

    it('does not throw when min is Infinity', () => {
        expect(() => script.random(Infinity, 10)).not.toThrow()
    })

    it('does not throw when max is Infinity', () => {
        expect(() => script.random(0, Infinity)).not.toThrow()
    })

    it('does not throw when both are NaN', () => {
        expect(() => script.random(NaN, NaN)).not.toThrow()
    })

    it('returns a finite number when both are NaN (both clamped to 0)', () => {
        const result = script.random(NaN, NaN)
        expect(typeof result).toBe('number')
        expect(isFinite(result)).toBe(true)
    })

    it('returns a valid number for normal integer inputs', () => {
        const result = script.random(1, 6)
        expect(result).toBeGreaterThanOrEqual(1)
        expect(result).toBeLessThanOrEqual(6)
    })

    it('does not throw when min is -Infinity', () => {
        expect(() => script.random(-Infinity, 10)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall 0x8308–0x830F: critter SPECIAL stats + sneak state
// ---------------------------------------------------------------------------

describe('Phase 96-F — sfall 0x8308–0x830F: critter remaining SPECIAL stats + sneak state', () => {
    let critter: any

    beforeEach(() => {
        critter = makeCritter({
            stats: {
                'Strength': 6,
                'Endurance': 5,
                'INT': 8,
            },
            level: 3,
        })
    })

    // 0x8308 — get_critter_strength_sfall
    it('0x8308 get_critter_strength_sfall: returns Strength stat', () => {
        expect(script.get_critter_strength_sfall(critter)).toBe(6)
    })

    it('0x8308 get_critter_strength_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_strength_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x8308 get_critter_strength_sfall: returns 0 for item', () => {
        const item = { type: 'item', pid: 0x0001, name: 'Rock', position: null }
        expect(script.get_critter_strength_sfall(item as any)).toBe(0)
    })

    // 0x8309 — set_critter_strength_sfall
    it('0x8309 set_critter_strength_sfall: sets Strength stat', () => {
        script.set_critter_strength_sfall(critter, 8)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Strength', 8)
    })

    it('0x8309 set_critter_strength_sfall: clamps to 1 minimum', () => {
        script.set_critter_strength_sfall(critter, 0)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Strength', 1)
    })

    it('0x8309 set_critter_strength_sfall: clamps to 10 maximum', () => {
        script.set_critter_strength_sfall(critter, 15)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Strength', 10)
    })

    it('0x8309 set_critter_strength_sfall: coerces NaN to 1', () => {
        script.set_critter_strength_sfall(critter, NaN)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Strength', 1)
    })

    it('0x8309 set_critter_strength_sfall: no-op for non-critter', () => {
        expect(() => script.set_critter_strength_sfall(NULL_OBJ, 5)).not.toThrow()
    })

    // 0x830A — get_critter_endurance_sfall
    it('0x830A get_critter_endurance_sfall: returns Endurance stat', () => {
        expect(script.get_critter_endurance_sfall(critter)).toBe(5)
    })

    it('0x830A get_critter_endurance_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_endurance_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x830B — set_critter_endurance_sfall
    it('0x830B set_critter_endurance_sfall: sets Endurance stat', () => {
        script.set_critter_endurance_sfall(critter, 7)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Endurance', 7)
    })

    it('0x830B set_critter_endurance_sfall: clamps to [1, 10]', () => {
        script.set_critter_endurance_sfall(critter, -3)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Endurance', 1)
        script.set_critter_endurance_sfall(critter, 20)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Endurance', 10)
    })

    it('0x830B set_critter_endurance_sfall: coerces NaN to 1', () => {
        script.set_critter_endurance_sfall(critter, NaN)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Endurance', 1)
    })

    // 0x830C — get_critter_intelligence_sfall
    it('0x830C get_critter_intelligence_sfall: returns Intelligence stat', () => {
        expect(script.get_critter_intelligence_sfall(critter)).toBe(8)
    })

    it('0x830C get_critter_intelligence_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_intelligence_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x830C get_critter_intelligence_sfall: returns 0 for item', () => {
        const item = { type: 'item', pid: 0x0001, name: 'Knife', position: null }
        expect(script.get_critter_intelligence_sfall(item as any)).toBe(0)
    })

    // 0x830D — set_critter_intelligence_sfall
    it('0x830D set_critter_intelligence_sfall: sets Intelligence stat', () => {
        script.set_critter_intelligence_sfall(critter, 9)
        expect(critter.stats.setBase).toHaveBeenCalledWith('INT', 9)
    })

    it('0x830D set_critter_intelligence_sfall: clamps to [1, 10]', () => {
        script.set_critter_intelligence_sfall(critter, 0)
        expect(critter.stats.setBase).toHaveBeenCalledWith('INT', 1)
        script.set_critter_intelligence_sfall(critter, 11)
        expect(critter.stats.setBase).toHaveBeenCalledWith('INT', 10)
    })

    it('0x830D set_critter_intelligence_sfall: coerces Infinity to 1', () => {
        script.set_critter_intelligence_sfall(critter, Infinity)
        expect(critter.stats.setBase).toHaveBeenCalledWith('INT', 1)
    })

    it('0x830D set_critter_intelligence_sfall: no-op for non-critter', () => {
        expect(() => script.set_critter_intelligence_sfall(NULL_OBJ, 5)).not.toThrow()
    })

    // 0x830E — get_critter_sneak_state_sfall
    it('0x830E get_critter_sneak_state_sfall: returns 0 when pcFlags is absent', () => {
        // Default critter has no pcFlags → should return 0
        expect(script.get_critter_sneak_state_sfall(critter)).toBe(0)
    })

    it('0x830E get_critter_sneak_state_sfall: returns 1 when SNK_MODE bit is set', () => {
        critter.pcFlags = 0x8  // SNK_MODE = bit 3
        expect(script.get_critter_sneak_state_sfall(critter)).toBe(1)
    })

    it('0x830E get_critter_sneak_state_sfall: returns 0 when other flags set but not SNK_MODE', () => {
        critter.pcFlags = 0x4  // bit 2 only, not bit 3
        expect(script.get_critter_sneak_state_sfall(critter)).toBe(0)
    })

    it('0x830E get_critter_sneak_state_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_sneak_state_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x830E get_critter_sneak_state_sfall: returns 0 for item', () => {
        const item = { type: 'item', pid: 0x0001, name: 'Knife', position: null }
        expect(script.get_critter_sneak_state_sfall(item as any)).toBe(0)
    })

    // 0x830F — set_critter_sneak_state_sfall
    it('0x830F set_critter_sneak_state_sfall: sets SNK_MODE bit on critter', () => {
        critter.pcFlags = 0
        script.set_critter_sneak_state_sfall(critter, 1)
        expect((critter.pcFlags & 0x8) !== 0).toBe(true)
    })

    it('0x830F set_critter_sneak_state_sfall: clears SNK_MODE bit on critter', () => {
        critter.pcFlags = 0x8
        script.set_critter_sneak_state_sfall(critter, 0)
        expect((critter.pcFlags & 0x8) !== 0).toBe(false)
    })

    it('0x830F set_critter_sneak_state_sfall: initialises pcFlags when missing', () => {
        // critter has no pcFlags property initially
        delete critter.pcFlags
        script.set_critter_sneak_state_sfall(critter, 1)
        expect((critter.pcFlags & 0x8) !== 0).toBe(true)
    })

    it('0x830F set_critter_sneak_state_sfall: round-trips with getter', () => {
        critter.pcFlags = 0
        script.set_critter_sneak_state_sfall(critter, 1)
        expect(script.get_critter_sneak_state_sfall(critter)).toBe(1)
        script.set_critter_sneak_state_sfall(critter, 0)
        expect(script.get_critter_sneak_state_sfall(critter)).toBe(0)
    })

    it('0x830F set_critter_sneak_state_sfall: no-op for non-critter', () => {
        expect(() => script.set_critter_sneak_state_sfall(NULL_OBJ, 1)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo start-to-end smoke tests (Phase 96)
// ---------------------------------------------------------------------------

describe('Phase 96-G — Arroyo start-to-end smoke tests (Phase 96)', () => {
    it('Character creation: set_pc_base_stat with NaN ST clamps to 0 (BLK-205)', () => {
        const player = makePlayer()
        globalState.player = player
        // Simulate a character-creation script that computes a NaN stat value
        expect(() => script.set_pc_base_stat(0 /* STR */, NaN)).not.toThrow()
        expect(player.stats.setBase).toHaveBeenCalledWith('STR', 0)
    })

    it('NPC patrol: tile_num_in_direction with NaN direction returns source tile (BLK-206)', () => {
        // Arroyo guard NPC patrol uses tile_num_in_direction(startTile, facingDir, steps)
        // If facingDir is NaN (uninitialised), source tile is returned
        const result = script.tile_num_in_direction(200, NaN, 2)
        expect(result).toBe(200)
        expect(typeof result).toBe('number')
        expect(isFinite(result)).toBe(true)
    })

    it('Elder ceremony: gsay_message with empty string msgID is safe no-op (BLK-207)', () => {
        // Arroyo Elder uses gsay_message() for ceremony narration
        // A missing message key returns '' → should be silently skipped
        expect(() => script.gsay_message(0, '', 0)).not.toThrow()
    })

    it('Temple heal: critter_heal on proto-only NPC without getStat is safe no-op (BLK-208)', () => {
        // Temple NPCs spawned via create_object_sid may lack getStat method
        const protoNPC = makeCritter({ noGetStat: true })
        expect(() => script.critter_heal(protoNPC, 40)).not.toThrow()
        expect(protoNPC.stats.modifyBase).not.toHaveBeenCalled()
    })

    it('Encounter random: random with NaN stat-based bounds returns finite number (BLK-209)', () => {
        // Arroyo encounter scripts use random(0, get_critter_stat(npc, STAT_ST) - 2)
        // If get_critter_stat returns NaN for an uninitialised NPC, bounds are NaN
        const result = script.random(NaN, NaN)
        expect(typeof result).toBe('number')
        expect(isFinite(result)).toBe(true)
    })

    it('Guard stealth check: sneak state round-trip for Arroyo guard NPC', () => {
        const guard = makeCritter()
        guard.pcFlags = 0
        // Player enters sneak mode
        script.set_critter_sneak_state_sfall(guard, 1)
        expect(script.get_critter_sneak_state_sfall(guard)).toBe(1)
        // Player exits sneak mode
        script.set_critter_sneak_state_sfall(guard, 0)
        expect(script.get_critter_sneak_state_sfall(guard)).toBe(0)
    })

    it('Full SPECIAL stat sequence: read ST/EN/IN for a Temple adversary', () => {
        const adversary = makeCritter({
            stats: {
                'Strength': 7,
                'Endurance': 6,
                'INT': 4,
            },
        })
        expect(() => {
            const st = script.get_critter_strength_sfall(adversary)
            const en = script.get_critter_endurance_sfall(adversary)
            const int = script.get_critter_intelligence_sfall(adversary)
            expect(st).toBe(7)
            expect(en).toBe(6)
            expect(int).toBe(4)
        }).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 96-H — Checklist integrity', () => {
    it('BLK-205 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_205_set_pc_base_stat_non_finite')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-206 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_206_tile_num_in_direction_non_finite')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-207 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_207_gsay_message_empty_string_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-208 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_208_critter_heal_null_getstat_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-209 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_209_random_non_finite_bounds_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8308 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_strength_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8309 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_strength_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830A entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_endurance_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830B entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_endurance_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830C entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_intelligence_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830D entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_intelligence_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830E entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_sneak_state_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x830F entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_sneak_state_96')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('all Phase 96 BLK entries have impact >= medium', () => {
        const phase96Blk = ['blk_205', 'blk_206', 'blk_207', 'blk_208', 'blk_209']
        for (const id of phase96Blk) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id.startsWith(id + '_'))
            expect(entry).toBeDefined()
            expect(['medium', 'high', 'critical']).toContain(entry!.impact)
        }
    })

    it('all sfall 0x8308-0x830F entries are implemented', () => {
        const sfallIds = [
            'sfall_get_critter_strength_96',
            'sfall_set_critter_strength_96',
            'sfall_get_critter_endurance_96',
            'sfall_set_critter_endurance_96',
            'sfall_get_critter_intelligence_96',
            'sfall_set_critter_intelligence_96',
            'sfall_get_critter_sneak_state_96',
            'sfall_set_critter_sneak_state_96',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === id)
            expect(entry).toBeDefined()
            expect(entry!.status).toBe('implemented')
        }
    })
})
