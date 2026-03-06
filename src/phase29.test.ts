/**
 * Phase 29 regression tests.
 *
 * Focus: long-campaign save/load hardening via repeated snapshot/hydration
 * cycles covering timers, world position, map vars, map-area states, party,
 * traits, and perk ranks.
 */

import { describe, it, expect } from 'vitest'
import { SAVE_VERSION } from './saveSchema.js'
import { snapshotSaveData, hydrateStateFromSave } from './saveStateFidelity.js'
import { QuestLog } from './quest/questLog.js'
import { Reputation } from './quest/reputation.js'

function makeRuntimeState() {
    let deserializedMap: any = null
    const elevations: number[] = []

    const state: any = {
        currentElevation: 0,
        worldPosition: { x: 120, y: 240 },
        gameTickTime: 1000,
        critterKillCounts: { 0: 2, 3: 1 },
        mapVars: { artemple: { 0: 1 }, klamath: { 7: 1 } },
        mapAreaStates: { 0: true, 2: true, 3: true },
        playerCharTraits: [0, 4],
        playerPerkRanks: { 15: 1, 29: 2 },
        gMap: {
            name: 'klamath',
            serialize: () => ({ name: 'klamath', marker: 'active-map' }),
            deserialize: (m: any) => {
                deserializedMap = m
                state.gMap.name = m.name
            },
            changeElevation: (e: number) => elevations.push(e),
        },
        player: {
            position: { x: 94, y: 109 },
            orientation: 3,
            inventory: [{ serialize: () => ({ pid: 41, amount: 2 }) }],
            xp: 2000,
            level: 5,
            karma: 25,
        },
        gParty: {
            serialize: () => [{ pid: 777, amount: 1 }],
            deserialize: () => {},
        },
        dirtyMapCache: { arroyo: { name: 'arroyo', marker: 'cached' } },
        questLog: new QuestLog(),
        reputation: new Reputation(),
    }
    state.questLog.start('find_vic', 1000)
    state.reputation.setKarma(25)
    state.reputation.setReputation('Klamath', 2)

    return { state, getDeserializedMap: () => deserializedMap, getElevations: () => elevations }
}

function normalizeForNextSnapshot(state: any) {
    state.player.inventory = state.player.inventory.map((item: any) => ({
        serialize: () => ({ ...item }),
    }))
    state.questLog.serialize = state.questLog.serialize.bind(state.questLog)
    state.reputation.serialize = state.reputation.serialize.bind(state.reputation)
}

describe('Phase 29-A — repeated long-campaign roundtrip stability', () => {
    it('remains stable over repeated save/load cycles without state drift', () => {
        let runtime = makeRuntimeState()

        for (let i = 0; i < 20; i++) {
            const save = snapshotSaveData(`long-run-${i}`, 1000 + i, SAVE_VERSION, runtime.state)
            const copy = JSON.parse(JSON.stringify(save))

            const next = makeRuntimeState()
            hydrateStateFromSave(copy, next.state, (obj) => ({ ...obj }))

            expect(next.state.worldPosition).toEqual(runtime.state.worldPosition)
            expect(next.state.gameTickTime).toBe(runtime.state.gameTickTime)
            expect(next.state.mapVars).toEqual(runtime.state.mapVars)
            expect(next.state.mapAreaStates).toEqual(runtime.state.mapAreaStates)
            expect(next.state.playerCharTraits).toEqual(runtime.state.playerCharTraits)
            expect(next.state.playerPerkRanks).toEqual(runtime.state.playerPerkRanks)
            expect(next.state.critterKillCounts).toEqual(runtime.state.critterKillCounts)
            expect(next.getDeserializedMap()).toEqual({ name: 'klamath', marker: 'active-map' })
            expect(next.getElevations()).toEqual([runtime.state.currentElevation])

            // Simulate campaign progress before next cycle.
            next.state.gameTickTime += 600
            next.state.worldPosition = {
                x: next.state.worldPosition.x + 1,
                y: next.state.worldPosition.y + 2,
            }
            next.state.critterKillCounts[0] = (next.state.critterKillCounts[0] ?? 0) + 1
            next.state.mapVars.klamath[7] = (next.state.mapVars.klamath[7] ?? 0) + 1
            next.state.playerPerkRanks[29] = (next.state.playerPerkRanks[29] ?? 0) + 1

            normalizeForNextSnapshot(next.state)
            runtime = next
        }

        expect(runtime.state.gameTickTime).toBe(1000 + 20 * 600)
        expect(runtime.state.worldPosition).toEqual({ x: 120 + 20, y: 240 + 40 })
        expect(runtime.state.critterKillCounts[0]).toBe(2 + 20)
        expect(runtime.state.mapVars.klamath[7]).toBe(1 + 20)
        expect(runtime.state.playerPerkRanks[29]).toBe(2 + 20)
    })
})
