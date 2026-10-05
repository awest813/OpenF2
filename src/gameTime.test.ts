import { describe, it, expect } from 'vitest'
import { gameDate, gameTimeHour, gameTimeString, NEW_GAME_TICKS, TICKS_PER_DAY } from './gameTime.js'
import { dateTimeMessage } from './ui2/gamePanel.js'
import { pipboyDateHeader } from './ui2/pipboy.js'

describe('engine calendar (scripts.cc gameTimeGetDate)', () => {
    it('starts on 25 July 2241 at 8:24', () => {
        expect(gameDate(NEW_GAME_TICKS)).toEqual({ month: 7, day: 25, year: 2241 })
        expect(gameTimeHour(NEW_GAME_TICKS)).toBe(824)
        expect(gameTimeString(NEW_GAME_TICKS)).toBe('8:24')
    })

    it('uses real month lengths', () => {
        expect(gameDate(6 * TICKS_PER_DAY)).toEqual({ month: 7, day: 31, year: 2241 })
        expect(gameDate(7 * TICKS_PER_DAY)).toEqual({ month: 8, day: 1, year: 2241 })
        // July 25 + 160 days → 1 January 2242
        expect(gameDate(160 * TICKS_PER_DAY)).toEqual({ month: 1, day: 1, year: 2242 })
    })

    it('the / key and the Pip-Boy header read the same clock', () => {
        expect(dateTimeMessage(NEW_GAME_TICKS)).toBe('July: 25/2241 8:24')
        expect(pipboyDateHeader(NEW_GAME_TICKS)).toEqual({ date: '25 JUL 2241', time: '0824' })
    })
})
