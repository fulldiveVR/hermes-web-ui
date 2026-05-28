import { config } from '../../config'

/**
 * HubClient is the single seam between the shared web-ui (Variant B) and the
 * hermes-hub control plane. The web-ui never touches a tenant filesystem,
 * spawns an agent, or runs a bridge — every Hermes data read/write flows
 * through here as a hub HTTP call, authenticated with the hub-tier service
 * credential (HUB_API_TOKEN). Per-user tenant scoping is enforced above this
 * layer (see user-auth middleware); this client speaks to the hub as the
 * service and must always be called with an explicit, already-authorized
 * tenant id.
 */

export interface HubTenant {
  id: string
  displayName?: string
  owner?: {
    email?: string
    name?: string
    externalUserId?: string
  }
  status?: string
  access?: { status?: string; message?: string }
  agent?: Record<string, unknown>
  [key: string]: unknown
}

export type HubAgentCronJob = Record<string, any>

export interface HubSession {
  id: string
  source: string
  user_id: string | null
  model: string
  title: string | null
  started_at: number
  ended_at: number | null
  end_reason: string | null
  message_count: number
  tool_call_count: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  billing_provider: string | null
  estimated_cost_usd: number
  actual_cost_usd: number | null
  cost_status: string
  preview: string
  last_active: number
}

export interface HubSessionMessage {
  id: number | string
  session_id: string
  role: string
  content: string
  tool_call_id: string | null
  tool_calls: unknown
  tool_name: string | null
  timestamp: number
  token_count: number | null
  finish_reason: string | null
  reasoning: string | null
}

export interface HubSkillInfo {
  name: string
  description: string
  enabled?: boolean
  source?: 'builtin' | 'hub' | 'local' | 'external'
  modified?: boolean
  patchCount?: number
  useCount?: number
  viewCount?: number
  pinned?: boolean
}

export interface HubSkillCategory {
  name: string
  description: string
  skills: HubSkillInfo[]
}

export interface HubSkillFileEntry {
  path: string
  name: string
  isDir: boolean
}

export class HubError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message)
    this.name = 'HubError'
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (config.hubApiToken) {
    headers.Authorization = `Bearer ${config.hubApiToken}`
  }
  return headers
}

async function hubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.hubBaseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    headers: authHeaders((init.headers as Record<string, string>) || {}),
  })
  return res
}

async function hubJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await hubFetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HubError(res.status, `hub ${init.method || 'GET'} ${path} failed: ${res.status}`, body)
  }
  return (await res.json()) as T
}

