/**
 * 结构化制作步骤（2026-10-22 · Task 4）。
 *
 * 存储形态是一个有序数组：
 * ```json
 * [
 *   {
 *     "sortOrder": 1,
 *     "instruction": "将所有食材按配方称重",
 *     "durationMinutes": null,
 *     "temperatureC": null,
 *     "equipment": null
 *   }
 * ]
 * ```
 *
 * 这里是**纯函数**：DTO 负责请求形状，Nest 服务负责权限与落库。
 * 写入走 `validateProductionSteps`（严格，任何一条不合法都返回错误）；
 * 读取存量数据走 `readProductionSteps`（宽松，坏条目丢弃，避免一条脏数据
 * 把整个编辑器锁死）。
 */

export const PRODUCTION_STEP_LIMITS = {
  /** 单份食谱最多步骤数 */
  maxSteps: 50,
  /** 操作说明最大长度 */
  maxInstructionLength: 500,
  /** 设备名称最大长度 */
  maxEquipmentLength: 100,
  /** 步骤时长（分钟）上限：24 小时 */
  maxDurationMinutes: 1440,
  /** 温度（摄氏度）范围：冷冻到高温烘烤 */
  minTemperatureC: -50,
  maxTemperatureC: 500,
  /** sortOrder 允许范围 */
  minSortOrder: 1,
  maxSortOrder: 999,
} as const;

export type ProductionStep = {
  sortOrder: number;
  instruction: string;
  durationMinutes: number | null;
  temperatureC: number | null;
  equipment: string | null;
};

export type ProductionStepsValidationResult =
  | { ok: true; steps: ProductionStep[] }
  | { ok: false; error: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeOptionalText = (
  value: unknown,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; tooLong: true } => {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, tooLong: true };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, tooLong: true };
  }
  return { ok: true, value: trimmed };
};

const normalizeOptionalNumber = (
  value: unknown,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; invalid: true } => {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, invalid: true };
  }
  if (value < min || value > max) {
    return { ok: false, invalid: true };
  }
  return { ok: true, value };
};

/**
 * 严格校验并规范化「写入」用的步骤数组。
 *
 * 规则：
 * - `steps` 必须是数组，最多 `maxSteps` 条；
 * - `sortOrder` 必须是 1-999 的整数、不能重复、数组本身必须按升序排列；
 * - `instruction` 去空格后不能为空，最长 500；
 * - `durationMinutes` 可选，0-1440；`temperatureC` 可选，-50-500；
 * - `equipment` 可选，最长 100。
 */
