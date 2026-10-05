import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import { PerkId } from './character/perkIds.js'
import {
    getAddictions,
    hydrateTimedEffects,
    processDrugEventsUpTo,
    resetTimedEffects,
    serializeTimedEffects,
    takeDrug,
    PID_BUFFOUT,
    PID_JET,
    PID_JET_ANTIDOTE,
} from './character/timedEffects.js'

const delayed = (duration: number, a: number[] = [0, 0, 0]) => ({ duration, amount0: a[0], amount1: a[1], amount2: a[2] })

/** A Buffout-like proto: +2 STR, +2 END now; −2/−2 after 8 hours. */
function buffout(addiction = 0): any {
    return {
        pid: PID_BUFFOUT, subtype: 'drug', name: 'Buffout',
        pro: { extra: { subType: 2, stat0: 0, stat1: 2, stat2: -1, amount0: 2, amount1: 2, amount2: 0,
            firstDelayed: delayed(480, [-2, -2, 0]), secondDelayed: delayed(0),
            addictionRate: addiction, addictionEffect: PerkId.BUFFOUT_ADDICTION, addictionOnset: 600 } },
    }
}

/** A stimpak: stat −2 means "roll between the first two amounts for HP". */
function stimpak(): any {
    return {
        pid: 40, subtype: 'drug', name: 'Stimpak',
        pro: { extra: { subType: 2, stat0: -2, stat1: 35, stat2: -1, amount0: 10, amount1: 20, amount2: 0,
            firstDelayed: delayed(0), secondDelayed: delayed(0), addictionRate: 0, addictionEffect: -1, addictionOnset: 0 } },
    }
}

describe('drugs (item.cc _item_d_take_drug)', () => {
    let messages: string[]
    let off: () => void
    let saved: any
    let player: Player

    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime }
        resetTimedEffects()
        player = new Player()
        globalState.player = player
        globalState.gameTickTime = 10000
        Scripting.setGlobalVars({ 22: 0, 296: 0 })
        messages = []
        const handler = ({ text }: { text: string }) => messages.push(text)
        EventBus.on('ui:message', handler)
        off = () => EventBus.off('ui:message', handler)
    })

    afterEach(() => {
        off()
        resetTimedEffects()
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
    })

    it('applies the proto\'s immediate effect as bonus stats, then the delayed one', () => {
        const str = player.getStat('STR')
        expect(takeDrug(player, buffout())).toBe(1)
        expect(player.getStat('STR')).toBe(str + 2)
        expect(messages[0]).toBe('You gained 2 Strength.')
        processDrugEventsUpTo(10000 + 480 * 600 - 1)
        expect(player.getStat('STR')).toBe(str + 2)
        processDrugEventsUpTo(10000 + 480 * 600)
        expect(player.getStat('STR')).toBe(str)
    })

    it('Chem Resistant halves the time to the delayed effect', () => {
        ;(player as any).charTraits = new Set([12])
        const str = player.getStat('STR')
        takeDrug(player, buffout())
        processDrugEventsUpTo(10000 + 240 * 600)
        expect(player.getStat('STR')).toBe(str)
    })

    it('a stimpak heals a roll between its two amounts', () => {
        player.stats.setBase('HP', 1)
        takeDrug(player, stimpak(), (min, max) => (min === 10 && max === 20 ? 15 : min))
        expect(player.getStat('HP')).toBe(16)
    })

    it('more than four pending doses of Buffout do nothing more', () => {
        for (let i = 0; i < 4; i++) {takeDrug(player, buffout())}
        const str = player.getStat('STR')
        messages = []
        takeDrug(player, buffout())
        expect(player.getStat('STR')).toBe(str)
        expect(messages).toEqual(["That didn't seem to do that much."])
    })

    it('addiction sets the global variable; withdrawal starts at the onset and ends a week later', () => {
        const always = (min: number, max: number) => (min === 1 && max === 100 ? 1 : min)
        takeDrug(player, buffout(100), always)
        expect(Scripting.getGlobalVar(22)).toBe(1)
        expect(getAddictions(player)[0]).toMatchObject({ drugId: 'Buffout', withdrawing: false })
        processDrugEventsUpTo(10000 + 480 * 600) // effect over
        const agi = player.getStat('AGI')
        processDrugEventsUpTo(10000 + 600 * 600) // onset
        expect(player.getStat('AGI')).toBe(agi - 3)
        expect(getAddictions(player)[0].withdrawing).toBe(true)
        processDrugEventsUpTo(10000 + 600 * 600 + 10080 * 600)
        expect(player.getStat('AGI')).toBe(agi)
        expect(Scripting.getGlobalVar(22)).toBe(0)
    })

    it('another dose puts withdrawal off', () => {
        const always = (min: number, max: number) => (min === 1 && max === 100 ? 1 : min)
        takeDrug(player, buffout(100), always)
        globalState.gameTickTime = 10000 + 500 * 600
        processDrugEventsUpTo(globalState.gameTickTime)
        const agi = player.getStat('AGI')
        takeDrug(player, buffout(0))
        processDrugEventsUpTo(10000 + 600 * 600)
        expect(player.getStat('AGI')).toBe(agi)
    })

    it('the Jet antidote ends Jet addiction', () => {
        Scripting.setGlobalVars({ 296: 1 })
        expect(takeDrug(player, { pid: PID_JET_ANTIDOTE, subtype: 'drug', pro: { extra: { subType: 2 } } })).toBe(1)
        expect(Scripting.getGlobalVar(296)).toBe(0)
        expect(PID_JET).toBe(259)
    })

    it('robots and the dead cannot take drugs', () => {
        ;(player as any).pro = { extra: { bodyType: 2 } }
        expect(takeDrug(player, buffout())).toBe(-1)
    })

    it('saves and restores pending effects and bonuses', () => {
        const str = player.getStat('STR')
        takeDrug(player, buffout())
        const data = serializeTimedEffects()
        resetTimedEffects()
        expect(player.getStat('STR')).toBe(str)
        hydrateTimedEffects(data)
        expect(player.getStat('STR')).toBe(str + 2)
        processDrugEventsUpTo(10000 + 480 * 600)
        expect(player.getStat('STR')).toBe(str)
    })
})
