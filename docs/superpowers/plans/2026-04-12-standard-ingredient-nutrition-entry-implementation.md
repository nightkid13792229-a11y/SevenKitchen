# 标准原料统一营养数据录入重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将标准原料的“统一营养数据”从当前自由营养素列表，重构为“顶部固定区 + 五个固定页签 + 自定义营养项”的结构化录入方案，并保持对现有历史 JSON 的兼容读取与可控迁移。

**Architecture:** 后端继续复用 `ingredient.nutritionProfile` 这个 JSON 字段，但将其 shape 从 `{ items: [] }` 升级为结构化对象；在领域层增加“旧结构 -> 新结构”的标准化 helper，确保读取兼容。管理后台新增固定营养素字典与编辑器组件，替换当前 `IngredientForm.vue` 中的自由表格式营养列表；包材仍隐藏营养编辑区。

**Tech Stack:** NestJS + Prisma + Jest、Vue 3 + Element Plus admin-web、TypeScript

---

## 范围与取舍

- 只处理标准原料的营养档案录入
- 不处理采购 SKU、DIY SKU、小程序消费层
- 不把原料背景信息扩成 ADF 那种完整档案
- 不新增数据库列；继续复用 `ingredient.nutrition_profile` JSON 字段
- 允许保留对旧版 `{ items: NutritionItem[] }` 结构的兼容读取，避免一次性断裂

## 当前代码落点

- 当前后台营养录入 UI：`admin-web/src/views/Ingredients/IngredientForm.vue`
- 当前后台营养类型：`admin-web/src/types/ingredient.ts`
- 当前后端营养类型：`backend/src/domain/ingredient/types.ts`
- 当前 service 透传营养档案：`backend/src/application/ingredient/ingredient.service.ts`
- 当前 Prisma 仓储读写：`backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`
- 当前数据库字段：`backend/prisma/schema.prisma` 中 `Ingredient.nutritionProfile Json?`
- 已有 backend Jest 测试入口：`backend/tests/**/*.spec.ts`

## 文件结构

### Backend

- Create: `backend/src/domain/ingredient/nutrition-profile.constants.ts`
- Create: `backend/src/domain/ingredient/nutrition-profile.utils.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`
- Create: `backend/prisma/backfill-ingredient-nutrition-profile-v2.ts`
- Modify: `backend/package.json`

### Backend tests

- Create: `backend/tests/application/ingredient/nutrition-profile-structure.spec.ts`
- Create: `backend/tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts`

### Admin web

- Create: `admin-web/src/constants/ingredientNutrition.ts`
- Create: `admin-web/src/utils/ingredientNutrition.ts`
- Create: `admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue`
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

## 设计约束

1. 所有食材、补剂共用一套固定模板。
2. 包材继续不显示营养录入区。
3. 主字典固定五个页签：`macros / minerals / vitamins / fattyAcids / aminoAcids`。
4. 自定义营养项独立成区，不混入主字典。
5. 顶部固定区包含：原始口径、换算辅助参数、数据来源、治理信息。
6. 第一版允许空值，不做复杂必填矩阵。
7. 单位由系统字典固定，录入人主要填写数值。

---

### Task 1: 建立后端结构化营养档案契约与兼容读取层

**Files:**
- Create: `backend/src/domain/ingredient/nutrition-profile.constants.ts`
- Create: `backend/src/domain/ingredient/nutrition-profile.utils.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`
- Test: `backend/tests/application/ingredient/nutrition-profile-structure.spec.ts`

