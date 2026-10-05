/**
 * GamePanel — the bottom interface bar, laid out like Fallout 2's iface
 * (interface.cc / display_monitor.cc) on its 640×99 grid, centred on wider
 * screens:
 *
 *  - display monitor (23,24 167×60): message lines with a • knob, 100-line
 *    history, click the top/bottom half to scroll
 *  - change hands (218,6), INV (211,40), OPTIONS (210,61)
 *  - item button (267,26 188×67): weapon, action (PUNCH/KICK/SWING/THRUST/
 *    THROW/SINGLE/BURST/RELOAD), aimed bullseye, AP cost; left click arms
 *    the attack cursor, right click cycles the action
 *  - ammo bar beside the item button
 *  - 10 AP lights (316,14): green AP, yellow free move, all red between the
 *    player's turns, dark out of combat
 *  - HP counter (473,40) white / yellow < 50% / red < 25%; AC counter (473,75)
 *  - SKILLDEX (523,6), MAP (526,39), CHA (526,58), PIP (526,77)
 *  - END TURN (590,43) and END COMBAT (590,65) while in combat
 *
 * Keys follow game.cc / combat.cc: A start combat, N cycle item action,
 * B change hands, C character, I inventory, O / Esc options, P Pip-Boy,
 * S Skilldex, Tab automap, Space end turn, Enter end combat.
 */

import { UIPanel, FALLOUT_GREEN, FALLOUT_RED, FALLOUT_AMBER, FALLOUT_DARK_GRAY, FALLOUT_BLACK, UIColor, fillRect, strokeRect, drawUIFontText } from './uiPanel.js'
import { EntityManager } from '../ecs/entityManager.js'
import { EventBus } from '../eventBus.js'
import { getMessage } from '../util.js'
import { loadPRO } from '../pro.js'
import globalState from '../globalState.js'
import { syncPlayerEntityFromCritter, readPlayerHudSnapshot } from '../playerProjection.js'
import { attackApCostFor, getAttackWeaponInfo } from '../combat/attackInfo.js'
import { reloadApCost } from '../combat/fo2Formulas.js'
import { reloadWeaponFully } from '../combat/ammo.js'
import { PerkId, perkRank } from '../character/perkIds.js'

const PANEL_HEIGHT = 99
const BAR_WIDTH = 640

/** display_monitor.cc */
const MONITOR = { x: 23, y: 24, w: 167, h: 60 }
const MONITOR_CAPACITY = 100
const MONITOR_LINE_HEIGHT = 10
const MONITOR_VISIBLE_LINES = Math.floor(MONITOR.h / MONITOR_LINE_HEIGHT)
/** Characters that fit one monitor line in font 101. */
const MONITOR_LINE_CHARS = 30
const MONITOR_KNOB = '•'

const WHITE: UIColor = { r: 255, g: 255, b: 255, a: 255 }
const YELLOW: UIColor = { r: 252, g: 252, b: 124, a: 255 }
const LIGHT_GREEN: UIColor = { r: 0, g: 255, b: 0, a: 255 }
const LIGHT_YELLOW: UIColor = { r: 255, g: 255, b: 0, a: 255 }
const LIGHT_RED: UIColor = { r: 255, g: 0, b: 0, a: 255 }
const LIGHT_OFF: UIColor = { r: 30, g: 30, b: 30, a: 255 }

interface BarButton {
    id: string
    label: string
    x: number
    y: number
    w: number
    h: number
    /** Panel opened (and openAs mode), or null for an action. */
    panel?: string
    openAs?: string
}

/** interface.cc buttonCreate positions. */
const BAR_BUTTONS: BarButton[] = [
    { id: 'hands', label: 'L/R', x: 218, y: 6, w: 22, h: 21 },
    { id: 'inventory', label: 'INV', x: 211, y: 40, w: 32, h: 21, panel: 'inventory' },
    { id: 'options', label: 'OPT', x: 210, y: 61, w: 34, h: 34, panel: 'options' },
    { id: 'skilldex', label: 'SKL', x: 523, y: 6, w: 22, h: 21, panel: 'skilldex' },
    { id: 'map', label: 'MAP', x: 526, y: 39, w: 41, h: 19, panel: 'pipboy', openAs: 'map' },
    { id: 'character', label: 'CHA', x: 526, y: 58, w: 41, h: 19, panel: 'characterScreen' },
    { id: 'pipboy', label: 'PIP', x: 526, y: 77, w: 41, h: 19, panel: 'pipboy' },
]

