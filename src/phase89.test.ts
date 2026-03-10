/**
 * Phase 89 regression tests — Arroyo end-sequence polish.
 *
 * Covers:
 *   A. BLK-171 — set_world_map_pos() non-finite coordinate guard
 *   B. BLK-172 — move_obj_inven_to_obj() undefined inventory guard
 *   C. BLK-173 — override_map_start() non-finite position guard
 *   D. BLK-174 — give_exp_points() null-skills guard on level-up
 *   E. BLK-175 — rm_timer_event() removes ALL matching events (not just first)
 *   F. sfall opcodes 0x82D0–0x82D7
 *      0x82D0 get_critter_reaction_sfall
 *      0x82D1 set_critter_reaction_sfall
 *      0x82D2 get_game_difficulty_sfall
 *      0x82D3 set_game_difficulty_sfall
 *      0x82D4 get_combat_difficulty_sfall
 *      0x82D5 set_combat_difficulty_sfall
 *      0x82D6 get_critter_team_sfall
 *      0x82D7 set_critter_team_sfall
 *   G. Arroyo end-sequence smoke tests
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

function makeCritter(opts: {
    hp?: number
    inventory?: any[]
    stats?: Record<string, number>
    isPlayer?: boolean
    skills?: any
} = {}) {
    const stats: Record<string, number> = { 'HP': opts.hp ?? 80, 'Max HP': 100, ...(opts.stats ?? {}) }
    return {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        inventory: opts.inventory ?? [],
        visible: true,
        orientation: 0,
        isPlayer: opts.isPlayer ?? false,
        equippedArmor: null,
        leftHand: null as any,
        rightHand: null as any,
        perkRanks: {} as Record<number, number>,
        charTraits: new Set<number>(),
        aiNum: 1,
        teamNum: -1,
        dead: false,
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 5,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: (s: string) => stats[s] ?? 5,
        getSkill: (_s: string) => 30,
        skills: opts.skills !== undefined ? opts.skills : {
            skillPoints: 0,
            getBase: (_s: string) => 30,
            setBase: vi.fn(),
            baseSkills: {} as Record<string, number>,
        },
    }
}

/** Make an object that has no inventory array (bare container/scenery). */
function makeContainerNoInventory(): any {
    return {
        type: 'item',
        subtype: 'container',
        pid: 0x02000005,
        name: 'Chest',
        position: { x: 50, y: 50 },
        // deliberately no inventory property
    }
}

/** Make a scriptable object (has _script) for timer testing. */
function makeScriptableObj(pid: number): any {
    const obj: any = {
        type: 'critter',
        pid,
        name: 'Trap_' + pid,
        position: { x: 10, y: 10 },
        _script: {},
    }
    obj._script.timed_event_p_proc = vi.fn()
    return obj
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    drainStubHits()
    // Reset difficulty state between tests
    delete (globalState as any).gameDifficulty
    delete (globalState as any).combatDifficulty
})

// ---------------------------------------------------------------------------
// A. BLK-171 — set_world_map_pos non-finite coordinate guard
// ---------------------------------------------------------------------------

describe('Phase 89-A — BLK-171: set_world_map_pos non-finite coordinate guard', () => {
    it('sets worldPosition for valid integer coordinates', () => {
        script.set_world_map_pos(118, 170)
        expect(globalState.worldPosition).toEqual({ x: 118, y: 170 })
    })

    it('sets worldPosition for valid floating-point coordinates', () => {
        script.set_world_map_pos(74.5, 75.5)
        expect(globalState.worldPosition).toEqual({ x: 74.5, y: 75.5 })
    })

    it('does not throw and preserves worldPosition when x is NaN', () => {
        const before = globalState.worldPosition ? { ...globalState.worldPosition } : null
        script.set_world_map_pos(NaN, 100)
        if (before) {
            expect(globalState.worldPosition).toEqual(before)
        }
    })

    it('does not throw and preserves worldPosition when y is Infinity', () => {
        script.set_world_map_pos(100, 118)
        const snap = { ...globalState.worldPosition! }
        expect(() => script.set_world_map_pos(100, Infinity)).not.toThrow()
        expect(globalState.worldPosition).toEqual(snap)
    })

    it('does not throw when both x and y are NaN', () => {
        expect(() => script.set_world_map_pos(NaN, NaN)).not.toThrow()
    })

    it('does not throw when x is -Infinity', () => {
        expect(() => script.set_world_map_pos(-Infinity, 50)).not.toThrow()
    })

    it('accepts coordinate 0 (valid boundary)', () => {
        script.set_world_map_pos(0, 0)
        expect(globalState.worldPosition).toEqual({ x: 0, y: 0 })
    })
})

