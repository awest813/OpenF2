/**
 * Inventory system — item pickup, drop, and equipment management.
 *
 * Responsibilities:
 *  - Enforce carry weight limits when adding items
 *  - Track total carried weight on InventoryComponent
 *  - Equip/unequip armor (applying DT/DR/AC changes to StatsComponent)
 *  - Equip/unequip weapons (updating InventoryComponent hand slots)
 *  - Emit EventBus events so the UI and scripting layer can react
 *
 * Item weight in lbs is provided by the caller (sourced from PRO data).
 * This keeps the inventory module free of asset-loading dependencies.
 */

import { EntityManager } from './ecs/entityManager.js'
import { InventoryComponent, StatsComponent, DamageStats, zeroDamageStats } from './ecs/components.js'
import { applyArmorStats } from './combat/damageFormula.js'
import { EventBus, EquipSlot } from './eventBus.js'

// ---------------------------------------------------------------------------
// Armor stats (sourced from PRO data, passed in by the caller)
// ---------------------------------------------------------------------------

export interface ArmorEquipStats {
    dt: DamageStats
    dr: DamageStats
    /** Armor Class bonus granted by this armor piece. */
    acBonus: number
}

// ---------------------------------------------------------------------------
// Weight helpers
// ---------------------------------------------------------------------------

/**
 * Returns the total carried weight stored on the inventory component.
 */
export function computeCarriedWeight(inv: InventoryComponent): number {
    return inv.currentWeight
}

/**
 * Returns true if the entity can carry `additionalLbs` more without
 * exceeding their carry weight limit.
 */
export function canCarryMore(entityId: number, additionalLbs: number): boolean {
    const stats = EntityManager.get<'stats'>(entityId, 'stats')
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    if (!stats || !inv) {return false}
    return inv.currentWeight + additionalLbs <= stats.carryWeight
}

// ---------------------------------------------------------------------------
// Item add / remove
// ---------------------------------------------------------------------------

/**
 * Add items to an entity's inventory.
 *
 * Stacks with an existing entry for the same PID when possible.
 *
 * @param entityId      - target entity
 * @param pid           - item Prototype ID
 * @param count         - number of items to add (default 1)
 * @param weightPerItem - weight in lbs for a single item (default 0)
 * @returns true if the items were added; false if carry weight would be exceeded
 */
export function addItem(
    entityId: number,
    pid: number,
    count = 1,
    weightPerItem = 0,
): boolean {
    const stats = EntityManager.get<'stats'>(entityId, 'stats')
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    if (!inv) {return false}

    const totalWeight = weightPerItem * count
    if (stats && inv.currentWeight + totalWeight > stats.carryWeight) {
        return false  // over-encumbered
    }

    const existing = inv.items.find((s) => s.pid === pid)
    if (existing) {
        existing.count += count
    } else {
        inv.items.push({ pid, count, condition: 100, ammoLoaded: 0, ammoType: -1 })
    }
    inv.currentWeight += totalWeight

    EventBus.emit('inventory:itemAdd', { entityId, itemPid: pid, count })
    return true
}

/**
 * Remove items from an entity's inventory.
 *
 * @param entityId      - owner entity
 * @param pid           - item Prototype ID
 * @param count         - number to remove (default 1)
 * @param weightPerItem - weight per item in lbs, used to update carried total (default 0)
 * @returns true if the items were present and removed; false otherwise
 */
export function removeItem(
    entityId: number,
    pid: number,
    count = 1,
    weightPerItem = 0,
): boolean {
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    if (!inv) {return false}

    const idx = inv.items.findIndex((s) => s.pid === pid)
    if (idx === -1) {return false}

    const stack = inv.items[idx]
    if (stack.count < count) {return false}

    stack.count -= count
    if (stack.count === 0) {inv.items.splice(idx, 1)}
    inv.currentWeight = Math.max(0, inv.currentWeight - weightPerItem * count)

    EventBus.emit('inventory:itemRemove', { entityId, itemPid: pid, count })
    return true
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/**
 * Equip a weapon into a hand slot.
 *
 * The item must already be in the entity's inventory.
 *
 * @param entityId - owner entity
 * @param pid      - weapon Prototype ID
 * @param slot     - 'hand_primary' | 'hand_secondary'
 * @returns true if equipped successfully
 */
export function equipWeapon(
    entityId: number,
    pid: number,
    slot: Extract<EquipSlot, 'hand_primary' | 'hand_secondary'>,
): boolean {
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    if (!inv) {return false}

    const has = inv.items.some((s) => s.pid === pid)
    if (!has) {return false}

    if (slot === 'hand_primary') {
        inv.equippedWeaponPrimary = pid
    } else {
        inv.equippedWeaponSecondary = pid
    }

    EventBus.emit('inventory:equip', { entityId, itemPid: pid, slot })
    return true
}

/**
 * Unequip the weapon in a hand slot.
 *
 * @returns true if a weapon was unequipped; false if the slot was already empty
 */
export function unequipWeapon(
    entityId: number,
    slot: Extract<EquipSlot, 'hand_primary' | 'hand_secondary'>,
): boolean {
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    if (!inv) {return false}

    if (slot === 'hand_primary') {
        if (inv.equippedWeaponPrimary === null) {return false}
        inv.equippedWeaponPrimary = null
    } else {
        if (inv.equippedWeaponSecondary === null) {return false}
        inv.equippedWeaponSecondary = null
    }

    EventBus.emit('inventory:unequip', { entityId, slot })
    return true
}

/**
 * Equip body armor, applying its DT/DR/AC bonuses to the entity's stats.
 *
 * The armor slot must be empty before calling this; call `unequipArmor` first
 * if the entity is already wearing armor.
 *
 * @param entityId   - owner entity
 * @param pid        - armor Prototype ID (must already be in inventory)
 * @param armorStats - DT/DR/AC values sourced from the PRO file
 * @returns true if equipped successfully
 */
export function equipArmor(
    entityId: number,
    pid: number,
    armorStats: ArmorEquipStats,
): boolean {
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    const stats = EntityManager.get<'stats'>(entityId, 'stats')
    if (!inv || !stats) {return false}

    const has = inv.items.some((s) => s.pid === pid)
    if (!has) {return false}

    // Slot must be free — caller must unequip existing armor first
    if (inv.equippedArmor !== null) {return false}

    applyArmorStats(stats.dt, stats.dr, armorStats.dt, armorStats.dr, 1)
    stats.armorClass += armorStats.acBonus

    inv.equippedArmor = pid
    EventBus.emit('inventory:equip', { entityId, itemPid: pid, slot: 'armor' })
    return true
}

/**
 * Unequip body armor, reverting the DT/DR/AC bonuses it provided.
 *
 * The caller must supply the same `armorStats` that were passed to `equipArmor`.
 *
 * @returns true if armor was unequipped; false if no armor was equipped
 */
export function unequipArmor(
    entityId: number,
    armorStats: ArmorEquipStats,
): boolean {
    const inv = EntityManager.get<'inventory'>(entityId, 'inventory')
    const stats = EntityManager.get<'stats'>(entityId, 'stats')
    if (!inv || !stats || inv.equippedArmor === null) {return false}

    applyArmorStats(stats.dt, stats.dr, armorStats.dt, armorStats.dr, -1)
    stats.armorClass = Math.max(0, stats.armorClass - armorStats.acBonus)

    inv.equippedArmor = null
    EventBus.emit('inventory:unequip', { entityId, slot: 'armor' })
    return true
}
