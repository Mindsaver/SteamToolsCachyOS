import fs from 'fs'
import path from 'path'
import type { RunningFsrStatus } from '../../../shared/types'
import { analyzeDll } from './ffx'

const PROC_DIR = '/proc'
const SEMVER_RE = /(?<![0-9.])(\d{1,3}\.\d{1,3}\.\d{1,3}(?:\.\d{1,5})?)(?![0-9.])/g

type DllFamily = 'fsr' | 'dlss' | 'xess'
type IndicatorState = 'fsr4-active' | 'fsr-active' | 'not-detected'

const DLL_PATTERNS: Record<DllFamily, RegExp> = {
  fsr: /\/amdxcffx64\.dll$/i,
  dlss: /\/nvngx_dlss(?:d|g)?\.dll$/i,
  xess: /\/libxess(?:_dx11|_fg)?\.dll$/i,
}

function readEnviron(pid: string): string {
  try {
    return fs.readFileSync(path.join(PROC_DIR, pid, 'environ')).toString('utf-8')
  } catch {
    return ''
  }
}

function readMaps(pid: string): string {
  try {
    return fs.readFileSync(path.join(PROC_DIR, pid, 'maps'), 'utf-8')
  } catch {
    return ''
  }
}

function readCmdline(pid: string): string {
  try {
    return fs.readFileSync(path.join(PROC_DIR, pid, 'cmdline')).toString('utf-8').replace(/\u0000/g, ' ').trim()
  } catch {
    return ''
  }
}

interface ProcCandidate {
  pid: number
  appId: number | null
  cmdline: string
  indicatorState: IndicatorState
  mappedDlls: Record<DllFamily, string[]>
}

