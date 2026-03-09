/**
 * Phase 82 regression tests.
 *
 * Covers:
 *   A. BLK-139 — Global browser error boundary checklist entry
 *   B. BLK-140 — callProcedureSafe: script trigger try-catch (talk, critter, timed, etc.)
 *   C. BLK-142 — map_update per-object isolation (one bad NPC does not abort others)
 *   D. BLK-143 — timedEvent error isolation
 *   E. sfall opcodes 0x82A0–0x82A7
 *   F. Checklist integrity
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
        frame: 0,
        teamNum: -1,
        rightHand: null,
        leftHand: null,
        equippedArmor: null,
        perkRanks: {},
        getStat: (s: string) => (s === 'Max HP' ? 100 : s === 'HP' ? 80 : s === 'Max AP' ? 10 : 5),
        getSkill: (_s: string) => 50,
        pcFlags: 0,
        critterFlags: 0,
        stats: {
            getBase: (_s: string) => 5,
            setBase: vi.fn(),
            modifyBase: vi.fn(),
        },
        ...overrides,
    }
}

let script: Scripting.Script

beforeEach(() => {
    Scripting.init('test_map', 0)
    script = new Scripting.Script()
    ;(globalState as any).floatMessages = []
    Scripting.setGlobalVars({})
})

afterEach(() => {
    vi.restoreAllMocks()
    drainStubHits()
    ;(globalState as any).floatMessages = []
})

// ===========================================================================
// Phase 82-A — BLK-139: Global error boundary checklist entry
// ===========================================================================

describe('Phase 82-A — BLK-139: global error boundary checklist', () => {
    it('BLK-139 entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_139_global_error_boundary')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('BLK-139 has high impact', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_139_global_error_boundary')
        expect(entry?.impact).toBe('high')
    })
})

// ===========================================================================
// Phase 82-B — BLK-140: callProcedureSafe — script trigger isolation
//
// We test that each trigger dispatch function:
//  (a) does not throw when the underlying procedure throws
//  (b) returns the correct safe default (false / null / undefined)
//  (c) keeps the game loop intact after the error
// ===========================================================================

describe('Phase 82-B — BLK-140: callProcedureSafe script trigger isolation', () => {
    it('BLK-140 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_140_script_trigger_try_catch')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    // ---- talk_p_proc ----
    describe('talk_p_proc safe dispatch', () => {
        it('does not throw when talk_p_proc throws internally', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_talk'
            ;(throwingScript as any).talk_p_proc = () => {
                throw new Error('simulated talk crash')
            }
            const npc = makeObj()
            expect(() => Scripting.talk(throwingScript, npc)).not.toThrow()
        })

        it('returns false (no override) when talk_p_proc throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_talk'
            ;(throwingScript as any).talk_p_proc = () => {
                throw new Error('simulated talk crash')
            }
            const npc = makeObj()
            const result = Scripting.talk(throwingScript, npc)
            expect(result).toBe(false)
        })

        it('works correctly when talk_p_proc succeeds', () => {
            const goodScript = new Scripting.Script()
            goodScript.scriptName = 'test_good_talk'
            let ran = false
            ;(goodScript as any).talk_p_proc = () => {
                ran = true
            }
            const npc = makeObj()
            Scripting.talk(goodScript, npc)
            expect(ran).toBe(true)
        })
    })

    // ---- timedEvent safe dispatch (BLK-143) ----
    describe('timed_event_p_proc safe dispatch (BLK-143)', () => {
        it('BLK-143 checklist entry is present and implemented', () => {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_143_timer_event_isolation')
            expect(entry).toBeDefined()
            expect(entry?.status).toBe('implemented')
        })

        it('does not throw when timed_event_p_proc throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_timer'
            ;(throwingScript as any).timed_event_p_proc = () => {
                throw new Error('simulated timer crash')
            }
            expect(() => Scripting.timedEvent(throwingScript, 42)).not.toThrow()
        })

        it('returns false when timed_event_p_proc throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_timer'
            ;(throwingScript as any).timed_event_p_proc = () => {
                throw new Error('simulated timer crash')
            }
            const result = Scripting.timedEvent(throwingScript, 42)
            expect(result).toBe(false)
        })

        it('second timer fires after first timer throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_timer'
            ;(throwingScript as any).timed_event_p_proc = () => {
                throw new Error('first throws')
            }

            const goodScript = new Scripting.Script()
            goodScript.scriptName = 'test_good_timer'
            let secondFired = false
            ;(goodScript as any).timed_event_p_proc = () => {
                secondFired = true
            }

            expect(() => Scripting.timedEvent(throwingScript, 1)).not.toThrow()
            expect(() => Scripting.timedEvent(goodScript, 2)).not.toThrow()
            expect(secondFired).toBe(true)
        })
    })

    // ---- use_p_proc safe dispatch ----
    describe('use_p_proc safe dispatch', () => {
        it('does not throw when use_p_proc throws', () => {
            const obj = makeObj()
            obj._script = { scriptName: 'test_use', use_p_proc: () => { throw new Error('use crash') } }
            expect(() => Scripting.use(obj, makeObj())).not.toThrow()
        })

        it('returns null when no script', () => {
            const obj = makeObj()
            expect(Scripting.use(obj, makeObj())).toBeNull()
        })
    })

    // ---- look_at_p_proc safe dispatch ----
    describe('look_at_p_proc safe dispatch', () => {
        it('does not throw when look_at_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_lookat',
                look_at_p_proc: () => { throw new Error('lookat crash') },
                _didOverride: false,
            }
            expect(() => Scripting.lookAt(obj, makeObj())).not.toThrow()
        })
    })

    // ---- pickup_p_proc safe dispatch ----
    describe('pickup_p_proc safe dispatch', () => {
        it('does not throw when pickup_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_pickup',
                pickup_p_proc: () => { throw new Error('pickup crash') },
                _didOverride: false,
            }
            expect(() => Scripting.pickup(obj, makeObj())).not.toThrow()
        })
    })

    // ---- push_p_proc safe dispatch ----
    describe('push_p_proc safe dispatch', () => {
        it('does not throw when push_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_push',
                push_p_proc: () => { throw new Error('push crash') },
                _didOverride: false,
            }
            expect(() => Scripting.push(obj, makeObj())).not.toThrow()
        })
    })

    // ---- destroy_p_proc safe dispatch ----
    describe('destroy_p_proc safe dispatch', () => {
        it('does not throw when destroy_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_destroy',
                destroy_p_proc: () => { throw new Error('destroy crash') },
                _didOverride: false,
            }
            expect(() => Scripting.destroy(obj)).not.toThrow()
        })
    })

    // ---- damage_p_proc safe dispatch ----
    describe('damage_p_proc safe dispatch', () => {
        it('does not throw when damage_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_damage',
                damage_p_proc: () => { throw new Error('damage crash') },
                _didOverride: false,
            }
            expect(() => Scripting.damage(obj, makeObj(), makeObj(), 10)).not.toThrow()
        })
    })

    // ---- use_obj_on_p_proc safe dispatch ----
    describe('use_obj_on_p_proc safe dispatch', () => {
        it('does not throw when use_obj_on_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_use_obj_on',
                use_obj_on_p_proc: () => { throw new Error('use_obj_on crash') },
                _didOverride: false,
            }
            expect(() => Scripting.useObjOn(obj, makeObj())).not.toThrow()
        })
    })

    // ---- use_skill_on_p_proc safe dispatch ----
    describe('use_skill_on_p_proc safe dispatch', () => {
        it('does not throw when use_skill_on_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_use_skill_on',
                use_skill_on_p_proc: () => { throw new Error('use_skill_on crash') },
                _didOverride: false,
            }
            expect(() => Scripting.useSkillOn(makeObj(), 9, obj)).not.toThrow()
        })
    })

    // ---- is_dropping_p_proc safe dispatch ----
    describe('is_dropping_p_proc safe dispatch', () => {
        it('does not throw when is_dropping_p_proc throws', () => {
            const obj = makeObj()
            obj._script = {
                scriptName: 'test_is_dropping',
                is_dropping_p_proc: () => { throw new Error('is_dropping crash') },
                _didOverride: false,
            }
            expect(() => Scripting.isDropping(obj, makeObj())).not.toThrow()
        })
    })

    // ---- critter_p_proc safe dispatch ----
    describe('critter_p_proc safe dispatch', () => {
        it('does not throw when critter_p_proc throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_critter'
            ;(throwingScript as any).critter_p_proc = () => {
                throw new Error('simulated critter crash')
            }
            const npc = makeObj()
            expect(() => Scripting.updateCritter(throwingScript, npc)).not.toThrow()
        })

        it('returns false when critter_p_proc throws', () => {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = 'test_throw_critter'
            ;(throwingScript as any).critter_p_proc = () => {
                throw new Error('crash')
            }
            const result = Scripting.updateCritter(throwingScript, makeObj())
            expect(result).toBe(false)
        })
    })
})

// ===========================================================================
// Phase 82-C — BLK-142: map_update per-object isolation
// ===========================================================================

describe('Phase 82-C — BLK-142: map_update per-object isolation', () => {
    it('BLK-142 checklist entry is present and implemented', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'blk_141_map_update_per_object_isolation')
        expect(entry).toBeDefined()
        expect(entry?.status).toBe('implemented')
    })

    it('updateMap does not throw when one NPC map_update_p_proc throws', () => {
        const throwNPC = makeObj()
        throwNPC._script = {
            scriptName: 'bad_npc',
            map_update_p_proc: () => { throw new Error('bad npc crash') },
        }
        const goodNPC = makeObj()
        let goodRan = false
        goodNPC._script = {
            scriptName: 'good_npc',
            map_update_p_proc: () => { goodRan = true },
        }
        const mapScript = new Scripting.Script()
        mapScript.scriptName = 'test_map'
        expect(() => Scripting.updateMap(mapScript, [throwNPC, goodNPC], 0)).not.toThrow()
    })

    it('second NPC map_update_p_proc still runs after first throws', () => {
        const throwNPC = makeObj()
        throwNPC._script = {
            scriptName: 'bad_npc',
            map_update_p_proc: () => { throw new Error('first npc crash') },
        }
        const goodNPC = makeObj()
        let goodRan = false
        goodNPC._script = {
            scriptName: 'good_npc',
            map_update_p_proc: () => { goodRan = true },
        }
        const mapScript = new Scripting.Script()
        mapScript.scriptName = 'test_map'
        Scripting.updateMap(mapScript, [throwNPC, goodNPC], 0)
        expect(goodRan).toBe(true)
    })

    it('all N NPCs with good scripts run, even after bad NPC', () => {
        const objects: any[] = []
        const runCount = { value: 0 }

        // First NPC throws
        const throwNPC = makeObj()
        throwNPC._script = {
            scriptName: 'bad_npc',
            map_update_p_proc: () => { throw new Error('throw') },
        }
        objects.push(throwNPC)

        // 3 more NPCs succeed
        for (let i = 0; i < 3; i++) {
            const npc = makeObj()
            npc._script = {
                scriptName: `good_npc_${i}`,
                map_update_p_proc: () => { runCount.value++ },
            }
            objects.push(npc)
        }

        const mapScript = new Scripting.Script()
        mapScript.scriptName = 'test_map'
        Scripting.updateMap(mapScript, objects, 0)
        expect(runCount.value).toBe(3)
    })

    it('map script map_update_p_proc throws but object scripts still run', () => {
        const throwMapScript = new Scripting.Script()
        throwMapScript.scriptName = 'bad_map_script'
        ;(throwMapScript as any).map_update_p_proc = () => { throw new Error('map script crash') }

        const goodNPC = makeObj()
        let goodRan = false
        goodNPC._script = {
            scriptName: 'good_npc',
            map_update_p_proc: () => { goodRan = true },
        }

        expect(() => Scripting.updateMap(throwMapScript, [goodNPC], 0)).not.toThrow()
        expect(goodRan).toBe(true)
    })
})

// ===========================================================================
// Phase 82-E — sfall opcodes 0x82A0–0x82A7
// ===========================================================================

describe('Phase 82-E-1 — sfall 0x82A0: get_worldmap_free_move_sfall', () => {
    it('returns 0', () => {
        expect(script.get_worldmap_free_move_sfall()).toBe(0)
    })

    it('does not throw', () => {
        expect(() => script.get_worldmap_free_move_sfall()).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_worldmap_free_move_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-2 — sfall 0x82A1: set_worldmap_free_move_sfall', () => {
    it('does not throw', () => {
        expect(() => script.set_worldmap_free_move_sfall(1)).not.toThrow()
        expect(() => script.set_worldmap_free_move_sfall(0)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_worldmap_free_move_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-3 — sfall 0x82A2: get_car_current_town_sfall', () => {
    it('returns -1 when carAreaID not set', () => {
        const orig = (globalState as any).carAreaID
        delete (globalState as any).carAreaID
        const result = script.get_car_current_town_sfall()
        expect(result).toBe(-1)
        if (orig !== undefined) (globalState as any).carAreaID = orig
    })

    it('returns carAreaID when set', () => {
        const orig = (globalState as any).carAreaID
        ;(globalState as any).carAreaID = 7
        expect(script.get_car_current_town_sfall()).toBe(7)
        if (orig !== undefined) {
            ;(globalState as any).carAreaID = orig
        } else {
            delete (globalState as any).carAreaID
        }
    })

    it('does not throw', () => {
        expect(() => script.get_car_current_town_sfall()).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_car_current_town_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-4 — sfall 0x82A3: get_dude_obj_sfall', () => {
    it('returns 0 when no player', () => {
        const origPlayer = globalState.player
        ;(globalState as any).player = null
        const result = script.get_dude_obj_sfall()
        expect(result).toBe(0)
        ;(globalState as any).player = origPlayer
    })

    it('returns player when player exists', () => {
        const origPlayer = globalState.player
        const mockPlayer = makeObj({ name: 'Player' })
        ;(globalState as any).player = mockPlayer
        const result = script.get_dude_obj_sfall()
        expect(result).toBe(mockPlayer)
        ;(globalState as any).player = origPlayer
    })

    it('does not throw', () => {
        expect(() => script.get_dude_obj_sfall()).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_dude_obj_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-5 — sfall 0x82A4: set_dude_obj_sfall', () => {
    it('does not throw', () => {
        expect(() => script.set_dude_obj_sfall(makeObj())).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_dude_obj_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-6 — sfall 0x82A5: get_critter_max_ap_sfall', () => {
    it('returns 0 for non-critter', () => {
        expect(script.get_critter_max_ap_sfall(0 as any)).toBe(0)
        expect(script.get_critter_max_ap_sfall(null as any)).toBe(0)
    })

    it('derives max AP from AGI stat for valid critter', () => {
        // Implementation uses: 5 + floor(AGI / 2) with 'AGI' stat key
        const critter = makeObj({ getStat: (s: string) => s === 'AGI' ? 8 : 5 })
        const result = script.get_critter_max_ap_sfall(critter)
        // Expected: 5 + floor(8/2) = 5 + 4 = 9
        expect(result).toBe(9)
    })

    it('returns a positive number from Fallout 2 AP formula', () => {
        const critter = makeObj({ getStat: (s: string) => s === 'AGI' ? 5 : 5 })
        const result = script.get_critter_max_ap_sfall(critter)
        // 5 + floor(5/2) = 5 + 2 = 7
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThan(0)
    })

    it('does not throw for non-game-object', () => {
        expect(() => script.get_critter_max_ap_sfall(undefined as any)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_critter_max_ap_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-7 — sfall 0x82A6: get_tile_light_level_sfall', () => {
    it('returns 0', () => {
        expect(script.get_tile_light_level_sfall(100)).toBe(0)
        expect(script.get_tile_light_level_sfall(0)).toBe(0)
    })

    it('does not throw for invalid tiles', () => {
        expect(() => script.get_tile_light_level_sfall(-1)).not.toThrow()
        expect(() => script.get_tile_light_level_sfall(NaN)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_get_tile_light_level_82')
        expect(entry?.status).toBe('implemented')
    })
})

describe('Phase 82-E-8 — sfall 0x82A7: set_tile_light_level_sfall', () => {
    it('does not throw', () => {
        expect(() => script.set_tile_light_level_sfall(100, 32768)).not.toThrow()
    })

    it('does not throw for invalid arguments', () => {
        expect(() => script.set_tile_light_level_sfall(-1, NaN)).not.toThrow()
    })

    it('is registered in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'sfall_set_tile_light_level_82')
        expect(entry?.status).toBe('implemented')
    })
})

// ===========================================================================
// Phase 82-F — sfall method registration check (0x82A0–0x82A7)
// ===========================================================================

describe('Phase 82-F — sfall 0x82A0–0x82A7 scripting methods exist', () => {
    const phase82Methods = [
        'get_worldmap_free_move_sfall',
        'set_worldmap_free_move_sfall',
        'get_car_current_town_sfall',
        'get_dude_obj_sfall',
        'set_dude_obj_sfall',
        'get_critter_max_ap_sfall',
        'get_tile_light_level_sfall',
        'set_tile_light_level_sfall',
    ]

    for (const methodName of phase82Methods) {
        it(`script.${methodName} is a function`, () => {
            expect(typeof (script as any)[methodName]).toBe('function')
        })
    }
})

// ===========================================================================
// Phase 82-G — Checklist integrity
// ===========================================================================

describe('Phase 82-G — Checklist integrity', () => {
    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('all entries have valid kind values', () => {
        const validKinds = ['opcode', 'procedure', 'metarule', 'bug']
        for (const entry of SCRIPTING_STUB_CHECKLIST) {
            expect(validKinds, `invalid kind '${entry.kind}' for '${entry.id}'`).toContain(entry.kind)
        }
    })

    it('all Phase 82 BLK entries are implemented', () => {
        const phase82BLKIds = [
            'blk_139_global_error_boundary',
            'blk_140_script_trigger_try_catch',
            'blk_141_map_update_per_object_isolation',
            'blk_143_timer_event_isolation',
        ]
        for (const id of phase82BLKIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('all Phase 82 sfall opcode entries are implemented', () => {
        const sfallIds = [
            'sfall_get_worldmap_free_move_82',
            'sfall_set_worldmap_free_move_82',
            'sfall_get_car_current_town_82',
            'sfall_get_dude_obj_82',
            'sfall_set_dude_obj_82',
            'sfall_get_critter_max_ap_82',
            'sfall_get_tile_light_level_82',
            'sfall_set_tile_light_level_82',
        ]
        for (const id of sfallIds) {
            const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === id)
            expect(entry, `missing checklist entry: ${id}`).toBeDefined()
            expect(entry?.status, `${id} not implemented`).toBe('implemented')
        }
    })

    it('callProcedureSafe: multiple consecutive errors do not corrupt game state', () => {
        // Simulate 5 consecutive failing script triggers — each should not affect the next
        for (let i = 0; i < 5; i++) {
            const throwingScript = new Scripting.Script()
            throwingScript.scriptName = `crash_${i}`
            ;(throwingScript as any).talk_p_proc = () => { throw new Error(`crash ${i}`) }
            expect(() => Scripting.talk(throwingScript, makeObj())).not.toThrow()
        }

        // After all crashes, a successful talk still works
        const goodScript = new Scripting.Script()
        goodScript.scriptName = 'good_after_crashes'
        let ran = false
        ;(goodScript as any).talk_p_proc = () => { ran = true }
        Scripting.talk(goodScript, makeObj())
        expect(ran).toBe(true)
    })
})
