import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from '../eventBus.js'
import { UIManagerImpl } from './uiPanel.js'
import { DialoguePanel } from './dialoguePanel.js'
import { BarterPanel } from './barterPanel.js'
import { WorldMapPanel } from './worldMapPanel.js'
import { QuestLog } from '../quest/questLog.js'
import { registerDefaultPanels, PRIMARY_GAMEPLAY_PANEL_NAMES } from './registerPanels.js'

describe('ui2 primary gameplay panel registration parity', () => {
    it('registerDefaultPanels registers every primary gameplay panel into UIManagerImpl', () => {
        const mgr = new UIManagerImpl(800, 600)
        registerDefaultPanels(mgr, 800, 600, 1, new QuestLog())

        for (const panelName of PRIMARY_GAMEPLAY_PANEL_NAMES) {
            expect(() => mgr.get(panelName)).not.toThrow()
        }
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
