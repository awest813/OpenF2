import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { Player } from './player.js'
import { useBook } from './books.js'
import { PerkId } from './character/perkIds.js'
import { TICKS_PER_HOUR } from './gameTime.js'

describe('skill books (_obj_use_book)', () => {
    let saved: any
    beforeEach(() => {
        saved = { player: globalState.player, time: globalState.gameTickTime, combat: globalState.inCombat }
        globalState.player = new Player()
        globalState.gameTickTime = 1000
        globalState.inCombat = false
    })
    afterEach(() => {
        globalState.player = saved.player
        globalState.gameTickTime = saved.time
        globalState.inCombat = saved.combat
    })

    it('raises the skill by a tenth of what it lacks of 100% and takes 11 − INT hours', () => {
        const p = globalState.player as Player
        const before = p.getSkill('Science')
        const int = p.getStat('INT')
        expect(useBook({ pid: 73 })).toBe(1)
        expect(p.getSkill('Science')).toBe(before + Math.trunc((100 - before) / 10))
        expect(globalState.gameTickTime).toBe(1000 + TICKS_PER_HOUR * (11 - int))
    })

    it('Comprehension gives half as much again', () => {
        const p = globalState.player as Player
        ;(p as any).perkRanks = { [PerkId.COMPREHENSION]: 1 }
        const before = p.getSkill('Repair')
        useBook({ pid: 76 })
        expect(p.getSkill('Repair')).toBe(before + Math.trunc((150 * Math.trunc((100 - before) / 10)) / 100))
    })

    it('cannot be read in combat, and other items are not books', () => {
        globalState.inCombat = true
        expect(useBook({ pid: 73 })).toBe(0)
        expect(useBook({ pid: 40 })).toBe(-1)
    })
})