function parseAppIdFromEnv(env: string): number | null {
  const keys = ['SteamAppId', 'STEAM_COMPAT_APP_ID', 'SteamGameId']
  for (const key of keys) {
    const match = env.match(new RegExp(`${key}=([0-9]+)`))
    if (match?.[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

function parseIndicatorStateFromEnv(env: string): IndicatorState {
  if (/PROTON_FSR4_INDICATOR=1/.test(env)) return 'fsr4-active'
  if (/WINE_FULLSCREEN_FSR=1/.test(env) || /PROTON_ENABLE_AMD_FSR=1/.test(env) || /PROTON_FSR_INDICATOR=1/.test(env)) {
    return 'fsr-active'
  }
  return 'not-detected'
}

function parseMappedDllsFromMaps(maps: string): Record<DllFamily, string[]> {
  const out: Record<DllFamily, string[]> = { fsr: [], dlss: [], xess: [] }
  if (!maps) return out
  for (const line of maps.split('\n')) {
    if (!line.includes('/')) continue
    const segs = line.trim().split(/\s+/)
    const filePath = segs[segs.length - 1]
    if (!filePath.startsWith('/')) continue
    for (const family of Object.keys(DLL_PATTERNS) as DllFamily[]) {
      if (DLL_PATTERNS[family].test(filePath)) {
        if (!out[family].includes(filePath)) out[family].push(filePath)
      }
    }
  }
  return out
}

function collectProcCandidates(): ProcCandidate[] {
  let pids: string[] = []
  try {
    pids = fs.readdirSync(PROC_DIR).filter((d) => /^\d+$/.test(d))
  } catch {
    return []
  }
  const out: ProcCandidate[] = []
  for (const pid of pids) {
    const env = readEnviron(pid)
    const maps = readMaps(pid)
    if (!env && !maps) continue
    const mappedDlls = parseMappedDllsFromMaps(maps)
    const appId = parseAppIdFromEnv(env)
    const indicatorState = parseIndicatorStateFromEnv(env)
    const hasAnyDll = mappedDlls.fsr.length > 0 || mappedDlls.dlss.length > 0 || mappedDlls.xess.length > 0
    if (indicatorState !== 'not-detected' || hasAnyDll || appId !== null) {
      out.push({
        pid: Number(pid),
        appId,
        cmdline: readCmdline(pid),
        indicatorState,
        mappedDlls,
      })
    }
  }
  return out
}

function pickDetectedAppId(candidates: ProcCandidate[], requestedAppId: number | null, steamInstall: string | null): number | null {
  if (requestedAppId != null) return requestedAppId
  const scoreByApp = new Map<number, number>()
  for (const c of candidates) {
    if (c.appId == null) continue
    let score = 1
    if (c.mappedDlls.fsr.length > 0) score += 8
    if (c.mappedDlls.dlss.length > 0 || c.mappedDlls.xess.length > 0) score += 4
    if (c.indicatorState !== 'not-detected') score += 3
    if (c.cmdline.toLowerCase().includes('-shipping.exe')) score += 2
    scoreByApp.set(c.appId, (scoreByApp.get(c.appId) ?? 0) + score)
  }
  if (scoreByApp.size > 0) {
    const ranked = [...scoreByApp.entries()].sort((a, b) => b[1] - a[1])
    return ranked[0]?.[0] ?? null
  }
  if (!steamInstall) return null
  // Fallback: latest compatdata fsr dll by mtime.
  const compatRoot = path.join(steamInstall, 'steamapps', 'compatdata')
  try {
    let best: { appId: number; mtimeMs: number } | null = null
    for (const ent of fs.readdirSync(compatRoot, { withFileTypes: true })) {
      if (!ent.isDirectory() || !/^\d+$/.test(ent.name)) continue
      const p = path.join(compatRoot, ent.name, 'pfx', 'drive_c', 'windows', 'system32', 'amdxcffx64.dll')
      if (!fs.existsSync(p)) continue
      const st = fs.statSync(p)
      if (!best || st.mtimeMs > best.mtimeMs) {
        best = { appId: Number(ent.name), mtimeMs: st.mtimeMs }
      }
    }
    return best?.appId ?? null
  } catch {
    return null
  }
}

function statusLabel(
  state: IndicatorState,
  version: string | null,
  likelyActive: boolean,
  dllLoaded: boolean
): string {
  if (likelyActive) {
    if (state === 'fsr4-active') return version ? `FSR4 likely active (${version})` : 'FSR4 likely active'
    return version ? `FSR likely active (${version})` : 'FSR likely active'
  }
  if (state !== 'not-detected' && !dllLoaded) return 'FSR requested, runtime not loaded'
  if (state !== 'not-detected') return 'FSR requested, activity uncertain'
  if (dllLoaded) return version ? `FSR runtime loaded (${version} inferred), activity uncertain` : 'FSR runtime loaded, activity uncertain'
  return 'FSR not detected'
}

interface RuntimeVersionInfo {
  fsrVersion: string | null
  mlfiVersion: string | null
  framegenVersion: string | null
  sourcePath: string | null
}

function extractBestSemverFromDll(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath)
    const text = buf.toString('latin1')
    const versions = new Set<string>()
    let m: RegExpExecArray | null
    const re = new RegExp(SEMVER_RE.source, 'g')
    while ((m = re.exec(text)) !== null) {
      const v = m[1]
      if (v !== '0.0.0' && !v.startsWith('0.0.')) versions.add(v)
    }
    const sorted = [...versions].sort((a, b) => {
      const aa = a.split('.').map(Number)
      const bb = b.split('.').map(Number)
      for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
        const d = (bb[i] ?? 0) - (aa[i] ?? 0)
        if (d !== 0) return d
      }
      return 0
    })
    return sorted[0] ?? null
  } catch {
    return null
  }
}

function inferVersionFromPath(dllPath: string | null, family: DllFamily): RuntimeVersionInfo {
  if (!dllPath) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
  if (!fs.existsSync(dllPath)) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: dllPath }
  if (family === 'fsr') {
    try {
      const info = analyzeDll(dllPath)
      return {
        fsrVersion: info.fsr,
        mlfiVersion: info.ml,
        framegenVersion: info.framegen,
        sourcePath: dllPath,
      }
    } catch {
      return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: dllPath }
    }
  }
  const v = extractBestSemverFromDll(dllPath)
  return {
    fsrVersion: family === 'dlss' ? v : null,
    mlfiVersion: null,
    framegenVersion: family === 'xess' ? v : null,
    sourcePath: dllPath,
  }
}

function inferVersionFromApp(steamInstall: string | null, appId: number | null): RuntimeVersionInfo {
  if (!steamInstall || !appId) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
  const dllPath = path.join(
    steamInstall,
    'steamapps',
    'compatdata',
    String(appId),
    'pfx',
    'drive_c',
    'windows',
    'system32',
    'amdxcffx64.dll'
  )
  return inferVersionFromPath(dllPath, 'fsr')
}

