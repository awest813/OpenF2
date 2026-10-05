/**
 * The game cursor's modes (game_mouse.cc): MOVE (the hex cursor — a click
 * walks), ARROW (the action cursor — a click does the object's primary
 * action, hovering looks at it) and CROSSHAIR (a click attacks). Right-click
 * cycles them (gameMouseCycleMode).
 */

export type MouseMode = 'move' | 'arrow' | 'crosshair'

const ORDER: MouseMode[] = ['move', 'arrow', 'crosshair']

/**
 * gameMouseCycleMode: move → arrow → crosshair → move. Outside combat the
 * crosshair is skipped; in combat it is skipped when the active item is not
 * a weapon.
 */
export function cycleMouseMode(current: MouseMode, inCombat: boolean, activeItemIsWeapon: boolean): MouseMode {
    let next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
    if (next === 'crosshair' && (!inCombat || !activeItemIsWeapon)) {next = 'move'}
    return next
}

export type ArrowAction = 'pickup' | 'rotate' | 'talk' | 'examine' | 'loot' | 'use' | null

/**
 * The left click in ARROW mode (_gmouse_handle_event): pick items up, turn
 * the player when clicking on them, talk to whoever will talk (examine them
 * in combat), loot whoever won't, use usable scenery and examine the rest.
 */
export function arrowPrimaryAction(obj: any, player: any, inCombat: boolean): ArrowAction {
    if (!obj) {return null}
    switch (obj.type) {
        case 'item':
            return 'pickup'
        case 'critter':
            if (obj === player) {return 'rotate'}
            if (canTalkTo(obj)) {return inCombat ? 'examine' : 'talk'}
            return 'loot'
        case 'scenery':
            return canUse(obj) ? 'use' : 'examine'
        case 'wall':
            return 'examine'
        default:
            return canUse(obj) ? 'use' : 'examine'
    }
}

/** _obj_action_can_talk_to: any critter that is neither dead nor knocked out. */
export function canTalkTo(obj: any): boolean {
    return obj?.type === 'critter' && !obj.dead && !obj.knockedOut
}

/** _obj_action_can_use: the proto's use flag, containers, doors and stairs (Obj.canUse). */
function canUse(obj: any): boolean {
    if (!obj) {return false}
    try {
        return obj.canUse === true
    } catch {
        return false
    }
}

/**
 * The hover look: once the mouse has rested 250 ms over an object it has
 * not already looked at, the object is looked at (gameMouseRefresh →
 * _obj_look_at). Moving resets the timer.
 */
export class HoverLook {
    private lastX = -1
    private lastY = -1
    private lastMove = 0
    private tested = false
    private pointed: unknown = null

    /** Returns the object to look at now, if any. */
    update(now: number, x: number, y: number, pick: () => unknown): unknown {
        if (x !== this.lastX || y !== this.lastY) {
            this.lastX = x
            this.lastY = y
            this.lastMove = now
            this.tested = false
            return null
        }
        if (this.tested || now - this.lastMove < 250) {return null}
        this.tested = true
        const obj = pick()
        if (!obj || obj === this.pointed) {return null}
        this.pointed = obj
        return obj
    }

    reset(): void {
        this.pointed = null
        this.tested = false
    }
}

export type ActionMenuItem = 'cancel' | 'inventory' | 'look' | 'rotate' | 'talk' | 'use' | 'skill' | 'push'

/** proto.msg-free labels for the action menu icons (intrface 253 … 435). */
export const ACTION_MENU_LABELS: Record<ActionMenuItem, string> = {
    cancel: 'Cancel',
    inventory: 'Use item on',
    look: 'Look',
    rotate: 'Rotate',
    talk: 'Talk',
    use: 'Use',
    skill: 'Use skill',
    push: 'Push',
}

const CRITTER_NO_STEAL = 0x20

/**
 * actionCheckPush: an active critter in talking range (within 9 hexes)
 * whose script has push_p_proc, and in combat not one fighting the player.
 */
export function canPush(player: any, target: any, inCombat: boolean, distance: number): boolean {
    if (target?.type !== 'critter' || target === player) {return false}
    if (target.dead || target.knockedOut || target.loseTurn) {return false}
    if (distance >= 9) {return false}
    if (!target._script || target._script.push_p_proc === undefined) {return false}
    if (inCombat) {
        if (target.teamNum === player?.teamNum && target === player?.whoHitMe) {return false}
        if (target.whoHitMe && target.whoHitMe.teamNum === player?.teamNum) {return false}
    }
    return true
}

/** The action menu for a held click in ARROW mode (_gmouse_handle_event). */
export function actionMenuItems(target: any, player: any, inCombat: boolean, distance = 0): ActionMenuItem[] {
    const items: ActionMenuItem[] = []
    switch (target?.type) {
        case 'item':
            items.push('use', 'look')
            if (target.subtype === 'container') {items.push('inventory', 'skill')}
            items.push('cancel')
            break
        case 'critter':
            if (target === player) {
                items.push('rotate')
            } else {
                if (canTalkTo(target)) {
                    if (!inCombat) {items.push('talk')}
                } else if (((target.pro?.extra?.flags ?? 0) & CRITTER_NO_STEAL) === 0) {
                    items.push('use')
                }
                if (canPush(player, target, inCombat, distance)) {items.push('push')}
            }
            items.push('look', 'inventory', 'skill', 'cancel')
            break
        case 'scenery':
            if (canUse(target)) {items.push('use')}
            items.push('look', 'inventory', 'skill', 'cancel')
            break
        case 'wall':
            items.push('look')
            if (canUse(target)) {items.push('inventory')}
            items.push('cancel')
            break
    }
    return items
}

/** gameMouseHighlightActionMenuItemAtIndex: every 10 pixels of vertical drag moves the highlight one item. */
export function actionMenuIndex(startY: number, currentY: number, count: number, previous = 0): number {
    const steps = Math.trunc((currentY - startY) / 10)
    return Math.max(0, Math.min(count - 1, previous + steps))
}
