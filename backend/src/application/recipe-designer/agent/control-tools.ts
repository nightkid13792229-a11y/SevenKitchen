/**
 * 控制工具（P0a Task 5）。
 *
 * 三个工具都管“人”这一侧，不改草稿：
 * `ask_user` 停下来问、`request_exception` 申请例外/缺类确认、
 * `finish_draft` 生成交付确认卡。
 *
 * 安全边界（spec 4.3 / 5.2）：审批状态只能由后端从会话/数据库读取。
 * `finish_draft` 内部先调 `controlPort.getApprovalState()`，再把结果注入
 * Task 4 的 `check_ready`；模型传入的 `exceptionApproved` /
 * `confirmedOmissions` 一律不看。模型只能 `request_exception`，不能自批。
 *
 * 入参来自模型（运行时会绕过 TypeScript 类型），所以每个字段先做 `typeof`
 * 守卫：非法值返回 `INVALID_ARGUMENT`，绝不让 `TypeError` 冒出去。
 */
import { REQUIRED_FOOD_CATEGORIES } from '../../../domain/recipe-designer/food-category-map';
import type { RequiredFoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type { AgentToolErrorCode, AgentToolResult } from './agent-types';
import type { AgentReadyResult, RecipeAgentCheckTools } from './check-tools';
import type { RecipeAgentControlPort } from './recipe-agent.port';

/** 例外类型：达标例外（管理员批）或缺类确认（营养师确认）。 */
export type AgentExceptionType = 'COMPLIANCE' | 'CATEGORY_OMISSION';

export interface AgentUserQuestion {
  question: string;
  options?: string[];
}

export interface AgentUserQuestionResult {
  questions: AgentUserQuestion[];
}

export interface AgentExceptionRequest {
  type: AgentExceptionType;
  reason: string;
  detail?: string;
}

/** `finish_draft` 成功后给模型看的结果；`warnings` 会原样进交付确认卡。 */
export interface AgentDeliveryResult {
  status: Exclude<AgentReadyResult['status'], 'BLOCKED'>;
  warnings: string[];
}

/** 从后端读到的审批状态；模型不可传入。 */
export interface AgentApprovalState {
  approvedException: boolean;
  confirmedOmissions: RequiredFoodCategory[];
}

/** 读审批状态的结果：读失败或形状不对时带原因，调用方统一转成 CONTROL_NOT_AVAILABLE。 */
export type ApprovalStateRead =
  | { ok: true; state: AgentApprovalState }
  | { ok: false; message: string };

type RawToolArgs = Record<string, unknown>;

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** 一次最多问两个问题。 */
const MAX_QUESTIONS = 2;
/** 单个问题最多 200 字。 */
const MAX_QUESTION_LENGTH = 200;
/** 单个问题最多给 6 个选项。 */
const MAX_OPTIONS = 6;
/** 例外理由最多 500 字。 */
const MAX_REASON_LENGTH = 500;

const EXCEPTION_TYPES: readonly AgentExceptionType[] = [
  'COMPLIANCE',
  'CATEGORY_OMISSION',
];

const ok = <T>(data: T, summary: string): AgentToolResult<T> => ({
  ok: true,
  data,
  summary,
});

const fail = <T>(
  code: AgentToolErrorCode,
  message: string,
): AgentToolResult<T> => ({
  ok: false,
  error: { code, message },
});

function asRawArgs(args: unknown): RawToolArgs | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  return args as RawToolArgs;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isExceptionType(value: unknown): value is AgentExceptionType {
  return (
    typeof value === 'string' &&
    (EXCEPTION_TYPES as readonly string[]).includes(value)
  );
}

function isRequiredFoodCategory(value: string): value is RequiredFoodCategory {
  return (REQUIRED_FOOD_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 读取并校验后端审批状态。
 *
 * 审批状态来自会话/数据库，运行时可能返回 null、字段类型不对或整段缺失；
 * 这里先做形状守卫，读失败/形状不对都返回原因，不让解构抛 `TypeError`。
 * 调用方统一映射为 `CONTROL_NOT_AVAILABLE`（fail closed，不能当成“已批准”）。
 */
export async function readApprovalState(
  controlPort: RecipeAgentControlPort,
): Promise<ApprovalStateRead> {
  let raw: unknown;
  try {
    raw = await controlPort.getApprovalState();
  } catch (error) {
    return { ok: false, message: `读取审批状态失败：${errorMessage(error)}` };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: '审批状态格式不正确：必须是对象。' };
  }

  const record = raw as Record<string, unknown>;
  const approvedException = record.approvedException;
  if (typeof approvedException !== 'boolean') {
    return {
      ok: false,
      message: '审批状态格式不正确：approvedException 必须是布尔值。',
    };
  }

  const omissions = record.confirmedOmissions;
  if (!Array.isArray(omissions)) {
    return {
      ok: false,
      message: '审批状态格式不正确：confirmedOmissions 必须是数组。',
    };
  }

  const confirmedOmissions: RequiredFoodCategory[] = [];
  for (const entry of omissions) {
    if (typeof entry !== 'string' || !isRequiredFoodCategory(entry)) {
      return {
        ok: false,
        message: `审批状态格式不正确：confirmedOmissions 只能包含基础必需类别（${REQUIRED_FOOD_CATEGORIES.join('、')}）。`,
      };
    }
    confirmedOmissions.push(entry);
  }

  return {
    ok: true,
    state: { approvedException, confirmedOmissions },
  };
}

/** 解析问题列表：1–2 个，每个问题非空且 ≤ 200 字，选项最多 6 个。 */
function readQuestions(value: unknown): Parsed<AgentUserQuestion[]> {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: `questions 必须是数组，包含 1–${MAX_QUESTIONS} 个问题。`,
    };
  }
  if (value.length === 0 || value.length > MAX_QUESTIONS) {
    return {
      ok: false,
      message: `一次只能问 1–${MAX_QUESTIONS} 个问题。`,
    };
  }

  const questions: AgentUserQuestion[] = [];
  for (const [index, entry] of value.entries()) {
    const position = index + 1;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, message: `第 ${position} 个问题必须是对象。` };
    }
    const raw = entry as RawToolArgs;

    const questionValue = raw.question;
    if (typeof questionValue !== 'string') {
      return {
        ok: false,
        message: `第 ${position} 个问题的 question 必须是字符串。`,
      };
    }
    const question = questionValue.trim();
    if (!question) {
      return { ok: false, message: `第 ${position} 个问题不能为空。` };
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return {
        ok: false,
        message: `第 ${position} 个问题超过 ${MAX_QUESTION_LENGTH} 字，请说短一点。`,
      };
    }

    const optionsValue = raw.options;
    if (optionsValue === undefined) {
      questions.push({ question });
      continue;
    }
    if (!Array.isArray(optionsValue)) {
      return {
        ok: false,
        message: `第 ${position} 个问题的 options 必须是数组。`,
      };
    }
    if (optionsValue.length > MAX_OPTIONS) {
      return {
        ok: false,
        message: `第 ${position} 个问题最多给 ${MAX_OPTIONS} 个选项。`,
      };
    }
    const options: string[] = [];
    for (const optionValue of optionsValue) {
      if (typeof optionValue !== 'string' || !optionValue.trim()) {
        return {
          ok: false,
          message: `第 ${position} 个问题的选项必须是非空字符串。`,
        };
      }
      options.push(optionValue.trim());
    }
    questions.push(options.length > 0 ? { question, options } : { question });
  }

  return { ok: true, value: questions };
}

