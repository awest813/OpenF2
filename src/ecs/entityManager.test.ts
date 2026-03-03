/**
 * Regression tests for the EntityManager.
 *
 * Covers entity lifecycle, component operations, queries, and
 * the serialize/deserialize round-trip used by save/load.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EntityManagerImpl } from './entityManager.js'
import { PositionComponent, StatsComponent, zeroDamageStats } from './components.js'

// Each test uses its own fresh EntityManagerImpl so state does not leak.
let em: EntityManagerImpl

beforeEach(() => {
    em = new EntityManagerImpl()
})

// ---------------------------------------------------------------------------
// Entity lifecycle
// ---------------------------------------------------------------------------

describe('entity lifecycle', () => {
    it('creates entities with unique monotonically-increasing IDs', () => {
        const a = em.create()
        const b = em.create()
        expect(b).toBeGreaterThan(a)
    })

    it('reports new entity as alive', () => {
        const id = em.create()
        expect(em.isAlive(id)).toBe(true)
    })

    it('reports destroyed entity as not alive', () => {
        const id = em.create()
        em.destroy(id)
        expect(em.isAlive(id)).toBe(false)
    })

    it('destroying a non-existent entity is a no-op', () => {
        expect(() => em.destroy(9999)).not.toThrow()
    })

    it('allIds includes all living entities', () => {
        const a = em.create()
        const b = em.create()
        const c = em.create()
        em.destroy(b)
        const ids = Array.from(em.allIds())
        expect(ids).toContain(a)
        expect(ids).not.toContain(b)
        expect(ids).toContain(c)
    })
})

// ---------------------------------------------------------------------------
// Component operations
// ---------------------------------------------------------------------------

describe('component operations', () => {
    it('add and get a component', () => {
        const id = em.create()
        const pos: PositionComponent = { componentType: 'position', x: 3, y: 7, elevation: 0, facing: 2 }
        em.add(id, pos)
        const retrieved = em.get(id, 'position')
        expect(retrieved).toEqual(pos)
    })

    it('has returns true when component is present', () => {
        const id = em.create()
        em.add(id, { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 })
        expect(em.has(id, 'position')).toBe(true)
    })

    it('has returns false when component is absent', () => {
        const id = em.create()
        expect(em.has(id, 'position')).toBe(false)
    })

    it('remove deletes the component', () => {
        const id = em.create()
        em.add(id, { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 })
        em.remove(id, 'position')
        expect(em.has(id, 'position')).toBe(false)
    })

    it('add throws when entity does not exist', () => {
        expect(() =>
            em.add(9999, { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 })
        ).toThrow()
    })

    it('destroying entity removes all its components', () => {
        const id = em.create()
        em.add(id, { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 })
        em.destroy(id)
        expect(em.has(id, 'position')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

describe('query', () => {
    it('returns entities that have all specified components', () => {
        const a = em.create()
        const b = em.create()
        em.add(a, { componentType: 'position', x: 0, y: 0, elevation: 0, facing: 0 })
        em.add(a, { componentType: 'render', artKey: 'test', visible: true, zOffset: 0, outlineColor: null })
        em.add(b, { componentType: 'position', x: 1, y: 1, elevation: 0, facing: 0 })
        // b does not have 'render'

        const result = em.query(['position', 'render'])
        expect(result).toContain(a)
        expect(result).not.toContain(b)
    })

    it('returns all entities for an empty type list', () => {
        const a = em.create()
        const b = em.create()
        expect(em.query([])).toContain(a)
        expect(em.query([])).toContain(b)
    })

    it('returns empty array when no component storage for a type', () => {
        em.create()
        // 'audio' component has never been added
        expect(em.query(['audio'])).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
// serialize / deserialize round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
    it('round-trips entities and components faithfully', () => {
        const id = em.create()
        const pos: PositionComponent = { componentType: 'position', x: 10, y: 20, elevation: 1, facing: 3 }
        em.add(id, pos)

        const snapshot = em.serialize()
        const em2 = new EntityManagerImpl()
        em2.deserialize(snapshot)

        expect(em2.isAlive(id)).toBe(true)
        expect(em2.get(id, 'position')).toEqual(pos)
    })

    it('cleared manager has no entities after deserialize of empty world', () => {
        em.create()
        em.create()
        const em2 = new EntityManagerImpl()
        em2.deserialize({ version: 1, nextId: 1, entities: [] })
        expect(Array.from(em2.allIds())).toHaveLength(0)
    })

    it('preserves nextId counter across serialize/deserialize', () => {
        em.create()  // id = 1
        em.create()  // id = 2
        const snapshot = em.serialize()

        const em2 = new EntityManagerImpl()
        em2.deserialize(snapshot)
        const newId = em2.create()  // must be ≥ 3
        expect(newId).toBeGreaterThanOrEqual(3)
    })

    it('serialized version is 1', () => {
        const snapshot = em.serialize()
        expect(snapshot.version).toBe(1)
    })
})