export const hubClient = {
  async listTenants(): Promise<HubTenant[]> {
    const data = await hubJson<{ tenants?: HubTenant[] }>('/v1/tenants')
    return data.tenants ?? []
  },

  async getTenant(tenantId: string): Promise<HubTenant> {
    return hubJson<HubTenant>(`/v1/tenants/${encodeURIComponent(tenantId)}`)
  },

  /** Exchange a hub-minted SSO token for its bound tenant. Single-use. */
  async validateUILoginToken(token: string): Promise<{ tenantID: string; displayName?: string }> {
    return hubJson('/v1/ui-login/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  },

  async requestUIEmailLoginCode(email: string, sessionId?: string): Promise<{ success: boolean; sessionId: string; expiresIn: number }> {
    return hubJson('/v1/ui-login/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, sessionId }),
    })
  },

  async verifyUIEmailLoginCode(
    sessionId: string,
    code: string,
    tenantId?: string,
  ): Promise<{
    tenantID?: string
    displayName?: string
    requiresTenantSelection?: boolean
    tenants?: Array<{ id: string; displayName?: string }>
  }> {
    return hubJson('/v1/ui-login/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, code, tenantId }),
    })
  },

  /** Mint an SSO token via the hub control API (used for local demos/tests). */
  async mintUILoginToken(tenantId: string): Promise<{ token: string; url: string; expiresAt: string }> {
    return hubJson(`/v1/tenants/${encodeURIComponent(tenantId)}/ui-login-token`, { method: 'POST' })
  },

  async listSessions(tenantId: string, source?: string): Promise<HubSession[]> {
    const qs = source ? `?source=${encodeURIComponent(source)}` : ''
    const data = await hubJson<{ sessions?: HubSession[] }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/sessions${qs}`,
    )
    return data.sessions ?? []
  },

  async getSession(
    tenantId: string,
    sessionId: string,
  ): Promise<{ session: HubSession; messages: HubSessionMessage[]; thread_session_count: number }> {
    return hubJson(
      `/v1/tenants/${encodeURIComponent(tenantId)}/sessions/${encodeURIComponent(sessionId)}`,
    )
  },

  async getMemory(tenantId: string): Promise<{
    memory: string; user: string; soul: string
    memory_mtime: number | null; user_mtime: number | null; soul_mtime: number | null
  }> {
    return hubJson(`/v1/tenants/${encodeURIComponent(tenantId)}/memory`)
  },

  async listSkills(tenantId: string): Promise<{ categories: HubSkillCategory[]; archived: HubSkillInfo[] }> {
    const data = await hubJson<{ categories?: HubSkillCategory[]; archived?: HubSkillInfo[] }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/skills`,
    )
    return { categories: data.categories ?? [], archived: data.archived ?? [] }
  },

  async listSkillFiles(tenantId: string, category: string, skill: string): Promise<HubSkillFileEntry[]> {
    const data = await hubJson<{ files?: HubSkillFileEntry[] }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/skills/${encodeURIComponent(category)}/${encodeURIComponent(skill)}/files`,
    )
    return data.files ?? []
  },

  async getSkillFile(tenantId: string, skillPath: string): Promise<string> {
    const encodedPath = skillPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
    const data = await hubJson<{ content: string }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/skill-files/${encodedPath}`,
    )
    return data.content
  },

  async listAgentCronJobs(tenantId: string): Promise<HubAgentCronJob[]> {
    const data = await hubJson<{ jobs?: HubAgentCronJob[] }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron`,
    )
    return data.jobs ?? []
  },

  async getAgentCronJob(tenantId: string, jobId: string): Promise<HubAgentCronJob> {
    const data = await hubJson<{ job?: HubAgentCronJob }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron/${encodeURIComponent(jobId)}`,
    )
    return data.job ?? {}
  },

  async createAgentCronJob(tenantId: string, body: unknown): Promise<HubAgentCronJob> {
    const data = await hubJson<{ job?: HubAgentCronJob }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      },
    )
    return data.job ?? {}
  },

  async updateAgentCronJob(tenantId: string, jobId: string, body: unknown): Promise<HubAgentCronJob> {
    const data = await hubJson<{ job?: HubAgentCronJob }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron/${encodeURIComponent(jobId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      },
    )
    return data.job ?? {}
  },

  async deleteAgentCronJob(tenantId: string, jobId: string): Promise<{ ok?: boolean; [key: string]: unknown }> {
    return hubJson(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron/${encodeURIComponent(jobId)}`,
      { method: 'DELETE' },
    )
  },

  async postAgentCronJobAction(tenantId: string, jobId: string, action: 'pause' | 'resume' | 'run'): Promise<HubAgentCronJob> {
    const data = await hubJson<{ job?: HubAgentCronJob }>(
      `/v1/tenants/${encodeURIComponent(tenantId)}/agent-cron/${encodeURIComponent(jobId)}/${action}`,
      { method: 'POST' },
    )
    return data.job ?? {}
  },

  /** Create a run on the tenant agent. Wakes a hibernated agent on the hub. */
  async createRun(tenantId: string, body: unknown): Promise<{ run_id?: string; runId?: string; [k: string]: unknown }> {
    return hubJson(`/v1/tenants/${encodeURIComponent(tenantId)}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  },

  async stopRun(tenantId: string, runId: string): Promise<void> {
    await hubFetch(
      `/v1/tenants/${encodeURIComponent(tenantId)}/runs/${encodeURIComponent(runId)}/stop`,
      { method: 'POST' },
    )
  },

  /**
   * Stream Server-Sent Events for a run. Invokes onEvent for each parsed
   * `data:` payload. Resolves when the stream closes. Pass an AbortSignal to
   * cancel (e.g. when the client disconnects).
   */
  async streamRunEvents(
    tenantId: string,
    runId: string,
    onEvent: (event: { type?: string; data: unknown; raw: string }) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await hubFetch(
      `/v1/tenants/${encodeURIComponent(tenantId)}/runs/${encodeURIComponent(runId)}/events`,
      { headers: { Accept: 'text/event-stream' }, signal },
    )
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '')
      throw new HubError(res.status, `hub SSE for run ${runId} failed: ${res.status}`, body)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        emitSseChunk(chunk, onEvent)
      }
    }
    if (buffer.trim()) emitSseChunk(buffer, onEvent)
  },
}

function emitSseChunk(
  chunk: string,
  onEvent: (event: { type?: string; data: unknown; raw: string }) => void,
): void {
  let eventType: string | undefined
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return
  const raw = dataLines.join('\n')
  if (raw === '[DONE]') {
    onEvent({ type: eventType ?? 'done', data: null, raw })
    return
  }
  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // leave as raw string
  }
  onEvent({ type: eventType, data, raw })
}