/** 调用控制端口；写会话/数据库失败也变成数据，不让异常穿出工具层。 */
async function callControl(
  action: () => Promise<void>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `操作失败：${errorMessage(error)}` };
  }
}

export interface ControlToolDeps {
  controlPort: RecipeAgentControlPort;
  /** Task 4 的 `check_ready`；审批参数由本模块注入。 */
  checkReady: RecipeAgentCheckTools['check_ready'];
}

/** `createControlTools` 的返回类型；Task 5 的注册表按这个形状挂 handler。 */
export interface RecipeAgentControlTools {
  ask_user(
    args?: RawToolArgs,
  ): Promise<AgentToolResult<AgentUserQuestionResult>>;
  request_exception(
    args?: RawToolArgs,
  ): Promise<AgentToolResult<AgentExceptionRequest>>;
  finish_draft(
    args?: RawToolArgs,
  ): Promise<AgentToolResult<AgentDeliveryResult>>;
}

/**
 * 造三个控制工具。
 *
 * @param deps.controlPort 控制端口：提问 / 申请 / 交付 / 读审批状态
 * @param deps.checkReady Task 4 的检查单；只接受后端注入的审批参数
 */
export function createControlTools(
  deps: ControlToolDeps,
): RecipeAgentControlTools {
  const { controlPort, checkReady } = deps;

  return {
    async ask_user(
      args: RawToolArgs = {},
    ): Promise<AgentToolResult<AgentUserQuestionResult>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }
      const parsed = readQuestions(raw.questions);
      if (!parsed.ok) {
        return fail('INVALID_ARGUMENT', parsed.message);
      }

      const written = await callControl(() =>
        controlPort.askUser({ questions: parsed.value }),
      );
      if (!written.ok) {
        return fail('CONTROL_NOT_AVAILABLE', written.message);
      }
      return ok(
        { questions: parsed.value },
        `已停下来问你 ${parsed.value.length} 个问题，等待回答。`,
      );
    },

    async request_exception(
      args: RawToolArgs = {},
    ): Promise<AgentToolResult<AgentExceptionRequest>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      if (!isExceptionType(raw.type)) {
        return fail(
          'INVALID_ARGUMENT',
          'type 只允许 COMPLIANCE（达标例外）或 CATEGORY_OMISSION（缺类确认）。',
        );
      }
      const type = raw.type;

      const reasonValue = raw.reason;
      if (typeof reasonValue !== 'string' || !reasonValue.trim()) {
        return fail('INVALID_ARGUMENT', '申请理由不能为空。');
      }
      const reason = reasonValue.trim();
      if (reason.length > MAX_REASON_LENGTH) {
        return fail(
          'INVALID_ARGUMENT',
          `申请理由超过 ${MAX_REASON_LENGTH} 字，请说清楚原因即可。`,
        );
      }

      const detailValue = raw.detail;
      if (detailValue !== undefined && typeof detailValue !== 'string') {
        return fail('INVALID_ARGUMENT', 'detail 必须是字符串。');
      }
      const detail =
        typeof detailValue === 'string' ? detailValue.trim() : undefined;

      const request: AgentExceptionRequest = { type, reason };
      if (detail) request.detail = detail;

      const written = await callControl(() =>
        controlPort.requestException(request),
      );
      if (!written.ok) {
        return fail('CONTROL_NOT_AVAILABLE', written.message);
      }

      const summary =
        type === 'COMPLIANCE'
          ? '已提交达标例外申请，等待管理员批准；批准前 check_ready 仍会拦截。'
          : '已提交缺类确认申请，等待营养师确认；确认前 check_ready 仍会拦截。';
      return ok(request, summary);
    },

    async finish_draft(
      args: RawToolArgs = {},
    ): Promise<AgentToolResult<AgentDeliveryResult>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const summaryValue = raw.summary;
      if (typeof summaryValue !== 'string' || !summaryValue.trim()) {
        return fail('INVALID_ARGUMENT', 'summary 不能为空。');
      }
      const summary = summaryValue.trim();

      // 审批状态只从后端读；args 里的 exceptionApproved / confirmedOmissions
      // 在这里根本不会被读取。
      const approval = await readApprovalState(controlPort);
      if (!approval.ok) {
        return fail(
          'CONTROL_NOT_AVAILABLE',
          `不能生成交付确认卡：${approval.message}`,
        );
      }

      const ready = await checkReady({
        exceptionApproved: approval.state.approvedException,
        confirmedOmissions: approval.state.confirmedOmissions,
      });
      if (!ready.ok) {
        return fail(ready.error.code, ready.error.message);
      }

      if (ready.data.status === 'BLOCKED') {
        const blocked = ready.data.checks
          .filter((check) => check.status === 'FAIL')
          .map((check) => check.detail ?? check.label);
        return fail(
          'READY_BLOCKED',
          `还不能交付：${blocked.join('；') || ready.summary}`,
        );
      }

      const warnings = ready.data.checks
        .filter((check) => check.status === 'WARN')
        .map((check) => check.detail ?? check.label);

      const written = await callControl(() =>
        controlPort.finishDraft({ summary, warnings }),
      );
      if (!written.ok) {
        return fail('CONTROL_NOT_AVAILABLE', written.message);
      }

      return ok(
        { status: ready.data.status, warnings },
        '已生成交付确认卡，等人点确认。',
      );
    },
  };
}
