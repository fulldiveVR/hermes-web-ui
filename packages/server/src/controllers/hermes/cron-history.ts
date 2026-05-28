import type { Context } from 'koa'
import { readdir, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getActiveProfileName, getProfileDir } from '../../services/hermes/hermes-profile'
import { hubClient } from '../../services/hub/hub-client'
import type { HubSession, HubSessionMessage } from '../../services/hub/hub-client'

const SYNTHETIC_RUN_FILE = '__scheduler_metadata__.md'

function requestedProfile(ctx: Context): string {
  return ctx.state?.profile?.name || getActiveProfileName() || 'default'
}

function requestedHubTenant(ctx: Context): string {
  return ctx.state?.profile?.name || ctx.get('x-hermes-profile') || ''
}

function intQuery(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue
  return Math.min(Math.floor(parsed), maxValue)
}

function getCronOutputDir(profile: string): string {
  const profileDir = getProfileDir(profile)
  return join(profileDir, 'cron', 'output')
}

function getCronJobsFile(profile: string): string {
  const profileDir = getProfileDir(profile)
  return join(profileDir, 'cron', 'jobs.json')
}

export interface RunEntry {
  jobId: string
  fileName: string
  runTime: string
  size: number
  hasOutput?: boolean
  synthetic?: boolean
  runCount?: number
  status?: string | null
  error?: string | null
}

export interface RunDetail {
  jobId: string
  fileName: string
  runTime: string
  content: string
}

interface CronJobMetadata {
  id?: string
  job_id?: string
  name?: string
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  run_count?: number | string | null
  no_agent?: boolean
  script?: string | null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getJobId(job: CronJobMetadata): string | null {
  return stringOrNull(job.job_id) || stringOrNull(job.id)
}

function isCronJobMetadata(value: unknown): value is CronJobMetadata {
  return Boolean(value && typeof value === 'object')
}

function normaliseJobsPayload(payload: unknown): CronJobMetadata[] {
  if (Array.isArray(payload)) return payload.filter(isCronJobMetadata)
  if (payload && typeof payload === 'object') {
    const maybeJobs = (payload as { jobs?: unknown }).jobs
    if (Array.isArray(maybeJobs)) return maybeJobs.filter(isCronJobMetadata)
  }
  return []
}

async function readCronJobs(profile: string): Promise<CronJobMetadata[]> {
  const jobsFile = getCronJobsFile(profile)
  if (!existsSync(jobsFile)) return []

  try {
    const raw = await readFile(jobsFile, 'utf-8')
    return normaliseJobsPayload(JSON.parse(raw))
  } catch {
    return []
  }
}

async function readCronJobsForContext(ctx: Context, profile: string): Promise<CronJobMetadata[]> {
  const tenant = requestedHubTenant(ctx)
  if (tenant) return hubClient.listAgentCronJobs(tenant).catch(() => [])
  return readCronJobs(profile)
}

function coerceRunCount(value: CronJobMetadata['run_count']): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toDisplayTime(value: string): string {
  const isoLike = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  if (isoLike) return `${isoLike[1]} ${isoLike[2]}:${isoLike[3]}:${isoLike[4]}`

  const legacy = value.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/)
  if (legacy) return `${legacy[1]} ${legacy[2].replace(/-/g, ':')}`

  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().replace('T', ' ').slice(0, 19)
  }

  return value
}

function parseRunTimeFromFileName(fileName: string): string {
  const base = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
  return toDisplayTime(base)
}

function cronJobIdFromSessionId(sessionId: string): string | null {
  const match = String(sessionId || '').match(/^cron_(.+)_\d{8}_\d{6}$/)
  return match?.[1] || null
}

function runTimeFromHubSession(session: HubSession): string {
  const seconds = Number(session.last_active || session.started_at || 0)
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)
  }
  return ''
}

function runEntryFromHubSession(session: HubSession): RunEntry | null {
  const jobId = cronJobIdFromSessionId(session.id)
  if (!jobId) return null
  return {
    jobId,
    fileName: `${session.id}.md`,
    runTime: runTimeFromHubSession(session),
    size: 0,
    hasOutput: true,
  }
}

