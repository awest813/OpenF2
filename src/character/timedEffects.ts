/**
 * Timed drug / chem effects (parity Slice F / P1-5).
 *
 * Applies temporary SPECIAL deltas on the Critter StatSet, tracks addiction, and
 * expires effects against `globalState.gameTickTime`.
 */

import globalState from '../globalState.js'
import { Critter } from '../object.js'
import { syncPlayerEntityFromCritter } from '../playerProjection.js'

export type SpecialKey = 'STR' | 'PER' | 'END' | 'CHA' | 'INT' | 'AGI' | 'LUK'

export interface DrugDef {
    id: string
    /** Match against item name / proto text (case-insensitive substring). */
    nameMatchers: string[]
    /** Optional Fallout 2 item PID match. */
    pids?: number[]
    /** Immediate HP heal (before resistance). */
    healHp?: number
    /** Immediate radiation change (negative = RadAway). */
    radiationDelta?: number
    /** Immediate poison change (negative = Antidote). */
    poisonDelta?: number
    /** Flat SPECIAL mods while the primary effect is active. */
    specialMods?: Partial<Record<SpecialKey, number>>
    /** Radiation resistance bonus while active (Rad-X). */
    radResistBonus?: number
    /** Duration of the primary buff in game ticks (10 ticks = 1 second). */
    durationTicks: number
    /** Chance (0–100) to become addicted on use. */
    addictionChance: number
    /** Withdrawal SPECIAL penalties while addicted and not under the drug. */
    withdrawalMods?: Partial<Record<SpecialKey, number>>
}

export interface ActiveTimedEffect {
    drugId: string
    /** gameTickTime when the buff expires. */
    expiresAt: number
    appliedMods: Partial<Record<SpecialKey, number>>
    radResistBonus: number
}

export interface AddictionState {
    drugId: string
    /** When true, withdrawal mods are applied until the drug is taken again. */
    withdrawing: boolean
}

const DRUGS: DrugDef[] = [
    {
        id: 'stimpak',
        nameMatchers: ['stimpak', 'stim pack'],
        pids: [40, 144, 259, 473], // common stimpak / super / ultra variants vary by install
        healHp: 20,
        durationTicks: 100,
        addictionChance: 0,
    },
    {
        id: 'super_stimpak',
        nameMatchers: ['super stimpak', 'super stim'],
        healHp: 50,
        durationTicks: 100,
        addictionChance: 0,
        // FO2: delayed HP loss after — modeled lightly as END −1 for a short window
        specialMods: { END: -1 },
    },
    {
        id: 'buffout',
        nameMatchers: ['buffout'],
        specialMods: { STR: 2, END: 2 },
        durationTicks: 6 * 60 * 60 * 10, // ~6 game hours
        addictionChance: 25,
        withdrawalMods: { STR: -2, END: -3 },
    },
    {
        id: 'mentats',
        nameMatchers: ['mentats'],
        specialMods: { INT: 2, PER: 2, CHA: 1 },
        durationTicks: 6 * 60 * 60 * 10,
        addictionChance: 15,
        withdrawalMods: { INT: -2, PER: -2, CHA: -1 },
    },
    {
        id: 'psycho',
        nameMatchers: ['psycho'],
        specialMods: { AGI: 3 },
        durationTicks: 4 * 60 * 60 * 10,
        addictionChance: 20,
        withdrawalMods: { AGI: -3 },
    },
    {
        id: 'jet',
        nameMatchers: ['jet'],
        specialMods: { AGI: 2 },
        durationTicks: 60 * 60 * 10, // ~1 hour
        addictionChance: 50,
        withdrawalMods: { AGI: -2, END: -1 },
    },
    {
        id: 'radx',
        nameMatchers: ['rad-x', 'radx', 'rad x'],
        radResistBonus: 50,
        durationTicks: 24 * 60 * 60 * 10,
        addictionChance: 0,
    },
    {
        id: 'radaway',
        nameMatchers: ['radaway', 'rad away'],
        radiationDelta: -50,
        durationTicks: 100,
        addictionChance: 10,
        withdrawalMods: { END: -1 },
    },
    {
        id: 'antidote',
        nameMatchers: ['antidote'],
        poisonDelta: -50,
        durationTicks: 100,
        addictionChance: 0,
    },
    {
        id: 'nuka_cola',
        nameMatchers: ['nuka-cola', 'nuka cola', 'nuka'],
        healHp: 2,
        specialMods: { AGI: 1 },
        durationTicks: 5 * 60 * 10,
        addictionChance: 5,
    },
]

/** Per-critter active buffs (WeakMap would GC too aggressively across map loads). */
const activeEffects = new Map<object, ActiveTimedEffect[]>()
const addictions = new Map<object, AddictionState[]>()
/** Track applied withdrawal so we can remove cleanly. */
const withdrawalApplied = new Map<object, Set<string>>()

