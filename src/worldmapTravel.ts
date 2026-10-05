/**
 * Walking the world map the way the engine does (worldmap.cc
 * wmPartyInitWalking / wmPartyWalkingStep / wmGameTimeIncrement /
 * wmRndEncounterOccurred). The party moves one pixel per step along a
 * Bresenham line; hard terrain skips steps; every pass of the travel loop
 * costs half an hour (less with Pathfinder); the party heals once a second
 * of travel; and every 1.5 seconds a random encounter may be rolled from
 * the sub-tile's chance for the time of day.
 *
 * The loop runs at 60 passes a second, as fallout2-ce's frame limiter does.
 */

import { sfallSettings } from './sfallSettings.js'
import { PerkId, perkRank } from './character/perkIds.js'
import type { Rng } from './combat/fo2Formulas.js'

/** One pass of the travel loop. */
export const TRAVEL_PASS_MS = 1000 / 60
/** wmGameTimeIncrement(18000): half an hour of game time per pass while moving. */
export const TRAVEL_TICKS_PER_PASS = 18000
/** _partyMemberRestingHeal(3) at most once a second of travel. */
export const TRAVEL_HEAL_INTERVAL_MS = 1000
/** wmRndEncounterOccurred at most every 1.5 seconds. */
export const ENCOUNTER_CHECK_INTERVAL_MS = 1500
/** gDayPartEncounterFrequencyModifiers: driving makes encounters rarer by day. */
export const CAR_ENCOUNTER_MODIFIERS = [40, 30, 0]

export const GVAR_CAR_BLOWER = 439
export const GVAR_CAR_UPGRADE_FUEL_CELL_REGULATOR = 453
export const GVAR_NEW_RENO_CAR_UPGRADE = 455
export const GVAR_NEW_RENO_SUPER_CAR = 456

export interface TravelState {
    x: number
    y: number
    walking: boolean
    walkDistance: number
    lineDelta: number
    lineDeltaMain: number
    lineDeltaCross: number
    mainStepX: number
    mainStepY: number
    crossStepX: number
    crossStepY: number
    terrainCounter: number
    /** Where the last encounter was rolled (wmGenData.oldWorldPos). */
    oldX: number
    oldY: number
    lastEncounterCheckMs: number
    lastHealMs: number
    /** Pathfinder's fraction of a tick carried to the next pass. */
    timeRemainder: number
}

export function newTravelState(x: number, y: number): TravelState {
    return {
        x, y,
        walking: false,
        walkDistance: 0,
        lineDelta: 0,
        lineDeltaMain: 0,
        lineDeltaCross: 0,
        mainStepX: 0,
        mainStepY: 0,
        crossStepX: 0,
        crossStepY: 0,
        terrainCounter: 0,
        oldX: 0,
        oldY: 0,
        lastEncounterCheckMs: 0,
        lastHealMs: 0,
        timeRemainder: 0,
    }
}

/** wmPartyInitWalking: set up the line to (x, y). */
export function initWalking(s: TravelState, x: number, y: number): void {
    x = Math.round(x)
    y = Math.round(y)
    s.walking = true
    const dx = Math.abs(x - s.x)
    const dy = Math.abs(y - s.y)
    if (dx < dy) {
        s.walkDistance = dy
        s.lineDeltaMain = 2 * dx
        s.mainStepX = 0
        s.lineDelta = 2 * dx - dy
        s.lineDeltaCross = 2 * (dx - dy)
        s.crossStepX = 1
        s.mainStepY = 1
        s.crossStepY = 1
    } else {
        s.walkDistance = dx
        s.lineDeltaMain = 2 * dy
        s.mainStepY = 0
        s.lineDelta = 2 * dy - dx
        s.lineDeltaCross = 2 * (dy - dx)
        s.mainStepX = 1
        s.crossStepX = 1
        s.crossStepY = 1
    }
    if (x < s.x) {
        s.crossStepX = -s.crossStepX
        s.mainStepX = -s.mainStepX
    }
    if (y < s.y) {
        s.crossStepY = -s.crossStepY
        s.mainStepY = -s.mainStepY
    }
    if (s.walkDistance === 0) {s.walking = false}
}

/**
 * wmPartyWalkingStep: the step counter runs 1–4; the party only moves on
 * counts at or above the terrain's difficulty.
 */
export function walkingStep(s: TravelState, terrainDifficulty: number): void {
    if (s.walkDistance <= 0) {return}
    s.terrainCounter++
    if (s.terrainCounter > 4) {s.terrainCounter = 1}
    const difficulty = Math.max(1, terrainDifficulty || 1)
    if (Math.trunc(s.terrainCounter / difficulty) < 1) {return}
    if (s.lineDelta >= 0) {
        s.lineDelta += s.lineDeltaCross
        s.x += s.crossStepX
        s.y += s.crossStepY
    } else {
        s.lineDelta += s.lineDeltaMain
        s.x += s.mainStepX
        s.y += s.mainStepY
    }
    s.walkDistance -= 1
    if (s.walkDistance === 0) {s.walking = false}
}

