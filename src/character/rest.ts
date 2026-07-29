/**
 * Rest / deliberate time advance (parity Slice G / P1-11).
 *
 * Advances `globalState.gameTickTime`, fires due scripted timed events, applies
 * Healing Rate over rest, and runs chem/rad/poison clocks so large jumps stay
 * consistent with the 10 Hz path. Long rests may be interrupted by encounters.
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { tickTimedEffects } from './timedEffects.js'
import { tickPoison, tickRadiation } from './radiationPoison.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import { EventBus } from '../eventBus.js'
import { Config } from '../config.js'

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

/** Optional override for tests / scripts (`null` = auto-detect). */
let restDangerOverride: RestDanger | null = null

/** Called once from scripting.ts after the event queue is created. */
export function bindTimedEventList(list: TimedEventLike[]): void {
    timedEventList = list
}

export type RestDanger = 'safe' | 'low' | 'medium' | 'high'

/** Interrupt chance (%) rolled once per rested hour. */
export const REST_INTERRUPT_CHANCE: Record<RestDanger, number> = {
    safe: 0,
    low: 3,
    medium: 10,
    high: 25,
}

export interface TimeAdvanceResult {
    ticksAdvanced: number
    eventsFired: number
    hpHealed: number
    refusedReason?: 'combat' | 'no_player' | 'invalid'
    /** True when a rest encounter interrupted the remaining hours. */
    interrupted?: boolean
    /** Whole hours completed before interrupt (rest path). */
    hoursCompleted?: number
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

/** Force rest danger for tests; pass null to clear. */
export function setRestDangerOverride(danger: RestDanger | null): void {
    restDangerOverride = danger
}

/**
 * Heuristic rest safety. Outdoor maps / world-map context are riskier.
 * Scripts/tests can override via `setRestDangerOverride`.
 */
export function getRestDanger(): RestDanger {
    if (restDangerOverride) return restDangerOverride
    if (Config.engine?.doEncounters === false) return 'safe'
    const map = globalState.gMap as any
    if (map?.isOutdoor === true || map?.restDanger === 'high') return 'high'
    if (map?.restDanger === 'medium' || map?.isOutdoor === 'partial') return 'medium'
    if (map?.restDanger === 'safe' || map?.isIndoor === true) return 'safe'
    // Travelling / recently on world map → elevated risk
    if (globalState.worldPosition) return 'medium'
    return 'low'
}

/**
 * Roll whether rest is interrupted for the coming hour.
 * Exported for tests; uses Math.random unless a custom rng is passed.
 */
export function rollRestInterrupt(danger: RestDanger = getRestDanger(), rng: () => number = Math.random): boolean {
    const chance = REST_INTERRUPT_CHANCE[danger] ?? 0
    if (chance <= 0) return false
    return Math.floor(rng() * 100) < chance
}

/** Rest for a number of game hours (Pip-Boy alarm clock), hour-by-hour with interrupt checks. */
export function restForHours(hours: number): TimeAdvanceResult {
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    if (!canRest()) {
        return {
            ticksAdvanced: 0,
            eventsFired: 0,
            hpHealed: 0,
            refusedReason: globalState.inCombat ? 'combat' : 'no_player',
        }
    }

    const wholeHours = Math.floor(hours)
    const frac = hours - wholeHours
    let ticksAdvanced = 0
    let eventsFired = 0
    let hpHealed = 0
    let hoursCompleted = 0
    let interrupted = false

    for (let h = 0; h < wholeHours; h++) {
        if (rollRestInterrupt()) {
            interrupted = true
            EventBus.emit('rest:interrupted', {
                hoursCompleted,
                hoursRequested: hours,
                danger: getRestDanger(),
            })
            break
        }
        const chunk = advanceGameTime(TICKS_PER_HOUR, {
            heal: true,
            tickEffects: true,
            requireOutOfCombat: true,
        })
        if (chunk.refusedReason) {
            return { ...chunk, hoursCompleted, interrupted }
        }
        ticksAdvanced += chunk.ticksAdvanced
        eventsFired += chunk.eventsFired
        hpHealed += chunk.hpHealed
        hoursCompleted++
    }

    if (!interrupted && frac > 0.001) {
        if (rollRestInterrupt()) {
            interrupted = true
            EventBus.emit('rest:interrupted', {
                hoursCompleted,
                hoursRequested: hours,
                danger: getRestDanger(),
            })
        } else {
            const chunk = advanceGameTime(Math.floor(frac * TICKS_PER_HOUR), {
                heal: true,
                tickEffects: true,
                requireOutOfCombat: true,
            })
            ticksAdvanced += chunk.ticksAdvanced
            eventsFired += chunk.eventsFired
            hpHealed += chunk.hpHealed
        }
    }

    return { ticksAdvanced, eventsFired, hpHealed, interrupted, hoursCompleted }
}

/** Rest for a number of game minutes. */
export function restForMinutes(minutes: number): TimeAdvanceResult {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    // Short rests (< 60 min) skip interrupt rolls; longer ones go through hours.
    if (minutes < 60) {
        return advanceGameTime(minutes * 60 * TICKS_PER_SECOND, {
            heal: true,
            tickEffects: true,
            requireOutOfCombat: true,
        })
    }
    return restForHours(minutes / 60)
}

export function hoursToTicks(hours: number): number {
    return Math.floor(hours * TICKS_PER_HOUR)
}
