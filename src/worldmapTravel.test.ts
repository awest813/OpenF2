import { describe, it, expect } from 'vitest'
import {
    dayPart,
    encounterCheckDue,
    fuelPerPass,
    initWalking,
    newTravelState,
    rollEncounter,
    stepsPerPass,
    travelTicks,
    walkingStep,
    GVAR_CAR_BLOWER,
    GVAR_CAR_UPGRADE_FUEL_CELL_REGULATOR,
    GVAR_NEW_RENO_SUPER_CAR,
} from './worldmapTravel.js'
import { PerkId } from './character/perkIds.js'

const rolls = (...values: number[]) => {
    let i = 0
    return (min: number, max: number) => Math.max(min, Math.min(max, values[Math.min(i++, values.length - 1)]))
}

describe('walking (wmPartyInitWalking / wmPartyWalkingStep)', () => {
    it('follows a Bresenham line one pixel per step to the destination', () => {
        const s = newTravelState(0, 0)
        initWalking(s, 10, 4)
        let steps = 0
        while (s.walking && steps < 100) {
            walkingStep(s, 1)
            steps++
        }
        expect({ x: s.x, y: s.y }).toEqual({ x: 10, y: 4 })
        expect(steps).toBe(10)
    })

    it('hard terrain only moves on step counts at or above its difficulty', () => {
        const moved = (difficulty: number) => {
            const s = newTravelState(0, 0)
            initWalking(s, 100, 0)
            for (let i = 0; i < 40; i++) {walkingStep(s, difficulty)}
            return s.x
        }
        expect(moved(1)).toBe(40)
        expect(moved(2)).toBe(30)
        expect(moved(3)).toBe(20)
        expect(moved(4)).toBe(10)
    })
})

describe('travel time, car and Pathfinder', () => {
    it('half an hour a pass, a quarter less per Pathfinder rank', () => {
        const s = newTravelState(0, 0)
        expect(travelTicks(s, { perkRanks: {} })).toBe(18000)
        expect(travelTicks(s, { perkRanks: { [PerkId.PATHFINDER]: 1 } })).toBe(13500)
        expect(travelTicks(s, { perkRanks: { [PerkId.PATHFINDER]: 2 } })).toBe(9000)
    })

    it('a car takes four steps a pass, more with its upgrades', () => {
        const none = () => 0
        expect(stepsPerPass(false, none)).toBe(1)
        expect(stepsPerPass(true, none)).toBe(4)
        expect(stepsPerPass(true, (n) => (n === GVAR_CAR_BLOWER || n === GVAR_NEW_RENO_SUPER_CAR ? 1 : 0))).toBe(8)
    })

    it('burns 100 fuel a pass, less with upgrades', () => {
        expect(fuelPerPass(() => 0)).toBe(100)
        expect(fuelPerPass((n) => (n === GVAR_NEW_RENO_SUPER_CAR ? 1 : 0))).toBe(10)
        expect(fuelPerPass((n) => (n === GVAR_CAR_UPGRADE_FUEL_CELL_REGULATOR ? 1 : 0))).toBe(50)
    })
})

describe('random encounters (wmRndEncounterOccurred)', () => {
    it('day parts: morning to noon, afternoon to 18:00, night after', () => {
        expect(dayPart(600)).toBe(0)
        expect(dayPart(1159)).toBe(0)
        expect(dayPart(1200)).toBe(1)
        expect(dayPart(1800)).toBe(2)
        expect(dayPart(559)).toBe(2)
    })

    it('checks at most every 1.5 s, and only 3+ pixels away on both axes', () => {
        const s = newTravelState(10, 10)
        s.oldX = 0
        s.oldY = 0
        expect(encounterCheckDue(s, 1000, false)).toBe(false)
        expect(encounterCheckDue(s, 1600, false)).toBe(true)
        expect(encounterCheckDue(s, 2000, false)).toBe(false)
        s.oldX = 9
        expect(encounterCheckDue(s, 4000, false)).toBe(false)
        s.oldX = 0
        expect(encounterCheckDue(s, 6000, true)).toBe(false)
    })

    it('rolls d100 under the frequency, adjusted ±1/15 by difficulty', () => {
        const base = { dayPart: 0 as const, inCar: false, outdoorsman: 0, tileModifier: 0 }
        expect(rollEncounter({ ...base, frequency: 30, gameDifficulty: 1 }, rolls(30)).encounter).toBe(false)
        expect(rollEncounter({ ...base, frequency: 30, gameDifficulty: 1 }, rolls(29, 100)).encounter).toBe(true)
        expect(rollEncounter({ ...base, frequency: 30, gameDifficulty: 0 }, rolls(28)).encounter).toBe(false)
        expect(rollEncounter({ ...base, frequency: 30, gameDifficulty: 2 }, rolls(31, 100)).encounter).toBe(true)
    })

    it('Outdoorsman (capped at 95, plus the tile modifier) spots it for 100 − skill XP', () => {
        const input = { frequency: 50, dayPart: 2 as const, gameDifficulty: 1, inCar: false, outdoorsman: 70, tileModifier: 5 }
        expect(rollEncounter(input, rolls(10, 74))).toEqual({ encounter: true, detected: true, xp: 25 })
        expect(rollEncounter(input, rolls(10, 75))).toEqual({ encounter: true, detected: false, xp: 0 })
    })

    it('driving by day leaves fewer encounters to dodge but the rest are seen coming', () => {
        const input = { frequency: 50, dayPart: 0 as const, gameDifficulty: 1, inCar: true, outdoorsman: 0, tileModifier: 0 }
        expect(rollEncounter(input, rolls(20, 100))).toEqual({ encounter: true, detected: true, xp: 0 })
    })
})
