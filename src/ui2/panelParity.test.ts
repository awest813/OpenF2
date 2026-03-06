import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from '../eventBus.js'
import { UIManagerImpl } from './uiPanel.js'
import { DialoguePanel } from './dialoguePanel.js'
import { BarterPanel } from './barterPanel.js'
import { WorldMapPanel } from './worldMapPanel.js'
import { InventoryPanel } from './inventoryPanel.js'
import { LootPanel } from './lootPanel.js'
import { ElevatorPanel } from './elevatorPanel.js'
import { CalledShotPanel } from './calledShotPanel.js'
import { ScriptDebuggerPanel } from './scriptDebuggerPanel.js'
import { QuestLog } from '../quest/questLog.js'
import { registerDefaultPanels, PRIMARY_GAMEPLAY_PANEL_NAMES } from './registerPanels.js'
import { Config } from '../config.js'
import { assertNoLegacyGameplayPanelFallback } from './index.js'

describe('ui2 primary gameplay panel registration parity', () => {
    it('registerDefaultPanels registers every primary gameplay panel into UIManagerImpl', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())

        for (const panelName of PRIMARY_GAMEPLAY_PANEL_NAMES) {
            expect(() => mgr.get(panelName)).not.toThrow()
        }
    })

    it('registers contributor cockpit panels', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())

        expect(() => mgr.get('debug')).not.toThrow()
        expect(() => mgr.get('mapViewer')).not.toThrow()
        expect(() => mgr.get('scriptDebugger')).not.toThrow()
        expect(() => mgr.get('protoInspector')).not.toThrow()
    })
})

describe('DialoguePanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('does not select on exact right boundary, but selects just inside row bounds', () => {
        const panel = new DialoguePanel(800, 600)
        panel.addOption('Test option', 77)

        panel.onMouseDown(486, 160, 'l')
        expect(emitSpy).not.toHaveBeenCalledWith('dialogue:optionSelected', { optionID: 77 })

        panel.onMouseDown(485, 160, 'l')
        expect(emitSpy).toHaveBeenCalledWith('dialogue:optionSelected', { optionID: 77 })
    })

    it('setReply clears stale options between dialogue exchanges', () => {
        const panel = new DialoguePanel(800, 600)
        panel.addOption('Old option', 55)

        panel.onMouseDown(200, 160, 'l')
        expect(emitSpy).toHaveBeenCalledWith('dialogue:optionSelected', { optionID: 55 })

        emitSpy.mockClear()
        panel.setReply('New NPC line')
        panel.onMouseDown(200, 160, 'l')

        expect(emitSpy).not.toHaveBeenCalledWith('dialogue:optionSelected', { optionID: 55 })
    })
})

describe('BarterPanel interaction parity', () => {
    it('keeps ownership boundaries: selected player item cannot move to merchant side', () => {
        const panel = new BarterPanel(800, 600)
        panel.openWith([{ name: 'Stimpak', amount: 1, value: 100 }], [{ name: 'Rope', amount: 1, value: 10 }])

        // Select first player-inventory item.
        panel.onMouseDown(12, 42, 'l')
        // Click merchant inventory column.
        panel.onMouseDown(550, 42, 'l')

        expect(panel.playerInventory).toHaveLength(1)
        expect(panel.playerTable).toHaveLength(0)
        expect(panel.merchantInventory).toHaveLength(1)
    })
})

describe('WorldMapPanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('supports world->area->travel progression flow via panel hit regions', () => {
        const panel = new WorldMapPanel(800, 600)
        panel.areas = [
            { name: 'Arroyo', id: 1, entrances: [{ mapLookupName: 'arroyo_main', x: 0, y: 0 }] },
        ]
        panel.show()

        // Select first area from world list.
        panel.onMouseDown(31, 55, 'l')
        expect(panel.currentView).toBe('area')

        // Select first entrance from area list.
        panel.onMouseDown(31, 62, 'l')
        expect(emitSpy).toHaveBeenCalledWith('worldMap:travelTo', { mapLookupName: 'arroyo_main' })
    })
})