function finalAssistantContent(messages: HubSessionMessage[]): string {
  const assistantMessages = messages
    .filter(message => message.role === 'assistant' && String(message.content || '').trim())
    .map(message => String(message.content).trim())
  if (assistantMessages.length === 0) return ''
  return assistantMessages.join('\n\n---\n\n')
}

async function listHubCronRuns(tenant: string, jobId: string | undefined, limit: number): Promise<RunEntry[]> {
  const sessions = await hubClient.listSessions(tenant, 'cron')
  return sessions
    .map(runEntryFromHubSession)
    .filter((run): run is RunEntry => !!run && (!jobId || run.jobId === jobId))
    .sort((a, b) => b.runTime.localeCompare(a.runTime))
    .slice(0, limit)
}

function sessionIdFromRunFile(fileName: string): string | null {
  if (!fileName.endsWith('.md')) return null
  const sessionId = fileName.slice(0, -3)
  return sessionId.startsWith('cron_') ? sessionId : null
}

function syntheticRunEntry(job: CronJobMetadata): RunEntry | null {
  const jobId = getJobId(job)
  const lastRunAt = stringOrNull(job.last_run_at)
  if (!jobId || !lastRunAt) return null

  return {
    jobId,
    fileName: SYNTHETIC_RUN_FILE,
    runTime: toDisplayTime(lastRunAt),
    size: 0,
    hasOutput: false,
    synthetic: true,
    runCount: coerceRunCount(job.run_count),
    status: stringOrNull(job.last_status),
    error: stringOrNull(job.last_error),
  }
}

function hasRunForJobAtOrAfter(runs: RunEntry[], jobId: string, runTime: string): boolean {
  return runs.some(run => run.jobId === jobId && run.runTime >= runTime)
}

function inlineCode(value: unknown): string {
  const text = String(value)
  let longestBacktickRun = 0
  let currentBacktickRun = 0

  for (const char of text) {
    if (char === '`') {
      currentBacktickRun += 1
      if (currentBacktickRun > longestBacktickRun) longestBacktickRun = currentBacktickRun
    } else {
      currentBacktickRun = 0
    }
  }

  const delimiter = '`'.repeat(longestBacktickRun + 1)
  return `${delimiter} ${text} ${delimiter}`
}

function buildSyntheticContent(job: CronJobMetadata, runTime: string): string {
  const explanation = job.no_agent || stringOrNull(job.script)
    ? 'This is expected for script-only/no-agent watchdog jobs when the script exits successfully with empty stdout: Hermes treats the run as silent, so there is nothing to deliver and no output file to display.'
    : 'This can happen when a cron run updates scheduler metadata but does not produce a markdown output artifact to display.'

  const lines = [
    '# Scheduler run recorded',
    '',
    'Hermes recorded this cron job as having run, but no markdown output artifact was written for this job.',
    '',
    explanation,
    '',
    `- Job: ${inlineCode(job.name || getJobId(job) || 'unknown')}`,
    `- Last run: ${inlineCode(runTime)}`,
  ]

  const runCount = coerceRunCount(job.run_count)
  const lastStatus = stringOrNull(job.last_status)
  const lastError = stringOrNull(job.last_error)
  const script = stringOrNull(job.script)
  if (runCount !== undefined) lines.push(`- Recorded runs: ${inlineCode(runCount)}`)
  if (lastStatus) lines.push(`- Last status: ${inlineCode(lastStatus)}`)
  if (lastError) lines.push(`- Last error: ${inlineCode(lastError)}`)
  if (script) lines.push(`- Script: ${inlineCode(script)}`)
  if (job.no_agent) lines.push('- Mode: `no-agent/script-only`')

  return `${lines.join('\n')}\n`
}

