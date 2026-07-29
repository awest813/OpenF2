/**
 * CharacterCreationPanel — SPECIAL / tags / traits / name (Slice C / P0-1).
 */

import {
    UIPanel,
    FALLOUT_GREEN,
    FALLOUT_AMBER,
    FALLOUT_DARK_GRAY,
    FALLOUT_BLACK,
    FALLOUT_RED,
    cssColor,
    fillRect,
    strokeRect,
} from './uiPanel.js'
import { EventBus } from '../eventBus.js'
import { TRAITS } from '../character/traits.js'
import {
    CharacterCreationData,
    ChargenSkillName,
    CHARGEN_SKILLS,
    CHARGEN_MAX_TRAITS,
    CHARGEN_REQUIRED_TAGS,
    CHARGEN_SPECIAL_MAX,
    CHARGEN_SPECIAL_MIN,
    SPECIAL_KEYS,
    SpecialKey,
    applyCharacterCreation,
    defaultCharacterCreation,
    specialPointsRemaining,
    validateCharacterCreation,
} from '../character/chargen.js'

type Tab = 'special' | 'skills' | 'traits' | 'identity'

const PANEL_W = 520
const PANEL_H = 460

export class CharacterCreationPanel extends UIPanel {
    private _tab: Tab = 'special'
    private _data: CharacterCreationData = defaultCharacterCreation()
    private _error = ''
    private _skillScroll = 0
    private _traitScroll = 0

    constructor(screenWidth: number, screenHeight: number) {
        super('characterCreation', {
            x: Math.floor((screenWidth - PANEL_W) / 2),
            y: Math.floor((screenHeight - PANEL_H) / 2),
            width: PANEL_W,
            height: PANEL_H,
        })
        this.zOrder = 45
    }

    protected override onShow(): void {
        this._data = defaultCharacterCreation()
        this._tab = 'special'
        this._error = ''
        this._skillScroll = 0
        this._traitScroll = 0
    }

    private _adjustSpecial(key: SpecialKey, delta: number): void {
        const cur = this._data.special[key]
        const next = cur + delta
        if (next < CHARGEN_SPECIAL_MIN || next > CHARGEN_SPECIAL_MAX) return
        if (delta > 0 && specialPointsRemaining(this._data.special) <= 0) return
        this._data.special[key] = next
        this._error = ''
    }

    private _toggleSkill(skill: ChargenSkillName): void {
        const idx = this._data.taggedSkills.indexOf(skill)
        if (idx >= 0) {
            this._data.taggedSkills.splice(idx, 1)
        } else if (this._data.taggedSkills.length < CHARGEN_REQUIRED_TAGS) {
            this._data.taggedSkills.push(skill)
        }
        this._error = ''
    }

    private _toggleTrait(id: number): void {
        const idx = this._data.traitIds.indexOf(id)
        if (idx >= 0) {
            this._data.traitIds.splice(idx, 1)
        } else if (this._data.traitIds.length < CHARGEN_MAX_TRAITS) {
            this._data.traitIds.push(id)
        }
        this._error = ''
    }

    private _done(): void {
        const result = applyCharacterCreation(this._data)
        if (!result.ok) {
            this._error = result.errors[0] ?? 'Invalid character'
            return
        }
        this.hide()
        EventBus.emit('game:characterCreated', {
            name: this._data.name.trim(),
            mapName: 'artemple',
        })
    }

    private _cancel(): void {
        this.hide()
        EventBus.emit('ui:openPanel', { panelName: 'mainMenu' })
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        ctx.font = 'bold 14px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('CHARACTER CREATION', width / 2, 22)
        ctx.textAlign = 'left'

        const tabs: Tab[] = ['special', 'skills', 'traits', 'identity']
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            const tx = 12 + i * 124
            const active = tab === this._tab
            fillRect(ctx, tx, 34, 118, 22, active ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, tx, 34, 118, 22, FALLOUT_GREEN, 1)
            ctx.font = '11px monospace'
            ctx.fillStyle = active ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(tab.toUpperCase(), tx + 59, 49)
        }
        ctx.textAlign = 'left'

        ctx.save()
        ctx.translate(0, 64)
        if (this._tab === 'special') this._renderSpecial(ctx)
        else if (this._tab === 'skills') this._renderSkills(ctx)
        else if (this._tab === 'traits') this._renderTraits(ctx)
        else this._renderIdentity(ctx)
        ctx.restore()

        // Footer buttons
        fillRect(ctx, 20, height - 40, 100, 26, FALLOUT_DARK_GRAY)
        strokeRect(ctx, 20, height - 40, 100, 26, FALLOUT_GREEN, 1)
        fillRect(ctx, width - 120, height - 40, 100, 26, FALLOUT_GREEN)
        strokeRect(ctx, width - 120, height - 40, 100, 26, FALLOUT_GREEN, 1)
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('CANCEL', 70, height - 22)
        ctx.fillStyle = cssColor(FALLOUT_BLACK)
        ctx.fillText('DONE', width - 70, height - 22)
        ctx.textAlign = 'left'

