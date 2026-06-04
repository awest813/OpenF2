/**
 * SaveLoadPanel — WebGL-rendered save/load dialog.
 *
 * Replaces the legacy DOM-based uiSaveLoad() with a ui2 panel that fits
 * into the OffscreenCanvas pipeline.  Displays a scrollable list of up to
 * 10 numbered save slots with map name and player level metadata.
 *
 * Features:
 *  - SAVE / LOAD tab switching without closing the panel
 *  - Inline text input for save names (no window.prompt)
 *  - Inline overwrite confirmation (no window.confirm)
 *  - Hover highlights and keyboard navigation
 *  - Scrollable slot list via arrow keys / scroll
 *  - Zero-padded timestamps via formatSaveDate
 *
 * Panel name: 'saveLoad' (matches the HUD_BUTTONS entry in gamePanel.ts).
 */

import {
    UIPanel,
    FALLOUT_GREEN, FALLOUT_DARK_GREEN, FALLOUT_AMBER,
    FALLOUT_DARK_GRAY, FALLOUT_BLACK, FALLOUT_RED,
    UIColor, cssColor, fillRect, strokeRect, clampListOffset,
} from './uiPanel.js'
import { EventBus } from '../eventBus.js'
import { saveList, formatSaveDate, SaveGame } from '../saveload.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH  = 480
const PANEL_HEIGHT = 400

const SLOT_COUNT   = 10
const VISIBLE_ROWS = 8          // rows visible at once before scrolling kicks in
const SLOT_H       = 32
const SLOT_START_Y = 72         // below header + tabs
const SLOT_PAD_X   = 14

const TAB_W        = 100
const TAB_H        = 24
const TAB_Y        = 36

// Button row at the bottom; name input lives just above it.
const BTN_ROW_Y    = PANEL_HEIGHT - 36
const INPUT_H      = 22
// Input area sits directly below the slot list with a small gap.
const INPUT_AREA_Y = SLOT_START_Y + VISIBLE_ROWS * SLOT_H + 10  // = 338

const ACTION_BTN_W = 80
const ACTION_BTN_H = 24
const CLOSE_BTN_W  = 80
const CLOSE_BTN_H  = 24

const MAX_NAME_LEN = 32

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

type ConfirmState = 'none' | 'pending'

// ---------------------------------------------------------------------------
// SaveLoadPanel
// ---------------------------------------------------------------------------

export class SaveLoadPanel extends UIPanel {
    /** True when the panel is in "save" mode; false for "load". */
    isSave = true
    /** Currently selected slot index (-1 = none). */
    selectedSlot = -1
    /** Currently hovered slot index (-1 = none). */
    private _hoveredSlot = -1
    /** Scroll offset into the slot list. */
    private _scrollOffset = 0
    /** Async save list; populated by loadSaveList(). */
    private _saves: Map<number, SaveGame> = new Map()
    /** True when the async IDB list has returned. */
    private _savesLoaded = false
    /** Set to true when opened via openAs() to prevent onShow() from overriding the mode. */
    private _openedViaOpenAs = false

    // --- Inline name input ---
    private _nameBuffer = ''
    private _inputActive = false  // whether we are capturing character keys

    // --- Overwrite confirmation ---
    private _confirmState: ConfirmState = 'none'
    private _pendingName = ''

    // --- Hover on buttons ---
    private _hoveredTab: 'save' | 'load' | null = null
    private _hoveredAction = false
    private _hoveredClose  = false

