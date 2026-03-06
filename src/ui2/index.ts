/**
 * UI subsystem v2 barrel.
 */
import { Config } from '../config.js'
import { PRIMARY_GAMEPLAY_PANEL_NAMES } from './registerPanels.js'


export type GameplayPanelName = typeof PRIMARY_GAMEPLAY_PANEL_NAMES[number]

function isGameplayPanelName(panelName: string): panelName is GameplayPanelName {
    return (PRIMARY_GAMEPLAY_PANEL_NAMES as readonly string[]).includes(panelName)
}

/**
 * Runtime guard for migration validation mode.
 * Throws when code attempts to use legacy DOM gameplay-panel paths while
 * `Config.ui.forceUI2OnlyGameplayPanels` is enabled.
 */
export function assertNoLegacyGameplayPanelFallback(panelName: string, caller: string): void {
    if (!Config.ui.forceUI2OnlyGameplayPanels) return
    if (!isGameplayPanelName(panelName)) return

    const message =
        `[UI2_ONLY_GAMEPLAY_PANELS] Legacy gameplay panel fallback blocked ` +
        `(panel=${panelName}, caller=${caller}). Use ui2 EventBus/UIManager path.`

    console.error(message)
    throw new Error(message)
}

export * from './uiPanel.js'
export * from './gamePanel.js'
export * from './characterScreen.js'
export * from './pipboy.js'
export * from './optionsPanel.js'
export * from './saveLoadPanel.js'
export * from './debugOverlay.js'
export * from './dialoguePanel.js'
export * from './barterPanel.js'
export * from './lootPanel.js'
export * from './inventoryPanel.js'
export * from './worldMapPanel.js'
export * from './elevatorPanel.js'
export * from './calledShotPanel.js'
export * from './mapViewerPanel.js'
export * from './scriptDebuggerPanel.js'
export * from './prototypeInspectorPanel.js'

export * from './registerPanels.js'
