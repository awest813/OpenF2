/**
 * Reading skill books (proto_instance.cc _obj_use_book). A book raises its
 * skill by a tenth of what the skill lacks of 100% (half again with
 * Comprehension), takes 11 − INT hours, and is used up. It cannot be read
 * in combat.
 */

import globalState from './globalState.js'
import { EventBus } from './eventBus.js'
import { getMessage } from './util.js'
import { PerkId, perkRank } from './character/perkIds.js'
import { advanceGameTime } from './character/rest.js'
import { TICKS_PER_HOUR } from './gameTime.js'

/** booksInit (vanilla): pid → proto.msg line and skill. */
export const BOOKS: Record<number, { messageId: number; skill: string }> = {
    73: { messageId: 802, skill: 'Science' },
    76: { messageId: 803, skill: 'Repair' },
    80: { messageId: 804, skill: 'First Aid' },
    102: { messageId: 805, skill: 'Small Guns' },
    86: { messageId: 806, skill: 'Outdoorsman' },
}

const FALLBACK: Record<number, string> = {
    800: 'You read the book.',
    801: "You learn nothing new.",
    802: 'Your Science skill has improved.',
    803: 'Your Repair skill has improved.',
    804: 'Your First Aid skill has improved.',
    805: 'Your Small Guns skill has improved.',
    806: 'Your Outdoorsman skill has improved.',
    902: "You can't do that in combat.",
}

function protoText(id: number): string {
    let text: string | null = null
    try {
        text = getMessage('proto', id)
    } catch {
        text = null
    }
    return text ?? FALLBACK[id] ?? ''
}

function show(id: number): void {
    const text = protoText(id)
    if (text) {EventBus.emit('ui:message', { text })}
}

export function isBook(item: any): boolean {
    return typeof item?.pid === 'number' && BOOKS[item.pid] !== undefined
}

/** _obj_use_book: 1 when read (and used up), 0 when refused, −1 when not a book. */
export function useBook(book: any, reader: any = globalState.player): number {
    const info = BOOKS[book?.pid]
    if (!info) {return -1}
    if (globalState.inCombat) {
        show(902)
        return 0
    }
    let messageId = info.messageId
    let increase = Math.trunc((100 - (reader.getSkill?.(info.skill) ?? 0)) / 10)
    if (increase <= 0) {
        messageId = 801
    } else {
        if (perkRank(reader, PerkId.COMPREHENSION) > 0) {increase = Math.trunc((150 * increase) / 100)}
        // skillAddForce: one skill point per step (tagged skills count double).
        const skills = reader.skills
        if (skills?.baseSkills) {
            skills.baseSkills[info.skill] = (skills.baseSkills[info.skill] ?? skills.getBase?.(info.skill) ?? 0) + increase
        }
    }
    const intelligence = reader.getStat?.('INT') ?? 5
    advanceGameTime(TICKS_PER_HOUR * (11 - intelligence), { heal: false, tickEffects: true, requireOutOfCombat: false })
    show(800)
    show(messageId)
    return 1
}
