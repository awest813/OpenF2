/**
 * Town reputation, karma titles, and special reputation flags (parity P1-7).
 *
 * Numeric town standings and flag counters live in FO2 GVARs; this module
 * provides tier/title derivation, GVAR↔Reputation sync helpers, and reaction /
 * barter modifiers for the UI and scripting bridges.
 */

import type { Reputation } from './reputation.js'

/** FO2 town-rep display tiers (wiki thresholds). */
export type TownRepTier =
    | 'Idolized'
    | 'Liked'
    | 'Accepted'
    | 'Neutral'
    | 'Antipathy'
    | 'Hated'
    | 'Vilified'

export const TOWN_REP_THRESHOLDS: ReadonlyArray<{ min: number; tier: TownRepTier }> = [
    { min: 30, tier: 'Idolized' },
    { min: 15, tier: 'Liked' },
    { min: 1, tier: 'Accepted' },
    { min: 0, tier: 'Neutral' },
    { min: -14, tier: 'Antipathy' },
    { min: -29, tier: 'Hated' },
    { min: -Infinity, tier: 'Vilified' },
]

export function townRepTier(value: number): TownRepTier {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
    for (const row of TOWN_REP_THRESHOLDS) {
        if (v >= row.min) return row.tier
    }
    return 'Vilified'
}

/** Karma titles — one step every ±250 from Wanderer at 0. */
export type KarmaTitle =
    | 'Savior of the Damned'
    | 'Guardian of the Wastes'
    | 'Shield of Hope'
    | 'Defender'
    | 'Wanderer'
    | 'Betrayer'
    | 'Sword of Despair'
    | 'Scourge of the Wastes'
    | 'Demon Spawn'

const KARMA_TITLES_POS: Array<{ min: number; title: KarmaTitle }> = [
    { min: 1000, title: 'Savior of the Damned' },
    { min: 750, title: 'Guardian of the Wastes' },
    { min: 500, title: 'Shield of Hope' },
    { min: 250, title: 'Defender' },
    { min: 0, title: 'Wanderer' },
]

const KARMA_TITLES_NEG: Array<{ max: number; title: KarmaTitle }> = [
    { max: -1000, title: 'Demon Spawn' },
    { max: -750, title: 'Scourge of the Wastes' },
    { max: -500, title: 'Sword of Despair' },
    { max: -250, title: 'Betrayer' },
]

export function karmaTitle(karma: number): KarmaTitle {
    const k = typeof karma === 'number' && Number.isFinite(karma) ? karma : 0
    if (k >= 0) {
        for (const row of KARMA_TITLES_POS) {
            if (k >= row.min) return row.title
        }
        return 'Wanderer'
    }
    for (const row of KARMA_TITLES_NEG) {
        if (k <= row.max) return row.title
    }
    return 'Wanderer'
}

/** Vanilla FO2 town-rep GVAR indices (VAULT13.GAM). */
export const TOWN_REP_GVARS: Readonly<Record<string, number>> = {
    arroyo: 47,
    klamath: 48,
    the_den: 49,
    vault_city: 50,
    gecko: 51,
    modoc: 52,
    sierra_base: 53,
    broken_hills: 54,
    new_reno: 55,
    redding: 56,
    ncr: 57,
    buried_vault: 58,
    vault_13: 59,
    colusa: 60,
    san_francisco: 61,
    enclave: 62,
    abbey: 63,
    epa: 64,
    primitive_tribe: 65,
    raiders: 66,
    vault_15: 294,
    ghost_farm: 308,
    navarro: 628,
}

export const TOWN_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    arroyo: 'Arroyo',
    klamath: 'Klamath',
    the_den: 'The Den',
    vault_city: 'Vault City',
    gecko: 'Gecko',
    modoc: 'Modoc',
    sierra_base: 'Sierra Army Depot',
    broken_hills: 'Broken Hills',
    new_reno: 'New Reno',
    redding: 'Redding',
    ncr: 'NCR',
    buried_vault: 'Buried Vault',
    vault_13: 'Vault 13',
    colusa: 'Colusa',
    san_francisco: 'San Francisco',
    enclave: 'Enclave',
    abbey: 'Abbey',
    epa: 'EPA',
    primitive_tribe: 'Primitive Tribe',
    raiders: 'Raiders',
    vault_15: 'Vault 15',
    ghost_farm: 'Ghost Farm',
    navarro: 'Navarro',
}

/** Special reputation flag GVARs (non-zero = flag active / count). */
export const REPUTATION_FLAG_GVARS: Readonly<Record<string, number>> = {
    Childkiller: 1,
    Champion: 2,
    Berserker: 3,
    Slaver: 11,
    Betrayer: 42,
}

/** Reverse lookup: GVAR → town id. */
export const GVAR_TO_TOWN: Readonly<Record<number, string>> = Object.fromEntries(
    Object.entries(TOWN_REP_GVARS).map(([id, g]) => [g, id])
)

/** Reverse lookup: GVAR → flag name. */
export const GVAR_TO_FLAG: Readonly<Record<number, string>> = Object.fromEntries(
    Object.entries(REPUTATION_FLAG_GVARS).map(([name, g]) => [g, name])
)

export const GVAR_PLAYER_GOT_CAR = 18

const TOWN_KEY_PREFIX = 'town:'

export function townRepKey(townId: string): string {
    return TOWN_KEY_PREFIX + townId
}

export function parseTownRepKey(key: string): string | null {
    return key.startsWith(TOWN_KEY_PREFIX) ? key.slice(TOWN_KEY_PREFIX.length) : null
}

