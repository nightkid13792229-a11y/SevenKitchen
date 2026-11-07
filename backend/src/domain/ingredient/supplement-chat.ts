/**
 * 补剂对话的意图解析。
 *
 * 这一版**不接大模型**：它认几种说法，翻译成"要做什么"（动作），
 * 由前端把动作变成真的调用（搜候选、读标签、改字段）。
 * 好处是每一步都可测、可解释；以后换成模型驱动时，动作词表不用变。
 *
 * 认不出来就直说认不出，并给三个能用的说法——不猜、不假装懂。
 */
export interface SupplementChatDraft {
  /** 右边已经填了什么，用来判断"能不能执行" */
  name: string;
  servingUnitsPerDose: number | null;
  /** 已经摆出来的候选（按顺序） */
  candidateNames: string[];
}

export interface SupplementChatInput {
  message: string;
  draft: SupplementChatDraft;
}

export type SupplementChatAction =
  | { type: 'SEARCH_CANDIDATES'; keyword: string }
  | { type: 'READ_LINK'; url: string }
  | { type: 'PICK_CANDIDATE'; index: number }
  | { type: 'SET_FIELD'; field: 'servingUnitsPerDose'; value: number };

export interface SupplementChatReply {
  reply: string;
  actions: SupplementChatAction[];
}

const ORDINALS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10
};

/** 「我想给狗狗补点锌」→ 锌。把语气词和对象去掉，剩下的当关键词。 */
const FILLER = /(帮我|给我|我想|我要|想|要|麻烦|请|一下|给狗狗|狗狗|给我家狗|我家狗|狗|猫|添加|加个|加一个|补点|补个|补|买)/g;

const LEADING_VERB = /^(找|查|搜|看看|看|挑|选|买|来|去|有没有|有|需要|要|加|补)+/;
const TRAILING_PARTICLE = /[吧呢啊呀呗哦了嘛]+$/;
const MASS_HINT = /^\d+(\.\d+)?\s*(mg|g|ml|克|毫克|毫升)/i;

function extractKeyword(message: string): string {
  let word = message
    .replace(FILLER, '')
    .replace(/[，。？！,.?!、]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] ?? '';

  word = word.replace(LEADING_VERB, '').replace(TRAILING_PARTICLE, '').trim();

  // 单个汉字是合法的（锌 / 钙 / 铁 / 硒），但数字和剂量写法都不像"要补什么"
  if (word.length === 0 || MASS_HINT.test(word)) {
    return '';
  }
  if (word.length === 1 && !/[\u4e00-\u9fa5]/.test(word)) {
    return '';
  }
  return word.slice(0, 20);
}

function extractUrl(message: string): string | null {
  const match = message.match(/https?:\/\/[^\s，。]+/);
  return match ? match[0] : null;
}

function extractOrdinal(message: string): number | null {
  const match = message.match(/第\s*([一二两三四五六七八九十\d]{1,2})\s*(个|款|瓶|条)?/);
  if (!match) {
    return null;
  }
  const token = match[1];
  return token ? (ORDINALS[token] ?? null) : null;
}

const COUNT_UNIT = /^(粒|片|胶囊|颗|勺|袋)$/;

/** 只说「每份 2 粒」这种计数单位；「每份 2 克 / 2 勺」不是我们要的那个数。 */
function extractServingUnits(message: string): number | null {
  const match =
    message.match(/每份\s*(\d+)\s*(粒|片|胶囊|颗|勺|袋|克|g|mg|ml|毫升)/i) ??
    message.match(/每份几粒[^0-9]{0,6}(\d+)/);
  if (!match) {
    return null;
  }
  if (match[2] && !COUNT_UNIT.test(match[2])) {
    return -1; // 用负数表示"说的是重量/体积单位"
  }
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 20 ? value : null;
}

export function interpretSupplementMessage(
  input: SupplementChatInput
): SupplementChatReply {
  const message = (input.message ?? '').trim();
  const candidateNames = input.draft?.candidateNames ?? [];
  if (!message) {
    return { reply: '你想给狗狗补什么？说个名字就行，比如「加个锌」。', actions: [] };
  }

  // 1) 贴了链接：直接读那瓶
  const url = extractUrl(message);
  if (url) {
    return {
      reply: '我读一下这瓶的标签，读到就把每份值和标签原文填到右边。',
      actions: [{ type: 'READ_LINK', url }]
    };
  }

  // 2) 选第几个：前提是真的有候选
  const ordinal = extractOrdinal(message);
  if (ordinal !== null) {
    if (candidateNames.length === 0) {
      return { reply: '现在还没有候选，先说「加个锌」让我找一批。', actions: [] };
    }
    if (ordinal > candidateNames.length) {
      return {
        reply: `现在只有 ${candidateNames.length} 个候选，你选的第 ${ordinal} 个不存在。`,
        actions: []
      };
    }
    const name = candidateNames[ordinal - 1];
    return {
      reply: `好，就「${name}」。我读它的标签，把每份值填过来。`,
      actions: [{ type: 'PICK_CANDIDATE', index: ordinal - 1 }]
    };
  }

  // 3) 改字段
  if (/不(要|用|需要|加)/.test(message)) {
    return { reply: '那就不加。你想改成什么？还是先把右边已经填的取消掉？', actions: [] };
  }

  const servingUnits = extractServingUnits(message);
  if (servingUnits === -1) {
    return {
      reply: '你说的是每份多少克/毫升，我要的是「每份几粒」（粒/片/胶囊）。',
      actions: []
    };
  }
  if (servingUnits !== null) {
    return {
      reply: `每份 ${servingUnits} 粒，记下了；右边会跟着重算每粒值。`,
      actions: [{ type: 'SET_FIELD', field: 'servingUnitsPerDose', value: servingUnits }]
    };
  }

  // 3b) 提到了每份几粒、但数字不像话：说明白，别退化成"去搜「每份」"
  if (/每份/.test(message) && /\d/.test(message)) {
    return {
      reply: '每份几粒应该是 1–20 之间的整数。你再说一次，比如「每份 2 粒」。',
      actions: []
    };
  }

  // 4) 问理由
  if (/为什么|理由|依据|怎么选/.test(message)) {
    return {
      reply:
        '顺序是固定的：先看形态（对狗安不安全、好不好吸收），再看人用还是犬用（饲料级进不了我们的货），' +
        '前两层打平才比每 1000mg 的价钱。目录只用来查标签名字，不参与排序。' +
        '注意：形态优劣还有三条没定稿，遇到我会停下来问你。',
      actions: []
    };
  }

  // 5) 要补什么 → 去搜
  const keyword = extractKeyword(message);
  if (keyword) {
    return {
      reply: `我去 iHerb 找「${keyword}」的候选，找到就摆出来给你挑；找不到会直说。`,
      actions: [{ type: 'SEARCH_CANDIDATES', keyword }]
    };
  }

  return {
    reply: '这句我没听懂。你可以说「加个锌」、「第一个」、「每份 2 粒」，或者直接贴商品链接。',
    actions: []
  };
}
