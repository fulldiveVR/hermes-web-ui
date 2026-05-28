import type { HermesPluginsResponse } from '../../services/hermes/plugins'

// Variant B: plugin discovery shelled out to a local Hermes Agent (python +
// hermes_cli), which the shared web-ui does not have — plugins are hub-owned.
// Return an empty, well-formed response instead of a 500. Surfacing/managing
// tenant plugins would need a dedicated hub endpoint.
export async function list(ctx: any) {
  const body: HermesPluginsResponse = {
    plugins: [],
    warnings: [],
    metadata: { hermesAgentRoot: '', pythonExecutable: '', cwd: '', projectPluginsEnabled: false },
  }
  ctx.body = body
}
