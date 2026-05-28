import { request } from '../client'

export interface RunEntry {
  jobId: string
  fileName: string
  runTime: string
  size: number
  hasOutput?: boolean
  synthetic?: boolean
}

export interface RunDetail {
  jobId: string
  fileName: string
  runTime: string
  content: string
}

export async function listCronRuns(jobId?: string, limit = 100): Promise<RunEntry[]> {
  const params = new URLSearchParams()
  if (jobId) params.set('jobId', jobId)
  if (limit > 0) params.set('limit', String(limit))
  const qs = params.toString()
  const res = await request<{ runs: RunEntry[] }>(`/api/cron-history${qs ? `?${qs}` : ''}`)
  return res.runs
}

export async function readCronRun(jobId: string, fileName: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/cron-history/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`)
}