export function reactionBiasForTier(tier: TownRepTier): number {
    switch (tier) {
        case 'Idolized': return 20
        case 'Liked': return 10
        case 'Accepted': return 5
        case 'Neutral': return 0
        case 'Antipathy': return -5
        case 'Hated': return -15
        case 'Vilified': return -25
    }
}

/**
 * Multiplier applied to merchant ask prices.
 * Better standing → cheaper buys (factor < 1).
 */
export function barterPriceMultiplierForTier(tier: TownRepTier): number {
    switch (tier) {
        case 'Idolized': return 0.85
        case 'Liked': return 0.92
        case 'Accepted': return 0.96
        case 'Neutral': return 1.0
        case 'Antipathy': return 1.08
        case 'Hated': return 1.18
        case 'Vilified': return 1.3
    }
}

/** Heuristic map-name → town id (FO2 map stems). */
export function resolveTownIdFromMapName(mapName: string | null | undefined): string | null {
    if (!mapName || typeof mapName !== 'string') return null
    const n = mapName.toLowerCase().replace(/\\/g, '/').split('/').pop() ?? mapName.toLowerCase()
    const stem = n.replace(/\.(map|gam)$/i, '')

    const rules: Array<[RegExp, string]> = [
        [/^arroyo|^artemple|^arv|^arvill/, 'arroyo'],
        [/^klamath|^klam/, 'klamath'],
        [/^den/, 'the_den'],
        [/^vcity|^vcr|^vcty/, 'vault_city'],
        [/^gecko|^gck/, 'gecko'],
        [/^modoc|^mdc/, 'modoc'],
        [/^sibase|^sierra/, 'sierra_base'],
        [/^broken|^bhill/, 'broken_hills'],
        [/^newr|^nrento|^reno/, 'new_reno'],
        [/^redding|^rdd/, 'redding'],
        [/^ncr/, 'ncr'],
        [/^vault13|^v13/, 'vault_13'],
        [/^vault15|^v15/, 'vault_15'],
        [/^sanfran|^sf/, 'san_francisco'],
        [/^enclave|^enc/, 'enclave'],
        [/^navarro|^nav/, 'navarro'],
        [/^raiders|^raid/, 'raiders'],
        [/^ghost|^slag/, 'ghost_farm'],
        [/^abbey/, 'abbey'],
        [/^epa/, 'epa'],
        [/^colusa/, 'colusa'],
        [/^wasteland|^primitive/, 'primitive_tribe'],
    ]
    for (const [re, id] of rules) {
        if (re.test(stem)) return id
    }
    return null
}

export function getTownRepValue(rep: Reputation, townId: string): number {
    return rep.getReputation(townRepKey(townId))
}

export function setTownRepValue(rep: Reputation, townId: string, value: number): void {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
    rep.setReputation(townRepKey(townId), n)
}

export function changeTownRepValue(rep: Reputation, townId: string, delta: number): void {
    setTownRepValue(rep, townId, getTownRepValue(rep, townId) + delta)
}

/** Active special flags (value !== 0). Childkiller uses count ≥ 1 for display. */
export function listActiveReputationFlags(rep: Reputation): string[] {
    const out: string[] = []
    for (const name of Object.keys(REPUTATION_FLAG_GVARS)) {
        if (rep.getReputation(name) !== 0) out.push(name)
    }
    return out
}

/**
 * Sync Reputation named store when a known town/flag GVAR is written.
 * Returns true when the GVAR was a reputation-related index.
 */
export function syncReputationFromGvar(rep: Reputation | null | undefined, gvar: number, value: unknown): boolean {
    if (!rep || typeof (rep as any).setReputation !== 'function') return false
    const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
    const town = GVAR_TO_TOWN[gvar]
    if (town) {
        setTownRepValue(rep, town, num)
        return true
    }
    const flag = GVAR_TO_FLAG[gvar]
    if (flag) {
        rep.setReputation(flag, num)
        return true
    }
    return false
}

/** Push Reputation town/flag values into a GVAR table (post-load consistency). */
export function pushReputationToGvars(rep: Reputation, globalVars: Record<number, unknown>): void {
    if (!rep || typeof (rep as any).getReputation !== 'function') return
    for (const [townId, gvar] of Object.entries(TOWN_REP_GVARS)) {
        globalVars[gvar] = getTownRepValue(rep, townId)
    }
    for (const [flag, gvar] of Object.entries(REPUTATION_FLAG_GVARS)) {
        globalVars[gvar] = rep.getReputation(flag)
    }
}

/** Pull GVAR town/flag values into Reputation (post-load when GVARs are authoritative). */
export function pullReputationFromGvars(rep: Reputation, globalVars: Record<number, unknown>): void {
    if (!rep || typeof (rep as any).setReputation !== 'function') return
    for (const [townId, gvar] of Object.entries(TOWN_REP_GVARS)) {
        const v = globalVars[gvar]
        if (typeof v === 'number' && Number.isFinite(v)) {
            setTownRepValue(rep, townId, v)
        }
    }
    for (const [flag, gvar] of Object.entries(REPUTATION_FLAG_GVARS)) {
        const v = globalVars[gvar]
        if (typeof v === 'number' && Number.isFinite(v)) {
            rep.setReputation(flag, Math.round(v))
        }
    }
}

export function currentTownStanding(
    rep: Reputation,
    mapName: string | null | undefined
): { townId: string; displayName: string; value: number; tier: TownRepTier } | null {
    const townId = resolveTownIdFromMapName(mapName)
    if (!townId) return null
    const value = getTownRepValue(rep, townId)
    return {
        townId,
        displayName: TOWN_DISPLAY_NAMES[townId] ?? townId,
        value,
        tier: townRepTier(value),
    }
}