/** List all run output files, optionally filtered by job ID */
export async function listRuns(ctx: Context) {
  const jobId = ctx.query.jobId as string | undefined
  const profile = requestedProfile(ctx)
  const tenant = requestedHubTenant(ctx)
  const limit = intQuery(ctx.query.limit, 100, 500)
  const cronOutput = getCronOutputDir(profile)

  try {
    if (tenant) {
      ctx.body = { runs: await listHubCronRuns(tenant, jobId, limit) }
      return
    }

    const runs: RunEntry[] = []

    if (existsSync(cronOutput)) {
      const dirs = await readdir(cronOutput)
      const targetDirs = jobId ? dirs.filter(d => d === jobId) : dirs

      for (const dir of targetDirs) {
        const dirPath = join(cronOutput, dir)
        try {
          const dirStat = await stat(dirPath)
          if (!dirStat.isDirectory()) continue

          const files = await readdir(dirPath)
          // Sort by filename descending (newest first, since filenames are timestamps)
          const sorted = files.sort().reverse()

          for (const file of sorted) {
            if (!file.endsWith('.md')) continue
            const filePath = join(dirPath, file)
            try {
              const fileStat = await stat(filePath)

              runs.push({
                jobId: dir,
                fileName: file,
                runTime: parseRunTimeFromFileName(file),
                size: fileStat.size,
                hasOutput: true,
              })
            } catch { /* skip unreadable files */ }
          }
        } catch { /* skip unreadable dirs */ }
      }
    }

    const jobs = await readCronJobsForContext(ctx, profile)
    const targetJobs = jobId ? jobs.filter(job => getJobId(job) === jobId) : jobs
    for (const job of targetJobs) {
      const id = getJobId(job)
      if (!id) continue
      const synthetic = syntheticRunEntry(job)
      if (synthetic && !hasRunForJobAtOrAfter(runs, id, synthetic.runTime)) runs.push(synthetic)
    }

    // Sort all runs by runTime descending
    runs.sort((a, b) => b.runTime.localeCompare(a.runTime))

    ctx.body = { runs: runs.slice(0, limit) }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}

/** Read a specific run output file */
export async function readRun(ctx: Context) {
  const { jobId, fileName } = ctx.params
  const profile = requestedProfile(ctx)
  const tenant = requestedHubTenant(ctx)

  if (!jobId || !fileName) {
    ctx.status = 400
    ctx.body = { error: 'jobId and fileName are required' }
    return
  }

  // Prevent path traversal
  if (
    jobId.includes('..')
    || fileName.includes('..')
    || jobId.includes('/')
    || fileName.includes('/')
    || jobId.includes('\\')
    || fileName.includes('\\')
  ) {
    ctx.status = 400
    ctx.body = { error: 'Invalid path' }
    return
  }

  if (tenant) {
    const sessionId = sessionIdFromRunFile(fileName)
    if (!sessionId || cronJobIdFromSessionId(sessionId) !== jobId) {
      ctx.status = 404
      ctx.body = { error: 'Run output not found' }
      return
    }

    try {
      const detail = await hubClient.getSession(tenant, sessionId)
      if (!detail.session || detail.session.source !== 'cron') {
        ctx.status = 404
        ctx.body = { error: 'Run output not found' }
        return
      }
      ctx.body = {
        jobId,
        fileName,
        runTime: runTimeFromHubSession(detail.session),
        content: finalAssistantContent(detail.messages) || 'No assistant output was recorded for this cron run.',
      } satisfies RunDetail
      return
    } catch (err: any) {
      ctx.status = err?.status === 404 ? 404 : 502
      ctx.body = { error: err?.status === 404 ? 'Run output not found' : 'Failed to load cron run from hub' }
      return
    }
  }

  if (fileName === SYNTHETIC_RUN_FILE) {
    const jobs = await readCronJobsForContext(ctx, profile)
    const job = jobs.find(candidate => getJobId(candidate) === jobId)
    const synthetic = job ? syntheticRunEntry(job) : null
    if (!job || !synthetic) {
      ctx.status = 404
      ctx.body = { error: 'Run output not found' }
      return
    }

    ctx.body = {
      jobId,
      fileName,
      runTime: synthetic.runTime,
      content: buildSyntheticContent(job, synthetic.runTime),
    } satisfies RunDetail
    return
  }

  const cronOutput = getCronOutputDir(profile)
  const filePath = join(cronOutput, jobId, fileName)

  if (!existsSync(filePath)) {
    ctx.status = 404
    ctx.body = { error: 'Run output not found' }
    return
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    const runTime = parseRunTimeFromFileName(fileName)

    ctx.body = { jobId, fileName, runTime, content } satisfies RunDetail
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}