- [ ] **Step 1: 先写失败测试，锁定新旧结构兼容行为**

  新建 `backend/tests/application/ingredient/nutrition-profile-structure.spec.ts`，先定义 3 个最关键断言：

  ```ts
  import {
    normalizeNutritionProfile,
    denormalizeNutritionProfileForPersistence,
  } from '../../../src/domain/ingredient/nutrition-profile.utils';

  describe('nutrition profile structure', () => {
    it('normalizes legacy items[] payload into grouped profile', () => {
      const normalized = normalizeNutritionProfile({
        items: [
          { nutrientCode: 'protein', nutrientName: '粗蛋白', value: 18, unit: 'g', basisType: 'PER_100_G' },
          { nutrientCode: 'calcium', nutrientName: '钙', value: 240, unit: 'mg', basisType: 'PER_100_G' },
        ],
      } as any);

      expect(normalized.meta.rawBasisType).toBe('PER_100_G');
      expect(normalized.macros.crudeProtein).toBe(18);
      expect(normalized.minerals.calcium).toBe(240);
    });

    it('keeps structured profile unchanged when already v2', () => {
      const input = {
        meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.22 },
        macros: { crudeProtein: null },
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      };

      expect(normalizeNutritionProfile(input as any)).toEqual(input);
    });

    it('serializes normalized profile back to persistence shape', () => {
      const payload = denormalizeNutritionProfileForPersistence({
        meta: { rawBasisType: 'PER_100_G' },
        macros: { crudeProtein: 18 },
        minerals: { calcium: 240 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any);

      expect(payload.meta.rawBasisType).toBe('PER_100_G');
      expect(payload.macros.crudeProtein).toBe(18);
    });
  });
  ```

- [ ] **Step 2: 运行测试，确认当前实现缺失**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm test -- tests/application/ingredient/nutrition-profile-structure.spec.ts --runInBand
  ```

  Expected:

  - FAIL
  - 报错包含 `Cannot find module '../../../src/domain/ingredient/nutrition-profile.utils'` 或 `normalizeNutritionProfile is not a function`

- [ ] **Step 3: 定义主字典、页签和结构化类型**

  在 `backend/src/domain/ingredient/nutrition-profile.constants.ts` 中建立固定字典，至少包含：

  ```ts
  export const NUTRITION_TAB_KEYS = [
    'macros',
    'minerals',
    'vitamins',
    'fattyAcids',
    'aminoAcids',
  ] as const;

  export const MACRO_NUTRIENT_KEYS = [
    'energyKcal',
    'moisture',
    'crudeProtein',
    'crudeFat',
    'ash',
    'carbohydrate',
    'fiber',
    'solubleFiber',
    'insolubleFiber',
  ] as const;

  export const MINERAL_NUTRIENT_KEYS = [
    'calcium',
    'phosphorus',
    'potassium',
    'sodium',
    'magnesium',
    'chloride',
    'iron',
    'zinc',
    'copper',
    'manganese',
    'selenium',
    'iodine',
  ] as const;
  ```

  在 `backend/src/domain/ingredient/types.ts` 中引入新的结构：

  ```ts
  export type NutritionRawBasisType =
    | 'PER_100_G'
    | 'PER_100_ML'
    | 'PER_1_G'
    | 'PER_1_ML'
    | 'PER_SERVING';

  export interface NutritionMeta {
    rawBasisType: NutritionRawBasisType;
    sampleState?: 'RAW' | 'COOKED' | 'FREEZE_DRIED' | 'AIR_DRIED' | 'POWDER' | 'OIL' | 'CONCENTRATE';
    isEdiblePortionBasis?: boolean;
    ediblePortionRate?: number | null;
    densityGPerMl?: number | null;
    servingWeightG?: number | null;
    sourceType?: 'LAB_REPORT' | 'LABEL' | 'LITERATURE' | 'SUPPLIER' | 'MANUAL_ESTIMATE' | null;
    sourceTitle?: string | null;
    sourceProvider?: string | null;
    attachments?: string[];
    confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    versionNote?: string | null;
  }

  export interface NutritionProfileV2 {
    meta: NutritionMeta;
    macros: Record<string, number | null>;
    minerals: Record<string, number | null>;
    vitamins: Record<string, number | null>;
    fattyAcids: Record<string, number | null>;
    aminoAcids: Record<string, number | null>;
    customItems: Array<{
      name: string;
      value: number;
      unit: string;
      rawBasisType?: NutritionRawBasisType;
      note?: string | null;
    }>;
  }

  export type NutritionProfile = NutritionProfileV2 | { items: NutritionItem[] };
  ```

- [ ] **Step 4: 实现标准化 helper，并在 service / repository 两端接入**

  在 `backend/src/domain/ingredient/nutrition-profile.utils.ts` 实现兼容逻辑：

  ```ts
  export function isLegacyNutritionProfile(
    input: unknown,
  ): input is { items: NutritionItem[] } {
    return !!input && typeof input === 'object' && Array.isArray((input as any).items);
  }

  export function normalizeNutritionProfile(
    input: NutritionProfile | null | undefined,
  ): NutritionProfileV2 | null {
    if (!input) return null;
    if (!isLegacyNutritionProfile(input)) return ensureProfileDefaults(input as NutritionProfileV2);

    const profile = createEmptyNutritionProfile();
    profile.meta.rawBasisType = input.items[0]?.basisType === 'PER_1_PCS' ? 'PER_SERVING' : (input.items[0]?.basisType ?? 'PER_100_G') as any;

    for (const item of input.items) {
      assignLegacyItem(profile, item);
    }

    return profile;
  }
  ```

  接着修改：

  - `backend/src/application/ingredient/ingredient.service.ts`
  - `backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`

  目标行为：

  ```ts
  const normalizedProfile = normalizeNutritionProfile(dto.nutritionProfile ?? null);
  // create/update 用 normalizedProfile
  // repository findById/findAll 时也统一 normalize 再喂给 domain
  ```

- [ ] **Step 5: 重新运行测试与 backend 构建**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm test -- tests/application/ingredient/nutrition-profile-structure.spec.ts tests/application/ingredient/ingredient-domain-refactor.spec.ts --runInBand
  npm run build
  ```

  Expected:

  - 两个 spec 全部 PASS
  - `npm run build` 成功，没有 TypeScript 错误

