/**
 * Variant B hub run handler — replaces the local agent-bridge path.
 *
 * Chat from the browser is dispatched to the hub run API
 * (POST /v1/tenants/{tenant}/runs), which proxies to the tenant's Hermes
 * runtime and wakes a hibernated agent on first use. The run's Server-Sent
 * Events are streamed back through the hub and translated into the same
 * Socket.IO chat events the frontend already understands (run.started,
 * message.delta, tool.started/completed, run.completed/failed).
 *
 * Event mapping is keyed off the runtime's own `event` field, validated
 * against the live runtime on vm201:
 *   data: {"event":"message.delta","run_id":...,"delta":"hello"}
 *   data: {"event":"reasoning.available","run_id":...,"text":"..."}
 *   data: {"event":"run.completed","run_id":...,"output":"...","usage":{...}}
 *
 * The web-ui keeps a local cache of the in-flight conversation (session-store
 * in the web-ui's own home, NOT a tenant filesystem) so the chat view renders
 * and resumes; the authoritative session list/history comes from the hub.
 * No bridge, no agent spawn, no tenant FS access.
 */

import type { Server, Socket } from 'socket.io'
import { getSession, createSession, addMessage, updateSession, updateSessionStats } from '../../../db/hermes/session-store'
import { updateUsage } from '../../../db/hermes/usage-store'
import { logger } from '../../logger'
import { contentBlocksToString, extractTextForPreview } from './content-blocks'
import type { ContentBlock, SessionState } from './types'
import { hubClient } from '../../hub/hub-client'

