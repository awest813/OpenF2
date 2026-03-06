/**
 * Regression tests for the save/load system, focusing on schema migration
 * and the new XP/level/karma fields added in version 2 and
 * questLog/reputation fields added in version 3.
 */

import { describe, it, expect } from 'vitest'
import { migrateSave, SAVE_VERSION } from './saveSchema.js'
import { hydrateStateFromSave, snapshotSaveData } from './saveStateFidelity.js'

describe('migrateSave', () => {
    it('returns a v3 save unchanged', () => {
        const raw = {
            version: 3,
            name: 'Test',
            timestamp: 1234567890,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 94, y: 109 }, orientation: 3, inventory: [], xp: 500, level: 2, karma: 10 },
            party: [],
            savedMaps: {},
            questLog: { entries: [{ id: 'q1', state: 'active', stateChangedAt: 1000 }] },
            reputation: { karma: 50, reputations: { Childkiller: 1 } },
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.player.xp).toBe(500)
        expect(save.player.level).toBe(2)
        expect(save.player.karma).toBe(10)
        expect(save.questLog?.entries[0].id).toBe('q1')
        expect(save.reputation?.karma).toBe(50)
    })

    it('migrates a v2 save to v3 and adds empty questLog/reputation', () => {
        const raw = {
            version: 2,
            name: 'Test',
            timestamp: 1234567890,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 94, y: 109 }, orientation: 3, inventory: [], xp: 500, level: 2, karma: 10 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.questLog).toEqual({ entries: [] })
        expect(save.reputation).toEqual({ karma: 0, reputations: {} })
    })

    it('migrates a v1 save to v3 adding default xp/level/karma/questLog/reputation', () => {
        const raw = {
            version: 1,
            name: 'OldSave',
            timestamp: 1000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 10, y: 20 }, orientation: 0, inventory: [] },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.player.xp).toBe(0)
        expect(save.player.level).toBe(1)
        expect(save.player.karma).toBe(0)
        expect(save.questLog).toEqual({ entries: [] })
        expect(save.reputation).toEqual({ karma: 0, reputations: {} })
    })

    it('does not overwrite existing xp/level/karma when migrating v1', () => {
        // If somehow a v1 save already had these fields (edge case), preserve them
        const raw = {
            version: 1,
            name: 'Edge',
            timestamp: 1000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 10, y: 20 }, orientation: 0, inventory: [], xp: 250, level: 3, karma: 5 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        // xp was already set — migration should not zero it out
        expect(save.player.xp).toBe(250)
        expect(save.player.level).toBe(3)
        expect(save.player.karma).toBe(5)
    })

    it('sets each field independently when only some are missing in v1 save', () => {
        // Only xp is missing; level and karma are present
        const raw = {
            version: 1,
            name: 'Partial',
            timestamp: 2000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], level: 5, karma: 3 },
            party: [],
            savedMaps: {},
        }
        const save = migrateSave(raw)
        expect(save.player.xp).toBe(0)       // defaulted
        expect(save.player.level).toBe(5)    // preserved
        expect(save.player.karma).toBe(3)    // preserved
    })

    it('does not overwrite existing questLog/reputation when migrating v2', () => {
        const raw = {
            version: 2,
            name: 'WithData',
            timestamp: 3000000,
            currentMap: 'artemple',
            currentElevation: 0,
            player: { position: { x: 0, y: 0 }, orientation: 0, inventory: [], xp: 0, level: 1, karma: 0 },
            party: [],
            savedMaps: {},
            questLog: { entries: [{ id: 'existing_quest', state: 'completed', stateChangedAt: 500 }] },
            reputation: { karma: 100, reputations: { Berserker: 2 } },
        }
        const save = migrateSave(raw)
        expect(save.version).toBe(SAVE_VERSION)
        expect(save.questLog?.entries[0].id).toBe('existing_quest')
        expect(save.reputation?.karma).toBe(100)
    })

    it('throws for an unknown save version', () => {
        const raw = { version: 999, player: {}, party: [], savedMaps: {} }
        expect(() => migrateSave(raw)).toThrow()
    })
})

