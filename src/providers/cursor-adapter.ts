import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CursorAdapter } from 'dsh-subscription-hub/cursor-transport'

/**
 * The imported Cursor transport still reads tool results as user-role content
 * blocks. DSH 0.1.7 carries them as first-class role=tool messages instead.
 */
export function projectCursorMessages(messages: GenerateOptions['messages']): unknown[] {
  return messages.map(message => message.role === 'tool'
    ? {
      ...message,
      role: 'user',
      content: [{
        type: 'tool-result',
        toolCallId: message.toolCallId,
        isError: message.isError,
        content: message.content,
      }],
    }
    : message)
}

export class CursorCompatAdapter extends CursorAdapter {
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return super.stream({
      ...options,
      // Existing DSH sessions may still hold this retired selection.
      model: options.model === 'composer-2' ? 'composer-2.5' : options.model,
      messages: projectCursorMessages(options.messages) as GenerateOptions['messages'],
    })
  }
}
