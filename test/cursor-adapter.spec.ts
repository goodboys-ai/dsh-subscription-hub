import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { CursorCompatAdapter, projectCursorMessages } from '../src/providers/cursor-adapter.js'

test('Cursor adapter projects DSH 0.1.7 tool messages for the imported transport', () => {
  const callId = ToolCallId('call-1')
  const message = {
    id: MessageId('message-1'), role: 'tool' as const, toolCallId: callId,
    source: { kind: 'tool' as const, callId }, isError: false,
    content: [{ type: 'text' as const, text: 'done' }],
  }
  assert.deepEqual(projectCursorMessages([message]), [{
    ...message, role: 'user', content: [{
      type: 'tool-result', toolCallId: callId, isError: false,
      content: [{ type: 'text', text: 'done' }],
    }],
  }])
  assert.equal(message.role, 'tool', 'the request message remains unchanged')
})

test('imported Cursor transport registers a provider and discovers models with DSH 0.1.7', async () => {
  const adapter = new CursorCompatAdapter({
    auth: { accessToken: async () => 'fake-token' },
    fetchModels: async () => [{ id: 'composer-2', name: 'Composer 2' }],
  })
  assert.deepEqual(adapter.providerInfo('cursor-subscription'), {
    id: 'cursor-subscription', name: 'Cursor subscription',
  })
  const models = await adapter.listModels('cursor-subscription')
  assert.deepEqual(models.map(model => model.id), ['composer-2'])
  const resolved = await adapter.resolveModel('cursor-subscription', 'composer-2')
  assert.equal(resolved.provider, 'cursor-subscription')
  assert.equal(resolved.id, 'composer-2')
})

test('Cursor transport accepts a DSH 0.1.7 request and completes a mocked run', async () => {
  class FakeRun {
    finished = false
    stream = { destroyed: false }
    responseContentType = 'application/connect+proto'
    frames = {
      next: async () => this.taken++ === 0
        ? { flags: 0b00000010, payload: Buffer.from('{}') }
        : undefined,
    }
    private taken = 0
    async start() {}
    writeMessage() { return true }
    async waitForResponse() { return 200 }
    startHeartbeat() {}
    abort() { this.close() }
    close() { this.finished = true; this.stream.destroyed = true }
  }
  const adapter = new CursorCompatAdapter({
    auth: { accessToken: async () => 'fake-token' },
    createAgentRun: () => new FakeRun(),
  })
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: 'cursor-subscription', model: 'composer-2',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
  })) chunks.push(chunk)
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})
