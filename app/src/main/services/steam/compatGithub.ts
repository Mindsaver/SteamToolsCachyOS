import type { ReleaseStub } from '../../../shared/compatToolsPure'

const ACCEPT = 'application/vnd.github+json'
const API_VER = '2022-11-28'

type CacheEntry = { body: unknown; etag: string | null; fetchedAt: number }
const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL_MS = 5 * 60 * 1000

function authHeaders(): Record<string, string> {
  const token = process.env.STEAMTOOLS_GITHUB_TOKEN?.trim()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function githubJson<T>(
  url: string,
  opts?: { ttlMs?: number; ifNoneMatch?: string | null }
): Promise<{ ok: boolean; status: number; data: T | null; etag: string | null; notModified: boolean }> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS
  const cached = cache.get(url)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < ttlMs && !opts?.ifNoneMatch) {
    return { ok: true, status: 200, data: cached.body as T, etag: cached.etag, notModified: false }
  }

  const headers: Record<string, string> = {
    Accept: ACCEPT,
    'X-GitHub-Api-Version': API_VER,
    'User-Agent': 'SteamToolsCachyOS/compat-install',
    ...authHeaders(),
  }
  const inm = opts?.ifNoneMatch ?? cached?.etag
  if (inm) headers['If-None-Match'] = inm

  const res = await fetch(url, { headers })
  const etag = res.headers.get('etag')

  if (res.status === 304 && cached) {
    return { ok: true, status: 304, data: cached.body as T, etag: cached.etag, notModified: true }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`)
  }

  const body = (await res.json()) as T
  cache.set(url, { body, etag, fetchedAt: Date.now() })
  return { ok: true, status: res.status, data: body, etag, notModified: false }
}

export async function fetchRepoReleases(
  owner: string,
  repo: string,
  maxPages = 3
): Promise<ReleaseStub[]> {
  const out: ReleaseStub[] = []
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`
    const { data } = await githubJson<unknown[]>(url)
    if (!data || !Array.isArray(data) || data.length === 0) break

    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      if (r['draft'] === true) continue
      const tag = typeof r['tag_name'] === 'string' ? r['tag_name'] : ''
      const published = typeof r['published_at'] === 'string' ? r['published_at'] : ''
      const assetsRaw = r['assets']
      const assets: ReleaseStub['assets'] = []
      if (Array.isArray(assetsRaw)) {
        for (const a of assetsRaw) {
          if (!a || typeof a !== 'object') continue
          const ar = a as Record<string, unknown>
          const name = typeof ar['name'] === 'string' ? ar['name'] : ''
          const u = typeof ar['browser_download_url'] === 'string' ? ar['browser_download_url'] : ''
          const size = typeof ar['size'] === 'number' ? ar['size'] : 0
          if (name && u) assets.push({ name, browser_download_url: u, size })
        }
      }
      if (tag) out.push({ tag_name: tag, published_at: published, assets })
    }
    if (data.length < 100) break
  }
  return out
}

export async function fetchReleaseByTag(
  owner: string,
  repo: string,
  tag: string
): Promise<ReleaseStub | null> {
  const enc = encodeURIComponent(tag)
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${enc}`
  try {
    const { data } = await githubJson<Record<string, unknown>>(url, { ttlMs: 60_000 })
    if (!data || typeof data !== 'object') return null
    const tag_name = typeof data['tag_name'] === 'string' ? data['tag_name'] : tag
    const published_at = typeof data['published_at'] === 'string' ? data['published_at'] : ''
    const assets: ReleaseStub['assets'] = []
    const assetsRaw = data['assets']
    if (Array.isArray(assetsRaw)) {
      for (const a of assetsRaw) {
        if (!a || typeof a !== 'object') continue
        const ar = a as Record<string, unknown>
        const name = typeof ar['name'] === 'string' ? ar['name'] : ''
        const u = typeof ar['browser_download_url'] === 'string' ? ar['browser_download_url'] : ''
        const size = typeof ar['size'] === 'number' ? ar['size'] : 0
        if (name && u) assets.push({ name, browser_download_url: u, size })
      }
    }
    return { tag_name, published_at, assets }
  } catch {
    return null
  }
}
