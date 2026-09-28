import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'

export class CursorAdapter extends LlmAdapter {
  constructor(options: {
    auth: { accessToken(): Promise<string> }
    resolveAttachments?: () => unknown
    fetchModels?: (access: string) => Promise<{ id: string; name: string }[]>
    createAgentRun?: (access: string) => unknown
    logger?: { warn?(message: string, ...args: unknown[]): void }
  })
  providerInfo(provider: string): { id: string; name: string }
  listModels(provider: string): Promise<LlmModelInfo[]>
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
