/**
 * Phase 34 regression tests.
 *
 * Focus: mid/late critical-path region progression scaffold and persistence
 * (Modoc → Vault City/Gecko → Broken Hills → New Reno → NCR/Redding →
 * San Francisco → Navarro → Enclave/Oil Rig).
 */

import { describe, it, expect } from 'vitest'
import { migrateSave, SAVE_VERSION, SaveGame } from './saveSchema.js'

const GVAR_MODOC_PATH_READY = 8001
const GVAR_VAULT_CITY_CLEARED = 8002
const GVAR_GECKO_REACTOR_FIXED = 8003
const GVAR_NAVARRO_ACCESS = 8004
const GVAR_OIL_RIG_ROUTE_READY = 8005

type LateRegion =
    | 'Modoc'
    | 'Vault City'
    | 'Gecko'
    | 'Broken Hills'
    | 'New Reno'
    | 'NCR'
    | 'Redding'
    | 'San Francisco'
    | 'Navarro'
    | 'Enclave / Oil Rig'

class MidLateCampaignHarness {
    region: LateRegion = 'Modoc'
    currentMap = 'modoc'
    scriptGlobalVars: Record<number, number> = {}
    mapAreaStates: Record<number, boolean> = {}
    worldPosition = { x: 40, y: 30 }

    completeModocChain(): void {
        this.scriptGlobalVars[GVAR_MODOC_PATH_READY] = 1
        this.mapAreaStates[4] = true // Modoc known
    }

    travelToVaultCity(): void {
        if ((this.scriptGlobalVars[GVAR_MODOC_PATH_READY] ?? 0) !== 1) throw new Error('Modoc route not ready')
        this.region = 'Vault City'
        this.currentMap = 'vcmain'
        this.mapAreaStates[5] = true
        this.worldPosition = { x: 48, y: 24 }
    }

    resolveGeckoPowerPath(): void {
        if (this.region !== 'Vault City') throw new Error('Gecko dependency expected from Vault City route')
        this.region = 'Gecko'
        this.currentMap = 'geckmain'
        this.scriptGlobalVars[GVAR_GECKO_REACTOR_FIXED] = 1
        this.scriptGlobalVars[GVAR_VAULT_CITY_CLEARED] = 1
        this.mapAreaStates[6] = true
    }

    travelToBrokenHills(): void {
        if ((this.scriptGlobalVars[GVAR_VAULT_CITY_CLEARED] ?? 0) !== 1) throw new Error('Vault City/Gecko branch incomplete')
        this.region = 'Broken Hills'
        this.currentMap = 'brokmain'
        this.mapAreaStates[7] = true
        this.worldPosition = { x: 56, y: 26 }
    }

    travelToNewReno(): void {
        this.region = 'New Reno'
        this.currentMap = 'renesco'
        this.mapAreaStates[8] = true
        this.worldPosition = { x: 62, y: 30 }
    }

    travelToNcrAndRedding(): void {
        this.region = 'NCR'
        this.currentMap = 'ncrentr'
        this.mapAreaStates[9] = true
        this.region = 'Redding'
        this.currentMap = 'redding'
        this.mapAreaStates[10] = true
        this.worldPosition = { x: 70, y: 28 }
    }

    travelToSanFrancisco(): void {
        this.region = 'San Francisco'
        this.currentMap = 'sfdock'
        this.mapAreaStates[11] = true
        this.scriptGlobalVars[GVAR_NAVARRO_ACCESS] = 1
        this.worldPosition = { x: 78, y: 34 }
    }

    travelToNavarro(): void {
        if ((this.scriptGlobalVars[GVAR_NAVARRO_ACCESS] ?? 0) !== 1) throw new Error('Navarro route not unlocked')
        this.region = 'Navarro'
        this.currentMap = 'navarro'
        this.mapAreaStates[12] = true
        this.scriptGlobalVars[GVAR_OIL_RIG_ROUTE_READY] = 1
    }