export const validateProductionSteps = (
  input: unknown,
): ProductionStepsValidationResult => {
  if (!Array.isArray(input)) {
    return { ok: false, error: '制作步骤必须是数组' };
  }
  if (input.length > PRODUCTION_STEP_LIMITS.maxSteps) {
    return {
      ok: false,
      error: `制作步骤不能超过 ${PRODUCTION_STEP_LIMITS.maxSteps} 步`,
    };
  }

  const steps: ProductionStep[] = [];
  const seenSortOrders = new Set<number>();
  let previousSortOrder: number | null = null;

  for (const [index, raw] of input.entries()) {
    const label = `第 ${index + 1} 个制作步骤`;
    if (!isPlainObject(raw)) {
      return { ok: false, error: `${label}格式不正确` };
    }

    const sortOrder = raw.sortOrder;
    if (
      !Number.isInteger(sortOrder) ||
      Number(sortOrder) < PRODUCTION_STEP_LIMITS.minSortOrder ||
      Number(sortOrder) > PRODUCTION_STEP_LIMITS.maxSortOrder
    ) {
      return {
        ok: false,
        error: `${label}的排序值必须是 ${PRODUCTION_STEP_LIMITS.minSortOrder}-${PRODUCTION_STEP_LIMITS.maxSortOrder} 的整数`,
      };
    }
    if (seenSortOrders.has(Number(sortOrder))) {
      return {
        ok: false,
        error: `制作步骤的排序值 ${sortOrder} 重复`,
      };
    }
    if (previousSortOrder !== null && Number(sortOrder) <= previousSortOrder) {
      return { ok: false, error: '制作步骤必须按排序值从小到大排列' };
    }
    seenSortOrders.add(Number(sortOrder));
    previousSortOrder = Number(sortOrder);

    const instruction = raw.instruction;
    if (typeof instruction !== 'string' || !instruction.trim()) {
      return { ok: false, error: `${label}缺少操作说明` };
    }
    const trimmedInstruction = instruction.trim();
    if (
      trimmedInstruction.length > PRODUCTION_STEP_LIMITS.maxInstructionLength
    ) {
      return {
        ok: false,
        error: `${label}的操作说明不能超过 ${PRODUCTION_STEP_LIMITS.maxInstructionLength} 个字符`,
      };
    }

    const duration = normalizeOptionalNumber(
      raw.durationMinutes,
      0,
      PRODUCTION_STEP_LIMITS.maxDurationMinutes,
    );
    if (!duration.ok) {
      return {
        ok: false,
        error: `${label}的时长必须是 0-${PRODUCTION_STEP_LIMITS.maxDurationMinutes} 分钟`,
      };
    }

    const temperature = normalizeOptionalNumber(
      raw.temperatureC,
      PRODUCTION_STEP_LIMITS.minTemperatureC,
      PRODUCTION_STEP_LIMITS.maxTemperatureC,
    );
    if (!temperature.ok) {
      return {
        ok: false,
        error: `${label}的温度必须是 ${PRODUCTION_STEP_LIMITS.minTemperatureC}-${PRODUCTION_STEP_LIMITS.maxTemperatureC} ℃`,
      };
    }

    const equipment = normalizeOptionalText(
      raw.equipment,
      PRODUCTION_STEP_LIMITS.maxEquipmentLength,
    );
    if (!equipment.ok) {
      return {
        ok: false,
        error: `${label}的设备不能超过 ${PRODUCTION_STEP_LIMITS.maxEquipmentLength} 个字符`,
      };
    }

    steps.push({
      sortOrder: Number(sortOrder),
      instruction: trimmedInstruction,
      durationMinutes: duration.value,
      temperatureC: temperature.value,
      equipment: equipment.value,
    });
  }

  return { ok: true, steps };
};

/**
 * 宽松读取存量步骤（GET / 发布前展示 / 复制旧数据）。
 *
 * 不抛错：非数组返回空数组，坏条目跳过，最后按 sortOrder 排序。
 * 写入路径永远走 `validateProductionSteps`，因此这里只用于「读」。
 */
export const readProductionSteps = (value: unknown): ProductionStep[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const steps: ProductionStep[] = [];
  const seenSortOrders = new Set<number>();

  for (const raw of value) {
    if (!isPlainObject(raw)) {
      continue;
    }
    const sortOrder = raw.sortOrder;
    if (
      !Number.isInteger(sortOrder) ||
      Number(sortOrder) < PRODUCTION_STEP_LIMITS.minSortOrder ||
      Number(sortOrder) > PRODUCTION_STEP_LIMITS.maxSortOrder ||
      seenSortOrders.has(Number(sortOrder))
    ) {
      continue;
    }
    if (typeof raw.instruction !== 'string' || !raw.instruction.trim()) {
      continue;
    }
    const instruction = raw.instruction.trim();
    if (instruction.length > PRODUCTION_STEP_LIMITS.maxInstructionLength) {
      continue;
    }

    const duration = normalizeOptionalNumber(
      raw.durationMinutes,
      0,
      PRODUCTION_STEP_LIMITS.maxDurationMinutes,
    );
    const temperature = normalizeOptionalNumber(
      raw.temperatureC,
      PRODUCTION_STEP_LIMITS.minTemperatureC,
      PRODUCTION_STEP_LIMITS.maxTemperatureC,
    );
    const equipment = normalizeOptionalText(
      raw.equipment,
      PRODUCTION_STEP_LIMITS.maxEquipmentLength,
    );
    if (!duration.ok || !temperature.ok || !equipment.ok) {
      continue;
    }

    seenSortOrders.add(Number(sortOrder));
    steps.push({
      sortOrder: Number(sortOrder),
      instruction,
      durationMinutes: duration.value,
      temperatureC: temperature.value,
      equipment: equipment.value,
    });
  }

  return steps.sort((left, right) => left.sortOrder - right.sortOrder);
};
