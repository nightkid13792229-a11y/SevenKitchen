# Supplement Label AI Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-user MVP that lets staff users take or choose one supplement label photo, have the backend AI agent extract a supplement draft, and prefill the existing miniapp supplement creation form.

**Architecture:** The MVP is synchronous and does not introduce a queue. The miniapp uploads one image to a new recipe-designer endpoint; the backend uploads the image to COS, runs OCR on the image, sends the OCR text to DeepSeek for structured extraction, validates the result, and returns a draft. The miniapp fills the existing supplement form, and the user must review and confirm before the existing `createSupplementOption` path creates records.

**Tech Stack:** NestJS, Multer `FileInterceptor`, Tencent COS, Tencent Cloud OCR API, DeepSeek chat completions, uni-app `uni.chooseImage` and `uni.uploadFile`, Vitest, Jest.

---

## File Structure

- Modify `backend/src/interfaces/controllers/recipe-designer.controller.ts`: add `POST /api/v1/recipe-designer/supplement-label/extract`.
- Modify `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`: add response-facing draft types if controller/service needs exported contracts.
- Create `backend/src/application/recipe-designer/supplement-label-extraction.service.ts`: owns Tencent OCR, DeepSeek prompt, provider call, JSON parsing, and result normalization.
- Modify `backend/src/app.module.ts`: register `SupplementLabelExtractionService`.
- Modify `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`: cover controller delegation and file validation behavior.
- Create `backend/tests/application/recipe-designer/supplement-label-extraction.service.spec.ts`: cover AI JSON parsing, invalid unit normalization, and missing nutrients warnings.
- Modify `miniapp/src/api/recipe-designer.ts`: add upload helper and response types.
- Modify `miniapp/src/api/recipe-designer.spec.ts`: cover upload endpoint path and response parsing helper.
- Modify `miniapp/src/pages/recipe-designer/editor.vue`: add the photo entry, loading state, and prefill logic for the current supplement form.
- Modify `miniapp/src/pages/recipe-designer.regression.spec.ts`: assert the UI entry and form-prefill guards exist.

---

### Task 1: Backend Extraction Service Contract

**Files:**
- Create: `backend/src/application/recipe-designer/supplement-label-extraction.service.ts`
- Test: `backend/tests/application/recipe-designer/supplement-label-extraction.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
import { BadRequestException } from '@nestjs/common';
import {
  SupplementLabelExtractionService,
  type SupplementLabelExtractionResult,
} from '../../../src/application/recipe-designer/supplement-label-extraction.service';

describe('SupplementLabelExtractionService', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_SUPPLEMENT_LABEL_MODEL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_SUPPLEMENT_LABEL_MODEL;
    else process.env.OPENAI_SUPPLEMENT_LABEL_MODEL = originalModel;
  });

  it('extracts a normalized supplement draft from AI JSON', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_SUPPLEMENT_LABEL_MODEL = 'test-vision-model';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  ingredientName: '柠檬酸钙',
                  profileName: '柠檬酸钙 包装识别档案',
                  usageUnit: '粒',
                  basisType: 'PER_SERVING',
                  servingWeightG: null,
                  densityGPerMl: null,
                  nutrients: {
                    'minerals.calcium': 200,
                    'minerals.phosphorus': 0,
                    'unknown.field': 123,
                  },
                  rawIngredientsText: 'Calcium citrate',
                  warnings: ['包装未标注每粒重量'],
                  confidence: 'MEDIUM',
                }),
              },
            ],
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = new SupplementLabelExtractionService();
    const result = await service.extractFromImage({
      imageUrl: 'https://cdn.example.com/label.jpg',
      originalFilename: 'label.jpg',
    });

    expect(result).toEqual<SupplementLabelExtractionResult>({
      ingredientName: '柠檬酸钙',
      profileName: '柠檬酸钙 包装识别档案',
      usageUnit: '粒',
      basisType: 'PER_SERVING',
      servingWeightG: undefined,
      densityGPerMl: undefined,
      nutrients: {
        'minerals.calcium': 200,
      },
      rawIngredientsText: 'Calcium citrate',
      warnings: ['包装未标注每粒重量', '已忽略无法识别的营养字段 unknown.field'],
      confidence: 'MEDIUM',
    });
  });

  it('fails clearly when the vision API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new SupplementLabelExtractionService();
    await expect(
      service.extractFromImage({
        imageUrl: 'https://cdn.example.com/label.jpg',
        originalFilename: 'label.jpg',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- supplement-label-extraction.service.spec.ts
```