- [ ] **Step 6: 提交这一层的独立提交**

  ```bash
  git -C /Users/zhaochen/Documents/SevenKitchen add \
    backend/src/domain/ingredient/nutrition-profile.constants.ts \
    backend/src/domain/ingredient/nutrition-profile.utils.ts \
    backend/src/domain/ingredient/types.ts \
    backend/src/application/ingredient/ingredient.service.ts \
    backend/src/infrastructure/repositories/prisma-ingredient.repository.ts \
    backend/tests/application/ingredient/nutrition-profile-structure.spec.ts
  git -C /Users/zhaochen/Documents/SevenKitchen commit -m "feat: normalize ingredient nutrition profile structure"
  ```

### Task 2: 增加历史营养档案回填脚本，平滑升级旧 JSON

**Files:**
- Create: `backend/prisma/backfill-ingredient-nutrition-profile-v2.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts`

- [ ] **Step 1: 先写脚本测试，锁定 dry-run / apply 行为**

  新建 `backend/tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts`：

  ```ts
  import { buildNormalizedNutritionProfile } from '../../../prisma/backfill-ingredient-nutrition-profile-v2';

  describe('backfill ingredient nutrition profile v2', () => {
    it('returns null for empty profile', () => {
      expect(buildNormalizedNutritionProfile(null)).toBeNull();
    });

    it('converts legacy items profile into grouped v2 profile', () => {
      const result = buildNormalizedNutritionProfile({
        items: [
          { nutrientCode: 'iodine', nutrientName: '碘', value: 150, unit: 'mg', basisType: 'PER_100_G' },
        ],
      } as any);

      expect(result?.meta.rawBasisType).toBe('PER_100_G');
      expect(result?.minerals.iodine).toBe(150);
    });
  });
  ```