const ITEM_BUTTON = { x: 267, y: 26, w: 188, h: 67 }
const AMMO_BAR = { x: 463, y: 26, w: 4, h: 70 }
const AP_LIGHTS = { x: 316, y: 14, size: 5, stride: 9, count: 10 }
const HP_COUNTER = { x: 473, y: 40 }
const AC_COUNTER = { x: 473, y: 75 }
const END_TURN = { x: 590, y: 43, w: 38, h: 22 }
const END_COMBAT = { x: 590, y: 65, w: 38, h: 22 }

/** Interface label for a proto attack mode (interface.cc). */
const ACTION_LABELS: Record<number, string> = {
    1: 'PUNCH', 2: 'KICK', 3: 'SWING', 4: 'THRUST', 5: 'THROW', 6: 'SINGLE', 7: 'BURST', 8: 'BURST',
}

/**
 * Resolve a prototype ID to a human-readable item name. Falls back to a
 * formatted `PID:0xHEX` string when the prototype data is unavailable.
 */
function getItemName(pid: number | null | undefined): string {
    if (pid == null) {return 'None'}
    const pidID = pid & 0xffff
    const pro: any = loadPRO(pid, pidID)
    if (pro != null && typeof pro.textID === 'number') {
        const name = getMessage('pro_item', pro.textID)
        if (name) {return name}
    }
    return `PID:0x${pid.toString(16).toUpperCase().padStart(8, '0')}`
}

/** Word-wrap one monitor message; the first line carries the knob. */
export function wrapMonitorMessage(text: string, width = MONITOR_LINE_CHARS): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = MONITOR_KNOB
    for (const word of words) {
        const candidate = line === MONITOR_KNOB ? line + word : line + ' ' + word
        if (candidate.length > width && line.length > 0 && line !== MONITOR_KNOB) {
            lines.push(line)
            line = word
        } else {
            line = candidate
        }
    }
    if (line) {lines.push(line)}
    return lines
}

/** HP counter colour (interfaceRenderHitPoints): red < 25%, yellow < 50%. */
export function hitPointsColor(hp: number, maxHp: number): 'red' | 'yellow' | 'white' {
    const red = Math.trunc(maxHp * 0.25)
    const yellow = Math.trunc(maxHp * 0.5)
    if (hp < red) {return 'red'}
    if (hp < yellow) {return 'yellow'}
    return 'white'
}

/**
 * AP lights (interfaceRenderActionPoints): `ap` green lights then
 * `freeMove` yellow ones, at most 10; ap = -1 means all ten red.
 */
export function actionPointLights(ap: number, freeMove: number): Array<'green' | 'yellow' | 'red' | 'off'> {
    const lights: Array<'green' | 'yellow' | 'red' | 'off'> = new Array(10).fill('off')
    if (ap === -1) {return lights.fill('red')}
    const green = Math.max(0, Math.min(10, ap))
    const yellow = Math.max(0, Math.min(10 - green, freeMove))
    for (let i = 0; i < green; i++) {lights[i] = 'green'}
    for (let i = green; i < green + yellow; i++) {lights[i] = 'yellow'}
    return lights
}

export interface ItemButtonState {
    name: string
    action: string
    aimed: boolean
    /** AP cost, shown when 0..9 (interface.cc). */
    apCost: number | null
    /** Loaded / capacity, for the ammo bar; null for weapons without ammo. */
    ammo: { loaded: number; capacity: number } | null
}

