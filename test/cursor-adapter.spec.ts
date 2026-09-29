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

// ---------------------------------------------------------------------------
// Cursor generation: canned createAgentRun injection.
//
// The fake run below yields real agent.v1 server frames — protobuf-encoded
// with a minimal test-local writer whose field numbers are literals read
// from the vendored decoders. A wrong number decodes to "unknown" and the
// test fails, so the wire format is pinned independently of the transport.
// What is NOT covered stays honest: HTTP/2 framing, TLS, and the real
// Cursor server remain the manual pre-release canary's job
// (see docs/testing.md).
// ---------------------------------------------------------------------------

/** Minimal protobuf writer: enough for the server-message shapes faked here. */
function pbVarint(value: number): number[] {
  const out: number[] = []
  while (value > 0x7f) { out.push((value & 0x7f) | 0x80); value >>>= 7 }
  out.push(value)
  return out
}
/** Length-delimited field. */
function pbField(fieldNo: number, payload: Uint8Array): number[] {
  return [...pbVarint((fieldNo << 3) | 2), ...pbVarint(payload.length), ...payload]
}
/** Varint field. */
function pbVarintField(fieldNo: number, value: number): number[] {
  return [...pbVarint((fieldNo << 3) | 0), ...pbVarint(value)]
}
const pbBytes = (...fields: number[][]): Uint8Array => new Uint8Array(fields.flat())
const pbText = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * Field numbers from the vendored decoders in vendor/cursor/index.js:
 * AgentServerMessage.interaction_update = 1;
 * InteractionUpdate.text_delta = 1, token_delta = 8, turn_ended = 14;
 * TextDeltaUpdate.text = 1; TokenDeltaUpdate.tokens = 1.
 */
const interactionTextDelta = (text: string): Uint8Array =>
  pbBytes(pbField(1, pbBytes(pbField(1, pbBytes(pbField(1, pbText(text)))))))
const interactionTokenDelta = (tokens: number): Uint8Array =>
  pbBytes(pbField(1, pbBytes(pbField(8, pbBytes(pbVarintField(1, tokens))))))
const interactionTurnEnded = (): Uint8Array =>
  pbBytes(pbField(1, pbBytes(pbField(14, new Uint8Array(0)))))

interface CannedFrame { flags: number; payload: Uint8Array }
const dataFrame = (payload: Uint8Array): CannedFrame => ({ flags: 0, payload })

/** Top-level length-delimited fields of one protobuf message. */
function pbMessageFields(bytes: Uint8Array): Map<number, Uint8Array[]> {
  const fields = new Map<number, Uint8Array[]>()
  let pos = 0
  const readVarint = (): number => {
    let value = 0
    let shift = 0
    for (;;) {
      const byte = bytes[pos++]
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return value
      shift += 7
    }
  }
  while (pos < bytes.length) {
    const tag = readVarint()
    const fieldNo = tag >>> 3
    const wireType = tag & 7
    if (wireType === 0) { readVarint(); continue }
    if (wireType === 2) {
      const length = readVarint()
      const value = bytes.slice(pos, pos + length)
      pos += length
      const list = fields.get(fieldNo) ?? []
      list.push(value)
      fields.set(fieldNo, list)
      continue
    }
    if (wireType === 1) { pos += 8; continue }
    if (wireType === 5) { pos += 4; continue }
    throw new Error(`unexpected wire type ${wireType} in test decoder`)
  }
  return fields
}

/**
 * Extract the model id from a captured request payload:
 * AgentClientMessage.run_request = 1, RunRequest.model_details = 3,
 * ModelDetails.model_id = 1 (field numbers from the vendored builders).
 */
function requestModelId(payload: Uint8Array): string {
  const runRequest = pbMessageFields(payload).get(1)?.[0]
  assert.ok(runRequest, 'the request carries a run_request')
  const modelDetails = pbMessageFields(runRequest).get(3)?.[0]
  assert.ok(modelDetails, 'the run_request carries model_details')
  const modelId = pbMessageFields(modelDetails).get(1)?.[0]
  assert.ok(modelId, 'the model_details carry a model id')
  return new TextDecoder().decode(modelId)
}

interface CannedRunState {
  started: boolean
  written: Uint8Array[]
  closed: boolean
  aborts: unknown[]
}

