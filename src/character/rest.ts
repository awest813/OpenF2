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
import { processRadPoisonUpTo } from './radiationPoison.js'
import { processChargedItemsUpTo } from '../chargedItems.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import { midnightCheck } from '../mapAging.js'
import { HOOK, hookReturn, runHook } from '../hookScripts.js'

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

/** Called once from scripting.ts after the event queue is created. */
export function bindTimedEventList(list: TimedEventLike[]): void {
    timedEventList = list
}

export interface TimeAdvanceResult {
    ticksAdvanced: number
    eventsFired: number
    hpHealed: number
    refusedReason?: 'combat' | 'no_player' | 'invalid' | 'unsafe'
    /** Whole hours rested. */
    hoursCompleted?: number
    /** A queued event stopped the rest (poison has the player at 5 HP or less). */
    interrupted?: boolean
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
 * _partyMemberRestingHeal: every party member (the player included) heals
 * its Healing Rate once per three whole hours.
 */
export function partyRestingHeal(hours: number): void {
    const periods = Math.trunc(hours / 3)
    if (periods <= 0) return
    const members: Critter[] = []
    const player = globalState.player as Critter | null
    if (player) members.push(player)
    const party = globalState.gParty
    if (party && typeof party.getPartyMembers === 'function') {
        for (const member of party.getPartyMembers()) {
            if (member && !members.includes(member as Critter)) members.push(member as Critter)
        }
    }
    for (const member of members) {
        if (!member?.stats || member.dead) continue
        const rate = Math.max(0, member.getStat?.('Healing Rate') ?? 0)
        healCritter(member, periods * rate)
    }
    if (player) syncPlayerEntityFromCritter()
}

/**
 * Simulate chem/rad/poison clocks across a large jump without stepping every tick.
 */
function simulateEffectsAcrossAdvance(): boolean {
    const player = globalState.player as Critter | null
    if (!player?.stats) return false

    // Chem expiry is absolute (expiresAt vs gameTickTime) — one pass after the clock jumps.
    tickTimedEffects(player)

    processChargedItemsUpTo(globalState.gameTickTime)
    // Poison ticks, radiation sickness and the midnight radiation check, in time order.
    return processRadPoisonUpTo(globalState.gameTickTime)
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
    // Settle the poison/radiation clock to now before jumping.
    if (tickEffects && globalState.player) processRadPoisonUpTo(globalState.gameTickTime)
    const before = globalState.gameTickTime
    globalState.gameTickTime += amount
    midnightCheck(before, globalState.gameTickTime, globalState.gMap?.objects)

    let hpHealed = 0
    if (heal) {
        hpHealed = applyRestHealing(amount)
    }
    let interrupted = false
    if (tickEffects && globalState.player) {
        interrupted = simulateEffectsAcrossAdvance()
    }

    if (globalState.player) {
        syncPlayerEntityFromCritter()
    }
    return { ticksAdvanced: amount, eventsFired, hpHealed, interrupted }
}

/**
 * critter.cc _critter_can_obj_dude_rest: not with anyone still after the
 * player; and where the map does not allow resting (maps.txt
 * can_rest_here), not with any stranger about either.
 */
export function canRest(): boolean {
    const player = globalState.player as Critter | null
    if (!player || globalState.inCombat) {return false}
    const map: any = globalState.gMap
    let restAllowedHere = true
    try {
        if (typeof map?.canRestHere === 'function') {restAllowedHere = map.canRestHere(globalState.currentElevation ?? 0) !== false}
        else if (typeof map?.canRestHere === 'boolean') {restAllowedHere = map.canRestHere}
    } catch {
        restAllowedHere = true
    }
    let critters: any[] = []
    try {
        critters = map?.getObjects?.() ?? []
    } catch {
        critters = []
    }
    for (const c of critters) {
        if (c?.type !== 'critter' || c === player || c.dead) {continue}
        if (c.whoHitMe === player) {return false}
        if (!restAllowedHere && c.teamNum !== player.teamNum) {return false}
    }
    return true
}

/**
 * Rest for a number of game hours (Pip-Boy alarm clock). Time passes in
 * hour steps so scripted timers fire on the way; the party heals by its
 * Healing Rate for every three hours rested (pipboy.cc _Check4Health /
 * _partyMemberRestingHeal).
 */
export function restForHours(hours: number): TimeAdvanceResult {
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'invalid' }
    }
    if (!globalState.player) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'no_player' }
    }
    if (globalState.inCombat) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'combat' }
    }
    if (!canRest()) {
        return { ticksAdvanced: 0, eventsFired: 0, hpHealed: 0, refusedReason: 'unsafe' }
    }

    const wholeHours = Math.floor(hours)
    const frac = hours - wholeHours
    let ticksAdvanced = 0
    let eventsFired = 0
    let hoursCompleted = 0

    for (let h = 0; h < wholeHours; h++) {
        const chunk = advanceGameTime(TICKS_PER_HOUR, {
            heal: false,
            tickEffects: true,
            requireOutOfCombat: true,
        })
        if (chunk.refusedReason) {
            return { ...chunk, hoursCompleted }
        }
        ticksAdvanced += chunk.ticksAdvanced
        eventsFired += chunk.eventsFired
        hoursCompleted++
        if (chunk.interrupted || restTimerHook(h + 1 >= wholeHours && frac <= 0.001 ? 1 : 0, hours)) {
            return { ticksAdvanced, eventsFired, hpHealed: applyRestHealing(ticksAdvanced), hoursCompleted, interrupted: true }
        }
    }

    if (frac > 0.001) {
        const chunk = advanceGameTime(Math.floor(frac * TICKS_PER_HOUR), {
            heal: false,
            tickEffects: true,
            requireOutOfCombat: true,
        })
        ticksAdvanced += chunk.ticksAdvanced
        eventsFired += chunk.eventsFired
    }

    let hpHealed = 0
    if (ticksAdvanced > 0) {
        hpHealed = applyRestHealing(ticksAdvanced)
        if (globalState.player) {
            syncPlayerEntityFromCritter()
        }
    }

    return { ticksAdvanced, eventsFired, hpHealed, hoursCompleted }
}

/**
 * sfall HOOK_RESTTIMER, run as the rest clock advances: event 1 when the rest
 * ends normally, 0 otherwise. True when a script asked to interrupt it.
 */
function restTimerHook(event: number, hours: number): boolean {
    const total = Math.round(hours * 60)
    const hook = runHook(HOOK.RESTTIMER, [globalState.gameTickTime ?? 0, event, Math.floor(total / 60), total % 60])
    return hookReturn(hook, 0, 0) === 1
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
