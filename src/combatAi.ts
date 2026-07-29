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

export type AiChemUse =
    | 'clean'
    | 'stims_when_hurt_little'
    | 'stims_when_hurt_lots'
    | 'sometimes'
    | 'anytime'
    | 'always'

export type AiBestWeapon =
    | 'no_pref'
    | 'melee'
    | 'melee_over_ranged'
    | 'ranged_over_melee'
    | 'ranged'
    | 'unarmed'

export function normalizeChemUse(raw: unknown, fallback: AiChemUse = 'clean'): AiChemUse {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    const allowed: AiChemUse[] = [
        'clean',
        'stims_when_hurt_little',
        'stims_when_hurt_lots',
        'sometimes',
        'anytime',
        'always',
    ]
    return (allowed as string[]).includes(key) ? (key as AiChemUse) : fallback
}

export function normalizeBestWeapon(raw: unknown, fallback: AiBestWeapon = 'no_pref'): AiBestWeapon {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    const allowed: AiBestWeapon[] = [
        'no_pref',
        'melee',
        'melee_over_ranged',
        'ranged_over_melee',
        'ranged',
        'unarmed',
    ]
    return (allowed as string[]).includes(key) ? (key as AiBestWeapon) : fallback
}

/** HP ratio threshold below which chem_use should trigger a stim. */
export function chemUseHpRatioThreshold(chemUse: unknown): number | null {
    const mode = normalizeChemUse(chemUse)
    switch (mode) {
        case 'clean':
            return null
        case 'stims_when_hurt_lots':
            return 0.35
        case 'stims_when_hurt_little':
            return 0.65
        case 'sometimes':
            return 0.5
        case 'anytime':
        case 'always':
            return 0.9
    }
}

/** True when best_weapon preference should suppress burst fire. */
export function bestWeaponSuppressesBurst(bestWeapon: unknown): boolean {
    const pref = normalizeBestWeapon(bestWeapon)
    return pref === 'melee' || pref === 'melee_over_ranged' || pref === 'unarmed'
}

export type AiDistance =
    | 'stay_close'
    | 'charge'
    | 'snipe'
    | 'on_your_own'
    | 'stay'

export type AiAreaAttack =
    | 'always'
    | 'sometimes'
    | 'be_sure'
    | 'be_careful'
    | 'be_absolutely_sure'

export function normalizeDistance(raw: unknown, fallback: AiDistance = 'on_your_own'): AiDistance {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    const allowed: AiDistance[] = ['stay_close', 'charge', 'snipe', 'on_your_own', 'stay']
    return (allowed as string[]).includes(key) ? (key as AiDistance) : fallback
}

export function normalizeAreaAttack(raw: unknown, fallback: AiAreaAttack = 'sometimes'): AiAreaAttack {
    if (raw === undefined || raw === null) return fallback
    const key = String(raw).trim().toLowerCase()
    const allowed: AiAreaAttack[] = [
        'always',
        'sometimes',
        'be_sure',
        'be_careful',
        'be_absolutely_sure',
    ]
    return (allowed as string[]).includes(key) ? (key as AiAreaAttack) : fallback
}

/**
 * Should the AI advance toward the target this turn?
 * `stay` never moves; `snipe` only closes if far beyond preferred range;
 * `charge` always closes when out of weapon range.
 */
export function shouldAdvanceOnTarget(
    distanceMode: unknown,
    distanceToTarget: number,
    weaponRange: number
): boolean {
    const mode = normalizeDistance(distanceMode)
    if (mode === 'stay') return false
    if (distanceToTarget <= weaponRange) {
        // Already in range — snipe/stay_close hold; charge may still nudge in.
        return mode === 'charge' && distanceToTarget > Math.max(1, weaponRange - 1)
    }
    // Out of range
    if (mode === 'snipe') {
        // Only close if badly out of range (more than 1.5× weapon range).
        return distanceToTarget > weaponRange * 1.5
    }
    if (mode === 'stay_close') {
        // Close but prefer not sprinting across the map.
        return distanceToTarget <= weaponRange + 8
    }
    return true // charge / on_your_own
}

/**
 * Whether burst/area attack is allowed under area_attack_mode + hit%.
 * `rng` in [0,1) for sometimes/be_careful rolls.
 */
export function allowAreaAttack(
    areaMode: unknown,
    hitPercent: number,
    rng: () => number = Math.random
): boolean {
    const mode = normalizeAreaAttack(areaMode)
    const hit = typeof hitPercent === 'number' && Number.isFinite(hitPercent) ? hitPercent : 50
    switch (mode) {
        case 'always':
            return true
        case 'sometimes':
            return rng() < 0.5
        case 'be_careful':
            return hit >= 50 && rng() < 0.35
        case 'be_sure':
            return hit >= 70
        case 'be_absolutely_sure':
            return hit >= 85
    }
}