/** A fake AgentRun: the real adapter drives it, but no socket ever exists. */
function cannedRun(frames: CannedFrame[]): { run: unknown; state: CannedRunState } {
  const state: CannedRunState = { started: false, written: [], closed: false, aborts: [] }
  const queue = [...frames]
  const run = {
    responseContentType: 'application/connect+proto',
    trailers: undefined as Record<string, string> | undefined,
    finished: false,
    frames: {
      next: async (): Promise<CannedFrame | undefined> => queue.shift(),
      pause() {},
      finish() {},
      resume() {},
    },
    async start() { state.started = true },
    writeMessage(bytes: Uint8Array) { state.written.push(bytes); return true },
    async waitForResponse() { return 200 },
    startHeartbeat() {},
    close() { state.closed = true },
    abort(error: unknown) { state.aborts.push(error) },
  }
  return { run, state }
}

const fakeCursorAuth = () => new CursorAuth({
  async resolve(ref) {
    assert.equal(ref, CURSOR_CREDENTIAL_REF)
    return { value: JSON.stringify({ type: 'oauth', access: 'fake-token', refresh: 'refresh-token', expires: Date.now() + 3_600_000 }) }
  },
  async set() { throw new Error('unexpected credential write') },
  async unset() { throw new Error('unexpected credential removal') },
})

test('Cursor generation translates server frames into DSH chunks', async () => {
  const { run, state } = cannedRun([
    dataFrame(interactionTextDelta('Hello, ')),
    dataFrame(interactionTextDelta('world!')),
    dataFrame(interactionTokenDelta(5)),
    dataFrame(interactionTurnEnded()),
  ])
  const adapter = new CursorCompatAdapter({
    auth: fakeCursorAuth(),
    createAgentRun: () => run,
  })
  const chunks: Array<{ type: string }> = []
  for await (const chunk of adapter.stream({
    provider: 'cursor-subscription', model: 'composer-2',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Say hi' }] }],
  })) chunks.push(chunk as { type: string })

  assert.deepEqual(
    chunks.filter((chunk) => chunk.type === 'text-delta'),
    [
      { type: 'text-delta', index: 0, text: 'Hello, ' },
      { type: 'text-delta', index: 0, text: 'world!' },
    ],
  )
  assert.deepEqual(
    chunks.find((chunk) => chunk.type === 'usage'),
    { type: 'usage', usage: { inputTokens: 0, outputTokens: 5 } },
  )
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
  // The retired composer-2 selection is remapped before the request is built.
  assert.equal(state.written.length, 1, 'exactly one request was written to the run')
  assert.equal(requestModelId(state.written[0]), 'composer-2.5')
  assert.ok(state.started, 'the run was started')
  assert.ok(state.closed, 'the run is closed after the stream ends')
})

test('Cursor generation sends the projected tool messages, not the raw DSH ones', async () => {
  const { run, state } = cannedRun([
    dataFrame(interactionTextDelta('done')),
    dataFrame(interactionTurnEnded()),
  ])
  const adapter = new CursorCompatAdapter({
    auth: fakeCursorAuth(),
    createAgentRun: () => run,
  })
  const callId = ToolCallId('call-9')
  const chunks: Array<{ type: string }> = []
  for await (const chunk of adapter.stream({
    provider: 'cursor-subscription', model: 'composer-2.5',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'run it' }] },
      {
        id: MessageId('message-9'), role: 'tool', toolCallId: callId,
        source: { kind: 'tool', callId }, isError: false,
        content: [{ type: 'text', text: 'exit 0' }],
      },
    ],
  })) chunks.push(chunk as { type: string })

  // coldStartLabel() tags a message "TOOL RESULT" only when its content holds
  // a tool-result block, which is what projectCursorMessages() rewrites the
  // DSH tool message into; an unprojected tool-role message would be labeled
  // "USER" instead. Assert the bracketed label, not the bare substring: the
  // cold-start preamble always mentions TOOL RESULT ("...TOOL RESULT entries
  // provide context only"), so the bare substring would pass even with the
  // projection removed.
  const wire = Buffer.from(state.written[0]).toString('utf8')
  assert.ok(wire.includes('[TOOL RESULT]'), 'the projected tool-result label reached the request')
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})
