/**
 * Phase 4 performance milestone tests.
 *
 * This file is named phase6.test.ts following the repository convention where
 * each phaseN.test.ts file covers work from the preceding phase increment
 * (e.g. phase5.test.ts covers Phase 4 near-term priorities; this file covers
 * the Phase 4 performance milestone items).
 *
 * Covers:
 *   1. AssetCache — LRU eviction, hit/miss/eviction stats, edge cases
 *   2. SpriteBatch — begin/end lifecycle, draw-command sorting, stats, error guards
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 1. AssetCache — LRU in-memory cache
// ---------------------------------------------------------------------------

import { AssetCache } from './assetStore.js'

describe('AssetCache — construction', () => {
    it('starts empty', () => {
        const cache = new AssetCache<string>(10)
        expect(cache.size).toBe(0)
    })

    it('exposes maxEntries', () => {
        expect(new AssetCache<number>(32).maxEntries).toBe(32)
    })

    it('throws if maxEntries < 1', () => {
        expect(() => new AssetCache<number>(0)).toThrow()
        expect(() => new AssetCache<number>(-5)).toThrow()
    })

    it('starts with zero stats', () => {
        const cache = new AssetCache<string>(10)
        expect(cache.stats.hits).toBe(0)
        expect(cache.stats.misses).toBe(0)
        expect(cache.stats.evictions).toBe(0)
    })
})

describe('AssetCache — basic get/set/has/delete', () => {
    it('set and get round-trips a value', () => {
        const cache = new AssetCache<string>(10)
        cache.set('art/foo.png', 'image-data')
        expect(cache.get('art/foo.png')).toBe('image-data')
    })

    it('has() returns true for a stored key', () => {
        const cache = new AssetCache<number>(10)
        cache.set('key', 42)
        expect(cache.has('key')).toBe(true)
    })

    it('has() returns false for a missing key', () => {
        expect(new AssetCache<number>(10).has('missing')).toBe(false)
    })

    it('get() of a missing key returns undefined', () => {
        expect(new AssetCache<string>(10).get('nope')).toBeUndefined()
    })

    it('delete() removes an entry', () => {
        const cache = new AssetCache<string>(10)
        cache.set('k', 'v')
        cache.delete('k')
        expect(cache.has('k')).toBe(false)
        expect(cache.size).toBe(0)
    })

    it('delete() returns true when the key existed', () => {
        const cache = new AssetCache<string>(10)
        cache.set('k', 'v')
        expect(cache.delete('k')).toBe(true)
    })

    it('delete() returns false for a missing key', () => {
        expect(new AssetCache<string>(10).delete('ghost')).toBe(false)
    })

    it('clear() empties the cache', () => {
        const cache = new AssetCache<string>(10)
        cache.set('a', '1')
        cache.set('b', '2')
        cache.clear()
        expect(cache.size).toBe(0)
    })

    it('size increments on new inserts', () => {
        const cache = new AssetCache<number>(10)
        cache.set('x', 1)
        cache.set('y', 2)
        expect(cache.size).toBe(2)
    })

    it('size stays constant when updating an existing key', () => {
        const cache = new AssetCache<number>(10)
        cache.set('x', 1)
        cache.set('x', 99)
        expect(cache.size).toBe(1)
        expect(cache.get('x')).toBe(99)
    })
})

describe('AssetCache — hit/miss stats', () => {
    it('get() hit increments hits', () => {
        const cache = new AssetCache<string>(10)
        cache.set('k', 'v')
        cache.get('k')
        expect(cache.stats.hits).toBe(1)
        expect(cache.stats.misses).toBe(0)
    })

    it('get() miss increments misses', () => {
        const cache = new AssetCache<string>(10)
        cache.get('missing')
        expect(cache.stats.misses).toBe(1)
        expect(cache.stats.hits).toBe(0)
    })

    it('hit rate accumulates correctly', () => {
        const cache = new AssetCache<string>(10)
        cache.set('a', '1')
        cache.get('a')   // hit
        cache.get('a')   // hit
        cache.get('b')   // miss
        expect(cache.stats.hits).toBe(2)
        expect(cache.stats.misses).toBe(1)
    })

    it('resetStats() zeroes all counters', () => {
        const cache = new AssetCache<string>(10)
        cache.set('k', 'v')
        cache.get('k')
        cache.get('missing')
        cache.resetStats()
        expect(cache.stats.hits).toBe(0)
        expect(cache.stats.misses).toBe(0)
        expect(cache.stats.evictions).toBe(0)
    })
})

describe('AssetCache — LRU eviction', () => {
    it('does not evict when under capacity', () => {
        const cache = new AssetCache<number>(3)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)
        expect(cache.stats.evictions).toBe(0)
        expect(cache.size).toBe(3)
    })

    it('evicts the oldest entry when capacity is exceeded', () => {
        const cache = new AssetCache<number>(3)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)
        cache.set('d', 4)  // 'a' should be evicted
        expect(cache.has('a')).toBe(false)
        expect(cache.has('d')).toBe(true)
        expect(cache.stats.evictions).toBe(1)
    })

    it('a get() promotes an entry so it is not evicted', () => {
        const cache = new AssetCache<number>(3)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)
        cache.get('a')     // promote 'a' to MRU
        cache.set('d', 4)  // now 'b' (oldest) should be evicted, not 'a'
        expect(cache.has('a')).toBe(true)
        expect(cache.has('b')).toBe(false)
        expect(cache.has('d')).toBe(true)
    })

    it('eviction count matches the number of capacity-overflow inserts', () => {
        const cache = new AssetCache<number>(2)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)  // evicts 'a'
        cache.set('d', 4)  // evicts 'b'
        cache.set('e', 5)  // evicts 'c'
        expect(cache.stats.evictions).toBe(3)
    })

    it('update of an existing key does not trigger eviction', () => {
        const cache = new AssetCache<number>(2)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('a', 99)  // update — no new entry, no eviction
        expect(cache.stats.evictions).toBe(0)
        expect(cache.size).toBe(2)
    })

    it('capacity-1 cache evicts on every new-key insert', () => {
        const cache = new AssetCache<string>(1)
        cache.set('first', 'v1')
        cache.set('second', 'v2')
        expect(cache.has('first')).toBe(false)
        expect(cache.has('second')).toBe(true)
        expect(cache.stats.evictions).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// 2. SpriteBatch — batching draw commands
// ---------------------------------------------------------------------------

import { SpriteBatch, DrawLayer } from './renderBatch.js'

describe('SpriteBatch — lifecycle', () => {
    it('starts closed (isOpen = false)', () => {
        expect(new SpriteBatch().isOpen).toBe(false)
    })

    it('isOpen is true between begin() and end()', () => {
        const batch = new SpriteBatch()
        batch.begin()
        expect(batch.isOpen).toBe(true)
        batch.end()
        expect(batch.isOpen).toBe(false)
    })

    it('end() returns an array', () => {
        const batch = new SpriteBatch()
        batch.begin()
        const result = batch.end()
        expect(Array.isArray(result)).toBe(true)
    })

    it('end() returns empty array when no draws were queued', () => {
        const batch = new SpriteBatch()
        batch.begin()
        expect(batch.end()).toHaveLength(0)
    })

    it('begin() while already open throws', () => {
        const batch = new SpriteBatch()
        batch.begin()
        expect(() => batch.begin()).toThrow()
    })

    it('end() without begin() throws', () => {
        expect(() => new SpriteBatch().end()).toThrow()
    })

    it('draw() outside begin/end throws', () => {
        const batch = new SpriteBatch()
        expect(() => batch.draw('key', 0, 0, 32, 32)).toThrow()
    })

    it('can be reused across multiple frames', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.end()

        batch.begin()
        batch.draw('b', 10, 10, 64, 64)
        const cmds = batch.end()
        expect(cmds).toHaveLength(1)
        expect(cmds[0].textureKey).toBe('b')
    })
})

describe('SpriteBatch — draw commands', () => {
    it('draw() records the command with all supplied fields', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('tiles/floor01', 10, 20, 80, 36, 2, DrawLayer.Floor)
        const [cmd] = batch.end()
        expect(cmd.textureKey).toBe('tiles/floor01')
        expect(cmd.x).toBe(10)
        expect(cmd.y).toBe(20)
        expect(cmd.width).toBe(80)
        expect(cmd.height).toBe(36)
        expect(cmd.frame).toBe(2)
        expect(cmd.layer).toBe(DrawLayer.Floor)
    })

    it('frame defaults to 0', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('key', 0, 0, 32, 32)
        const [cmd] = batch.end()
        expect(cmd.frame).toBe(0)
    })

    it('layer defaults to DrawLayer.Object', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('key', 0, 0, 32, 32)
        const [cmd] = batch.end()
        expect(cmd.layer).toBe(DrawLayer.Object)
    })

    it('multiple draws are all returned', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.draw('b', 32, 0, 32, 32)
        batch.draw('c', 64, 0, 32, 32)
        expect(batch.end()).toHaveLength(3)
    })
})

describe('SpriteBatch — sorting', () => {
    it('sorts commands by layer ascending', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('roof01', 0, 0, 80, 36, 0, DrawLayer.Roof)
        batch.draw('floor01', 0, 0, 80, 36, 0, DrawLayer.Floor)
        batch.draw('obj01', 0, 0, 64, 32, 0, DrawLayer.Object)
        const cmds = batch.end()
        expect(cmds[0].layer).toBe(DrawLayer.Floor)
        expect(cmds[1].layer).toBe(DrawLayer.Object)
        expect(cmds[2].layer).toBe(DrawLayer.Roof)
    })

    it('sorts by textureKey within the same layer', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('zzz', 0, 0, 32, 32, 0, DrawLayer.Object)
        batch.draw('aaa', 0, 0, 32, 32, 0, DrawLayer.Object)
        batch.draw('mmm', 0, 0, 32, 32, 0, DrawLayer.Object)
        const cmds = batch.end()
        expect(cmds[0].textureKey).toBe('aaa')
        expect(cmds[1].textureKey).toBe('mmm')
        expect(cmds[2].textureKey).toBe('zzz')
    })

    it('layer takes precedence over textureKey in sort', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('aaa', 0, 0, 32, 32, 0, DrawLayer.Roof)     // layer 2, key 'aaa'
        batch.draw('zzz', 0, 0, 32, 32, 0, DrawLayer.Floor)    // layer 0, key 'zzz'
        const cmds = batch.end()
        // Floor (layer 0) must come before Roof (layer 2), even though 'aaa' < 'zzz'
        expect(cmds[0].layer).toBe(DrawLayer.Floor)
        expect(cmds[1].layer).toBe(DrawLayer.Roof)
    })
})

describe('SpriteBatch — stats', () => {
    it('initial stats are all zero', () => {
        const stats = new SpriteBatch().stats
        expect(stats.drawCount).toBe(0)
        expect(stats.uniqueTextures).toBe(0)
        expect(stats.bindsSaved).toBe(0)
    })

    it('drawCount equals total commands submitted', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.draw('b', 0, 0, 32, 32)
        batch.draw('a', 0, 0, 32, 32)  // duplicate key
        batch.end()
        expect(batch.stats.drawCount).toBe(3)
    })

    it('uniqueTextures counts distinct texture keys', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.draw('b', 0, 0, 32, 32)
        batch.draw('a', 0, 0, 32, 32)
        batch.end()
        expect(batch.stats.uniqueTextures).toBe(2)  // only 'a' and 'b'
    })

    it('bindsSaved = drawCount - uniqueTextures', () => {
        const batch = new SpriteBatch()
        batch.begin()
        for (let i = 0; i < 5; i++) batch.draw('shared', i * 10, 0, 32, 32)
        batch.end()
        // 5 draws, 1 unique texture → 4 binds saved
        expect(batch.stats.bindsSaved).toBe(4)
    })

    it('bindsSaved is 0 when all textures are unique', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.draw('b', 0, 0, 32, 32)
        batch.draw('c', 0, 0, 32, 32)
        batch.end()
        expect(batch.stats.bindsSaved).toBe(0)
    })

    it('bindsSaved is 0 for an empty batch', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.end()
        expect(batch.stats.bindsSaved).toBe(0)
    })

    it('stats update after each end()', () => {
        const batch = new SpriteBatch()

        batch.begin()
        batch.draw('x', 0, 0, 32, 32)
        batch.end()
        expect(batch.stats.drawCount).toBe(1)

        batch.begin()
        batch.draw('x', 0, 0, 32, 32)
        batch.draw('x', 0, 0, 32, 32)
        batch.end()
        expect(batch.stats.drawCount).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// 3. AssetCache — extended telemetry (decode latency + eviction reason)
// ---------------------------------------------------------------------------

describe('AssetCache — decode latency telemetry', () => {
    it('starts with totalDecodeLatencyMs = 0 and decodeCount = 0', () => {
        const cache = new AssetCache<string>(10)
        expect(cache.stats.totalDecodeLatencyMs).toBe(0)
        expect(cache.stats.decodeCount).toBe(0)
    })

    it('avgDecodeLatencyMs returns 0 when no samples recorded', () => {
        expect(new AssetCache<string>(10).avgDecodeLatencyMs).toBe(0)
    })

    it('recordDecodeLatency accumulates totalDecodeLatencyMs', () => {
        const cache = new AssetCache<string>(10)
        cache.recordDecodeLatency(10)
        cache.recordDecodeLatency(20)
        expect(cache.stats.totalDecodeLatencyMs).toBe(30)
    })

    it('recordDecodeLatency increments decodeCount', () => {
        const cache = new AssetCache<string>(10)
        cache.recordDecodeLatency(5)
        cache.recordDecodeLatency(15)
        expect(cache.stats.decodeCount).toBe(2)
    })

    it('avgDecodeLatencyMs equals total / count', () => {
        const cache = new AssetCache<string>(10)
        cache.recordDecodeLatency(10)
        cache.recordDecodeLatency(30)
        expect(cache.avgDecodeLatencyMs).toBe(20)
    })

    it('resetStats clears decode latency fields', () => {
        const cache = new AssetCache<string>(10)
        cache.recordDecodeLatency(42)
        cache.resetStats()
        expect(cache.stats.totalDecodeLatencyMs).toBe(0)
        expect(cache.stats.decodeCount).toBe(0)
        expect(cache.avgDecodeLatencyMs).toBe(0)
    })
})

describe('AssetCache — eviction reason telemetry', () => {
    it('lastEvictionReason starts as null', () => {
        expect(new AssetCache<string>(10).stats.lastEvictionReason).toBeNull()
    })

    it('capacity overflow sets lastEvictionReason to "capacity"', () => {
        const cache = new AssetCache<number>(2)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3)  // evicts 'a'
        expect(cache.stats.lastEvictionReason).toBe('capacity')
    })

    it('explicit delete sets lastEvictionReason to "explicit"', () => {
        const cache = new AssetCache<number>(10)
        cache.set('a', 1)
        cache.delete('a')
        expect(cache.stats.lastEvictionReason).toBe('explicit')
    })

    it('explicit delete after capacity eviction updates lastEvictionReason', () => {
        const cache = new AssetCache<number>(1)
        cache.set('a', 1)
        cache.set('b', 2)  // evicts 'a' → capacity
        cache.set('c', 3)  // evicts 'b' → capacity
        cache.delete('c')  // explicit
        expect(cache.stats.lastEvictionReason).toBe('explicit')
    })

    it('resetStats clears lastEvictionReason', () => {
        const cache = new AssetCache<number>(1)
        cache.set('a', 1)
        cache.set('b', 2)
        cache.resetStats()
        expect(cache.stats.lastEvictionReason).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// 4. SpriteBatch — frame-time telemetry
// ---------------------------------------------------------------------------

describe('SpriteBatch — frame-time telemetry', () => {
    it('initial frameTimeMs is 0', () => {
        expect(new SpriteBatch().stats.frameTimeMs).toBe(0)
    })

    it('frameTimeMs is non-negative after completing a frame', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.draw('a', 0, 0, 32, 32)
        batch.end()
        expect(batch.stats.frameTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('frameTimeMs is a finite number after end()', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.end()
        expect(Number.isFinite(batch.stats.frameTimeMs)).toBe(true)
    })

    it('frameTimeMs is refreshed on each successive frame', () => {
        const batch = new SpriteBatch()
        batch.begin()
        batch.end()

        batch.begin()
        batch.end()
        expect(typeof batch.stats.frameTimeMs).toBe('number')
        expect(batch.stats.frameTimeMs).toBeGreaterThanOrEqual(0)
    })
})