    constructor(screenWidth: number, screenHeight: number) {
        super('saveLoad', {
            x: Math.floor((screenWidth - PANEL_WIDTH)  / 2),
            y: Math.floor((screenHeight - PANEL_HEIGHT) / 2),
            width:  PANEL_WIDTH,
            height: PANEL_HEIGHT,
        })
        this.zOrder = 25
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /** Open the panel in save or load mode. */
    openAs(mode: 'save' | 'load'): void {
        this._openedViaOpenAs = true
        this.isSave          = mode === 'save'
        this.selectedSlot    = -1
        this._hoveredSlot    = -1
        this._scrollOffset   = 0
        this._confirmState   = 'none'
        this._pendingName    = ''
        this._inputActive    = false
        this._nameBuffer     = ''
        this._savesLoaded    = false
        this._loadSaveList()
        this.show()
    }

    protected override onShow(): void {
        // When opened via generic ui:openPanel (e.g. HUD SAVE button), default to
        // save mode and refresh the slot list so stale data is never shown.
        // When opened via openAs(), we skip the reset so openAs's mode is preserved.
        if (this._openedViaOpenAs) {
            this._openedViaOpenAs = false
            return
        }
        this.isSave        = true
        this.selectedSlot  = -1
        this._hoveredSlot  = -1
        this._scrollOffset = 0
        this._confirmState = 'none'
        this._inputActive  = false
        this._nameBuffer   = ''
        this._savesLoaded  = false
        this._loadSaveList()
    }

    private _loadSaveList(): void {
        this._savesLoaded = false
        saveList((list) => {
            this._saves.clear()
            for (const s of list) {
                if (s.id !== undefined) {
                    this._saves.set(s.id, s)
                }
            }
            this._savesLoaded = true
        })
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds

        // — Background —
        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, 0, 0, width, height, FALLOUT_GREEN, 2)

        // — Title —
        ctx.font = 'bold 14px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.textAlign = 'center'
        ctx.fillText('GAME MENU', width / 2, 22)
        ctx.textAlign = 'left'

        // — Tabs —
        this._renderTabs(ctx)

        // — Slot list or loading indicator —
        if (!this._savesLoaded) {
            ctx.font = '11px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.textAlign = 'center'
            // Center vertically in the slot list area
            const slotListMidY = SLOT_START_Y + (VISIBLE_ROWS * SLOT_H) / 2
            ctx.fillText('Loading…', width / 2, slotListMidY)
            ctx.textAlign = 'left'
        } else {
            this._renderSlots(ctx)
        }

        // — Name input (save mode + slot selected) —
        if (this.isSave && this.selectedSlot >= 0 && this._savesLoaded) {
            this._renderNameInput(ctx)
        }

        // — Overwrite confirmation overlay —
        if (this._confirmState === 'pending') {
            this._renderConfirmBar(ctx)
        }

        // — Action buttons —
        this._renderButtons(ctx)

        // — Keyboard hint footer —
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.textAlign = 'left'
        ctx.fillText('↑↓ navigate  1–0 jump  Esc close', SLOT_PAD_X, height - 6)
    }

