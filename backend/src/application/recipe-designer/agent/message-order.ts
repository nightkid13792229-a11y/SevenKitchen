import type { DeepSeekToolsMessage } from '../deepseek-tools-chat';

/**
 * 校验“assistant(tool_calls) 之后必须紧跟全部 tool 消息”这条协议。
 *
 * 2026-11-19 线上事故：kb_read 与 kb_find 并行时，页图被当成一条 user 消息
 * 插在两条 tool 消息中间，下一轮请求被供应商判 HTTP 400。
 * 这里在每次调模型前检查一次，把“400”变成一条能看懂的错误。
 */
export function findToolMessageOrderViolation(
  messages: DeepSeekToolsMessage[],
): string | null {
  let expected: Set<string> | null = null;

  for (const message of messages) {
    if (expected && expected.size > 0) {
      if (
        message.role === 'tool' &&
        typeof message.tool_call_id === 'string' &&
        expected.has(message.tool_call_id)
      ) {
        expected.delete(message.tool_call_id);
        continue;
      }
      return `assistant tool_calls 之后出现了 ${message.role} 消息，仍有 ${expected.size} 个 tool 结果未回填`;
    }

    if (
      message.role === 'assistant' &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0
    ) {
      expected = new Set(message.tool_calls.map((call) => call.id));
    }
  }

  if (expected && expected.size > 0) {
    return `最后一条 assistant tool_calls 缺少 ${expected.size} 个 tool 结果`;
  }
  return null;
}
