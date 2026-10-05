import { describe, it, expect, afterEach } from 'vitest'
import './scripting.js'
import { apToAcBonus, capHitChance, capPickpocket, capSkill, clampStatValue, inventoryApCost, sfallSettings, statMax, statMin } from './sfallSettings.js'
import { sfallMethods } from './sfallFunctions.js'
import { itemWeight, inventorySize } from './critterInventory.js'

const fresh = JSON.parse(JSON.stringify({
    xpMod: sfallSettings.xpMod, inventoryApCost: sfallSettings.inventoryApCost,
    unspentApBonus: sfallSettings.unspentApBonus, unspentApPerkBonus: sfallSettings.unspentApPerkBonus,
}))

afterEach(() => {
    Object.assign(sfallSettings, fresh)
    sfallSettings.pcStatMax = {}
    sfallSettings.npcStatMax = {}
    sfallSettings.pcStatMin = {}
    sfallSettings.npcStatMin = {}
    sfallSettings.hitChance.base = { max: 95, mod: 0 }
    sfallSettings.skillMax.base = 300
    sfallSettings.pickpocket.base = { max: 95, mod: 0 }
})

describe('sfall stat limits (Stats.cpp)', () => {
    it('defaults are stat.cc\'s; set_stat_max changes both tables, set_pc_stat_max only the player\'s', () => {
        expect(statMax(0, false)).toBe(10)
        expect(statMin(0, true)).toBe(1)
        expect(statMax(8, true)).toBe(99) // AP
        expect(statMin(11, false)).toBe(0) // melee damage
        sfallMethods.set_stat_max(0, 12)
        expect(statMax(0, false)).toBe(12)
        expect(statMax(0, true)).toBe(12)
        sfallMethods.set_pc_stat_max(0, 15)
        expect(clampStatValue('STR', 14, true)).toBe(14)
        expect(clampStatValue('STR', 14, false)).toBe(12)
        expect(statMax(40, false)).toBe(0)
    })
})

describe('sfall caps and bonuses', () => {
    it('hit chance: the base cap and bonus, or a critter\'s own', () => {
        const a = {}
        expect(capHitChance(120, a)).toBe(95)
        sfallMethods.set_hit_chance_max(150)
        expect(capHitChance(120, a)).toBe(120)
        sfallMethods.set_critter_hit_chance_mod({ type: 'critter' } as any, 50, 0)
        const b: any = { type: 'critter' }
        sfallMethods.set_critter_hit_chance_mod(b, 80, 10)
        expect(capHitChance(60, b)).toBe(70)
        expect(capHitChance(75, b)).toBe(80)
    })

    it('skills and steal chance', () => {
        sfallMethods.set_skill_max(200)
        expect(capSkill(250, {})).toBe(200)
        sfallMethods.set_skill_max(500)
        expect(capSkill(299, {})).toBe(299) // clamped to 300
        sfallMethods.set_base_pickpocket_mod(80, 5)
        expect(capPickpocket(50, {})).toBe(55)
        expect(capPickpocket(90, {})).toBe(80)
    })

    it('inventory AP cost less Quick Pockets; unspent AP as AC', () => {
        expect(inventoryApCost(0)).toBe(4)
        expect(inventoryApCost(1)).toBe(2)
        sfallMethods.set_inven_ap_cost(1)
        expect(inventoryApCost(1)).toBe(0)
        expect(apToAcBonus(5, 0)).toBe(5)
        expect(apToAcBonus(5, 1)).toBe(10) // HtH Evade doubles it
        sfallMethods.set_unspent_ap_bonus(8)
        expect(apToAcBonus(5, 0)).toBe(10)
    })
})

describe('item weight and size (item.cc)', () => {
    it('power armor weighs half; containers add their contents', () => {
        const pa: any = { pid: 3, pro: { extra: { subType: 0, weight: 42 } } }
        expect(itemWeight(pa)).toBe(21)
        const bag: any = { pid: 90, pro: { extra: { subType: 1, weight: 2, size: 0 } }, inventory: [{ pro: { extra: { weight: 3, size: 2 } }, amount: 4 }] }
        expect(itemWeight(bag)).toBe(14)
        expect(inventorySize(bag)).toBe(8)
        const hidden: any = { pid: 91, pro: { extra: { itemFlags: 0x08, subType: 5, weight: 9 } } }
        expect(itemWeight(hidden)).toBe(0)
    })
})
