/**
 * Radiation and poison damage-over-time (parity Slice F / P1-4).
 *
 * Reads Critter `Radiation Level` / `Poison Level` and applies F2-style
 * threshold effects against game time.
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { getActiveRadResistBonus } from './timedEffects.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'

/** Radiation thresholds (Fallout 2-ish). */
export const RAD_MINOR = 150
export const RAD_ADVANCED = 300
export const RAD_CRITICAL = 600
export const RAD_DEADLY = 1000

export type RadBand = 'none' | 'minor' | 'advanced' | 'critical' | 'deadly'

export function radiationBand(level: number): RadBand {
    if (level >= RAD_DEADLY) return 'deadly'
    if (level >= RAD_CRITICAL) return 'critical'
    if (level >= RAD_ADVANCED) return 'advanced'
    if (level >= RAD_MINOR) return 'minor'
    return 'none'
}

/** Human-readable gauge 0–4 for Pip-Boy / metarule. */
export function radiationGauge(level: number): number {
    switch (radiationBand(level)) {
        case 'deadly': return 4
        case 'critical': return 3
        case 'advanced': return 2
        case 'minor': return 1
        default: return 0
    }
}

function readLevel(critter: Critter, name: string): number {
    if (!critter?.stats || typeof critter.stats.getBase !== 'function') return 0
    const v = critter.stats.getBase(name)
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
}

function modifyHp(critter: Critter, delta: number): void {
    if (!critter.stats?.baseStats || !delta) return
    const hp = critter.getStat?.('HP') ?? critter.stats.get?.('HP') ?? 0
    const next = Math.max(0, hp + delta)
    critter.stats.baseStats['HP'] = next
    if (next <= 0 && typeof (critter as any).dead !== 'undefined') {
        // Leave actual death to combat/script systems; mark for visibility.
        ;(critter as any)._radPoisonNearDeath = true
    }
}

/**
 * Effective radiation resistance including Rad-X timed bonus.
 */
export function effectiveRadResistance(critter: Critter): number {
    const base = critter.getStat?.('DR Radiation') ?? critter.stats?.get?.('DR Radiation') ?? 0
    return Math.max(0, Math.min(95, base + getActiveRadResistBonus(critter)))
}

/**
 * When adding radiation, reduce by resistance (Rad-X / END).
 * Call from scripting after raw radiation_add if desired — also used by tests.
 */
export function applyRadiationGain(critter: Critter, amount: number): number {
    if (!Number.isFinite(amount) || amount === 0) return 0
    if (amount < 0) {
        critter.stats?.modifyBase('Radiation Level', amount)
        const cur = readLevel(critter, 'Radiation Level')
        if (cur < 0) critter.stats?.setBase('Radiation Level', 0)
        return amount
    }
    const resist = effectiveRadResistance(critter)
    const taken = Math.max(0, Math.floor(amount * (100 - resist) / 100))
    if (taken > 0) critter.stats?.modifyBase('Radiation Level', taken)
    return taken
}

/** Last tick times so we don't apply DoT every 10Hz tick. */
let lastPoisonTickAt = -1
let lastRadTickAt = -1

/** Poison deals damage about once per game minute (600 ticks). */
const POISON_TICK_INTERVAL = 600
/** Radiation DoT about once per 3 game minutes. */
const RAD_TICK_INTERVAL = 1800

/**
 * Tick poison DoT for a critter. Poison resistance reduces damage.
 */
export function tickPoison(critter: Critter, now = globalState.gameTickTime): number {
    const level = readLevel(critter, 'Poison Level')
    if (level <= 0) return 0

    const resist = critter.getStat?.('DR Poison') ?? critter.stats?.get?.('DR Poison') ?? 0
    // Damage scales with poison level; resistance reduces it.
    const raw = Math.max(1, Math.floor(level / 50))
    const dmg = Math.max(0, Math.floor(raw * (100 - Math.min(95, resist)) / 100))
    if (dmg > 0) modifyHp(critter, -dmg)

    // Natural decay of poison level
    const decay = Math.max(1, Math.floor(level / 20))
    critter.stats?.modifyBase('Poison Level', -decay)
    if (readLevel(critter, 'Poison Level') < 0) {
        critter.stats?.setBase('Poison Level', 0)
    }
    return dmg
}

/**
 * Tick radiation threshold effects (HP loss at high bands).
 */
export function tickRadiation(critter: Critter, now = globalState.gameTickTime): number {
    const level = readLevel(critter, 'Radiation Level')
    const band = radiationBand(level)
    let dmg = 0
    switch (band) {
        case 'minor':
            dmg = 1
            break
        case 'advanced':
            dmg = 2
            break
        case 'critical':
            dmg = 4
            break
        case 'deadly':
            dmg = 8
            break
        default:
            return 0
    }
    modifyHp(critter, -dmg)
    return dmg
}

/**
 * Process player (and optionally all) rad/poison on the slow intervals.
 * Called from the main 10 Hz tick.
 */
export function tickRadiationAndPoison(now = globalState.gameTickTime): void {
    const player = globalState.player as Critter | null
    if (!player || !(player as any).stats) return

    if (lastPoisonTickAt < 0 || now - lastPoisonTickAt >= POISON_TICK_INTERVAL) {
        lastPoisonTickAt = now
        tickPoison(player, now)
    }
    if (lastRadTickAt < 0 || now - lastRadTickAt >= RAD_TICK_INTERVAL) {
        lastRadTickAt = now
        tickRadiation(player, now)
    }

    syncPlayerEntityFromCritter()
}

/** Test helper. */
export function resetRadiationPoisonClocks(): void {
    lastPoisonTickAt = -1
    lastRadTickAt = -1
}

export function readPlayerRadiationLevel(): number {
    return readLevel(globalState.player as Critter, 'Radiation Level')
}

export function readPlayerPoisonLevel(): number {
    return readLevel(globalState.player as Critter, 'Poison Level')
}
