/**
 * AI.TXT packet field helpers (parity P1-1).
 *
 * Normalizes string/numeric packet values and derives flee / targeting policy
 * used by Combat.findTarget and Combat.doAITurn.
 */

export type AiAttackWho =
    | 'whomever_attacking_me'
    | 'strongest'
    | 'weakest'
    | 'whomever'
    | 'closest'

export type AiRunAwayMode =
    | 'none'
    | 'coward'
    | 'finger_hurts'
    | 'bleeding'
    | 'not_feeling_good'
    | 'tourniquet'
    | 'never'

/** Damage-% thresholds used by FO2 run_away_mode (flee when HP ≤ max − max×pct/100). */
export const RUN_AWAY_DAMAGE_PCT: Readonly<Record<AiRunAwayMode, number | null>> = {
    none: null, // use min_hp only
    coward: 0,
    finger_hurts: 25,
    bleeding: 40,
    not_feeling_good: 60,
    tourniquet: 75,
    never: 100, // only at 0 HP
}

const ATTACK_WHO_ALIASES: Record<string, AiAttackWho> = {
    whomever_attacking_me: 'whomever_attacking_me',
    strongest: 'strongest',
    weakest: 'weakest',
    whomever: 'whomever',
    closest: 'closest',
    '0': 'whomever_attacking_me',
    '1': 'strongest',
    '2': 'weakest',
    '3': 'whomever',
    '4': 'closest',
}

const RUN_AWAY_ALIASES: Record<string, AiRunAwayMode> = {
    none: 'none',
    coward: 'coward',
    finger_hurts: 'finger_hurts',
    bleeding: 'bleeding',
    not_feeling_good: 'not_feeling_good',
    tourniquet: 'tourniquet',
    never: 'never',
    // Engine stores none as -1 after parse decrement
    '-1': 'none',
    '0': 'coward',
    '1': 'finger_hurts',
    '2': 'bleeding',
    '3': 'not_feeling_good',
    '4': 'tourniquet',
    '5': 'never',
}

export function normalizeAttackWho(raw: unknown, fallback: AiAttackWho = 'closest'): AiAttackWho {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    return ATTACK_WHO_ALIASES[key] ?? fallback
}

export function normalizeRunAwayMode(raw: unknown, fallback: AiRunAwayMode = 'none'): AiRunAwayMode {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    return RUN_AWAY_ALIASES[key] ?? fallback
}

/**
 * HP at-or-below which the critter should flee.
 * Combines AI.TXT `min_hp` with `run_away_mode` damage threshold (FO2-style).
 */
export function fleeHpThreshold(maxHp: number, minHp: number, runAwayMode: unknown): number {
    const max = typeof maxHp === 'number' && Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0
    const min = typeof minHp === 'number' && Number.isFinite(minHp) ? Math.max(0, minHp) : 0
    const mode = normalizeRunAwayMode(runAwayMode, 'none')
    if (mode === 'never') {
        // Party/AI "never" — only flee at 0 HP (ignore min_hp floor).
        return 0
    }
    const pct = RUN_AWAY_DAMAGE_PCT[mode]
    if (pct === null) {
        return min
    }
    const fromMode = Math.floor(max - (max * pct) / 100)
    return Math.max(min, fromMode)
}

export function parseAiInt(raw: unknown, fallback: number): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
    if (typeof raw === 'string' && raw.trim() !== '') {
        const n = parseInt(raw, 10)
        if (Number.isFinite(n)) return n
    }
    return fallback
}

/** Whether an AI should attempt a called/aimed shot this attack. */
export function shouldAttemptCalledShot(calledFreq: unknown, rng: () => number = Math.random): boolean {
    const freq = parseAiInt(calledFreq, 0)
    if (freq <= 0) return false
    // FO2-ish: higher called_freq → more aimed shots (cap at 50%).
    const chance = Math.min(50, Math.max(0, freq))
    return Math.floor(rng() * 100) < chance
}
