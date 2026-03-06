/**
 * Phase 26 regression tests.
 *
 * Focus: early campaign critical path (Temple/Arroyo/Klamath/Den) with
 * save/load continuity for quest globals, map vars, and world-map position.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { migrateSave, SAVE_VERSION, SaveGame } from './saveSchema.js'

const GVAR_START_ARROYO_TRIAL = 10
const GVAR_TALKED_TO_ELDER = 531
const GVAR_DEN_VIC_KNOWN = 452

type Region = 'Arroyo' | 'Klamath' | 'Den'

interface CampaignState {
    region: Region
    currentMap: string
    currentElevation: number
    worldPosition: { x: number; y: number }
    inEncounter: boolean
    scriptGlobalVars: Record<number, number>
    mapVars: Record<string, Record<number, number>>
    mapAreaStates: Record<number, boolean>
}

class EarlyCampaignHarness {
    state: CampaignState = {
        region: 'Arroyo',
        currentMap: 'artemple',
        currentElevation: 0,
        worldPosition: { x: 0, y: 0 },
        inEncounter: false,
        scriptGlobalVars: {
            [GVAR_TALKED_TO_ELDER]: 1,
            [GVAR_START_ARROYO_TRIAL]: 0,
        },
        mapVars: {},
        mapAreaStates: {},
    }

    completeTempleTrial(): void {
        this.state.scriptGlobalVars[GVAR_START_ARROYO_TRIAL] = 1
        if (!this.state.mapVars.artemple) this.state.mapVars.artemple = {}
        // MVAR marker: temple trial completed.
        this.state.mapVars.artemple[0] = 1
    }

    travelToKlamath(): void {
        if (this.state.scriptGlobalVars[GVAR_START_ARROYO_TRIAL] !== 1) {
            throw new Error('cannot leave Arroyo before Temple trial completion')
        }
        this.state.region = 'Klamath'
        this.state.currentMap = 'klamath'
        this.state.worldPosition = { x: 22, y: 14 }
        this.state.mapAreaStates[2] = true // Klamath discovered
    }

    triggerTravelEncounter(): void {
        this.state.inEncounter = true
        this.state.currentMap = 'encounter_wastes'
    }

    resolveEncounterIntoKlamath(): void {
        if (!this.state.inEncounter) throw new Error('no encounter to resolve')
        this.state.inEncounter = false
        this.state.currentMap = 'klamath'
        this.state.region = 'Klamath'
    }

    unlockDenRouteViaVicLead(): void {
        if (this.state.region !== 'Klamath') throw new Error('Vic lead is unlocked from Klamath branch')
        this.state.scriptGlobalVars[GVAR_DEN_VIC_KNOWN] = 1
        if (!this.state.mapVars.klamath) this.state.mapVars.klamath = {}
        // MVAR marker: player got the Den/Vic lead.
        this.state.mapVars.klamath[7] = 1
    }

    travelToDen(): void {
        if ((this.state.scriptGlobalVars[GVAR_DEN_VIC_KNOWN] ?? 0) < 1) {
            throw new Error('Den route is still gated (Vic lead unknown)')
        }
        this.state.region = 'Den'
        this.state.currentMap = 'denbus1'
        this.state.worldPosition = { x: 29, y: 17 }
        this.state.mapAreaStates[3] = true // Den discovered
    }

    saveSnapshot(name = 'phase26'): SaveGame {
        return {
            version: SAVE_VERSION,
            name,
            timestamp: 123456789,
            currentMap: this.state.currentMap,
            currentElevation: this.state.currentElevation,
            worldPosition: { ...this.state.worldPosition },
            scriptGlobalVars: { ...this.state.scriptGlobalVars },
            gameTickTime: 98765,
            critterKillCounts: {},
            mapVars: JSON.parse(JSON.stringify(this.state.mapVars)),
            mapAreaStates: { ...this.state.mapAreaStates },
            playerCharTraits: [],
            playerPerkRanks: {},
            player: {
                position: { x: 94, y: 109 },
                orientation: 3,
                inventory: [],
                xp: 0,
                level: 1,
                karma: 0,
            },
            party: [],
            savedMaps: {},
            questLog: { entries: [] },
            reputation: { karma: 0, reputations: {} },
        }
    }

    static loadSnapshot(raw: Record<string, any>): EarlyCampaignHarness {
        const migrated = migrateSave(raw)
        const harness = new EarlyCampaignHarness()
        harness.state.currentMap = migrated.currentMap
        harness.state.currentElevation = migrated.currentElevation
        harness.state.worldPosition = migrated.worldPosition ?? { x: 0, y: 0 }
        harness.state.scriptGlobalVars = { ...(migrated.scriptGlobalVars ?? {}) }
        harness.state.mapVars = JSON.parse(JSON.stringify(migrated.mapVars ?? {}))
        harness.state.mapAreaStates = { ...(migrated.mapAreaStates ?? {}) }
        harness.state.inEncounter = false

        if (harness.state.currentMap.startsWith('den')) harness.state.region = 'Den'
        else if (harness.state.currentMap.startsWith('klamath')) harness.state.region = 'Klamath'
        else harness.state.region = 'Arroyo'

        return harness
    }
}

describe('Phase 26-A — Arroyo and Temple gating', () => {
    let h: EarlyCampaignHarness

    beforeEach(() => {
        h = new EarlyCampaignHarness()
    })

    it('starts in Arroyo with Elder conversation already tracked', () => {
        expect(h.state.region).toBe('Arroyo')
        expect(h.state.currentMap).toBe('artemple')
        expect(h.state.scriptGlobalVars[GVAR_TALKED_TO_ELDER]).toBe(1)
    })

    it('blocks travel to Klamath before temple trial completion', () => {
        expect(() => h.travelToKlamath()).toThrow(/cannot leave Arroyo/i)
    })

    it('temple completion sets global and map quest markers', () => {
        h.completeTempleTrial()
        expect(h.state.scriptGlobalVars[GVAR_START_ARROYO_TRIAL]).toBe(1)
        expect(h.state.mapVars.artemple?.[0]).toBe(1)
    })
})

describe('Phase 26-B — Klamath/Den route progression', () => {
    let h: EarlyCampaignHarness

    beforeEach(() => {
        h = new EarlyCampaignHarness()
        h.completeTempleTrial()
        h.travelToKlamath()
    })

    it('arrives in Klamath and marks area discovered', () => {
        expect(h.state.region).toBe('Klamath')
        expect(h.state.currentMap).toBe('klamath')
        expect(h.state.mapAreaStates[2]).toBe(true)
    })

    it('encounter transition resolves back into Klamath safely', () => {
        h.triggerTravelEncounter()
        expect(h.state.inEncounter).toBe(true)
        expect(h.state.currentMap).toBe('encounter_wastes')

        h.resolveEncounterIntoKlamath()
        expect(h.state.inEncounter).toBe(false)
        expect(h.state.currentMap).toBe('klamath')
    })

    it('Den route is gated until Vic lead global is set', () => {
        expect(() => h.travelToDen()).toThrow(/gated/i)
    })

    it('unlocking Vic lead allows travel to Den and discovers Den area', () => {
        h.unlockDenRouteViaVicLead()
        h.travelToDen()

        expect(h.state.region).toBe('Den')
        expect(h.state.currentMap).toBe('denbus1')
        expect(h.state.scriptGlobalVars[GVAR_DEN_VIC_KNOWN]).toBe(1)
        expect(h.state.mapVars.klamath?.[7]).toBe(1)
        expect(h.state.mapAreaStates[3]).toBe(true)
    })
})

describe('Phase 26-C — save/load continuity on early campaign path', () => {
    it('persists early-game quest globals and map vars across save/load', () => {
        const h = new EarlyCampaignHarness()
        h.completeTempleTrial()
        h.travelToKlamath()
        h.unlockDenRouteViaVicLead()

        const save = h.saveSnapshot('arroyo-klamath-midrun')
        const loaded = EarlyCampaignHarness.loadSnapshot(JSON.parse(JSON.stringify(save)))

        expect(loaded.state.scriptGlobalVars[GVAR_START_ARROYO_TRIAL]).toBe(1)
        expect(loaded.state.scriptGlobalVars[GVAR_DEN_VIC_KNOWN]).toBe(1)
        expect(loaded.state.mapVars.artemple?.[0]).toBe(1)
        expect(loaded.state.mapVars.klamath?.[7]).toBe(1)
    })

    it('preserves world position/current map and allows continued travel to Den after reload', () => {
        const h = new EarlyCampaignHarness()
        h.completeTempleTrial()
        h.travelToKlamath()
        h.unlockDenRouteViaVicLead()

        const save = h.saveSnapshot('pre-den-travel')
        const loaded = EarlyCampaignHarness.loadSnapshot(JSON.parse(JSON.stringify(save)))

        expect(loaded.state.currentMap).toBe('klamath')
        expect(loaded.state.worldPosition).toEqual({ x: 22, y: 14 })

        loaded.travelToDen()
        expect(loaded.state.region).toBe('Den')
        expect(loaded.state.currentMap).toBe('denbus1')
    })
})