- [ ] **Step 2: 运行测试，确认脚本尚未存在**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm test -- tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts --runInBand
  ```

  Expected:

  - FAIL
  - 报错包含 `Cannot find module '../../../prisma/backfill-ingredient-nutrition-profile-v2'`

- [ ] **Step 3: 实现 dry-run 默认的回填脚本**

  在 `backend/prisma/backfill-ingredient-nutrition-profile-v2.ts` 中提供：

  ```ts
  export function buildNormalizedNutritionProfile(input: unknown) {
    return normalizeNutritionProfile(input as any);
  }

  async function main() {
    const apply = process.argv.includes('--apply');
    const ingredients = await prisma.ingredient.findMany({
      select: { id: true, name: true, nutritionProfile: true, type: true },
    });

    let update = 0;
    let skip = 0;
    let error = 0;

    for (const ingredient of ingredients) {
      const nextProfile = buildNormalizedNutritionProfile(ingredient.nutritionProfile);
      if (!nextProfile || JSON.stringify(nextProfile) === JSON.stringify(ingredient.nutritionProfile)) {
        skip += 1;
        continue;
      }

      if (!apply) {
        update += 1;
        continue;
      }

      try {
        await prisma.ingredient.update({
          where: { id: ingredient.id },
          data: { nutritionProfile: nextProfile as any },
        });
        update += 1;
      } catch {
        error += 1;
      }
    }

    console.log({ apply, update, skip, error });
  }
  ```

  要求：

  - 默认 dry-run
  - 输出 `update / skip / error` 统计
  - 对已经是 v2 的记录直接 skip

- [ ] **Step 4: 把脚本挂到 package.json**

  在 `backend/package.json` 增加：

  ```json
  {
    "scripts": {
      "backfill:ingredient-nutrition-profile-v2": "ts-node -r tsconfig-paths/register prisma/backfill-ingredient-nutrition-profile-v2.ts",
      "backfill:ingredient-nutrition-profile-v2:apply": "ts-node -r tsconfig-paths/register prisma/backfill-ingredient-nutrition-profile-v2.ts --apply"
    }
  }
  ```

- [ ] **Step 5: 运行测试、build 和 dry-run**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm test -- tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts --runInBand
  npm run build
  npm run backfill:ingredient-nutrition-profile-v2
  ```

  Expected:

  - spec PASS
  - build PASS
  - dry-run 输出统计摘要，且不会修改数据库

- [ ] **Step 6: 提交脚本层改动**

  ```bash
  git -C /Users/zhaochen/Documents/SevenKitchen add \
    backend/prisma/backfill-ingredient-nutrition-profile-v2.ts \
    backend/package.json \
    backend/tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts
  git -C /Users/zhaochen/Documents/SevenKitchen commit -m "feat: add nutrition profile v2 backfill script"
  ```

### Task 3: 搭建管理后台的固定营养素字典和表单状态转换 helper

**Files:**
- Create: `admin-web/src/constants/ingredientNutrition.ts`
- Create: `admin-web/src/utils/ingredientNutrition.ts`
- Modify: `admin-web/src/types/ingredient.ts`

- [ ] **Step 1: 新增前端固定字典常量文件**

  在 `admin-web/src/constants/ingredientNutrition.ts` 中定义页签、字段和单位：

  ```ts
  export const NUTRITION_TAB_OPTIONS = [
    { key: 'macros', label: '宏量' },
    { key: 'minerals', label: '矿物质' },
    { key: 'vitamins', label: '维生素' },
    { key: 'fattyAcids', label: '脂肪酸' },
    { key: 'aminoAcids', label: '氨基酸' },
  ] as const;

  export const MACRO_FIELD_OPTIONS = [
    { key: 'energyKcal', label: '能量', unit: 'kcal' },
    { key: 'moisture', label: '水分', unit: 'g' },
    { key: 'crudeProtein', label: '粗蛋白', unit: 'g' },
    { key: 'crudeFat', label: '粗脂肪', unit: 'g' },
  ] as const;
  ```