    private _renderTabs(ctx: OffscreenCanvasRenderingContext2D): void {
        const tabSave: [string, boolean, boolean] = ['SAVE', this.isSave,  this._hoveredTab === 'save']
        const tabLoad: [string, boolean, boolean] = ['LOAD', !this.isSave, this._hoveredTab === 'load']

        const tabs = [tabSave, tabLoad]
        const totalW = tabs.length * TAB_W + (tabs.length - 1) * 4
        let tx = Math.floor((this.bounds.width - totalW) / 2)

        for (const [label, active, hovered] of tabs) {
            const bg = active ? FALLOUT_GREEN : hovered ? FALLOUT_DARK_GRAY : FALLOUT_BLACK
            fillRect(ctx, tx, TAB_Y, TAB_W, TAB_H, bg)
            strokeRect(ctx, tx, TAB_Y, TAB_W, TAB_H, FALLOUT_GREEN, 1)
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = active ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_GREEN)
            ctx.textAlign = 'center'
            ctx.fillText(label, tx + TAB_W / 2, TAB_Y + 16)
            ctx.textAlign = 'left'
            tx += TAB_W + 4
        }
    }

    private _renderSlots(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width } = this.bounds
        const slotW = width - SLOT_PAD_X * 2

        for (let row = 0; row < VISIBLE_ROWS; row++) {
            const slotIdx = this._scrollOffset + row
            if (slotIdx >= SLOT_COUNT) {break}

            const y = SLOT_START_Y + row * SLOT_H
            const isSelected = slotIdx === this.selectedSlot
            const isHovered  = slotIdx === this._hoveredSlot && !isSelected
            const slotSave   = this._saves.get(slotIdx)

            // Background
            const bg = isSelected ? FALLOUT_GREEN : isHovered ? FALLOUT_DARK_GRAY : { r: 12, g: 12, b: 12, a: 255 }
            fillRect(ctx, SLOT_PAD_X, y, slotW, SLOT_H - 3, bg)
            strokeRect(ctx, SLOT_PAD_X, y, slotW, SLOT_H - 3, isSelected ? FALLOUT_GREEN : FALLOUT_DARK_GRAY, 1)

            const textColor: UIColor = isSelected ? FALLOUT_BLACK : FALLOUT_GREEN
            const dimColor:  UIColor = isSelected ? FALLOUT_DARK_GREEN : FALLOUT_DARK_GRAY

            // Slot number badge
            const numLabel = String(slotIdx === 9 ? 0 : slotIdx + 1).padStart(2, ' ')
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = cssColor(isSelected ? FALLOUT_BLACK : FALLOUT_DARK_GRAY)
            ctx.fillText(numLabel, SLOT_PAD_X + 4, y + 20)

            if (slotSave) {
                // Name (primary)
                const maxNameChars = 22
                const displayName  = slotSave.name.length > maxNameChars
                    ? slotSave.name.slice(0, maxNameChars - 1) + '…'
                    : slotSave.name
                ctx.font = 'bold 12px monospace'
                ctx.fillStyle = cssColor(textColor)
                ctx.fillText(displayName, SLOT_PAD_X + 28, y + 13)

                // Map + level (secondary)
                const mapName  = slotSave.currentMap ?? '?'
                const mapShort = mapName.length > 14 ? mapName.slice(0, 14) + '…' : mapName
                const levelStr = `Lv.${slotSave.player?.level ?? '?'}`
                ctx.font = '9px monospace'
                ctx.fillStyle = cssColor(dimColor)
                ctx.fillText(`${mapShort}  ${levelStr}`, SLOT_PAD_X + 28, y + 24)

                // Timestamp (right-aligned)
                const dateStr = formatSaveDate(slotSave)
                ctx.font = '9px monospace'
                ctx.fillStyle = cssColor(dimColor)
                ctx.textAlign = 'right'
                ctx.fillText(dateStr, SLOT_PAD_X + slotW - 4, y + 24)
                ctx.textAlign = 'left'
            } else {
                ctx.font = '11px monospace'
                ctx.fillStyle = cssColor(dimColor)
                ctx.fillText('(Empty)', SLOT_PAD_X + 28, y + 19)
            }
        }

        // Scroll indicator
        if (SLOT_COUNT > VISIBLE_ROWS) {
            const from = this._scrollOffset + 1
            const to   = Math.min(this._scrollOffset + VISIBLE_ROWS, SLOT_COUNT)
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.textAlign = 'right'
            ctx.fillText(`${from}–${to} / ${SLOT_COUNT}`, this.bounds.width - SLOT_PAD_X, SLOT_START_Y - 4)
            ctx.textAlign = 'left'

            // Up / Down chevrons
            const chevX = this.bounds.width - SLOT_PAD_X - 14
            if (this._scrollOffset > 0) {
                ctx.fillText('▲', chevX, SLOT_START_Y - 4)
            }
            const canScrollDown = this._scrollOffset + VISIBLE_ROWS < SLOT_COUNT
            if (canScrollDown) {
                ctx.fillText('▼', chevX, SLOT_START_Y + VISIBLE_ROWS * SLOT_H + 4)
            }
        }
    }

    private _renderNameInput(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width } = this.bounds
        const inputX = SLOT_PAD_X
        const inputW = width - SLOT_PAD_X * 2
        const labelY = INPUT_AREA_Y - 8

        // Label
        ctx.font = '9px monospace'
        ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
        ctx.fillText('SAVE NAME:', inputX, labelY)

        // Input box
        const boxBg: UIColor = this._inputActive ? { r: 0, g: 40, b: 0, a: 255 } : FALLOUT_BLACK
        fillRect(ctx, inputX, INPUT_AREA_Y, inputW, INPUT_H, boxBg)
        strokeRect(ctx, inputX, INPUT_AREA_Y, inputW, INPUT_H, this._inputActive ? FALLOUT_GREEN : FALLOUT_DARK_GRAY, 1)

        // Text + blinking cursor
        const cursorStr = this._inputActive && Math.floor(Date.now() / 500) % 2 === 0 ? '|' : ''
        ctx.font = '12px monospace'
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText(this._nameBuffer + cursorStr, inputX + 6, INPUT_AREA_Y + 15)

        // Hint (only when not active, so it doesn't crowd the cursor)
        if (!this._inputActive) {
            ctx.font = '9px monospace'
            ctx.fillStyle = cssColor(FALLOUT_DARK_GRAY)
            ctx.textAlign = 'right'
            ctx.fillText('Click to type', inputX + inputW - 2, labelY)
            ctx.textAlign = 'left'
        }
    }

    private _renderConfirmBar(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width } = this.bounds
        const barH = 40
        const barY = BTN_ROW_Y - barH - 4

        fillRect(ctx, SLOT_PAD_X, barY, width - SLOT_PAD_X * 2, barH, { r: 30, g: 0, b: 0, a: 255 })
        strokeRect(ctx, SLOT_PAD_X, barY, width - SLOT_PAD_X * 2, barH, FALLOUT_RED, 1)

        ctx.font = '11px monospace'
        ctx.fillStyle = cssColor(FALLOUT_AMBER)
        ctx.textAlign = 'center'
        const nameShort = this._pendingName.length > 20 ? this._pendingName.slice(0, 20) + '…' : this._pendingName
        ctx.fillText(`Overwrite "${nameShort}"?`, width / 2, barY + 14)
        ctx.textAlign = 'left'

        // YES button
        fillRect(ctx, width / 2 - 70, barY + 20, 54, 16, FALLOUT_RED)
        strokeRect(ctx, width / 2 - 70, barY + 20, 54, 16, FALLOUT_RED, 1)
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = cssColor(FALLOUT_BLACK)
        ctx.textAlign = 'center'
        ctx.fillText('YES', width / 2 - 70 + 27, barY + 31)

        // NO button
        fillRect(ctx, width / 2 + 16, barY + 20, 54, 16, FALLOUT_DARK_GRAY)
        strokeRect(ctx, width / 2 + 16, barY + 20, 54, 16, FALLOUT_GREEN, 1)
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('NO', width / 2 + 16 + 27, barY + 31)
        ctx.textAlign = 'left'
    }

    private _renderButtons(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width } = this.bounds

        // Action button (SAVE / LOAD)
        const actionLabel  = this.isSave ? 'SAVE' : 'LOAD'
        const actionBtnX   = width / 2 - ACTION_BTN_W - 4
        const canAct       = this.selectedSlot >= 0 && this._confirmState === 'none'
        const actionBg     = canAct
            ? (this._hoveredAction ? FALLOUT_DARK_GREEN : FALLOUT_GREEN)
            : FALLOUT_DARK_GRAY
        fillRect(ctx, actionBtnX, BTN_ROW_Y, ACTION_BTN_W, ACTION_BTN_H, actionBg)
        strokeRect(ctx, actionBtnX, BTN_ROW_Y, ACTION_BTN_W, ACTION_BTN_H, FALLOUT_GREEN, 1)
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = canAct ? cssColor(FALLOUT_BLACK) : cssColor(FALLOUT_DARK_GRAY)
        ctx.textAlign = 'center'
        ctx.fillText(actionLabel, actionBtnX + ACTION_BTN_W / 2, BTN_ROW_Y + 16)

        // Close button
        const closeBtnX    = width / 2 + 4
        const closeBg      = this._hoveredClose ? FALLOUT_DARK_GRAY : FALLOUT_BLACK
        fillRect(ctx, closeBtnX, BTN_ROW_Y, CLOSE_BTN_W, CLOSE_BTN_H, closeBg)
        strokeRect(ctx, closeBtnX, BTN_ROW_Y, CLOSE_BTN_W, CLOSE_BTN_H, FALLOUT_GREEN, 1)
        ctx.fillStyle = cssColor(FALLOUT_GREEN)
        ctx.fillText('CLOSE', closeBtnX + CLOSE_BTN_W / 2, BTN_ROW_Y + 16)
        ctx.textAlign = 'left'
    }

    // -----------------------------------------------------------------------
    // Input
    // -----------------------------------------------------------------------

    override onMouseDown(x: number, y: number, _btn: 'l' | 'r'): boolean {
        const { width } = this.bounds

        // Overwrite confirm buttons take priority
        if (this._confirmState === 'pending') {
            return this._handleConfirmClick(x, y)
        }

        // Tab clicks
        if (y >= TAB_Y && y < TAB_Y + TAB_H) {
            if (this._hitSaveTab(x)) {
                if (!this.isSave) { this._switchMode('save') }
                return true
            }
            if (this._hitLoadTab(x)) {
                if (this.isSave) { this._switchMode('load') }
                return true
            }
        }

        // Name input box click (save mode + slot selected)
        if (this.isSave && this.selectedSlot >= 0) {
            const inputX = SLOT_PAD_X
            const inputW = width - SLOT_PAD_X * 2
            if (x >= inputX && x < inputX + inputW && y >= INPUT_AREA_Y && y < INPUT_AREA_Y + INPUT_H) {
                this._inputActive = true
                return true
            } else {
                this._inputActive = false
            }
        }

        // Slot clicks
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            const slotIdx = this._scrollOffset + row
            if (slotIdx >= SLOT_COUNT) {break}
            const sy = SLOT_START_Y + row * SLOT_H
            if (x >= SLOT_PAD_X && x < width - SLOT_PAD_X && y >= sy && y < sy + SLOT_H - 3) {
                this._selectSlot(slotIdx)
                return true
            }
        }

        // Action button
        const actionBtnX = width / 2 - ACTION_BTN_W - 4
        if (this.selectedSlot >= 0 &&
            x >= actionBtnX && x < actionBtnX + ACTION_BTN_W &&
            y >= BTN_ROW_Y   && y < BTN_ROW_Y + ACTION_BTN_H) {
            this._confirmAction()
            return true
        }

        // Close button
        const closeBtnX = width / 2 + 4
        if (x >= closeBtnX && x < closeBtnX + CLOSE_BTN_W &&
            y >= BTN_ROW_Y  && y < BTN_ROW_Y  + CLOSE_BTN_H) {
            this.hide()
            return true
        }

        return true  // consume all clicks within the panel
    }

    override onMouseMove(x: number, y: number): void {
        const { width } = this.bounds

        // Mouse-exit signal
        if (x < 0 || y < 0) {
            this._hoveredSlot  = -1
            this._hoveredTab   = null
            this._hoveredAction = false
            this._hoveredClose  = false
            return
        }

        // Tab hover
        this._hoveredTab = null
        if (y >= TAB_Y && y < TAB_Y + TAB_H) {
            if (this._hitSaveTab(x)) { this._hoveredTab = 'save' }
            if (this._hitLoadTab(x)) { this._hoveredTab = 'load' }
        }

        // Slot hover
        this._hoveredSlot = -1
        for (let row = 0; row < VISIBLE_ROWS; row++) {
            const slotIdx = this._scrollOffset + row
            if (slotIdx >= SLOT_COUNT) {break}
            const sy = SLOT_START_Y + row * SLOT_H
            if (x >= SLOT_PAD_X && x < width - SLOT_PAD_X && y >= sy && y < sy + SLOT_H - 3) {
                this._hoveredSlot = slotIdx
                break
            }
        }

        // Button hover
        const actionBtnX = width / 2 - ACTION_BTN_W - 4
        this._hoveredAction = (
            x >= actionBtnX && x < actionBtnX + ACTION_BTN_W &&
            y >= BTN_ROW_Y   && y < BTN_ROW_Y + ACTION_BTN_H
        )

        const closeBtnX = width / 2 + 4
        this._hoveredClose = (
            x >= closeBtnX && x < closeBtnX + CLOSE_BTN_W &&
            y >= BTN_ROW_Y  && y < BTN_ROW_Y  + CLOSE_BTN_H
        )
    }

    override onKeyDown(key: string): boolean {
        // Overwrite confirm: Y/N shortcuts
        if (this._confirmState === 'pending') {
            if (key === 'y' || key === 'Y' || key === 'Enter') {
                this._executeSave()
                return true
            }
            if (key === 'n' || key === 'N' || key === 'Escape') {
                this._confirmState = 'none'
                return true
            }
            return true  // swallow everything while confirming
        }

        if (key === 'Escape') {
            this.hide()
            return true
        }

        // Tab toggle
        if (key === 'Tab') {
            this._switchMode(this.isSave ? 'load' : 'save')
            return true
        }

        // Name input capture (save mode + slot selected + input active)
        if (this.isSave && this.selectedSlot >= 0 && this._inputActive) {
            return this._handleNameKey(key)
        }

        // Numeric jump: keys 1–9 and 0 select slots 0–9
        if (/^[0-9]$/.test(key)) {
            const digit = key === '0' ? 9 : parseInt(key) - 1
            if (digit >= 0 && digit < SLOT_COUNT) {
                this._selectSlot(digit)
            }
            return true
        }

        if (key === 'ArrowDown' || key === 'j') {
            const next = this.selectedSlot < 0 ? 0 : Math.min(this.selectedSlot + 1, SLOT_COUNT - 1)
            this._selectSlot(next)
            return true
        }
        if (key === 'ArrowUp' || key === 'k') {
            const prev = this.selectedSlot <= 0 ? 0 : this.selectedSlot - 1
            this._selectSlot(prev)
            return true
        }
        if (key === 'Enter' && this.selectedSlot >= 0) {
            this._confirmAction()
            return true
        }

        return false
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private _selectSlot(idx: number): void {
        this.selectedSlot  = idx
        this._inputActive  = false
        this._confirmState = 'none'
        // Pre-fill name buffer from existing save or default
        const existing     = this._saves.get(idx)
        this._nameBuffer   = existing?.name ?? `Save Slot ${idx + 1}`
        // Ensure selected slot is visible
        this._scrollOffset = clampListOffset(idx, this._scrollOffset, VISIBLE_ROWS)
    }

    private _switchMode(mode: 'save' | 'load'): void {
        this.isSave        = mode === 'save'
        this.selectedSlot  = -1
        this._hoveredSlot  = -1
        this._scrollOffset = 0
        this._confirmState = 'none'
        this._inputActive  = false
        this._nameBuffer   = ''
        this._loadSaveList()
    }

    private _confirmAction(): void {
        if (this.selectedSlot < 0) {return}

        if (this.isSave) {
            const name   = this._nameBuffer.trim() || `Save Slot ${this.selectedSlot + 1}`
            const existing = this._saves.get(this.selectedSlot)
            if (existing) {
                // Show inline overwrite confirmation
                this._pendingName  = name
                this._confirmState = 'pending'
            } else {
                this._pendingName = name
                this._executeSave()
            }
        } else {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            this.hide()
            EventBus.emit('game:loadFromSlot', { slot: this.selectedSlot })
        }
    }

    private _executeSave(): void {
        const slot = this.selectedSlot
        const name = this._pendingName || this._nameBuffer.trim() || `Save Slot ${slot + 1}`
        this._confirmState = 'none'
        EventBus.emit('audio:playSound', { soundId: 'ui_click' })
        this.hide()
        EventBus.emit('game:saveToSlot', { slot, name })
    }

    private _handleConfirmClick(x: number, y: number): boolean {
        const { width } = this.bounds
        const barH  = 40
        const barY  = BTN_ROW_Y - barH - 4
        const yesX  = width / 2 - 70
        const noX   = width / 2 + 16
        const btnY  = barY + 20
        const btnH  = 16
        const btnW  = 54

        if (x >= yesX && x < yesX + btnW && y >= btnY && y < btnY + btnH) {
            this._executeSave()
            return true
        }
        if (x >= noX && x < noX + btnW && y >= btnY && y < btnY + btnH) {
            this._confirmState = 'none'
            return true
        }
        return true  // consume all clicks while confirming
    }

    private _handleNameKey(key: string): boolean {
        if (key === 'Enter') {
            this._inputActive = false
            return true
        }
        if (key === 'Backspace') {
            this._nameBuffer = this._nameBuffer.slice(0, -1)
            return true
        }
        if (key === 'Escape') {
            this._inputActive = false
            return true
        }
        // Only append printable single characters
        if (key.length === 1 && this._nameBuffer.length < MAX_NAME_LEN) {
            this._nameBuffer += key
            return true
        }
        return true  // swallow all keys while input is active
    }

    // --- Tab hit detection ---

    private _tabSaveX(): number {
        const totalW = 2 * TAB_W + 4
        return Math.floor((this.bounds.width - totalW) / 2)
    }

    private _tabLoadX(): number {
        return this._tabSaveX() + TAB_W + 4
    }

    private _hitSaveTab(x: number): boolean {
        const tx = this._tabSaveX()
        return x >= tx && x < tx + TAB_W
    }

    private _hitLoadTab(x: number): boolean {
        const tx = this._tabLoadX()
        return x >= tx && x < tx + TAB_W
    }
}