describe('InventoryPanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('emits use/drop events for selected items and mutates list on drop', () => {
        const panel = new InventoryPanel(800, 600)
        panel.items = [
            { name: 'Stimpak', amount: 1, canUse: true },
            { name: 'Rope', amount: 1, canUse: false },
        ]
        panel.show()

        panel.onMouseDown(20, 90, 'l')
        panel.onMouseDown(285, 90, 'l')
        expect(emitSpy).toHaveBeenCalledWith('inventory:useItem', { index: 0 })

        panel.onMouseDown(20, 112, 'l')
        panel.onMouseDown(285, 118, 'l')
        expect(emitSpy).toHaveBeenCalledWith('inventory:dropItem', { index: 1 })
        expect(panel.items).toHaveLength(1)
    })
})

describe('LootPanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('TAKE ALL transfers container inventory and emits snapshot on close', () => {
        const panel = new LootPanel(800, 600)
        panel.openWith(
            [{ name: 'Knife', amount: 1 }],
            [{ name: 'Ammo', amount: 5 }, { name: 'Rope', amount: 1 }],
        )

        const takeAllX = panel.bounds.width / 2 - 80 - 4
        const btnY = panel.bounds.height - 36
        panel.onMouseDown(takeAllX + 1, btnY + 1, 'l')

        expect(panel.containerInventory).toHaveLength(0)
        expect(panel.playerInventory).toEqual([
            { name: 'Knife', amount: 1 },
            { name: 'Ammo', amount: 5 },
            { name: 'Rope', amount: 1 },
        ])

        const closeX = panel.bounds.width / 2 + 4
        panel.onMouseDown(closeX + 1, btnY + 1, 'l')
        expect(emitSpy).toHaveBeenCalledWith('loot:closed', {
            playerInventory: panel.playerInventory.slice(),
            containerInventory: [],
        })
    })
})

describe('ElevatorPanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('supports numeric floor selection via keyboard', () => {
        const panel = new ElevatorPanel(800, 600)
        panel.openWith([
            { label: 'L1', mapID: 1, level: 0, tileNum: 123 },
            { label: 'L2', mapID: 1, level: 1, tileNum: 456 },
        ])

        panel.onKeyDown('2')
        expect(emitSpy).toHaveBeenCalledWith('elevator:buttonPressed', { mapID: 1, level: 1, tileNum: 456 })
        expect(panel.visible).toBe(false)
    })
})

describe('CalledShotPanel interaction parity', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, 'emit')
    })
    afterEach(() => {
        emitSpy.mockRestore()
    })

    it('emits selected region and closes', () => {
        const panel = new CalledShotPanel(800, 600)
        panel.openWith({ torso: 70 })

        panel.onMouseDown(20, 50, 'l')
        expect(emitSpy).toHaveBeenCalledWith('calledShot:regionSelected', { region: 'torso' })
        expect(panel.visible).toBe(false)
    })
})

describe('ScriptDebuggerPanel gameplay debugging flow', () => {
    it('surfaces automatically when runtime issues are pushed', () => {
        const panel = new ScriptDebuggerPanel(800, 600)
        expect(panel.visible).toBe(false)

        panel.pushMessage('[unknown opcode] test.int: 0xfe @ 0x10')
        expect(panel.visible).toBe(true)
    })
})

describe('UI2-only gameplay mode fallback guard', () => {
    const originalFlag = Config.ui.forceUI2OnlyGameplayPanels

    afterEach(() => {
        Config.ui.forceUI2OnlyGameplayPanels = originalFlag
    })

    it('logs clearly and throws when legacy gameplay panel paths are used', () => {
        Config.ui.forceUI2OnlyGameplayPanels = true
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(() => assertNoLegacyGameplayPanelFallback('loot', 'panel-smoke')).toThrowError(
            /UI2_ONLY_GAMEPLAY_PANELS/,
        )
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('panel=loot'))

        consoleError.mockRestore()
    })

    it('does not throw for gameplay panels when the mode is disabled', () => {
        Config.ui.forceUI2OnlyGameplayPanels = false
        expect(() => assertNoLegacyGameplayPanelFallback('dialogue', 'panel-smoke')).not.toThrow()
    })
})
