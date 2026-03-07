/**
 * Phase 17 regression tests.
 *
 * Covers:
 *   A. Save schema v6 — gameTickTime and critterKillCounts migration
 *   B. saveStateFidelity — gameTickTime and critterKillCounts round-trip
 *   C. Scripting — extended statMap (stats 8–33)
 *   D. Scripting — gsay_end and end_dialogue de-stubbed
 *   E. Scripting — anim no longer stubs for rotation/frame cases
 *   F. Scripting — set_exit_grids, tile_contains_pid_obj, wm_area_set_pos, mark_area_known de-stubbed
 *   G. Scripting — has_trait / critter_add_trait OBJECT_CUR_WEIGHT implemented
 *   H. Checklist — critter_add_trait_weight is now 'implemented'
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { snapshotSaveData, hydrateStateFromSave } from './saveStateFidelity.js'
import { Scripting } from './scripting.js'
import { drainStubHits, stubHitCount, SCRIPTING_STUB_CHECKLIST } from './scriptingChecklist.js'

// ---------------------------------------------------------------------------
// A. Save schema v6 — gameTickTime and critterKillCounts
// ---------------------------------------------------------------------------

describe('Phase 17-A — save schema v6: gameTickTime and critterKillCounts', () => {
    it('SAVE_VERSION is now at least 10 (v10 adds playerPerkRanks, v11 adds sfallGlobals)', () => {
        expect(SAVE_VERSION).toBeGreaterThanOrEqual(10)
    })

    it('migrating a v5 save adds gameTickTime=0, empty critterKillCounts, and empty mapVars', () => {
        const raw = {
            version: 5,
            name: 'V5 Save',
            timestamp: 2000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 5, y: 5 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: { karma: 0, reputations: {} },
            scriptGlobalVars: { 0: 50 },
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.gameTickTime).toBe(0)
        expect(migrated.critterKillCounts).toEqual({})
        expect(migrated.mapVars).toEqual({})
        // scriptGlobalVars should be preserved through the migration
        expect(migrated.scriptGlobalVars).toEqual({ 0: 50 })
    })

    it('migrating a v4 save adds scriptGlobalVars, gameTickTime, critterKillCounts, and mapVars', () => {
        const raw = {
            version: 4,
            name: 'V4 Save',
            timestamp: 1000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 5, y: 5 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.scriptGlobalVars).toEqual({})
        expect(migrated.gameTickTime).toBe(0)
        expect(migrated.critterKillCounts).toEqual({})
        expect(migrated.mapVars).toEqual({})
    })

    it('migrating a v1 save migrates all the way to current SAVE_VERSION', () => {
        const raw = {
            version: 1,
            name: 'Old',
            timestamp: 1,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [] },
            party: [],
            savedMaps: {},
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.gameTickTime).toBe(0)
        expect(migrated.critterKillCounts).toEqual({})
        expect(migrated.mapVars).toEqual({})
    })

    it('a v6 save with gameTickTime and critterKillCounts migrates to current version with mapVars={}', () => {
        const raw = {
            version: 6,
            name: 'V6 Save',
            timestamp: 9999,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 100, level: 2, karma: 50 },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: { karma: 50, reputations: {} },
            scriptGlobalVars: { 0: 42 },
            gameTickTime: 123456,
            critterKillCounts: { 0: 7, 3: 15 },
        }
        const migrated = migrateSave(raw)
        expect(migrated.version).toBe(SAVE_VERSION)
        expect(migrated.gameTickTime).toBe(123456)
        expect(migrated.critterKillCounts).toEqual({ 0: 7, 3: 15 })
        expect(migrated.mapVars).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// B. saveStateFidelity — gameTickTime and critterKillCounts round-trip
// ---------------------------------------------------------------------------

describe('Phase 17-B — saveStateFidelity round-trip for v6 fields', () => {
    function makeMinimalState(overrides: Record<string, any> = {}): any {
        return {
            currentElevation: 0,
            gameTickTime: overrides.gameTickTime ?? 5000,
            critterKillCounts: overrides.critterKillCounts ?? { 0: 3 },
            mapVars: overrides.mapVars ?? {},
            worldPosition: undefined,
            gMap: {
                name: 'artemple',
                serialize: () => ({ name: 'artemple' } as any),
                deserialize: (_m: any) => {},
                changeElevation: (_e: any, _u: any) => {},
            },
            player: {
                position: { x: 0, y: 0 },
                orientation: 0,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            gParty: {
                serialize: () => [] as any,
                deserialize: (_p: any) => {},
            },
            dirtyMapCache: {},
            questLog: {
                serialize: () => ({ entries: [] } as any),
            },
            reputation: {
                serialize: () => ({ karma: 0, reputations: {} } as any),
            },
            ...overrides,
        }
    }

    it('snapshotSaveData includes gameTickTime and critterKillCounts', () => {
        const state = makeMinimalState({ gameTickTime: 86400, critterKillCounts: { 3: 5, 4: 2 } })
        const save = snapshotSaveData('test', 0, SAVE_VERSION, state)
        expect(save.gameTickTime).toBe(86400)
        expect(save.critterKillCounts).toEqual({ 3: 5, 4: 2 })
    })

    it('snapshotSaveData with null critterKillCounts stores empty object', () => {
        const state = makeMinimalState({ critterKillCounts: null })
        const save = snapshotSaveData('test', 0, SAVE_VERSION, state)
        expect(save.critterKillCounts).toEqual({})
    })

    it('hydrateStateFromSave restores gameTickTime', () => {
        const save = migrateSave({
            version: 6,
            name: 'test',
            timestamp: 0,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { artemple: { name: 'artemple' } as any },
            gameTickTime: 7200,
            critterKillCounts: {},
        })

        const state = makeMinimalState({ gameTickTime: 0 })
        hydrateStateFromSave(save, state, (o: any) => o)
        expect(state.gameTickTime).toBe(7200)
    })

    it('hydrateStateFromSave restores critterKillCounts', () => {
        const save = migrateSave({
            version: 6,
            name: 'test',
            timestamp: 0,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { artemple: { name: 'artemple' } as any },
            gameTickTime: 0,
            critterKillCounts: { 0: 12, 3: 4 },
        })

        const state = makeMinimalState({ critterKillCounts: {} })
        hydrateStateFromSave(save, state, (o: any) => o)
        expect(state.critterKillCounts).toEqual({ 0: 12, 3: 4 })
    })

    it('hydrateStateFromSave defaults gameTickTime to 0 when absent from save', () => {
        // Simulates loading a v5 save that was migrated (v5→v6 sets gameTickTime=0)
        const save = migrateSave({
            version: 5,
            name: 'test',
            timestamp: 0,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: { artemple: { name: 'artemple' } as any },
        })

        const state = makeMinimalState({ gameTickTime: 9999 })
        hydrateStateFromSave(save, state, (o: any) => o)
        expect(state.gameTickTime).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// C. Scripting — extended statMap (stats 8–33)
// ---------------------------------------------------------------------------

describe('Phase 17-C — extended statMap in get_critter_stat / set_critter_stat', () => {
    it('get_critter_stat stat=8 (Max AP) does not emit a stub hit', () => {
        drainStubHits()
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            getStat: (_s: string) => 7,
        }
        const result = script.get_critter_stat(critter, 8)
        expect(result).toBe(7)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_stat stat=9 (AC) does not emit a stub hit', () => {
        drainStubHits()
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            getStat: (_s: string) => 4,
        }
        const result = script.get_critter_stat(critter, 9)
        expect(result).toBe(4)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_stat stat=17 (DT Normal) does not emit a stub hit', () => {
        drainStubHits()
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            getStat: (_s: string) => 2,
        }
        const result = script.get_critter_stat(critter, 17)
        expect(result).toBe(2)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_stat stat=24 (DR Normal) does not emit a stub hit', () => {
        drainStubHits()
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            getStat: (_s: string) => 20,
        }
        const result = script.get_critter_stat(critter, 24)
        expect(result).toBe(20)
        expect(stubHitCount()).toBe(0)
    })

    it('get_critter_stat stat=33 (Age) does not emit a stub hit', () => {
        drainStubHits()
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            getStat: (_s: string) => 25,
        }
        const result = script.get_critter_stat(critter, 33)
        expect(result).toBe(25)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// D. Scripting — gsay_end and end_dialogue de-stubbed
// ---------------------------------------------------------------------------

describe('Phase 17-D — gsay_end and end_dialogue do not emit stub hits', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('gsay_end does not record a stub hit', () => {
        const script = new Scripting.Script()
        script.gsay_end()
        expect(stubHitCount()).toBe(0)
    })

    it('end_dialogue does not record a stub hit', () => {
        const script = new Scripting.Script()
        // end_dialogue calls dialogueExit → uiEndDialogue which touches the DOM.
        // In a headless test environment this throws; we only care that no stub
        // hit is recorded — i.e. the implementation doesn't call stub().
        try {
            script.end_dialogue()
        } catch (_e) {
            // Expected: DOM is unavailable in the Node test environment.
        }
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// E. Scripting — anim no longer stubs for rotation/frame cases
// ---------------------------------------------------------------------------

describe('Phase 17-E — anim does not stub for handled cases', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('anim(obj, 1000, rotation) does not record a stub hit', () => {
        const script = new Scripting.Script()
        const obj: any = {
            type: 'scenery',
            pid: 1,
            inventory: [],
            visible: true,
            orientation: 0,
        }
        script.anim(obj, 1000, 3) // set rotation to 3
        expect(obj.orientation).toBe(3)
        expect(stubHitCount()).toBe(0)
    })

    it('anim(obj, 1010, frame) does not record a stub hit', () => {
        const script = new Scripting.Script()
        const obj: any = {
            type: 'scenery',
            pid: 1,
            inventory: [],
            visible: true,
            orientation: 0,
            frame: 0,
        }
        script.anim(obj, 1010, 5) // set frame to 5
        expect(obj.frame).toBe(5)
        expect(stubHitCount()).toBe(0)
    })

    it('anim with unknown anim code records a stub hit', () => {
        const script = new Scripting.Script()
        const obj: any = {
            type: 'scenery',
            pid: 1,
            inventory: [],
            visible: true,
            orientation: 0,
        }
        // Phase 24: codes > 1010 (and 100–999) now log silently instead of stubbing to
        // reduce console noise during gameplay.  Code 9999 is no longer a stub hit.
        script.anim(obj, 9999, 0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// F. Scripting — set_exit_grids, tile_contains_pid_obj, wm_area_set_pos,
//                mark_area_known do not emit stub hits
// ---------------------------------------------------------------------------

describe('Phase 17-F — de-stubbed procedures do not emit stub hits', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('wm_area_set_pos does not record a stub hit', () => {
        const script = new Scripting.Script()
        script.wm_area_set_pos(0, 100, 200)
        expect(stubHitCount()).toBe(0)
    })

    it('mark_area_known with areaType=0 and markAreaKnown=null does not record a stub hit', () => {
        const script = new Scripting.Script()
        // markAreaKnown is null in test env; should no longer stub
        script.mark_area_known(0, 5, 1)
        expect(stubHitCount()).toBe(0)
    })

    it('mark_area_known with areaType=1 (MARK_TYPE_MAP) does not record a stub hit', () => {
        const script = new Scripting.Script()
        script.mark_area_known(1, 3, 1)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// G. Scripting — has_trait / critter_add_trait OBJECT_CUR_WEIGHT
// ---------------------------------------------------------------------------

describe('Phase 17-G — OBJECT_CUR_WEIGHT (669) trait operations', () => {
    beforeEach(() => {
        drainStubHits()
    })

    it('has_trait OBJECT_CUR_WEIGHT returns carry weight base stat', () => {
        const script = new Scripting.Script()
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            stats: {
                getBase: (name: string) => name === 'Carry' ? 250 : 0,
                setBase: (_n: string, _v: number) => {},
            },
            getStat: (_s: string) => 0,
        }
        const result = script.has_trait(1, critter, 669)
        expect(result).toBe(250)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait OBJECT_CUR_WEIGHT sets carry base stat', () => {
        const script = new Scripting.Script()
        let carryValue = 0
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            stats: {
                getBase: (_n: string) => carryValue,
                setBase: (_n: string, v: number) => { carryValue = v },
            },
            getStat: (_s: string) => 0,
        }
        script.critter_add_trait(critter, 1, 669, 300)
        expect(carryValue).toBe(300)
        expect(stubHitCount()).toBe(0)
    })

    it('critter_add_trait OBJECT_CUR_WEIGHT clamps negative values to 0', () => {
        const script = new Scripting.Script()
        let carryValue = 100
        const critter: any = {
            type: 'critter',
            pid: 0x01000001,
            inventory: [],
            visible: true,
            orientation: 0,
            isPlayer: false,
            equippedArmor: null,
            aiNum: 0,
            teamNum: 0,
            stats: {
                getBase: (_n: string) => carryValue,
                setBase: (_n: string, v: number) => { carryValue = v },
            },
            getStat: (_s: string) => 0,
        }
        script.critter_add_trait(critter, 1, 669, -50)
        expect(carryValue).toBe(0)
        expect(stubHitCount()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// H. Checklist — critter_add_trait_weight is now 'implemented'
// ---------------------------------------------------------------------------

describe('Phase 17-H — checklist reflects de-stubbed/implemented procedures', () => {
    it('critter_add_trait_weight is now implemented in the checklist', () => {
        const entry = SCRIPTING_STUB_CHECKLIST.find((e) => e.id === 'critter_add_trait_weight')
        expect(entry?.status).toBe('implemented')
    })
})
