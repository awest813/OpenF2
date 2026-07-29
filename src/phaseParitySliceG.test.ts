/**
 * Parity Slice G — rest / time advance + holodisk archives (P1-11 core).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { Scripting } from './scripting.js'
import {
    advanceGameTime,
    restForHours,
    canRest,
    HEAL_INTERVAL_TICKS,
    TICKS_PER_HOUR,
    bindTimedEventList,
    setRestDangerOverride,
} from './character/rest.js'
import {
    addHolodisk,
    getHolodisks,
    markHolodiskRead,
    resetHolodisks,
    serializeHolodisks,
    deserializeHolodisks,
} from './character/holodisks.js'

describe('Parity Slice G — rest / time advance', () => {
    let savedPlayer: typeof globalState.player
    let savedTick: number
    let savedCombat: boolean

    beforeEach(() => {
        savedPlayer = globalState.player
        savedTick = globalState.gameTickTime
        savedCombat = globalState.inCombat
        Scripting.timeEventList.length = 0
        bindTimedEventList(Scripting.timeEventList)
        setRestDangerOverride('safe')
        globalState.player = new Player()
        globalState.gameTickTime = 10_000
        globalState.inCombat = false
    })

    afterEach(() => {
        globalState.player = savedPlayer
        globalState.gameTickTime = savedTick
        globalState.inCombat = savedCombat
        Scripting.timeEventList.length = 0
        setRestDangerOverride(null)
    })

    it('canRest is false during combat', () => {
        expect(canRest()).toBe(true)
        globalState.inCombat = true
        expect(canRest()).toBe(false)
    })

    it('restForHours advances gameTickTime by hours', () => {
        const before = globalState.gameTickTime
        const result = restForHours(3)
        expect(result.refusedReason).toBeUndefined()
        expect(result.ticksAdvanced).toBe(3 * TICKS_PER_HOUR)
        expect(globalState.gameTickTime).toBe(before + 3 * TICKS_PER_HOUR)
    })

    it('rest refuses in combat', () => {
        globalState.inCombat = true
        const before = globalState.gameTickTime
        const result = restForHours(1)
        expect(result.refusedReason).toBe('combat')
        expect(globalState.gameTickTime).toBe(before)
    })

    it('rest heals using Healing Rate per 3-hour period', () => {
        const player = globalState.player as Player
        const maxHp = Math.max(40, player.getStat('Max HP') || 40)
        player.stats.setBase('Max HP', maxHp)
        player.stats.setBase('HP', Math.max(1, maxHp - 20))
        player.stats.setBase('Healing Rate', 4)

        const rate = Math.max(0, player.getStat('Healing Rate') ?? 1)
        const hpBefore = player.getStat('HP')
        // 6 hours = 2 heal periods
        const result = restForHours(6)
        expect(result.hpHealed).toBe(2 * rate)
        expect(player.getStat('HP')).toBe(hpBefore + 2 * rate)
        expect(HEAL_INTERVAL_TICKS).toBe(3 * TICKS_PER_HOUR)
    })

    it('fires due timed events when advancing time', () => {
        const fn = vi.fn()
        Scripting.timeEventList.push({
            ticks: 50,
            obj: null as any,
            userdata: 0,
            fn,
        })
        advanceGameTime(100, { heal: false, tickEffects: false })
        expect(fn).toHaveBeenCalledOnce()
        expect(Scripting.timeEventList.length).toBe(0)
    })

    it('game_time_advance processes timed events', () => {
        const fn = vi.fn()
        Scripting.timeEventList.push({
            ticks: 10,
            obj: null as any,
            userdata: 1,
            fn,
        })
        const script = new (Scripting as any).Script()
        const before = globalState.gameTickTime
        script.game_time_advance(25)
        expect(globalState.gameTickTime).toBe(before + 25)
        expect(fn).toHaveBeenCalledOnce()
    })
})

describe('Parity Slice G — holodisk archives', () => {
    beforeEach(() => {
        resetHolodisks()
    })

    afterEach(() => {
        resetHolodisks()
    })

    it('addHolodisk stores readable entries', () => {
        addHolodisk('vault13', 'Vault 13 Disk', 'The water chip is failing.')
        expect(getHolodisks()).toHaveLength(1)
        expect(getHolodisks()[0].title).toBe('Vault 13 Disk')
        expect(getHolodisks()[0].read).toBe(false)
    })

    it('markHolodiskRead flips the read flag', () => {
        addHolodisk('a', 'A', 'body')
        expect(markHolodiskRead('a')).toBe(true)
        expect(getHolodisks()[0].read).toBe(true)
    })

    it('serialize/deserialize round-trips', () => {
        addHolodisk('x', 'X', 'hello')
        markHolodiskRead('x')
        const snap = serializeHolodisks()
        resetHolodisks()
        expect(getHolodisks()).toHaveLength(0)
        deserializeHolodisks(snap)
        expect(getHolodisks()).toHaveLength(1)
        expect(getHolodisks()[0].read).toBe(true)
        expect(getHolodisks()[0].body).toBe('hello')
    })
})
