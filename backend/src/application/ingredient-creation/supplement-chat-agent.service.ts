import { Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig
} from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSES } from './ingredient-creation-intake.service';
import type {
  SupplementChatAction,
  SupplementChatDraft,
  SupplementChatReply
} from '../../domain/ingredient/supplement-chat';

/**
 * 补剂对话的模型层。
 *
 * 复用食材线那套已经配置好的模型运行时（后台的 agent purposes），
 * 只换人设和输出契约：模型必须回 `{ reply, actions }`，动作词表与规则版完全一致，
 * 所以前端/执行链一行都不用改。
 *
 * 模型出任何问题都往上抛，由控制器回退到规则解析——**宁可用笨办法，不要不能用**。
 */
export interface SupplementChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface SupplementChatModelInput {
  message: string;
  history: SupplementChatTurn[];
  draft: SupplementChatDraft;
}

const TIMEOUT_MS = 20_000;
const MAX_HISTORY_TURNS = 8;
const MAX_TOKENS = 800;

const ALLOWED_ACTIONS = new Set([
  'SEARCH_CANDIDATES',
  'READ_LINK',
  'PICK_CANDIDATE',
  'SET_FIELD'
]);

const SYSTEM_PROMPT = `你是宠物鲜食后台「AI 添加原料」的补剂助手。你在帮管理员把一瓶补剂建成标准原料档案。

## 你能做的事（只能通过动作，不要自己编造结果）
- SEARCH_CANDIDATES：去 iHerb 搜候选。你说"我去找"，动作由系统执行，你再看到结果。
- READ_LINK：读某个商品链接的标签。
- PICK_CANDIDATE：选已经列出来的第 index 个候选（从 0 开始）。
- SET_FIELD：改档案字段，目前只支持 servingUnitsPerDose（每份几粒）。

## 规矩
- 选品顺序固定：① 化学形态（对狗安不安全、好不好吸收）② 人用还是犬用（饲料级、兽用、无零售包装直接不能用）③ 性价比（每 1000mg 有效成分多少钱）。顺序不能倒。
- 《饲料添加剂品种目录》只用来查标签名字和适用范围，**不是门禁**，不能因为查不到就判它出局。
- 算不出价钱就说算不出，不许拿估计值凑一个推荐。
- 下面三条**还没定稿**，问到就如实说"这条还没定"，不要替人做决定：
  1) 螯合形态是否一定优于离子型（NRC 对锌的原文是"生物利用率相当"）
  2) 哪几类补剂允许破例用犬用产品
  3) 鱼油是否设"每粒 EPA+DHA 下限"
- 改数据之前，先把你要做什么说清楚（例如"我去读第二瓶的标签，会覆盖现在填的内容"）。
- 剂量、能不能吃、吃多久，超出你的范围，交回给人。
- 不许假装做了没做的事。没搜到就说没搜到。

## 输出格式（必须是 JSON，不要加代码块）
{"reply": "给管理员看的中文回复", "actions": [{"type": "SEARCH_CANDIDATES", "keyword": "锌"}]}
没有要执行的动作就给空数组。`;

@Injectable()
export class SupplementChatAgentService {
  private readonly logger = new Logger(SupplementChatAgentService.name);

  constructor(private readonly providerConfig: AgentProviderConfigService) {}

  async respond(input: SupplementChatModelInput): Promise<SupplementChatReply> {
    const runtime = await this.loadRuntime();
    const body = await this.request(runtime, input);
    return this.parse(body);
  }

  private async loadRuntime(): Promise<DeepSeekRuntimeConfig> {
    let lastError: unknown = null;
    for (const purpose of INGREDIENT_INTAKE_AGENT_PURPOSES) {
      try {
        return await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
          purpose,
          fallbackToDefault: false
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('没有可用的 AI 配置');
  }

  private async request(
    runtime: DeepSeekRuntimeConfig,
    input: SupplementChatModelInput
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(
        `${runtime.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: runtime.model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'system', content: this.describeDraft(input.draft) },
              ...input.history
                .slice(-MAX_HISTORY_TURNS)
                .map((turn) => ({ role: turn.role, content: turn.text })),
              { role: 'user', content: input.message }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: MAX_TOKENS
          })
        }
      );

      if (!response.ok) {
        throw new Error(`模型返回 ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('模型没有返回内容');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  private describeDraft(draft: SupplementChatDraft): string {
    const candidates =
      draft.candidateNames.length > 0
        ? draft.candidateNames.map((name, index) => `${index}. ${name}`).join('\n')
        : '（还没有候选）';
    return [
      '## 现在的状态',
      `原料名：${draft.name || '（空）'}`,
      `每份几粒：${draft.servingUnitsPerDose ?? '（空）'}`,
      '候选（PICK_CANDIDATE 的 index 指这里）：',
      candidates
    ].join('\n');
  }

  /** 模型可能多给字段、给错类型、甚至给不存在的动作——一律过滤，不信任。 */
  private parse(content: string): SupplementChatReply {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.warn('[supplement-chat] 模型返回的不是 JSON');
      throw new Error('模型返回的不是 JSON');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('模型返回结构不对');
    }
    const record = parsed as { reply?: unknown; actions?: unknown };
    if (typeof record.reply !== 'string' || !record.reply.trim()) {
      throw new Error('模型没有给出回复');
    }

    const actions: SupplementChatAction[] = [];
    if (Array.isArray(record.actions)) {
      for (const raw of record.actions) {
        const action = this.toAction(raw);
        if (action) {
          actions.push(action);
        }
      }
    }

    return { reply: record.reply.trim(), actions };
  }

  private toAction(raw: unknown): SupplementChatAction | null {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const record = raw as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (!ALLOWED_ACTIONS.has(type)) {
      return null;
    }

    if (type === 'SEARCH_CANDIDATES') {
      const keyword = typeof record.keyword === 'string' ? record.keyword.trim() : '';
      return keyword ? { type: 'SEARCH_CANDIDATES', keyword } : null;
    }
    if (type === 'READ_LINK') {
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      return url ? { type: 'READ_LINK', url } : null;
    }
    if (type === 'PICK_CANDIDATE') {
      const index = Number(record.index);
      return Number.isInteger(index) && index >= 0
        ? { type: 'PICK_CANDIDATE', index }
        : null;
    }
    // SET_FIELD 目前只有每份几粒
    if (record.field !== 'servingUnitsPerDose') {
      return null;
    }
    const value = Number(record.value);
    return Number.isInteger(value) && value > 0 && value <= 20
      ? { type: 'SET_FIELD', field: 'servingUnitsPerDose', value }
      : null;
  }
}
