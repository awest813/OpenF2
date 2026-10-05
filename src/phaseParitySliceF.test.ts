/**
 * Parity Slice F — perks expansion + drugs / rad / poison runtime (P1-2, P1-4, P1-5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { TICKS_PER_DAY } from './gameTime.js'
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
    adjustPoison,
    processRadPoisonUpTo,
    RAD_MINOR,
    RAD_CRITICAL,
} from './character/radiationPoison.js'
import { Scripting } from './scripting.js'

describe('Parity Slice F — perks / traits tables', () => {
    it('defines a substantial FO2-aligned perk set', () => {
        // Every player-selectable perk, keyed by the engine's perk ID (perk_defs.h).
        expect(PERKS.length).toBe(81)
        expect(PERK_MAP.get(18)?.name).toBe('Educated')
        expect(PERK_MAP.get(5)?.name).toBe('Bonus Rate of Fire')
        expect(PERK_MAP.get(51)?.name).toBe('Tag!')
        expect(PERK_MAP.get(6)?.name).toBe('Earlier Sequence')
        expect(PERK_MAP.get(106)?.name).toBe('Weapon Handling')
        // Weapon/armor/addiction pseudo-perks are not selectable
        expect(PERK_MAP.has(58)).toBe(false)
    })

    it('defines all 16 Fallout 2 traits', () => {
        expect(TRAITS.length).toBe(16)
        expect(TRAITS.map((t) => t.name)).toContain('Gifted')
        expect(TRAITS.map((t) => t.name)).toContain('Chem Reliant')
    })

    it('educatedPerkRanks reads the FO2 Educated perk (18)', () => {
        expect(EDUCATED_PERK_IDS).toEqual([18])
        expect(educatedPerkRanks({ 18: 1 })).toBe(1)
        expect(educatedPerkRanks({ 18: 3 })).toBe(3)
        expect(educatedPerkRanks({ 11: 2 })).toBe(0)
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

describe('Parity Slice F — radiation and poison (critter.cc)', () => {
    let savedPlayer: typeof globalState.player

    beforeEach(() => {
        savedPlayer = globalState.player
        globalState.player = new Player()
    })

    afterEach(() => {
        globalState.player = savedPlayer
    })

    it('maps radiation counts to sickness levels (> 99, > 199, > 399, > 599, > 999)', () => {
        expect(radiationBand(0)).toBe('none')
        expect(radiationBand(RAD_MINOR)).toBe('minor')
        expect(radiationBand(RAD_CRITICAL)).toBe('critical')
        expect(radiationGauge(RAD_CRITICAL)).toBe(3)
        expect(radiationGauge(1000)).toBe(5)
    })

    it('radiation resistance (with Rad-X) cuts every dose', () => {
        const player = globalState.player as Player
        const plain = applyRadiationGain(player, 100)
        player.stats.setBase('Radiation Level', 0)
        applyDrugToCritter(player, { name: 'Rad-X' })
        const taken = applyRadiationGain(player, 100)
        expect(taken).toBeLessThan(plain)
        expect(player.stats.getBase('Radiation Level')).toBe(taken)
    })

    it('a poison tick takes 1 HP and 2 poison, every 10 × (505 − 5 × poison) ticks', () => {
        const player = globalState.player as Player
        player.stats.setBase('HP', player.getStat('Max HP'))
        globalState.gameTickTime = 1000
        processRadPoisonUpTo(1000)
        adjustPoison(player, 100)
        const poison = player.stats.getBase('Poison Level')
        const hp = player.getStat('HP')
        const due = 1000 + 10 * (505 - 5 * poison)
        processRadPoisonUpTo(due - 1)
        expect(player.getStat('HP')).toBe(hp)
        processRadPoisonUpTo(due)
        expect(player.getStat('HP')).toBe(hp - 1)
        expect(player.stats.getBase('Poison Level')).toBe(poison - 2)
    })

    it('radiation sickness comes 4–18 hours after the midnight check and lifts after 7 days', () => {
        const player = globalState.player as Player
        const strBefore = player.getStat('STR')
        globalState.gameTickTime = 0
        processRadPoisonUpTo(0)
        player.stats.setBase('Radiation Level', 450) // critical
        ;(player as any).radPoison.radiated = true
        processRadPoisonUpTo(TICKS_PER_DAY + 19 * 36000)
        expect(player.getStat('STR')).toBeLessThan(strBefore)
        processRadPoisonUpTo(TICKS_PER_DAY * 9)
        expect(player.getStat('STR')).toBe(strBefore)
    })

    it('radiation_add goes through the engine (resistance applies)', () => {
        const player = globalState.player as Player
        const script = new (Scripting as any).Script()
        script.radiation_add(player, 20)
        const expected = 20 - Math.trunc((player.getStat('DR Radiation') * 20) / 100)
        expect(player.stats.getBase('Radiation Level')).toBe(expected)
    })
})
