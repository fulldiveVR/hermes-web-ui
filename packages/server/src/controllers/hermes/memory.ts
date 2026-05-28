import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getActiveProfileName, getProfileDir } from '../../services/hermes/hermes-profile'
import { hubClient } from '../../services/hub/hub-client'

function requestedProfile(ctx: any): string {
  return ctx.state?.profile?.name || ctx.state?.user?.profiles?.[0] || getActiveProfileName() || 'default'
}

function requestProfileDir(ctx: any): string {
  return getProfileDir(requestedProfile(ctx))
}

export async function get(ctx: any) {
  // Variant B: memory/persona files come from the tenant's HERMES_HOME via the hub.
  try {
    ctx.body = await hubClient.getMemory(requestedProfile(ctx))
  } catch (err: any) {
    ctx.body = { memory: '', user: '', soul: '', memory_mtime: null, user_mtime: null, soul_mtime: null }
  }
}

export async function save(ctx: any) {
  const { section, content } = ctx.request.body as { section: string; content: string }
  if (!section || !content) {
    ctx.status = 400
    ctx.body = { error: 'Missing section or content' }
    return
  }
  if (section !== 'memory' && section !== 'user' && section !== 'soul') {
    ctx.status = 400
    ctx.body = { error: 'Section must be "memory", "user", or "soul"' }
    return
  }
  let filePath: string
  const hd = requestProfileDir(ctx)
  if (section === 'soul') {
    filePath = join(hd, 'SOUL.md')
  } else {
    const fileName = section === 'memory' ? 'MEMORY.md' : 'USER.md'
    await mkdir(join(hd, 'memories'), { recursive: true })
    filePath = join(hd, 'memories', fileName)
  }
  try {
    await writeFile(filePath, content, 'utf-8')
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message }
  }
}
