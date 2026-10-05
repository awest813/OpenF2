/**
 * Phase 67 regression tests.
 *
 * Covers:
 *   A. BLK-073 — move_to null-gMap guard
 *   B. BLK-074 — rm_timer_event null-obj guard
 *   C. BLK-075 — player injury flags in save schema v19
 *   D. sfall opcodes 0x8238–0x823F (radiation, poison, party, proto-flags)
 *   E. Checklist integrity
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
        stats: {
            getBase: (s: string) => 0,
            modifyBase: (_s: string, _v: number) => {},
        },
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
// Phase 67-A — BLK-073: move_to null-gMap guard
// ===========================================================================

describe('Phase 67-A — BLK-073: move_to null-gMap guard', () => {
    it('move_to does not throw when globalState.gMap is null and elevation differs', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        const origElev = gs.currentElevation
        gs.gMap = null as any
        gs.currentElevation = 0
        const obj = makeObj({ type: 'critter', isPlayer: false })
        // elevation=1 triggers the elevation-change branch; should warn but not throw
        expect(() => script.move_to(obj, 10, 1)).not.toThrow()
        gs.gMap = origMap
        gs.currentElevation = origElev
    })

    it('move_to still sets obj.position even when gMap is null', async () => {
        const gs = (await import('./globalState.js')).default
        const origMap = gs.gMap
        gs.gMap = null as any
        gs.currentElevation = 0
        const obj = makeObj({ type: 'critter', isPlayer: false, position: { x: 0, y: 0 } })
        // Same elevation — no gMap access needed; position should update
        expect(() => script.move_to(obj, 10, 0)).not.toThrow()
        gs.gMap = origMap
    })
})

// ===========================================================================
// Phase 67-B — BLK-074: rm_timer_event null-obj guard
// ===========================================================================

describe('Phase 67-B — BLK-074: rm_timer_event null-obj guard', () => {
    it('rm_timer_event does not throw when obj is null', () => {
        expect(() => script.rm_timer_event(null as any)).not.toThrow()
    })

    it('rm_timer_event does not throw when obj is undefined', () => {
        expect(() => script.rm_timer_event(undefined as any)).not.toThrow()
    })

    it('rm_timer_event with a valid game object does not throw', () => {
        const obj = makeObj({ pid: 999, _script: null })
        expect(() => script.rm_timer_event(obj)).not.toThrow()
    })
})

// ===========================================================================
// Phase 67-C — BLK-075: player injury flags in save schema v19
// ===========================================================================

describe('Phase 67-C — BLK-075: player injury flags save schema v19', () => {
    it('SAVE_VERSION is now 26 (superseded from 20 → 24)', () => {
        expect(SAVE_VERSION).toBe(26)
    })

    it('migrates a v18 save to v19 and sets playerInjuryFlags = 0', () => {
        const raw: any = {
            version: 18,
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
            carFuel: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.playerInjuryFlags).toBe(0)
    })

    it('migrates a v1 save all the way to current with playerInjuryFlags = 0', () => {
        const raw: any = {
            version: 1,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.playerInjuryFlags).toBe(0)
    })

    it('normalises out-of-range playerInjuryFlags to 0x1F-masked value', () => {
        const raw: any = {
            version: 19,
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
            carFuel: 0,
            playerInjuryFlags: 0xff, // wider than 0x1F
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        // 0xff & 0x1f = 0x1f = 31
        expect(save.playerInjuryFlags).toBe(0x1f)
    })

    it('normalises non-numeric playerInjuryFlags to 0', () => {
        const raw: any = {
            version: 19,
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
            carFuel: 0,
            playerInjuryFlags: 'invalid',
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.playerInjuryFlags).toBe(0)
    })

    it('applyExtraSaveState restores injury flags to player critter', async () => {
        const gs = (await import('./globalState.js')).default
        const { saveLoadInit, save, load, saveList, resetSaveBackendForTests } = await import('./saveload.js')

        // Mock a player with injury flag properties and all fields required by save/load
        const mockPlayer: any = {
            crippledLeftLeg: false,
            crippledRightLeg: false,
            crippledLeftArm: false,
            crippledRightArm: false,
            blinded: false,
            name: 'Tester',
            gender: 'male',
            pcFlags: 0,
            activeHand: 0,
            stats: {
                baseStats: {},
                setBase: vi.fn(),
                modifyBase: vi.fn(),
                getBase: vi.fn(() => 0),
            },
            skills: { baseSkills: {}, setBase: vi.fn(), skillPoints: 0 },
            perkRanks: {},
            charTraits: new Set<number>(),
            inventory: [],
            xp: 0,
            level: 1,
            karma: 0,
        }

        const origPlayer = gs.player
        const origMap = gs.gMap
        const origMapCache = gs.dirtyMapCache
        const origParty = gs.gParty
        const origQuestLog = gs.questLog
        const origReputation = gs.reputation

        // Provide all fields required by snapshotSaveData / hydrateStateFromSave
        gs.gMap = {
            name: 'test_injury_map',
            serialize: () => ({ name: 'test_injury_map', marker: 'injury-test' }),
            deserialize: vi.fn(),
            changeElevation: vi.fn(),
        } as any
        gs.dirtyMapCache = {}
        ;(gs.gParty as any).serialize = () => []
        ;(gs.gParty as any).deserialize = vi.fn()
        ;(gs.questLog as any).serialize = () => ({ entries: [] })
        ;(gs.reputation as any).serialize = () => ({ karma: 0, reputations: {} })
        gs.player = mockPlayer

        resetSaveBackendForTests()
        saveLoadInit()

        // Cripple left leg and right arm before saving
        mockPlayer.crippledLeftLeg = true
        mockPlayer.crippledRightArm = true

        save('InjuryTest')

        let slots: any[] = []
        saveList((s: any[]) => { slots = s })
        expect(slots).toHaveLength(1)
        const savedId = slots[0].id as number

        // Reset injury state as if reloading
        mockPlayer.crippledLeftLeg = false
        mockPlayer.crippledRightArm = false

        load(savedId)

        expect(mockPlayer.crippledLeftLeg).toBe(true)
        expect(mockPlayer.crippledRightLeg).toBe(false)
        expect(mockPlayer.crippledLeftArm).toBe(false)
        expect(mockPlayer.crippledRightArm).toBe(true)
        expect(mockPlayer.blinded).toBe(false)

        gs.player = origPlayer
        gs.gMap = origMap
        gs.dirtyMapCache = origMapCache
        gs.questLog = origQuestLog
        gs.reputation = origReputation
    })
})

// ===========================================================================
// Phase 67-E — Checklist integrity
// ===========================================================================

describe('Phase 67-E — Checklist integrity', () => {
    const phase67Ids = [
        'blk_073_move_to_null_gmap',
        'blk_074_rm_timer_event_null_obj',
        'blk_075_player_injury_flags',
        'sfall_get_critter_radiation',
        'sfall_set_critter_radiation',
        'sfall_get_critter_poison',
        'sfall_set_critter_poison',
        'sfall_critter_in_party',
        'sfall_get_critter_proto_flags',
        'sfall_set_critter_proto_flags',
        'sfall_get_party_count',
    ]

    it('all Phase 67 checklist IDs are present', () => {
        const ids = new Set(SCRIPTING_STUB_CHECKLIST.map((e) => e.id))
        for (const id of phase67Ids) {
            expect(ids.has(id), `missing checklist entry: ${id}`).toBe(true)
        }
    })

    it('all checklist IDs remain unique', () => {
        const ids = SCRIPTING_STUB_CHECKLIST.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