        if (this._error) {
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_RED)
            ctx.fillText(this._error, 140, height - 22)
        }
    }

    private _renderSpecial(ctx: OffscreenCanvasRenderingContext2D): void {
        const remaining = specialPointsRemaining(this._data.special)
        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText(`Points remaining: ${remaining}`, 16, 16)

        let y = 40
        for (const key of SPECIAL_KEYS) {
            const val = this._data.special[key]
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.fillText(key.padEnd(4), 16, y)
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText(String(val).padStart(2), 70, y)

            // - / + hit targets drawn as labels
            fillRect(ctx, 110, y - 12, 22, 18, FALLOUT_DARK_GRAY)
            strokeRect(ctx, 110, y - 12, 22, 18, FALLOUT_GREEN, 1)
            fillRect(ctx, 138, y - 12, 22, 18, FALLOUT_DARK_GRAY)
            strokeRect(ctx, 138, y - 12, 22, 18, FALLOUT_GREEN, 1)
            ctx.textAlign = 'center'
            ctx.fillStyle = cssColor(FALLOUT_GREEN)
            ctx.fillText('-', 121, y)
            ctx.fillText('+', 149, y)
            ctx.textAlign = 'left'
            y += 28
        }

        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('Distribute 40 SPECIAL points (1–10 each).', 200, 40)
        ctx.fillText('Then tag 3 skills and optionally pick traits.', 200, 58)
    }

    private _renderSkills(ctx: OffscreenCanvasRenderingContext2D): void {
        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText(
            `Tagged ${this._data.taggedSkills.length}/${CHARGEN_REQUIRED_TAGS}`,
            16,
            16,
        )

        const visible = 12
        const maxScroll = Math.max(0, CHARGEN_SKILLS.length - visible)
        this._skillScroll = Math.min(this._skillScroll, maxScroll)

        let y = 40
        for (let i = this._skillScroll; i < this._skillScroll + visible && i < CHARGEN_SKILLS.length; i++) {
            const skill = CHARGEN_SKILLS[i]
            const tagged = this._data.taggedSkills.includes(skill)
            fillRect(ctx, 12, y - 12, 300, 20, tagged ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, 12, y - 12, 300, 20, FALLOUT_GREEN, 1)
            ctx.fillStyle = tagged ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.fillText((tagged ? '* ' : '  ') + skill, 20, y)
            y += 24
        }
    }

    private _renderTraits(ctx: OffscreenCanvasRenderingContext2D): void {
        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.fillText(`Traits ${this._data.traitIds.length}/${CHARGEN_MAX_TRAITS}`, 16, 16)

        const visible = 10
        const maxScroll = Math.max(0, TRAITS.length - visible)
        this._traitScroll = Math.min(this._traitScroll, maxScroll)

        let y = 40
        for (let i = this._traitScroll; i < this._traitScroll + visible && i < TRAITS.length; i++) {
            const trait = TRAITS[i]
            const on = this._data.traitIds.includes(trait.id)
            fillRect(ctx, 12, y - 12, 480, 20, on ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
            strokeRect(ctx, 12, y - 12, 480, 20, FALLOUT_GREEN, 1)
            ctx.fillStyle = on ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.fillText((on ? '* ' : '  ') + trait.name, 20, y)
            y += 24
        }

        const selected = TRAITS.find((t) => t.id === this._data.traitIds[this._data.traitIds.length - 1])
        if (selected) {
            ctx.fillStyle = cssColor(FALLOUT_AMBER)
            ctx.fillText(selected.description.slice(0, 70), 16, 320)
        }
    }

    private _renderIdentity(ctx: OffscreenCanvasRenderingContext2D): void {
        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText(`Name: ${this._data.name}_`, 16, 30)
        ctx.fillText('(type to edit name)', 16, 50)

        ctx.fillText(`Age: ${this._data.age}`, 16, 90)
        fillRect(ctx, 100, 76, 22, 18, FALLOUT_DARK_GRAY)
        strokeRect(ctx, 100, 76, 22, 18, FALLOUT_GREEN, 1)
        fillRect(ctx, 128, 76, 22, 18, FALLOUT_DARK_GRAY)
        strokeRect(ctx, 128, 76, 22, 18, FALLOUT_GREEN, 1)
        ctx.textAlign = 'center'
        ctx.fillText('-', 111, 90)
        ctx.fillText('+', 139, 90)
        ctx.textAlign = 'left'

        ctx.fillText(`Gender: ${this._data.gender}`, 16, 130)
        fillRect(ctx, 120, 116, 70, 20, this._data.gender === 'male' ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
        strokeRect(ctx, 120, 116, 70, 20, FALLOUT_GREEN, 1)
        fillRect(ctx, 200, 116, 80, 20, this._data.gender === 'female' ? FALLOUT_GREEN : FALLOUT_DARK_GRAY)
        strokeRect(ctx, 200, 116, 80, 20, FALLOUT_GREEN, 1)
        ctx.textAlign = 'center'
        ctx.fillStyle = this._data.gender === 'male' ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
        ctx.fillText('MALE', 155, 130)
        ctx.fillStyle = this._data.gender === 'female' ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
        ctx.fillText('FEMALE', 240, 130)
        ctx.textAlign = 'left'

        const v = validateCharacterCreation(this._data)
        ctx.fillStyle = cssColor(v.ok ? FALLOUT_AMBER : FALLOUT_RED)
        ctx.fillText(v.ok ? 'Ready — press DONE to enter the Temple of Trials.' : v.errors[0], 16, 180)
    }

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width, height } = this.bounds

        // Tabs
        const tabs: Tab[] = ['special', 'skills', 'traits', 'identity']
        for (let i = 0; i < tabs.length; i++) {
            const tx = 12 + i * 124
            if (x >= tx && x < tx + 118 && y >= 34 && y < 56) {
                this._tab = tabs[i]
                return true
            }
        }

        // Footer
        if (y >= height - 40 && y < height - 14) {
            if (x >= 20 && x < 120) {
                this._cancel()
                return true
            }
            if (x >= width - 120 && x < width - 20) {
                this._done()
                return true
            }
        }

        const ly = y - 64 // content local y
        if (this._tab === 'special' && ly >= 28) {
            let row = 0
            for (const key of SPECIAL_KEYS) {
                const rowY = 40 + row * 28
                if (ly >= rowY - 12 && ly < rowY + 6) {
                    if (x >= 110 && x < 132) this._adjustSpecial(key, -1)
                    if (x >= 138 && x < 160) this._adjustSpecial(key, 1)
                    return true
                }
                row++
            }
        }

        if (this._tab === 'skills' && ly >= 28) {
            const visible = 12
            for (let i = 0; i < visible; i++) {
                const idx = this._skillScroll + i
                if (idx >= CHARGEN_SKILLS.length) break
                const rowY = 40 + i * 24
                if (ly >= rowY - 12 && ly < rowY + 8 && x >= 12 && x < 312) {
                    this._toggleSkill(CHARGEN_SKILLS[idx])
                    return true
                }
            }
        }

        if (this._tab === 'traits' && ly >= 28) {
            const visible = 10
            for (let i = 0; i < visible; i++) {
                const idx = this._traitScroll + i
                if (idx >= TRAITS.length) break
                const rowY = 40 + i * 24
                if (ly >= rowY - 12 && ly < rowY + 8 && x >= 12 && x < 492) {
                    this._toggleTrait(TRAITS[idx].id)
                    return true
                }
            }
        }

        if (this._tab === 'identity') {
            if (ly >= 76 && ly < 94) {
                if (x >= 100 && x < 122) this._data.age = Math.max(16, this._data.age - 1)
                if (x >= 128 && x < 150) this._data.age = Math.min(35, this._data.age + 1)
                return true
            }
            if (ly >= 116 && ly < 136) {
                if (x >= 120 && x < 190) this._data.gender = 'male'
                if (x >= 200 && x < 280) this._data.gender = 'female'
                return true
            }
        }

        return true
    }

    override onKeyDown(key: string): boolean {
        if (key === 'Escape') {
            this._cancel()
            return true
        }
        if (this._tab === 'skills') {
            if (key === 'ArrowDown') {
                this._skillScroll = Math.min(this._skillScroll + 1, Math.max(0, CHARGEN_SKILLS.length - 12))
                return true
            }
            if (key === 'ArrowUp') {
                this._skillScroll = Math.max(0, this._skillScroll - 1)
                return true
            }
        }
        if (this._tab === 'traits') {
            if (key === 'ArrowDown') {
                this._traitScroll = Math.min(this._traitScroll + 1, Math.max(0, TRAITS.length - 10))
                return true
            }
            if (key === 'ArrowUp') {
                this._traitScroll = Math.max(0, this._traitScroll - 1)
                return true
            }
        }
        if (this._tab === 'identity') {
            if (key === 'Backspace') {
                this._data.name = this._data.name.slice(0, -1)
                return true
            }
            if (key.length === 1 && /[a-zA-Z0-9 .-]/.test(key) && this._data.name.length < 24) {
                this._data.name += key
                return true
            }
        }
        if (key === 'Enter' && this._tab === 'identity') {
            this._done()
            return true
        }
        return true
    }
}