- [ ] **Step 2: 用 helper 统一“API 结构 <-> 表单结构”的转换**

  在 `admin-web/src/utils/ingredientNutrition.ts` 中提供：

  ```ts
  export function createEmptyNutritionProfileForm(): NutritionProfile {
    return {
      meta: {
        rawBasisType: 'PER_100_G',
        sampleState: undefined,
        isEdiblePortionBasis: false,
        ediblePortionRate: null,
        densityGPerMl: null,
        servingWeightG: null,
        sourceType: 'MANUAL_ESTIMATE',
        sourceTitle: '',
        sourceProvider: '',
        attachments: [],
        confidenceLevel: 'MEDIUM',
        versionNote: '',
      },
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    };
  }

  export function normalizeNutritionProfileForForm(input?: NutritionProfile | { items: any[] } | null) {
    if (!input) return createEmptyNutritionProfileForm();
    if ('meta' in input) return mergeWithDefaults(input as NutritionProfile);

    return legacyItemsToStructuredProfile(input.items);
  }

  export function buildNutritionProfilePayload(form: NutritionProfile) {
    return {
      ...form,
      meta: {
        ...form.meta,
        sourceTitle: form.meta.sourceTitle?.trim() || null,
        sourceProvider: form.meta.sourceProvider?.trim() || null,
        versionNote: form.meta.versionNote?.trim() || null,
      },
      customItems: form.customItems
        .filter(item => item.name.trim().length > 0)
        .map(item => ({
          name: item.name.trim(),
          value: Number(item.value || 0),
          unit: item.unit.trim(),
          rawBasisType: item.rawBasisType || undefined,
          note: item.note?.trim() || null,
        })),
    };
  }
  ```

- [ ] **Step 3: 更新前端类型，移除旧的自由 items 主入口**

  修改 `admin-web/src/types/ingredient.ts`：

  ```ts
  export interface NutritionProfileMeta {
    rawBasisType: 'PER_100_G' | 'PER_100_ML' | 'PER_1_G' | 'PER_1_ML' | 'PER_SERVING'
    sampleState?: 'RAW' | 'COOKED' | 'FREEZE_DRIED' | 'AIR_DRIED' | 'POWDER' | 'OIL' | 'CONCENTRATE'
    isEdiblePortionBasis?: boolean
    ediblePortionRate?: number | null
    densityGPerMl?: number | null
    servingWeightG?: number | null
    sourceType?: 'LAB_REPORT' | 'LABEL' | 'LITERATURE' | 'SUPPLIER' | 'MANUAL_ESTIMATE' | null
    sourceTitle?: string | null
    sourceProvider?: string | null
    attachments?: string[]
    confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null
    versionNote?: string | null
  }

  export interface NutritionProfile {
    meta: NutritionProfileMeta
    macros: Record<string, number | null>
    minerals: Record<string, number | null>
    vitamins: Record<string, number | null>
    fattyAcids: Record<string, number | null>
    aminoAcids: Record<string, number | null>
    customItems: Array<{ name: string; value: number; unit: string; rawBasisType?: string; note?: string | null }>
  }
  ```

- [ ] **Step 4: 先只跑类型构建，确保 helper 和类型能编译**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/admin-web
  npm run build
  ```

  Expected:

  - 如果还没接 UI，会因为旧 `IngredientForm.vue` 类型不匹配而 FAIL，这个失败是允许的
  - 记录第一个报错位置，下一任务一起消掉

- [ ] **Step 5: 提交常量与 helper 基础层**

  ```bash
  git -C /Users/zhaochen/Documents/SevenKitchen add \
    admin-web/src/constants/ingredientNutrition.ts \
    admin-web/src/utils/ingredientNutrition.ts \
    admin-web/src/types/ingredient.ts
  git -C /Users/zhaochen/Documents/SevenKitchen commit -m "feat: add ingredient nutrition editor constants"
  ```

### Task 4: 用独立组件替换 IngredientForm 中的自由营养素列表

**Files:**
- Create: `admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

- [ ] **Step 1: 建立独立编辑器组件骨架，避免继续膨胀 IngredientForm.vue**

  新建 `admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue`：

  ```vue
  <script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { NutritionProfile } from '../../../types/ingredient'
  import {
    NUTRITION_TAB_OPTIONS,
    MACRO_FIELD_OPTIONS,
    MINERAL_FIELD_OPTIONS,
    VITAMIN_FIELD_OPTIONS,
    FATTY_ACID_FIELD_OPTIONS,
    AMINO_ACID_FIELD_OPTIONS,
  } from '../../../constants/ingredientNutrition'
  import {
    createEmptyNutritionProfileForm,
    normalizeNutritionProfileForForm,
    buildNutritionProfilePayload,
  } from '../../../utils/ingredientNutrition'

  const props = defineProps<{
    modelValue: NutritionProfile | null | undefined
    ingredientType: 'FOOD' | 'SUPPLEMENT'
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: NutritionProfile | null]
  }>()

  const activeTab = ref('macros')
  const formState = ref(normalizeNutritionProfileForForm(props.modelValue))

  const fieldOptionsByTab = computed(() => ({
    macros: MACRO_FIELD_OPTIONS,
    minerals: MINERAL_FIELD_OPTIONS,
    vitamins: VITAMIN_FIELD_OPTIONS,
    fattyAcids: FATTY_ACID_FIELD_OPTIONS,
    aminoAcids: AMINO_ACID_FIELD_OPTIONS,
  }))
  </script>
  ```