/** How many steps a pass takes: one on foot, four or more by car. */
export function stepsPerPass(inCar: boolean, gvar: (n: number) => number): number {
    if (!inCar) {return 1}
    let steps = 4
    if (gvar(GVAR_CAR_BLOWER)) {steps += 1}
    if (gvar(GVAR_NEW_RENO_CAR_UPGRADE)) {steps += 1}
    if (gvar(GVAR_NEW_RENO_SUPER_CAR)) {steps += 3}
    return steps
}

/** wmCarUseGas(100): the fuel one pass burns, after the car's upgrades. */
export function fuelPerPass(gvar: (n: number) => number): number {
    let amount = 100
    if (gvar(GVAR_NEW_RENO_SUPER_CAR)) {amount -= Math.trunc((amount * 90) / 100)}
    if (gvar(GVAR_NEW_RENO_CAR_UPGRADE)) {amount -= Math.trunc((amount * 10) / 100)}
    if (gvar(GVAR_CAR_UPGRADE_FUEL_CELL_REGULATOR)) {amount = Math.trunc(amount / 2)}
    return amount
}

/** wmGameTimeIncrement's Pathfinder cut: 25% less time per rank, fractions carried. */
export function travelTicks(s: TravelState, player: any): number {
    const rank = perkRank(player, PerkId.PATHFINDER)
    if (sfallSettings.mapTimeMulti !== 1) {
        // sfall PathfinderCalc: ticks × set_map_time_multi × (1 − rank/4), fractions carried.
        const total = TRAVEL_TICKS_PER_PASS * sfallSettings.mapTimeMulti * Math.max(0, 1 - Math.min(rank, 3) * 0.25) + s.timeRemainder
        const whole = Math.trunc(total)
        s.timeRemainder = total - whole
        return whole
    }
    const bonus = TRAVEL_TICKS_PER_PASS * rank * 0.25 + s.timeRemainder
    const whole = Math.trunc(bonus)
    s.timeRemainder = bonus - whole
    return TRAVEL_TICKS_PER_PASS - whole
}

export type DayPart = 0 | 1 | 2

/** wmRndEncounterOccurred: night from 18:00 to 6:00, afternoon from noon. */
export function dayPart(hhmm: number): DayPart {
    if (hhmm >= 1800 || hhmm < 600) {return 2}
    if (hhmm >= 1200) {return 1}
    return 0
}

export interface EncounterRollInput {
    /** The sub-tile's chance for this part of the day (wmFreqValues). */
    frequency: number
    dayPart: DayPart
    /** 0 easy, 1 normal, 2 hard. */
    gameDifficulty: number
    inCar: boolean
    /** Best Outdoorsman in the party (+20 with a motion sensor). */
    outdoorsman: number
    /** The tile's encounter_difficulty. */
    tileModifier: number
}

export interface EncounterRoll {
    encounter: boolean
    /** The party saw it coming and may choose to avoid it. */
    detected: boolean
    /** Experience for spotting it. */
    xp: number
}

/** The dice of wmRndEncounterOccurred once the time and place allow one. */
export function rollEncounter(input: EncounterRollInput, rng: Rng): EncounterRoll {
    let frequency = input.frequency
    if (frequency > 0 && frequency < 100) {
        const modifier = Math.trunc(frequency / 15)
        if (input.gameDifficulty === 0) {frequency -= modifier}
        else if (input.gameDifficulty === 2) {frequency += modifier}
    }
    const chance = rng(0, 100)
    if (chance >= frequency) {return { encounter: false, detected: false, xp: 0 }}

    if (input.inCar) {frequency -= CAR_ENCOUNTER_MODIFIERS[input.dayPart]}

    if (frequency > chance) {
        const outdoorsman = Math.min(95, input.outdoorsman) + input.tileModifier
        if (rng(1, 100) < outdoorsman) {
            return { encounter: true, detected: true, xp: Math.max(0, 100 - outdoorsman) }
        }
        return { encounter: true, detected: false, xp: 0 }
    }
    return { encounter: true, detected: true, xp: 0 }
}

/**
 * The time-and-place gate before the dice: 1.5 s since the last check,
 * at least 3 pixels away from the last encounter on both axes, and not
 * inside a location.
 */
export function encounterCheckDue(s: TravelState, nowMs: number, inArea: boolean): boolean {
    if (nowMs - s.lastEncounterCheckMs < ENCOUNTER_CHECK_INTERVAL_MS) {return false}
    s.lastEncounterCheckMs = nowMs
    if (Math.abs(s.oldX - s.x) < 3) {return false}
    if (Math.abs(s.oldY - s.y) < 3) {return false}
    return !inArea
}
