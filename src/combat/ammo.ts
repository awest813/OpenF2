/**
 * Weapon ammo mechanics — per-shot consumption, empty-weapon "click", and
 * reload from carried ammo stacks.
 *
 * FO2 model:
 *  - Ranged weapons declare the ammo PID they take (proto extra.ammoPID)
 *    and their capacity in rounds (proto extra.maxAmmo).
 *  - Every trigger pull consumes one round (bursts consume what they fire).
 *  - Attacking with an empty weapon produces a dry "click" and consumes
 *    nothing — no AP, no attack roll.
 *  - Reloading moves rounds from matching ammo stacks in the critter's
 *    inventory up to weapon capacity; in combat it costs 2 AP.
 *
 * Runtime state lives on the weapon Obj: extra.ammoLoaded (rounds),
 * extra.ammoType (PID actually loaded — sfall get/set_weapon_ammo_pid).
 */

import globalState from '../globalState.js'
import { Critter, Obj } from '../object.js'

/** True when the weapon is a ranged weapon that consumes ammo. */
export function isRangedWeapon(weapon: Obj | null | undefined): boolean {
    if (!weapon) {return false}
    const ammoPid = (weapon as any).pro?.extra?.ammoPID
    const capacity = (weapon as any).pro?.extra?.maxAmmo
    return typeof ammoPid === 'number' && ammoPid > 0 && typeof capacity === 'number' && capacity > 0
}

/** Rounds currently loaded (0 for melee/fists or unset state). */
export function getLoadedAmmo(weapon: Obj | null | undefined): number {
    if (!weapon) {return 0}
    const loaded = (weapon as any).extra?.ammoLoaded
    return typeof loaded === 'number' && loaded > 0 ? loaded : 0
}

/** The ammo PID this weapon takes: what was loaded, else what the proto requires. */
export function weaponAmmoPid(weapon: Obj): number {
    const loaded = (weapon as any).extra?.ammoType
    if (typeof loaded === 'number' && loaded !== -1) {return loaded}
    const required = (weapon as any).pro?.extra?.ammoPID
    return typeof required === 'number' ? required : -1
}

/** True when the weapon is ranged and cannot fire (dry click). */
export function weaponNeedsReload(weapon: Obj | null | undefined): boolean {
    return isRangedWeapon(weapon) && getLoadedAmmo(weapon) <= 0
}

/**
 * Consume `rounds` from the weapon. Returns false (consuming nothing) when
 * fewer rounds are loaded than requested.
 */
export function consumeRounds(weapon: Obj, rounds = 1): boolean {
    const loaded = getLoadedAmmo(weapon)
    if (loaded < rounds) {return false}
    if (!(weapon as any).extra) {(weapon as any).extra = {}}
    ;(weapon as any).extra.ammoLoaded = loaded - rounds
    return true
}

/**
 * Reload `weapon` from matching ammo stacks in `critter.inventory`.
 * Costs 2 AP when combat is active and the critter keeps an AP ledger.
 *
 * Returns the number of rounds loaded (0 when the weapon was already full,
 * no matching ammo was carried, or the AP cost could not be paid).
 */
export function reloadWeapon(
    critter: Critter,
    weapon: Obj,
    opts: { apCost?: number } = {},
): { loaded: number; reason?: 'full' | 'no-ammo' | 'no-ap' } {
    if (!isRangedWeapon(weapon)) {return { loaded: 0, reason: 'no-ammo' }}

    const capacity = (weapon as any).pro.extra.maxAmmo as number
    const loaded = getLoadedAmmo(weapon)
    if (loaded >= capacity) {return { loaded: 0, reason: 'full' }}

    const ammoPid = weaponAmmoPid(weapon)
    const inventory: Obj[] = Array.isArray(critter.inventory) ? critter.inventory : []
    const ammoStack = inventory.find((o) => {
        if ((o as any).pid !== ammoPid) {return false}
        const amount = (o as any).amount
        return typeof amount === 'number' ? amount > 0 : true
    })
    if (!ammoStack) {return { loaded: 0, reason: 'no-ammo' }}

    // In combat, reloading costs AP (FO2: 2). Out of combat it is free.
    const apCost = opts.apCost ?? 2
    if (globalState.inCombat && (critter as any).AP) {
        const ap = (critter as any).AP
        const available = typeof ap.getAvailableCombatAP === 'function'
            ? ap.getAvailableCombatAP()
            : 0
        if (available < apCost) {return { loaded: 0, reason: 'no-ap' }}
        ap.subtractCombatAP(apCost)
    }

    // Move rounds from the stack into the weapon, up to capacity.
    const stack = (ammoStack as any).amount ?? 1
    const space = capacity - loaded
    const moved = Math.min(space, stack)

    if (!(weapon as any).extra) {(weapon as any).extra = {}}
    ;(weapon as any).extra.ammoLoaded = loaded + moved
    ;(weapon as any).extra.ammoType = ammoPid

    if (stack > moved) {
        ;(ammoStack as any).amount = stack - moved
    } else {
        const idx = inventory.indexOf(ammoStack)
        if (idx >= 0) {inventory.splice(idx, 1)}
    }
    return { loaded: moved }
}