function inferVersionFromCompatdataSweep(steamInstall: string | null): RuntimeVersionInfo {
  if (!steamInstall) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
  const compatRoot = path.join(steamInstall, 'steamapps', 'compatdata')
  if (!fs.existsSync(compatRoot)) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
  try {
    const candidates: Array<{ p: string; mtimeMs: number }> = []
    for (const ent of fs.readdirSync(compatRoot, { withFileTypes: true })) {
      if (!ent.isDirectory() || !/^\d+$/.test(ent.name)) continue
      const p = path.join(
        compatRoot,
        ent.name,
        'pfx',
        'drive_c',
        'windows',
        'system32',
        'amdxcffx64.dll'
      )
      if (!fs.existsSync(p)) continue
      try {
        const st = fs.statSync(p)
        candidates.push({ p, mtimeMs: st.mtimeMs })
      } catch {
        // ignore
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const best = candidates[0]
    if (!best) return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
    try {
      const info = analyzeDll(best.p)
      return {
        fsrVersion: info.fsr,
        mlfiVersion: info.ml,
        framegenVersion: info.framegen,
        sourcePath: best.p,
      }
    } catch {
      return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: best.p }
    }
  } catch {
    return { fsrVersion: null, mlfiVersion: null, framegenVersion: null, sourcePath: null }
  }
}

export function getRunningFsrStatus(steamInstall: string | null, appId: number | null = null): RunningFsrStatus {
  const candidates = collectProcCandidates()
  const detectedAppId = pickDetectedAppId(candidates, appId, steamInstall)
  const scoped = candidates.filter((c) => c.appId != null && c.appId === detectedAppId)
  const mappedDlls = scoped.reduce<Record<DllFamily, string[]>>(
    (acc, c) => {
      for (const family of Object.keys(acc) as DllFamily[]) {
        for (const p of c.mappedDlls[family]) {
          if (!acc[family].includes(p)) acc[family].push(p)
        }
      }
      return acc
    },
    { fsr: [], dlss: [], xess: [] }
  )
  const indicatorState: IndicatorState = scoped.some((c) => c.indicatorState === 'fsr4-active')
    ? 'fsr4-active'
    : scoped.some((c) => c.indicatorState === 'fsr-active')
      ? 'fsr-active'
      : 'not-detected'

  const detectedGamePid = scoped.find((c) => c.mappedDlls.fsr.length > 0 || c.mappedDlls.dlss.length > 0 || c.mappedDlls.xess.length > 0)?.pid ?? scoped[0]?.pid ?? null
  const indicatorRequested = indicatorState !== 'not-detected'
  const dllLoaded = mappedDlls.fsr.length > 0 || mappedDlls.dlss.length > 0 || mappedDlls.xess.length > 0
  const likelyActive = indicatorRequested && dllLoaded

  const mappedFamily: DllFamily | null = mappedDlls.fsr[0] ? 'fsr' : mappedDlls.dlss[0] ? 'dlss' : mappedDlls.xess[0] ? 'xess' : null
  const mappedPath = mappedFamily ? mappedDlls[mappedFamily][0] : null
  const inferred = mappedPath
    ? inferVersionFromPath(mappedPath, mappedFamily ?? 'fsr')
    : detectedAppId != null
      ? inferVersionFromApp(steamInstall, detectedAppId)
      : inferVersionFromCompatdataSweep(steamInstall)
  const dllPathKind: 'mapped' | 'compatdata_fallback' | 'none' = mappedPath ? 'mapped' : inferred.sourcePath ? 'compatdata_fallback' : 'none'
  const noDetection = indicatorState === 'not-detected' && !dllLoaded
  const inferredVersion = noDetection ? null : inferred.fsrVersion
  const mlfiVersion = noDetection ? null : inferred.mlfiVersion
  const framegenVersion = noDetection ? null : inferred.framegenVersion
  const sourcePath = noDetection ? null : inferred.sourcePath

  return {
    indicatorState,
    indicatorRequested,
    dllLoaded,
    likelyActive,
    detectedAppId,
    detectedGamePid,
    dllPathKind,
    mappedDlls,
    fsrVersion: inferredVersion,
    mlfiVersion,
    framegenVersion,
    confidence:
      inferredVersion
        ? 'inferred'
        : indicatorRequested
          ? 'indicator'
          : 'unknown',
    label: statusLabel(indicatorState, inferredVersion, likelyActive, dllLoaded),
    sourcePath,
    updatedAt: Date.now(),
  }
}