/** What the item button shows for the player's active hand. */
export function itemButtonState(player: any): ItemButtonState | null {
    if (!player) {return null}
    const weapon: any = player.equippedWeapon ?? null
    const action = weapon?.weapon
    const mode: string = action?.mode ?? 'primary'
    const hitMode: 1 | 2 = typeof action?.hitMode === 'function' ? action.hitMode() : 1
    const aimed = typeof action?.isCalled === 'function' ? action.isCalled() : false
    const info = getAttackWeaponInfo(player, hitMode)
    const extra = weapon?.pro?.extra ?? {}
    const capacity = typeof extra.maxAmmo === 'number' ? extra.maxAmmo : 0
    const loaded = typeof weapon?.extra?.ammoLoaded === 'number' ? weapon.extra.ammoLoaded : 0

    let name = 'Unarmed'
    if (info.weapon) {
        name = typeof weapon.pid === 'number' ? getItemName(weapon.pid) : (action?.name ?? 'Weapon')
    }

    let label = ACTION_LABELS[info.mode] ?? 'PUNCH'
    let apCost: number | null
    if (mode === 'reload') {
        label = 'RELOAD'
        apCost = reloadApCost(info.perk)
    } else {
        apCost = attackApCostFor(player, info, aimed)
    }

    return {
        name,
        action: label,
        aimed,
        apCost: apCost !== null && apCost >= 0 && apCost < 10 ? apCost : null,
        ammo: capacity > 0 ? { loaded, capacity } : null,
    }
}

export class GamePanel extends UIPanel {
    private playerEntityId: number
    private playerName: string
    /** Wrapped monitor lines, oldest first (display_monitor.cc ring of 100). */
    private _monitor: string[] = []
    /** Lines scrolled back from the newest (0 = showing the latest). */
    private _monitorScroll = 0
    /** True when the engine has indicated we are inside a combat encounter. */
    private _isInCombat = false
    private _isPlayerTurnEvent = false

    /**
     * True when it is the player's turn (controls END TURN availability).
     * The live combat state wins over the last turn event, since skipped
     * turns (knocked out, losing a turn) announce a start but no end.
     */
    private get _isPlayerTurn(): boolean {
        const combat = globalState.combat
        return combat ? combat.inPlayerTurn === true : this._isPlayerTurnEvent
    }

    private set _isPlayerTurn(v: boolean) {
        this._isPlayerTurnEvent = v
    }

    constructor(screenWidth: number, screenHeight: number, playerEntityId: number, playerName = 'VAULT DWELLER') {
        super('gamePanel', {
            x: 0,
            y: screenHeight - PANEL_HEIGHT,
            width: screenWidth,
            height: PANEL_HEIGHT,
        })
        this.playerEntityId = playerEntityId
        this.playerName = playerName
        this.zOrder = 0
        this.visible = true  // always visible
        this._subscribe()
    }

    /** Left edge of the 640-wide bar (centred on wider screens). */
    private get barX(): number {
        return Math.max(0, Math.floor((this.bounds.width - BAR_WIDTH) / 2))
    }

    private _subscribe(): void {
        EventBus.on('ui:message', ({ text }) => this.addMonitorMessage(text))
        EventBus.on('combat:start', () => {
            this._isInCombat = true
        })
        EventBus.on('combat:end', () => {
            this._isInCombat = false
            this._isPlayerTurn = false
        })
        EventBus.on('combat:turnStart', (payload) => {
            this._isPlayerTurn = payload.isPlayer
        })
        EventBus.on('combat:turnEnd', () => {
            this._isPlayerTurn = false
        })
    }

    /** displayMonitorAddMessage: wrap, keep the last 100 lines, snap to newest. */
    addMonitorMessage(text: string): void {
        if (!text) {return}
        this._monitor.push(...wrapMonitorMessage(text))
        if (this._monitor.length > MONITOR_CAPACITY) {
            this._monitor = this._monitor.slice(-MONITOR_CAPACITY)
        }
        this._monitorScroll = 0
    }

    /** Lines currently visible in the monitor, top to bottom. */
    getVisibleMonitorLines(): string[] {
        const end = this._monitor.length - this._monitorScroll
        return this._monitor.slice(Math.max(0, end - MONITOR_VISIBLE_LINES), end)
    }

    /** Every line in the monitor history. */
    getMonitorLines(): readonly string[] {
        return this._monitor
    }

    scrollMonitor(delta: number): void {
        const max = Math.max(0, this._monitor.length - MONITOR_VISIBLE_LINES)
        this._monitorScroll = Math.max(0, Math.min(max, this._monitorScroll + delta))
    }

