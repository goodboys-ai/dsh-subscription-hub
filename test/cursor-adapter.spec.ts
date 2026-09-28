import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { CursorCompatAdapter, projectCursorMessages } from '../src/providers/cursor-adapter.js'
import { CURSOR_CREDENTIAL_REF, CursorAuth } from '../src/providers/cursor-auth.js'

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
    fetchModels: async () => [{ id: 'composer-2.5', name: 'Composer 2.5' }],
  })
  assert.deepEqual(adapter.providerInfo('cursor-subscription'), {
    id: 'cursor-subscription', name: 'Cursor subscription',
  })
  const models = await adapter.listModels('cursor-subscription')
  assert.deepEqual(models.map(model => model.id), ['composer-2.5'])
  const resolved = await adapter.resolveModel('cursor-subscription', 'composer-2.5')
  assert.equal(resolved.provider, 'cursor-subscription')
  assert.equal(resolved.id, 'composer-2.5')
})

test('Cursor discovery does not cache or advertise a default list before login', async () => {
  let signedIn = false
  const adapter = new CursorCompatAdapter({
    auth: { accessToken: async () => {
      if (!signedIn) throw new Error('Cursor is not signed in')
      return 'fake-token'
    } },
    fetchModels: async () => [{ id: 'composer-2.5', name: 'Composer 2.5' }],
  })
  await assert.rejects(adapter.listModels('cursor-subscription'), /not signed in/)
  signedIn = true
  assert.deepEqual((await adapter.listModels('cursor-subscription')).map(model => model.id), ['composer-2.5'])
  adapter.invalidateModels()
  assert.deepEqual((await adapter.listModelsForRpc({ force: true })).map(model => model.id), ['composer-2.5'])
})

test('Cursor visibility changes the picker but preserves discovery and existing model resolution', async () => {
  let visible: string[] | undefined = ['composer-2.5']
  const adapter = new CursorCompatAdapter({
    auth: { accessToken: async () => 'fake-token' },
    fetchModels: async () => [
      { id: 'composer-2.5', name: 'Composer 2.5' },
      { id: 'grok-code', name: 'Grok Code' },
    ],
    visibleModels: () => visible,
  })
  assert.deepEqual((await adapter.listModels('cursor-subscription')).map(model => model.id), ['composer-2.5'])
  assert.equal((await adapter.listModelsForRpc()).length, 2, 'Manage can restore a hidden model')
  assert.equal((await adapter.resolveModel('cursor-subscription', 'grok-code')).id, 'grok-code')
  visible = undefined
  assert.equal((await adapter.listModels('cursor-subscription')).length, 2, 'automatic mode shows new models')
  visible = []
  assert.deepEqual(await adapter.listModels('cursor-subscription'), [])
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
  const auth = new CursorAuth({
    async resolve(ref) {
      assert.equal(ref, CURSOR_CREDENTIAL_REF)
      return { value: JSON.stringify({ type: 'oauth', access: 'fake-token', refresh: 'refresh-token', expires: Date.now() + 3_600_000 }) }
    },
    async set() { throw new Error('unexpected credential write') },
    async unset() { throw new Error('unexpected credential removal') },
  })
  const adapter = new CursorCompatAdapter({
    auth,
    createAgentRun: () => new FakeRun(),
  })
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: 'cursor-subscription', model: 'composer-2',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    signal: new AbortController().signal,
  })) chunks.push(chunk)
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})
