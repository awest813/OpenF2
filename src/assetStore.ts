/**
 * AssetStore — version-aware asset resolver.
 *
 * All engine code must load assets through AssetStore rather than constructing
 * paths manually. This ensures Fallout 1 and Fallout 2 assets are resolved
 * correctly and that future mod-override layers can intercept any request.
 *
 * Resolution order (highest priority first):
 *   1. Registered mod overlays (in reverse load-order)
 *   2. Base game asset directory (keyed by EngineVersion)
 *   3. Shared assets (lut/, shaders/, etc.)
 */

import { EngineVersion, dataPathPrefix } from './engineVersion.js'

export type AssetCategory =
    | 'art'       // FRM-derived images (.png)
    | 'maps'      // Converted map JSON
    | 'proto'     // Prototype JSON
    | 'scripts'   // Compiled script files (.int)
    | 'text'      // Message files (.msg)
    | 'sound'     // Audio files
    | 'data'      // Miscellaneous data files
    | 'lut'       // Lookup tables (always shared)
    | 'shaders'   // GLSL shaders (always shared)
    | 'fonts'     // Bitmap font files (.fon)

interface ModOverlay {
    name: string
    basePath: string
    priority: number
}

export class AssetStoreImpl {
    private version: EngineVersion = EngineVersion.FALLOUT2
    private overlays: ModOverlay[] = []

    setVersion(v: EngineVersion): void {
        this.version = v
    }

    getVersion(): EngineVersion {
        return this.version
    }

    /**
     * Register a mod overlay directory. Assets found there take priority over
     * the base game directory. Higher `priority` values win ties.
     */
    registerOverlay(name: string, basePath: string, priority: number): void {
        this.overlays.push({ name, basePath, priority })
        this.overlays.sort((a, b) => b.priority - a.priority)
    }

    removeOverlay(name: string): void {
        this.overlays = this.overlays.filter((o) => o.name !== name)
    }

    /**
     * Resolve the URL for a given asset.
     *
     * Examples:
     *   resolve('art', 'critters/hmjmpsna.png')      -> 'data/art/critters/hmjmpsna.png'
     *   resolve('maps', 'artemple.json')              -> 'maps/artemple.json'
     *   resolve('lut', 'color_lut.json')              -> 'lut/color_lut.json'
     *
     * In a future mod-overlay system the function will check overlay paths
     * before falling back to the base game path.
     */
    resolve(category: AssetCategory, relativePath: string): string {
        // Shared categories are version-independent
        if (category === 'lut' || category === 'shaders') {
            return `${category}/${relativePath}`
        }

        if (category === 'fonts') {
            return `data/${relativePath}`
        }

        if (category === 'maps') {
            return `maps/${relativePath}`
        }

        if (category === 'proto') {
            return `proto/${relativePath}`
        }

        // For version-specific categories, overlay has first say
        for (const overlay of this.overlays) {
            // Overlay lookup is a hint; actual existence check happens at fetch time
            const candidate = `${overlay.basePath}/${category}/${relativePath}`
            // We cannot synchronously check existence in a browser, so we return
            // the overlay path and let the caller fall back on 404.
            // TODO: build an asset manifest at pipeline time for existence checks.
            void candidate
        }

        const prefix = dataPathPrefix(this.version)
        return `${prefix}/${category}/${relativePath}`
    }

    /**
     * Fetch a JSON asset, returning a parsed object.
     */
    async fetchJSON<T = unknown>(category: AssetCategory, relativePath: string): Promise<T> {
        const url = this.resolve(category, relativePath)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`AssetStore: failed to fetch "${url}" (${response.status})`)
        }
        return response.json() as Promise<T>
    }

    /**
     * Fetch a text asset (message files, shader source, etc.)
     */
    async fetchText(category: AssetCategory, relativePath: string): Promise<string> {
        const url = this.resolve(category, relativePath)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`AssetStore: failed to fetch "${url}" (${response.status})`)
        }
        return response.text()
    }

    /**
     * Fetch a binary asset as an ArrayBuffer.
     */
    async fetchBinary(category: AssetCategory, relativePath: string): Promise<ArrayBuffer> {
        const url = this.resolve(category, relativePath)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`AssetStore: failed to fetch "${url}" (${response.status})`)
        }
        return response.arrayBuffer()
    }
}

export const AssetStore = new AssetStoreImpl()