    render(ctx: OffscreenCanvasRenderingContext2D): void {
        const { width, height } = this.bounds
        const ox = this.barX

        fillRect(ctx, 0, 0, width, height, FALLOUT_BLACK)
        strokeRect(ctx, ox, 0, Math.min(BAR_WIDTH, width), height, FALLOUT_DARK_GRAY)

        // Project live Critter HP/AP onto the ECS entity so panels agree.
        syncPlayerEntityFromCritter()
        const player: any = globalState.player
        const stats = EntityManager.get<'stats'>(this.playerEntityId, 'stats')
        const live = readPlayerHudSnapshot()

        // --- display monitor ---
        strokeRect(ctx, ox + MONITOR.x - 2, MONITOR.y - 2, MONITOR.w + 4, MONITOR.h + 4, FALLOUT_DARK_GRAY)
        const lines = this.getVisibleMonitorLines()
        for (let i = 0; i < lines.length; i++) {
            drawUIFontText(ctx, lines[i], ox + MONITOR.x, MONITOR.y + (i + 1) * MONITOR_LINE_HEIGHT - 1, FALLOUT_GREEN, 9)
        }

        // --- bar buttons ---
        for (const b of BAR_BUTTONS) {
            drawButton(ctx, b.label, ox + b.x, b.y, b.w, b.h, FALLOUT_DARK_GRAY, FALLOUT_AMBER)
        }

        // --- item button + ammo bar ---
        strokeRect(ctx, ox + ITEM_BUTTON.x, ITEM_BUTTON.y, ITEM_BUTTON.w, ITEM_BUTTON.h, FALLOUT_AMBER)
        const item = itemButtonState(player)
        if (item) {
            drawUIFontText(ctx, item.name, ox + ITEM_BUTTON.x + 8, ITEM_BUTTON.y + 26, FALLOUT_AMBER, 11)
            drawUIFontText(ctx, item.action, ox + ITEM_BUTTON.x + ITEM_BUTTON.w - 7, ITEM_BUTTON.y + 16, FALLOUT_AMBER, 11, { align: 'right' })
            if (item.aimed) {
                drawUIFontText(ctx, '(+)', ox + ITEM_BUTTON.x + ITEM_BUTTON.w - 7, ITEM_BUTTON.y + ITEM_BUTTON.h - 7, FALLOUT_AMBER, 11, { align: 'right' })
            }
            if (item.apCost !== null) {
                drawUIFontText(ctx, `AP ${item.apCost}`, ox + ITEM_BUTTON.x + 8, ITEM_BUTTON.y + ITEM_BUTTON.h - 7, FALLOUT_AMBER, 11)
            }
            if (item.ammo) {
                const ratio = Math.max(0, Math.min(1, item.ammo.loaded / item.ammo.capacity))
                const filled = Math.round(AMMO_BAR.h * ratio)
                fillRect(ctx, ox + AMMO_BAR.x, AMMO_BAR.y, AMMO_BAR.w, AMMO_BAR.h, LIGHT_OFF)
                fillRect(ctx, ox + AMMO_BAR.x, AMMO_BAR.y + AMMO_BAR.h - filled, AMMO_BAR.w, filled, LIGHT_YELLOW)
            }
        }

        // --- AP lights ---
        let ap = 0
        let freeMove = 0
        if (this._isInCombat || globalState.inCombat) {
            const playersTurn = this._isPlayerTurn
            if (playersTurn) {
                ap = player?.AP?.getAvailableCombatAP?.() ?? live?.currentAP ?? 0
                freeMove = player?.AP?.move ?? 0
            } else {
                ap = -1
            }
        }
        const lights = actionPointLights(ap, freeMove)
        for (let i = 0; i < lights.length; i++) {
            const color = lights[i] === 'green' ? LIGHT_GREEN : lights[i] === 'yellow' ? LIGHT_YELLOW : lights[i] === 'red' ? LIGHT_RED : LIGHT_OFF
            fillRect(ctx, ox + AP_LIGHTS.x + i * AP_LIGHTS.stride, AP_LIGHTS.y, AP_LIGHTS.size, AP_LIGHTS.size, color)
        }

        // --- HP / AC counters ---
        const hp = live?.currentHp ?? stats?.currentHp ?? 0
        const maxHp = live?.maxHp ?? stats?.maxHp ?? 0
        const hpTone = hitPointsColor(hp, maxHp)
        const hpColor = hpTone === 'red' ? FALLOUT_RED : hpTone === 'yellow' ? YELLOW : WHITE
        drawUIFontText(ctx, formatCounter(hp), ox + HP_COUNTER.x, HP_COUNTER.y + 12, hpColor, 13, { bold: true })
        const ac = typeof player?.getStat === 'function' ? player.getStat('AC') : (stats?.armorClass ?? 0)
        drawUIFontText(ctx, formatCounter(ac), ox + AC_COUNTER.x, AC_COUNTER.y + 12, WHITE, 13, { bold: true })

        // --- combat buttons ---
        if (this._isInCombat) {
            const active = this._isPlayerTurn
            drawButton(ctx, 'TURN', ox + END_TURN.x, END_TURN.y, END_TURN.w, END_TURN.h,
                FALLOUT_DARK_GRAY, active ? FALLOUT_AMBER : FALLOUT_DARK_GRAY)
            drawButton(ctx, 'COMBAT', ox + END_COMBAT.x, END_COMBAT.y, END_COMBAT.w, END_COMBAT.h,
                FALLOUT_DARK_GRAY, active ? FALLOUT_AMBER : FALLOUT_DARK_GRAY)
        }
    }