- [ ] **Step 2: 先把顶部固定区做出来**

  模板先实现 `meta` 部分：

  ```vue
  <template>
    <div class="nutrition-profile-editor">
      <div class="nutrition-meta-grid">
        <el-form-item label="原始口径">
          <el-select v-model="formState.meta.rawBasisType">
            <el-option label="每100g" value="PER_100_G" />
            <el-option label="每100ml" value="PER_100_ML" />
            <el-option label="每1g" value="PER_1_G" />
            <el-option label="每1ml" value="PER_1_ML" />
            <el-option label="每1粒/片/勺/份" value="PER_SERVING" />
          </el-select>
        </el-form-item>

        <el-form-item label="样品状态">
          <el-select v-model="formState.meta.sampleState" clearable />
        </el-form-item>

        <el-form-item label="是否按可食部录入">
          <el-switch v-model="formState.meta.isEdiblePortionBasis" />
        </el-form-item>
      </div>
    </div>
  </template>
  ```

- [ ] **Step 3: 实现五个固定页签和自定义营养项**

  用字典渲染固定字段，避免手写散表单：

  ```vue
  <el-tabs v-model="activeTab">
    <el-tab-pane
      v-for="tab in NUTRITION_TAB_OPTIONS"
      :key="tab.key"
      :label="tab.label"
      :name="tab.key"
    >
      <div class="nutrition-field-grid">
        <el-form-item
          v-for="field in fieldOptionsByTab[tab.key]"
          :key="field.key"
          :label="`${field.label} (${field.unit})`"
        >
          <el-input-number
            v-model="formState[tab.key][field.key]"
            :min="0"
            :precision="4"
            controls-position="right"
          />
        </el-form-item>
      </div>
    </el-tab-pane>
  </el-tabs>

  <div class="custom-nutrient-section">
    <el-button @click="addCustomItem">添加自定义营养项</el-button>
  </div>
  ```

- [ ] **Step 4: 在 IngredientForm.vue 中接入新组件并删除旧自由列表逻辑**

  `admin-web/src/views/Ingredients/IngredientForm.vue` 至少做这三件事：

  1. 删掉 `nutritionItems`、`COMMON_NUTRIENTS`、`querySearchNutrients` 这整套自由列表状态
  2. 引入新组件
  3. 改成 `v-model="formData.nutritionProfile"`

  目标片段：

  ```vue
  <template v-if="formData.type !== IngredientType.PACKAGING">
    <div class="section-title">统一营养数据</div>
    <el-form-item label="营养档案">
      <IngredientNutritionEditor
        v-model="formData.nutritionProfile"
        :ingredient-type="formData.type"
      />
      <div class="hint-text" style="margin-top: 8px;">
        食材和补剂共用同一套营养结构，后续食谱设计、营养计算都会以这里的标准原料营养档案为准。
      </div>
    </el-form-item>
  </template>
  ```

- [ ] **Step 5: 运行 admin build，直到完全通过**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/admin-web
  npm run build
  ```

  Expected:

  - `vue-tsc -b && vite build` 成功
  - 不再出现 `NutritionItem` 旧字段缺失的类型错误

- [ ] **Step 6: 做最小人工冒烟**

  手测用例：

  1. 打开 `http://localhost:5174/ingredients`
  2. 编辑 `海藻粉`
  3. 确认能看到顶部固定区 + 五个页签 + 自定义营养项
  4. 修改 `rawBasisType = PER_SERVING`，`servingWeightG = 0.09`
  5. 在矿物质页签录入 `iodine = 450`
  6. 保存并刷新，确认值回显
  7. 编辑 `猪里脊`，确认可录 `PER_100_G` + 宏量 / 矿物质
  8. 编辑 `泡沫箱`，确认仍然不显示营养编辑区

