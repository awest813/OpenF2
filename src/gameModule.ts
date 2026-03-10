/**
 * GameModule — base interface that every engine subsystem must implement.
 *
 * Lifecycle:
 *   1. `init()` — called once after the engine and asset store are ready
 *   2. `update(dt)` — called every game tick (not every render frame)
 *   3. `shutdown()` — called when the engine is tearing down
 *
 * Modules register themselves with the Engine singleton; the Engine drives
 * the lifecycle. Modules must not call each other's methods directly —
 * they communicate through EventBus.
 */
export interface GameModule {
    readonly moduleName: string
    init(): void | Promise<void>
    update(dt: number): void
    shutdown(): void
}

/**
 * ModuleRegistry — keeps an ordered list of all registered modules and
 * forwards lifecycle calls from the Engine.
 */
export class ModuleRegistry {
    private modules: GameModule[] = []
    private moduleMap: Map<string, GameModule> = new Map()

    register(module: GameModule): void {
        if (this.moduleMap.has(module.moduleName)) {
            throw new Error(`Module "${module.moduleName}" is already registered`)
        }
        this.modules.push(module)
        this.moduleMap.set(module.moduleName, module)
    }

    get<T extends GameModule>(name: string): T {
        const mod = this.moduleMap.get(name)
        if (!mod) {throw new Error(`Module "${name}" not found`)}
        return mod as T
    }

    has(name: string): boolean {
        return this.moduleMap.has(name)
    }

    async initAll(): Promise<void> {
        for (const mod of this.modules) {
            await mod.init()
        }
    }

    updateAll(dt: number): void {
        for (const mod of this.modules) {
            mod.update(dt)
        }
    }

    shutdownAll(): void {
        for (let i = this.modules.length - 1; i >= 0; i--) {
            try {
                this.modules[i].shutdown()
            } catch (err) {
                console.error(`[ModuleRegistry] Error shutting down module "${this.modules[i].moduleName}":`, err)
            }
        }
    }
}
