import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomBytes, createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  CompatProviderId,
  CachyosArchChoice,
  CompatInstallProgress,
  CompatUpdateCheckResult,
} from '../../../shared/types'
import {
  pickGeArchiveAsset,
  pickGeSha512Asset,
  pickCachyosArchiveAsset,
  pickCachyosSha512Asset,
  filterCachyosReleases,
  compareGeTagsDesc,
  bestInstalledGeTag,
  bestInstalledCachyosTagFromReleases,
  extractCachyosTagFromText,
} from '../../../shared/compatToolsPure'
import type { ReleaseStub } from '../../../shared/compatToolsPure'
import { fetchReleaseByTag, fetchRepoReleases } from './compatGithub'
import { listInstalledCompatTools } from './compatInstalled'
import { isSteamRunning } from './processes'

const execFileAsync = promisify(execFile)

const GE_OWNER = 'GloriousEggroll'
const GE_REPO = 'proton-ge-custom'
const CACHY_OWNER = 'CachyOS'
const CACHY_REPO = 'proton-cachyos'

function emit(cb: ((p: CompatInstallProgress) => void) | undefined, p: CompatInstallProgress): void {
  cb?.(p)
}

async function verifySha512File(
  filePath: string,
  sumFilePath: string,
  archiveBasename: string
): Promise<void> {
  const raw = await fs.promises.readFile(sumFilePath, 'utf-8')
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let expected: string | null = null
  for (const line of lines) {
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const hash = parts[0].toLowerCase()
    const namePart = parts.slice(1).join(' ').replace(/^\*/, '').trim()
    if (namePart === archiveBasename || namePart.endsWith(archiveBasename)) {
      expected = hash
      break
    }
  }
  if (!expected) throw new Error(`No SHA512 line for ${archiveBasename} in checksum file`)

  const hash = createHash('sha512')
  const rs = fs.createReadStream(filePath)
  await pipeline(rs, hash)
  const got = hash.digest('hex').toLowerCase()
  if (got !== expected) throw new Error('SHA512 checksum mismatch')
}

async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })

  let loaded = 0
  const webBody = res.body as import('stream/web').ReadableStream<Uint8Array>
  const nodeIn = Readable.fromWeb(webBody)
  nodeIn.on('data', (chunk: string | Uint8Array) => {
    loaded += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
    onProgress?.(loaded, total)
  })
  await pipeline(nodeIn, fs.createWriteStream(dest))
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const lower = archivePath.toLowerCase()
  let args: string[]
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    args = ['-xzf', archivePath, '-C', destDir]
  } else if (lower.endsWith('.tar.zst') || lower.endsWith('.tzst')) {
    try {
      await execFileAsync('tar', ['--zstd', '-xf', archivePath, '-C', destDir], {
        maxBuffer: 64 * 1024 * 1024,
      })
      return
    } catch {
      await execFileAsync('tar', ['-I', 'zstd', '-xf', archivePath, '-C', destDir], {
        maxBuffer: 64 * 1024 * 1024,
      })
      return
    }
  } else if (lower.endsWith('.tar.xz')) {
    args = ['-xJf', archivePath, '-C', destDir]
  } else {
    throw new Error(`Unsupported archive: ${archivePath}`)
  }
  await execFileAsync('tar', args, { maxBuffer: 64 * 1024 * 1024 })
}


function tmpCompatDir(): string {
  return path.join(os.tmpdir(), `steamtools-compat-${randomBytes(8).toString('hex')}`)
}

