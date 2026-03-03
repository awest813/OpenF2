/**
 * CharacterScreen — interactive SPECIAL/skills/perks/traits panel.
 *
 * This replaces the non-interactive placeholder. All stat reads go through
 * EntityManager; all writes go through the leveling module.
 */

import { UIPanel, Rect, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_RED, UIColor } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { spendSkillPoint, getSkillPointCost } from '../character/leveling.js'

type TabName = 'stats' | 'skills' | 'perks'

const SPECIAL_NAMES: Array<{ key: keyof StatsComponent; label: string }> = [
    { key: 'strength',    label: 'Strength' },
    { key: 'perception',  label: 'Perception' },
    { key: 'endurance',   label: 'Endurance' },
    { key: 'charisma',    label: 'Charisma' },
    { key: 'intelligence', label: 'Intelligence' },
    { key: 'agility',     label: 'Agility' },
    { key: 'luck',        label: 'Luck' },
]

const SKILL_NAMES: Array<{ key: keyof Omit<SkillsComponent, 'componentType' | 'tagged' | 'availablePoints'>; label: string }> = [
    { key: 'smallGuns',    label: 'Small Guns' },
    { key: 'bigGuns',      label: 'Big Guns' },
    { key: 'energyWeapons', label: 'Energy Weapons' },
    { key: 'unarmed',      label: 'Unarmed' },
    { key: 'meleeWeapons', label: 'Melee Weapons' },
    { key: 'throwing',     label: 'Throwing' },
    { key: 'firstAid',     label: 'First Aid' },
    { key: 'doctor',       label: 'Doctor' },
    { key: 'sneak',        label: 'Sneak' },
    { key: 'lockpick',     label: 'Lockpick' },
    { key: 'steal',        label: 'Steal' },
    { key: 'traps',        label: 'Traps' },
    { key: 'science',      label: 'Science' },
    { key: 'repair',       label: 'Repair' },
    { key: 'speech',       label: 'Speech' },
    { key: 'barter',       label: 'Barter' },
    { key: 'gambling',     label: 'Gambling' },
    { key: 'outdoorsman',  label: 'Outdoorsman' },
]

export class CharacterScreen extends UIPanel {
    private playerEntityId: number
    private activeTab: TabName = 'stats'
    private hoveredSkill: string | null = null

    constructor(screenWidth: number, screenHeight: number, playerEntityId: number) {
        const W = 380
        const H = 480
        super('characterScreen', {
            x: Math.floor((screenWidth - W) / 2),
            y: Math.floor((screenHeight - H) / 2),
            width: W,
            height: H,
        })
        this.playerEntityId = playerEntityId
        this.zOrder = 10
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // Background
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = cssColor(FALLOUT_GREEN)
        ctx.lineWidth = 2
        ctx.strokeRect(1, 1, width - 2, height - 2)

        // Title
        ctx.font = 'bold 14px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CHARACTER', width / 2, 22)

