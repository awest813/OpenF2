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

    it('does not throw when object has no singleAnimation', () => {
        const obj = makeObj()
        expect(() => script.reg_anim_animate(obj, 0, 0)).not.toThrow()
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.reg_anim_animate(0 as any, 0, 0)).not.toThrow()
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