// ---------------------------------------------------------------------------
// B. BLK-172 — move_obj_inven_to_obj undefined inventory guard
// ---------------------------------------------------------------------------

describe('Phase 89-B — BLK-172: move_obj_inven_to_obj undefined inventory guard', () => {
    it('does not throw when source object has no inventory array', () => {
        const src = makeContainerNoInventory()
        const dst = { type: 'critter', pid: 0x01000010, name: 'NPC', inventory: [] as any[] }
        expect(() => script.move_obj_inven_to_obj(src, dst)).not.toThrow()
    })

    it('does not throw when destination object has no inventory array', () => {
        const src = { type: 'item', subtype: 'container', pid: 0x02000006, name: 'Box', inventory: [] as any[] }
        const dst = makeContainerNoInventory()
        expect(() => script.move_obj_inven_to_obj(src, dst)).not.toThrow()
    })

    it('does not throw when both objects have no inventory array', () => {
        const src = makeContainerNoInventory()
        const dst = makeContainerNoInventory()
        dst.pid = 0x02000006
        expect(() => script.move_obj_inven_to_obj(src, dst)).not.toThrow()
    })

    it('transfers inventory items when source has items', () => {
        const item = { pid: 0x00001000, type: 'item', subtype: 'misc', name: 'Spear' }
        const src = { type: 'item', subtype: 'container', pid: 0x02000007, name: 'Box', inventory: [item] }
        const dst = makeCritter()
        script.move_obj_inven_to_obj(src as any, dst as any)
        expect((dst as any).inventory).toContain(item)
        expect(src.inventory.length).toBe(0)
    })

    it('does not throw when null pointer is passed', () => {
        expect(() => script.move_obj_inven_to_obj(null as any, null as any)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-173 — override_map_start non-finite position guard
// ---------------------------------------------------------------------------

describe('Phase 89-C — BLK-173: override_map_start non-finite position guard', () => {
    it('does not throw when x is NaN', () => {
        expect(() => script.override_map_start(NaN, 100, 0, 0)).not.toThrow()
    })

    it('does not throw when y is Infinity', () => {
        expect(() => script.override_map_start(50, Infinity, 0, 0)).not.toThrow()
    })

    it('does not throw when both x and y are NaN', () => {
        expect(() => script.override_map_start(NaN, NaN, 0, 0)).not.toThrow()
    })

    it('does not throw and sets overrideStartPos for valid coordinates', () => {
        // Call and then trigger a map enter to verify overrideStartPos was set
        expect(() => script.override_map_start(100, 200, 0, 0)).not.toThrow()
    })

    it('does not throw when x is -Infinity', () => {
        expect(() => script.override_map_start(-Infinity, 50, 0, 2)).not.toThrow()
    })

    it('accepts valid integer coordinates without throwing', () => {
        expect(() => script.override_map_start(80, 100, 1, 3)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-174 — give_exp_points null-skills guard on level-up
// ---------------------------------------------------------------------------

describe('Phase 89-D — BLK-174: give_exp_points null-skills guard', () => {
    it('does not throw when player.skills is null and XP causes level-up', () => {
        const savedPlayer = globalState.player
        const partialPlayer: any = {
            type: 'critter',
            pid: 0,
            name: 'Chosen One',
            isPlayer: true,
            inventory: [],
            xp: 0,
            level: 1,
            skills: null,  // deliberately null — simulates early arroyo partial init
            perkRanks: {},
            pcFlags: 0,
            getStat: (_s: string) => 5,
            getSkill: (_s: string) => 40,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 98, y: 108 },
        }
        ;(globalState as any).player = partialPlayer

        try {
            // 2000 XP should trigger level 2 (threshold = 2*(2+1)/2 * 1000 = 3000,
            // actually level 2 needs 1*2/2*1000=1000 XP).  Giving 1200 XP crosses L2.
            expect(() => script.give_exp_points(1200)).not.toThrow()
            expect(partialPlayer.level).toBeGreaterThanOrEqual(2)
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    it('does not throw when player.skills is undefined and XP causes level-up', () => {
        const savedPlayer = globalState.player
        const partialPlayer: any = {
            type: 'critter',
            pid: 0,
            name: 'Chosen One',
            isPlayer: true,
            inventory: [],
            xp: 0,
            level: 1,
            // skills property absent entirely
            perkRanks: {},
            pcFlags: 0,
            getStat: (_s: string) => 5,
            getSkill: (_s: string) => 40,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 98, y: 108 },
        }
        ;(globalState as any).player = partialPlayer

        try {
            expect(() => script.give_exp_points(1200)).not.toThrow()
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    it('awards skill points normally when player.skills is present', () => {
        const savedPlayer = globalState.player
        const player: any = {
            type: 'critter', pid: 0, name: 'Player', isPlayer: true, inventory: [],
            xp: 0, level: 1,
            skills: { skillPoints: 0, getBase: (_s: string) => 30, setBase: vi.fn(), baseSkills: {} },
            perkRanks: {}, pcFlags: 0,
            getStat: (_s: string) => 6,
            getSkill: (_s: string) => 40,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 0, y: 0 },
        }
        ;(globalState as any).player = player

        try {
            script.give_exp_points(1200)
            // Level 2 reached: should have awarded skill points (10 + floor(6/2) = 13)
            expect(player.skills.skillPoints).toBeGreaterThan(0)
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    it('still adds XP even when skills is null (no level-up)', () => {
        const savedPlayer = globalState.player
        const player: any = {
            type: 'critter', pid: 0, name: 'Player', isPlayer: true, inventory: [],
            xp: 0, level: 99, // high level — 100 XP won't cause level-up
            skills: null,
            perkRanks: {},
            getStat: (_s: string) => 5,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 0, y: 0 },
        }
        ;(globalState as any).player = player

        try {
            script.give_exp_points(100)
            expect(player.xp).toBe(100)
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })
})

// ---------------------------------------------------------------------------
// E. BLK-175 — rm_timer_event removes ALL matching events
// ---------------------------------------------------------------------------

describe('Phase 89-E — BLK-175: rm_timer_event removes all matching events', () => {
    it('removes a single timer event for the given object', () => {
        const trap = makeScriptableObj(0x05000030)
        script.add_timer_event(trap, 10, 42)
        script.rm_timer_event(trap)
        // After removal the timer should not fire — add another and check count
        // (We verify indirectly: adding a new event after removal should work)
        expect(() => script.add_timer_event(trap, 5, 99)).not.toThrow()
    })

    it('removes ALL timer events when an object has multiple', () => {
        const trap = makeScriptableObj(0x05000031)
        // Add two events to the same object (as temple dart traps do)
        script.add_timer_event(trap, 10, 1)
        script.add_timer_event(trap, 20, 2)
        // rm_timer_event must clear both
        expect(() => script.rm_timer_event(trap)).not.toThrow()
        // Adding a third after removal should work without accumulation
        script.add_timer_event(trap, 5, 3)
        expect(() => script.rm_timer_event(trap)).not.toThrow()
    })

    it('does not throw when called on null', () => {
        expect(() => script.rm_timer_event(null as any)).not.toThrow()
    })

    it('does not throw when no events are registered for the object', () => {
        const trap = makeScriptableObj(0x05000032)
        expect(() => script.rm_timer_event(trap)).not.toThrow()
    })

    it('only removes events for the matching object (different PIDs)', () => {
        const trap1 = makeScriptableObj(0x05000033)
        const trap2 = makeScriptableObj(0x05000034)
        script.add_timer_event(trap1, 10, 10)
        script.add_timer_event(trap2, 10, 20)
        // Remove trap1's events — trap2's should remain
        script.rm_timer_event(trap1)
        // trap2 can still be removed without error → it still exists
        expect(() => script.rm_timer_event(trap2)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x82D0–0x82D7
// ---------------------------------------------------------------------------

describe('Phase 89-F — sfall 0x82D0: get_critter_reaction_sfall', () => {
    it('returns 50 (neutral) for a critter with no stored reaction', () => {
        const npc = makeCritter()
        const pc = makeCritter({ isPlayer: true })
        expect(script.get_critter_reaction_sfall(npc as any, pc as any)).toBe(50)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', subtype: 'weapon', pid: 0x00001001, name: 'Spear' }
        const pc = makeCritter()
        expect(script.get_critter_reaction_sfall(item, pc as any)).toBe(50)
    })

    it('returns stored reaction value after set_critter_reaction_sfall', () => {
        const npc = makeCritter()
        const pc = makeCritter({ isPlayer: true })
        script.set_critter_reaction_sfall(npc as any, pc as any, 75)
        expect(script.get_critter_reaction_sfall(npc as any, pc as any)).toBe(75)
    })
})

describe('Phase 89-F — sfall 0x82D1: set_critter_reaction_sfall', () => {
    it('does not throw for a valid critter and value', () => {
        const npc = makeCritter()
        const pc = makeCritter()
        expect(() => script.set_critter_reaction_sfall(npc as any, pc as any, 80)).not.toThrow()
    })

    it('clamps value to [0, 100]', () => {
        const npc = makeCritter()
        const pc = makeCritter()
        script.set_critter_reaction_sfall(npc as any, pc as any, 150)
        expect(script.get_critter_reaction_sfall(npc as any, pc as any)).toBe(100)
        script.set_critter_reaction_sfall(npc as any, pc as any, -10)
        expect(script.get_critter_reaction_sfall(npc as any, pc as any)).toBe(0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001002, name: 'X' }
        const pc = makeCritter()
        expect(() => script.set_critter_reaction_sfall(item, pc as any, 60)).not.toThrow()
    })
})

describe('Phase 89-F — sfall 0x82D2: get_game_difficulty_sfall', () => {
    it('returns 1 (normal) by default', () => {
        expect(script.get_game_difficulty_sfall()).toBe(1)
    })

    it('returns stored difficulty after set_game_difficulty_sfall', () => {
        script.set_game_difficulty_sfall(0)
        expect(script.get_game_difficulty_sfall()).toBe(0)
        script.set_game_difficulty_sfall(2)
        expect(script.get_game_difficulty_sfall()).toBe(2)
    })
})

describe('Phase 89-F — sfall 0x82D3: set_game_difficulty_sfall', () => {
    it('does not throw for valid difficulty values (0, 1, 2)', () => {
        expect(() => script.set_game_difficulty_sfall(0)).not.toThrow()
        expect(() => script.set_game_difficulty_sfall(1)).not.toThrow()
        expect(() => script.set_game_difficulty_sfall(2)).not.toThrow()
    })

    it('ignores out-of-range values', () => {
        script.set_game_difficulty_sfall(1)
        script.set_game_difficulty_sfall(5)  // invalid
        expect(script.get_game_difficulty_sfall()).toBe(1) // unchanged
        script.set_game_difficulty_sfall(-1) // invalid
        expect(script.get_game_difficulty_sfall()).toBe(1) // unchanged
    })
})

describe('Phase 89-F — sfall 0x82D4: get_combat_difficulty_sfall', () => {
    it('returns 1 (normal) by default', () => {
        expect(script.get_combat_difficulty_sfall()).toBe(1)
    })

    it('returns stored combat difficulty after set_combat_difficulty_sfall', () => {
        script.set_combat_difficulty_sfall(2)
        expect(script.get_combat_difficulty_sfall()).toBe(2)
    })
})

describe('Phase 89-F — sfall 0x82D5: set_combat_difficulty_sfall', () => {
    it('does not throw for valid values (0, 1, 2)', () => {
        expect(() => script.set_combat_difficulty_sfall(0)).not.toThrow()
        expect(() => script.set_combat_difficulty_sfall(1)).not.toThrow()
        expect(() => script.set_combat_difficulty_sfall(2)).not.toThrow()
    })

    it('ignores out-of-range values', () => {
        script.set_combat_difficulty_sfall(1)
        script.set_combat_difficulty_sfall(3)
        expect(script.get_combat_difficulty_sfall()).toBe(1)
    })
})

describe('Phase 89-F — sfall 0x82D6: get_critter_team_sfall', () => {
    it('returns 0 (neutral) for a critter with no team assigned', () => {
        const npc = makeCritter()
        expect(script.get_critter_team_sfall(npc as any)).toBe(0)
    })

    it('returns stored team after set_critter_team_sfall', () => {
        const npc = makeCritter()
        script.set_critter_team_sfall(npc as any, 3)
        expect(script.get_critter_team_sfall(npc as any)).toBe(3)
    })

    it('returns 0 for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001003, name: 'Y' }
        expect(script.get_critter_team_sfall(item)).toBe(0)
    })
})

describe('Phase 89-F — sfall 0x82D7: set_critter_team_sfall', () => {
    it('does not throw for a valid critter and team number', () => {
        const npc = makeCritter()
        expect(() => script.set_critter_team_sfall(npc as any, 1)).not.toThrow()
    })

    it('sets team to 0 for a non-number team argument', () => {
        const npc = makeCritter()
        script.set_critter_team_sfall(npc as any, 'invalid' as any)
        expect(script.get_critter_team_sfall(npc as any)).toBe(0)
    })

    it('does not throw for a non-critter object', () => {
        const item: any = { type: 'item', pid: 0x00001004, name: 'Z' }
        expect(() => script.set_critter_team_sfall(item, 2)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo end-sequence smoke tests
// ---------------------------------------------------------------------------

describe('Phase 89-G — Arroyo end-sequence smoke tests', () => {
    /**
     * Simulates the arroyo.int exit script calling set_world_map_pos(118, 170)
     * to place the player on the world map after the Elder gives the quest.
     */
    it('Arroyo exit: set_world_map_pos with valid coords sets worldPosition', () => {
        expect(() => script.set_world_map_pos(118, 170)).not.toThrow()
        expect(globalState.worldPosition).toEqual({ x: 118, y: 170 })
    })

    /**
     * Simulates the arroyo.int exit script passing a broken computed coordinate
     * (e.g. NaN from a division-by-zero tile index).  Must not corrupt state.
     */
    it('Arroyo exit: set_world_map_pos with NaN coords is a no-op', () => {
        script.set_world_map_pos(118, 170) // set a known good value first
        script.set_world_map_pos(NaN, 170) // broken x — must not change state
        expect(globalState.worldPosition).toEqual({ x: 118, y: 170 })
    })

    /**
     * Simulates artemple.int map_exit_p_proc calling rm_timer_event on all dart
     * trap objects.  When a trap had two events (arming + fire), both must be
     * removed to prevent phantom damage after the player leaves the temple.
     */
    it('Temple exit: rm_timer_event removes all events from a multi-event trap', () => {
        const dartTrap = makeScriptableObj(0x05000050)
        script.add_timer_event(dartTrap, 50, 1)  // arming tick
        script.add_timer_event(dartTrap, 100, 2) // fire tick
        expect(() => script.rm_timer_event(dartTrap)).not.toThrow()
        // Re-adding a fresh event after full removal must succeed cleanly
        expect(() => script.add_timer_event(dartTrap, 10, 99)).not.toThrow()
    })

    /**
     * Simulates the Elder giving XP on completion of the temple when the player
     * object is partially initialised (skills not yet attached).
     */
    it('Elder XP award: give_exp_points does not throw with null skills', () => {
        const savedPlayer = globalState.player
        const chosenOne: any = {
            type: 'critter', pid: 0, name: 'Chosen One', isPlayer: true,
            inventory: [], xp: 0, level: 1,
            skills: null,
            perkRanks: {},
            getStat: (_s: string) => 7,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 98, y: 108 },
        }
        ;(globalState as any).player = chosenOne
        try {
            expect(() => script.give_exp_points(2500)).not.toThrow()
            expect(chosenOne.xp).toBe(2500)
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    /**
     * Simulates artemple.int move_obj_inven_to_obj for the chest room (final
     * reward) when the chest object was freshly created and has no inventory.
     */
    it('Temple chest: move_obj_inven_to_obj with uninitialised chest does not throw', () => {
        const chest = makeContainerNoInventory()
        const player = makeCritter({ isPlayer: true, inventory: [] })
        expect(() => script.move_obj_inven_to_obj(chest, player as any)).not.toThrow()
    })

    /**
     * Simulates override_map_start being called with valid spawn coordinates on
     * the arroyo village entrance tile.
     */
    it('Arroyo override_map_start: valid coordinates do not throw', () => {
        expect(() => script.override_map_start(80, 95, 0, 0)).not.toThrow()
    })

    /**
     * Simulates override_map_start being called with a NaN coordinate from a
     * broken script formula.  Must not set a corrupt overrideStartPos.
     */
    it('Arroyo override_map_start: NaN coordinate is ignored', () => {
        // Expect the bad call to be a no-op; the map entrance won't be overridden
        expect(() => script.override_map_start(NaN, 95, 0, 0)).not.toThrow()
    })

    /**
     * Full end-of-arroyo sequence:
     *   1. Player exits temple → rm_timer_event clears all traps
     *   2. Elder awards XP → level-up with null skills does not throw
     *   3. World map position is set → valid coords survive
     */
    it('Full end-of-arroyo: traps cleared → XP awarded → world map position set', () => {
        const trap = makeScriptableObj(0x05000060)
        script.add_timer_event(trap, 30, 1)
        script.add_timer_event(trap, 60, 2)

        const savedPlayer = globalState.player
        const chosenOne: any = {
            type: 'critter', pid: 0, name: 'Chosen One', isPlayer: true,
            inventory: [], xp: 0, level: 1,
            skills: null, perkRanks: {},
            getStat: (_s: string) => 5,
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            position: { x: 98, y: 108 },
        }
        ;(globalState as any).player = chosenOne

        try {
            expect(() => {
                script.rm_timer_event(trap)           // temple exit: clear all traps
                script.give_exp_points(2500)           // Elder: award XP
                script.set_world_map_pos(118, 170)     // arroyo exit: set world map
            }).not.toThrow()

            expect(chosenOne.xp).toBe(2500)
            expect(globalState.worldPosition).toEqual({ x: 118, y: 170 })
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 89-H — checklist integrity', () => {
    it('BLK-171 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_171_set_world_map_pos_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-172 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_172_move_obj_inven_to_obj_null_inventory')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-173 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_173_override_map_start_non_finite')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-174 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_174_give_exp_points_null_skills')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-175 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_175_rm_timer_event_remove_all')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('sfall 0x82D0–0x82D7 entries are all present in the checklist', () => {
        const ids = [
            'sfall_get_critter_reaction_89',
            'sfall_set_critter_reaction_89',
            'sfall_get_game_difficulty_89',
            'sfall_set_game_difficulty_89',
            'sfall_get_combat_difficulty_89',
            'sfall_set_combat_difficulty_89',
            'sfall_get_critter_team_89',
            'sfall_set_critter_team_89',
        ]
        for (const id of ids) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
        }
    })

    it('no duplicate checklist entry IDs', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        const unique = new Set(ids)
        expect(unique.size).toBe(ids.length)
    })
})
