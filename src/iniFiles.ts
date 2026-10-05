/**
 * INI files for sfall's get_ini_setting / get_ini_string / set_ini_setting
 * and the get_ini_* metarules (IniFiles.cpp, IniReader). A setting is named
 * "file|section|key", the file relative to the game folder. Files are read
 * from the server once and kept; set_ini_setting changes the kept copy (a
 * browser cannot write the file back).
 */

import { getFileText } from './util.js'

/** Sections and keys by lower-case name, each keeping the name as written. */
export type IniSection = { name: string; values: Map<string, { key: string; value: string }> }
type IniData = Map<string, IniSection>

const cache = new Map<string, IniData | null>()

/** GetPrivateProfileString's parsing: [sections], key=value, ; comments, case-insensitive names. */
export function parseIni(text: string): IniData {
    const data: IniData = new Map()
    let section: IniSection | null = null
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line === '' || line.startsWith(';') || line.startsWith('#')) {continue}
        const head = /^\[([^\]]*)\]/.exec(line)
        if (head) {
            const name = head[1].trim()
            section = data.get(name.toLowerCase()) ?? { name, values: new Map() }
            data.set(name.toLowerCase(), section)
            continue
        }
        const eq = line.indexOf('=')
        if (eq < 0 || !section) {continue}
        let value = line.slice(eq + 1).trim()
        const comment = value.indexOf(';')
        if (comment >= 0) {value = value.slice(0, comment).trim()}
        const key = line.slice(0, eq).trim()
        section.values.set(key.toLowerCase(), { key, value })
    }
    return data
}

function normalizePath(file: string): string {
    return file.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

/** For tests and for files that are not on the server. */
export function setIniFile(file: string, text: string | null): void {
    cache.set(normalizePath(file), text === null ? null : parseIni(text))
}

export function readIniFile(file: string): IniData | null {
    const path = normalizePath(file)
    if (cache.has(path)) {return cache.get(path)!}
    let data: IniData | null = null
    for (const candidate of [path, 'data/' + path]) {
        try {
            data = parseIni(getFileText(candidate))
            break
        } catch {
            data = null
        }
    }
    cache.set(path, data)
    return data
}

/** ParseIniSetting: "file|section|key" (file under 64 characters, section up to 32). */
export function parseIniSetting(setting: string): { file: string; section: string; key: string } | null {
    const parts = String(setting ?? '').split('|')
    if (parts.length < 3) {return null}
    const [file, section] = parts
    const key = parts.slice(2).join('|')
    if (file.length >= 64 || section.length > 32) {return null}
    return { file, section, key }
}

export function iniString(file: string, section: string, key: string): string | undefined {
    return readIniFile(file)?.get(section.toLowerCase())?.values.get(key.toLowerCase())?.value
}

/** GetPrivateProfileInt: the leading number of the value, or the default when there is none. */
export function iniInt(file: string, section: string, key: string, def: number): number {
    const value = iniString(file, section, key)
    if (value === undefined) {return def}
    const m = /^[+-]?\d+/.exec(value)
    return m ? parseInt(m[0], 10) | 0 : 0
}

export function setIniString(file: string, section: string, key: string, value: string): boolean {
    const path = normalizePath(file)
    let data = readIniFile(file)
    if (!data) {
        data = new Map()
        cache.set(path, data)
    }
    const s = section.toLowerCase()
    if (!data.has(s)) {data.set(s, { name: section, values: new Map() })}
    data.get(s)!.values.set(key.toLowerCase(), { key, value })
    return true
}
