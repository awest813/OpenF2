/**
 * Drugs, as the engine runs them (item.cc _item_d_take_drug /
 * _perform_drug_effect / drugEffectEventProcess / withdrawal events).
 *
 * Everything comes from the drug's proto: up to three stats, the immediate
 * change to each, and two delayed changes after duration1 and duration2
 * minutes (the second usually undoing the first). The changes go on the
 * critter's bonus stats (current HP, poison and radiation adjust those
 * values instead). Taking more than four doses of Buffout, Mentats, Psycho
 * or Jet at once does nothing more. Each dose may addict: withdrawal sets
 * in after the proto's onset unless the drug is taken again, and wears off
 * a week later (never, for Jet, without the antidote).
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'
import { EventBus } from '../eventBus.js'
import { getMessage, getRandomInt } from '../util.js'
import { PerkId, perkRank } from './perkIds.js'
import { adjustPoison, adjustRadiation } from './radiationPoison.js'
import { critterKill } from '../critter.js'
import { Scripting } from '../scripting.js'

type Rng = (min: number, max: number) => number
const defaultRng: Rng = (min, max) => getRandomInt(min, max)

const TRAIT_CHEM_RELIANT = 11
const TRAIT_CHEM_RESISTANT = 12
const MANEUVER_FLEEING = 0x04

/** The engine's stat numbers (stat_defs.h) as OpenF2 stat names. */
export const STAT_NAMES: Record<number, string> = {
    0: 'STR', 1: 'PER', 2: 'END', 3: 'CHA', 4: 'INT', 5: 'AGI', 6: 'LUK',
    7: 'Max HP', 8: 'AP', 9: 'AC', 10: 'Unarmed Damage', 11: 'Melee', 12: 'Carry', 13: 'Sequence',
    14: 'Healing Rate', 15: 'Critical Chance', 16: 'Better Criticals',
    17: 'DT Normal', 18: 'DT Laser', 19: 'DT Fire', 20: 'DT Plasma', 21: 'DT Electrical', 22: 'DT EMP', 23: 'DT Explosive',
    24: 'DR Normal', 25: 'DR Laser', 26: 'DR Fire', 27: 'DR Plasma', 28: 'DR Electrical', 29: 'DR EMP', 30: 'DR Explosive',
    31: 'DR Radiation', 32: 'DR Poison', 33: 'Age',
}
const STAT_CURRENT_HP = 35
const STAT_POISON_LEVEL = 36
const STAT_RADIATION_LEVEL = 37
const STAT_FALLBACK_NAMES: Record<number, string> = {
    0: 'Strength', 1: 'Perception', 2: 'Endurance', 3: 'Charisma', 4: 'Intelligence', 5: 'Agility', 6: 'Luck',
    7: 'Hit Points', 8: 'Action Points', 9: 'Armor Class', 14: 'Healing Rate', 15: 'Critical Chance',
    31: 'Radiation Resistance', 32: 'Poison Resistance', 35: 'Hit Points', 36: 'Poison', 37: 'Radiated',
}

export const PID_RADAWAY = 48
export const PID_MENTATS = 53
export const PID_BUFFOUT = 87
export const PID_NUKA_COLA = 106
export const PID_PSYCHO = 110
export const PID_BEER = 124
export const PID_BOOZE = 125
export const PID_JET = 259
export const PID_JET_ANTIDOTE = 260
export const PID_TRAGIC_CARDS = 304

/** gDrugDescriptions: the addiction global variable and the overdose limit. */
const DRUG_DESCRIPTIONS: Array<{ pid: number; gvar: number; maxDoses: number }> = [
    { pid: PID_NUKA_COLA, gvar: 21, maxDoses: 0 },
    { pid: PID_BUFFOUT, gvar: 22, maxDoses: 4 },
    { pid: PID_MENTATS, gvar: 23, maxDoses: 4 },
    { pid: PID_PSYCHO, gvar: 24, maxDoses: 4 },
    { pid: PID_RADAWAY, gvar: 25, maxDoses: 0 },
    { pid: PID_BEER, gvar: 26, maxDoses: 0 },
    { pid: PID_BOOZE, gvar: 26, maxDoses: 0 },
    { pid: PID_JET, gvar: 296, maxDoses: 4 },
    { pid: PID_TRAGIC_CARDS, gvar: 295, maxDoses: 0 },
]

