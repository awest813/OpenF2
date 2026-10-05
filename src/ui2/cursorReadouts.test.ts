import { describe, it, expect } from 'vitest'
import { accuracyLabel, CURSOR_RED, CURSOR_WHITE, moveCostLabel } from './cursorReadouts.js'

describe('cursor readouts (game_mouse.cc)', () => {
    it('hex cursor: AP beyond the free move, a red X when unaffordable or unreachable', () => {
        expect(moveCostLabel({ inCombat: true, pathLength: 3, moveCost: 3, freeMove: 0, actionPoints: 5 })).toEqual({ text: '3', color: CURSOR_WHITE })
        expect(moveCostLabel({ inCombat: true, pathLength: 3, moveCost: 3, freeMove: 2, actionPoints: 5 }).text).toBe('1')
        expect(moveCostLabel({ inCombat: true, pathLength: 6, moveCost: 6, freeMove: 0, actionPoints: 5 })).toEqual({ text: 'X', color: CURSOR_RED })
        expect(moveCostLabel({ inCombat: true, pathLength: 0, moveCost: 0, freeMove: 0, actionPoints: 5 }).text).toBe('X')
        expect(moveCostLabel({ inCombat: false, pathLength: 4, moveCost: 4, freeMove: 0, actionPoints: 0 }).text).toBe('')
    })

    it('crosshair: NN% for a possible shot, " X " otherwise, coloured by team', () => {
        expect(accuracyLabel({ accuracy: 72, isCritter: true, team: 1 })).toEqual({ text: '72%', color: CURSOR_WHITE })
        expect(accuracyLabel({ accuracy: null, isCritter: true, team: 1 })).toEqual({ text: ' X ', color: CURSOR_RED })
        expect(accuracyLabel({ accuracy: 50, isCritter: true, team: 0 }).color).not.toBe(CURSOR_WHITE)
    })
})