    travelToOilRig(): void {
        if ((this.scriptGlobalVars[GVAR_OIL_RIG_ROUTE_READY] ?? 0) !== 1) throw new Error('Oil Rig route not ready')
        this.region = 'Enclave / Oil Rig'
        this.currentMap = 'oilrig'
        this.mapAreaStates[13] = true
        this.worldPosition = { x: 86, y: 38 }
    }

    toSave(name = 'phase34'): SaveGame {
        return {
            version: SAVE_VERSION,
            name,
            timestamp: 999999,
            currentMap: this.currentMap,
            currentElevation: 0,
            worldPosition: { ...this.worldPosition },
            scriptGlobalVars: { ...this.scriptGlobalVars },
            gameTickTime: 0,
            critterKillCounts: {},
            mapVars: {},
            mapAreaStates: { ...this.mapAreaStates },
            playerCharTraits: [],
            playerPerkRanks: {},
            player: {
                position: { x: 0, y: 0 },
                orientation: 0,
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

    static fromSave(raw: Record<string, any>): MidLateCampaignHarness {
        const save = migrateSave(raw)
        const h = new MidLateCampaignHarness()
        h.currentMap = save.currentMap
        h.scriptGlobalVars = { ...(save.scriptGlobalVars ?? {}) }
        h.mapAreaStates = { ...(save.mapAreaStates ?? {}) }
        h.worldPosition = save.worldPosition ?? { x: 0, y: 0 }

        if (h.currentMap === 'oilrig') h.region = 'Enclave / Oil Rig'
        else if (h.currentMap === 'navarro') h.region = 'Navarro'
        else if (h.currentMap === 'sfdock') h.region = 'San Francisco'
        else if (h.currentMap === 'redding') h.region = 'Redding'
        else if (h.currentMap === 'ncrentr') h.region = 'NCR'
        else if (h.currentMap === 'renesco') h.region = 'New Reno'
        else if (h.currentMap === 'brokmain') h.region = 'Broken Hills'
        else if (h.currentMap === 'geckmain') h.region = 'Gecko'
        else if (h.currentMap === 'vcmain') h.region = 'Vault City'
        else h.region = 'Modoc'

        return h
    }
}

describe('Phase 34-A — mid/late region progression scaffold', () => {
    it('progresses from Modoc through Oil Rig with gate checks', () => {
        const h = new MidLateCampaignHarness()

        expect(() => h.travelToVaultCity()).toThrow(/not ready/i)
        h.completeModocChain()
        h.travelToVaultCity()
        h.resolveGeckoPowerPath()
        h.travelToBrokenHills()
        h.travelToNewReno()
        h.travelToNcrAndRedding()
        h.travelToSanFrancisco()
        expect(() => h.travelToOilRig()).toThrow(/not ready/i)
        h.travelToNavarro()
        h.travelToOilRig()

        expect(h.region).toBe('Enclave / Oil Rig')
        expect(h.currentMap).toBe('oilrig')
        expect(h.mapAreaStates[13]).toBe(true)
    })
})

describe('Phase 34-B — mid/late route persistence', () => {
    it('preserves progression globals and area discoveries across save/load', () => {
        const h = new MidLateCampaignHarness()
        h.completeModocChain()
        h.travelToVaultCity()
        h.resolveGeckoPowerPath()
        h.travelToBrokenHills()
        h.travelToNewReno()
        h.travelToNcrAndRedding()
        h.travelToSanFrancisco()
        h.travelToNavarro()

        const loaded = MidLateCampaignHarness.fromSave(JSON.parse(JSON.stringify(h.toSave('midlate-route'))))

        expect(loaded.scriptGlobalVars[GVAR_MODOC_PATH_READY]).toBe(1)
        expect(loaded.scriptGlobalVars[GVAR_VAULT_CITY_CLEARED]).toBe(1)
        expect(loaded.scriptGlobalVars[GVAR_NAVARRO_ACCESS]).toBe(1)
        expect(loaded.scriptGlobalVars[GVAR_OIL_RIG_ROUTE_READY]).toBe(1)
        expect(loaded.mapAreaStates[12]).toBe(true)
        expect(loaded.worldPosition).toEqual({ x: 78, y: 34 })

        loaded.travelToOilRig()
        expect(loaded.region).toBe('Enclave / Oil Rig')
    })
})
