import type { CheckDomain } from '../../../application/ingredient-creation/ingredient-check-run.service';
import type {
  CreationStep,
  IngredientDraft,
} from '../../../application/ingredient-creation/ingredient-creation.types';
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import type { CoverageCategory } from '../../../domain/ingredient-creation/state-coverage';

/**
 * 向导接口的受控词表。
 *
 * 与领域层类型用 `satisfies` 绑定：词表少一项、多一项或拼错，
 * TypeScript 会在编译期报错，而不是等非法值落进数据库。
 */
export const CREATION_STEPS = [
  'INTAKE',
  'SOURCES',
  'PROFILE',
  'CHECK',
  'INGREDIENT',
  'COMMIT',
] as const satisfies readonly CreationStep[];

export const PREPARATION_STATES = [
  'RAW',
  'COOKED',
] as const satisfies readonly PreparationState[];

export const COVERAGE_CATEGORIES = [
  'MEAT_ORGAN',
  'STARCHY_VEGETABLE',
  'OTHER',
] as const satisfies readonly CoverageCategory[];

export const INGREDIENT_TYPES = [
  'FOOD',
] as const satisfies readonly IngredientDraft['type'][];

export const BASE_UNITS = [
  'G',
  'ML',
  'PCS',
] as const satisfies readonly IngredientDraft['baseUnit'][];

/**
 * 按域核验的两页。
 *
 * 与 `CheckDomain` 用 `satisfies` 绑定：多一个少一个都会在编译期报错。
 * 触发方式（AGENT / USER）**不**放进请求体——由服务端按调用入口固定。
 */
export const CHECK_DOMAINS = [
  'INGREDIENT',
  'NUTRITION',
] as const satisfies readonly CheckDomain[];
