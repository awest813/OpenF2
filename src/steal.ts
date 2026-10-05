/**
 * Stealing (inventory.cc inventoryOpenStealing / inventoryOpenLooting and
 * skill.cc skillsPerformStealing). Using Steal on a conscious critter opens
 * the loot screen without TAKE ALL and without the target's wielded and
 * worn items; every item taken or planted is a Steal roll, and getting
 * caught ends it. Using it on anyone else is plain looting.
 */

import { HOOK, hookReturn, runHook } from './hookScripts.js'
import { capPickpocket } from './sfallSettings.js'
import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getMessage, getRandomInt } from './util.js'
import { randomRoll, Roll, type Rng } from './combat/fo2Formulas.js'
import { isPartyMember } from './combat/aiPacket.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { awardCritterXp } from './character/xp.js'
import { criticalsAllowed, skillValue, SKILL_STEAL } from './skillUse.js'

const CRITTER_NO_STEAL = 0x20

const FALLBACK: Record<string, Record<number, string>> = {
    skill: {
        570: "You're caught stealing the %s.",
        571: 'You steal the %s.',
        572: "You're caught planting the %s.",
        573: 'You plant the %s.',
    },
    inventory: {
        29: 'You gain %d experience points for successfully using your Steal skill.',
        50: "You can't find anything to take from that.",
    },
}

function msg(file: string, id: number): string {
    let text: string | null = null
    try {
        text = getMessage(file, id)
    } catch {
        text = null
    }
    return text ?? FALLBACK[file]?.[id] ?? ''
}

function show(text: string): void {
    if (text) {EventBus.emit('ui:message', { text })}
}

const defaultRng: Rng = (min, max) => getRandomInt(min, max)

function isPlayer(obj: any): boolean {
    return obj === globalState.player || obj?.isPlayer === true
}

/** critterIsActive: a critter that is not dead, unconscious or losing its turn. */
export function critterIsActive(critter: any): boolean {
    return critter?.type === 'critter' && !critter.dead && !critter.knockedOut && !critter.loseTurn
}

/** _is_hit_from_front: anything but standing behind the target (same facing or one off). */
function isFacing(a: any, b: any): boolean {
    const diff = Math.abs((a?.orientation ?? 0) - (b?.orientation ?? 0))
    return diff !== 0 && diff !== 1 && diff !== 5
}

function itemSize(item: any): number {
    const size = item?.pro?.extra?.size
    return typeof size === 'number' ? size : 0
}

/**
 * skillsPerformStealing: 1 when the theft (or plant) goes unnoticed, 0 when
 * the thief is caught. `stealCount` is the number of moves so far this
 * session, this one included.
 */
export function performStealing(thief: any, target: any, item: any, planting: boolean, stealCount: number, rng: Rng = defaultRng): number {
    // sfall HOOK_STEAL: 1 succeeds, 0 is caught, 2 fails but stays on the screen, -1 rolls as usual.
    const quantity = typeof item?.amount === 'number' ? item.amount : 1
    const hook = runHook(HOOK.STEAL, [thief, target, item, planting ? 1 : 0, quantity])
    const forced = hook && hook.rets.length > 0 ? hookReturn(hook, 0, -1) : -1
    if (forced === 0 || forced === 1 || forced === 2) {return forced}
    let stealModifier = -stealCount + 1
    if (!isPlayer(thief) || perkRank(thief, PerkId.PICKPOCKET) === 0) {
        stealModifier -= 4 * itemSize(item)
        if (target?.type === 'critter' && isFacing(thief, target)) {stealModifier -= 25}
    }
    if (target?.knockedOut || target?.knockedDown) {stealModifier += 20}

    const stealChance = capPickpocket(stealModifier + skillValue(thief, SKILL_STEAL), thief)

    let stealRoll: Roll
    if (isPlayer(thief) && isPartyMember(target)) {
        stealRoll = Roll.CriticalSuccess
    } else {
        let critChance = 0
        try {
            critChance = thief?.getStat?.('Critical Chance') ?? 0
        } catch {
            critChance = 0
        }
        stealRoll = randomRoll(stealChance, critChance, rng, criticalsAllowed()).roll
    }

    let catchRoll: Roll
    if (stealRoll === Roll.CriticalSuccess) {
        catchRoll = Roll.CriticalFailure
    } else if (stealRoll === Roll.CriticalFailure) {
        catchRoll = Roll.Success
    } else {
        const catchChance = target?.type === 'critter'
            ? skillValue(target, SKILL_STEAL) - stealModifier
            : 30 - stealModifier
        catchRoll = randomRoll(catchChance, 0, rng, criticalsAllowed()).roll
    }

    const name = item?.name ?? ''
    if (catchRoll !== Roll.Success && catchRoll !== Roll.CriticalSuccess) {
        show(msg('skill', planting ? 573 : 571).replace('%s', name))
        return 1
    }
    show(msg('skill', planting ? 572 : 570).replace('%s', name))
    return 0
}