Expected: FAIL because `SupplementLabelExtractionService` does not exist.

- [ ] **Step 3: Implement the service**

Create `backend/src/application/recipe-designer/supplement-label-extraction.service.ts` with these exported contracts and behaviors:

```ts
export type SupplementLabelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SupplementLabelBasisType =
  | 'PER_1_G'
  | 'PER_100_G'
  | 'PER_1_ML'
  | 'PER_100_ML'
  | 'PER_SERVING';

export type SupplementLabelUsageUnit =
  | 'g'
  | 'ml'
  | '粒'
  | '片'
  | '胶囊'
  | '平勺'
  | '份';

export interface SupplementLabelExtractionInput {
  imageUrl: string;
  originalFilename?: string;
}

export interface SupplementLabelExtractionResult {
  ingredientName: string;
  profileName: string;
  usageUnit: SupplementLabelUsageUnit;
  basisType: SupplementLabelBasisType;
  servingWeightG?: number;
  densityGPerMl?: number;
  nutrients: Record<string, number>;
  rawIngredientsText?: string;
  warnings: string[];
  confidence: SupplementLabelConfidence;
}
```

Implementation rules:

- Read `OPENAI_API_KEY`.
- Read model from `OPENAI_SUPPLEMENT_LABEL_MODEL`, then `OPENAI_NUTRITION_REVIEW_MODEL`, then `OPENAI_MODEL`, then `gpt-4o-mini`.
- Call `https://api.openai.com/v1/responses`.
- Send image input as `input_image` with the COS URL.
- Require JSON output with the fields in `SupplementLabelExtractionResult`.
- Accept only nutrient keys that the current miniapp supplement form supports, including `macros.crudeProtein`, `macros.crudeFat`, `minerals.calcium`, `minerals.phosphorus`, `minerals.sodium`, `vitamins.vitaminD`, `vitamins.vitaminE`, and fatty acid keys already present in `editor.vue`.
- Drop zero, negative, non-numeric, and unknown nutrient values.
- Add a warning for every ignored unknown nutrient key.
- Default `usageUnit` to `g` and `basisType` to `PER_1_G` when AI omits them.
- Return `confidence: 'LOW'` when no nutrients survive normalization.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- supplement-label-extraction.service.spec.ts
```

Expected: PASS.

---

### Task 2: Backend Upload Endpoint

**Files:**
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] **Step 1: Write the failing controller test**

Add a service mock and a test:

```ts
const extractionService = {
  extractFromImage: jest.fn(),
};

