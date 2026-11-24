import type {
  DeepSeekToolCall,
  DeepSeekToolsMessage,
} from '../../../src/application/recipe-designer/deepseek-tools-chat';
import { findToolMessageOrderViolation } from '../../../src/application/recipe-designer/agent/message-order';

function call(id: string): DeepSeekToolCall {
  return {
    id,
    type: 'function',
    function: { name: 'kb_read', arguments: '{}' },
  };
}

function assistantWithCalls(ids: string[]): DeepSeekToolsMessage {
  return {
    role: 'assistant',
    content: null,
    tool_calls: ids.map(call),
  };
}

function toolMessage(id: string): DeepSeekToolsMessage {
  return { role: 'tool', tool_call_id: id, content: '{}' };
}

function imageMessage(): DeepSeekToolsMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: '第 p1 页' },
      { type: 'image_url', image_url: { url: 'https://img.example.com/1.jpg' } },
    ],
  };
}

describe('findToolMessageOrderViolation', () => {
  it('flags a user image inserted between parallel tool results', () => {
    const messages: DeepSeekToolsMessage[] = [
      assistantWithCalls(['a', 'b']),
      toolMessage('a'),
      imageMessage(),
      toolMessage('b'),
    ];

    expect(findToolMessageOrderViolation(messages)).toContain(
      '仍有 1 个 tool 结果未回填',
    );
  });

  it('accepts images placed after all tool results', () => {
    const messages: DeepSeekToolsMessage[] = [
      assistantWithCalls(['a', 'b']),
      toolMessage('a'),
      toolMessage('b'),
      imageMessage(),
    ];

    expect(findToolMessageOrderViolation(messages)).toBeNull();
  });

  it('flags missing tool results at the end', () => {
    const messages: DeepSeekToolsMessage[] = [
      assistantWithCalls(['a', 'b']),
      toolMessage('a'),
    ];

    expect(findToolMessageOrderViolation(messages)).toContain(
      '缺少 1 个 tool 结果',
    );
  });

  it('flags a system nudge inserted before the tool result', () => {
    const messages: DeepSeekToolsMessage[] = [
      assistantWithCalls(['a']),
      { role: 'system', content: '请修正选材清单' },
      toolMessage('a'),
    ];

    expect(findToolMessageOrderViolation(messages)).toContain(
      'assistant tool_calls 之后出现了 system 消息',
    );
  });

  it('accepts a system nudge after all tool results', () => {
    const messages: DeepSeekToolsMessage[] = [
      assistantWithCalls(['a', 'b']),
      toolMessage('a'),
      toolMessage('b'),
      { role: 'system', content: '请修正选材清单' },
    ];

    expect(findToolMessageOrderViolation(messages)).toBeNull();
  });

  it('returns null for ordinary conversations', () => {
    const messages: DeepSeekToolsMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];

    expect(findToolMessageOrderViolation(messages)).toBeNull();
  });
});
