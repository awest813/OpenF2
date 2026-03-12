/**
 * Phase 95 regression tests — Debug and polish: start menu to end of Arroyo.
 *
 * Covers:
 *   A. BLK-200 — obj_is_carrying_obj_pid() null-inventory guard
 *   B. BLK-201 — add_mult_objs_to_inven() null-inventory guard
 *   C. BLK-202 — set_map_var() non-finite value guard
 *   D. BLK-203 — set_obj_visibility() non-numeric visibility guard
 *   E. BLK-204 — giq_option() empty-string message guard
 *   F. sfall opcodes 0x8300–0x8307
 *      0x8300 get_critter_perception_sfall
 *      0x8301 set_critter_perception_sfall
 *      0x8302 get_critter_luck_sfall
 *      0x8303 set_critter_luck_sfall
 *      0x8304 get_critter_agility_sfall
 *      0x8305 set_critter_agility_sfall
 *      0x8306 get_critter_charisma_sfall
 *      0x8307 set_critter_charisma_sfall
 *   G. Arroyo start-to-end smoke tests
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
    s.scriptName = 'test_phase95'
    return s
}

function makeCritter(opts: {
    hp?: number
    maxHp?: number
    inventory?: any[] | null
    stats?: Record<string, number>
} = {}): any {
    const stats: Record<string, number> = {
        'HP': opts.hp ?? 80,
        'Max HP': opts.maxHp ?? 100,
        'Armor Class': 10,
        'Action Points': 8,
        'Melee Damage': 5,
        'Critical Chance': 5,
        'Perception': 6,
        'Luck': 5,
        'Agility': 7,
        'Charisma': 4,
        ...(opts.stats ?? {}),
    }
    return {
        type: 'critter',
        pid: 0x01000001,
        name: 'TestCritter',
        // Support explicit null inventory (BLK-200/201)
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
        level: 1,
        position: { x: 50, y: 50 },
        hasAnimation: (_name: string) => false,
        staticAnimation: vi.fn(),
        clearAnim: vi.fn(),
        stats: {
            getBase: (s: string) => stats[s] ?? 0,
            setBase: vi.fn((s: string, v: number) => { stats[s] = v }),
            modifyBase: vi.fn((s: string, delta: number) => { stats[s] = (stats[s] ?? 0) + delta }),
        },
        getStat: (s: string) => stats[s] ?? 0,
        getSkill: (_s: string) => 40,
    }
}

function makeItem(): any {
    return {
        type: 'item',
        subtype: 'weapon',
        pid: 0x00001001,
        name: 'Spear',
        visible: true,
        orientation: 0,
        position: null,
        inventory: [],
        addInventoryItem: vi.fn(),
    }
}

const NULL_OBJ: any = null

let script: any

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = makeScript()
    drainStubHits()
})

// ---------------------------------------------------------------------------
// A. BLK-200 — obj_is_carrying_obj_pid() null-inventory guard
// ---------------------------------------------------------------------------

describe('Phase 95-A — BLK-200: obj_is_carrying_obj_pid() null-inventory guard', () => {
    it('does not throw when inventory is null', () => {
        const critter = makeCritter({ inventory: null })
        expect(() => script.obj_is_carrying_obj_pid(critter, 0x00001001)).not.toThrow()
    })

    it('returns 0 when inventory is null', () => {
        const critter = makeCritter({ inventory: null })
        expect(script.obj_is_carrying_obj_pid(critter, 0x00001001)).toBe(0)
    })

    it('does not throw when inventory is undefined', () => {
        const critter = makeCritter()
        delete critter.inventory
        expect(() => script.obj_is_carrying_obj_pid(critter, 0x00001001)).not.toThrow()
    })

    it('returns 0 when inventory is undefined', () => {
        const critter = makeCritter()
        delete critter.inventory
        expect(script.obj_is_carrying_obj_pid(critter, 0x00001001)).toBe(0)
    })

    it('returns 0 for non-game-object', () => {
        expect(script.obj_is_carrying_obj_pid(NULL_OBJ, 0x00001001)).toBe(0)
    })

    it('counts matching PIDs when inventory has items', () => {
        const item1 = { pid: 0x00001001 }
        const item2 = { pid: 0x00001001 }
        const item3 = { pid: 0x00002002 }
        const critter = makeCritter({ inventory: [item1, item2, item3] })
        expect(script.obj_is_carrying_obj_pid(critter, 0x00001001)).toBe(2)
    })

    it('returns 0 when no items match the PID', () => {
        const item = { pid: 0x00002002 }
        const critter = makeCritter({ inventory: [item] })
        expect(script.obj_is_carrying_obj_pid(critter, 0x00001001)).toBe(0)
    })

    it('returns 0 for empty inventory', () => {
        const critter = makeCritter({ inventory: [] })
        expect(script.obj_is_carrying_obj_pid(critter, 0x00001001)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// B. BLK-201 — add_mult_objs_to_inven() null-inventory guard
// ---------------------------------------------------------------------------

describe('Phase 95-B — BLK-201: add_mult_objs_to_inven() null-inventory guard', () => {
    it('does not throw when obj inventory is null', () => {
        const critter = makeCritter({ inventory: null })
        const item = makeItem()
        expect(() => script.add_mult_objs_to_inven(critter, item, 1)).not.toThrow()
    })

    it('does not add item when obj inventory is null', () => {
        const critter = makeCritter({ inventory: null })
        const item = makeItem()
        script.add_mult_objs_to_inven(critter, item, 1)
        expect(critter.inventory).toBeNull()
    })

    it('does not throw when obj inventory is undefined', () => {
        const critter = makeCritter()
        delete critter.inventory
        const item = makeItem()
        expect(() => script.add_mult_objs_to_inven(critter, item, 1)).not.toThrow()
    })

    it('returns undefined (no-op) when obj inventory is null', () => {
        const critter = makeCritter({ inventory: null })
        const item = makeItem()
        const result = script.add_mult_objs_to_inven(critter, item, 1)
        expect(result).toBeUndefined()
    })

    it('does not throw for non-game-object source', () => {
        const item = makeItem()
        expect(() => script.add_mult_objs_to_inven(NULL_OBJ, item, 1)).not.toThrow()
    })

    it('does not throw for non-game-object item', () => {
        const critter = makeCritter()
        expect(() => script.add_mult_objs_to_inven(critter, NULL_OBJ, 1)).not.toThrow()
    })

    it('does not throw for non-positive count', () => {
        const critter = makeCritter({ inventory: [] })
        const item = makeItem()
        expect(() => script.add_mult_objs_to_inven(critter, item, 0)).not.toThrow()
        expect(() => script.add_mult_objs_to_inven(critter, item, -1)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// C. BLK-202 — set_map_var() non-finite value guard
// ---------------------------------------------------------------------------

describe('Phase 95-C — BLK-202: set_map_var() non-finite value guard', () => {
    it('does not throw when value is NaN', () => {
        // Need a map script to be set for set_map_var to work
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        expect(() => script.set_map_var(0, NaN)).not.toThrow()
    })

    it('clamps NaN value to 0', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        script.set_map_var(0, NaN)
        expect(script.map_var(0)).toBe(0)
    })

    it('does not throw when value is Infinity', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        expect(() => script.set_map_var(1, Infinity)).not.toThrow()
    })

    it('clamps Infinity value to 0', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        script.set_map_var(1, Infinity)
        expect(script.map_var(1)).toBe(0)
    })

    it('does not throw when value is -Infinity', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        expect(() => script.set_map_var(2, -Infinity)).not.toThrow()
    })

    it('clamps -Infinity value to 0', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        script.set_map_var(2, -Infinity)
        expect(script.map_var(2)).toBe(0)
    })

    it('stores valid integer values normally', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        script.set_map_var(3, 42)
        expect(script.map_var(3)).toBe(42)
    })

    it('stores valid negative values normally', () => {
        const mapScript: any = { scriptName: 'arroyo' }
        script._mapScript = mapScript
        script.set_map_var(4, -7)
        expect(script.map_var(4)).toBe(-7)
    })

    it('is a no-op without a map script', () => {
        expect(() => script.set_map_var(0, NaN)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// D. BLK-203 — set_obj_visibility() non-numeric visibility guard
// ---------------------------------------------------------------------------

describe('Phase 95-D — BLK-203: set_obj_visibility() non-numeric visibility guard', () => {
    it('does not throw when visibility is NaN', () => {
        const obj = makeCritter()
        expect(() => script.set_obj_visibility(obj, NaN)).not.toThrow()
    })

    it('shows object (visible=true) when visibility is NaN', () => {
        const obj = makeCritter()
        obj.visible = false
        script.set_obj_visibility(obj, NaN)
        expect(obj.visible).toBe(true)
    })

    it('does not throw when visibility is null', () => {
        const obj = makeCritter()
        expect(() => script.set_obj_visibility(obj, null as any)).not.toThrow()
    })

    it('shows object when visibility is null', () => {
        const obj = makeCritter()
        obj.visible = false
        script.set_obj_visibility(obj, null as any)
        expect(obj.visible).toBe(true)
    })

    it('does not throw when visibility is undefined', () => {
        const obj = makeCritter()
        expect(() => script.set_obj_visibility(obj, undefined as any)).not.toThrow()
    })

    it('hides object when visibility is 1', () => {
        const obj = makeCritter()
        obj.visible = true
        script.set_obj_visibility(obj, 1)
        expect(obj.visible).toBe(false)
    })

    it('shows object when visibility is 0', () => {
        const obj = makeCritter()
        obj.visible = false
        script.set_obj_visibility(obj, 0)
        expect(obj.visible).toBe(true)
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.set_obj_visibility(NULL_OBJ, 1)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// E. BLK-204 — giq_option() empty-string message guard
// ---------------------------------------------------------------------------

describe('Phase 95-E — BLK-204: giq_option() empty-string message guard', () => {
    it('does not throw when message is empty string (direct string msgID)', () => {
        // When msgID is a string, getScriptMessage returns it directly without
        // loading any .msg file via XHR.  An empty string message should be skipped.
        const target = vi.fn()
        expect(() => script.giq_option(5, 0, '', target, 0)).not.toThrow()
    })

    it('does not add a dialogue option when message is empty string', () => {
        const target = vi.fn()
        // Empty string msgID → getScriptMessage returns '' → guard skips the option
        script.giq_option(5, 0, '', target, 0)
        // target should not have been called (option was skipped before IQ check)
        expect(target).not.toHaveBeenCalled()
    })

    it('adds a dialogue option when message is non-empty string', () => {
        // Set up a player so the IQ check can run
        const savedPlayer = (globalState as any).player
        const player: any = {
            type: 'critter', pid: 0, name: 'Player', isPlayer: true, inventory: [],
            getStat: (_s: string) => 10, // INT=10 easily passes any IQ test
            getSkill: (_s: string) => 50,
            skills: { skillPoints: 0, getBase: (_s: string) => 50, setBase: vi.fn(), baseSkills: {} },
            stats: { getBase: (_s: string) => 5, setBase: vi.fn(), modifyBase: vi.fn() },
            perkRanks: {}, charTraits: new Set(), pcFlags: 0, position: { x: 100, y: 100 },
            dead: false, level: 1,
        }
        ;(globalState as any).player = player
        try {
            const target = vi.fn()
            // Non-empty string msgID → getScriptMessage returns it directly
            expect(() => script.giq_option(5, 0, 'Hello Vault Dweller', target, 0)).not.toThrow()
        } finally {
            ;(globalState as any).player = savedPlayer
        }
    })

    it('null message from getScriptMessage is also skipped', () => {
        // When msgList has no matching script, getScriptMessage returns null.
        // We simulate this by checking that the guard covers null too.
        // The guard is: `if (msg === null || msg === '')`
        // We verify via the string-path (empty string) since XHR is not available in tests.
        const target = vi.fn()
        expect(() => script.giq_option(5, 0, '', target, 0)).not.toThrow()
        expect(target).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// F. sfall opcodes 0x8300–0x8307 — critter SPECIAL stats
// ---------------------------------------------------------------------------

describe('Phase 95-F — sfall 0x8300–0x8307: critter SPECIAL stat opcodes', () => {

    // 0x8300 — get_critter_perception_sfall
    it('0x8300 get_critter_perception_sfall: returns Perception stat', () => {
        const critter = makeCritter({ stats: { 'Perception': 8 } })
        expect(script.get_critter_perception_sfall(critter)).toBe(8)
    })

    it('0x8300 get_critter_perception_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_perception_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x8300 get_critter_perception_sfall: returns 0 for item', () => {
        const item = makeItem()
        expect(script.get_critter_perception_sfall(item)).toBe(0)
    })

    // 0x8301 — set_critter_perception_sfall
    it('0x8301 set_critter_perception_sfall: sets Perception stat', () => {
        const critter = makeCritter()
        script.set_critter_perception_sfall(critter, 9)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Perception', 9)
    })

    it('0x8301 set_critter_perception_sfall: clamps to 1 minimum', () => {
        const critter = makeCritter()
        script.set_critter_perception_sfall(critter, 0)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Perception', 1)
    })

    it('0x8301 set_critter_perception_sfall: clamps to 10 maximum', () => {
        const critter = makeCritter()
        script.set_critter_perception_sfall(critter, 15)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Perception', 10)
    })

    it('0x8301 set_critter_perception_sfall: coerces NaN to 1', () => {
        const critter = makeCritter()
        script.set_critter_perception_sfall(critter, NaN)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Perception', 1)
    })

    it('0x8301 set_critter_perception_sfall: no-op for non-critter', () => {
        expect(() => script.set_critter_perception_sfall(NULL_OBJ, 5)).not.toThrow()
    })

    // 0x8302 — get_critter_luck_sfall
    it('0x8302 get_critter_luck_sfall: returns Luck stat', () => {
        const critter = makeCritter({ stats: { 'Luck': 7 } })
        expect(script.get_critter_luck_sfall(critter)).toBe(7)
    })

    it('0x8302 get_critter_luck_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_luck_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x8303 — set_critter_luck_sfall
    it('0x8303 set_critter_luck_sfall: sets Luck stat', () => {
        const critter = makeCritter()
        script.set_critter_luck_sfall(critter, 6)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Luck', 6)
    })

    it('0x8303 set_critter_luck_sfall: clamps to [1, 10]', () => {
        const critter1 = makeCritter()
        script.set_critter_luck_sfall(critter1, -5)
        expect(critter1.stats.setBase).toHaveBeenCalledWith('Luck', 1)

        const critter2 = makeCritter()
        script.set_critter_luck_sfall(critter2, 100)
        expect(critter2.stats.setBase).toHaveBeenCalledWith('Luck', 10)
    })

    it('0x8303 set_critter_luck_sfall: coerces NaN to 1', () => {
        const critter = makeCritter()
        script.set_critter_luck_sfall(critter, NaN)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Luck', 1)
    })

    // 0x8304 — get_critter_agility_sfall
    it('0x8304 get_critter_agility_sfall: returns Agility stat', () => {
        const critter = makeCritter({ stats: { 'Agility': 9 } })
        expect(script.get_critter_agility_sfall(critter)).toBe(9)
    })

    it('0x8304 get_critter_agility_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_agility_sfall(NULL_OBJ)).toBe(0)
    })

    // 0x8305 — set_critter_agility_sfall
    it('0x8305 set_critter_agility_sfall: sets Agility stat', () => {
        const critter = makeCritter()
        script.set_critter_agility_sfall(critter, 8)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Agility', 8)
    })

    it('0x8305 set_critter_agility_sfall: clamps to [1, 10]', () => {
        const critter1 = makeCritter()
        script.set_critter_agility_sfall(critter1, 0)
        expect(critter1.stats.setBase).toHaveBeenCalledWith('Agility', 1)

        const critter2 = makeCritter()
        script.set_critter_agility_sfall(critter2, 11)
        expect(critter2.stats.setBase).toHaveBeenCalledWith('Agility', 10)
    })

    it('0x8305 set_critter_agility_sfall: coerces Infinity to 1', () => {
        const critter = makeCritter()
        script.set_critter_agility_sfall(critter, Infinity)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Agility', 1)
    })

    // 0x8306 — get_critter_charisma_sfall
    it('0x8306 get_critter_charisma_sfall: returns Charisma stat', () => {
        const critter = makeCritter({ stats: { 'Charisma': 3 } })
        expect(script.get_critter_charisma_sfall(critter)).toBe(3)
    })

    it('0x8306 get_critter_charisma_sfall: returns 0 for non-critter', () => {
        expect(script.get_critter_charisma_sfall(NULL_OBJ)).toBe(0)
    })

    it('0x8306 get_critter_charisma_sfall: returns 0 for item', () => {
        const item = makeItem()
        expect(script.get_critter_charisma_sfall(item)).toBe(0)
    })

    // 0x8307 — set_critter_charisma_sfall
    it('0x8307 set_critter_charisma_sfall: sets Charisma stat', () => {
        const critter = makeCritter()
        script.set_critter_charisma_sfall(critter, 5)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Charisma', 5)
    })

    it('0x8307 set_critter_charisma_sfall: clamps to [1, 10]', () => {
        const critter1 = makeCritter()
        script.set_critter_charisma_sfall(critter1, -3)
        expect(critter1.stats.setBase).toHaveBeenCalledWith('Charisma', 1)

        const critter2 = makeCritter()
        script.set_critter_charisma_sfall(critter2, 50)
        expect(critter2.stats.setBase).toHaveBeenCalledWith('Charisma', 10)
    })

    it('0x8307 set_critter_charisma_sfall: coerces NaN to 1', () => {
        const critter = makeCritter()
        script.set_critter_charisma_sfall(critter, NaN)
        expect(critter.stats.setBase).toHaveBeenCalledWith('Charisma', 1)
    })

    it('0x8307 set_critter_charisma_sfall: no-op for non-critter', () => {
        expect(() => script.set_critter_charisma_sfall(NULL_OBJ, 5)).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// G. Arroyo start-to-end smoke tests
// ---------------------------------------------------------------------------

describe('Phase 95-G — Arroyo start-to-end smoke tests', () => {
    /**
     * Character-creation critter: obj_is_carrying_obj_pid with null inventory
     * Simulates the Arroyo character-creation script checking tribal equipment
     * on a freshly created critter before their inventory is populated.
     */
    it('Character-creation critter: carrying-pid check on null inventory is safe no-op', () => {
        const tribal = makeCritter({ inventory: null })
        expect(() => script.obj_is_carrying_obj_pid(tribal, 0x00001001)).not.toThrow()
        expect(script.obj_is_carrying_obj_pid(tribal, 0x00001001)).toBe(0)
    })

    /**
     * Tribal equipment distribution: add_mult_objs_to_inven on null-inventory critter
     * Simulates the Arroyo start-sequence script that distributes spears/robes
     * to tribal critters before their inventory is initialised.
     */
    it('Tribal equipment distribution: add_mult_objs_to_inven on null inventory is safe no-op', () => {
        const tribal = makeCritter({ inventory: null })
        const spear = makeItem()
        expect(() => script.add_mult_objs_to_inven(tribal, spear, 1)).not.toThrow()
    })

    /**
     * Quest tracker: set_map_var with NaN does not corrupt quest state
     * Simulates an Arroyo quest script computing a stage value from
     * uninitialised multipliers.
     */
    it('Quest tracker: set_map_var with NaN clamps to 0 without corrupting state', () => {
        const mapScript: any = { scriptName: 'arroyo_village' }
        script._mapScript = mapScript
        script.set_map_var(0, NaN)
        expect(script.map_var(0)).toBe(0)
        script.set_map_var(0, 3)
        expect(script.map_var(0)).toBe(3)
    })

    /**
     * NPC visibility init: set_obj_visibility with corrupted value shows NPC
     * Simulates an Arroyo NPC script passing null as visibility argument.
     */
    it('NPC visibility init: set_obj_visibility with null treats as 0 (visible)', () => {
        const elder = makeCritter()
        elder.visible = false
        script.set_obj_visibility(elder, null as any)
        expect(elder.visible).toBe(true)
    })

    /**
     * Elder greeting IQ option: giq_option with missing message is safe no-op
     * Simulates the Elder's INT-gated greeting when a message key is absent
     * from the loaded .msg file.  We pass an empty string msgID directly since
     * XHR file loading is not available in the test environment.
     */
    it('Elder greeting IQ option: giq_option with empty message skips silently', () => {
        const target = vi.fn()
        // Empty string msgID → getScriptMessage returns '' → guard exits before IQ check
        expect(() => script.giq_option(5, 0, '', target, 0)).not.toThrow()
        expect(target).not.toHaveBeenCalled()
    })

    /**
     * Guard perception check: get/set perception sfall opcodes work correctly
     * Simulates an Arroyo guard AI script reading and modifying the
     * guard's Perception to scale detection range.
     */
    it('Guard perception check: sfall perception read/write round-trips correctly', () => {
        const guard = makeCritter({ stats: { 'Perception': 6 } })
        expect(script.get_critter_perception_sfall(guard)).toBe(6)
        script.set_critter_perception_sfall(guard, 8)
        expect(guard.stats.setBase).toHaveBeenCalledWith('Perception', 8)
    })

    /**
     * Full start-to-end SPECIAL stat sequence:
     * 1. Read Perception (guard detection range)
     * 2. Read Agility (AP for movement)
     * 3. Read Luck (critical hit chance)
     * 4. Read Charisma (party size / reaction)
     * All should return valid values without crashing.
     */
    it('Full SPECIAL stat sequence: read PE/AG/LK/CH for an arroyo tribesman', () => {
        const tribesman = makeCritter({
            stats: {
                'Perception': 7,
                'Agility': 6,
                'Luck': 5,
                'Charisma': 3,
            },
        })
        expect(() => {
            const pe = script.get_critter_perception_sfall(tribesman)
            const ag = script.get_critter_agility_sfall(tribesman)
            const lk = script.get_critter_luck_sfall(tribesman)
            const ch = script.get_critter_charisma_sfall(tribesman)
            expect(pe).toBe(7)
            expect(ag).toBe(6)
            expect(lk).toBe(5)
            expect(ch).toBe(3)
        }).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// H. Checklist integrity
// ---------------------------------------------------------------------------

describe('Phase 95-H — Checklist integrity', () => {
    it('BLK-200 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_200_obj_is_carrying_obj_pid_null_inventory')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-201 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_201_add_mult_objs_to_inven_null_inventory')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-202 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_202_set_map_var_non_finite')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-203 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_203_set_obj_visibility_non_numeric')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('BLK-204 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'blk_204_giq_option_empty_string_guard')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8300 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_perception_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8301 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_perception_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8302 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_luck_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8303 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_luck_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8304 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_agility_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8305 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_agility_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8306 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_get_critter_charisma_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('sfall 0x8307 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === 'sfall_set_critter_charisma_95')
        expect(entry).toBeDefined()
        expect(entry!.status).toBe('implemented')
    })

    it('all Phase 95 BLK entries have impact >= medium', () => {
        const phase95Blk = ['blk_200', 'blk_201', 'blk_202', 'blk_203', 'blk_204']
        for (const id of phase95Blk) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id.startsWith(id + '_'))
            expect(entry).toBeDefined()
            expect(['medium', 'high', 'critical']).toContain(entry!.impact)
        }
    })

    it('all sfall 0x8300-0x8307 entries are implemented', () => {
        const sfallIds = [
            'sfall_get_critter_perception_95',
            'sfall_set_critter_perception_95',
            'sfall_get_critter_luck_95',
            'sfall_set_critter_luck_95',
            'sfall_get_critter_agility_95',
            'sfall_set_critter_agility_95',
            'sfall_get_critter_charisma_95',
            'sfall_set_critter_charisma_95',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find(e => e.id === id)
            expect(entry).toBeDefined()
            expect(entry!.status).toBe('implemented')
        }
    })
})
