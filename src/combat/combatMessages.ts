/**
 * Display-monitor text for an attack, composed the way the Fallout 2 engine
 * does it (combat.cc _combat_display, combatCopyDamageAmountDescription,
 * combatAddDamageFlagsDescription) from combat.msg. When combat.msg is not
 * loaded (tests, missing assets) the English text is used as a fallback.
 */

import { getMessage } from '../util.js'
import { Dam, hitLocationIndex } from './criticalTables.js'

/** combat.msg lines used here, with the English text as fallback. */
const FALLBACK: Record<number, string> = {
    107: 'You are not strong enough to use this weapon properly.',
    108: ' and ',
    // player (male 500 / female 550) and NPC (male 600 / female 700) blocks
    506: 'You',
    508: 'Oops! %s was hit instead of you',
    509: 'Oops! %s were hit instead of %s',
    511: '%s were critically hit in the %s for %d hit points',
    512: '%s were hit in the %s for %d hit points',
    513: '%s were hit for %d hit points',
    514: '%s critically missed',
    515: '%s missed',
    520: '%s were critically hit for %d hit points',
    521: '%s were critically hit in the %s for 1 hit point',
    522: '%s were hit in the %s for 1 hit point',
    523: '%s were hit for 1 hit point',
    524: '%s were critically hit for 1 hit point',
    525: '%s were critically hit in the %s for no damage',
    526: '%s were hit in the %s for no damage',
    527: '%s were hit for no damage',
    528: '%s were critically hit for no damage',
    533: '%s critically missed and took 1 hit point',
    534: '%s critically missed and took %d hit points',
    608: 'Oops! %s was hit instead of you',
    609: 'Oops! %s was hit instead of %s',
    611: '%s was critically hit in the %s for %d hit points',
    612: '%s was hit in the %s for %d hit points',
    613: '%s was hit for %d hit points',
    614: '%s critically missed',
    615: '%s missed',
    620: '%s was critically hit for %d hit points',
    621: '%s was critically hit in the %s for 1 hit point',
    622: '%s was hit in the %s for 1 hit point',
    623: '%s was hit for 1 hit point',
    624: '%s was critically hit for 1 hit point',
    625: '%s was critically hit in the %s for no damage',
    626: '%s was hit in the %s for no damage',
    627: '%s was hit for no damage',
    628: '%s was critically hit for no damage',
    633: '%s critically missed and took 1 hit point',
    634: '%s critically missed and took %d hit points',
    1000: 'head', 1001: 'left arm', 1002: 'right arm', 1003: 'torso',
    1004: 'right leg', 1005: 'left leg', 1006: 'eyes', 1007: 'groin',
}

/** Result-flag phrases by flag bit, for the player (2xx) and others (3xx). */
const FLAG_FALLBACK_PLAYER = [
    'were knocked out', 'were knocked down', 'crippled your left leg', 'crippled your right leg',
    'crippled your left arm', 'crippled your right arm', 'were blinded', 'were killed', '', '',
    'were set on fire', 'had your armor bypassed', 'had your weapon explode', 'had your weapon destroyed',
    'dropped your weapon', 'lost your next turn', 'hit yourself', 'lost your ammo', 'had a dud',
    'hurt yourself', 'hit something else', 'crippled yourself',
]
const FLAG_FALLBACK_OTHER = [
    'was knocked out', 'was knocked down', 'crippled the left leg', 'crippled the right leg',
    'crippled the left arm', 'crippled the right arm', 'was blinded', 'was killed', '', '',
    'was set on fire', 'had armor bypassed', 'had a weapon explode', 'had a weapon destroyed',
    'dropped a weapon', 'lost the next turn', 'was hit by own attack', 'lost ammo', 'had a dud',
    'was hurt', 'hit something else', 'was crippled',
]

function msg(id: number): string {
    let text: string | null = null
    try {
        text = getMessage('combat', id)
    } catch {
        text = null
    }
    if (text) {return text}
    // Female blocks (550 / 700) share the male wording in the fallback table.
    const base = id >= 700 && id < 800 ? id - 100 : id >= 550 && id < 600 ? id - 50 : id
    if (FALLBACK[base] !== undefined) {return FALLBACK[base]}
    if (id >= 200 && id < 500) {
        const bit = id % 50
        return ((id >= 300) ? FLAG_FALLBACK_OTHER : FLAG_FALLBACK_PLAYER)[bit] ?? ''
    }
    return ''
}

/** printf with %s / %d in order. */
function format(template: string, ...args: Array<string | number>): string {
    let i = 0
    return template.replace(/%[sd]/g, () => String(args[i++] ?? ''))
}

export interface MessageCritter {
    isPlayer?: boolean
    name?: string
    gender?: string
    getStat?: (stat: string) => number
}

function isFemale(c: MessageCritter): boolean {
    if (c.isPlayer) {return c.gender === 'female'}
    const g = typeof c.getStat === 'function' ? c.getStat('Gender') : 0
    return g === 1 || c.gender === 'female'
}