- [ ] **Step 7: 提交 UI 重构**

  ```bash
  git -C /Users/zhaochen/Documents/SevenKitchen add \
    admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue \
    admin-web/src/views/Ingredients/IngredientForm.vue
  git -C /Users/zhaochen/Documents/SevenKitchen commit -m "feat: add structured ingredient nutrition editor"
  ```

### Task 5: 完整验证、回填和文档对齐

**Files:**
- Modify: `docs/superpowers/specs/2026-04-12-standard-ingredient-nutrition-entry-design.md`（仅当实现与设计发生必要偏差时）

- [ ] **Step 1: 跑完整 backend 验证**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm test -- \
    tests/application/ingredient/nutrition-profile-structure.spec.ts \
    tests/application/ingredient/ingredient-domain-refactor.spec.ts \
    tests/prisma/backfill-ingredient-nutrition-profile-v2.spec.ts \
    --runInBand
  npm run build
  ```

  Expected:

  - 全部 PASS
  - 无 TypeScript 错误

- [ ] **Step 2: 跑完整 admin 构建**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/admin-web
  npm run build
  ```

  Expected:

  - PASS

- [ ] **Step 3: 对真实数据做 dry-run，再决定是否 apply**

  Run:

  ```bash
  cd /Users/zhaochen/Documents/SevenKitchen/backend
  npm run backfill:ingredient-nutrition-profile-v2
  ```

  Expected:

  - 输出明确的 `update / skip / error`
  - 先把 dry-run 结果记录给产品/录入人看
  - 只有确认无误后，才执行：

  ```bash
  npm run backfill:ingredient-nutrition-profile-v2:apply
  ```

- [ ] **Step 4: 复核 spec 与实现是否偏离**

  重点检查：

  - 顶部固定区 4 组字段是否都保留
  - 五个固定页签是否完整
  - 包材是否继续隐藏营养区
  - 自定义营养项是否独立成区
  - 是否仍然支持原始口径录入

  如果实现与 spec 存在必要偏差，更新：

  - `docs/superpowers/specs/2026-04-12-standard-ingredient-nutrition-entry-design.md`

- [ ] **Step 5: 最终提交**

  ```bash
  git -C /Users/zhaochen/Documents/SevenKitchen add \
    backend \
    admin-web \
    docs/superpowers/specs/2026-04-12-standard-ingredient-nutrition-entry-design.md
  git -C /Users/zhaochen/Documents/SevenKitchen commit -m "feat: redesign ingredient nutrition entry workflow"
  ```

---

## Self-Review

### Spec coverage

- `顶部固定区`：Task 1、Task 4 覆盖
- `五个固定页签`：Task 1、Task 3、Task 4 覆盖
- `原始口径录入 + 系统统一换算`：Task 1、Task 4 覆盖
- `主字典 + 自定义营养项`：Task 1、Task 3、Task 4 覆盖
- `先不重做复杂原料背景信息`：整个计划未触碰，符合 spec

### Placeholder scan

- 本计划没有未决标记，任务里的代码块都给了可执行骨架
- 所有任务都给了明确文件路径、命令和预期结果

### Type consistency

- 后端统一使用 `NutritionProfileV2`
- 前端 `NutritionProfile` 与后端 v2 shape 对齐
- `PER_SERVING` 在后端和前端都作为“每1粒/片/勺/份”统一表示

### 风险提醒

- 当前 admin-web 没有现成单测基础设施，本计划选择“后端 TDD + 前端 helper 抽离 + admin build + 手测”这一条更小步的路径，避免为了本轮录入重构额外引入新的前端测试框架
- 当前数据库列本身不变，回填脚本只升级 JSON shape，因此风险集中在“旧 profile 识别”和“字典映射准确性”
