/**
 * Charged misc items (item.cc _item_m_use_charged_item / miscItemTurnOn /
 * miscItemTurnOff / miscItemTrickleEventProcess): the Stealth Boy and the
 * Geiger counter switch on and off, spending a charge every minute (the
 * Stealth Boy) or every five minutes (the Geiger counter) while on; the
 * motion sensor spends a charge each use to show the map. A Stealth Boy
 * that is on makes its carrier hard to see (OBJECT_TRANS_GLASS).
 */

import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getMessage } from './util.js'

export const PID_GEIGER_COUNTER = 52
export const PID_STEALTH_BOY = 54
export const PID_MOTION_SENSOR = 59
export const PID_GEIGER_COUNTER_ON = 207
export const PID_STEALTH_BOY_ON = 210

const OBJECT_TRANS_GLASS = 0x20000

const FALLBACK: Record<number, string> = {
    5: '%s has no charges left.',
    6: '%s is on.',
    7: '%s is off.',
    8: 'You pass the Geiger counter over your body. The rem counter reads: %d',
    9: 'This item can only be used from the interface bar.',
}

function show(id: number, arg?: string | number): void {
    let text: string | null = null
    try {
        text = getMessage('item', id)
    } catch {
        text = null
    }
    text = (text ?? FALLBACK[id] ?? '').replace(/%[sd]/, String(arg ?? ''))
    if (text) {EventBus.emit('ui:message', { text })}
}

function isStealthBoy(item: any): boolean {
    return item?.pid === PID_STEALTH_BOY || item?.pid === PID_STEALTH_BOY_ON
}

export function isChargedItem(item: any): boolean {
    return [PID_GEIGER_COUNTER, PID_GEIGER_COUNTER_ON, PID_STEALTH_BOY, PID_STEALTH_BOY_ON, PID_MOTION_SENSOR].includes(item?.pid)
}

/** miscItemGetCharges: the item's own count, else its proto's. */
export function chargesOf(item: any): number {
    if (typeof item?.charges === 'number') {return item.charges}
    const proto = item?.pro?.extra?.charges
    return typeof proto === 'number' ? proto : 0
}

/** miscItemConsumeCharge. */
function consumeCharge(item: any): boolean {
    const charges = chargesOf(item)
    if (charges <= 0) {return false}
    item.charges = charges - 1
    return true
}

export function isOn(item: any): boolean {
    return typeof item?.trickleTick === 'number'
}

function ownerOf(item: any): any {
    const candidates: any[] = [globalState.player, ...((globalState.gMap?.getObjects?.() ?? []) as any[])]
    for (const c of candidates) {
        if (c?.type !== 'critter') {continue}
        if (c.inventory?.includes(item) || c.leftHand === item || c.rightHand === item) {return c}
    }
    return null
}

function isPlayer(c: any): boolean {
    return !!c && (c === globalState.player || c.isPlayer === true)
}

/** stealthBoyTurnOff: unless another lit Stealth Boy is in a hand. */
function stealthOff(critter: any, item: any): void {
    for (const hand of [critter.leftHand, critter.rightHand]) {
        if (hand && hand !== item && hand.pid === PID_STEALTH_BOY_ON) {return}
    }
    critter.flags = (critter.flags ?? 0) & ~OBJECT_TRANS_GLASS
}

/** miscItemTurnOn. */
export function turnOn(item: any, now = globalState.gameTickTime ?? 0): number {
    const owner = ownerOf(item)
    if (!owner) {
        show(9)
        return -1
    }
    if (!consumeCharge(item)) {
        if (isPlayer(owner)) {show(5, item.name ?? '')}
        return -1
    }
    if (isStealthBoy(item)) {
        item.trickleTick = now + 600
        item.pid = PID_STEALTH_BOY_ON
        owner.flags = (owner.flags ?? 0) | OBJECT_TRANS_GLASS
    } else {
        item.trickleTick = now + 3000
        item.pid = PID_GEIGER_COUNTER_ON
    }
    if (isPlayer(owner)) {
        show(6, item.name ?? '')
        if (item.pid === PID_GEIGER_COUNTER_ON) {
            show(8, owner.stats?.getBase?.('Radiation Level') ?? 0)
        }
    }
    return 0
}

/** miscItemTurnOff. */
export function turnOff(item: any): number {
    const owner = ownerOf(item)
    delete item.trickleTick
    if (owner && item.pid === PID_STEALTH_BOY_ON) {stealthOff(owner, item)}
    item.pid = isStealthBoy(item) ? PID_STEALTH_BOY : PID_GEIGER_COUNTER
    if (isPlayer(owner)) {show(7, item.name ?? '')}
    return 0
}

/** _item_m_use_charged_item. */
export function useChargedItem(item: any): number {
    if (item?.pid === PID_MOTION_SENSOR) {
        if (consumeCharge(item)) {EventBus.emit('ui:openPanel', { panelName: 'pipboy' })}
        else {show(5, item.name ?? '')}
        return 0
    }
    if (!isChargedItem(item)) {return -1}
    return isOn(item) ? turnOff(item) : turnOn(item)
}

/** miscItemTrickleEventProcess for the player's lit items. */
export function processChargedItemsUpTo(now = globalState.gameTickTime ?? 0): void {
    const player = globalState.player as any
    if (!player) {return}
    const items = [...(player.inventory ?? []), player.leftHand, player.rightHand].filter((o, i, a) => o && a.indexOf(o) === i)
    for (const item of items) {
        let guard = 1000
        while (isOn(item) && item.trickleTick <= now && --guard > 0) {
            if (consumeCharge(item)) {
                item.trickleTick += isStealthBoy(item) ? 600 : 3000
            } else {
                show(5, item.name ?? '')
                turnOff(item)
            }
        }
    }
}
