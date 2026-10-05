/**
 * Critter inventory weight helpers (parity P0-2).
 *
 * Gameplay inventory lives on `Obj` / `Critter` instances. ECS inventory weight
 * is projected separately via `playerProjection.ts`.
 */

import type { Critter, Obj } from './object.js'

import { loadPRO } from './pro.js'

/** Power armors weigh half (item.cc itemGetWeight). */
const HALF_WEIGHT_ARMOR = new Set([3, 232, 348, 349])
const ITEM_HIDDEN = 0x08

function protoWeight(item: Obj): number {
    const direct = (item as any).weight
    if (typeof direct === 'number' && Number.isFinite(direct)) {
        return Math.max(0, direct)
    }
    // Item protos store weight in whole pounds (item.cc itemGetWeight).
    const extra = (item as any).pro?.extra?.weight
    if (typeof extra === 'number' && Number.isFinite(extra)) {
        return Math.max(0, extra)
    }
    const proto = (item as any).pro?.weight
    if (typeof proto === 'number' && Number.isFinite(proto)) {
        return Math.max(0, proto)
    }
    return 0
}

/**
 * item.cc itemGetWeight: hidden items weigh nothing, power armors half, a
 * container adds its contents and a weapon the packs of ammo it holds.
 */
function unitWeightLbs(item: Obj): number {
    const extra = (item as any).pro?.extra ?? {}
    let weight = (extra.itemFlags ?? 0) & ITEM_HIDDEN ? 0 : protoWeight(item)
    switch (extra.subType) {
        case 0: // armor
            if (HALF_WEIGHT_ARMOR.has((item as any).pid & 0xffffff)) {weight = Math.trunc(weight / 2)}
            break
        case 1: // container
            weight += getCritterInventoryWeightLbs(item as any)
            break
        case 3: { // weapon
            const quantity = (item as any).extra?.ammoLoaded ?? 0
            const ammoPid = (item as any).extra?.ammoType ?? extra.ammoPID ?? -1
            if (quantity > 0 && ammoPid !== -1) {
                let ammo: any = null
                try {
                    ammo = loadPRO(ammoPid, ammoPid & 0xffff)
                } catch {
                    ammo = null
                }
                const pack = ammo?.extra?.quantity || 1
                if (ammo) {weight += (ammo.extra?.weight ?? 0) * (Math.trunc((quantity - 1) / pack) + 1)}
            }
            break
        }
    }
    return weight
}

/** item_weight (sfall): one item's weight as item.cc itemGetWeight computes it. */
export function itemWeight(item: Obj): number {
    return unitWeightLbs(item)
}

/** item_total_size: the sizes of the items a critter or container holds. */
export function inventorySize(holder: Obj): number {
    let total = 0
    for (const entry of ((holder as any)?.inventory ?? []) as any[]) {
        const amount = typeof entry?.amount === 'number' ? entry.amount : 1
        total += (entry?.pro?.extra?.size ?? 0) * amount
    }
    return total
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

/** FO2 carry limit: the Carry stat (25 + 25×STR, plus perk/trait modifiers). */
export function getCritterCarryLimitLbs(critter: Critter): number {
    if (critter && typeof critter.getStat === 'function') {
        const carryWeight = critter.getStat('Carry')
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