export async function installCompatRelease(options: {
  provider: CompatProviderId
  tag: string
  steamInstall: string
  cachyosArch?: CachyosArchChoice
  onProgress?: (p: CompatInstallProgress) => void
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { provider, tag, steamInstall, cachyosArch = 'x86_64', onProgress } = options
  if (isSteamRunning()) {
    emit(onProgress, {
      type: 'log',
      message:
        'Steam is running — install continues. Restart Steam when finished so the new build appears under Properties → Compatibility.',
    })
  }

  if (!steamInstall.trim() || !fs.existsSync(steamInstall)) {
    return { ok: false, error: 'Steam install path not found' }
  }
  const destRoot = path.join(steamInstall, 'compatibilitytools.d')
  await fs.promises.mkdir(destRoot, { recursive: true })

  const work = tmpCompatDir()
  await fs.promises.mkdir(work, { recursive: true })

  try {
    emit(onProgress, { type: 'log', message: `Resolving ${provider} ${tag}…` })

    let release: ReleaseStub | null = null
    if (provider === 'ge_proton') {
      release = await fetchReleaseByTag(GE_OWNER, GE_REPO, tag)
    } else {
      release = await fetchReleaseByTag(CACHY_OWNER, CACHY_REPO, tag)
    }
    if (!release) return { ok: false, error: `Release not found for tag ${tag}` }

    let archive: { name: string; browser_download_url: string; size: number } | null = null
    let sumAsset: { name: string; browser_download_url: string } | null = null

    if (provider === 'ge_proton') {
      archive = pickGeArchiveAsset(release.assets, release.tag_name)
      sumAsset = pickGeSha512Asset(release.assets, release.tag_name)
    } else {
      archive = pickCachyosArchiveAsset(release.assets, release.tag_name, cachyosArch)
      sumAsset = pickCachyosSha512Asset(release.assets, release.tag_name, cachyosArch)
    }

    if (!archive) {
      return { ok: false, error: 'No matching archive asset on this release' }
    }

    const archivePath = path.join(work, archive.name)
    emit(onProgress, { type: 'log', message: `Downloading ${archive.name}…` })

    await downloadToFile(archive.browser_download_url, archivePath, (loaded, total) => {
      if (total && total > 0) {
        emit(onProgress, {
          type: 'progress',
          message: 'Downloading…',
          current: loaded,
          total,
        })
      }
    })

    if (sumAsset) {
      const sumPath = path.join(work, sumAsset.name)
      emit(onProgress, { type: 'log', message: 'Verifying SHA512…' })
      await downloadToFile(sumAsset.browser_download_url, sumPath)
      await verifySha512File(archivePath, sumPath, archive.name)
    }

    emit(onProgress, { type: 'log', message: `Extracting into ${destRoot}…` })
    await extractArchive(archivePath, destRoot)

    emit(onProgress, { type: 'done', message: `Installed ${archive.name}` })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    emit(onProgress, { type: 'error', message: msg })
    return { ok: false, error: msg }
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

export async function listGeReleasesForUi(): Promise<ReleaseStub[]> {
  const all = await fetchRepoReleases(GE_OWNER, GE_REPO, 2)
  return all.filter((r) => r.tag_name && /^GE-Proton/i.test(r.tag_name))
}

export async function listCachyosReleasesForUi(slrOnly: boolean): Promise<ReleaseStub[]> {
  const all = await fetchRepoReleases(CACHY_OWNER, CACHY_REPO, 3)
  const filtered = filterCachyosReleases(all, slrOnly)
  filtered.sort((a, b) => {
    const ta = Date.parse(a.published_at) || 0
    const tb = Date.parse(b.published_at) || 0
    return tb - ta
  })
  return filtered
}

export function getInstalledCompatRows(steamInstall: string) {
  return listInstalledCompatTools(steamInstall)
}

export async function checkGeProtonUpdate(steamInstall: string): Promise<CompatUpdateCheckResult> {
  const rows = listInstalledCompatTools(steamInstall)
  const geNames = rows.filter((r) => r.provider === 'ge_proton').map((r) => r.internalName)
  const installedBest = bestInstalledGeTag(geNames)

  const releases = await listGeReleasesForUi()
  releases.sort((a, b) => compareGeTagsDesc(a.tag_name, b.tag_name))
  const remoteTag = releases[0]?.tag_name ?? null
  if (!remoteTag) {
    return {
      provider: 'ge_proton',
      hasUpdate: false,
      remoteTag: null,
      installedBestTag: installedBest,
      releaseUrl: null,
    }
  }
  const hasUpdate =
    !installedBest || compareGeTagsDesc(remoteTag, installedBest) < 0
  return {
    provider: 'ge_proton',
    hasUpdate,
    remoteTag,
    installedBestTag: installedBest,
    releaseUrl: `https://github.com/${GE_OWNER}/${GE_REPO}/releases/tag/${encodeURIComponent(remoteTag)}`,
  }
}

export async function checkCachyosUpdate(
  steamInstall: string,
  slrOnly: boolean,
  arch: CachyosArchChoice
): Promise<CompatUpdateCheckResult> {
  const rows = listInstalledCompatTools(steamInstall)
  const tagSet = new Set<string>()
  for (const r of rows.filter((x) => x.provider === 'proton_cachyos')) {
    for (const text of [r.internalName, r.dirName]) {
      const ex = extractCachyosTagFromText(text)
      if (ex) tagSet.add(ex)
    }
  }
  const tagsFromRows = [...tagSet]

  const releases = await listCachyosReleasesForUi(slrOnly)
  const remoteTag = releases[0]?.tag_name ?? null

  const installedBest =
    tagsFromRows.length > 0 ? bestInstalledCachyosTagFromReleases(tagsFromRows, releases) : null

  let hasUpdate = false
  if (remoteTag && releases.length) {
    const remoteRelease = releases.find((r) => r.tag_name === remoteTag)
    const asset = remoteRelease
      ? pickCachyosArchiveAsset(remoteRelease.assets, remoteTag, arch)
      : null
    if (!asset) {
      return {
        provider: 'proton_cachyos',
        hasUpdate: false,
        remoteTag,
        installedBestTag: installedBest,
        releaseUrl: `https://github.com/${CACHY_OWNER}/${CACHY_REPO}/releases/tag/${encodeURIComponent(remoteTag)}`,
      }
    }
    const idxRemote = releases.findIndex((r) => r.tag_name === remoteTag)
    const idxInst = installedBest ? releases.findIndex((r) => r.tag_name === installedBest) : -1
    if (!installedBest && rows.some((r) => r.provider === 'proton_cachyos')) {
      hasUpdate = false
    } else if (!installedBest) {
      hasUpdate = true
    } else {
      hasUpdate = idxRemote >= 0 && (idxInst < 0 || idxRemote < idxInst)
    }
  }

  return {
    provider: 'proton_cachyos',
    hasUpdate,
    remoteTag,
    installedBestTag: installedBest,
    releaseUrl: remoteTag
      ? `https://github.com/${CACHY_OWNER}/${CACHY_REPO}/releases/tag/${encodeURIComponent(remoteTag)}`
      : null,
  }
}
