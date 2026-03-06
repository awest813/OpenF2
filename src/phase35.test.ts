/**
 * Phase 35 regression tests.
 *
 * Focus: full critical-path scaffold run from early game through ending-flow
 * trigger, including save/load continuity and release-gate artifact sanity.
 */

import { describe, it, expect } from 'vitest'
import { migrateSave, SAVE_VERSION, SaveGame } from './saveSchema.js'
import { readFileSync } from 'node:fs'

const GVAR_TEMPLE_DONE = 9001
const GVAR_DEN_ROUTE = 9002
const GVAR_MIDLATE_ROUTE = 9003
const GVAR_NAVARRO_ACCESS = 9004
const GVAR_OILRIG_READY = 9005
const GVAR_ENDING_TRIGGER = 9006

class FullPlaythroughHarness {
    currentMap = 'artemple'
    region = 'Arroyo'
    worldPosition = { x: 0, y: 0 }
    scriptGlobalVars: Record<number, number> = {}
    mapAreaStates: Record<number, boolean> = {}
    endingTriggered = false

    runEarlyCampaign(): void {
        this.scriptGlobalVars[GVAR_TEMPLE_DONE] = 1
        this.scriptGlobalVars[GVAR_DEN_ROUTE] = 1
        this.currentMap = 'denbus1'
        this.region = 'Den'
        this.worldPosition = { x: 29, y: 17 }
        this.mapAreaStates[0] = true // Arroyo
        this.mapAreaStates[2] = true // Klamath
        this.mapAreaStates[3] = true // Den
    }

    runMidLateCampaign(): void {
        if ((this.scriptGlobalVars[GVAR_DEN_ROUTE] ?? 0) !== 1) throw new Error('early campaign not complete')
        this.scriptGlobalVars[GVAR_MIDLATE_ROUTE] = 1
        this.scriptGlobalVars[GVAR_NAVARRO_ACCESS] = 1
        this.scriptGlobalVars[GVAR_OILRIG_READY] = 1
        this.currentMap = 'navarro'
        this.region = 'Navarro'
        this.worldPosition = { x: 82, y: 36 }
        this.mapAreaStates[4] = true
        this.mapAreaStates[5] = true
        this.mapAreaStates[6] = true
        this.mapAreaStates[7] = true
        this.mapAreaStates[8] = true
        this.mapAreaStates[9] = true
        this.mapAreaStates[10] = true
        this.mapAreaStates[11] = true
        this.mapAreaStates[12] = true
    }

    triggerEndingFlow(): void {
        if ((this.scriptGlobalVars[GVAR_OILRIG_READY] ?? 0) !== 1) throw new Error('Oil Rig route not unlocked')
        this.currentMap = 'oilrig'
        this.region = 'Enclave / Oil Rig'
        this.worldPosition = { x: 86, y: 38 }
        this.mapAreaStates[13] = true
        this.scriptGlobalVars[GVAR_ENDING_TRIGGER] = 1
        this.endingTriggered = true
    }

    toSave(name = 'phase35'): SaveGame {
        return {
            version: SAVE_VERSION,
            name,
            timestamp: 424242,
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

    static fromSave(raw: Record<string, any>): FullPlaythroughHarness {
        const save = migrateSave(raw)
        const h = new FullPlaythroughHarness()
        h.currentMap = save.currentMap
        h.worldPosition = save.worldPosition ?? { x: 0, y: 0 }
        h.scriptGlobalVars = { ...(save.scriptGlobalVars ?? {}) }
        h.mapAreaStates = { ...(save.mapAreaStates ?? {}) }
        h.region = save.currentMap === 'oilrig' ? 'Enclave / Oil Rig' : save.currentMap === 'navarro' ? 'Navarro' : 'Den'
        h.endingTriggered = (h.scriptGlobalVars[GVAR_ENDING_TRIGGER] ?? 0) === 1
        return h
    }
}

describe('Phase 35-A — full critical-path scaffold run', () => {
    it('runs early + mid/late + ending flow with save/load continuity', () => {
        const h = new FullPlaythroughHarness()
        h.runEarlyCampaign()
        h.runMidLateCampaign()

        const loadedBeforeEnding = FullPlaythroughHarness.fromSave(JSON.parse(JSON.stringify(h.toSave('pre-ending'))))
        expect(loadedBeforeEnding.region).toBe('Navarro')
        expect(loadedBeforeEnding.scriptGlobalVars[GVAR_NAVARRO_ACCESS]).toBe(1)

        loadedBeforeEnding.triggerEndingFlow()
        expect(loadedBeforeEnding.endingTriggered).toBe(true)
        expect(loadedBeforeEnding.currentMap).toBe('oilrig')
        expect(loadedBeforeEnding.mapAreaStates[13]).toBe(true)

        const loadedAfterEnding = FullPlaythroughHarness.fromSave(JSON.parse(JSON.stringify(loadedBeforeEnding.toSave('post-ending'))))
        expect(loadedAfterEnding.endingTriggered).toBe(true)
        expect(loadedAfterEnding.region).toBe('Enclave / Oil Rig')
    })
})

describe('Phase 35-B — release-gate artifact sanity', () => {
    it('release gate still records NOT_READY until all regions are certified', () => {
        const gate = readFileSync(new URL('../docs/F2_RELEASE_GATE.md', import.meta.url), 'utf8')
        expect(gate).toContain('**Status:** `NOT_READY`')
        expect(gate).toContain('- [ ] All regions certified')
    })
})
