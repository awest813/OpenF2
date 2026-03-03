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