/** Message block base: 500/550 for the player, 600/700 for others. */
function baseId(c: MessageCritter): number {
    if (c.isPlayer) {return isFemale(c) ? 550 : 500}
    return isFemale(c) ? 700 : 600
}

/** Flag phrase block: 200/250 for the player, 300/400 for others. */
function flagBase(c: MessageCritter): number {
    if (c.isPlayer) {return isFemale(c) ? 250 : 200}
    return isFemale(c) ? 400 : 300
}

function nameOf(c: MessageCritter): string {
    if (c.isPlayer) {return msg(isFemale(c) ? 556 : 506)}
    return c.name || 'someone'
}

/** combatCopyDamageAmountDescription: "X was hit for N hit points". */
export function damageAmountText(c: MessageCritter, damage: number): string {
    const base = baseId(c)
    const id = damage === 0 ? base + 27 : damage === 1 ? base + 23 : base + 13
    return format(msg(id), nameOf(c), damage)
}

/** combatAddDamageFlagsDescription: ", crippled the left leg and was knocked down". */
export function damageFlagsText(c: MessageCritter, flags: number): string {
    if (flags === 0) {return ''}
    const base = flagBase(c)
    if (flags & Dam.DEAD) {return msg(108) + msg(base + 7)}
    const bits: number[] = []
    for (let bit = 0; bit < 32; bit++) {
        const mask = 1 << bit
        if (mask === Dam.CRITICAL || mask === Dam.HIT) {continue}
        if (flags & mask) {bits.push(bit)}
    }
    if (bits.length === 0) {return ''}
    let out = ''
    for (let i = 0; i < bits.length - 1; i++) {out += ', ' + msg(base + bits[i])}
    return out + msg(108) + msg(base + bits[bits.length - 1])
}

export interface AttackReport {
    attacker: MessageCritter
    /** Whom the attack ended up hitting (a stray shot changes this). */
    defender: MessageCritter | null
    /** The intended target when a stray shot hit someone else. */
    oops?: MessageCritter | null
    hit: boolean
    critical: boolean
    region: string
    defenderDamage: number
    defenderFlags: number
    defenderDied: boolean
    /** combat.msg id of the critical effect description, when there is one. */
    criticalMessageId?: number
    /** Damage and flags the attacker suffered (critical failure). */
    attackerDamage: number
    attackerFlags: number
    extras: Array<{ critter: MessageCritter; damage: number; flags: number; died: boolean }>
    /** Player is below the weapon's Strength requirement. */
    tooWeak?: boolean
}

/** _combat_display: the monitor lines for one attack. */
export function describeAttack(r: AttackReport): string[] {
    const lines: string[] = []
    if (r.attacker.isPlayer && r.tooWeak) {lines.push(msg(107))}

    const main = r.hit && r.defender ? r.defender : r.attacker
    const mainName = nameOf(main)
    const base = baseId(main)

    if (r.hit && r.defender && r.oops && r.oops !== r.defender) {
        const text = r.oops.isPlayer
            ? format(msg(base + 8), mainName)
            : format(msg(base + 9), mainName, nameOf(r.oops))
        lines.push(text + '.')
    }

    if (r.hit && r.defender) {
        let text = ''
        const region = r.region === 'uncalled' ? 'torso' : r.region
        const damage = r.defenderDamage
        if (region === 'torso') {
            if (r.critical) {
                const id = damage === 0 ? base + 28 : damage === 1 ? base + 24 : base + 20
                text = format(msg(id), mainName, damage)
            } else {
                text = damageAmountText(r.defender, damage)
            }
        } else {
            const where = msg(1000 + hitLocationIndex(region))
            let id: number
            if (r.critical) {id = damage === 0 ? base + 25 : damage === 1 ? base + 21 : base + 11}
            else {id = damage === 0 ? base + 26 : damage === 1 ? base + 22 : base + 12}
            text = format(msg(id), mainName, where, damage)
        }

        if (r.critical && r.criticalMessageId !== undefined && r.criticalMessageId !== -1) {
            text += msg(r.criticalMessageId)
            if (r.defenderDied) {
                lines.push(text + '.')
                text = `${mainName} ${msg(flagBase(r.defender) + 7)}`
            }
        } else {
            text += damageFlagsText(r.defender, r.defenderFlags | (r.defenderDied ? Dam.DEAD : 0))
        }
        lines.push(text + '.')
    }

    if (!r.hit) {
        let text: string
        if (r.critical) {
            const d = r.attackerDamage
            const id = d === 0 ? base + 14 : d === 1 ? base + 33 : base + 34
            text = format(msg(id), mainName, d)
        } else {
            text = format(msg(base + 15), mainName)
        }
        text += damageFlagsText(r.attacker, r.attackerFlags & ~Dam.HIT)
        lines.push(text + '.')
    }

    for (const extra of r.extras) {
        lines.push(damageAmountText(extra.critter, extra.damage) + damageFlagsText(extra.critter, extra.flags | (extra.died ? Dam.DEAD : 0)) + '.')
    }

    return lines.filter((l) => l.trim().length > 1)
}