export function getDrugDefs(): readonly DrugDef[] {
    return DRUGS
}

export function resolveDrugDef(item: { name?: string; pid?: number; pro?: any } | null | undefined): DrugDef | null {
    if (!item) return null
    const pid = typeof item.pid === 'number' ? item.pid : item.pro?.pid
    const name = String(item.name ?? item.pro?.name ?? item.pro?.textID ?? '').toLowerCase()
    for (const def of DRUGS) {
        if (pid !== undefined && def.pids?.includes(pid)) return def
        if (name && def.nameMatchers.some((m) => name.includes(m))) return def
    }
    return null
}

function modifySpecial(critter: Critter, mods: Partial<Record<SpecialKey, number>>, sign: 1 | -1): void {
    if (!critter.stats?.baseStats) return
    for (const [k, v] of Object.entries(mods) as Array<[SpecialKey, number]>) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        const cur = critter.stats.baseStats[k] ?? critter.stats.getBase?.(k) ?? 5
        const next = Math.max(1, Math.min(10, cur + sign * v))
        critter.stats.baseStats[k] = next
    }
}

function rollAddiction(chance: number): boolean {
    if (chance <= 0) return false
    return Math.floor(Math.random() * 100) < chance
}

export interface ApplyDrugOptions {
    /**
     * When true, skip engine-side HP heal (script `use_p_proc` usually heals
     * stimpaks — avoid double-counting).
     */
    skipHeal?: boolean
}

/**
 * Apply a drug item to a critter. Returns true if a known drug was applied.
 */
export function applyDrugToCritter(critter: Critter, item: any, opts: ApplyDrugOptions = {}): boolean {
    const def = resolveDrugDef(item)
    if (!def) return false

    // Clear withdrawal for this drug if re-dosing
    const addictList = addictions.get(critter) ?? []
    const addict = addictList.find((a) => a.drugId === def.id)
    if (addict?.withdrawing) {
        if (def.withdrawalMods) modifySpecial(critter, def.withdrawalMods, -1)
        addict.withdrawing = false
        withdrawalApplied.get(critter)?.delete(def.id)
    }

    if (!opts.skipHeal && def.healHp && def.healHp > 0 && critter.stats) {
        const maxHp = critter.getStat?.('Max HP') ?? critter.stats.get?.('Max HP') ?? 0
        const hp = critter.getStat?.('HP') ?? critter.stats.get?.('HP') ?? 0
        const heal = Math.min(def.healHp, Math.max(0, maxHp - hp))
        if (heal > 0 && critter.stats.baseStats) {
            critter.stats.baseStats['HP'] = hp + heal
        }
    }

    if (def.radiationDelta && critter.stats) {
        critter.stats.modifyBase('Radiation Level', def.radiationDelta)
        const rad = critter.stats.getBase('Radiation Level')
        if (rad < 0) critter.stats.setBase('Radiation Level', 0)
    }

    if (def.poisonDelta && critter.stats) {
        critter.stats.modifyBase('Poison Level', def.poisonDelta)
        const poi = critter.stats.getBase('Poison Level')
        if (poi < 0) critter.stats.setBase('Poison Level', 0)
    }

    if (def.specialMods) {
        modifySpecial(critter, def.specialMods, 1)
    }

    const list = activeEffects.get(critter) ?? []
    list.push({
        drugId: def.id,
        expiresAt: (globalState.gameTickTime ?? 0) + def.durationTicks,
        appliedMods: { ...(def.specialMods ?? {}) },
        radResistBonus: def.radResistBonus ?? 0,
    })
    activeEffects.set(critter, list)

    if (rollAddiction(def.addictionChance)) {
        if (!addictList.some((a) => a.drugId === def.id)) {
            addictList.push({ drugId: def.id, withdrawing: false })
            addictions.set(critter, addictList)
        }
    }

    if (critter === globalState.player || (critter as any).isPlayer) {
        syncPlayerEntityFromCritter()
    }
    return true
}

/** Sum of active Rad-X style bonuses for a critter. */
export function getActiveRadResistBonus(critter: object): number {
    const list = activeEffects.get(critter) ?? []
    return list.reduce((sum, e) => sum + (e.radResistBonus || 0), 0)
}

export function getActiveEffects(critter: object): readonly ActiveTimedEffect[] {
    return activeEffects.get(critter) ?? []
}

export function getAddictions(critter: object): readonly AddictionState[] {
    return addictions.get(critter) ?? []
}

/**
 * Expire buffs and start withdrawal for addictions. Call from the 10 Hz game tick.
 */
