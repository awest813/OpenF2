/**
 * Rest / deliberate time advance (parity Slice G / P1-11).
 *
 * Advances `globalState.gameTickTime`, fires due scripted timed events, applies
 * Healing Rate over rest, and runs chem/rad/poison clocks so large jumps stay
 * consistent with the 10 Hz path.
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { tickTimedEffects } from './timedEffects.js'
import { tickPoison, tickRadiation } from './radiationPoison.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'

/** FO2: heal `Healing Rate` HP every 3 game hours while resting. */
export const TICKS_PER_SECOND = 10
export const TICKS_PER_HOUR = 3600 * TICKS_PER_SECOND
export const HEAL_INTERVAL_TICKS = 3 * TICKS_PER_HOUR

/** Minimal timed-event shape (bound from Scripting.timeEventList to avoid cycles). */
export interface TimedEventLike {
    ticks: number
    obj?: any
    fn: () => void
}

let timedEventList: TimedEventLike[] | null = null

/** Called once from scripting.ts after the event queue is created. */
export function bindTimedEventList(list: TimedEventLike[]): void {
    timedEventList = list
}

export interface TimeAdvanceResult {
    ticksAdvanced: number
    eventsFired: number
    hpHealed: number
    refusedReason?: 'combat' | 'no_player' | 'invalid'
}

export interface AdvanceOptions {
    /** Apply Healing Rate for elapsed time (rest only). */
    heal?: boolean
    /** Run chem expiry + rad/poison DoT simulation. */
    tickEffects?: boolean
    /** Refuse when `globalState.inCombat` (Pip-Boy rest). */
    requireOutOfCombat?: boolean
}

function healCritter(critter: Critter, amount: number): number {
    if (!critter?.stats || amount <= 0) return 0
    const maxHp = critter.getStat?.('Max HP') ?? critter.stats.get?.('Max HP') ?? 0
    const hp = critter.getStat?.('HP') ?? critter.stats.get?.('HP') ?? 0
    const room = Math.max(0, maxHp - hp)
    const heal = Math.min(amount, room)
    if (heal > 0) {
        critter.stats.modifyBase('HP', heal)
    }
    return heal
}

/**
 * Fire scripted timed events whose remaining ticks are covered by this advance.
 * Mirrors the 10 Hz loop in `main.ts` (decrement then invoke when <= 0).
 */
export function processTimedEventsForAdvance(ticks: number): number {
    if (ticks <= 0 || !timedEventList) return 0
    const timedEvents = timedEventList
    let fired = 0
    for (let i = 0; i < timedEvents.length; i++) {
        const event = timedEvents[i]
        const obj = event.obj
        if (obj && obj instanceof Critter && obj.dead) {
            timedEvents.splice(i--, 1)
            continue
        }
        event.ticks -= ticks
        if (event.ticks <= 0) {
            try {
                event.fn()
            } catch (err) {
                console.warn('timed event during time advance threw', err)
            }
            timedEvents.splice(i--, 1)
            fired++
        }
    }
    return fired
}

function applyRestHealing(ticks: number): number {
    const periods = Math.floor(ticks / HEAL_INTERVAL_TICKS)
    if (periods <= 0) return 0

    let healed = 0
    const player = globalState.player as Critter | null
    if (player?.stats) {
        const rate = Math.max(0, player.getStat?.('Healing Rate') ?? player.stats.get?.('Healing Rate') ?? 1)
        healed += healCritter(player, periods * rate)
    }

    const party = globalState.gParty
    if (party && typeof party.getPartyMembers === 'function') {
        for (const member of party.getPartyMembers()) {
            if (!member?.stats || (member as Critter).dead) continue
            const rate = Math.max(0, member.getStat?.('Healing Rate') ?? member.stats.get?.('Healing Rate') ?? 1)
            healCritter(member as Critter, periods * rate)
        }
    }
    return healed
}

/**
 * Simulate chem/rad/poison clocks across a large jump without stepping every tick.
 */
function simulateEffectsAcrossAdvance(ticks: number): void {
    const player = globalState.player as Critter | null
    if (!player?.stats) return

    // Chem expiry is absolute (expiresAt vs gameTickTime) — one pass after the clock jumps.
    tickTimedEffects(player)

    // Poison ~every 600 ticks, radiation DoT ~every 1800 ticks (see radiationPoison.ts).
    const poisonRounds = Math.floor(ticks / 600)
    const radRounds = Math.floor(ticks / 1800)
    for (let i = 0; i < poisonRounds; i++) tickPoison(player)
    for (let i = 0; i < radRounds; i++) tickRadiation(player)
}

/**
 * Core time advance used by Pip-Boy rest and (optionally) `game_time_advance`.
 */
export function advanceGameTime(ticks: number, opts: AdvanceOptions = {}): TimeAdvanceResult {
    const heal = opts.heal === true
    const tickEffects = opts.tickEffects !== false
    const requireOutOfCombat = opts.requireOutOfCombat === true

    if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    if (requireOutOfCombat && globalState.inCombat) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'combat' }
    }
    if (heal && !globalState.player) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'no_player' }
    }

    const amount = Math.floor(ticks)
    const eventsFired = processTimedEventsForAdvance(amount)
    globalState.gameTickTime += amount

    let hpHealed = 0
    if (heal) {
        hpHealed = applyRestHealing(amount)
    }
    if (tickEffects && globalState.player) {
        simulateEffectsAcrossAdvance(amount)
    }

    if (globalState.player) {
        syncPlayerEntityFromCritter()
    }
    return { ticksAdvanced: amount, eventsFired, hpHealed }
}

export function canRest(): boolean {
    return !!globalState.player && !globalState.inCombat
}

/** Rest for a number of game hours (Pip-Boy alarm clock). */
export function restForHours(hours: number): TimeAdvanceResult {
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    return advanceGameTime(hours * TICKS_PER_HOUR, {
        heal: true,
        tickEffects: true,
        requireOutOfCombat: true,
    })
}

/** Rest for a number of game minutes. */
export function restForMinutes(minutes: number): TimeAdvanceResult {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    return advanceGameTime(minutes * 60 * TICKS_PER_SECOND, {
        heal: true,
        tickEffects: true,
        requireOutOfCombat: true,
    })
}

export function hoursToTicks(hours: number): number {
    return Math.floor(hours * TICKS_PER_HOUR)
}
