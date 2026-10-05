import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import globalState from './globalState.js'
import { barterAskValue, checkTrade, inventoryCost, reactionModifier } from './barter.js'
import { PerkId } from './character/perkIds.js'

const item = (cost: number, amount = 1, extra: Record<string, unknown> = {}) => ({ type: 'item', subtype: 'misc', amount, pro: { extra: { cost, weight: 1, ...extra } } })
const caps = (n: number) => ({ type: 'item', subtype: 'misc', pid: 41, amount: n, pro: { extra: { cost: 1, weight: 0 } } })
const critter = (barter: number, extra: Record<string, unknown> = {}) => ({ type: 'critter', getSkill: (s: string) => (s === 'Barter' ? barter : 0), getStat: () => 200, inventory: [], ...extra })

describe('barter prices (_barter_compute_value)', () => {
    let saved: any
    beforeEach(() => {
        saved = { player: globalState.player, party: globalState.gParty }
        globalState.gParty = null as any
    })
    afterEach(() => {
        globalState.player = saved.player
        globalState.gParty = saved.party
    })

    it('the merchant asks twice the price at equal Barter', () => {
        globalState.player = critter(40) as any
        expect(barterAskValue([item(100)], critter(40), 0)).toBe(200)
    })

    it('Barter skill on each side moves the price', () => {
        globalState.player = critter(140) as any
        // (160 + 40) / (160 + 140) × 200 = 133
        expect(barterAskValue([item(100)], critter(40), 0)).toBe(133)
    })

    it('money is at face value; the modifier and Master Trader scale the rest', () => {
        globalState.player = critter(40, { perkRanks: { [PerkId.MASTER_TRADER]: 1 } }) as any
        expect(barterAskValue([item(100), caps(50)], critter(40), 0)).toBe(150 + 50)
        expect(barterAskValue([item(100)], critter(40), 25)).toBe(200)
    })

    it('a merchant mood: +25 when it dislikes the player, −15 when it likes them', () => {
        expect(reactionModifier({ _script: { lvars: { 0: -30 } } })).toBe(25)
        expect(reactionModifier({ _script: { lvars: { 0: 0 } } })).toBe(0)
        expect(reactionModifier({ _script: { lvars: { 0: 20 } } })).toBe(-15)
    })

    it('ammo stacks are worth their box price per box of rounds', () => {
        expect(inventoryCost([{ subtype: 'ammo', amount: 30, pro: { extra: { cost: 100, quantity: 20 } } }])).toBe(150)
    })

    it('refuses empty and short offers, and loads the player cannot carry', () => {
        const player = critter(40, { inventory: [], getStat: () => 10 })
        globalState.player = player as any
        expect(checkTrade([], [item(1)], critter(40), 0)).toBe('offer')
        expect(checkTrade([item(100)], [item(100)], critter(40), 0)).toBe('offer')
        expect(checkTrade([item(200)], [item(100)], critter(40), 0)).toBeNull()
        expect(checkTrade([item(200)], [item(1, 20)], critter(40), 0)).toBe('weight')
    })
})