        // Tabs
        const tabs: TabName[] = ['stats', 'skills', 'perks']
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            const tx = 10 + i * 120
            const active = tab === this.activeTab
            ctx.fillStyle = active ? cssColor(FALLOUT_GREEN) : '#222'
            ctx.fillRect(tx, 32, 116, 22)
            ctx.strokeStyle = cssColor(FALLOUT_GREEN)
            ctx.lineWidth = 1
            ctx.strokeRect(tx, 32, 116, 22)
            ctx.font = '11px monospace'
            ctx.fillStyle = active ? '#000' : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(tab.toUpperCase(), tx + 58, 47)
        }
        ctx.textAlign = 'left'

        // Content area
        ctx.save()
        ctx.translate(0, 60)
        if (this.activeTab === 'stats') this.renderStats(ctx)
        else if (this.activeTab === 'skills') this.renderSkills(ctx)
        else this.renderPerks(ctx)
        ctx.restore()

        // Close button
        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#222'
        ctx.fillRect(width / 2 - 30, height - 34, 60, 22)
        ctx.strokeStyle = cssColor(FALLOUT_GREEN)
        ctx.strokeRect(width / 2 - 30, height - 34, 60, 22)
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('CLOSE', width / 2, height - 18)
        ctx.textAlign = 'left'
    }

    private renderStats(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        if (!stats) return

        ctx.font = '12px monospace'
        let y = 20
        for (const { key, label } of SPECIAL_NAMES) {
            const base = stats[key] as number
            const modKey = (key + 'Mod') as keyof StatsComponent
            const mod = (stats[modKey] as number) ?? 0
            const effective = base + mod

            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(label.padEnd(15), 14, y)
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(String(effective).padStart(3), 160, y)
            if (mod !== 0) {
                ctx.fillStyle = mod > 0 ? cssColor(FALLOUT_AMBER) : cssColor(FALLOUT_RED)
                ctx.fillText(`(${mod > 0 ? '+' : ''}${mod})`, 180, y)
            }
            y += 20
        }

        y += 10
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('DERIVED STATS', 14, y); y += 20
        const derived: Array<[string, number | string]> = [
            ['Level',   stats.level],
            ['XP',      `${stats.xp}/${stats.xpToNextLevel}`],
            ['HP',      `${stats.currentHp}/${stats.maxHp}`],
            ['AP',      stats.maxAP],
            ['AC',      stats.armorClass],
            ['Carry',   `${stats.carryWeight} lbs`],
            ['Seq',     stats.sequence],
            ['Heal',    stats.healingRate],
            ['Crit%',   stats.criticalChance],
        ]
        for (const [label, val] of derived) {
            ctx.fillStyle = '#888'
            ctx.fillText(label.padEnd(10), 14, y)
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(String(val), 120, y)
            y += 18
        }
    }

    private renderSkills(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
        if (!skills || !stats) return

        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText(`Skill Points: ${skills.availablePoints}`, 14, 16)

        let y = 36
        for (const { key, label } of SKILL_NAMES) {
            const value: number = (skills as any)[key]
            const isTagged = skills.tagged.has(key)
            const cost = getSkillPointCost(value, isTagged)
            const canSpend = skills.availablePoints >= cost

            const isHovered = this.hoveredSkill === key

            ctx.fillStyle = isHovered ? '#1a3a1a' : 'transparent'
            ctx.fillRect(10, y - 13, 270, 16)

            ctx.fillStyle = isTagged ? cssColor(FALLOUT_AMBER) : cssColor(FALLOUT_GREEN)
            ctx.fillText((isTagged ? '* ' : '  ') + label.padEnd(16), 14, y)
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(String(value).padStart(4) + '%', 200, y)

            if (canSpend && skills.availablePoints > 0) {
                ctx.fillStyle = cssColor(FALLOUT_AMBER)
                ctx.fillText('[+]', 248, y)
            }

            y += 18
        }
    }

    private renderPerks(ctx: OffscreenCanvasRenderingContext2D): void {
        ctx.font = '12px monospace'
        ctx.fillStyle = '#888'
        ctx.fillText('Perk selection coming soon.', 14, 40)
        ctx.fillText('(Phase 1 — perks.ts is defined)', 14, 60)
    }

    override onMouseDown(x: number, y: number, btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Close button
        if (y >= height - 34 && y < height - 12 && x >= width / 2 - 30 && x < width / 2 + 30) {
            this.hide()
            return true
        }

        // Tabs
        const tabs: TabName[] = ['stats', 'skills', 'perks']
        for (let i = 0; i < tabs.length; i++) {
            const tx = 10 + i * 120
            if (x >= tx && x < tx + 116 && y >= 32 && y < 54) {
                this.activeTab = tabs[i]
                return true
            }
        }

        // Skill +1 buttons (only in skills tab)
        if (this.activeTab === 'skills') {
            const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
            const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
            if (skills && stats) {
                let sy = 60 + 36  // offset by header and tab area
                for (const { key } of SKILL_NAMES) {
                    if (y >= sy - 13 && y < sy + 3 && x >= 248 && x < 270) {
                        spendSkillPoint(stats, skills, key)
                        return true
                    }
                    sy += 18
                }
            }
        }

        return true  // consume all clicks within the panel
    }

    override onMouseMove(x: number, y: number): void {
        if (this.activeTab !== 'skills') return
        let sy = 96
        this.hoveredSkill = null
        for (const { key } of SKILL_NAMES) {
            if (y >= sy - 13 && y < sy + 3) {
                this.hoveredSkill = key
                return
            }
            sy += 18
        }
    }
}

function cssColor(c: UIColor): string {
    return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}
