/**
 * The game calendar and clock as the Fallout 2 engine keeps them
 * (scripts.cc gameTimeGetDate / gameTimeGetHour / gameTimeGetTimeString).
 *
 * Time is counted in ticks, ten per second. The calendar starts on
 * 25 July 2241 (sfall's StartYear 2241 / StartMonth 6 / StartDay 24
 * defaults) and uses real month lengths with no leap years.
 */

export const TICKS_PER_SECOND = 10
export const TICKS_PER_MINUTE = 600
export const TICKS_PER_HOUR = 36000
export const TICKS_PER_DAY = 864000

/** The clock at the start of a new game: 8:24 in the morning (scr_game_init). */
export const NEW_GAME_TICKS = 302400

const START_YEAR = 2241
const START_MONTH = 6 // July, counted from 0
const START_DAY = 24 // days into the start month, counted from 0

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export interface GameDate {
    /** 1–12. */
    month: number
    /** 1–31. */
    day: number
    year: number
}

/** gameTimeGetDate. */
export function gameDate(ticks: number): GameDate {
    const days = Math.floor(Math.max(0, ticks) / TICKS_PER_DAY) + START_DAY
    let year = Math.floor(days / 365) + START_YEAR
    let month = START_MONTH
    let day = days % 365
    while (day >= DAYS_PER_MONTH[month]) {
        day -= DAYS_PER_MONTH[month]
        month++
        if (month === 12) {
            year++
            month = 0
        }
    }
    return { month: month + 1, day: day + 1, year }
}

/** game_time_hour: hours and minutes as HHMM (8:05 → 805). */
export function gameTimeHour(ticks: number): number {
    const minutes = Math.floor(Math.max(0, ticks) / TICKS_PER_MINUTE)
    return 100 * (Math.floor(minutes / 60) % 24) + (minutes % 60)
}

/** gameTimeGetTimeString: "h:mm". */
export function gameTimeString(ticks: number): string {
    const minutes = Math.floor(Math.max(0, ticks) / TICKS_PER_MINUTE)
    return `${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`
}