    override onMouseDown(x: number, y: number, button: 'l' | 'r'): boolean {
        const bx = x - this.barX

        if (inRect(bx, y, MONITOR.x, MONITOR.y, MONITOR.w, MONITOR.h)) {
            // display_monitor.cc: top half scrolls back, bottom half forward.
            this.scrollMonitor(y < MONITOR.y + MONITOR.h / 2 ? 1 : -1)
            return true
        }

        if (this._isInCombat) {
            if (inRect(bx, y, END_TURN.x, END_TURN.y, END_TURN.w, END_TURN.h)) {
                this._endPlayerTurn()
                return true
            }
            if (inRect(bx, y, END_COMBAT.x, END_COMBAT.y, END_COMBAT.w, END_COMBAT.h)) {
                this._attemptEndCombat()
                return true
            }
        }

        if (inRect(bx, y, ITEM_BUTTON.x, ITEM_BUTTON.y, ITEM_BUTTON.w, ITEM_BUTTON.h)) {
            if (button === 'r') {this._cycleItemAction()}
            else {this._armAttackCursor()}
            return true
        }

        for (const b of BAR_BUTTONS) {
            if (inRect(bx, y, b.x, b.y, b.w, b.h)) {
                this._onButton(b)
                return true
            }
        }
        // Clicks elsewhere on the bar never reach the map underneath.
        return y >= 0 && y < PANEL_HEIGHT
    }

    override onKeyDown(key: string): boolean {
        switch (key) {
            case ' ':
                if (this._isInCombat && this._isPlayerTurn) {
                    this._endPlayerTurn()
                    return true
                }
                return false
            case 'Enter':
                if (this._isInCombat && this._isPlayerTurn) {
                    this._attemptEndCombat()
                    return true
                }
                return false
            case 'a':
            case 'A':
                if (!globalState.inCombat && globalState.player) {
                    void import('../combat.js').then(({ Combat }) => {
                        if (!globalState.inCombat) {Combat.start()}
                    })
                    return true
                }
                return false
            case 'n':
            case 'N':
                this._cycleItemAction()
                return true
            case 'b':
            case 'B':
                this._onButton(BAR_BUTTONS[0])
                return true
            case 'c':
            case 'C':
                return this._open('characterScreen')
            case 'i':
            case 'I':
                return this._open('inventory')
            case 'o':
            case 'O':
            case 'Escape':
                return this._open('options')
            case 'p':
            case 'P':
                return this._open('pipboy')
            case 's':
            case 'S':
                return this._open('skilldex')
            case 'Tab':
                return this._open('pipboy', 'map')
            default:
                return false
        }
    }

