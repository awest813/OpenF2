/**
 * Barter prices (inventory.cc _barter_compute_value /
 * _barter_attempt_transaction, item.cc itemGetCost / objectGetCost).
 *
 * The player's side is worth what its items cost. The merchant's side
 * costs twice its items' worth, scaled by (160 + the merchant's Barter) /
 * (160 + the party's best Barter) and by (100 + modifier) %, where the
 * modifier is the dialogue's barter mod plus the merchant's mood (+25 when
 * it dislikes the player, −15 when it likes them) and Master Trader takes
 * 25 off. Money counts at face value on both sides.
 */

import { HOOK, hookReturn, runHook } from './hookScripts.js'
import globalState from './globalState.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { partyBestInSkill, skillValue } from './skillUse.js'
import { getMessage } from './util.js'

export const PID_MONEY = 41
const SKILL_BARTER = 15

function extraOf(obj: any): any {
    return obj?.pro?.extra ?? {}
}

function amountOf(obj: any): number {
    return typeof obj?.amount === 'number' && obj.amount > 0 ? obj.amount : 1
}

/** itemGetCost for one object (a weapon includes its loaded rounds). */
export function itemCost(obj: any): number {
    const extra = extraOf(obj)
    let cost = typeof extra.cost === 'number' ? extra.cost : 0
    if (obj?.subtype === 'container' && Array.isArray(obj.inventory)) {
        cost += inventoryCost(obj.inventory)
    } else if (obj?.subtype === 'weapon') {
        const loaded = obj?.extra?.ammoLoaded ?? 0
        const ammoPid = obj?.extra?.ammoType ?? extra.ammoPID
        if (loaded > 0 && typeof ammoPid === 'number') {
            const ammo = globalState.proMap?.items?.[ammoPid & 0xffffff]?.extra
            const perBox = ammo?.quantity || 1
            cost += Math.trunc((loaded * (ammo?.cost ?? 0)) / perBox)
        }
    }
    return cost
}

/**
 * objectGetCost for a list of items. OpenF2 counts an ammo stack in
 * rounds, so it is worth its box price per box's worth of rounds.
 */
export function inventoryCost(items: readonly any[]): number {
    let cost = 0
    for (const obj of items) {
        if (obj?.subtype === 'ammo') {
            const perBox = extraOf(obj).quantity || 1
            cost += Math.trunc((amountOf(obj) * (extraOf(obj).cost ?? 0)) / perBox)
        } else {
            cost += itemCost(obj) * amountOf(obj)
        }
    }
    return cost
}

/** itemGetTotalCaps. */
export function capsTotal(items: readonly any[]): number {
    return items.filter((o) => o?.pid === PID_MONEY).reduce((sum, o) => sum + amountOf(o), 0)
}

/** The merchant's mood (LVAR 0 of its script, reactionTranslateValue): +25 bad, 0 neutral, −15 good. */
export function reactionModifier(merchant: any): number {
    const value = merchant?._script?.lvars?.[0] ?? merchant?._script?.localVars?.[0]
    if (typeof value !== 'number') {return 0}
    if (value > 10) {return -15}
    if (value > -10) {return 0}
    return 25
}

/** _barter_compute_value: what the merchant wants for `items`. */
export function barterAskValue(items: readonly any[], merchant: any, barterMod: number, buyer: any = globalState.player): number {
    const cost = inventoryCost(items)
    const caps = capsTotal(items)
    const withoutCaps = cost - caps
    const perkBonus = perkRank(buyer, PerkId.MASTER_TRADER) > 0 ? 25 : 0
    const partyBarter = skillValue(partyBestInSkill(SKILL_BARTER), SKILL_BARTER)
    const npcBarter = skillValue(merchant, SKILL_BARTER)
    let mult = (barterMod + 100 - perkBonus) * 0.01
    if (mult < 0) {mult = 0.0099999998}
    const balanced = ((160 + npcBarter) / (160 + partyBarter)) * (withoutCaps * 2)
    return Math.trunc(mult * balanced + caps)
}

function inventoryWeight(items: readonly any[]): number {
    return items.reduce((sum, o) => sum + (extraOf(o).weight ?? 0) * amountOf(o), 0)
}

export type BarterRefusal = 'weight' | 'offer'

/**
 * _barter_attempt_transaction's checks. Returns null when the trade goes
 * through, or why not.
 */
export function checkTrade(offer: readonly any[], wanted: readonly any[], merchant: any, barterMod: number, buyer: any = globalState.player): BarterRefusal | null {
    const carry = buyer?.getStat?.('Carry') ?? Infinity
    const carried = inventoryWeight(buyer?.inventory ?? [])
    if (inventoryWeight(wanted) > carry - carried) {return 'weight'}
    if (offer.length === 0) {return 'offer'}
    let ask = barterAskValue(wanted, merchant, barterMod, buyer)
    let offered = inventoryCost(offer)
    // sfall HOOK_BARTERPRICE: scripts may change what the goods are worth (-1 leaves it).
    const hook = runHook(HOOK.BARTERPRICE, [
        buyer, merchant, ask, 0, capsTotal(wanted), inventoryCost(wanted), 0, offered, 1,
        globalState.gParty?.isPartyMember?.(merchant) ? 1 : 0,
    ])
    if (hook) {
        const newAsk = hookReturn(hook, 0, -1)
        if (newAsk !== -1) {ask = newAsk}
        offered = hookReturn(hook, 1, offered)
    }
    if (ask > offered) {return 'offer'}
    return null
}

/** inventory.msg 28 / 31. */
export function refusalText(reason: BarterRefusal): string {
    const id = reason === 'weight' ? 31 : 28
    const fallback = reason === 'weight' ? 'Sorry, you cannot carry that much.' : 'No, your offer is not good enough.'
    try {
        return getMessage('inventory', id) ?? fallback
    } catch {
        return fallback
    }
}