it('uploads a supplement label image and returns an AI draft', async () => {
  const file = {
    originalname: 'label.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('image'),
    size: 123,
  } as Express.Multer.File;

  const cosService = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://cdn.example.com/supplement-labels/label.jpg',
      key: 'supplement-labels/label.jpg',
    }),
  };

  extractionService.extractFromImage.mockResolvedValue({
    ingredientName: '柠檬酸钙',
    profileName: '柠檬酸钙 包装识别档案',
    usageUnit: '粒',
    basisType: 'PER_SERVING',
    nutrients: { 'minerals.calcium': 200 },
    warnings: [],
    confidence: 'HIGH',
  });

  controller = new RecipeDesignerController(
    service as any,
    cosService as any,
    extractionService as any,
  );

  await expect(
    controller.extractSupplementLabel(file, currentUser),
  ).resolves.toEqual(
    expect.objectContaining({
      code: 0,
      data: expect.objectContaining({
        ingredientName: '柠檬酸钙',
        imageUrl: 'https://cdn.example.com/supplement-labels/label.jpg',
        imageKey: 'supplement-labels/label.jpg',
      }),
    }),
  );

  expect(cosService.uploadImage).toHaveBeenCalledWith(
    file,
    'label.jpg',
    'recipe-designer-supplement-labels',
  );
  expect(extractionService.extractFromImage).toHaveBeenCalledWith({
    imageUrl: 'https://cdn.example.com/supplement-labels/label.jpg',
    originalFilename: 'label.jpg',
    requestedBy: 'staff-1',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- recipe-designer.controller.spec.ts
```

Expected: FAIL because the controller constructor and method do not exist.

- [ ] **Step 3: Implement the endpoint**

Modify `RecipeDesignerController`:

- Import `UploadedFile`, `UseInterceptors`, and `BadRequestException`.
- Import `FileInterceptor`.
- Inject `TencentCosService` and `SupplementLabelExtractionService`.
- Add constants:

```ts
const SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
```

- Add `POST supplement-label/extract`.
- Validate file exists.
- Validate mime type.
- Upload to COS folder `recipe-designer-supplement-labels`.
- Call `supplementLabelExtractionService.extractFromImage`.
- Return extraction result plus `imageUrl` and `imageKey`.

Register `SupplementLabelExtractionService` in `backend/src/app.module.ts` providers.

- [ ] **Step 4: Run backend targeted tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- recipe-designer.controller.spec.ts supplement-label-extraction.service.spec.ts
```

Expected: PASS.

---

### Task 3: Miniapp API Upload Helper

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Test: `miniapp/src/api/recipe-designer.spec.ts`

- [ ] **Step 1: Write the failing API test**

Mock `uni.uploadFile`, `getBaseUrl`, and `getToken`, then assert the helper uploads to:

```ts
/recipe-designer/supplement-label/extract
```

Expected parsed response:

```ts
{
  ingredientName: '柠檬酸钙',
  profileName: '柠檬酸钙 包装识别档案',
  usageUnit: '粒',
  basisType: 'PER_SERVING',
  nutrients: { 'minerals.calcium': 200 },
  warnings: [],
  confidence: 'HIGH',
  imageUrl: 'https://cdn.example.com/label.jpg',
  imageKey: 'recipe-designer-supplement-labels/label.jpg',
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm exec vitest run src/api/recipe-designer.spec.ts
```

Expected: FAIL because upload helper does not exist.

- [ ] **Step 3: Implement the helper**

Add these exports to `miniapp/src/api/recipe-designer.ts`:

```ts
export interface SupplementLabelExtractionDraft extends CreateSupplementOptionPayload {
  ingredientName?: string
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  warnings?: string[]
  rawIngredientsText?: string
  imageUrl?: string
  imageKey?: string
}
```

Add:

```ts
extractSupplementLabel: (filePath: string): Promise<SupplementLabelExtractionDraft> =>
  new Promise((resolve, reject) => {
    const token = getToken()
    const uploadUrl = `${getBaseUrl()}/recipe-designer/supplement-label/extract`
    uni.uploadFile({
      url: uploadUrl,
      filePath,
      name: 'file',
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Customer-Id': uni.getStorageSync('userId') || '',
      },
      success: (res) => {
        try {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          resolve(body?.data ?? body)
        } catch (error) {
          reject(error)
        }
      },
      fail: reject,
    })
  }),
```

Import `getBaseUrl` and `getToken` from the existing utility modules used by other upload helpers.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm exec vitest run src/api/recipe-designer.spec.ts
```

Expected: PASS.

---

### Task 4: Miniapp UI Entry and Form Prefill

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write the failing regression test**

Add assertions:

```ts
it('offers AI label recognition for supplement creation and pre-fills the manual form', () => {
  expect(editorSource).toContain('拍照识别补剂')
  expect(editorSource).toContain('recognizingSupplementLabel')
  expect(editorSource).toContain('chooseSupplementLabelImage')
  expect(editorSource).toContain('applySupplementLabelDraft')
  expect(editorSource).toContain('recipeDesignerApi.extractSupplementLabel')
  expect(editorSource).toContain('supplementAiWarnings')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm exec vitest run src/pages/recipe-designer.regression.spec.ts
```

Expected: FAIL because the strings do not exist yet.

- [ ] **Step 3: Implement UI and prefill logic**

In `editor.vue`:

- Add a button near the existing supplement creation entry inside the add-ingredient drawer:

```vue
<button
  v-if="canCreateSupplementOption"
  class="ai-supplement-btn"
  :disabled="recognizingSupplementLabel"
  @tap="chooseSupplementLabelImage"
>
  {{ recognizingSupplementLabel ? '正在识别...' : '拍照识别补剂' }}
</button>
```

- Add state:

```ts
const recognizingSupplementLabel = ref(false)
const supplementAiWarnings = ref<string[]>([])
```

- Add image selection:

```ts
async function chooseSupplementLabelImage() {
  if (!canCreateSupplementOption.value || recognizingSupplementLabel.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: async (res) => {
      const filePath = res.tempFilePaths?.[0]
      if (!filePath) return
      await recognizeSupplementLabel(filePath)
    },
  })
}
```

- Add recognition:

```ts
async function recognizeSupplementLabel(filePath: string) {
  recognizingSupplementLabel.value = true
  uni.showLoading({ title: '正在识别补剂信息' })
  try {
    const draft = await recipeDesignerApi.extractSupplementLabel(filePath)
    applySupplementLabelDraft(draft)
    supplementFormVisible.value = true
    uni.showToast({ title: '已填入识别结果', icon: 'success' })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to recognize supplement label:', error)
    uni.showToast({ title: '识别失败，请手动填写', icon: 'none' })
  } finally {
    uni.hideLoading()
    recognizingSupplementLabel.value = false
  }
}
```

- Add prefill:

```ts
function applySupplementLabelDraft(draft: SupplementLabelExtractionDraft) {
  supplementName.value = draft.ingredientName || draft.name || ''
  supplementProfileName.value = draft.profileName || ''
  supplementUsageUnit.value = draft.usageUnit || 'g'
  supplementBasisType.value = draft.basisType || 'PER_1_G'
  supplementServingWeightInput.value =
    draft.servingWeightG !== undefined ? String(draft.servingWeightG) : ''
  supplementDensityInput.value =
    draft.densityGPerMl !== undefined ? String(draft.densityGPerMl) : ''
  supplementNutrientInputs.value = Object.fromEntries(
    Object.entries(draft.nutrients || {}).map(([key, value]) => [key, String(value)]),
  )
  supplementAiWarnings.value = draft.warnings || []
}
```

- Render warnings inside the supplement form:

```vue
<view v-if="supplementAiWarnings.length" class="supplement-ai-warnings">
  <text v-for="warning in supplementAiWarnings" :key="warning">{{ warning }}</text>
</view>
```

- Clear warnings in `resetSupplementForm`.

- [ ] **Step 4: Run miniapp targeted tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm exec vitest run src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts
```

Expected: PASS.

---

### Task 5: End-to-End Verification

**Files:**
- Build output: `miniapp/dist/dev/mp-weixin`

- [ ] **Step 1: Run backend targeted checks**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- recipe-designer.controller.spec.ts supplement-label-extraction.service.spec.ts
npm run start:check:miniapp
```

Expected: targeted tests PASS and miniapp backend check starts successfully.

- [ ] **Step 2: Run miniapp targeted checks**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm exec vitest run src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Build to WeChat DevTools directory**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
pnpm run dev:mp-weixin
```

Expected: output includes `DONE Build complete`. Stop the watcher after the build completes.

- [ ] **Step 4: Manual WeChat DevTools check**

Open:

```text
/Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp/dist/dev/mp-weixin/
```

Manual flow:

1. Open recipe designer editor.
2. Tap add ingredient.
3. Tap `拍照识别补剂`.
4. Choose one supplement label image.
5. Confirm the supplement form opens with name, profile name, unit, basis, and nutrients filled.
6. Edit one field manually.
7. Tap create supplement.
8. Confirm the new supplement is selected in the add-ingredient drawer.

---

## Implementation Notes

- The MVP uses one image per recognition request because WeChat `uni.uploadFile` is most reliable with a single `filePath`.
- The backend endpoint remains guarded by `AuthGuard` and `StaffGuard`, matching the existing recipe designer.
- AI output is never persisted directly. Persistence only happens through the existing user-confirmed `createSupplementOption`.
- Unknown fields, unsupported units, and low-confidence extraction are returned as warnings instead of silently becoming saved nutrition data.
- Queue, concurrency control, recognition history, and multi-image stitching are outside this MVP.

## Self-Review

- Spec coverage: The plan covers backend upload, AI extraction, result normalization, miniapp upload, UI entry, prefill, manual confirmation, and build verification.
- Placeholder scan: No placeholder markers remain.
- Type consistency: `SupplementLabelExtractionDraft` extends the existing miniapp create payload, and backend result fields map to the current supplement form fields.
