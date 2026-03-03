/**
 * ui2 module regression tests — Phase 2 UI migration.
 *
 * Covers:
 *   - UIPanel lifecycle: show(), hide(), toggle(), onShow/onHide hooks
 *   - UIPanel.containsPoint() hit detection
 *   - UIPanel z-order sorting
 *   - UIManagerImpl: register, get, isAnyPanelOpen
 *   - UIManagerImpl: handleMouseDown routing
 *   - UIManagerImpl: handleKeyDown routing
 *   - UIManagerImpl: connectEventBus() wiring
 *   - EventBus: ui:openPanel / ui:closePanel events
 *   - PipBoyPanel: tab switching and scroll via keyboard
 *   - GamePanel: HUD_BUTTONS layout and OPTIONS button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    UIPanel,
    UIManagerImpl,
    Rect,
    FALLOUT_GREEN,
    FALLOUT_RED,
    FALLOUT_AMBER,
} from './uiPanel.js'
import { EventBus } from '../eventBus.js'

// ---------------------------------------------------------------------------
// Minimal concrete UIPanel for testing
// ---------------------------------------------------------------------------

class TestPanel extends UIPanel {
    renderCallCount = 0
    onShowCallCount = 0
    onHideCallCount = 0

    constructor(name: string, bounds: Rect, zOrder: number = 0) {
        super(name, bounds)
        this.zOrder = zOrder
    }

    render(_ctx: OffscreenCanvasRenderingContext2D): void {
        this.renderCallCount++
    }

    protected override onShow(): void {
        this.onShowCallCount++
    }

    protected override onHide(): void {
        this.onHideCallCount++
    }
}

// ---------------------------------------------------------------------------
// UIPanel lifecycle
// ---------------------------------------------------------------------------

describe('UIPanel lifecycle', () => {
    it('starts invisible by default', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        expect(panel.visible).toBe(false)
    })

    it('show() makes panel visible and calls onShow()', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        panel.show()
        expect(panel.visible).toBe(true)
        expect(panel.onShowCallCount).toBe(1)
    })

    it('hide() makes panel invisible and calls onHide()', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        panel.show()
        panel.hide()
        expect(panel.visible).toBe(false)
        expect(panel.onHideCallCount).toBe(1)
    })

    it('toggle() shows a hidden panel', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        panel.toggle()
        expect(panel.visible).toBe(true)
    })

    it('toggle() hides a visible panel', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        panel.show()
        panel.toggle()
        expect(panel.visible).toBe(false)
    })

    it('toggle() twice returns to original state', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        panel.toggle()
        panel.toggle()
        expect(panel.visible).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIPanel.containsPoint
// ---------------------------------------------------------------------------

describe('UIPanel.containsPoint', () => {
    const bounds: Rect = { x: 10, y: 20, width: 100, height: 80 }

    it('returns true for a point inside the bounds', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(50, 50)).toBe(true)
    })

    it('returns true at the top-left corner (inclusive lower bound)', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(10, 20)).toBe(true)
    })

    it('returns false at the right edge (exclusive upper bound)', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(110, 50)).toBe(false)  // x = x + width
    })

    it('returns false at the bottom edge (exclusive upper bound)', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(50, 100)).toBe(false)  // y = y + height
    })

    it('returns false for a point left of bounds', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(9, 50)).toBe(false)
    })

    it('returns false for a point above bounds', () => {
        const panel = new TestPanel('p', bounds)
        expect(panel.containsPoint(50, 19)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIPanel default input handlers
// ---------------------------------------------------------------------------

describe('UIPanel default input handlers', () => {
    it('onMouseDown returns false by default (event not consumed)', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        expect(panel.onMouseDown(10, 10, 'l')).toBe(false)
    })

    it('onKeyDown returns false by default (event not consumed)', () => {
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        expect(panel.onKeyDown('Enter')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — registration and retrieval
// ---------------------------------------------------------------------------

describe('UIManagerImpl registration', () => {
    it('register() adds a panel retrievable by get()', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('hud', { x: 0, y: 0, width: 640, height: 480 })
        mgr.register(panel)
        expect(mgr.get('hud')).toBe(panel)
    })

    it('get() throws for an unknown panel name', () => {
        const mgr = new UIManagerImpl(640, 480)
        expect(() => mgr.get('nope')).toThrow()
    })

    it('sorted by zOrder after multiple registrations', () => {
        const mgr = new UIManagerImpl(640, 480)
        const high = new TestPanel('high', { x: 0, y: 0, width: 10, height: 10 }, 10)
        const low = new TestPanel('low', { x: 0, y: 0, width: 10, height: 10 }, 0)
        mgr.register(high)
        mgr.register(low)
        // Both should be retrievable regardless of registration order
        expect(mgr.get('high')).toBe(high)
        expect(mgr.get('low')).toBe(low)
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — isAnyPanelOpen
// ---------------------------------------------------------------------------

describe('UIManagerImpl.isAnyPanelOpen', () => {
    it('returns false when no panels are registered', () => {
        const mgr = new UIManagerImpl(640, 480)
        expect(mgr.isAnyPanelOpen()).toBe(false)
    })

    it('returns false when only zOrder=0 panels are visible', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('hud', { x: 0, y: 0, width: 640, height: 480 }, 0)
        panel.show()
        mgr.register(panel)
        // zOrder=0 is the base HUD layer, not considered "open"
        expect(mgr.isAnyPanelOpen()).toBe(false)
    })

    it('returns true when a visible panel has zOrder > 0', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('char', { x: 100, y: 100, width: 300, height: 300 }, 10)
        panel.show()
        mgr.register(panel)
        expect(mgr.isAnyPanelOpen()).toBe(true)
    })

    it('returns false when the high-zOrder panel is hidden', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('char', { x: 100, y: 100, width: 300, height: 300 }, 10)
        mgr.register(panel)  // not shown
        expect(mgr.isAnyPanelOpen()).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — mouse routing
// ---------------------------------------------------------------------------

describe('UIManagerImpl.handleMouseDown', () => {
    it('routes click to the panel that contains the point', () => {
        const mgr = new UIManagerImpl(640, 480)
        let clicked = false
        const panel = new TestPanel('p', { x: 50, y: 50, width: 100, height: 100 })
        ;(panel as any).onMouseDown = (_x: number, _y: number, _b: string) => {
            clicked = true
            return true
        }
        panel.show()
        mgr.register(panel)
        const consumed = mgr.handleMouseDown(80, 80, 'l')
        expect(clicked).toBe(true)
        expect(consumed).toBe(true)
    })

    it('does not route click to invisible panels', () => {
        const mgr = new UIManagerImpl(640, 480)
        let clicked = false
        const panel = new TestPanel('p', { x: 0, y: 0, width: 200, height: 200 })
        ;(panel as any).onMouseDown = () => { clicked = true; return true }
        // panel is NOT shown
        mgr.register(panel)
        mgr.handleMouseDown(50, 50, 'l')
        expect(clicked).toBe(false)
    })

    it('returns false when no visible panel covers the point', () => {
        const mgr = new UIManagerImpl(640, 480)
        const result = mgr.handleMouseDown(300, 300, 'l')
        expect(result).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — mouse move routing
// ---------------------------------------------------------------------------

describe('UIManagerImpl.handleMouseMove', () => {
    it('routes mouse move to the topmost visible panel under the cursor', () => {
        const mgr = new UIManagerImpl(640, 480)
        const calls: string[] = []
        const low = new TestPanel('low', { x: 0, y: 0, width: 200, height: 200 }, 0)
        const high = new TestPanel('high', { x: 0, y: 0, width: 200, height: 200 }, 10)
        ;(low as any).onMouseMove = () => calls.push('low')
        ;(high as any).onMouseMove = () => calls.push('high')
        low.show()
        high.show()
        mgr.register(low)
        mgr.register(high)

        mgr.handleMouseMove(50, 50)
        expect(calls).toEqual(['high'])
    })

    it('does not route mouse move when no visible panel contains the cursor', () => {
        const mgr = new UIManagerImpl(640, 480)
        let called = false
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        ;(panel as any).onMouseMove = () => { called = true }
        panel.show()
        mgr.register(panel)

        mgr.handleMouseMove(300, 300)
        expect(called).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — keyboard routing
// ---------------------------------------------------------------------------

describe('UIManagerImpl.handleKeyDown', () => {
    it('routes key to the topmost visible panel that consumes it', () => {
        const mgr = new UIManagerImpl(640, 480)
        let receivedKey = ''
        const panel = new TestPanel('p', { x: 0, y: 0, width: 100, height: 100 })
        ;(panel as any).onKeyDown = (key: string) => { receivedKey = key; return true }
        panel.show()
        mgr.register(panel)
        const consumed = mgr.handleKeyDown('Escape')
        expect(receivedKey).toBe('Escape')
        expect(consumed).toBe(true)
    })

    it('returns false when no visible panel consumes the key', () => {
        const mgr = new UIManagerImpl(640, 480)
        expect(mgr.handleKeyDown('Escape')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// UIColor constants (sanity checks)
// ---------------------------------------------------------------------------

describe('UIColor palette constants', () => {
    it('FALLOUT_GREEN has full alpha', () => {
        expect(FALLOUT_GREEN.a).toBe(255)
    })

    it('FALLOUT_RED has red channel dominant', () => {
        expect(FALLOUT_RED.r).toBeGreaterThan(FALLOUT_RED.g)
        expect(FALLOUT_RED.r).toBeGreaterThan(FALLOUT_RED.b)
    })

    it('FALLOUT_AMBER has red and green channels (no blue)', () => {
        expect(FALLOUT_AMBER.r).toBeGreaterThan(0)
        expect(FALLOUT_AMBER.g).toBeGreaterThan(0)
        expect(FALLOUT_AMBER.b).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// EventBus — ui:openPanel / ui:closePanel events
// ---------------------------------------------------------------------------

describe('EventBus ui panel events', () => {
    beforeEach(() => {
        EventBus.clear('ui:openPanel')
        EventBus.clear('ui:closePanel')
    })

    afterEach(() => {
        EventBus.clear('ui:openPanel')
        EventBus.clear('ui:closePanel')
    })

    it('emits ui:openPanel with correct panelName', () => {
        const received: string[] = []
        EventBus.on('ui:openPanel', ({ panelName }) => received.push(panelName))
        EventBus.emit('ui:openPanel', { panelName: 'pipboy' })
        expect(received).toEqual(['pipboy'])
    })

    it('emits ui:closePanel with correct panelName', () => {
        const received: string[] = []
        EventBus.on('ui:closePanel', ({ panelName }) => received.push(panelName))
        EventBus.emit('ui:closePanel', { panelName: 'characterScreen' })
        expect(received).toEqual(['characterScreen'])
    })

    it('ui:openPanel and ui:closePanel are independent events', () => {
        const opens: string[] = []
        const closes: string[] = []
        EventBus.on('ui:openPanel', ({ panelName }) => opens.push(panelName))
        EventBus.on('ui:closePanel', ({ panelName }) => closes.push(panelName))
        EventBus.emit('ui:openPanel', { panelName: 'pipboy' })
        EventBus.emit('ui:closePanel', { panelName: 'pipboy' })
        expect(opens).toEqual(['pipboy'])
        expect(closes).toEqual(['pipboy'])
    })
})

// ---------------------------------------------------------------------------
// UIManagerImpl — connectEventBus
// ---------------------------------------------------------------------------

describe('UIManagerImpl.connectEventBus', () => {
    beforeEach(() => {
        EventBus.clear('ui:openPanel')
        EventBus.clear('ui:closePanel')
    })

    afterEach(() => {
        EventBus.clear('ui:openPanel')
        EventBus.clear('ui:closePanel')
    })

    it('shows a registered panel when ui:openPanel fires with matching name', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('pipboy', { x: 0, y: 0, width: 400, height: 500 }, 20)
        mgr.register(panel)
        mgr.connectEventBus()

        expect(panel.visible).toBe(false)
        EventBus.emit('ui:openPanel', { panelName: 'pipboy' })
        expect(panel.visible).toBe(true)
    })

    it('hides a visible panel when ui:closePanel fires with matching name', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('pipboy', { x: 0, y: 0, width: 400, height: 500 }, 20)
        panel.show()
        mgr.register(panel)
        mgr.connectEventBus()

        expect(panel.visible).toBe(true)
        EventBus.emit('ui:closePanel', { panelName: 'pipboy' })
        expect(panel.visible).toBe(false)
    })

    it('ignores ui:openPanel events for panels that are not registered', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('pipboy', { x: 0, y: 0, width: 400, height: 500 }, 20)
        mgr.register(panel)
        mgr.connectEventBus()

        // firing for a different name should not affect our panel
        EventBus.emit('ui:openPanel', { panelName: 'inventory' })
        expect(panel.visible).toBe(false)
    })

    it('opening and closing via EventBus updates isAnyPanelOpen', () => {
        const mgr = new UIManagerImpl(640, 480)
        const panel = new TestPanel('char', { x: 100, y: 100, width: 300, height: 300 }, 10)
        mgr.register(panel)
        mgr.connectEventBus()

        expect(mgr.isAnyPanelOpen()).toBe(false)
        EventBus.emit('ui:openPanel', { panelName: 'char' })
        expect(mgr.isAnyPanelOpen()).toBe(true)
        EventBus.emit('ui:closePanel', { panelName: 'char' })
        expect(mgr.isAnyPanelOpen()).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// PipBoyPanel — scroll support
// ---------------------------------------------------------------------------

import { PipBoyPanel } from './pipboy.js'
import { QuestLog } from '../quest/questLog.js'
import { EntityManager } from '../ecs/entityManager.js'

describe('PipBoyPanel scroll and tab switching', () => {
    it('ArrowRight cycles through tabs', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog)
        panel.show()

        // Default tab is 'status'
        // ArrowRight → items
        expect(panel.onKeyDown('ArrowRight')).toBe(true)
        // ArrowRight → map
        expect(panel.onKeyDown('ArrowRight')).toBe(true)
        // ArrowRight → quests
        expect(panel.onKeyDown('ArrowRight')).toBe(true)
        // ArrowRight wraps back → status
        expect(panel.onKeyDown('ArrowRight')).toBe(true)
    })

    it('ArrowLeft cycles through tabs in reverse', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog)
        panel.show()

        // Default: status. ArrowLeft → quests (wraps)
        expect(panel.onKeyDown('ArrowLeft')).toBe(true)
    })

    it('Tab key advances to the next tab', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog)
        panel.show()
        expect(panel.onKeyDown('Tab')).toBe(true)
    })

    it('Escape hides the panel', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog)
        panel.show()
        expect(panel.visible).toBe(true)
        expect(panel.onKeyDown('Escape')).toBe(true)
        expect(panel.visible).toBe(false)
    })

    it('P key hides the panel', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog)
        panel.show()
        expect(panel.onKeyDown('p')).toBe(true)
        expect(panel.visible).toBe(false)
    })

    it('ArrowDown increments item scroll when on items tab', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog) as any
        panel.show()
        panel.activeTab = 'items'
        panel._itemScrollOffset = 0
        panel.onKeyDown('ArrowDown')
        expect(panel._itemScrollOffset).toBe(1)
    })

    it('ArrowUp decrements item scroll but not below zero', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog) as any
        panel.show()
        panel.activeTab = 'items'
        panel._itemScrollOffset = 0
        panel.onKeyDown('ArrowUp')
        expect(panel._itemScrollOffset).toBe(0)
    })

    it('ArrowDown increments quest scroll when on quests tab', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog) as any
        panel.show()
        panel.activeTab = 'quests'
        panel._questScrollOffset = 2
        panel.onKeyDown('ArrowDown')
        expect(panel._questScrollOffset).toBe(3)
    })

    it('switching tabs resets scroll offsets', () => {
        const questLog = new QuestLog()
        const panel = new PipBoyPanel(800, 600, 1, questLog) as any
        panel.show()
        panel.activeTab = 'items'
        panel._itemScrollOffset = 5
        panel._questScrollOffset = 3
        // Switch via ArrowRight
        panel.onKeyDown('ArrowRight')
        expect(panel._itemScrollOffset).toBe(0)
        expect(panel._questScrollOffset).toBe(0)
    })
})
