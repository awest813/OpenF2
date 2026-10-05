import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import globalState from './globalState.js'
import * as util from './util.js'
import { Encounters } from './encounters.js'

const entry = (id: number, chance: number, counter = -1): any => ({ id, chance, counter, enc: { type: 'ambush' }, cond: null, special: null, scenery: null, condOrig: null })

describe('wmRndEncounterPick', () => {
    let saved: any
    beforeEach(() => {
        saved = { player: globalState.player, difficulty: globalState.gameDifficulty }
        globalState.player = { getStat: () => 5, perkRanks: {} } as any
        globalState.gameDifficulty = 1
    })
    afterEach(() => {
        vi.restoreAllMocks()
        globalState.player = saved.player
        globalState.gameDifficulty = saved.difficulty
    })

    it('a roll past the end picks the last candidate', () => {
        globalState.player = { getStat: () => 10, perkRanks: {} } as any // +5 luck
        vi.spyOn(util, 'getRandomInt').mockReturnValue(30)
        expect(Encounters.pickEncounter([entry(0, 10), entry(1, 20)])?.id).toBe(1)
    })

    it('easy adds 5 to the roll, hard takes 5 off', () => {
        vi.spyOn(util, 'getRandomInt').mockReturnValue(8)
        globalState.gameDifficulty = 0
        expect(Encounters.pickEncounter([entry(0, 10), entry(1, 20)])?.id).toBe(1)
        globalState.gameDifficulty = 2
        expect(Encounters.pickEncounter([entry(0, 10), entry(1, 20)])?.id).toBe(0)
    })

    it('a Counter limits how often an entry comes up', () => {
        vi.spyOn(util, 'getRandomInt').mockReturnValue(0)
        const once = entry(0, 10, 1)
        const always = entry(1, 10)
        expect(Encounters.pickEncounter([once, always])).toBe(once)
        expect(once.counter).toBe(0)
        expect(Encounters.pickEncounter([once, always])).toBe(always)
    })
})