/** gPerkDescriptions for the addiction perks: one stat change plus SPECIAL changes. */
const ADDICTION_PERK_EFFECTS: Record<number, Record<string, number>> = {
    [PerkId.NUKA_COLA_ADDICTION]: {},
    [PerkId.BUFFOUT_ADDICTION]: { STR: -2, END: -2, AGI: -3 },
    [PerkId.MENTATS_ADDICTION]: { INT: -3, AGI: -2 },
    [PerkId.PSYCHO_ADDICTION]: { INT: -2 },
    [PerkId.RADAWAY_ADDICTION]: { 'DR Radiation': -20 },
    [PerkId.JET_ADDICTION]: { AP: -1, STR: -1, PER: -1 },
    [PerkId.TRAGIC_ADDICTION]: { PER: -2, INT: -1, LUK: -1 },
}

interface DrugEvent {
    tick: number
    pid: number
    stats: number[]
    mods: number[]
}

interface WithdrawalEvent {
    tick: number
    /** true: withdrawal starts; false: it ends. */
    starting: boolean
    pid: number
    perk: number
}

export interface DrugState {
    /** Bonus stats from drugs and withdrawal. */
    bonus: Record<string, number>
    drugEvents: DrugEvent[]
    withdrawals: WithdrawalEvent[]
}

/** Critters with drug state, so their clocks can be run. */
const tracked = new Set<any>()

function stateOf(critter: any): DrugState {
    if (!critter.drugState) {critter.drugState = { bonus: {}, drugEvents: [], withdrawals: [] } as DrugState}
    tracked.add(critter)
    return critter.drugState
}

/** queueHasEvent(critter, EVENT_TYPE_DRUG): a drug is still working on the critter. */
export function hasDrugEvent(critter: any): boolean {
    return (critter?.drugState?.drugEvents?.length ?? 0) > 0
}

/** The bonus drugs put on a stat (Critter.getStat adds it). */
export function drugBonus(critter: any, stat: string): number {
    return critter?.drugState?.bonus?.[stat] ?? 0
}

/** Kept for older callers: Rad-X's resistance is now an ordinary drug bonus. */
export function getActiveRadResistBonus(_critter: object): number {
    return 0
}

function isPlayer(critter: any): boolean {
    return !!critter && (critter === globalState.player || critter.isPlayer === true)
}

function hasTrait(critter: any, trait: number): boolean {
    return critter?.charTraits?.has?.(trait) === true
}

function msg(file: string, id: number, fallback: string): string {
    let text: string | null = null
    try {
        text = getMessage(file, id)
    } catch {
        text = null
    }
    return text ?? fallback
}

function show(text: string): void {
    if (text) {EventBus.emit('ui:message', { text })}
}

