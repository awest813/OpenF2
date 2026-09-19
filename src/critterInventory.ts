/**
 * Critter inventory weight helpers (parity P0-2).
 *
 * Gameplay inventory lives on `Obj` / `Critter` instances. ECS inventory weight
 * is projected separately via `playerProjection.ts`.
 */

import type { Critter, Obj } from './object.js'

function unitWeightLbs(item: Obj): number {
    const direct = (item as any).weight
    if (typeof direct === 'number' && Number.isFinite(direct)) {
        return Math.max(0, direct)
    }
    const extra = (item as any).pro?.extra?.weight
    if (typeof extra === 'number' && Number.isFinite(extra)) {
        return Math.max(0, Math.round(extra / 10))
    }
    const proto = (item as any).pro?.weight
    if (typeof proto === 'number' && Number.isFinite(proto)) {
        return Math.max(0, Math.round(proto / 10))
    }
    return 0
}

/** Weight in lbs for `count` items (defaults to entry.amount when omitted). */
export function getItemWeightLbs(item: Obj, count?: number): number {
    const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 1
    return unitWeightLbs(item) * n
}

/** Sum carried weight for a critter inventory (runtime weight fields). */
export function getCritterInventoryWeightLbs(critter: Critter): number {
    const inv = critter?.inventory
    if (!Array.isArray(inv)) {
        return 0
    }
    let total = 0
    for (const entry of inv) {
        const amount = typeof entry?.amount === 'number' && Number.isFinite(entry.amount)
            ? Math.max(0, entry.amount)
            : 1
        total += getItemWeightLbs(entry as Obj, amount)
    }
    return total
}

/** FO2 carry limit: Carry Weight / explicit Carry base, else 25 + STR×25. */
export function getCritterCarryLimitLbs(critter: Critter): number {
    if (critter && typeof critter.getStat === 'function') {
        const carryWeight = critter.getStat('Carry Weight')
        if (typeof carryWeight === 'number' && Number.isFinite(carryWeight) && carryWeight > 0) {
            return carryWeight
        }
        const stats = (critter as any).stats
        const carryOverride = stats?.baseStats?.['Carry']
        if (typeof carryOverride === 'number' && Number.isFinite(carryOverride) && carryOverride > 0) {
            return carryOverride
        }
        const str = critter.getStat('STR') ?? 5
        return 25 + str * 25
    }
    return 150
}

/**
 * Returns true when the critter can accept `count` more of `item` without exceeding
 * carry weight. No-op for non-critters.
 */
export function canCritterCarryMore(critter: Critter, item: Obj, count = 1): boolean {
    if (!critter || critter.type !== 'critter') {
        return true
    }
    const addCount = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0
    if (addCount <= 0) {
        return true
    }
    const limit = getCritterCarryLimitLbs(critter)
    const current = getCritterInventoryWeightLbs(critter)
    const unit = unitWeightLbs(item)
    if (unit <= 0) {
        return true
    }

    const inv = critter.inventory
    if (Array.isArray(inv)) {
        for (const entry of inv) {
            if (typeof entry?.approxEq === 'function' && entry.approxEq(item)) {
                return current + unit * addCount <= limit
            }
        }
    }
    return current + unit * addCount <= limit
}
