/**
 * Character leveling — XP gain, level-up, skill point allocation.
 *
 * Handles both the per-level stat gains and the perk schedule.
 * Trait "Skilled" and perk "Educated" are integrated here.
 */

import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { recomputeDerivedStats, skillPointsPerLevel, xpForLevel, effectiveStat } from '../ecs/derivedStats.js'
import { EventBus } from '../eventBus.js'

// Fallout 2: player receives a perk every 3 levels
const PERK_EVERY_N_LEVELS = 3

/**
 * Awards XP to the player. If XP reaches the next level threshold,
 * triggers level-up and emits the appropriate events.
 *
 * Returns the number of levels gained (usually 0 or 1).
 */
export function awardXP(
    playerId: number,
    stats: StatsComponent,
    skills: SkillsComponent,
    amount: number,
    hasTraitSkilled: boolean,
    educatedRanks: number,
): number {
    if (amount <= 0) return 0

    stats.xp += amount
    EventBus.emit('player:xpGain', { entityId: playerId, amount, total: stats.xp })

    let levelsGained = 0

    while (stats.xp >= stats.xpToNextLevel) {
        levelUp(playerId, stats, skills, hasTraitSkilled, educatedRanks)
        levelsGained++
    }

    return levelsGained
}

/**
 * Perform one level-up, adjusting all relevant stats and emitting events.
 */
function levelUp(
    playerId: number,
    stats: StatsComponent,
    skills: SkillsComponent,
    hasTraitSkilled: boolean,
    educatedRanks: number,
): void {
    const oldMaxHp = stats.maxHp
    stats.level++
    recomputeDerivedStats(stats)

    // Restore HP by the amount gained from this level-up (recomputeDerivedStats
    // has already updated maxHp; currentHp was capped to the old maxHp by it).
    const hpGain = stats.maxHp - oldMaxHp
    if (hpGain > 0) {
        stats.currentHp = Math.min(stats.currentHp + hpGain, stats.maxHp)
    }

    // Skill points: 5 + 2×INT, +5 from Skilled trait, +2 per Educated rank
    const int = effectiveStat(stats.intelligence, stats.intelligenceMod)
    let sp = skillPointsPerLevel(int)
    if (hasTraitSkilled) sp += 5
    sp += educatedRanks * 2
    skills.availablePoints += sp

    // Perk availability: every 3rd level normally; every 4th with Skilled trait
    const perkInterval = hasTraitSkilled ? 4 : PERK_EVERY_N_LEVELS
    const perksAvailable = stats.level % perkInterval === 0 ? 1 : 0

    EventBus.emit('player:levelUp', { entityId: playerId, newLevel: stats.level, perksAvailable })
}

/**
 * Spend skill points on a skill. Returns true if successful.
 *
 * Costs:
 *  - Non-tagged: skill_level / step  (Fallout 2: step = 1 up to 100, 2 from 101–125, 3 from 126–150, etc.)
 *  - Tagged: half cost
 */
export function spendSkillPoint(
    stats: StatsComponent,
    skills: SkillsComponent,
    skillKey: keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>,
): boolean {
    const current: number = (skills as any)[skillKey]
    const isTagged = skills.tagged.has(skillKey)
    const cost = getSkillPointCost(current, isTagged)

    if (skills.availablePoints < cost) return false
    if (current >= 300) return false  // hard cap

    skills.availablePoints -= cost
    ;(skills as any)[skillKey] = current + 1

    EventBus.emit('player:skillChange', {
        skill: skillKey,
        oldValue: current,
        newValue: current + 1,
    })

    return true
}

/**
 * Cost in skill points to raise a skill from `current` to `current + 1`.
 *
 * Fallout 2 skill cost brackets (untagged):
 *   0–100:   1 pt
 *   101–125: 2 pts
 *   126–150: 3 pts
 *   151–175: 4 pts
 *   176–200: 5 pts
 *   (Tagged skills: half cost, round up)
 */
export function getSkillPointCost(current: number, tagged: boolean): number {
    let cost: number
    if (current < 100)      cost = 1
    else if (current < 125) cost = 2
    else if (current < 150) cost = 3
    else if (current < 175) cost = 4
    else                    cost = 5

    if (tagged) cost = Math.ceil(cost / 2)
    return cost
}
