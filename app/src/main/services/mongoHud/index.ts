import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'
import type {
  HudDocument,
  HudVersionMeta,
  MongoConnectionProfile,
  MongoHudPreviewRequest,
  MongoHudPreviewResult,
  MongoHudSaveResult,
} from '../../../shared/types'

interface MongoHudStore {
  connections: MongoConnectionProfile[]
  documents: HudDocument[]
  versions: Array<HudVersionMeta & { snapshot: HudDocument }>
}

const STORE_FILE = path.join(app.getPath('userData'), 'mongo-hud-store.json')

function now(): number {
  return Date.now()
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function emptyStore(): MongoHudStore {
  return { connections: [], documents: [], versions: [] }
}

function readStore(): MongoHudStore {
  try {
    if (!fs.existsSync(STORE_FILE)) return emptyStore()
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Partial<MongoHudStore>
    return {
      connections: parsed.connections ?? [],
      documents: parsed.documents ?? [],
      versions: parsed.versions ?? [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: MongoHudStore): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
  const tmp = `${STORE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8')
  fs.renameSync(tmp, STORE_FILE)
}

export function listMongoHudConnections(): MongoConnectionProfile[] {
  return readStore().connections
}

export function saveMongoHudConnection(
  profile: Pick<MongoConnectionProfile, 'id' | 'name' | 'connectionString' | 'database'>
): MongoConnectionProfile {
  const store = readStore()
  const ts = now()
  const id = profile.id?.trim() || makeId('conn')
  const next: MongoConnectionProfile = {
    id,
    name: profile.name.trim(),
    connectionString: profile.connectionString.trim(),
    database: profile.database.trim(),
    createdAt: ts,
    updatedAt: ts,
  }
  const existingIdx = store.connections.findIndex((c) => c.id === id)
  if (existingIdx >= 0) {
    next.createdAt = store.connections[existingIdx].createdAt
    store.connections[existingIdx] = next
  } else {
    store.connections.push(next)
  }
  writeStore(store)
  return next
}

export function deleteMongoHudConnection(id: string): MongoHudSaveResult {
  const store = readStore()
  const before = store.connections.length
  store.connections = store.connections.filter((c) => c.id !== id)
  if (store.connections.length === before) return { ok: false, error: 'Connection not found' }
  for (const doc of store.documents) {
    if (doc.connectionId === id) doc.connectionId = null
  }
  writeStore(store)
  return { ok: true }
}

export function listMongoHudDocuments(): HudDocument[] {
  return readStore().documents
}

export function getMongoHudDocument(id: string): HudDocument | null {
  return readStore().documents.find((d) => d.id === id) ?? null
}

export function saveMongoHudDocument(doc: HudDocument): HudDocument {
  const store = readStore()
  const ts = now()
  const id = doc.id?.trim() || makeId('doc')
  const next: HudDocument = { ...doc, id, updatedAt: ts, createdAt: doc.createdAt || ts }
  const idx = store.documents.findIndex((d) => d.id === id)
  if (idx >= 0) store.documents[idx] = next
  else store.documents.push(next)
  writeStore(store)
  return next
}

export function deleteMongoHudDocument(id: string): MongoHudSaveResult {
  const store = readStore()
  const before = store.documents.length
  store.documents = store.documents.filter((d) => d.id !== id)
  store.versions = store.versions.filter((v) => v.documentId !== id)
  if (before === store.documents.length) return { ok: false, error: 'Document not found' }
  writeStore(store)
  return { ok: true }
}

export function exportMongoHudDocument(id: string): { ok: true; json: string } | { ok: false; error: string } {
  const doc = getMongoHudDocument(id)
  if (!doc) return { ok: false, error: 'Document not found' }
  return { ok: true, json: JSON.stringify(doc, null, 2) }
}

export function importMongoHudDocument(jsonText: string): { ok: true; doc: HudDocument } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonText) as HudDocument
    const imported: HudDocument = {
      ...parsed,
      id: makeId('doc'),
      name: parsed.name?.trim() || 'Imported HUD',
      createdAt: now(),
      updatedAt: now(),
    }
    const saved = saveMongoHudDocument(imported)
    return { ok: true, doc: saved }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

export function listMongoHudVersions(documentId: string): HudVersionMeta[] {
  return readStore()
    .versions
    .filter((v) => v.documentId === documentId)
    .map(({ snapshot: _snapshot, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function createMongoHudVersion(documentId: string, label: string): MongoHudSaveResult {
  const store = readStore()
  const doc = store.documents.find((d) => d.id === documentId)
  if (!doc) return { ok: false, error: 'Document not found' }
  store.versions.push({
    id: makeId('ver'),
    documentId,
    label: label.trim() || `Version ${new Date().toLocaleString()}`,
    createdAt: now(),
    snapshot: JSON.parse(JSON.stringify(doc)) as HudDocument,
  })
  writeStore(store)
  return { ok: true }
}

export function restoreMongoHudVersion(versionId: string): { ok: true; doc: HudDocument } | { ok: false; error: string } {
  const store = readStore()
  const version = store.versions.find((v) => v.id === versionId)
  if (!version) return { ok: false, error: 'Version not found' }
  const restored = { ...version.snapshot, updatedAt: now() }
  const idx = store.documents.findIndex((d) => d.id === version.documentId)
  if (idx >= 0) store.documents[idx] = restored
  else store.documents.push(restored)
  writeStore(store)
  return { ok: true, doc: restored }
}

export async function testMongoHudConnection(connectionString: string): Promise<MongoHudSaveResult> {
  const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000 })
  try {
    await client.connect()
    await client.db('admin').command({ ping: 1 })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed' }
  } finally {
    await client.close()
  }
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    if (!value.trim()) return fallback
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function runMongoHudPreviewQuery(req: MongoHudPreviewRequest): Promise<MongoHudPreviewResult> {
  const store = readStore()
  const connection = store.connections.find((c) => c.id === req.connectionId)
  if (!connection) return { ok: false, error: 'Connection profile not found' }
  const client = new MongoClient(connection.connectionString, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 })
  try {
    const filter = safeJson<Record<string, unknown>>(req.query, {})
    const projection = safeJson<Record<string, unknown>>(req.projection, {})
    await client.connect()
    const rows = (await client
      .db(connection.database)
      .collection(req.collection)
      .find(filter, { projection })
      .limit(Math.max(1, Math.min(200, req.limit)))
      .toArray()) as Record<string, unknown>[]
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Preview query failed' }
  } finally {
    await client.close()
  }
}
