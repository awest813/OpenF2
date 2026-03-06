import { UIManagerImpl } from './uiPanel.js'
import { GamePanel } from './gamePanel.js'
import { PipBoyPanel } from './pipboy.js'
import { CharacterScreen } from './characterScreen.js'
import { OptionsPanel } from './optionsPanel.js'
import { SaveLoadPanel } from './saveLoadPanel.js'
import { DialoguePanel } from './dialoguePanel.js'
import { BarterPanel } from './barterPanel.js'
import { LootPanel } from './lootPanel.js'
import { InventoryPanel } from './inventoryPanel.js'
import { WorldMapPanel } from './worldMapPanel.js'
import { ElevatorPanel } from './elevatorPanel.js'
import { CalledShotPanel } from './calledShotPanel.js'
import { ScriptDebuggerPanel } from './scriptDebuggerPanel.js'
import { DebugOverlayPanel } from './debugOverlay.js'
import { MapViewerPanel } from './mapViewerPanel.js'
import { PrototypeInspectorPanel } from './prototypeInspectorPanel.js'
import { QuestLog } from '../quest/questLog.js'

export const PRIMARY_GAMEPLAY_PANEL_NAMES = [
    'dialogue',
    'barter',
    'loot',
    'inventory',
    'worldMap',
    'elevator',
    'calledShot',
] as const

export function registerDefaultPanels(
    manager: UIManagerImpl,
    screenWidth: number,
    screenHeight: number,
    playerEntityId: number,
    questLog: QuestLog,
): void {
    manager.register(new GamePanel(screenWidth, screenHeight, playerEntityId))
    manager.register(new PipBoyPanel(screenWidth, screenHeight, playerEntityId, questLog))
    manager.register(new CharacterScreen(screenWidth, screenHeight, playerEntityId))
    manager.register(new OptionsPanel(screenWidth, screenHeight))
    manager.register(new SaveLoadPanel(screenWidth, screenHeight))

    manager.register(new DialoguePanel(screenWidth, screenHeight))
    manager.register(new BarterPanel(screenWidth, screenHeight))
    manager.register(new LootPanel(screenWidth, screenHeight))
    manager.register(new InventoryPanel(screenWidth, screenHeight))
    manager.register(new WorldMapPanel(screenWidth, screenHeight))
    manager.register(new ElevatorPanel(screenWidth, screenHeight))
    manager.register(new CalledShotPanel(screenWidth, screenHeight))
    manager.register(new ScriptDebuggerPanel(screenWidth, screenHeight))
    manager.register(new DebugOverlayPanel(screenWidth, screenHeight, playerEntityId))
    manager.register(new MapViewerPanel(screenWidth, screenHeight))
    manager.register(new PrototypeInspectorPanel(screenWidth, screenHeight))
}