interface HubRunData {
  input: string | ContentBlock[]
  display_input?: string | ContentBlock[] | null
  display_role?: 'user' | 'command'
  session_id?: string
  model?: string
  source?: string
  queue_id?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function finiteToken(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export async function handleHubRun(
  nsp: ReturnType<Server['of']>,
  socket: Socket,
  data: HubRunData,
  tenant: string,
  sessionMap: Map<string, SessionState>,
  skipUserMessage = false,
) {
  const { input, session_id } = data
  if (!session_id) {
    socket.emit('run.failed', { event: 'run.failed', error: 'session_id is required' })
    return
  }

  const now = Math.floor(Date.now() / 1000)
  const inputText = contentBlocksToString(input)
  const displayInput = data.display_input === undefined ? input : data.display_input
  const displayRole = data.display_role === 'command' ? 'command' : 'user'
  const shouldPersistUserMessage = !skipUserMessage && displayInput !== null
  const inputStr = displayInput == null ? '' : contentBlocksToString(displayInput)

  let state = sessionMap.get(session_id)
  if (!state) {
    state = { messages: [], isWorking: false, events: [], queue: [] }
    sessionMap.set(session_id, state)
  }
  state.isWorking = true
  state.isAborting = false
  state.events = []
  state.profile = tenant
  state.source = 'cli'

  if (!getSession(session_id)) {
    const preview = extractTextForPreview(displayInput ?? input).replace(/[\r\n]/g, ' ').substring(0, 100)
    createSession({ id: session_id, profile: tenant, source: 'cli', model: data.model || '', provider: '', title: preview })
  }
  if (shouldPersistUserMessage) {
    state.messages.push({ id: state.messages.length + 1, session_id, role: displayRole, content: inputStr, timestamp: now })
    addMessage({ session_id, role: displayRole, content: inputStr, timestamp: now })
  }

  socket.join(`session:${session_id}`)
  const emit = (event: string, payload: any) => {
    const tagged = { ...payload, session_id }
    nsp.to(`session:${session_id}`).emit(event, tagged)
    if (!nsp.adapter.rooms.get(`session:${session_id}`)?.size && socket.connected) {
      socket.emit(event, tagged)
    }
  }

  // /start-ui is handled directly by the web-ui (mint a fresh login link),
  // not forwarded to the agent — matching the hub's A2A command. This avoids
  // the agent treating it as a task and keeps it out of the hub session list.
  if (['/start-ui', 'start-ui', '/login', '/dashboard', '/ui'].includes(inputText.trim().toLowerCase())) {
    const runId = `local_${Date.now().toString(36)}`
    emit('run.started', { event: 'run.started', run_id: runId, queue_length: 0 })
    let text: string
    try {
      const minted = await hubClient.mintUILoginToken(tenant)
      text = `Here's your private dashboard link (valid 5 minutes, no password needed):\n\n${minted.url}\n\nYou're already signed in here — this is for opening the dashboard elsewhere.`
    } catch {
      text = "Sorry, I couldn't create a dashboard link right now."
    }
    state.messages.push({ id: state.messages.length + 1, session_id, role: 'assistant', content: text, finish_reason: 'stop', timestamp: Math.floor(Date.now() / 1000) })
    addMessage({ session_id, role: 'assistant', content: text, finish_reason: 'stop', timestamp: Math.floor(Date.now() / 1000) })
    emit('message.delta', { event: 'message.delta', run_id: runId, delta: text, output: text })
    state.isWorking = false
    emit('run.completed', { event: 'run.completed', run_id: runId, output: text })
    return
  }

  const abort = new AbortController()
  state.abortController = abort

  try {
    const created = await hubClient.createRun(tenant, {
      input: inputText,
      session_id,
      ...(data.model ? { model: data.model } : {}),
    })
    const runId = String(created.run_id || created.runId || (created as any).id || '')
    state.runId = runId
    emit('run.started', { event: 'run.started', run_id: runId, queue_length: 0 })

    let output = ''
    let failed = false
    let failureMessage = ''
    let inputTokens = 0
    let outputTokens = 0

    const appendAssistant = (delta: string) => {
      output += delta
      const last = [...state!.messages].reverse().find(m => m.role === 'assistant' && m.finish_reason == null)
      if (last) last.content += delta
      else state!.messages.push({ id: state!.messages.length + 1, session_id, role: 'assistant', content: delta, timestamp: Math.floor(Date.now() / 1000) })
    }

    await hubClient.streamRunEvents(tenant, runId, (ev) => {
      if (ev.raw === '[DONE]') return
      const obj = (ev.data && typeof ev.data === 'object' ? ev.data as Record<string, unknown> : {})
      // The Hermes runtime carries its event name in the JSON `event` field,
      // not an SSE `event:` line.
      const name = String(obj.event || ev.type || '')

      switch (name) {
        case 'message.delta': {
          const delta = asString(obj.delta)
          if (!delta) break
          appendAssistant(delta)
          emit('message.delta', { event: 'message.delta', run_id: runId, delta, output })
          break
        }
        case 'reasoning.delta':
        case 'thinking.delta': {
          const text = asString(obj.text)
          if (text) emit(name, { event: name, run_id: runId, text })
          break
        }
        case 'reasoning.available': {
          emit('reasoning.available', { event: 'reasoning.available', run_id: runId, text: asString(obj.text) })
          break
        }
        case 'tool.started': {
          emit('tool.started', {
            event: 'tool.started', run_id: runId,
            tool_call_id: obj.tool_call_id || obj.id, tool: obj.tool_name || obj.name, name: obj.tool_name || obj.name,
            arguments: obj.args || obj.arguments, preview: obj.preview,
          })
          break
        }
        case 'tool.completed': {
          emit('tool.completed', {
            event: 'tool.completed', run_id: runId,
            tool_call_id: obj.tool_call_id || obj.id, tool: obj.tool_name || obj.name, name: obj.tool_name || obj.name,
            output: obj.output, duration: obj.duration, error: obj.is_error || undefined,
          })
          break
        }
        case 'run.completed': {
          const finalText = asString(obj.output)
          if (finalText) output = finalText
          const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage as Record<string, unknown> : null
          if (usage) {
            inputTokens = finiteToken(usage.input_tokens)
            outputTokens = finiteToken(usage.output_tokens)
          }
          break
        }
        case 'run.failed':
        case 'error': {
          failed = true
          failureMessage = asString(obj.error) || asString((obj.result as any)?.error) || 'Agent run failed'
          break
        }
        default: {
          // Surface any other agent events (status, subagent.*, etc.) without
          // dropping them, so the UI can render progress.
          if (name) emit('agent.event', { event: 'agent.event', run_id: runId, name, data: obj })
        }
      }
    }, abort.signal)

    if (output) {
      const last = [...state.messages].reverse().find(m => m.role === 'assistant')
      if (last) { last.content = output; last.finish_reason = 'stop' }
      addMessage({ session_id, role: 'assistant', content: output, timestamp: Math.floor(Date.now() / 1000), finish_reason: 'stop' })
    }
    updateSessionStats(session_id)
    if (data.model) updateSession(session_id, { model: data.model })
    if (inputTokens || outputTokens) updateUsage(session_id, { inputTokens, outputTokens, profile: tenant })

    state.isWorking = false
    state.runId = undefined
    state.abortController = undefined
    state.inputTokens = inputTokens
    state.outputTokens = outputTokens

    if (failed) {
      emit('run.failed', { event: 'run.failed', run_id: runId, error: failureMessage, inputTokens, outputTokens })
    } else {
      emit('run.completed', { event: 'run.completed', run_id: runId, output, inputTokens, outputTokens })
    }
  } catch (err: any) {
    state.isWorking = false
    state.runId = undefined
    state.abortController = undefined
    logger.warn(err, '[handle-hub-run] hub run failed for tenant "%s" session "%s"', tenant, session_id)
    emit('run.failed', { event: 'run.failed', error: err?.message || String(err) })
  }
}
