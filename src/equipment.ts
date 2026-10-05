/**
 * Equipped items, as the engine keeps them: the items in a critter's hands
 * and the armor it wears stay in its inventory, marked by the leftHand /
 * rightHand / equippedArmor slots (OBJECT_IN_LEFT_HAND / _RIGHT_HAND /
 * OBJECT_WORN). Inventory screens list only what is not equipped
 * (inventory.cc _setup_inventory sets those items aside and _exit_inventory
 * puts them back).
 *
 * A critter with an empty hand may hold a stand-in "fist" weapon with no
 * pid; that is not an item and never appears in the inventory.
 */

import globalState from './globalState.js'

export type EquipSlot = 'leftHand' | 'rightHand' | 'equippedArmor'
export const EQUIP_SLOTS: readonly EquipSlot[] = ['leftHand', 'rightHand', 'equippedArmor']

/** A real item (not the stand-in fist). */
export function isRealItem(item: any): boolean {
    return !!item && typeof item.pid === 'number'
}

/** The slot an item is equipped in, or null. */
export function equippedSlotOf(critter: any, item: any): EquipSlot | null {
    if (!critter || !isRealItem(item)) {return null}
    for (const slot of EQUIP_SLOTS) {
        if (critter[slot] === item) {return slot}
    }
    return null
}

/** The real items a critter has equipped. */
export function equippedItems(critter: any): any[] {
    const out: any[] = []
    for (const slot of EQUIP_SLOTS) {
        const item = critter?.[slot]
        if (isRealItem(item) && !out.includes(item)) {out.push(item)}
    }
    return out
}

/** What an inventory screen lists: everything not equipped. */
export function listedItems(critter: any): any[] {
    const equipped = equippedItems(critter)
    return (critter?.inventory ?? []).filter((item: any) => !equipped.includes(item))
}

function emptySlot(critter: any, slot: EquipSlot): void {
    critter[slot] = slot === 'equippedArmor' ? null : undefined
}

/** Clear any slot holding `item` (the item stays where it is). */
export function unequipItem(critter: any, item: any): void {
    for (const slot of EQUIP_SLOTS) {
        if (critter?.[slot] === item) {emptySlot(critter, slot)}
    }
}

/** Empty a slot; the item stays in the inventory. */
export function unequipSlot(critter: any, slot: EquipSlot): void {
    if (critter) {emptySlot(critter, slot)}
}

/**
 * Put one of an inventory item into a slot. Armor only goes on the body and
 * the body takes only armor; a stack gives up one item, which becomes its
 * own entry. Whatever was in the slot stays in the inventory, unequipped.
 * Returns the equipped item, or null when it cannot go there.
 */
export function equipItem(critter: any, item: any, slot: EquipSlot): any {
    if (!critter || !isRealItem(item) || !Array.isArray(critter.inventory)) {return null}
    const isArmor = item.subtype === 'armor'
    if ((slot === 'equippedArmor') !== isArmor) {return null}
    if (!critter.inventory.includes(item)) {return null}

    let one = item
    if (typeof item.amount === 'number' && item.amount > 1 && equippedSlotOf(critter, item) === null) {
        one = typeof item.clone === 'function' ? item.clone() : { ...item }
        one.amount = 1
        item.amount -= 1
        critter.inventory.push(one)
    }
    unequipItem(critter, one)
    critter[slot] = one
    return one
}

/**
 * Take `count` of an item out of a critter's inventory (itemRemove). An
 * emptied entry leaves its slot. Returns how many were taken.
 */
export function removeItem(critter: any, item: any, count = 1): number {
    const inv: any[] = critter?.inventory ?? []
    const index = inv.indexOf(item)
    if (index < 0) {return 0}
    const have = typeof item.amount === 'number' ? item.amount : 1
    const taken = Math.max(0, Math.min(have, count))
    if (taken >= have) {
        inv.splice(index, 1)
        unequipItem(critter, item)
    } else {
        item.amount = have - taken
    }
    return taken
}

/**
 * _setup_inventory / _exit_inventory: while a trade or loot screen is open
 * the player's equipped items are out of the list. Returns the function
 * that puts them back.
 */
export function setAsideEquipped(critter: any = globalState.player): () => void {
    const inv: any[] = critter?.inventory
    if (!Array.isArray(inv)) {return () => {}}
    const held = equippedItems(critter).filter((item) => inv.includes(item))
    for (const item of held) {inv.splice(inv.indexOf(item), 1)}
    let restored = false
    return () => {
        if (restored) {return}
        restored = true
        const live: any[] = critter.inventory ?? (critter.inventory = [])
        for (const item of held) {
            if (!live.includes(item)) {live.push(item)}
        }
    }
}

/** Clear slots whose item has left the critter's inventory (traded or looted away). */
export function reconcileSlots(critter: any): void {
    const inv: any[] = critter?.inventory ?? []
    for (const slot of EQUIP_SLOTS) {
        const item = critter?.[slot]
        if (isRealItem(item) && !inv.includes(item)) {emptySlot(critter, slot)}
    }
}

/**
 * inventoryOpenTrade: the player's equipped items, and the merchant's armor
 * and right-hand item (or, outside the party, its first weapon), are out of
 * the lists while bartering.
 */
export function setAsideForBarter(player: any, merchant: any, merchantInParty = false): () => void {
    const restorePlayer = setAsideEquipped(player)
    const inv: any[] = Array.isArray(merchant?.inventory) ? merchant.inventory : []
    const held: any[] = []
    const take = (item: any) => {
        if (isRealItem(item) && inv.includes(item) && !held.includes(item)) {
            inv.splice(inv.indexOf(item), 1)
            held.push(item)
        }
    }
    take(merchant?.equippedArmor)
    if (isRealItem(merchant?.rightHand)) {take(merchant.rightHand)}
    else if (!merchantInParty) {take(inv.find((item: any) => item?.subtype === 'weapon'))}
    let restored = false
    return () => {
        if (restored) {return}
        restored = true
        restorePlayer()
        const live: any[] = merchant.inventory ?? (merchant.inventory = [])
        for (const item of held) {
            if (!live.includes(item)) {live.push(item)}
        }
    }
}
