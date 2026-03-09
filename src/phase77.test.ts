/**
 * Phase 77 regression tests.
 *
 * Covers:
 *   A. BLK-121 — reg_anim_animate now calls singleAnimation on target object
 *   B. BLK-122 — gfade_out/in apply CSS opacity in browser, no-op in Node.js
 *   C. sfall 0x8288 — get_critter_flags_sfall (alias of get_critter_flags)
 *   D. sfall 0x8289 — set_critter_flags_sfall (alias of set_critter_flags)
 *   E. sfall 0x828A — get_critter_worn_armor_sfall
 *   F. sfall 0x828B — get_critter_weapon_sfall
 *   G. sfall 0x828C — get_tile_x_sfall
 *   H. sfall 0x828D — get_tile_y_sfall
 *   I. sfall 0x828E — tile_from_coords_sfall
 *   J. sfall 0x828F — get_critter_max_hp_sfall
 *   K. Method registration checks (0x8288–0x828F)
 *   L. Checklist integrity
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
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : 5),
        getSkill: (s: string) => 50,
        pcFlags: 0,
        stats: {
            getBase: (s: string) => 5,
            setBase: (_s: string, _v: number) => {},
            modifyBase: (_s: string, _v: number) => {},
        },
        critterFlags: 0,
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
})

// ===========================================================================
// Phase 77-A — BLK-121: reg_anim_animate calls singleAnimation
// ===========================================================================

describe('Phase 77-A — BLK-121: reg_anim_animate now calls singleAnimation', () => {
    it('BLK-121 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-121')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('calls singleAnimation(false, null) on the object', () => {
        let called = false
        const obj = makeObj({
            singleAnimation: (loop: boolean, cb: unknown) => {
                called = true
                expect(loop).toBe(false)
                expect(cb).toBeNull()
            },
        })
        script.reg_anim_animate(obj, 0, 0)
        expect(called).toBe(true)
    })

    it('does not throw when object has no singleAnimation', () => {
        const obj = makeObj()
        expect(() => script.reg_anim_animate(obj, 0, 0)).not.toThrow()
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.reg_anim_animate(0 as any, 0, 0)).not.toThrow()
    })

    it('reg_anim_animate_once is a function on script', () => {
        expect(typeof (script as any).reg_anim_animate_once).toBe('function')
    })
})

// ===========================================================================
// Phase 77-B — BLK-122: gfade_out/in CSS implementation
// ===========================================================================

describe('Phase 77-B — BLK-122: gfade_out/in CSS implementation', () => {
    it('BLK-122 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'BLK-122')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('gfade_out does not throw in Node.js (document is undefined)', () => {
        expect(() => script.gfade_out(10)).not.toThrow()
    })

    it('gfade_in does not throw in Node.js (document is undefined)', () => {
        expect(() => script.gfade_in(10)).not.toThrow()
    })

    it('gfade_out_css does not throw in Node.js', () => {
        expect(() => (script as any).gfade_out_css(10)).not.toThrow()
    })

    it('gfade_in_css does not throw in Node.js', () => {
        expect(() => (script as any).gfade_in_css(10)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-C — sfall 0x8288: get_critter_flags_sfall
// ===========================================================================

describe('Phase 77-C — sfall 0x8288: get_critter_flags_sfall', () => {
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_flags_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns 0 for alive critter with no injury state', () => {
        const critter = makeObj({ dead: false, knockedOut: false, knockedDown: false })
        expect(script.get_critter_flags_sfall(critter)).toBe(0)
    })

    it('returns 0x0001 for dead critter (CRITTER_FLAG_DEAD)', () => {
        const critter = makeObj({ dead: true })
        expect(script.get_critter_flags_sfall(critter)).toBe(0x0001)
    })

    it('returns 0x0080 for blinded critter (CRITTER_FLAG_BLINDED)', () => {
        const critter = makeObj({ blinded: true })
        expect(script.get_critter_flags_sfall(critter)).toBe(0x0080)
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.get_critter_flags_sfall(0 as any)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-D — sfall 0x8289: set_critter_flags_sfall
// ===========================================================================

describe('Phase 77-D — sfall 0x8289: set_critter_flags_sfall', () => {
    it('decodes flags bitmask into individual critter injury booleans', () => {
        const critter = makeObj()
        // 0x80 = blinded flag
        script.set_critter_flags_sfall(critter, 0x80)
        expect((critter as any).blinded).toBe(true)
        // 0x01 = dead flag
        script.set_critter_flags_sfall(critter, 0x01)
        expect((critter as any).dead).toBe(true)
        expect((critter as any).blinded).toBe(false) // cleared
    })

    it('clears all flags when called with 0', () => {
        const critter = makeObj({ dead: true, knockedOut: true })
        script.set_critter_flags_sfall(critter, 0)
        expect((critter as any).dead).toBe(false)
        expect((critter as any).knockedOut).toBe(false)
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.set_critter_flags_sfall(0 as any, 5)).not.toThrow()
    })

    it('does not throw for non-critter', () => {
        expect(() => script.set_critter_flags_sfall(makeObj({ type: 'item' }), 5)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-E — sfall 0x828A: get_critter_worn_armor_sfall
// ===========================================================================

describe('Phase 77-E — sfall 0x828A: get_critter_worn_armor_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_worn_armor_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_worn_armor_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns 0 when no armor equipped', () => {
        expect(script.get_critter_worn_armor_sfall(makeObj({ equippedArmor: null }))).toBe(0)
    })

    it('returns the equipped armor object', () => {
        const armor = makeObj({ type: 'item', name: 'CombatArmor' })
        const critter = makeObj({ equippedArmor: armor })
        expect(script.get_critter_worn_armor_sfall(critter)).toBe(armor)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_worn_armor_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-F — sfall 0x828B: get_critter_weapon_sfall
// ===========================================================================

describe('Phase 77-F — sfall 0x828B: get_critter_weapon_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_weapon_sfall(0 as any, 0)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_weapon_sfall(makeObj({ type: 'item' }), 0)).toBe(0)
    })

    it('returns rightHand for hand=0', () => {
        const weapon = makeObj({ type: 'item', name: 'Pistol' })
        const critter = makeObj({ rightHand: weapon })
        expect(script.get_critter_weapon_sfall(critter, 0)).toBe(weapon)
    })

    it('returns leftHand for hand=1', () => {
        const weapon = makeObj({ type: 'item', name: 'Knife' })
        const critter = makeObj({ leftHand: weapon })
        expect(script.get_critter_weapon_sfall(critter, 1)).toBe(weapon)
    })

    it('returns 0 when hand is empty (null rightHand)', () => {
        expect(script.get_critter_weapon_sfall(makeObj({ rightHand: null }), 0)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_weapon_sfall(makeObj(), 0)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-G — sfall 0x828C: get_tile_x_sfall
// ===========================================================================

describe('Phase 77-G — sfall 0x828C: get_tile_x_sfall', () => {
    it('returns 0 for tile 0', () => {
        expect(script.get_tile_x_sfall(0)).toBe(0)
    })

    it('returns correct x for tile number (tile = y*200 + x)', () => {
        // tile 5 → y=0, x=5
        expect(script.get_tile_x_sfall(5)).toBe(5)
        // tile 205 → y=1, x=5
        expect(script.get_tile_x_sfall(205)).toBe(5)
    })

    it('returns 0 for negative tile number', () => {
        expect(script.get_tile_x_sfall(-1)).toBe(0)
    })

    it('returns 0 for NaN', () => {
        expect(script.get_tile_x_sfall(NaN)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_tile_x_sfall(100)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-H — sfall 0x828D: get_tile_y_sfall
// ===========================================================================

describe('Phase 77-H — sfall 0x828D: get_tile_y_sfall', () => {
    it('returns 0 for tile 0', () => {
        expect(script.get_tile_y_sfall(0)).toBe(0)
    })

    it('returns correct y for tile number', () => {
        // tile 200 → y=1, x=0
        expect(script.get_tile_y_sfall(200)).toBe(1)
        // tile 400 → y=2, x=0
        expect(script.get_tile_y_sfall(400)).toBe(2)
    })

    it('returns 0 for negative tile number', () => {
        expect(script.get_tile_y_sfall(-1)).toBe(0)
    })

    it('returns 0 for NaN', () => {
        expect(script.get_tile_y_sfall(NaN)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_tile_y_sfall(100)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-I — sfall 0x828E: tile_from_coords_sfall
// ===========================================================================

describe('Phase 77-I — sfall 0x828E: tile_from_coords_sfall', () => {
    it('returns 0 for (0, 0)', () => {
        expect(script.tile_from_coords_sfall(0, 0)).toBe(0)
    })

    it('returns correct tile number for (x, y)', () => {
        // tile = y*200 + x
        expect(script.tile_from_coords_sfall(5, 0)).toBe(5)
        expect(script.tile_from_coords_sfall(0, 1)).toBe(200)
        expect(script.tile_from_coords_sfall(5, 1)).toBe(205)
    })

    it('round-trips with get_tile_x_sfall and get_tile_y_sfall', () => {
        const x = 42
        const y = 17
        const tile = script.tile_from_coords_sfall(x, y)
        expect(script.get_tile_x_sfall(tile)).toBe(x)
        expect(script.get_tile_y_sfall(tile)).toBe(y)
    })

    it('returns 0 for NaN inputs', () => {
        expect(script.tile_from_coords_sfall(NaN, 0)).toBe(0)
        expect(script.tile_from_coords_sfall(0, NaN)).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.tile_from_coords_sfall(10, 20)).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-J — sfall 0x828F: get_critter_max_hp_sfall
// ===========================================================================

describe('Phase 77-J — sfall 0x828F: get_critter_max_hp_sfall', () => {
    it('returns 0 for non-game-object', () => {
        expect(script.get_critter_max_hp_sfall(0 as any)).toBe(0)
    })

    it('returns 0 for non-critter', () => {
        expect(script.get_critter_max_hp_sfall(makeObj({ type: 'item' }))).toBe(0)
    })

    it('returns Max HP from getStat()', () => {
        const critter = makeObj({
            getStat: (s: string) => s === 'Max HP' ? 150 : 5,
        })
        expect(script.get_critter_max_hp_sfall(critter)).toBe(150)
    })

    it('falls back to pro.extra.maxHP when no getStat', () => {
        const critter = makeObj({
            getStat: undefined,
            pro: { extra: { maxHP: 75 } },
        })
        expect(script.get_critter_max_hp_sfall(critter)).toBe(75)
    })

    it('falls back to direct maxHP when no pro', () => {
        const critter = makeObj({
            getStat: undefined,
            maxHP: 50,
        })
        expect(script.get_critter_max_hp_sfall(critter)).toBe(50)
    })

    it('does not throw', () => {
        expect(() => script.get_critter_max_hp_sfall(makeObj())).not.toThrow()
    })
})

// ===========================================================================
// Phase 77-K — sfall method registration check (0x8288–0x828F)
// ===========================================================================

describe('Phase 77-K — sfall 0x8288–0x828F scripting methods exist', () => {
    const phase77Methods = [
        'get_critter_flags_sfall',
        'set_critter_flags_sfall',
        'get_critter_worn_armor_sfall',
        'get_critter_weapon_sfall',
        'get_tile_x_sfall',
        'get_tile_y_sfall',
        'tile_from_coords_sfall',
        'get_critter_max_hp_sfall',
        'reg_anim_animate_once',
        'gfade_out_css',
        'gfade_in_css',
    ]

    for (const methodName of phase77Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 77-L — Checklist integrity
// ===========================================================================

describe('Phase 77-L — Checklist integrity', () => {
    const phase77Ids = [
        'BLK-121',
        'BLK-122',
        'sfall_get_critter_flags_sfall',
        'sfall_set_critter_flags_sfall',
        'sfall_get_critter_worn_armor',
        'sfall_get_critter_weapon_82',
        'sfall_get_tile_x',
        'sfall_get_tile_y',
        'sfall_tile_from_coords',
        'sfall_get_critter_max_hp_82',
    ]

    it('all Phase 77 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase77Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