/** One trip through the steal screen. */
export class StealSession {
    stealCount = 0
    stealingXp = 0
    private stealingXpBonus = 10
    caught = false
    private held: Array<{ item: any; slot: 'leftHand' | 'rightHand' | 'equippedArmor' }> = []

    constructor(readonly thief: any, readonly target: any, private readonly rng: Rng = defaultRng) {}

    /** The target's wielded and worn items are set aside while the screen is open. */
    open(): void {
        const inv: any[] = this.target.inventory ?? []
        for (const slot of ['leftHand', 'rightHand', 'equippedArmor'] as const) {
            const item = this.target[slot]
            const index = item ? inv.indexOf(item) : -1
            if (index >= 0) {
                inv.splice(index, 1)
                this.held.push({ item, slot })
            }
        }
    }

    /** Before a move: the Steal roll. False means caught (the move is refused). */
    beforeMove(item: any, planting: boolean): boolean {
        this.stealCount++
        const result = performStealing(this.thief, this.target, item, planting, this.stealCount, this.rng)
        if (result === 0) {
            this.caught = true
            return false
        }
        // 2 (a hook script's choice): this move fails, but the screen stays open.
        return result !== 2
    }

    /** After a move went through: each successful one is worth 10 XP more than the last. */
    afterMove(): void {
        this.stealingXp += this.stealingXpBonus
        this.stealingXpBonus += 10
    }

    /** Leaving the screen: the held items go back, then the XP or the consequences. */
    close(): void {
        const inv: any[] = this.target.inventory ?? (this.target.inventory = [])
        for (const { item } of this.held) {inv.push(item)}
        this.held = []

        if (!this.caught && this.stealingXp > 0 && !isPartyMember(this.target)) {
            const xp = Math.min(300 - skillValue(this.thief, SKILL_STEAL), this.stealingXp)
            const before = this.thief.xp ?? 0
            if (xp > 0) {awardCritterXp(this.thief, xp)}
            show(msg('inventory', 29).replace('%d', String((this.thief.xp ?? 0) - before)))
        }
    }
}

export interface StealScreen {
    /** Open the loot screen in steal mode; `session` guards each move and is closed when the screen closes. */
    openSteal(thief: any, target: any, session: StealSession): void
    /** Open ordinary looting. */
    openLoot(target: any): void
    /** pickup_p_proc on the target; true when the script overrides. */
    runPickup(target: any, thief: any): boolean
}

/** inventoryOpenStealing. */
export function openStealing(thief: any, target: any, screen: StealScreen, rng: Rng = defaultRng): void {
    if (!thief || !target || thief === target || !isPlayer(thief)) {return}
    if (target.type === 'critter' && ((target.pro?.extra?.flags ?? 0) & CRITTER_NO_STEAL) !== 0) {
        show(msg('inventory', 50))
        return
    }
    if (!critterIsActive(target)) {
        if (screen.runPickup(target, thief)) {return}
        screen.openLoot(target)
        return
    }
    const session = new StealSession(thief, target, rng)
    session.open()
    screen.openSteal(thief, target, session)
}

/** After the steal screen closes, a caught thief faces the target's pickup_p_proc. */
export function finishStealing(session: StealSession, screen: StealScreen): void {
    session.close()
    if (session.caught && session.stealCount > 0) {screen.runPickup(session.target, session.thief)}
}
