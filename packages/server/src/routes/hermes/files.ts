import Router from '@koa/router'
import { hubClient, HubError, type HubTenantFileEntry } from '../../services/hub/hub-client'

function requestedProfile(ctx: any): string | undefined {
  return ctx.state?.profile?.name
}

function requestedTenant(ctx: any): string {
  return requestedProfile(ctx) || ''
}

export const fileRoutes = new Router()

function handleError(ctx: any, err: any) {
  const code = err.code || 'unknown'
  const statusMap: Record<string, number> = {
    missing_path: 400,
    invalid_path: 400,
    not_found: 404,
    ENOENT: 404,
    already_exists: 409,
    permission_denied: 403,
    file_too_large: 413,
    not_a_directory: 400,
    not_a_file: 400,
    unsupported_backend: 501,
    backend_error: 502,
    backend_timeout: 504,
  }
  ctx.status = statusMap[code] || 500
  ctx.body = { error: err.message, code }
}

function handleHubError(ctx: any, err: any) {
  if (err instanceof HubError) {
    ctx.status = err.status
    try {
      const body = err.body ? JSON.parse(err.body) : null
      ctx.body = body || { error: err.message }
    } catch {
      ctx.body = { error: err.body || err.message }
    }
    return
  }
  handleError(ctx, err)
}

function requireTenant(ctx: any): string | null {
  const tenantId = requestedTenant(ctx)
  if (!tenantId) {
    ctx.status = 400
    ctx.body = { error: 'Tenant profile is required', code: 'missing_profile' }
    return null
  }
  return tenantId
}

function toFileEntry(entry: HubTenantFileEntry) {
  return {
    name: entry.name,
    path: entry.path,
    isDir: entry.isDir,
    size: entry.size,
    modTime: entry.modTime,
    mimeType: entry.mimeType,
    type: entry.type,
  }
}

function rejectReadOnly(ctx: any) {
  ctx.status = 501
  ctx.body = { error: 'Tenant workspace files are read-only in this UI', code: 'unsupported_backend' }
}

// GET /api/hermes/files/list?path=
fileRoutes.get('/api/hermes/files/list', async (ctx) => {
  const relativePath = (ctx.query.path as string) || ''
  const tenantId = requireTenant(ctx)
  if (!tenantId) return
  try {
    const result = await hubClient.listTenantFiles(tenantId, relativePath)
    const entries = result.entries.map(toFileEntry)
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    ctx.body = { entries, path: result.path, readOnly: true }
  } catch (err: any) {
    handleHubError(ctx, err)
  }
})

// GET /api/hermes/files/stat?path=
fileRoutes.get('/api/hermes/files/stat', async (ctx) => {
  const relativePath = ctx.query.path as string
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  try {
    const tenantId = requireTenant(ctx)
    if (!tenantId) return
    const parent = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : ''
    const result = await hubClient.listTenantFiles(tenantId, parent)
    const info = result.entries.find(entry => entry.path === relativePath)
    if (!info) {
      ctx.status = 404
      ctx.body = { error: 'File not found', code: 'not_found' }
      return
    }
    ctx.body = toFileEntry(info)
  } catch (err: any) {
    handleHubError(ctx, err)
  }
})

// GET /api/hermes/files/read?path=
fileRoutes.get('/api/hermes/files/read', async (ctx) => {
  const relativePath = ctx.query.path as string
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  try {
    const tenantId = requireTenant(ctx)
    if (!tenantId) return
    ctx.body = await hubClient.getTenantFileContent(tenantId, relativePath)
  } catch (err: any) {
    handleHubError(ctx, err)
  }
})

// GET /api/hermes/files/download?path=
fileRoutes.get('/api/hermes/files/download', async (ctx) => {
  const relativePath = ctx.query.path as string
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  const tenantId = requireTenant(ctx)
  if (!tenantId) return
  try {
    const result = await hubClient.downloadTenantFile(tenantId, relativePath)
    const fileName = String(ctx.query.name || result.fileName)
    ctx.set('Content-Type', result.contentType)
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    ctx.set('Content-Length', String(result.data.length))
    ctx.set('Cache-Control', 'no-cache')
    ctx.body = result.data
  } catch (err: any) {
    handleHubError(ctx, err)
  }
})

// PUT /api/hermes/files/write  body: { path, content }
fileRoutes.put('/api/hermes/files/write', async (ctx) => {
  rejectReadOnly(ctx)
})

// DELETE /api/hermes/files/delete  body: { path, recursive? }
fileRoutes.delete('/api/hermes/files/delete', async (ctx) => {
  rejectReadOnly(ctx)
})

// POST /api/hermes/files/rename  body: { oldPath, newPath }
fileRoutes.post('/api/hermes/files/rename', async (ctx) => {
  rejectReadOnly(ctx)
})

// POST /api/hermes/files/mkdir  body: { path }
fileRoutes.post('/api/hermes/files/mkdir', async (ctx) => {
  rejectReadOnly(ctx)
})

// POST /api/hermes/files/copy  body: { srcPath, destPath }
fileRoutes.post('/api/hermes/files/copy', async (ctx) => {
  rejectReadOnly(ctx)
})

// POST /api/hermes/files/upload?path=  (multipart/form-data)
fileRoutes.post('/api/hermes/files/upload', async (ctx) => {
  rejectReadOnly(ctx)
})
