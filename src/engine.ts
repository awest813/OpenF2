/**
 * Engine — the top-level lifecycle controller for OpenF2.
 *
 * State machine:
 *   idle → initializing → running → shutting_down → idle
 *
 * All subsystems (GameModules) register themselves before `start()` is called.
 * The Engine drives their lifecycle and routes lifecycle events through EventBus.
 *
 * Usage:
 *   Engine.register(myModule)
 *   await Engine.start()
 *   // game loop calls Engine.update(dt) each tick
 *   Engine.shutdown()
 */

import { EventBus } from './eventBus.js'
import { GameModule, ModuleRegistry } from './gameModule.js'

export type EngineState = 'idle' | 'initializing' | 'running' | 'shutting_down'

class EngineImpl {
    private state: EngineState = 'idle'
    private registry = new ModuleRegistry()

    /** Current lifecycle state (read-only for external callers). */
    getState(): EngineState {
        return this.state
    }

    isRunning(): boolean {
        return this.state === 'running'
    }

    /**
     * Register a GameModule. Must be called before `start()`.
     * Throws if the engine is already running or if a module with the same
     * name was registered before.
     */
    register(module: GameModule): void {
        if (this.state !== 'idle') {
            throw new Error(`[Engine] Cannot register module "${module.moduleName}" after start()`)
        }
        this.registry.register(module)
    }

    /**
     * Retrieve a previously registered module by name.
     * Useful for modules that need to call each other in controlled scenarios
     * (prefer EventBus for loose coupling).
     */
    getModule<T extends GameModule>(name: string): T {
        return this.registry.get<T>(name)
    }

    hasModule(name: string): boolean {
        return this.registry.has(name)
    }

    /**
     * Initialize all modules in registration order, then emit `engine:ready`.
     * Returns a Promise so async module initialization is supported.
     */
    async start(): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`[Engine] start() called in invalid state "${this.state}"`)
        }

        this.state = 'initializing'
        console.log('[Engine] Initializing…')

        try {
            await this.registry.initAll()
        } catch (err) {
            this.state = 'idle'
            console.error('[Engine] Initialization failed:', err)
            throw err
        }

        this.state = 'running'
        console.log('[Engine] Ready')
        EventBus.emit('engine:ready')
    }

    /**
     * Forward a game-tick update to all registered modules.
     * Must only be called while the engine is running.
     *
     * @param dt Delta time in seconds since last update.
     */
    update(dt: number): void {
        if (this.state !== 'running') { return }
        this.registry.updateAll(dt)
    }

    /**
     * Tear down all modules in reverse registration order, then emit
     * `engine:shutdown` and reset state to idle.
     */
    shutdown(): void {
        if (this.state !== 'running') {
            console.warn(`[Engine] shutdown() called in state "${this.state}" — ignoring`)
            return
        }

        this.state = 'shutting_down'
        console.log('[Engine] Shutting down…')

        this.registry.shutdownAll()

        EventBus.emit('engine:shutdown')

        this.state = 'idle'
        console.log('[Engine] Shutdown complete')
    }
}

export const Engine = new EngineImpl()
