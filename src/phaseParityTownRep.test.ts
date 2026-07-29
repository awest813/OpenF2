/**
 * Parity P1-7 — town reputation tiers, karma titles, flags, reaction/barter hooks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { Reputation } from './quest/reputation.js'
import {
    townRepTier,
    karmaTitle,
    getTownRepValue,
    setTownRepValue,
    listActiveReputationFlags,
    syncReputationFromGvar,
    pullReputationFromGvars,
    resolveTownIdFromMapName,
    reactionBiasForTier,
    barterPriceMultiplierForTier,
    TOWN_REP_GVARS,
    REPUTATION_FLAG_GVARS,
    currentTownStanding,
} from './quest/townReputation.js'
import { Scripting } from './scripting.js'

describe('Parity P1-7 — town rep tiers and karma titles', () => {
    it('maps FO2 town-rep thresholds', () => {
        expect(townRepTier(30)).toBe('Idolized')
        expect(townRepTier(15)).toBe('Liked')
        expect(townRepTier(1)).toBe('Accepted')
        expect(townRepTier(0)).toBe('Neutral')
        expect(townRepTier(-1)).toBe('Antipathy')
        expect(townRepTier(-15)).toBe('Hated')
        expect(townRepTier(-30)).toBe('Vilified')
    })

    it('maps karma titles every ±250', () => {
        expect(karmaTitle(0)).toBe('Wanderer')
        expect(karmaTitle(250)).toBe('Defender')
        expect(karmaTitle(500)).toBe('Shield of Hope')
        expect(karmaTitle(1000)).toBe('Savior of the Damned')
        expect(karmaTitle(-250)).toBe('Betrayer')
        expect(karmaTitle(-500)).toBe('Sword of Despair')
        expect(karmaTitle(-1000)).toBe('Demon Spawn')
    })

    it('resolves map names to town ids', () => {
        expect(resolveTownIdFromMapName('ARROYO')).toBe('arroyo')
        expect(resolveTownIdFromMapName('klamath.map')).toBe('klamath')
        expect(resolveTownIdFromMapName('DENBUS1')).toBe('the_den')
        expect(resolveTownIdFromMapName('unknown_place')).toBeNull()
    })

    it('reaction bias and barter multipliers track tiers', () => {
        expect(reactionBiasForTier('Idolized')).toBeGreaterThan(0)
        expect(reactionBiasForTier('Vilified')).toBeLessThan(0)
        expect(barterPriceMultiplierForTier('Idolized')).toBeLessThan(1)
        expect(barterPriceMultiplierForTier('Hated')).toBeGreaterThan(1)
    })
})

describe('Parity P1-7 — GVAR sync', () => {
    let savedRep: Reputation

    beforeEach(() => {
        savedRep = globalState.reputation
        globalState.reputation = new Reputation()
    })

    afterEach(() => {
        globalState.reputation = savedRep
    })

    it('syncReputationFromGvar writes town and flag stores', () => {
        const rep = globalState.reputation
        syncReputationFromGvar(rep, TOWN_REP_GVARS.klamath, 20)
        expect(getTownRepValue(rep, 'klamath')).toBe(20)
        expect(townRepTier(20)).toBe('Liked')

        syncReputationFromGvar(rep, REPUTATION_FLAG_GVARS.Childkiller, 2)
        expect(listActiveReputationFlags(rep)).toContain('Childkiller')
    })

    it('set_global_var syncs town rep into Reputation', () => {
        const script = new (Scripting as any).Script()
        script.set_global_var(TOWN_REP_GVARS.modoc, 35)
        expect(getTownRepValue(globalState.reputation, 'modoc')).toBe(35)
        expect(currentTownStanding(globalState.reputation, 'modoc')?.tier).toBe('Idolized')
    })

    it('set_global_var(18) marks Highwayman ownership', () => {
        const prev = globalState.hasCar
        const script = new (Scripting as any).Script()
        script.set_global_var(18, 1)
        expect(globalState.hasCar).toBe(true)
        script.set_global_var(18, 0)
        expect(globalState.hasCar).toBe(false)
        globalState.hasCar = prev
    })

    it('pullReputationFromGvars mirrors GVAR table', () => {
        const rep = new Reputation()
        pullReputationFromGvars(rep, { [TOWN_REP_GVARS.arroyo]: 50, [REPUTATION_FLAG_GVARS.Slaver]: 1 })
        expect(getTownRepValue(rep, 'arroyo')).toBe(50)
        expect(listActiveReputationFlags(rep)).toContain('Slaver')
    })

    it('setTownRepValue persists via Reputation.serialize', () => {
        const rep = new Reputation()
        setTownRepValue(rep, 'new_reno', -20)
        const restored = Reputation.deserialize(rep.serialize())
        expect(getTownRepValue(restored, 'new_reno')).toBe(-20)
        expect(townRepTier(-20)).toBe('Hated')
    })
})