export function tickTimedEffects(critter: Critter, now = globalState.gameTickTime): void {
    const list = activeEffects.get(critter)
    if (list && list.length > 0) {
        const remaining: ActiveTimedEffect[] = []
        for (const effect of list) {
            if (now >= effect.expiresAt) {
                if (effect.appliedMods) modifySpecial(critter, effect.appliedMods, -1)
                const addict = (addictions.get(critter) ?? []).find((a) => a.drugId === effect.drugId)
                if (addict && !addict.withdrawing) {
                    const def = DRUGS.find((d) => d.id === effect.drugId)
                    if (def?.withdrawalMods) {
                        modifySpecial(critter, def.withdrawalMods, 1)
                        addict.withdrawing = true
                        const set = withdrawalApplied.get(critter) ?? new Set()
                        set.add(def.id)
                        withdrawalApplied.set(critter, set)
                    }
                }
            } else {
                remaining.push(effect)
            }
        }
        if (remaining.length) activeEffects.set(critter, remaining)
        else activeEffects.delete(critter)
    }

    if (critter === globalState.player || (critter as any).isPlayer) {
        syncPlayerEntityFromCritter()
    }
}

/** Test helper — wipe all timed effect state. */
export function resetTimedEffects(): void {
    activeEffects.clear()
    addictions.clear()
    withdrawalApplied.clear()
}

export interface SerializedCritterTimedState {
    effects: ActiveTimedEffect[]
    addictions: AddictionState[]
    withdrawalApplied: string[]
}

export interface SerializedTimedEffects {
    /** Player timed state (object identity does not survive save/load). */
    player?: SerializedCritterTimedState
    /** Party members keyed by PID string. */
    members?: Record<string, SerializedCritterTimedState>
}

function packTimedState(critter: object): SerializedCritterTimedState | null {
    const effects = activeEffects.get(critter) ?? []
    const addicts = addictions.get(critter) ?? []
    const wd = withdrawalApplied.get(critter)
    if (effects.length === 0 && addicts.length === 0 && (!wd || wd.size === 0)) {
        return null
    }
    return {
        effects: effects.map((e) => ({
            drugId: e.drugId,
            expiresAt: e.expiresAt,
            appliedMods: { ...(e.appliedMods ?? {}) },
            radResistBonus: e.radResistBonus ?? 0,
        })),
        addictions: addicts.map((a) => ({ drugId: a.drugId, withdrawing: !!a.withdrawing })),
        withdrawalApplied: wd ? [...wd] : [],
    }
}

function unpackTimedState(critter: object, data: SerializedCritterTimedState): void {
    if (!data) return
    if (Array.isArray(data.effects) && data.effects.length > 0) {
        activeEffects.set(
            critter,
            data.effects.map((e) => ({
                drugId: String(e.drugId),
                expiresAt: typeof e.expiresAt === 'number' ? e.expiresAt : 0,
                appliedMods: { ...(e.appliedMods ?? {}) },
                radResistBonus: typeof e.radResistBonus === 'number' ? e.radResistBonus : 0,
            })),
        )
    }
    if (Array.isArray(data.addictions) && data.addictions.length > 0) {
        addictions.set(
            critter,
            data.addictions.map((a) => ({
                drugId: String(a.drugId),
                withdrawing: !!a.withdrawing,
            })),
        )
    }
    if (Array.isArray(data.withdrawalApplied) && data.withdrawalApplied.length > 0) {
        withdrawalApplied.set(critter, new Set(data.withdrawalApplied.map(String)))
    }
}

/**
 * Snapshot timed chem state for save games.
 * SPECIAL mods are already baked into Critter base stats — this only restores clocks.
 */
export function serializeTimedEffects(): SerializedTimedEffects {
    const out: SerializedTimedEffects = {}
    const player = globalState.player as object | null
    if (player) {
        const packed = packTimedState(player)
        if (packed) out.player = packed
    }
    const party = globalState.gParty
    if (party && typeof party.getPartyMembers === 'function') {
        for (const member of party.getPartyMembers()) {
            const pid = (member as any)?.pid
            if (typeof pid !== 'number') continue
            const packed = packTimedState(member)
            if (!packed) continue
            if (!out.members) out.members = {}
            out.members[String(pid)] = packed
        }
    }
    return out
}

/**
 * Restore timed chem maps onto the live player / party Critters after load.
 * Does not re-apply SPECIAL deltas (saved stats already include them).
 */
export function hydrateTimedEffects(data: SerializedTimedEffects | null | undefined): void {
    resetTimedEffects()
    if (!data || typeof data !== 'object') return
    const player = globalState.player as object | null
    if (player && data.player) {
        unpackTimedState(player, data.player)
    }
    if (data.members && globalState.gParty && typeof globalState.gParty.getPartyMemberByPID === 'function') {
        for (const [key, packed] of Object.entries(data.members)) {
            const pid = Number(key)
            if (!Number.isFinite(pid) || !packed) continue
            const member = globalState.gParty.getPartyMemberByPID(pid)
            if (member) unpackTimedState(member, packed)
        }
    }
}
