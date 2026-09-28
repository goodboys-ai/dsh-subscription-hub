import { fetchKimiCodeUsage, fetchOpenCodeGoUsage } from './external-usage.js'
import type { ProviderUsage } from './common.js'

/** Usage-only sources whose model routes are supplied by the DSH base install. */
export type ExternalUsageSource = 'opencode-go' | 'kimi-code'

export const EXTERNAL_USAGE_SOURCES: readonly ExternalUsageSource[] = ['opencode-go', 'kimi-code']

export interface ExternalUsageStatus {
  configured: boolean
}

type ResolveCredential = (name: string) => Promise<{ value: string } | undefined>

const DEFAULT_REFS: Record<ExternalUsageSource, string> = {
  'opencode-go': 'OPENCODE_GO_API_KEY',
  'kimi-code': 'KIMI_CODING_API_KEY',
}

export class ExternalUsageController {
  private readonly refs: Record<ExternalUsageSource, string>

  constructor(
    private readonly resolveCredential: ResolveCredential,
    private readonly http: typeof fetch = fetch,
    refs: Partial<Record<ExternalUsageSource, string>> = {},
  ) {
    this.refs = { ...DEFAULT_REFS, ...refs }
  }

  async status(): Promise<Record<ExternalUsageSource, ExternalUsageStatus>> {
    const [go, kimi] = await Promise.all(EXTERNAL_USAGE_SOURCES.map(async source => {
      const value = await this.resolveCredential(this.refs[source])
      return typeof value?.value === 'string' && value.value.length > 0
    }))
    return { 'opencode-go': { configured: go ?? false }, 'kimi-code': { configured: kimi ?? false } }
  }

  async usage(source: ExternalUsageSource, signal?: AbortSignal): Promise<ProviderUsage> {
    const credential = await this.resolveCredential(this.refs[source])
    if (credential?.value === undefined || credential.value.length === 0) {
      throw new Error(`${source} API key is not configured`)
    }
    return source === 'opencode-go'
      ? fetchOpenCodeGoUsage(credential.value, this.http, signal)
      : fetchKimiCodeUsage(credential.value, this.http, signal)
  }
}