function statValue(critter: any, stat: number): number {
    try {
        if (stat === STAT_CURRENT_HP) {return critter.getStat('HP')}
        if (stat === STAT_POISON_LEVEL) {return critter.stats?.getBase?.('Poison Level') ?? 0}
        if (stat === STAT_RADIATION_LEVEL) {return critter.stats?.getBase?.('Radiation Level') ?? 0}
        const name = STAT_NAMES[stat]
        const v = name ? critter.getStat(name) : 0
        return typeof v === 'number' && Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

function gvar(n: number): number {
    try {
        return Number(Scripting.getGlobalVar(n)) || 0
    } catch {
        return 0
    }
}

function setGvar(n: number, value: number): void {
    if (n < 0) {return}
    try {
        Scripting.setGlobalVars({ [n]: value })
    } catch {
        // no scripting
    }
}

function gvarForPid(pid: number): number {
    return DRUG_DESCRIPTIONS.find((d) => d.pid === pid)?.gvar ?? -1
}

/** dudeIsAddicted. */
export function isAddicted(pid: number): boolean {
    const g = gvarForPid(pid)
    return g !== -1 && gvar(g) !== 0
}

/** critterAdjustHitPoints. */
function adjustHitPoints(critter: any, amount: number): void {
    const hp = statValue(critter, STAT_CURRENT_HP)
    const maxHp = critter.getStat?.('Max HP') ?? hp
    const next = Math.min(maxHp, hp + amount)
    critter.stats?.modifyBase?.('HP', next - hp)
    if (next <= 0 && !critter.dead) {critterKill(critter, undefined as any, true)}
}

/** critterSetBonusStat(stat, bonus + delta). */
function addBonus(critter: any, stat: number, delta: number): void {
    if (stat === STAT_CURRENT_HP) {adjustHitPoints(critter, delta); return}
    if (stat === STAT_POISON_LEVEL) {adjustPoison(critter, delta); return}
    if (stat === STAT_RADIATION_LEVEL) {adjustRadiation(critter, delta); return}
    const name = STAT_NAMES[stat]
    if (!name) {return}
    const s = stateOf(critter)
    s.bonus[name] = (s.bonus[name] ?? 0) + delta
    if (s.bonus[name] === 0) {delete s.bonus[name]}
}

/** _perform_drug_effect. A first stat of −2 means "roll between the first two amounts for the second stat". */
function performDrugEffect(critter: any, stats: number[], mods: number[], immediate: boolean, rng: Rng): void {
    let statsChanged = false
    let start = 0
    let firstIsMinimum = false
    if (stats[0] === -2) {
        start = 1
        firstIsMinimum = true
    }
    for (let i = start; i < 3; i++) {
        const stat = stats[i]
        if (stat === -1 || stat === undefined) {continue}
        if (stat === STAT_CURRENT_HP && typeof critter.combatManeuver === 'number') {critter.combatManeuver &= ~MANEUVER_FLEEING}
        const before = isPlayer(critter) ? statValue(critter, stat) : 0
        let delta: number
        if (firstIsMinimum) {
            delta = rng(mods[i - 1], mods[i])
            firstIsMinimum = false
        } else {
            delta = mods[i]
        }
        if (stat === STAT_CURRENT_HP && !isPlayer(critter) && statValue(critter, STAT_CURRENT_HP) + delta <= 0) {
            show(msg('item', 600, '%s succumbs to the adverse effects of chems.').replace('%s', critter.name ?? ''))
        }
        addBonus(critter, stat, delta)
        if (isPlayer(critter)) {
            const after = statValue(critter, stat)
            if (after !== before) {
                const name = msg('stat', 100 + stat, STAT_FALLBACK_NAMES[stat] ?? STAT_NAMES[stat] ?? '')
                const template = after < before ? msg('item', 2, 'You lost %d %s.') : msg('item', 1, 'You gained %d %s.')
                show(template.replace('%d', String(Math.abs(after - before))).replace('%s', name))
                statsChanged = true
            }
        }
    }
    if (statValue(critter, STAT_CURRENT_HP) > 0 && isPlayer(critter) && !statsChanged && immediate) {
        show(msg('item', 10, 'Nothing happens.'))
    }
}

function drugAllowed(critter: any, pid: number): boolean {
    const desc = DRUG_DESCRIPTIONS.find((d) => d.pid === pid)
    if (!desc || desc.maxDoses === 0) {return true}
    const pending = (critter.drugState?.drugEvents ?? []).filter((e: DrugEvent) => e.pid === pid).length
    return pending < desc.maxDoses
}

function insertDrugEffect(critter: any, pid: number, minutes: number, stats: number[], mods: number[], now: number): void {
    if (!mods.some((m) => m !== 0)) {return}
    let delay = 600 * minutes
    if (isPlayer(critter) && hasTrait(critter, TRAIT_CHEM_RESISTANT)) {delay = Math.trunc(delay / 2)}
    stateOf(critter).drugEvents.push({ tick: now + delay, pid, stats: stats.slice(), mods: mods.slice() })
}

function insertWithdrawal(critter: any, starting: boolean, minutes: number, perk: number, pid: number, now: number): void {
    stateOf(critter).withdrawals.push({ tick: now + 600 * minutes, starting, pid, perk })
}

function applyPerkEffect(critter: any, perk: number, sign: 1 | -1): void {
    const effects = ADDICTION_PERK_EFFECTS[perk]
    if (!effects) {return}
    const s = stateOf(critter)
    for (const [name, value] of Object.entries(effects)) {
        s.bonus[name] = (s.bonus[name] ?? 0) + sign * value
        if (s.bonus[name] === 0) {delete s.bonus[name]}
    }
}

/** performWithdrawalStart. */
function withdrawalStart(critter: any, perk: number, pid: number, now: number): void {
    applyPerkEffect(critter, perk, 1)
    if (isPlayer(critter)) {show(msg('perk', 1101 + perk, ''))}
    let minutes = 10080
    if (isPlayer(critter)) {
        if (hasTrait(critter, TRAIT_CHEM_RELIANT)) {minutes = Math.trunc(minutes / 2)}
        if (perkRank(critter, PerkId.FLOWER_CHILD) > 0) {minutes = Math.trunc(minutes / 2)}
    }
    insertWithdrawal(critter, false, minutes, perk, pid, now)
}

/** performWithdrawalEnd. */
function withdrawalEnd(critter: any, perk: number): void {
    applyPerkEffect(critter, perk, -1)
    if (isPlayer(critter)) {show(msg('item', 3, 'You feel better.'))}
}

/** Proto drug data, as proto.py stores it. */
function drugProto(item: any): { stats: number[]; amount: number[]; d1: number; amount1: number[]; d2: number; amount2: number[]; addiction: number; perk: number; onset: number } | null {
    const e = item?.pro?.extra
    if (!e || typeof e.stat0 !== 'number') {return null}
    const delayed = (d: any) => [d?.amount0 ?? 0, d?.amount1 ?? 0, d?.amount2 ?? 0]
    return {
        stats: [e.stat0, e.stat1, e.stat2],
        amount: [e.amount0 ?? 0, e.amount1 ?? 0, e.amount2 ?? 0],
        d1: e.firstDelayed?.duration ?? 0,
        amount1: delayed(e.firstDelayed),
        d2: e.secondDelayed?.duration ?? 0,
        amount2: delayed(e.secondDelayed),
        addiction: e.addictionRate ?? 0,
        perk: e.addictionEffect ?? -1,
        onset: e.addictionOnset ?? 0,
    }
}

export function isDrug(item: any): boolean {
    return item?.subtype === 'drug' || item?.pro?.extra?.subType === 2
}

/**
 * _item_d_take_drug: returns 1 when the dose was taken (and used up), −1
 * when it could not be (dead, robotic, not a drug).
 */
export function takeDrug(critter: any, item: any, rng: Rng = defaultRng): number {
    if (!critter || critter.dead || critter.type !== 'critter') {return -1}
    if ((critter.pro?.extra?.bodyType ?? 0) === 2) {return -1}
    const pid = item?.pid
    const now = globalState.gameTickTime ?? 0

    if (pid === PID_JET_ANTIDOTE && isAddicted(PID_JET)) {
        withdrawalEnd(critter, PerkId.JET_ADDICTION)
        stateOf(critter).withdrawals = stateOf(critter).withdrawals.filter((w) => w.perk !== PerkId.JET_ADDICTION)
        if (isPlayer(critter)) {setGvar(gvarForPid(PID_JET), 0)}
        return 1
    }

    const proto = drugProto(item)
    if (!proto) {return -1}
    const s = stateOf(critter)

    // _item_wd_clear_all: another dose puts withdrawal off until the onset again.
    const g = gvarForPid(pid)
    const pendingIdx = s.withdrawals.findIndex((w) => gvarForPid(w.pid) === g)
    if (g !== -1 && pendingIdx >= 0) {
        const [w] = s.withdrawals.splice(pendingIdx, 1)
        if (!w.starting) {withdrawalEnd(critter, w.perk)}
        insertWithdrawal(critter, true, proto.onset, w.perk, w.pid, now)
    }

    if (drugAllowed(critter, pid)) {
        performDrugEffect(critter, proto.stats, proto.amount, true, rng)
        insertDrugEffect(critter, pid, proto.d1, proto.stats, proto.amount1, now)
        insertDrugEffect(critter, pid, proto.d2, proto.stats, proto.amount2, now)
    } else if (isPlayer(critter)) {
        show(msg('item', 50, "That didn't seem to do that much."))
    }

    if (!isAddicted(pid)) {
        let chance = proto.addiction
        if (isPlayer(critter)) {
            if (hasTrait(critter, TRAIT_CHEM_RELIANT)) {chance *= 2}
            if (hasTrait(critter, TRAIT_CHEM_RESISTANT)) {chance = Math.trunc(chance / 2)}
            if (perkRank(critter, PerkId.FLOWER_CHILD) > 0) {chance = Math.trunc(chance / 2)}
        }
        if (rng(1, 100) <= chance) {
            insertWithdrawal(critter, true, proto.onset, proto.perk, pid, now)
            if (isPlayer(critter) && g !== -1) {setGvar(g, 1)}
        }
    }

    if (isPlayer(critter)) {syncPlayerEntityFromCritter()}
    return 1
}

/** Older name, kept for callers. */
export function applyDrugToCritter(critter: Critter, item: any, _opts: unknown = {}): boolean {
    return takeDrug(critter, item) === 1
}

/** Run the drug and withdrawal events every tracked critter has due by `now`. */
export function processDrugEventsUpTo(now = globalState.gameTickTime ?? 0, rng: Rng = defaultRng): void {
    if (globalState.player) {tracked.add(globalState.player)}
    for (const critter of [...tracked]) {
        const s: DrugState | undefined = critter.drugState
        if (!s) {continue}
        let guard = 1000
        for (;;) {
            if (--guard <= 0) {break}
            const drug = s.drugEvents.reduce<DrugEvent | null>((a, e) => (!a || e.tick < a.tick ? e : a), null)
            const wd = s.withdrawals.reduce<WithdrawalEvent | null>((a, e) => (!a || e.tick < a.tick ? e : a), null)
            const next = drug && (!wd || drug.tick <= wd.tick) ? drug : wd
            if (!next || next.tick > now) {break}
            if (next === drug) {
                s.drugEvents.splice(s.drugEvents.indexOf(drug!), 1)
                if (!critter.dead) {performDrugEffect(critter, drug!.stats, drug!.mods, false, rng)}
            } else {
                const w = wd!
                if (w.starting) {
                    s.withdrawals.splice(s.withdrawals.indexOf(w), 1)
                    withdrawalStart(critter, w.perk, w.pid, w.tick)
                } else if (w.perk === PerkId.JET_ADDICTION) {
                    // Jet withdrawal lasts until the antidote.
                    w.tick = Number.POSITIVE_INFINITY
                } else {
                    s.withdrawals.splice(s.withdrawals.indexOf(w), 1)
                    withdrawalEnd(critter, w.perk)
                    if (isPlayer(critter)) {setGvar(gvarForPid(w.pid), 0)}
                }
            }
        }
        if (s.drugEvents.length === 0 && s.withdrawals.length === 0 && Object.keys(s.bonus).length === 0 && !isPlayer(critter)) {
            tracked.delete(critter)
        }
    }
    if (globalState.player) {syncPlayerEntityFromCritter()}
}

/** Older name: run the clock up to now. */
export function tickTimedEffects(_critter?: Critter, now = globalState.gameTickTime): void {
    processDrugEventsUpTo(now)
}

export interface ActiveTimedEffect {
    drugId: string
    expiresAt: number
}

/** Pending drug effects (for the Pip-Boy). */
export function getActiveEffects(critter: any): readonly ActiveTimedEffect[] {
    return (critter?.drugState?.drugEvents ?? []).map((e: DrugEvent) => ({ drugId: drugName(e.pid), expiresAt: e.tick }))
}

export interface AddictionState {
    drugId: string
    withdrawing: boolean
}

/** The player's addictions, from the addiction global variables. */
export function getAddictions(critter: any): readonly AddictionState[] {
    if (!isPlayer(critter)) {return []}
    const out: AddictionState[] = []
    const seen = new Set<number>()
    for (const d of DRUG_DESCRIPTIONS) {
        if (seen.has(d.gvar) || gvar(d.gvar) === 0) {continue}
        seen.add(d.gvar)
        const withdrawing = (critter.drugState?.withdrawals ?? []).some((w: WithdrawalEvent) => !w.starting && gvarForPid(w.pid) === d.gvar)
        out.push({ drugId: drugName(d.pid), withdrawing })
    }
    return out
}

function drugName(pid: number): string {
    switch (pid) {
        case PID_NUKA_COLA: return 'Nuka-Cola'
        case PID_BUFFOUT: return 'Buffout'
        case PID_MENTATS: return 'Mentats'
        case PID_PSYCHO: return 'Psycho'
        case PID_RADAWAY: return 'RadAway'
        case PID_BEER: case PID_BOOZE: return 'Alcohol'
        case PID_JET: return 'Jet'
        case PID_TRAGIC_CARDS: return 'Tragic: The Garnering'
        default: return 'pid ' + pid
    }
}

/** Test helper. */
export function resetTimedEffects(): void {
    for (const c of tracked) {delete c.drugState}
    tracked.clear()
}

export interface SerializedTimedEffects {
    player?: DrugState
    members?: Record<string, DrugState>
}

function pack(critter: any): DrugState | undefined {
    const s: DrugState | undefined = critter?.drugState
    if (!s) {return undefined}
    return {
        bonus: { ...s.bonus },
        drugEvents: s.drugEvents.map((e) => ({ ...e, stats: e.stats.slice(), mods: e.mods.slice() })),
        withdrawals: s.withdrawals.map((w) => ({ ...w, tick: Number.isFinite(w.tick) ? w.tick : 2 ** 31 })),
    }
}

function unpack(critter: any, data: any): void {
    if (!critter || !data || typeof data !== 'object') {return}
    const s = stateOf(critter)
    s.bonus = data.bonus && typeof data.bonus === 'object' ? { ...data.bonus } : {}
    s.drugEvents = Array.isArray(data.drugEvents) ? data.drugEvents.filter((e: any) => typeof e?.tick === 'number') : []
    s.withdrawals = Array.isArray(data.withdrawals)
        ? data.withdrawals.filter((w: any) => typeof w?.tick === 'number').map((w: any) => ({ ...w, tick: w.tick >= 2 ** 31 ? Number.POSITIVE_INFINITY : w.tick }))
        : []
}

export function serializeTimedEffects(): SerializedTimedEffects {
    const out: SerializedTimedEffects = {}
    const player = pack(globalState.player)
    if (player) {out.player = player}
    const party = globalState.gParty
    if (party && typeof party.getPartyMembers === 'function') {
        for (const member of party.getPartyMembers()) {
            const packed = pack(member)
            const pid = (member as any)?.pid
            if (!packed || typeof pid !== 'number') {continue}
            out.members ??= {}
            out.members[String(pid)] = packed
        }
    }
    return out
}

export function hydrateTimedEffects(data: { player?: unknown; members?: Record<string, unknown> } | null | undefined): void {
    resetTimedEffects()
    if (!data || typeof data !== 'object') {return}
    if (data.player && 'drugEvents' in (data.player as any)) {unpack(globalState.player, data.player)}
    if (data.members && globalState.gParty && typeof globalState.gParty.getPartyMemberByPID === 'function') {
        for (const [key, packed] of Object.entries(data.members)) {
            const member = globalState.gParty.getPartyMemberByPID(Number(key))
            if (member && packed && typeof packed === 'object' && 'drugEvents' in (packed as any)) {unpack(member, packed)}
        }
    }
}
