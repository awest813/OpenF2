/**
 * Regression tests for the inventory system.
 *
 * Uses the singleton EntityManager and creates/destroys a fresh player
 * entity for each test to avoid state leakage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EntityManager } from './ecs/entityManager.js'
import { createPlayerEntity } from './ecs/entityFactory.js'
import {
    addItem,
    removeItem,
    equipWeapon,
    unequipWeapon,
    equipArmor,
    unequipArmor,
    canCarryMore,
    computeCarriedWeight,
    ArmorEquipStats,
} from './inventory.js'
import { zeroDamageStats } from './ecs/components.js'
import { applyEncounterCritterLoadout, EncounterLoadoutCritter } from './encounterLoadout.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let playerId: number

function makeArmorStats(acBonus: number = 0): ArmorEquipStats {
    const dt = zeroDamageStats()
    const dr = zeroDamageStats()
    dt.normal = 5
    dr.normal = 20
    return { dt, dr, acBonus }
}

beforeEach(() => {
    playerId = createPlayerEntity({ name: 'TestPlayer', strength: 5 })
})

afterEach(() => {
    EntityManager.destroy(playerId)
})

// ---------------------------------------------------------------------------
// addItem
// ---------------------------------------------------------------------------

describe('addItem', () => {
    it('adds an item to the inventory', () => {
        addItem(playerId, 101, 1)
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.items.some((s) => s.pid === 101)).toBe(true)
    })

    it('stacks items with the same PID', () => {
        addItem(playerId, 101, 2)
        addItem(playerId, 101, 3)
        const inv = EntityManager.get(playerId, 'inventory')!
        const stack = inv.items.find((s) => s.pid === 101)!
        expect(stack.count).toBe(5)
    })

    it('returns true when item fits within carry weight', () => {
        expect(addItem(playerId, 101, 1, 1)).toBe(true)
    })

    it('returns false when adding item would exceed carry weight', () => {
        const stats = EntityManager.get(playerId, 'stats')!
        // Try to add more weight than the carry limit
        const overLimit = stats.carryWeight + 1
        expect(addItem(playerId, 101, 1, overLimit)).toBe(false)
    })

    it('does not add item when over carry weight', () => {
        const stats = EntityManager.get(playerId, 'stats')!
        addItem(playerId, 101, 1, stats.carryWeight + 1)
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.items.some((s) => s.pid === 101)).toBe(false)
    })

    it('updates currentWeight when item is added', () => {
        addItem(playerId, 101, 2, 3)  // 2 items × 3 lbs = 6 lbs
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.currentWeight).toBe(6)
    })

    it('allows weightless items always', () => {
        // Fill up the carry weight first
        const stats = EntityManager.get(playerId, 'stats')!
        addItem(playerId, 101, 1, stats.carryWeight)
        // Adding a weightless item should still succeed
        expect(addItem(playerId, 102, 1, 0)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe('removeItem', () => {
    beforeEach(() => {
        addItem(playerId, 101, 5, 2)  // 5 × 2 lbs = 10 lbs
    })

    it('removes the correct count from a stack', () => {
        removeItem(playerId, 101, 2, 2)
        const inv = EntityManager.get(playerId, 'inventory')!
        const stack = inv.items.find((s) => s.pid === 101)!
        expect(stack.count).toBe(3)
    })

    it('removes the stack entry when count reaches zero', () => {
        removeItem(playerId, 101, 5)
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.items.some((s) => s.pid === 101)).toBe(false)
    })

    it('updates currentWeight on removal', () => {
        removeItem(playerId, 101, 3, 2)  // remove 3 × 2 lbs
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.currentWeight).toBe(4)  // 10 - 6
    })

    it('returns false for a PID not in inventory', () => {
        expect(removeItem(playerId, 999)).toBe(false)
    })

    it('returns false when removing more than available', () => {
        expect(removeItem(playerId, 101, 10)).toBe(false)
    })

    it('returns true on success', () => {
        expect(removeItem(playerId, 101, 1)).toBe(true)
    })

    it('does not let currentWeight go below zero', () => {
        // Remove with an inflated weight-per-item
        addItem(playerId, 201, 1, 0)
        removeItem(playerId, 201, 1, 999)
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.currentWeight).toBeGreaterThanOrEqual(0)
    })
})

// ---------------------------------------------------------------------------
// equipWeapon / unequipWeapon
// ---------------------------------------------------------------------------

describe('equipWeapon', () => {
    beforeEach(() => {
        addItem(playerId, 42)  // weapon PID 42
    })

    it('sets equippedWeaponPrimary on primary slot', () => {
        equipWeapon(playerId, 42, 'hand_primary')
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.equippedWeaponPrimary).toBe(42)
    })

    it('sets equippedWeaponSecondary on secondary slot', () => {
        equipWeapon(playerId, 42, 'hand_secondary')
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.equippedWeaponSecondary).toBe(42)
    })

    it('returns false if item is not in inventory', () => {
        expect(equipWeapon(playerId, 999, 'hand_primary')).toBe(false)
    })

    it('returns true on success', () => {
        expect(equipWeapon(playerId, 42, 'hand_primary')).toBe(true)
    })
})

describe('unequipWeapon', () => {
    beforeEach(() => {
        addItem(playerId, 42)
        equipWeapon(playerId, 42, 'hand_primary')
    })

    it('clears equippedWeaponPrimary', () => {
        unequipWeapon(playerId, 'hand_primary')
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.equippedWeaponPrimary).toBeNull()
    })

    it('returns false when slot is already empty', () => {
        unequipWeapon(playerId, 'hand_primary')
        expect(unequipWeapon(playerId, 'hand_primary')).toBe(false)
    })

    it('returns true on success', () => {
        expect(unequipWeapon(playerId, 'hand_primary')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// equipArmor / unequipArmor
// ---------------------------------------------------------------------------

describe('equipArmor', () => {
    const ARMOR_PID = 200

    beforeEach(() => {
        addItem(playerId, ARMOR_PID)
    })

    it('sets equippedArmor to the armor PID', () => {
        equipArmor(playerId, ARMOR_PID, makeArmorStats(5))
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.equippedArmor).toBe(ARMOR_PID)
    })

    it('adds DT values to entity stats', () => {
        const before = EntityManager.get(playerId, 'stats')!.dt.normal
        equipArmor(playerId, ARMOR_PID, makeArmorStats())
        const after = EntityManager.get(playerId, 'stats')!.dt.normal
        expect(after).toBe(before + 5)
    })

    it('adds DR values to entity stats', () => {
        const before = EntityManager.get(playerId, 'stats')!.dr.normal
        equipArmor(playerId, ARMOR_PID, makeArmorStats())
        const after = EntityManager.get(playerId, 'stats')!.dr.normal
        expect(after).toBe(before + 20)
    })

    it('adds AC bonus to entity stats', () => {
        const acBefore = EntityManager.get(playerId, 'stats')!.armorClass
        equipArmor(playerId, ARMOR_PID, makeArmorStats(10))
        const acAfter = EntityManager.get(playerId, 'stats')!.armorClass
        expect(acAfter).toBe(acBefore + 10)
    })

    it('returns false if armor is not in inventory', () => {
        expect(equipArmor(playerId, 999, makeArmorStats())).toBe(false)
    })

    it('returns false if armor slot is already occupied', () => {
        equipArmor(playerId, ARMOR_PID, makeArmorStats())
        addItem(playerId, 201)
        expect(equipArmor(playerId, 201, makeArmorStats())).toBe(false)
    })
})

describe('unequipArmor', () => {
    const ARMOR_PID = 200
    const ARMOR = makeArmorStats(10)

    beforeEach(() => {
        addItem(playerId, ARMOR_PID)
        equipArmor(playerId, ARMOR_PID, ARMOR)
    })

    it('clears equippedArmor', () => {
        unequipArmor(playerId, ARMOR)
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(inv.equippedArmor).toBeNull()
    })

    it('removes DT values from entity stats', () => {
        const dtBefore = EntityManager.get(playerId, 'stats')!.dt.normal
        unequipArmor(playerId, ARMOR)
        const dtAfter = EntityManager.get(playerId, 'stats')!.dt.normal
        expect(dtAfter).toBe(dtBefore - 5)
    })

    it('removes DR values from entity stats', () => {
        const drBefore = EntityManager.get(playerId, 'stats')!.dr.normal
        unequipArmor(playerId, ARMOR)
        const drAfter = EntityManager.get(playerId, 'stats')!.dr.normal
        expect(drAfter).toBe(drBefore - 20)
    })

    it('removes AC bonus from entity stats', () => {
        const acBefore = EntityManager.get(playerId, 'stats')!.armorClass
        unequipArmor(playerId, ARMOR)
        const acAfter = EntityManager.get(playerId, 'stats')!.armorClass
        expect(acAfter).toBe(acBefore - 10)
    })

    it('does not let armorClass go below zero', () => {
        const bigArmor = makeArmorStats(9999)
        unequipArmor(playerId, ARMOR)  // first remove the existing armor
        addItem(playerId, 201)
        equipArmor(playerId, 201, bigArmor)
        unequipArmor(playerId, bigArmor)
        const stats = EntityManager.get(playerId, 'stats')!
        expect(stats.armorClass).toBeGreaterThanOrEqual(0)
    })

    it('returns false when no armor is equipped', () => {
        unequipArmor(playerId, ARMOR)  // first unequip
        expect(unequipArmor(playerId, ARMOR)).toBe(false)
    })

    it('equip/unequip cycle leaves stats unchanged', () => {
        // Capture scalar values before unequipping (armor was equipped in beforeEach)
        const stats = EntityManager.get(playerId, 'stats')!
        const dtBefore = stats.dt.normal        // 5 after equip
        const drBefore = stats.dr.normal        // 20 after equip
        const acBefore = stats.armorClass       // base + 10 after equip

        unequipArmor(playerId, ARMOR)

        expect(stats.dt.normal).toBe(dtBefore - 5)
        expect(stats.dr.normal).toBe(drBefore - 20)
        expect(stats.armorClass).toBe(acBefore - 10)
    })
})

// ---------------------------------------------------------------------------
// canCarryMore / computeCarriedWeight
// ---------------------------------------------------------------------------

describe('canCarryMore', () => {
    it('returns true when entity has capacity', () => {
        expect(canCarryMore(playerId, 1)).toBe(true)
    })

    it('returns false when item would exceed carry weight', () => {
        const stats = EntityManager.get(playerId, 'stats')!
        expect(canCarryMore(playerId, stats.carryWeight + 1)).toBe(false)
    })

    it('returns true when additional weight is exactly at limit', () => {
        const stats = EntityManager.get(playerId, 'stats')!
        expect(canCarryMore(playerId, stats.carryWeight)).toBe(true)
    })
})

describe('computeCarriedWeight', () => {
    it('returns 0 for an empty inventory', () => {
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(computeCarriedWeight(inv)).toBe(0)
    })

    it('reflects weight after addItem calls', () => {
        addItem(playerId, 101, 3, 4)  // 3 × 4 lbs = 12
        const inv = EntityManager.get(playerId, 'inventory')!
        expect(computeCarriedWeight(inv)).toBe(12)
    })
})


// ---------------------------------------------------------------------------
// Worldmap encounter loadout regression
// ---------------------------------------------------------------------------

describe('Worldmap.applyEncounterCritterLoadout', () => {
    function makeSpawnedCritter() {
        return {
            inventory: [] as any[],
            leftHand: null as any,
            rightHand: null as any,
            equippedArmor: null as any,
            dead: false,
            anim: 'idle',
            art: 'idle',
            addInventoryItem(item: any, count = 1) {
                const existing = this.inventory.find((inv: any) => inv.pid === item.pid)
                if (existing) {
                    existing.amount += count
                    return
                }
                this.inventory.push({ ...item, amount: count })
            },
            getAnimation(name: string) {
                return `anim-${name}`
            },
        }
    }

    it('applies ambush critter inventory and wielded weapon state from encounter data', () => {
        const spawned = makeSpawnedCritter()
        const ambushCritter: EncounterLoadoutCritter = {
            dead: false,
            items: [
                { pid: 0x00000011, amount: 2, wielded: false },
                { pid: 0x00000007, amount: 1, wielded: true },
            ],
        }

        applyEncounterCritterLoadout(spawned, ambushCritter, {
            createItem: (pid) => ({
                pid,
                pro: { extra: {} },
                weapon: pid === 0x00000007 ? {} : undefined,
            }),
            isWeapon: (item) => item?.weapon !== undefined,
        })

        expect(spawned.inventory.find((x: any) => x.pid === 0x00000011)?.amount).toBe(2)
        expect(spawned.leftHand?.pid).toBe(0x00000007)
        expect(spawned.art).toBe('anim-idle')
    })

    it('applies fighting encounter loadout including armor equip and dead flag', () => {
        const spawned = makeSpawnedCritter()
        const fightingCritter: EncounterLoadoutCritter = {
            dead: true,
            items: [
                { pid: 0x000000e1, amount: 1, wielded: true },
                { pid: 0x00000020, amount: 3, wielded: false },
            ],
        }

        applyEncounterCritterLoadout(spawned, fightingCritter, {
            createItem: (pid) => ({
                pid,
                pro: pid === 0x000000e1 ? { extra: { stats: { 'DT Normal': 2 } } } : { extra: {} },
            }),
            isWeapon: () => false,
        })

        expect(spawned.dead).toBe(true)
        expect(spawned.equippedArmor?.pid).toBe(0x000000e1)
        expect(spawned.inventory.find((x: any) => x.pid === 0x00000020)?.amount).toBe(3)
    })
})
