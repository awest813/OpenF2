/**
 * Skill check system — d100 rolls against skill values.
 *
 * Used for lockpick, steal, first aid, doctor, science, repair, speech,
 * and any other skill-gated action in the game.
 *
 * Fallout 2 approach:
 *   - Roll 1d100 (1–100). If roll ≤ effective_skill, success.
 *   - "Difficulty" is a flat modifier applied to the effective skill value.
 *   - Effective skill is clamped to 5–95% (always some chance of success/failure).
 */

export interface SkillCheckResult {
    success: boolean
    /** d100 result (1–100). */
    roll: number
    /** Effective skill value after modifiers, clamped 5–95. */
    threshold: number
}

/**
 * Named difficulty modifiers (percentage points added to effective skill).
 *
 * VeryEasy / Easy make checks more likely to succeed; Hard / VeryHard less so.
 */
export const SkillCheckDifficulty = {
    VeryEasy:  40,
    Easy:      20,
    Normal:     0,
    Hard:     -20,
    VeryHard: -40,
} as const

export type SkillCheckDifficultyName = keyof typeof SkillCheckDifficulty

/**
 * Roll a skill check.
 *
 * @param skillValue  - base skill value (0–300)
 * @param modifier    - flat modifier applied to the effective skill (default 0)
 * @returns SkillCheckResult
 */
export function rollSkillCheck(skillValue: number, modifier = 0): SkillCheckResult {
    const threshold = Math.max(5, Math.min(95, skillValue + modifier))
    const roll = Math.floor(Math.random() * 100) + 1
    return { success: roll <= threshold, roll, threshold }
}

/**
 * Roll a skill check with a named difficulty level.
 *
 * @param skillValue    - base skill value (0–300)
 * @param difficulty    - named difficulty modifier
 * @param extraModifier - additional flat modifier stacked on top (default 0)
 * @returns SkillCheckResult
 */
export function rollSkillCheckWithDifficulty(
    skillValue: number,
    difficulty: SkillCheckDifficultyName,
    extraModifier = 0,
): SkillCheckResult {
    const modifier = SkillCheckDifficulty[difficulty] + extraModifier
    return rollSkillCheck(skillValue, modifier)
}

// ---------------------------------------------------------------------------
// Roll result interpretation — Fallout 2 scripting roll_vs_skill / do_check
// ---------------------------------------------------------------------------

/**
 * Roll result codes returned by roll_vs_skill / do_check in the scripting VM.
 *
 * Matches the Fallout 2 ROLL_* constants used by is_success / is_critical.
 */
export const RollResult = {
    CRITICAL_FAILURE: 0,
    FAILURE: 1,
    SUCCESS: 2,
    CRITICAL_SUCCESS: 3,
} as const

export type RollResultValue = typeof RollResult[keyof typeof RollResult]

/**
 * Convert a SkillCheckResult into a Fallout 2 roll-result code (0–3).
 *
 * Critical success: roll is ≤ 10% of effective skill (min 1).
 * Critical failure: natural roll of 96 or higher on a failed check.
 */
export function toRollResult(result: SkillCheckResult): RollResultValue {
    if (result.success) {
        const critThreshold = Math.max(1, Math.floor(result.threshold / 10))
        return result.roll <= critThreshold ? RollResult.CRITICAL_SUCCESS : RollResult.SUCCESS
    } else {
        return result.roll >= 96 ? RollResult.CRITICAL_FAILURE : RollResult.FAILURE
    }
}

/**
 * Returns true when the roll result represents any kind of success.
 */
export function rollResultIsSuccess(rollResult: RollResultValue): boolean {
    return rollResult >= RollResult.SUCCESS
}

/**
 * Returns true when the roll result is critical (either direction).
 */
export function rollResultIsCritical(rollResult: RollResultValue): boolean {
    return rollResult === RollResult.CRITICAL_SUCCESS || rollResult === RollResult.CRITICAL_FAILURE
}
