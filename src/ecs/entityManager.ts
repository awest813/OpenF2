/**
 * EntityManager — creates, destroys, and queries entities and their components.
 *
 * This is the single source of truth for all entity state.
 * Systems must not store entity state locally; they must read/write through here.
 *
 * Performance considerations:
 *  - Component data is stored in per-type Maps for O(1) lookup by entity ID
 *  - Queries by component type iterate only entities that have that component
 *  - Entity IDs are monotonically increasing integers (never reused)
 */

import { EventBus } from '../eventBus.js'
import {
    AnyComponent,
    ComponentMap,
    ComponentType,
} from './components.js'

export type EntityId = number

/** Immutable snapshot of an entity for external reads. */
export interface Entity {
    readonly id: EntityId
    readonly components: ReadonlyMap<ComponentType, AnyComponent>
}

export class EntityManagerImpl {
    private nextId: EntityId = 1

    /** Per-component-type storage: Map<componentType, Map<entityId, component>> */
    private storage: Map<ComponentType, Map<EntityId, AnyComponent>> = new Map()

    /** Which entity IDs are alive. */
    private alive: Set<EntityId> = new Set()

    // ------------------------------------------------------------------
    // Entity lifecycle
    // ------------------------------------------------------------------

    create(): EntityId {
        const id = this.nextId++
        this.alive.add(id)
        EventBus.emit('entity:create', { id })
        return id
    }

    destroy(id: EntityId): void {
        if (!this.alive.has(id)) return
        for (const map of this.storage.values()) {
            map.delete(id)
        }
        this.alive.delete(id)
        EventBus.emit('entity:destroy', { id })
    }

    isAlive(id: EntityId): boolean {
        return this.alive.has(id)
    }

    allIds(): EntityId[] {
        // Return a snapshot array rather than the live Set so that callers
        // iterating the result are not affected by concurrent create/destroy
        // calls, and cannot accidentally mutate internal state by casting.
        return Array.from(this.alive)
    }

    // ------------------------------------------------------------------
    // Component operations
    // ------------------------------------------------------------------

    add<K extends ComponentType>(id: EntityId, component: ComponentMap[K]): void {
        if (!this.alive.has(id)) {
            throw new Error(`EntityManager: entity ${id} does not exist`)
        }
        let map = this.storage.get(component.componentType)
        if (!map) {
            map = new Map()
            this.storage.set(component.componentType, map)
        }
        map.set(id, component as AnyComponent)
    }

    remove(id: EntityId, type: ComponentType): void {
        this.storage.get(type)?.delete(id)
    }

    has(id: EntityId, type: ComponentType): boolean {
        return this.storage.get(type)?.has(id) ?? false
    }

    /**
     * Retrieve a component for an entity. Returns undefined if not present.
     * Use `get!` (non-null assertion) only when the component is guaranteed.
     */
    get<K extends ComponentType>(id: EntityId, type: K): ComponentMap[K] | undefined {
        return this.storage.get(type)?.get(id) as ComponentMap[K] | undefined
    }

    /**
     * Returns all entities that have all of the requested component types.
     *
     * Example:
     *   for (const id of EntityManager.query(['position', 'combat'])) { ... }
     */
    query(types: ComponentType[]): EntityId[] {
        if (types.length === 0) return Array.from(this.alive)

        // Start from the smallest set to minimize iteration
        let smallest: Map<EntityId, AnyComponent> | undefined
        for (const t of types) {
            const map = this.storage.get(t)
            if (!map || map.size === 0) return []
            if (!smallest || map.size < smallest.size) smallest = map
        }
        if (!smallest) return []

        const result: EntityId[] = []
        for (const id of smallest.keys()) {
            if (types.every((t) => this.storage.get(t)?.has(id))) {
                result.push(id)
            }
        }
        return result
    }

    // ------------------------------------------------------------------
    // Serialization helpers
    // ------------------------------------------------------------------

    /**
     * Serialize all entities and their components to a plain object.
     * Intended for save/load (Phase 0.4).
     */
    serialize(): SerializedWorld {
        const entities: SerializedEntity[] = []
        for (const id of this.alive) {
            const components: AnyComponent[] = []
            for (const map of this.storage.values()) {
                const c = map.get(id)
                if (c) components.push(c)
            }
            entities.push({ id, components })
        }
        return { version: 1, nextId: this.nextId, entities }
    }

    /**
     * Restore from a serialized snapshot.
     * All existing entities are destroyed first.
     */
    deserialize(world: SerializedWorld): void {
        // Clear all current state
        this.storage.clear()
        this.alive.clear()

        this.nextId = world.nextId
        for (const e of world.entities) {
            this.alive.add(e.id)
            for (const c of e.components) {
                let map = this.storage.get(c.componentType)
                if (!map) {
                    map = new Map()
                    this.storage.set(c.componentType, map)
                }
                map.set(e.id, c)
            }
        }
    }
}

export interface SerializedEntity {
    id: EntityId
    components: AnyComponent[]
}

export interface SerializedWorld {
    version: number
    nextId: EntityId
    entities: SerializedEntity[]
}

export const EntityManager = new EntityManagerImpl()