    private _open(panelName: string, openAs?: string): boolean {
        if (panelName === 'inventory' && !this._payInventoryAP()) {return true}
        EventBus.emit('audio:playSound', { soundId: 'ui_click' })
        EventBus.emit('ui:openPanel', openAs ? { panelName, openAs } : { panelName })
        return true
    }

    /**
     * inventory.cc inventoryOpen: during combat the inventory costs 4 AP
     * (2 with Quick Pockets); refused with inventory.msg 19 when short.
     */
    private _payInventoryAP(): boolean {
        if (!globalState.inCombat) {return true}
        const player: any = globalState.player
        if (!player?.AP) {return true}
        if (!(globalState.combat?.inPlayerTurn ?? false)) {return false}
        const required = Math.max(0, 4 - 2 * perkRank(player, PerkId.QUICK_POCKETS))
        if (required > player.AP.getAvailableCombatAP()) {
            let text: string | null = null
            try {
                text = getMessage('inventory', 19)
            } catch {
                text = null
            }
            EventBus.emit('ui:message', { text: text || "You don't have enough action points to use inventory." })
            return false
        }
        player.AP.subtractCombatAP(required)
        return true
    }

    private _onButton(b: BarButton): void {
        if (b.panel) {
            this._open(b.panel, b.openAs)
            return
        }
        if (b.id === 'hands') {
            const player: any = globalState.player
            if (!player) {return}
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            player.activeHand = player.activeHand === 1 ? 0 : 1
        }
    }

    /** interfaceCycleItemAction (right click / N). */
    private _cycleItemAction(): void {
        const player: any = globalState.player
        const action = player?.equippedWeapon?.weapon
        if (action && typeof action.cycleMode === 'function') {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            action.cycleMode(player)
        }
    }

    /**
     * Left click on the item button (interface.cc): RELOAD reloads (paying the
     * reload AP in combat) and moves to the next action; an attack action arms
     * the crosshair and starts combat when not already fighting.
     */
    private _armAttackCursor(): void {
        const player: any = globalState.player
        const weapon = player?.equippedWeapon
        const action = weapon?.weapon
        EventBus.emit('audio:playSound', { soundId: 'ui_click' })
        if (action?.mode === 'reload') {
            if (globalState.inCombat && !(globalState.combat?.inPlayerTurn ?? false)) {return}
            const result = reloadWeaponFully(player, weapon)
            if (result.loaded > 0) {
                EventBus.emit('audio:playSound', { soundId: 'weapon_reload' })
                if (typeof action.cycleMode === 'function') {action.cycleMode(player)}
                globalState.combat?.afterPlayerAction?.()
            } else if (result.reason === 'no-ap') {
                const cost = reloadApCost(weapon?.pro?.extra?.perk ?? -1)
                EventBus.emit('ui:message', { text: `You need ${cost} action points.` })
            }
            return
        }
        globalState.attackCursor = true
        if (!globalState.inCombat && player) {
            void import('../combat.js').then(({ Combat }) => {
                if (!globalState.inCombat) {Combat.start()}
            })
        }
    }

    private _endPlayerTurn(): void {
        if (globalState.combat && globalState.combat.inPlayerTurn) {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            globalState.combat.nextTurn()
        }
    }

    private _attemptEndCombat(): void {
        if (globalState.combat && globalState.combat.inPlayerTurn) {
            EventBus.emit('audio:playSound', { soundId: 'ui_click' })
            globalState.combat.attemptEnd()
        }
    }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function inRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh
}

/** Counters show three digits (interfaceRenderCounter), with a minus for negatives. */
function formatCounter(value: number): string {
    const v = Math.max(-99, Math.min(999, Math.trunc(value)))
    return v < 0 ? '-' + String(-v).padStart(2, '0') : String(v).padStart(3, '0')
}

function drawButton(
    ctx: OffscreenCanvasRenderingContext2D,
    label: string,
    x: number, y: number, w: number, h: number,
    bg: UIColor, border: UIColor,
): void {
    fillRect(ctx, x, y, w, h, bg)
    strokeRect(ctx, x, y, w, h, border)
    drawUIFontText(ctx, label, x + w / 2, y + h / 2 + 4, border, 9, { align: 'center' })
}
