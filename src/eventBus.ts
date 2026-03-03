/**
 * Typed event bus — the single communication channel between engine modules.
 *
 * Modules must never import each other directly when they only need to react
 * to state changes; they subscribe to events here instead. This eliminates
 * circular dependencies and makes system interactions auditable.
 *
 * Usage:
 *   EventBus.on('combat:turnStart', handler)
 *   EventBus.emit('combat:turnStart', { critter: ... })
 *   EventBus.off('combat:turnStart', handler)
 */

// ---------------------------------------------------------------------------
// Event catalogue — add new event types here as they are needed.
// ---------------------------------------------------------------------------

export interface EngineEvents {
    // Engine lifecycle
    'engine:ready': void
    'engine:shutdown': void

    // Map
    'map:load': { mapName: string }
    'map:loaded': { mapName: string }
    'map:elevationChange': { elevation: number }

    // Entity
    'entity:create': { id: number }
    'entity:destroy': { id: number }

    // Combat
    'combat:start': { combatants: number[] }
    'combat:end': void
    'combat:turnStart': { entityId: number; isPlayer: boolean }
    'combat:turnEnd': { entityId: number }
    'combat:hit': { attackerId: number; targetId: number; damage: number; damageType: DamageType }
    'combat:miss': { attackerId: number; targetId: number }
    'combat:death': { entityId: number; killerId: number }

    // Player
    'player:move': { from: { x: number; y: number }; to: { x: number; y: number } }
    'player:levelUp': { newLevel: number }
    'player:xpGain': { amount: number; total: number }
    'player:statChange': { stat: string; oldValue: number; newValue: number }
    'player:skillChange': { skill: string; oldValue: number; newValue: number }

    // Dialogue
    'dialogue:start': { npcId: number }
    'dialogue:end': { npcId: number }
    'dialogue:nodeChange': { nodeId: string }

    // Inventory
    'inventory:itemAdd': { entityId: number; itemPid: number; count: number }
    'inventory:itemRemove': { entityId: number; itemPid: number; count: number }
    'inventory:equip': { entityId: number; itemPid: number; slot: EquipSlot }
    'inventory:unequip': { entityId: number; slot: EquipSlot }

    // Audio
    'audio:playSound': { soundId: string; position?: { x: number; y: number } }
    'audio:playMusic': { trackId: string; loop: boolean }
    'audio:stopMusic': void

    // Quest
    'quest:start': { questId: string }
    'quest:complete': { questId: string }
    'quest:fail': { questId: string }

    // Reputation / karma
    'player:karmaChange': { oldValue: number; newValue: number }
    'player:reputationChange': { name: string; oldValue: number; newValue: number }

    // Scripting
    'script:error': { scriptName: string; opcode: number; message: string }
    'script:stub': { scriptName: string; procName: string }

    // Cinematic / cutscene pipeline
    'cinematic:start': { sequenceId: string }
    'cinematic:end': { sequenceId: string }
    'cinematic:slideChange': { sequenceId: string; slideIndex: number; total: number }
}

export type DamageType = 'normal' | 'fire' | 'plasma' | 'laser' | 'explosive' | 'electrical' | 'emp'
export type EquipSlot = 'hand_primary' | 'hand_secondary' | 'armor' | 'head'

// ---------------------------------------------------------------------------
// EventBus implementation
// ---------------------------------------------------------------------------

type EventHandler<T> = T extends void ? () => void : (payload: T) => void

type HandlerMap = {
    [K in keyof EngineEvents]?: Set<EventHandler<EngineEvents[K]>>
}

class EventBusImpl {
    private handlers: HandlerMap = {}

    on<K extends keyof EngineEvents>(event: K, handler: EventHandler<EngineEvents[K]>): void {
        if (!this.handlers[event]) {
            this.handlers[event] = new Set() as any
        }
        ;(this.handlers[event] as Set<EventHandler<EngineEvents[K]>>).add(handler)
    }

    off<K extends keyof EngineEvents>(event: K, handler: EventHandler<EngineEvents[K]>): void {
        const set = this.handlers[event] as Set<EventHandler<EngineEvents[K]>> | undefined
        set?.delete(handler)
    }

    /** Subscribe once — handler is removed after the first invocation. */
    once<K extends keyof EngineEvents>(event: K, handler: EventHandler<EngineEvents[K]>): void {
        const wrapper = ((payload: EngineEvents[K]) => {
            this.off(event, wrapper as EventHandler<EngineEvents[K]>)
            ;(handler as Function)(payload)
        }) as EventHandler<EngineEvents[K]>
        this.on(event, wrapper)
    }

    emit<K extends keyof EngineEvents>(
        event: K,
        ...args: EngineEvents[K] extends void ? [] : [EngineEvents[K]]
    ): void {
        const set = this.handlers[event] as Set<EventHandler<EngineEvents[K]>> | undefined
        if (!set) return
        const payload = args[0] as EngineEvents[K]
        for (const handler of set) {
            try {
                ;(handler as Function)(payload)
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err)
            }
        }
    }

    /** Remove all handlers for a specific event, or all handlers if no event given. */
    clear(event?: keyof EngineEvents): void {
        if (event) {
            delete this.handlers[event]
        } else {
            this.handlers = {}
        }
    }

    /** Remove all handlers for a specific event. Alias for clear(event). */
    offAll(event: keyof EngineEvents): void {
        delete this.handlers[event]
    }
}

export const EventBus = new EventBusImpl()
