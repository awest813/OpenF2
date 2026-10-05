import { describe, it, expect } from 'vitest'
import { equipItem, listedItems, reconcileSlots, removeItem, setAsideEquipped, setAsideForBarter, unequipSlot } from './equipment.js'

const item = (pid: number, extra: Record<string, unknown> = {}): any => ({ pid, amount: 1, subtype: 'weapon', ...extra })

/** Equipped items stay in the inventory, as the engine keeps them. */
describe('equipment (engine model)', () => {
    it('equipping keeps the item carried and out of the listed items', () => {
        const gun = item(8)
        const vest = item(3, { subtype: 'armor' })
        const c: any = { inventory: [gun, vest, item(41, { subtype: 'misc', amount: 20 })] }
        expect(equipItem(c, gun, 'rightHand')).toBe(gun)
        expect(equipItem(c, vest, 'leftHand')).toBeNull() // armor is worn, not held
        expect(equipItem(c, vest, 'equippedArmor')).toBe(vest)
        expect(c.inventory).toContain(gun)
        expect(listedItems(c).map((o: any) => o.pid)).toEqual([41])
        unequipSlot(c, 'rightHand')
        expect(c.rightHand).toBeUndefined()
        expect(listedItems(c).map((o: any) => o.pid)).toEqual([8, 41])
    })

    it('equipping from a stack takes one item off it', () => {
        const knives = item(4, { amount: 3, clone() { return { ...this } } })
        const c: any = { inventory: [knives] }
        const one = equipItem(c, knives, 'leftHand')
        expect(one).not.toBe(knives)
        expect(one.amount).toBe(1)
        expect(knives.amount).toBe(2)
        expect(c.inventory).toHaveLength(2)
    })

    it('removing an equipped item empties its slot', () => {
        const gun = item(8)
        const c: any = { inventory: [gun], rightHand: gun }
        expect(removeItem(c, gun, 1)).toBe(1)
        expect(c.rightHand).toBeUndefined()
        expect(c.inventory).toEqual([])
    })

    it('trade and loot screens set the player\'s equipped items aside and put them back', () => {
        const gun = item(8)
        const c: any = { inventory: [item(41), gun], rightHand: gun }
        const restore = setAsideEquipped(c)
        expect(c.inventory).not.toContain(gun)
        restore()
        expect(c.inventory).toContain(gun)
    })

    it('barter hides the merchant\'s armor and right-hand item, or its first weapon', () => {
        const player: any = { inventory: [] }
        const vest = item(3, { subtype: 'armor' })
        const rifle = item(9)
        const pistol = item(8)
        const merchant: any = { inventory: [pistol, rifle, vest], equippedArmor: vest }
        const restore = setAsideForBarter(player, merchant, false)
        expect(merchant.inventory).toEqual([rifle])
        restore()
        expect(merchant.inventory).toHaveLength(3)
    })

    it('a slot whose item was looted away is emptied', () => {
        const gun = item(8)
        const corpse: any = { inventory: [], rightHand: gun }
        reconcileSlots(corpse)
        expect(corpse.rightHand).toBeUndefined()
    })
})