describe('save/load fidelity', () => {
    function makeRuntimeState() {
        const elevations: number[] = []
        let deserializedMap: any = null
        let partyState: any[] = []

        const state: any = {
            currentElevation: 2,
            gMap: {
                name: 'vault13',
                serialize: () => ({ name: 'vault13', marker: 'current-map', objects: [{ id: 'crate', x: 4, y: 8 }] }),
                deserialize: (map: any) => {
                    deserializedMap = map
                    state.gMap.name = map.name
                },
                changeElevation: (e: number) => elevations.push(e),
            },
            player: {
                position: { x: 94, y: 109 },
                orientation: 3,
                inventory: [
                    { serialize: () => ({ pid: 41, amount: 2 }) },
                    { serialize: () => ({ pid: 73, amount: 1 }) },
                ],
                xp: 1450,
                level: 4,
                karma: -12,
            },
            gParty: {
                serialize: () => [{ pid: 777, amount: 1 }, { pid: 778, amount: 1 }],
                deserialize: (party: any[]) => {
                    partyState = party
                },
            },
            dirtyMapCache: {
                den_ghostfarm: { name: 'den_ghostfarm', marker: 'dirty-1' },
                arroyo: { name: 'arroyo', marker: 'dirty-2' },
            },
            questLog: {
                serialize: () => ({
                    entries: [
                        { id: 'find_vic', state: 'active', stateChangedAt: 1200 },
                        { id: 'fix_geck', state: 'completed', stateChangedAt: 3400 },
                    ],
                }),
            },
            reputation: {
                serialize: () => ({ karma: 89, reputations: { Childkiller: 0, Berserker: 2 } }),
            },
        }

        return {
            state,
            getDeserializedMap: () => deserializedMap,
            getElevations: () => elevations,
            getPartyState: () => partyState,
        }
    }

    it('round-trips campaign state including map/elevation/party/quests/reputation/karma/inventory/dirty maps', () => {
        const source = makeRuntimeState()
        const save = snapshotSaveData('Campaign-Alpha', 123456, SAVE_VERSION, source.state)

        const target = makeRuntimeState()
        hydrateStateFromSave(save, target.state, (obj) => ({ fromSave: obj }))

        expect(save.currentMap).toBe('vault13')
        expect(save.currentElevation).toBe(2)
        expect(save.player).toMatchObject({
            position: { x: 94, y: 109 },
            orientation: 3,
            xp: 1450,
            level: 4,
            karma: -12,
        })
        expect(save.player.inventory).toEqual([{ pid: 41, amount: 2 }, { pid: 73, amount: 1 }])
        expect(save.party).toEqual([{ pid: 777, amount: 1 }, { pid: 778, amount: 1 }])
        expect(save.questLog).toEqual({
            entries: [
                { id: 'find_vic', state: 'active', stateChangedAt: 1200 },
                { id: 'fix_geck', state: 'completed', stateChangedAt: 3400 },
            ],
        })
        expect(save.reputation).toEqual({ karma: 89, reputations: { Childkiller: 0, Berserker: 2 } })
        expect(save.savedMaps).toEqual({
            vault13: { name: 'vault13', marker: 'current-map', objects: [{ id: 'crate', x: 4, y: 8 }] },
            den_ghostfarm: { name: 'den_ghostfarm', marker: 'dirty-1' },
            arroyo: { name: 'arroyo', marker: 'dirty-2' },
        })

        expect(target.getDeserializedMap()).toEqual({ name: 'vault13', marker: 'current-map', objects: [{ id: 'crate', x: 4, y: 8 }] })
        expect(target.state.player.inventory).toEqual([{ fromSave: { pid: 41, amount: 2 } }, { fromSave: { pid: 73, amount: 1 } }])
        expect(target.state.player.karma).toBe(-12)
        expect(target.getPartyState()).toEqual([{ pid: 777, amount: 1 }, { pid: 778, amount: 1 }])
        expect(target.state.questLog.serialize()).toEqual(save.questLog)
        expect(target.state.reputation.serialize()).toEqual(save.reputation)
        expect(target.getElevations()).toEqual([2])
        expect(target.state.dirtyMapCache).toEqual({
            den_ghostfarm: { name: 'den_ghostfarm', marker: 'dirty-1' },
            arroyo: { name: 'arroyo', marker: 'dirty-2' },
        })

    })

    it('keeps state stable across multi-save and repeated save/load cycles', () => {
        const runA = makeRuntimeState()
        const saveA = snapshotSaveData('Slot-A', 234567, SAVE_VERSION, runA.state)

        const runB = makeRuntimeState()
        hydrateStateFromSave(saveA, runB.state, (obj) => ({ ...obj }))
        runB.state.gMap.serialize = () => ({ name: 'vault13', marker: 'current-map', objects: [{ id: 'crate', x: 4, y: 8 }] })
        runB.state.player.inventory = runB.state.player.inventory.map((obj: any) => ({ serialize: () => obj }))
        runB.state.questLog.serialize = runB.state.questLog.serialize.bind(runB.state.questLog)
        runB.state.reputation.serialize = runB.state.reputation.serialize.bind(runB.state.reputation)
        const saveB = snapshotSaveData('Slot-B', 234567, SAVE_VERSION, runB.state)

        const runC = makeRuntimeState()
        hydrateStateFromSave(saveB, runC.state, (obj) => ({ ...obj }))
        runC.state.gMap.serialize = () => ({ name: 'vault13', marker: 'current-map', objects: [{ id: 'crate', x: 4, y: 8 }] })
        runC.state.player.inventory = runC.state.player.inventory.map((obj: any) => ({ serialize: () => obj }))
        runC.state.questLog.serialize = runC.state.questLog.serialize.bind(runC.state.questLog)
        runC.state.reputation.serialize = runC.state.reputation.serialize.bind(runC.state.reputation)
        const saveC = snapshotSaveData('Slot-C', 234567, SAVE_VERSION, runC.state)

        expect(saveB.player).toEqual(saveA.player)
        expect(saveC.player).toEqual(saveA.player)
        expect(saveB.party).toEqual(saveA.party)
        expect(saveC.party).toEqual(saveA.party)
        expect(saveB.savedMaps).toEqual(saveA.savedMaps)
        expect(saveC.savedMaps).toEqual(saveA.savedMaps)
        expect(saveB.questLog).toEqual(saveA.questLog)
        expect(saveC.questLog).toEqual(saveA.questLog)
        expect(saveB.reputation).toEqual(saveA.reputation)
        expect(saveC.reputation).toEqual(saveA.reputation)

    })

    it('preserves transition-adjacent state when saving during scripted encounter/map transition', () => {
        const runtime = makeRuntimeState()

        runtime.state.currentElevation = 1
        runtime.state.gMap.name = 'encounter_bridge'
        runtime.state.gMap.serialize = () => ({ name: 'encounter_bridge', marker: 'encounter', scriptStage: 'pre-fight' })
        runtime.state.dirtyMapCache = {
            vault13: { name: 'vault13', marker: 'previous-map' },
            random_1: { name: 'random_1', marker: 'encounter-map-old' },
        }
        runtime.state.questLog.serialize = () => ({
            entries: [
                { id: 'bridge_ambush', state: 'active', stateChangedAt: 5000 },
            ],
        })

        const save = snapshotSaveData('During-Transition', 345678, SAVE_VERSION, runtime.state)

        const loaded = makeRuntimeState()
        hydrateStateFromSave(save, loaded.state, (obj) => ({ ...obj }))

        expect(save.currentMap).toBe('encounter_bridge')
        expect(save.currentElevation).toBe(1)
        expect(save.savedMaps.encounter_bridge).toEqual({ name: 'encounter_bridge', marker: 'encounter', scriptStage: 'pre-fight' })
        expect(loaded.state.questLog.getState('bridge_ambush')).toBe('active')
        expect(loaded.state.dirtyMapCache).toEqual({
            vault13: { name: 'vault13', marker: 'previous-map' },
            random_1: { name: 'random_1', marker: 'encounter-map-old' },
        })

    })
})