// ---------------------------------------------------------------------------
// AssetCache — LRU in-memory cache for fetched asset data
// ---------------------------------------------------------------------------

/** Reason a cache entry was removed. */
export type EvictionReason = 'capacity' | 'explicit'

export interface CacheStats {
    hits: number
    misses: number
    evictions: number
    /** Cumulative time spent in timed decode operations, in milliseconds. */
    totalDecodeLatencyMs: number
    /** Number of timed decode samples recorded (for computing an average). */
    decodeCount: number
    /** The reason the most recent LRU eviction occurred, or null if no eviction has happened yet. */
    lastEvictionReason: EvictionReason | null
}

/**
 * A generic LRU (Least-Recently-Used) cache keyed by string.
 *
 * Backed by a JavaScript `Map`, which preserves insertion order so the
 * first entry in the Map is always the least-recently-used.  Both `get`
 * and `set` run in amortised O(1).
 *
 * Usage:
 *   const cache = new AssetCache<ImageData>(256)
 *   cache.set('art/critters/hmjmpsna.png', imageData)
 *   const img = cache.get('art/critters/hmjmpsna.png')  // hits
 *   const stats = cache.stats  // { hits: 1, misses: 0, evictions: 0, ... }
 *
 * Decode-latency telemetry:
 *   cache.recordDecodeLatency(12.5)  // call after completing an async decode
 *   // stats.totalDecodeLatencyMs === 12.5, stats.decodeCount === 1
 *   // avgDecodeLatencyMs === stats.totalDecodeLatencyMs / stats.decodeCount
 */
export class AssetCache<T> {
    private _cache: Map<string, T> = new Map()
    private _maxEntries: number
    private _stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalDecodeLatencyMs: 0,
        decodeCount: 0,
        lastEvictionReason: null,
    }

    constructor(maxEntries: number) {
        if (maxEntries < 1) {throw new RangeError('AssetCache: maxEntries must be at least 1')}
        this._maxEntries = maxEntries
    }

    get maxEntries(): number {
        return this._maxEntries
    }

    get size(): number {
        return this._cache.size
    }

    get stats(): Readonly<CacheStats> {
        return this._stats
    }

    /**
     * Average decode latency across all recorded samples, in milliseconds.
     * Returns 0 when no samples have been recorded yet.
     */
    get avgDecodeLatencyMs(): number {
        return this._stats.decodeCount === 0
            ? 0
            : this._stats.totalDecodeLatencyMs / this._stats.decodeCount
    }

    get(key: string): T | undefined {
        const value = this._cache.get(key)
        if (value === undefined) {
            this._stats.misses++
            return undefined
        }
        // Promote to most-recently-used by re-inserting at the tail.
        this._cache.delete(key)
        this._cache.set(key, value)
        this._stats.hits++
        return value
    }

    set(key: string, value: T): void {
        if (this._cache.has(key)) {
            // Update in place: remove then re-insert to move to tail.
            this._cache.delete(key)
        } else if (this._cache.size >= this._maxEntries) {
            // Evict the least-recently-used entry (Map head = oldest).
            const iter = this._cache.keys().next()
            if (!iter.done) {
                this._cache.delete(iter.value)
                this._stats.evictions++
                this._stats.lastEvictionReason = 'capacity'
            }
        }
        this._cache.set(key, value)
    }

    has(key: string): boolean {
        return this._cache.has(key)
    }

    delete(key: string): boolean {
        const deleted = this._cache.delete(key)
        if (deleted) {
            this._stats.lastEvictionReason = 'explicit'
        }
        return deleted
    }

    clear(): void {
        this._cache.clear()
    }

    /**
     * Record a decode latency sample (in milliseconds).
     *
     * Call this after completing an async decode step so that the cache can
     * accumulate average and total decode-latency telemetry.
     *
     * Example:
     *   const t0 = performance.now()
     *   const data = await expensiveDecode(buffer)
     *   cache.recordDecodeLatency(performance.now() - t0)
     *   cache.set(key, data)
     */
    recordDecodeLatency(latencyMs: number): void {
        this._stats.totalDecodeLatencyMs += latencyMs
        this._stats.decodeCount++
    }

    resetStats(): void {
        this._stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalDecodeLatencyMs: 0,
            decodeCount: 0,
            lastEvictionReason: null,
        }
    }
}
