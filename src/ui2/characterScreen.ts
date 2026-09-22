/**
 * CharacterScreen — interactive SPECIAL/skills/perks/traits panel.
 *
 * This replaces the non-interactive placeholder. All stat reads go through
 * EntityManager; all writes go through the leveling module.
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_RED, FALLOUT_BLACK, UIColor, cssColor, wrapText, drawUIFontText } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { StatsComponent, SkillsComponent } from '../ecs/components.js'
import { getSkillPointCost } from '../character/leveling.js'
import { getAvailablePerks, grantPerk, PERK_MAP, PERKS, Perk } from '../character/perks.js'
import {
    syncPlayerEntityFromCritter,
    spendCritterSkillPoint,
    ECS_SKILL_TO_DISPLAY,
    recordCritterPerkGrant,
} from '../playerProjection.js'

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
    private selectedPerkId: number | null = null
    private perkScrollOffset = 0

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

    protected override onShow(): void {
        syncPlayerEntityFromCritter()
        // Reset interaction state (keep the remembered tab).
        this.hoveredSkill = null
        this.selectedPerkId = null
        this.perkScrollOffset = 0
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        // Keep sheet aligned with Critter model (combat / chargen / scripts).
        syncPlayerEntityFromCritter()

        const { width, height } = this.bounds

        // Background
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = cssColor(FALLOUT_GREEN)
        ctx.lineWidth = 2
        ctx.strokeRect(1, 1, width - 2, height - 2)

        // Title
        drawUIFontText(ctx, 'CHARACTER', width / 2, 22, FALLOUT_GREEN, 14, { bold: true, align: 'center' })

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
            drawUIFontText(ctx, tab.toUpperCase(), tx + 58, 47, active ? FALLOUT_BLACK : FALLOUT_GREEN, 11, { align: 'center' })
        }

        // Content area
        ctx.save()
        ctx.translate(0, 60)
        if (this.activeTab === 'stats') {this.renderStats(ctx)}
        else if (this.activeTab === 'skills') {this.renderSkills(ctx)}
        else {this.renderPerks(ctx)}
        ctx.restore()

        // Close button
        ctx.fillStyle = '#222'
        ctx.fillRect(width / 2 - 30, height - 34, 60, 22)
        ctx.strokeStyle = cssColor(FALLOUT_GREEN)
        ctx.strokeRect(width / 2 - 30, height - 34, 60, 22)
        drawUIFontText(ctx, 'CLOSE', width / 2, height - 18, FALLOUT_GREEN, 11, { align: 'center' })
    }

    private renderStats(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        if (!stats) {return}

        let y = 20
        for (const { key, label } of SPECIAL_NAMES) {
            const base = stats[key] as number
            const modKey = (key + 'Mod') as keyof StatsComponent
            const mod = (stats[modKey] as number) ?? 0
            const effective = base + mod

            drawUIFontText(ctx, label.padEnd(15), 14, y, FALLOUT_DARK_GRAY, 12)
            drawUIFontText(ctx, String(effective).padStart(3), 160, y, FALLOUT_GREEN, 12)
            if (mod !== 0) {
                drawUIFontText(ctx, `(${mod > 0 ? '+' : ''}${mod})`, 180, y, mod > 0 ? FALLOUT_AMBER : FALLOUT_RED, 12)
            }
            y += 20
        }

        y += 10
        drawUIFontText(ctx, 'DERIVED STATS', 14, y, FALLOUT_DARK_GRAY, 12); y += 20
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
            drawUIFontText(ctx, label.padEnd(10), 14, y, { r: 136, g: 136, b: 136, a: 255 }, 12)
            drawUIFontText(ctx, String(val), 120, y, FALLOUT_GREEN, 12)
            y += 18
        }
    }

    private renderSkills(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
        if (!skills || !stats) {return}

        drawUIFontText(ctx, `Skill Points: ${skills.availablePoints}`, 14, 16, FALLOUT_AMBER, 11)

        let y = 36
        for (const { key, label } of SKILL_NAMES) {
            const value: number = (skills as any)[key]
            const isTagged = skills.tagged.has(key)
            const cost = getSkillPointCost(value, isTagged)
            const canSpend = skills.availablePoints >= cost

            const isHovered = this.hoveredSkill === key

            if (isHovered) {
                ctx.fillStyle = '#1a3a1a'
                ctx.fillRect(10, y - 13, 270, 16)
            }

            drawUIFontText(ctx, (isTagged ? '* ' : '  ') + label.padEnd(16), 14, y, isTagged ? FALLOUT_AMBER : FALLOUT_GREEN, 11)
            drawUIFontText(ctx, String(value).padStart(4) + '%', 200, y, FALLOUT_GREEN, 11)

            if (canSpend && skills.availablePoints > 0) {
                drawUIFontText(ctx, '[+]', 248, y, FALLOUT_AMBER, 11)
            }

            y += 18
        }
    }

    private renderPerks(ctx: OffscreenCanvasRenderingContext2D): void {
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
        const player = EntityManager.get<'player'>(this.playerEntityId, 'player')

        if (!stats || !skills || !player) {
            drawUIFontText(ctx, 'Player components missing.', 14, 40, FALLOUT_RED, 12)
            return
        }

        const currentPerks = new Map<number, number>()
        for (const perkId of player.acquiredPerks) {
            currentPerks.set(perkId, (currentPerks.get(perkId) ?? 0) + 1)
        }

        const available = player.perksAvailable > 0
            ? getAvailablePerks(stats, skills, currentPerks)
            : []
        
        const acquired = PERKS.filter((p) => (currentPerks.get(p.id) ?? 0) > 0)

        // Compile single flat list of items to render
        type ListItem =
            | { type: 'header'; label: string }
            | { type: 'available'; perk: Perk; rank: number }
            | { type: 'acquired'; perk: Perk; rank: number }

        const listItems: ListItem[] = []
        if (player.perksAvailable > 0) {
            listItems.push({ type: 'header', label: `AVAILABLE PERKS (Points: ${player.perksAvailable})` })
            if (available.length === 0) {
                listItems.push({ type: 'header', label: '  No perks available' })
            } else {
                for (const perk of available) {
                    const rank = currentPerks.get(perk.id) ?? 0
                    listItems.push({ type: 'available', perk, rank })
                }
            }
        }

        if (acquired.length > 0) {
            listItems.push({ type: 'header', label: 'ACQUIRED PERKS' })
            for (const perk of acquired) {
                const rank = currentPerks.get(perk.id) ?? 0
                listItems.push({ type: 'acquired', perk, rank })
            }
        } else if (player.perksAvailable === 0) {
            listItems.push({ type: 'header', label: 'NO PERKS ACQUIRED YET' })
        }

        // Clamp scroll offset
        const maxVisible = 7
        const maxScroll = Math.max(0, listItems.length - maxVisible)
        this.perkScrollOffset = Math.max(0, Math.min(this.perkScrollOffset, maxScroll))

        // Set default selected perk if none is selected
        if (this.selectedPerkId === null || !PERK_MAP.has(this.selectedPerkId)) {
            const firstPerk = listItems.find(item => item.type === 'available' || item.type === 'acquired') as { perk: Perk } | undefined
            if (firstPerk) {
                this.selectedPerkId = firstPerk.perk.id
            }
        }

        // Render List Box
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(10, 10, 360, 185)
        ctx.strokeStyle = cssColor(FALLOUT_GREEN)
        ctx.lineWidth = 1
        ctx.strokeRect(10, 10, 360, 185)

        // Render items
        for (let i = this.perkScrollOffset; i < Math.min(listItems.length, this.perkScrollOffset + maxVisible); i++) {
            const item = listItems[i]
            const itemY = 10 + (i - this.perkScrollOffset) * 26 + 3

            if (item.type === 'header') {
                drawUIFontText(ctx, item.label, 20, itemY + 15, FALLOUT_AMBER, 11, { bold: true })
            } else {
                const isSelected = this.selectedPerkId === item.perk.id
                if (isSelected) {
                    ctx.fillStyle = 'rgba(0, 100, 0, 0.2)'
                    ctx.fillRect(12, itemY, 356, 24)
                }

                let displayName = item.perk.name
                if (item.perk.ranks > 1) {
                    displayName += ` (${item.rank}/${item.perk.ranks})`
                }
                drawUIFontText(ctx, displayName, 20, itemY + 16, isSelected ? FALLOUT_AMBER : FALLOUT_GREEN, 12)

                if (item.type === 'available') {
                    drawUIFontText(ctx, '[CHOOSE]', 290, itemY + 16, FALLOUT_AMBER, 11, { bold: true })
                }
            }
        }

        // Scroll indicator
        if (maxScroll > 0) {
            drawUIFontText(ctx, `↑↓ scroll (${this.perkScrollOffset + 1}/${maxScroll + 1})`, 250, 8, FALLOUT_DARK_GRAY, 10)
        }

        // Description Box
        ctx.fillStyle = '#0f0f0f'
        ctx.fillRect(10, 210, 360, 140)
        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.strokeRect(10, 210, 360, 140)

        const selectedPerk = this.selectedPerkId !== null ? PERK_MAP.get(this.selectedPerkId) : null
        if (selectedPerk) {
            drawUIFontText(ctx, selectedPerk.name.toUpperCase(), 20, 230, FALLOUT_AMBER, 12, { bold: true })

            // Prerequisites
            let prereqStr = `Req: Level ${selectedPerk.prerequisites.minLevel ?? 1}`
            if (selectedPerk.prerequisites.minStrength) { prereqStr += `, STR ${selectedPerk.prerequisites.minStrength}` }
            if (selectedPerk.prerequisites.minPerception) { prereqStr += `, PER ${selectedPerk.prerequisites.minPerception}` }
            if (selectedPerk.prerequisites.minEndurance) { prereqStr += `, END ${selectedPerk.prerequisites.minEndurance}` }
            if (selectedPerk.prerequisites.minCharisma) { prereqStr += `, CHA ${selectedPerk.prerequisites.minCharisma}` }
            if (selectedPerk.prerequisites.minIntelligence) { prereqStr += `, INT ${selectedPerk.prerequisites.minIntelligence}` }
            if (selectedPerk.prerequisites.minAgility) { prereqStr += `, AGI ${selectedPerk.prerequisites.minAgility}` }
            if (selectedPerk.prerequisites.minLuck) { prereqStr += `, LCK ${selectedPerk.prerequisites.minLuck}` }
            if (selectedPerk.prerequisites.minSkill) {
                prereqStr += `, ${selectedPerk.prerequisites.minSkill.skill} ${selectedPerk.prerequisites.minSkill.value}%`
            }
            drawUIFontText(ctx, prereqStr, 20, 246, FALLOUT_DARK_GRAY, 11)

            // Font stays set for wrapText's ctx.measureText below.
            ctx.font = '11px monospace'
            const wrapped = wrapText(ctx, selectedPerk.description, 340)
            let descY = 264
            for (const line of wrapped) {
                drawUIFontText(ctx, line, 20, descY, FALLOUT_GREEN, 11)
                descY += 15
            }
        } else {
            drawUIFontText(ctx, 'Select a perk to view details.', 20, 240, FALLOUT_DARK_GRAY, 11)
        }
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
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

        // Skill +1 buttons (only in skills tab) — spend on Critter, then project to ECS.
        if (this.activeTab === 'skills') {
            const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
            if (skills) {
                let sy = 60 + 36  // offset by header and tab area
                for (const { key } of SKILL_NAMES) {
                    if (y >= sy - 13 && y < sy + 3 && x >= 248 && x < 270) {
                        // Mirror the draw condition: [+] is only rendered when
                        // the player can afford the next rank.
                        const value = (skills as any)[key] as number
                        const isTagged = skills.tagged.has(key)
                        const canSpend = skills.availablePoints >= getSkillPointCost(value, isTagged)
                        if (canSpend && skills.availablePoints > 0) {
                            const display = ECS_SKILL_TO_DISPLAY[key]
                            if (display) {
                                spendCritterSkillPoint(display)
                            }
                        }
                        return true
                    }
                    sy += 18
                }
            }
        }

        // Perks selection tab interaction
        if (this.activeTab === 'perks') {
            const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
            const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
            const player = EntityManager.get<'player'>(this.playerEntityId, 'player')

            if (stats && skills && player) {
                const currentPerks = new Map<number, number>()
                for (const perkId of player.acquiredPerks) {
                    currentPerks.set(perkId, (currentPerks.get(perkId) ?? 0) + 1)
                }

                const available = player.perksAvailable > 0
                    ? getAvailablePerks(stats, skills, currentPerks)
                    : []
                const acquired = PERKS.filter((p) => (currentPerks.get(p.id) ?? 0) > 0)

                type ListItem =
                    | { type: 'header'; label: string }
                    | { type: 'available'; perk: Perk; rank: number }
                    | { type: 'acquired'; perk: Perk; rank: number }

                const listItems: ListItem[] = []
                if (player.perksAvailable > 0) {
                    listItems.push({ type: 'header', label: `AVAILABLE PERKS (Points: ${player.perksAvailable})` })
                    if (available.length === 0) {
                        listItems.push({ type: 'header', label: '  No perks available' })
                    } else {
                        for (const perk of available) {
                            const rank = currentPerks.get(perk.id) ?? 0
                            listItems.push({ type: 'available', perk, rank })
                        }
                    }
                }

                if (acquired.length > 0) {
                    listItems.push({ type: 'header', label: 'ACQUIRED PERKS' })
                    for (const perk of acquired) {
                        const rank = currentPerks.get(perk.id) ?? 0
                        listItems.push({ type: 'acquired', perk, rank })
                    }
                } else if (player.perksAvailable === 0) {
                    listItems.push({ type: 'header', label: 'NO PERKS ACQUIRED YET' })
                }

                // Clicks inside the list box relative to y=60
                if (x >= 10 && x < 370 && y >= 70 && y < 255) {
                    const relativeY = y - 60
                    const rowIdx = Math.floor((relativeY - 13) / 26)
                    const maxVisible = 7
                    if (rowIdx >= 0 && rowIdx < maxVisible) {
                        const itemIdx = rowIdx + this.perkScrollOffset
                        if (itemIdx >= 0 && itemIdx < listItems.length) {
                            const item = listItems[itemIdx]
                            if (item.type === 'available' || item.type === 'acquired') {
                                this.selectedPerkId = item.perk.id

                                // Check if click is on the [CHOOSE] affordance
                                // (drawn at x=290; bold 11px mono ≈ 53px wide).
                                if (item.type === 'available' && x >= 288 && x < 348) {
                                    const success = grantPerk(item.perk.id, stats, skills, currentPerks)
                                    if (success) {
                                        player.acquiredPerks.push(item.perk.id)
                                        player.perksAvailable = Math.max(0, player.perksAvailable - 1)
                                        // Critter is source of truth for perk ranks / owed credits.
                                        recordCritterPerkGrant(item.perk.id)
                                    }
                                }
                                return true
                            }
                        }
                    }
                }
            }
        }

        return true  // consume all clicks within the panel
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this.hide()
            return true
        }
        if (this.activeTab === 'perks') {
            if (key === 'ArrowDown') {
                this.perkScrollOffset++
                return true
            }
            if (key === 'ArrowUp') {
                this.perkScrollOffset = Math.max(0, this.perkScrollOffset - 1)
                return true
            }
        }
        return false
    }

    override onMouseMove(x: number, y: number): void {
        // Always clear first so hover state cannot survive a tab switch.
        this.hoveredSkill = null
        if (this.activeTab !== 'skills') {return}
        // x bound matches the drawn highlight rect (10..280).
        if (x < 10 || x >= 280) {return}
        let sy = 96
        for (const { key } of SKILL_NAMES) {
            if (y >= sy - 13 && y < sy + 3) {
                this.hoveredSkill = key
                return
            }
            sy += 18
        }
    }
}

// (cssColor and wrapText now live in uiPanel.ts)
