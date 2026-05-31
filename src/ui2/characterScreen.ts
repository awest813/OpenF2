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
import { getAvailablePerks, grantPerk, PERK_MAP, PERKS, Perk } from '../character/perks.js'

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
    private perkScrollOffset: number = 0

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
        if (this.activeTab === 'stats') {this.renderStats(ctx)}
        else if (this.activeTab === 'skills') {this.renderSkills(ctx)}
        else {this.renderPerks(ctx)}
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
        if (!stats) {return}

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
        if (!skills || !stats) {return}

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

            if (isHovered) {
                ctx.fillStyle = '#1a3a1a'
                ctx.fillRect(10, y - 13, 270, 16)
            }

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
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const skills = EntityManager.get<'skills'>(this.playerEntityId, 'skills')
        const player = EntityManager.get<'player'>(this.playerEntityId, 'player')

        if (!stats || !skills || !player) {
            ctx.fillStyle = cssColor(FALLOUT_RED)
            ctx.font = '12px monospace'
            ctx.fillText('Player components missing.', 14, 40)
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
                ctx.font = 'bold 11px monospace'
                ctx.fillStyle = cssColor(FALLOUT_AMBER)
                ctx.fillText(item.label, 20, itemY + 15)
            } else {
                const isSelected = this.selectedPerkId === item.perk.id
                if (isSelected) {
                    ctx.fillStyle = 'rgba(0, 100, 0, 0.2)'
                    ctx.fillRect(12, itemY, 356, 24)
                }

                ctx.font = '12px monospace'
                ctx.fillStyle = isSelected ? cssColor(FALLOUT_AMBER) : cssColor(FALLOUT_GREEN)

                let displayName = item.perk.name
                if (item.perk.ranks > 1) {
                    displayName += ` (${item.rank}/${item.perk.ranks})`
                }
                ctx.fillText(displayName, 20, itemY + 16)

                if (item.type === 'available') {
                    ctx.fillStyle = cssColor(FALLOUT_AMBER)
                    ctx.font = 'bold 11px monospace'
                    ctx.fillText('[CHOOSE]', 290, itemY + 16)
                }
            }
        }

        // Scroll indicator
        if (maxScroll > 0) {
            ctx.font = '10px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(`↑↓ scroll (${this.perkScrollOffset + 1}/${maxScroll + 1})`, 250, 8)
        }

        // Description Box
        ctx.fillStyle = '#0f0f0f'
        ctx.fillRect(10, 210, 360, 140)
        ctx.strokeStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.strokeRect(10, 210, 360, 140)

        const selectedPerk = this.selectedPerkId !== null ? PERK_MAP.get(this.selectedPerkId) : null
        if (selectedPerk) {
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = cssColor(FALLOUT_AMBER)
            ctx.fillText(selectedPerk.name.toUpperCase(), 20, 230)

            // Prerequisites
            let prereqStr = `Req: Level ${selectedPerk.prerequisites.minLevel ?? 1}`
            if (selectedPerk.prerequisites.minStrength) prereqStr += `, STR ${selectedPerk.prerequisites.minStrength}`
            if (selectedPerk.prerequisites.minPerception) prereqStr += `, PER ${selectedPerk.prerequisites.minPerception}`
            if (selectedPerk.prerequisites.minEndurance) prereqStr += `, END ${selectedPerk.prerequisites.minEndurance}`
            if (selectedPerk.prerequisites.minCharisma) prereqStr += `, CHA ${selectedPerk.prerequisites.minCharisma}`
            if (selectedPerk.prerequisites.minIntelligence) prereqStr += `, INT ${selectedPerk.prerequisites.minIntelligence}`
            if (selectedPerk.prerequisites.minAgility) prereqStr += `, AGI ${selectedPerk.prerequisites.minAgility}`
            if (selectedPerk.prerequisites.minLuck) prereqStr += `, LCK ${selectedPerk.prerequisites.minLuck}`
            if (selectedPerk.prerequisites.minSkill) {
                prereqStr += `, ${selectedPerk.prerequisites.minSkill.skill} ${selectedPerk.prerequisites.minSkill.value}%`
            }
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(prereqStr, 20, 246)

            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            const wrapped = wrapText(ctx, selectedPerk.description, 340)
            let descY = 264
            for (const line of wrapped) {
                ctx.fillText(line, 20, descY)
                descY += 15
            }
        } else {
            ctx.font = 'italic 11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText('Select a perk to view details.', 20, 240)
        }
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

                                // Check if click is on [CHOOSE] button region
                                if (item.type === 'available' && x >= 280 && x < 360) {
                                    const success = grantPerk(item.perk.id, stats, skills, currentPerks)
                                    if (success) {
                                        player.acquiredPerks.push(item.perk.id)
                                        player.perksAvailable = Math.max(0, player.perksAvailable - 1)
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
        if (this.activeTab !== 'skills') {return}
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

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if (currentLine) {
        lines.push(currentLine)
    }
    return lines
}
