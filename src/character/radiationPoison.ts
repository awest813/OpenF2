/**
 * Poison and radiation as the engine runs them (critter.cc
 * critterAdjustPoison / poisonEventProcess / critterAdjustRadiation /
 * _critter_check_rads / _process_rads / radiationEventProcess).
 *
 * Poison: resistance cuts every dose; while poisoned a tick comes every
 * 10 × (505 − 5 × poison) game ticks taking 1 HP and 2 poison.
 * Radiation: resistance cuts every dose; at midnight a dose taken since
 * the last check sets up radiation sickness for the band reached (one
 * worse on a failed Endurance roll), which strikes 4 to 18 hours later
 * with stat penalties that wear off seven days after that.
 *
 * Only the player is affected, as in the engine.
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { getMessage, getRandomInt } from '../util.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import { EventBus } from '../eventBus.js'
import { critterKill } from '../critter.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../gameTime.js'

type Rng = (min: number, max: number) => number
const defaultRng: Rng = (min, max) => getRandomInt(min, max)

/** The radiation sickness levels (RadiationLevel). */
export const RAD_LEVEL_NONE = 0
export const RAD_LEVEL_MINOR = 1
export const RAD_LEVEL_ADVANCED = 2
export const RAD_LEVEL_CRITICAL = 3
export const RAD_LEVEL_DEADLY = 4
export const RAD_LEVEL_FATAL = 5

/** Thresholds the Pip-Boy and older callers use (radiation > 99, > 199, …). */
export const RAD_MINOR = 100
export const RAD_ADVANCED = 200
export const RAD_CRITICAL = 400
export const RAD_DEADLY = 600

export type RadBand = 'none' | 'minor' | 'advanced' | 'critical' | 'deadly' | 'fatal'
const BAND_NAMES: RadBand[] = ['none', 'minor', 'advanced', 'critical', 'deadly', 'fatal']

/** _critter_check_rads: the level a radiation count puts the player at. */
export function radiationLevelFor(radiation: number): number {
    if (radiation > 999) {return RAD_LEVEL_FATAL}
    if (radiation > 599) {return RAD_LEVEL_DEADLY}
    if (radiation > 399) {return RAD_LEVEL_CRITICAL}
    if (radiation > 199) {return RAD_LEVEL_ADVANCED}
    if (radiation > 99) {return RAD_LEVEL_MINOR}
    return RAD_LEVEL_NONE
}

export function radiationBand(level: number): RadBand {
    return BAND_NAMES[radiationLevelFor(level)]
}

/** 0–5 gauge for the Pip-Boy / metarule. */
export function radiationGauge(level: number): number {
    return radiationLevelFor(level)
}

/** gRadiationEnduranceModifiers: the Endurance roll to keep sickness from getting worse. */
const ENDURANCE_MODIFIERS = [2, 0, -2, -4, -6, -8]
/** gRadiationEffectStats (the six SPECIAL stats first). */
const EFFECT_STATS = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'HP', 'Healing Rate']
/** gRadiationEffectPenalties per level. */
const EFFECT_PENALTIES = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, -1, 0, -3],
    [-2, 0, -1, 0, 0, -2, -5, -5],
    [-4, -3, -3, -3, -1, -5, -15, -10],
    [-6, -5, -5, -5, -3, -6, -20, -10],
]

interface RadiationEvent {
    tick: number
    level: number
    healing: boolean
}

/** The player's poison/radiation clock (saved with the game). */
export interface RadPoisonState {
    /** When the next poison tick is due, or null when not poisoned. */
    poisonTick: number | null
    /** Pending radiation sickness (and its recovery) events. */
    radEvents: RadiationEvent[]
    /** CRITTER_RADIATED: a dose was taken since the last midnight check. */
    radiated: boolean
    /** Radiation sickness stat penalties in force (critter bonus stats). */
    penalties: Record<string, number>
}

function stateOf(critter: any): RadPoisonState {
    if (!critter.radPoison) {
        critter.radPoison = { poisonTick: null, radEvents: [], radiated: false, penalties: {} } as RadPoisonState
    }
    return critter.radPoison
}

/** The stat penalty radiation sickness puts on `stat` (for Critter.getStat). */
export function radiationPenalty(critter: any, stat: string): number {
    return critter?.radPoison?.penalties?.[stat] ?? 0
}

export function serializeRadPoison(critter: any): RadPoisonState | null {
    const s = critter?.radPoison as RadPoisonState | undefined
    if (!s) {return null}
    return { poisonTick: s.poisonTick, radEvents: s.radEvents.map((e) => ({ ...e })), radiated: s.radiated, penalties: { ...s.penalties } }
}

