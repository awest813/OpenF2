/**
 * Parity Slice F — perks expansion + drugs / rad / poison runtime (P1-2, P1-4, P1-5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { PERKS, PERK_MAP, educatedPerkRanks, EDUCATED_PERK_IDS } from './character/perks.js'
import { TRAITS } from './character/traits.js'
import {
    applyDrugToCritter,
    resolveDrugDef,
    tickTimedEffects,
    getActiveEffects,
    getAddictions,
    resetTimedEffects,
    getActiveRadResistBonus,
} from './character/timedEffects.js'
import {
    applyRadiationGain,
    radiationBand,
    radiationGauge,
    tickPoison,
    tickRadiation,
    resetRadiationPoisonClocks,
    RAD_MINOR,
    RAD_CRITICAL,
} from './character/radiationPoison.js'
import { Scripting } from './scripting.js'

describe('Parity Slice F — perks / traits tables', () => {
    it('defines a substantial FO2-aligned perk set', () => {
        expect(PERKS.length).toBeGreaterThanOrEqual(40)
        expect(PERK_MAP.get(11)?.name).toBe('Educated')
        expect(PERK_MAP.get(16)?.name).toBe('Bonus Rate of Fire')
        expect(PERK_MAP.get(34)?.name).toBe('Tag!')
        // Earlier Sequence moved off id 18 so FO2 Educated alias does not collide
        expect(PERK_MAP.get(46)?.name).toBe('Earlier Sequence')
        expect(PERK_MAP.has(18)).toBe(false)
    })

    it('defines all 16 Fallout 2 traits', () => {
        expect(TRAITS.length).toBe(16)
        expect(TRAITS.map((t) => t.name)).toContain('Gifted')
        expect(TRAITS.map((t) => t.name)).toContain('Chem Reliant')
    })

    it('educatedPerkRanks reads UI / FO2 / legacy aliases', () => {
        expect(EDUCATED_PERK_IDS).toEqual([11, 18, 47])
        expect(educatedPerkRanks({ 11: 2 })).toBe(2)
        expect(educatedPerkRanks({ 18: 1 })).toBe(1)
        expect(educatedPerkRanks({ 47: 3 })).toBe(3)
        expect(educatedPerkRanks({ 11: 1, 47: 2 })).toBe(2)
    })
})

describe('Parity Slice F — drugs and timed effects', () => {
    let savedPlayer: typeof globalState.player
    let savedTick: number

    beforeEach(() => {
        savedPlayer = globalState.player
        savedTick = globalState.gameTickTime
        resetTimedEffects()
        globalState.player = new Player()
        globalState.gameTickTime = 1000
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.gameTickTime = savedTick
        resetTimedEffects()
    })

    it('resolves Buffout / Mentats / Rad-X by name', () => {
        expect(resolveDrugDef({ name: 'Buffout' })?.id).toBe('buffout')
        expect(resolveDrugDef({ name: 'Mentats' })?.specialMods?.INT).toBe(2)
        expect(resolveDrugDef({ name: 'Rad-X' })?.radResistBonus).toBe(50)
    })

    it('applies Buffout SPECIAL mods and tracks an active effect', () => {
        const player = globalState.player as Player
        const strBefore = player.getStat('STR')
        expect(applyDrugToCritter(player, { name: 'Buffout' })).toBe(true)
        expect(player.getStat('STR')).toBe(strBefore + 2)
        expect(getActiveEffects(player).some((e) => e.drugId === 'buffout')).toBe(true)
    })

    it('expires Buffout and can start withdrawal after addiction', () => {
        const player = globalState.player as Player
        vi.spyOn(Math, 'random').mockReturnValue(0) // always addict (chance roll < chance)
        applyDrugToCritter(player, { name: 'Buffout' })
        expect(getAddictions(player).some((a) => a.drugId === 'buffout')).toBe(true)

        const effect = getActiveEffects(player).find((e) => e.drugId === 'buffout')!
        globalState.gameTickTime = effect.expiresAt
        tickTimedEffects(player)
        expect(getActiveEffects(player).some((e) => e.drugId === 'buffout')).toBe(false)
        expect(getAddictions(player).find((a) => a.drugId === 'buffout')?.withdrawing).toBe(true)
        vi.restoreAllMocks()
    })

    it('Rad-X grants timed radiation resistance bonus', () => {
        const player = globalState.player as Player
        applyDrugToCritter(player, { name: 'Rad-X' })
        expect(getActiveRadResistBonus(player)).toBe(50)
    })

    it('RadAway lowers radiation level', () => {
        const player = globalState.player as Player
        player.stats.setBase('Radiation Level', 80)
        applyDrugToCritter(player, { name: 'RadAway' })
        expect(player.stats.getBase('Radiation Level')).toBe(30)
    })
})

describe('Parity Slice F — radiation and poison', () => {
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedPlayer = globalState.player
        resetRadiationPoisonClocks()
        globalState.player = new Player()
    })

    afterEach(() => {
        globalState.player = savedPlayer
        resetRadiationPoisonClocks()
    })

    it('maps radiation thresholds to bands and gauges', () => {
        expect(radiationBand(0)).toBe('none')
        expect(radiationBand(RAD_MINOR)).toBe('minor')
        expect(radiationBand(RAD_CRITICAL)).toBe('critical')
        expect(radiationGauge(RAD_CRITICAL)).toBe(3)
    })

    it('applyRadiationGain is the resistance-aware path (Rad-X)', () => {
        const player = globalState.player as Player
        applyDrugToCritter(player, { name: 'Rad-X' })
        const taken = applyRadiationGain(player, 100)
        expect(taken).toBeLessThanOrEqual(50)
        expect(player.stats.getBase('Radiation Level')).toBe(taken)
    })

    it('tickPoison deals damage and decays poison level', () => {
        const player = globalState.player as Player
        player.stats.setBase('Poison Level', 100)
        const hpBefore = player.getStat('HP')
        const dmg = tickPoison(player)
        expect(dmg).toBeGreaterThan(0)
        expect(player.getStat('HP')).toBeLessThan(hpBefore)
        expect(player.stats.getBase('Poison Level')).toBeLessThan(100)
    })

    it('tickRadiation damages at elevated bands', () => {
        const player = globalState.player as Player
        player.stats.setBase('Radiation Level', RAD_CRITICAL)
        const hpBefore = player.getStat('HP')
        expect(tickRadiation(player)).toBe(4)
        expect(player.getStat('HP')).toBe(hpBefore - 4)
    })

    it('radiation_add opcode still applies the raw script amount', () => {
        const player = globalState.player as Player
        const script = new (Scripting as any).Script()
        script.radiation_add(player, 20)
        expect(player.stats.getBase('Radiation Level')).toBe(20)
    })
})
