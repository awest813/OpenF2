/**
 * Companion inventory trade (parity Slice G / P1-3).
 *
 * Opens a free two-way inventory share with a living party member via the
 * ui2 LootPanel (live Critter inventories) when available.
 */

import globalState from './globalState.js'
import { Critter, Obj } from './object.js'
import { LootPanel } from './ui2/lootPanel.js'
import { UIMode } from './uiMode.js'
import { uiLog } from './ui.js'

export function canTradeWithPartyMember(obj: Critter | null | undefined): boolean {
    if (!obj || (obj as any).type !== 'critter') return false
    if ((obj as Critter).dead) return false
    if (globalState.inCombat) return false
    if (!globalState.gParty || typeof globalState.gParty.isPartyMember !== 'function') return false
    return globalState.gParty.isPartyMember(obj)
}

/**
 * Open inventory share with a companion. Returns true if a trade UI was opened.
 */
export function openCompanionTrade(companion: Critter): boolean {
    if (!canTradeWithPartyMember(companion)) return false
    const player = globalState.player as Critter | null
    if (!player || !Array.isArray(player.inventory) || !Array.isArray(companion.inventory)) {
        return false
    }

    const mgr = globalState.uiManager
    const panel = mgr?.get?.('loot') as LootPanel | undefined
    if (panel && typeof panel.openWithLive === 'function') {
        panel.openWithLive(player.inventory as Obj[], companion.inventory as Obj[])
        globalState.uiMode = UIMode.loot
        uiLog('Trading with ' + (companion.name || 'companion') + '.')
        return true
    }

    // No ui2 manager (tests / early boot) — still report success if inventories are live
    // so callers can transfer via tests without a panel.
    console.warn('openCompanionTrade: LootPanel unavailable — inventories ready for direct transfer')
    return false
}

/** Move one stack from `from` inventory into `to` by index (test / script helper). */
export function transferInventoryItem(
    from: Obj[],
    to: Obj[],
    fromIndex: number,
    amount?: number,
): boolean {
    if (!Array.isArray(from) || !Array.isArray(to)) return false
    const item = from[fromIndex]
    if (!item) return false
    const qty = amount ?? item.amount ?? 1
    if (qty <= 0) return false

    const moveAmount = Math.min(qty, item.amount ?? 1)
    if ((item.amount ?? 1) > moveAmount) {
        item.amount = (item.amount ?? 1) - moveAmount
        const clone = Object.assign({}, item, { amount: moveAmount })
        const existing = to.find((o) => o.pid === item.pid && o.name === item.name)
        if (existing) {
            existing.amount = (existing.amount ?? 1) + moveAmount
        } else {
            to.push(clone as Obj)
        }
    } else {
        from.splice(fromIndex, 1)
        const existing = to.find((o) => o.pid === item.pid && (o.name === item.name || !item.name))
        if (existing) {
            existing.amount = (existing.amount ?? 1) + (item.amount ?? 1)
        } else {
            to.push(item)
        }
    }
    return true
}