export function deserializeRadPoison(critter: any, data: unknown): void {
    if (!critter) {return}
    const d = data as Partial<RadPoisonState> | null | undefined
    critter.radPoison = {
        poisonTick: typeof d?.poisonTick === 'number' ? d.poisonTick : null,
        radEvents: Array.isArray(d?.radEvents)
            ? d!.radEvents.filter((e) => typeof e?.tick === 'number' && typeof e?.level === 'number').map((e) => ({ tick: e.tick, level: e.level, healing: !!e.healing }))
            : [],
        radiated: d?.radiated === true,
        penalties: d?.penalties && typeof d.penalties === 'object' ? { ...d.penalties } : {},
    } as RadPoisonState
}

function isPlayer(critter: any): boolean {
    return !!critter && (critter === globalState.player || critter.isPlayer === true)
}

function show(id: number, fallback: string): void {
    let text: string | null = null
    try {
        text = getMessage('misc', id)
    } catch {
        text = null
    }
    EventBus.emit('ui:message', { text: text ?? fallback })
}

function stat(critter: any, name: string): number {
    try {
        const v = critter?.getStat?.(name)
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

function readLevel(critter: any, name: string): number {
    if (!critter?.stats || typeof critter.stats.getBase !== 'function') {return 0}
    const v = critter.stats.getBase(name)
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
}

/** critterAdjustHitPoints: capped at max; dropping to 0 kills. */
function adjustHitPoints(critter: any, amount: number): void {
    if (!critter?.stats || amount === 0) {return}
    const hp = stat(critter, 'HP')
    const maxHp = stat(critter, 'Max HP')
    const next = Math.min(maxHp, hp + amount)
    critter.stats.modifyBase('HP', next - hp)
    if (next <= 0 && !critter.dead) {
        critterKill(critter, undefined as any, true)
    }
}

/** critterAdjustPoison. */
export function adjustPoison(critter: any, amount: number, now = globalState.gameTickTime ?? 0): void {
    if (!isPlayer(critter) || !critter.stats || !Number.isFinite(amount)) {return}
    const current = readLevel(critter, 'Poison Level')
    if (amount > 0) {
        amount -= Math.trunc((amount * stat(critter, 'DR Poison')) / 100)
    } else if (current <= 0) {
        return
    }
    const s = stateOf(critter)
    const next = current + amount
    if (next > 0) {
        critter.stats.setBase('Poison Level', next)
        s.poisonTick = now + 10 * (505 - 5 * next)
        if (amount < 0) {show(3002, 'You feel a little better.')}
        else {show(3000, 'You have been poisoned!')}
    } else {
        critter.stats.setBase('Poison Level', 0)
        s.poisonTick = null
        show(3003, 'You feel better.')
    }
}

/** poisonEventProcess: −2 poison, −1 HP. True when HP is down to 5 (stop resting). */
function poisonTick(critter: any, now: number): boolean {
    adjustPoison(critter, -2, now)
    adjustHitPoints(critter, -1)
    show(3001, 'You take damage from poison.')
    return stat(critter, 'HP') <= 5
}

/** critterAdjustRadiation. Returns the amount actually taken. */
export function adjustRadiation(critter: any, amount: number): number {
    if (!isPlayer(critter) || !critter.stats || !Number.isFinite(amount)) {return 0}
    if (amount > 0) {
        amount -= Math.trunc((stat(critter, 'DR Radiation') * amount) / 100)
    }
    if (amount > 0) {stateOf(critter).radiated = true}
    if (amount >= 10) {show(1007, 'You have received a large dose of radiation.')}
    const next = Math.max(0, readLevel(critter, 'Radiation Level') + amount)
    critter.stats.setBase('Radiation Level', next)
    return amount
}

/** Older name for adjustRadiation, kept for callers that add a dose. */
export function applyRadiationGain(critter: Critter, amount: number): number {
    return adjustRadiation(critter, amount)
}

/** _process_rads: apply (or lift) a level's penalties. */
function processRads(critter: any, level: number, healing: boolean): void {
    if (level === RAD_LEVEL_NONE) {return}
    const s = stateOf(critter)
    if (healing) {show(3003, 'You feel better.')}
    else {show(1000 + level - 1, 'You feel sick.')}
    const sign = healing ? -1 : 1
    EFFECT_STATS.forEach((name, i) => {
        const delta = sign * EFFECT_PENALTIES[level][i]
        if (delta === 0) {return}
        if (name === 'HP') {
            adjustHitPoints(critter, delta)
            return
        }
        s.penalties[name] = (s.penalties[name] ?? 0) + delta
        if (s.penalties[name] === 0) {delete s.penalties[name]}
    })
    if (!healing && !critter.dead) {
        for (const name of EFFECT_STATS.slice(0, 6)) {
            const base = critter.stats?.get?.(name) ?? 0
            if (base + (s.penalties[name] ?? 0) < 1) {
                show(1006, 'You have died from radiation sickness.')
                adjustHitPoints(critter, -stat(critter, 'HP'))
                break
            }
        }
    }
}

/** _critter_check_rads, at midnight. */
export function checkRads(critter: any, now: number, rng: Rng = defaultRng): void {
    if (!isPlayer(critter)) {return}
    const s = stateOf(critter)
    if (!s.radiated) {return}
    const oldLevel = s.radEvents.length > 0 ? s.radEvents[s.radEvents.length - 1].level : 0
    let level = radiationLevelFor(readLevel(critter, 'Radiation Level'))
    // statRoll: d10 against END + modifier; a failure makes it one worse.
    if (rng(1, 10) > stat(critter, 'END') + ENDURANCE_MODIFIERS[level]) {level++}
    level = Math.min(RAD_LEVEL_FATAL, level)
    if (level > oldLevel) {
        s.radEvents.push({ tick: now + TICKS_PER_HOUR * rng(4, 18), level, healing: false })
    }
    s.radiated = false
}

/** radiationEventProcess. */
function radiationEvent(critter: any, event: RadiationEvent, now: number): void {
    const s = stateOf(critter)
    if (!event.healing) {
        // Recovery comes in seven days; pending recoveries are applied now.
        for (const pending of s.radEvents.splice(0)) {
            if (pending.healing) {processRads(critter, pending.level, true)}
        }
        s.radEvents.push({ tick: now + 7 * TICKS_PER_DAY, level: event.level, healing: true })
    }
    processRads(critter, event.level, event.healing)
}

/**
 * Run the player's poison ticks, radiation events and midnight radiation
 * checks that fall in (before, after], in time order. Returns true when
 * one of them should stop resting (poison has the player at 5 HP or less).
 */
export function processRadPoisonEvents(before: number, after: number, rng: Rng = defaultRng): boolean {
    const player = globalState.player as any
    if (!player?.stats || after <= before) {return false}
    const s = stateOf(player)
    let stop = false
    let guard = 10000
    for (;;) {
        if (--guard <= 0 || player.dead) {break}
        const nextMidnight = (Math.floor(before / TICKS_PER_DAY) + 1) * TICKS_PER_DAY
        const candidates: Array<{ tick: number; run: () => void }> = []
        if (s.poisonTick !== null) {
            const tick = Math.max(before + 1, s.poisonTick)
            candidates.push({ tick, run: () => { if (poisonTick(player, tick)) {stop = true} } })
        }
        for (const event of s.radEvents) {
            const tick = Math.max(before + 1, event.tick)
            candidates.push({ tick, run: () => {
                s.radEvents.splice(s.radEvents.indexOf(event), 1)
                radiationEvent(player, event, tick)
            } })
        }
        candidates.push({ tick: nextMidnight, run: () => checkRads(player, nextMidnight, rng) })
        candidates.sort((a, b) => a.tick - b.tick)
        const next = candidates[0]
        if (next.tick > after) {break}
        before = next.tick - 1
        next.run()
        before = next.tick
    }
    syncPlayerEntityFromCritter()
    return stop
}

/**
 * Catch the player's clock up to `now`, running whatever came due since the
 * last call. The first call (new game, loaded save) only sets the mark.
 */
export function processRadPoisonUpTo(now = globalState.gameTickTime ?? 0, rng: Rng = defaultRng): boolean {
    const player = globalState.player as any
    if (!player?.stats) {return false}
    const s = stateOf(player) as RadPoisonState & { lastTick?: number }
    if (typeof s.lastTick !== 'number' || s.lastTick > now) {
        s.lastTick = now
        return false
    }
    const before = s.lastTick
    s.lastTick = now
    return processRadPoisonEvents(before, now, rng)
}

export function readPlayerRadiationLevel(): number {
    return readLevel(globalState.player as Critter, 'Radiation Level')
}

export function readPlayerPoisonLevel(): number {
    return readLevel(globalState.player as Critter, 'Poison Level')
}
