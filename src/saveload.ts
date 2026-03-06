/*
Copyright 2017 darkf

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import globalState from './globalState.js'
import { deserializeObj } from './object.js'
import { SAVE_VERSION, SaveGame, migrateSave } from './saveSchema.js'
import { hydrateStateFromSave, snapshotSaveData } from './saveStateFidelity.js'

export { SAVE_VERSION, SaveGame, migrateSave }

// Saving and loading support

let db: IDBDatabase

export function formatSaveDate(save: SaveGame): string {
    const date = new Date(save.timestamp)
    return `${
        date.getMonth() + 1
    }/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
}

function withTransaction(f: (trans: IDBTransaction) => void, finished?: () => void) {
    const trans = db.transaction('saves', 'readwrite')
    if (finished) {
        trans.oncomplete = finished
    }
    trans.onerror = (e: any) => {
        console.error('Database error: ' + (<any>e.target).errorCode)
    }
    f(trans)
}

function getAll<T>(store: IDBObjectStore, callback?: (result: T[]) => void) {
    const out: T[] = []

    store.openCursor().onsuccess = function (e) {
        const cursor = (<any>e.target).result
        if (cursor) {
            out.push(cursor.value)
            cursor.continue()
        } else if (callback) {
            callback(out)
        }
    }
}

export function saveList(callback: (saves: SaveGame[]) => void): void {
    withTransaction((trans) => {
        getAll(trans.objectStore('saves'), callback)
    })
}

export function debugSaveList(): void {
    saveList((saves: SaveGame[]) => {
        console.log('Save List:')
        for (const savegame of saves) {
            console.log('  -', savegame.name, formatSaveDate(savegame), savegame)
        }
    })
}

export function debugSave(): void {
    save('debug', undefined, () => {
        console.log('[SaveLoad] Done')
    })
}

export function save(name: string, slot = -1, callback?: () => void): void {
    const save = snapshotSaveData(name, Date.now(), SAVE_VERSION, globalState)

    const dirtyMapNames = Object.keys(globalState.dirtyMapCache)
    console.log(
        `[SaveLoad] Saving ${1 + dirtyMapNames.length} maps (current: ${
            globalState.gMap.name
        } plus dirty maps: ${dirtyMapNames.join(', ')})`
    )

    if (slot !== -1) {
        save.id = slot
    }

    withTransaction((trans) => {
        trans.objectStore('saves').put(save)

        console.log("[SaveLoad] Saving game data as '%s'", name)
    }, callback)
}

export function load(id: number): void {
    // Load stored savegame with id

    withTransaction((trans) => {
        trans.objectStore('saves').get(id).onsuccess = function (e) {
            const save: SaveGame = migrateSave((<any>e.target).result)

            console.log("[SaveLoad] Loading save #%d ('%s') from %s", id, save.name, formatSaveDate(save))
            hydrateStateFromSave(save, globalState, deserializeObj)
        }
    })
}

export function saveLoadInit(): void {
    const request = indexedDB.open('darkfo', 1)

    request.onupgradeneeded = function () {
        const db = request.result
        const store = db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true })
    }

    request.onsuccess = function () {
        db = request.result

        db.onerror = function (e) {
            console.error('Database error: ' + (<any>e.target).errorCode)
        }

        console.log('Established DB connection')
    }
}
