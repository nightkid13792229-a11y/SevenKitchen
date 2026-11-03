# Health Records Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the miniapp health records page so medical, checkup, and allergy records use per-record CRUD and the UI presents segmented categories with inline card editing.

**Architecture:** Backend health record endpoints already exist and will become the source of truth for record lists. The miniapp will stop saving health record arrays through dog profile updates, add a small health-record API adapter, and refactor the health page/component state around category-scoped lists and per-card drafts. Diet reminders remain on the page as a separate dog-profile field card.

**Tech Stack:** NestJS, Prisma repositories, class-validator DTOs, Vue 3/uni-app miniapp, Vitest/Jest, WeChat Mini Program build.

---

## File Structure

Backend:

- Modify `backend/src/interfaces/dto/health/create-checkup.dto.ts`
  - Remove fixed enum validation from `checkupType`; keep it as required free text.
- Modify `backend/src/interfaces/dto/health/update-checkup.dto.ts`
  - Remove fixed enum validation from `checkupType`; keep it as optional free text.
- Modify `backend/src/interfaces/dto/health/update-medical-record.dto.ts`
  - Add optional `attachments?: string[]`.
- Modify `backend/src/interfaces/dto/health/medical-record-response.dto.ts`
  - Expose `attachments`.
- Modify `backend/src/application/health/health.service.ts`
  - Preserve medical attachments on create/update responses.
- Test `backend/tests/controllers/health-records.controller.spec.ts`
  - Add focused controller/service tests for free-text checkup type and medical attachments.

Miniapp API and utilities:

- Modify `miniapp/src/api/dogs.ts`
  - Add `healthRecords` CRUD methods for medical, checkup, and allergy endpoints.
  - Keep `updateDietReminders`.
  - Stop using `updateHealthRecords` from the redesigned page.
- Modify `miniapp/src/utils/health-records.ts`
  - Add record type config, category color metadata, response normalization, CRUD payload builders, and list update helpers.
  - Keep existing attachment helpers.
- Modify `miniapp/src/utils/health-records.spec.ts`
  - Add tests for endpoint payloads, response normalization, list replacement/removal, and attachment display names.
- Add or modify `miniapp/src/api/dogs.spec.ts`
  - Verify new API methods call independent endpoints.

Miniapp UI:

- Rewrite `miniapp/src/components/dog-profile/HealthRecordsSection.vue`
  - Make it a segmented-category record card manager driven by `records`, `recordType`, and explicit CRUD callbacks/events.
  - Remove array-level `dogApi.updateHealthRecords` calls.
  - Use inline card expansion and per-card save/delete state.
- Modify `miniapp/src/pages/dog-profile-health/index.vue`
  - Load dog detail only for dog-level fields.
  - Load health record lists through independent APIs.
  - Keep diet reminder as a separate card.
  - Remove health-array cache merge/write logic.
- Modify `miniapp/src/pages/dog-profile-health.regression.spec.ts`
  - Add regression checks for independent CRUD, no profile-array merge, per-card save, and diet reminder isolation.
- Modify `miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts`
  - Add regression checks for segmented tabs, category color hooks, inline form, attachment file names, and no `updateHealthRecords`.

Verification:

- Run backend targeted tests.
- Run miniapp targeted tests.
- Run miniapp production build.
- Run backend build if backend files changed.

## Task 1: Backend DTO Compatibility

**Files:**

- Modify: `backend/src/interfaces/dto/health/create-checkup.dto.ts`
- Modify: `backend/src/interfaces/dto/health/update-checkup.dto.ts`
- Modify: `backend/src/interfaces/dto/health/update-medical-record.dto.ts`
- Modify: `backend/src/interfaces/dto/health/medical-record-response.dto.ts`
- Modify: `backend/src/application/health/health.service.ts`
- Create: `backend/tests/controllers/health-records.controller.spec.ts`

- [ ] **Step 1: Write failing backend tests**

Add or extend `backend/tests/controllers/health-records.controller.spec.ts` with these cases:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCheckupDto } from '../../src/interfaces/dto/health/create-checkup.dto';
import { UpdateCheckupDto } from '../../src/interfaces/dto/health/update-checkup.dto';
import { UpdateMedicalRecordDto } from '../../src/interfaces/dto/health/update-medical-record.dto';
import { MedicalRecordResponseDto } from '../../src/interfaces/dto/health/medical-record-response.dto';

describe('Health record DTO compatibility', () => {
  it('accepts free-text checkup types on create and update', async () => {
    const createDto = plainToInstance(CreateCheckupDto, {
      checkupType: '牙齿复查',
      checkupDate: '2026-04-27',
      findings: '牙龈状态稳定',
    });
    const updateDto = plainToInstance(UpdateCheckupDto, {
      checkupType: '术后复查',
    });

    await expect(validate(createDto)).resolves.toHaveLength(0);
    await expect(validate(updateDto)).resolves.toHaveLength(0);
  });

  it('accepts medical attachments on update DTO', async () => {
    const dto = plainToInstance(UpdateMedicalRecordDto, {
      attachments: ['https://cdn.example.com/medical-records/report.pdf'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('exposes medical attachments in response DTO', () => {
    const dto = plainToInstance(
      MedicalRecordResponseDto,
      {
        id: 'medical-1',
        dogId: 'dog-1',
        visitDate: new Date('2026-04-27T00:00:00.000Z'),
        chiefComplaint: '急性胰腺炎',
        diagnosis: '急性胰腺炎',
        treatment: null,
        medications: [],
        status: 'TREATING',
        followUpDate: null,
        veterinarian: null,
        notes: '补充说明',
        attachments: ['https://cdn.example.com/medical-records/report.pdf'],
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt: new Date('2026-04-27T00:00:00.000Z'),
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.attachments).toEqual([
      'https://cdn.example.com/medical-records/report.pdf',
    ]);
  });
});
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/controllers/health-records.controller.spec.ts --runInBand
```

Expected before implementation:

- Free-text checkup validation fails because `checkupType` is still constrained by `IsIn`.
- Medical update attachments validation or response exposure fails.

- [ ] **Step 3: Implement DTO compatibility**

In `backend/src/interfaces/dto/health/create-checkup.dto.ts`, remove `IsIn` and `CHECKUP_TYPES` usage from validation. Keep this shape:

```ts
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCheckupDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsString()
  checkupType!: string;

  @IsDateString()
  checkupDate!: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  veterinarian?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
```

In `backend/src/interfaces/dto/health/update-checkup.dto.ts`, remove `IsIn`, `IsUrl`, and the `CHECKUP_TYPES` import. Keep this shape:

```ts
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateCheckupDto {
  @IsOptional()
  @IsString()
  checkupType?: string;

  @IsOptional()
  @IsDateString()
  checkupDate?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  veterinarian?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
```

In `backend/src/interfaces/dto/health/update-medical-record.dto.ts`, add:

```ts
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
```

In `backend/src/interfaces/dto/health/medical-record-response.dto.ts`, add:

```ts
  @Expose()
  attachments!: string[];
```

In `backend/src/application/health/health.service.ts`, update `mapMedicalRecordToDto` to include:

```ts
attachments: record.attachments || [],
```

Ensure `updateMedicalRecord` passes attachments:

```ts
attachments: dto.attachments ?? undefined,
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/controllers/health-records.controller.spec.ts --runInBand
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit backend compatibility**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/interfaces/dto/health/create-checkup.dto.ts \
  backend/src/interfaces/dto/health/update-checkup.dto.ts \
  backend/src/interfaces/dto/health/update-medical-record.dto.ts \
  backend/src/interfaces/dto/health/medical-record-response.dto.ts \
  backend/src/application/health/health.service.ts \
  backend/tests/controllers/health-records.controller.spec.ts
git commit -m "fix: align health record CRUD DTOs"
```

## Task 2: Miniapp Health Record API Adapter

**Files:**

- Modify: `miniapp/src/api/dogs.ts`
- Test: `miniapp/src/api/dogs.spec.ts`
- Modify: `miniapp/src/utils/health-records.ts`
- Test: `miniapp/src/utils/health-records.spec.ts`

- [ ] **Step 1: Write failing API adapter tests**

Extend `miniapp/src/api/dogs.spec.ts` with tests that stub the request utility and verify the new methods:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  request: vi.fn(),
  getToken: vi.fn(() => 'token'),
}));

const { request } = await import('../utils/api');
const { dogApi } = await import('./dogs');

describe('dogApi health record CRUD', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  it('creates, updates, lists, and deletes medical records through independent endpoints', () => {
    dogApi.healthRecords.medical.list('dog-1');
    dogApi.healthRecords.medical.create('dog-1', {
      chiefComplaint: '急性胰腺炎',
      visitDate: '2026-04-27',
      diagnosis: '急性胰腺炎',
      notes: '补充说明',
      attachments: ['https://cdn.example.com/a.pdf'],
    });
    dogApi.healthRecords.medical.update('dog-1', 'medical-1', {
      notes: '更新说明',
      attachments: [],
    });
    dogApi.healthRecords.medical.delete('dog-1', 'medical-1');

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/dogs/dog-1/medical-records',
      method: 'GET',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/dogs/dog-1/medical-records',
      method: 'POST',
      data: {
        chiefComplaint: '急性胰腺炎',
        visitDate: '2026-04-27',
        diagnosis: '急性胰腺炎',
        notes: '补充说明',
        attachments: ['https://cdn.example.com/a.pdf'],
      },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/dogs/dog-1/medical-records/medical-1',
      method: 'PUT',
      data: {
        notes: '更新说明',
        attachments: [],
      },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/dogs/dog-1/medical-records/medical-1',
      method: 'DELETE',
    });
  });

  it('uses independent endpoints for checkups and allergies', () => {
    dogApi.healthRecords.checkup.create('dog-1', {
      checkupType: '牙齿复查',
      checkupDate: '2026-04-27',
      findings: '牙龈稳定',
      attachments: [],
    });
    dogApi.healthRecords.allergy.update('dog-1', 'allergy-1', {
      allergen: '鸡肉',
      notes: '腹泻',
      attachments: [],
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/dogs/dog-1/checkups',
      method: 'POST',
      data: {
        checkupType: '牙齿复查',
        checkupDate: '2026-04-27',
        findings: '牙龈稳定',
        attachments: [],
      },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/dogs/dog-1/allergies/allergy-1',
      method: 'PUT',
      data: {
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    });
  });
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/api/dogs.spec.ts --runInBand
```

Expected: tests fail because `dogApi.healthRecords` does not exist.

- [ ] **Step 3: Add CRUD API adapter**

In `miniapp/src/api/dogs.ts`, add types and methods:

```ts
type MedicalRecordPayload = {
  chiefComplaint?: string
  visitDate?: string
  diagnosis?: string
  notes?: string | null
  treatment?: string | null
  medications?: string[]
  status?: string
  followUpDate?: string | null
  veterinarian?: string | null
  attachments?: string[]
}

type CheckupRecordPayload = {
  checkupType?: string
  checkupDate?: string
  findings?: string | null
  recommendations?: string | null
  veterinarian?: string | null
  attachments?: string[]
}

type AllergyRecordPayload = {
  allergen?: string
  notes?: string | null
  attachments?: string[]
}

function healthRecordCrud<TPayload>(basePath: string) {
  return {
    list: (dogId: string) =>
      request({ url: `/dogs/${dogId}/${basePath}`, method: 'GET' }),
    create: (dogId: string, data: TPayload) =>
      request({ url: `/dogs/${dogId}/${basePath}`, method: 'POST', data }),
    update: (dogId: string, recordId: string, data: Partial<TPayload>) =>
      request({ url: `/dogs/${dogId}/${basePath}/${recordId}`, method: 'PUT', data }),
    delete: (dogId: string, recordId: string) =>
      request({ url: `/dogs/${dogId}/${basePath}/${recordId}`, method: 'DELETE' }),
  }
}
```

Then add this property to `dogApi`:

```ts
  healthRecords: {
    medical: healthRecordCrud<MedicalRecordPayload>('medical-records'),
    checkup: healthRecordCrud<CheckupRecordPayload>('checkups'),
    allergy: healthRecordCrud<AllergyRecordPayload>('allergies'),
  },
```

Keep `updateHealthRecords` temporarily for backwards compatibility, but the redesigned page must not call it.

- [ ] **Step 4: Run API tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/api/dogs.spec.ts --runInBand
```

Expected: tests pass.

- [ ] **Step 5: Commit API adapter**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add miniapp/src/api/dogs.ts miniapp/src/api/dogs.spec.ts
git commit -m "feat: add health record CRUD API adapter"
```

## Task 3: Health Record Utility Model

**Files:**

- Modify: `miniapp/src/utils/health-records.ts`
- Test: `miniapp/src/utils/health-records.spec.ts`

- [ ] **Step 1: Write failing utility tests**

Add tests to `miniapp/src/utils/health-records.spec.ts`:

```ts
import {
  buildCrudHealthRecordPayload,
  getHealthRecordTypeMeta,
  normalizeHealthRecordListResponse,
  replaceHealthRecordInList,
  removeHealthRecordFromList,
} from './health-records';

it('provides category metadata with labels and accent classes', () => {
  expect(getHealthRecordTypeMeta('medical')).toMatchObject({
    label: '病史',
    addLabel: '新增病史',
    emptyTitle: '还没有病史记录',
    accentClass: 'health-records--medical',
  });
  expect(getHealthRecordTypeMeta('checkup')).toMatchObject({
    label: '体检',
    addLabel: '新增体检',
    emptyTitle: '还没有体检记录',
    accentClass: 'health-records--checkup',
  });
  expect(getHealthRecordTypeMeta('allergy')).toMatchObject({
    label: '过敏',
    addLabel: '新增过敏',
    emptyTitle: '还没有过敏记录',
    accentClass: 'health-records--allergy',
  });
});

it('maps UI notes to checkup findings for CRUD payloads', () => {
  expect(
    buildCrudHealthRecordPayload('checkup', {
      checkupType: '牙齿复查',
      checkupDate: '2026-04-27',
      notes: '牙龈稳定',
      attachments: ['https://cdn.example.com/checkup.pdf'],
    }),
  ).toEqual({
    checkupType: '牙齿复查',
    checkupDate: '2026-04-27',
    findings: '牙龈稳定',
    attachments: ['https://cdn.example.com/checkup.pdf'],
  });
});

it('normalizes list responses from independent health endpoints', () => {
  expect(
    normalizeHealthRecordListResponse({
      code: 0,
      data: {
        records: [
          {
            id: 'checkup-1',
            checkupType: '牙齿复查',
            checkupDate: '2026-04-27',
            findings: '牙龈稳定',
            attachments: ['https://cdn.example.com/checkup.pdf'],
          },
        ],
      },
    }),
  ).toEqual([
    {
      id: 'checkup-1',
      checkupType: '牙齿复查',
      checkupDate: '2026-04-27',
      notes: '牙龈稳定',
      attachments: ['https://cdn.example.com/checkup.pdf'],
    },
  ]);
});

it('replaces and removes one record without touching others', () => {
  const records = [
    { id: 'a', checkupType: 'A' },
    { id: 'b', checkupType: 'B' },
  ];

  expect(replaceHealthRecordInList(records, { id: 'b', checkupType: 'B2' })).toEqual([
    { id: 'a', checkupType: 'A' },
    { id: 'b', checkupType: 'B2' },
  ]);
  expect(removeHealthRecordFromList(records, 'a')).toEqual([
    { id: 'b', checkupType: 'B' },
  ]);
});
```

- [ ] **Step 2: Run utility tests to verify they fail**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/utils/health-records.spec.ts --runInBand
```

Expected: tests fail because new functions are missing.

- [ ] **Step 3: Add utility implementation**

In `miniapp/src/utils/health-records.ts`, add:

```ts
export const HEALTH_RECORD_TYPES: HealthRecordType[] = ['medical', 'checkup', 'allergy'];

export function getHealthRecordTypeMeta(type: HealthRecordType) {
  if (type === 'medical') {
    return {
      label: '病史',
      addLabel: '新增病史',
      emptyTitle: '还没有病史记录',
      accentClass: 'health-records--medical',
    };
  }

  if (type === 'checkup') {
    return {
      label: '体检',
      addLabel: '新增体检',
      emptyTitle: '还没有体检记录',
      accentClass: 'health-records--checkup',
    };
  }

  return {
    label: '过敏',
    addLabel: '新增过敏',
    emptyTitle: '还没有过敏记录',
    accentClass: 'health-records--allergy',
  };
}

export function buildCrudHealthRecordPayload(
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  const basePayload = buildHealthRecordPayload(type, record);

  if (type === 'checkup') {
    const { notes, ...rest } = basePayload as Record<string, any>;
    return {
      ...rest,
      findings: notes,
    };
  }

  return basePayload;
}

export function normalizeHealthRecordResponse(record: Record<string, any>) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  return {
    ...record,
    notes: record.notes ?? record.findings ?? '',
    attachments: normalizeAttachments(record.attachments),
  };
}

export function normalizeHealthRecordListResponse(response: Record<string, any>) {
  const records = response?.data?.records;
  return Array.isArray(records)
    ? records.map((record) => normalizeHealthRecordResponse(record))
    : [];
}

export function replaceHealthRecordInList(
  records: Record<string, any>[],
  nextRecord: Record<string, any>,
) {
  const nextId = nextRecord?.id;
  if (!nextId) {
    return records;
  }

  const found = records.some((record) => record.id === nextId);
  if (!found) {
    return [nextRecord, ...records];
  }

  return records.map((record) => (record.id === nextId ? nextRecord : record));
}

export function removeHealthRecordFromList(
  records: Record<string, any>[],
  recordId: string,
) {
  return records.filter((record) => record.id !== recordId);
}
```

- [ ] **Step 4: Run utility tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/utils/health-records.spec.ts --runInBand
```

Expected: tests pass.

- [ ] **Step 5: Commit utility model**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add miniapp/src/utils/health-records.ts miniapp/src/utils/health-records.spec.ts
git commit -m "feat: model health record CRUD state"
```

## Task 4: Health Records Section Component

**Files:**

- Modify: `miniapp/src/components/dog-profile/HealthRecordsSection.vue`
- Test: `miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts`

- [ ] **Step 1: Write failing component regression tests**

Extend `miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('HealthRecordsSection redesigned interaction', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
    'utf-8',
  );

  it('does not save records through dog profile array replacement', () => {
    expect(source).not.toContain('dogApi.updateHealthRecords');
    expect(source).not.toContain('buildPersistedRecordsForSave');
    expect(source).not.toContain('findSavedRecordFromProfile');
  });

  it('renders category tabs and inline card save actions', () => {
    expect(source).toContain('record-type-tabs');
    expect(source).toContain('保存这一条');
    expect(source).toContain('getHealthRecordTypeMeta');
  });

  it('keeps attachment name display, preview, and delete actions', () => {
    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).detail');
    expect(source).toContain('previewAttachment');
    expect(source).toContain('removeAttachment');
  });
});
```

- [ ] **Step 2: Run component regression tests to verify they fail**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/components/dog-profile/HealthRecordsSection.regression.spec.ts --runInBand
```

Expected: tests fail because the component still calls `dogApi.updateHealthRecords` and lacks the final segmented structure.

- [ ] **Step 3: Refactor component props and emits**

Replace direct API ownership in `HealthRecordsSection.vue` with explicit data/events:

```ts
const props = withDefaults(defineProps<{
  dogId: string
  activeType: HealthRecordType
  records: Record<string, any>[]
  loading?: boolean
  savingRecordKey?: string
  preferredExpandedRecordIdentity?: string
}>(), {
  records: () => [],
  loading: false,
  savingRecordKey: '',
  preferredExpandedRecordIdentity: '',
});

const emit = defineEmits<{
  (event: 'change-type', value: HealthRecordType): void
  (event: 'save-record', payload: { type: HealthRecordType; record: Record<string, any> }): void
  (event: 'delete-record', payload: { type: HealthRecordType; record: Record<string, any> }): void
  (event: 'upload-attachment', payload: { type: HealthRecordType; recordKey: string; filePath: string }): void
  (event: 'delete-attachment', payload: { type: HealthRecordType; record: Record<string, any>; attachment: string }): void
  (event: 'dirty-change', value: boolean): void
  (event: 'record-saved', identity: string): void
}>();
```

The component may still call `dogApi.uploadHealthAttachment` if keeping upload local is simpler, but it must not call `dogApi.updateHealthRecords`.

- [ ] **Step 4: Implement segmented tabs and category color hooks**

Use `HEALTH_RECORD_TYPES` and `getHealthRecordTypeMeta`:

```vue
<view class="record-type-tabs">
  <button
    v-for="type in healthRecordTypes"
    :key="type"
    class="record-type-tab"
    :class="[
      getHealthRecordTypeMeta(type).accentClass,
      { 'record-type-tab--active': type === activeType },
    ]"
    @tap="emit('change-type', type)"
  >
    {{ getHealthRecordTypeMeta(type).label }}
  </button>
</view>
```

Add CSS classes:

```scss
.record-type-tab {
  border-radius: 999rpx;
  border: 1rpx solid #dce8e2;
  background: #f7faf8;
  color: #425466;
}

.record-type-tab--active.health-records--medical {
  background: #fff1ef;
  border-color: #f4a69a;
  color: #b9473b;
}

.record-type-tab--active.health-records--checkup {
  background: #eaf8f6;
  border-color: #79c9bf;
  color: #167f75;
}

.record-type-tab--active.health-records--allergy {
  background: #fff6df;
  border-color: #efbf5b;
  color: #a86b00;
}
```

- [ ] **Step 5: Implement inline card drafts**

Use a draft map and expanded key:

```ts
const draftByKey = ref<Record<string, Record<string, any>>>({});
const expandedRecordKey = ref<string | null>(null);

function recordKey(record: Record<string, any>, index: number) {
  return record.__localId || record.id || `${props.activeType}-${index}`;
}

function startAddRecord() {
  const draft = createHealthRecordDraft(props.activeType);
  const key = draft.__localId;
  draftByKey.value[key] = draft;
  expandedRecordKey.value = key;
}

function startEditRecord(record: Record<string, any>, index: number) {
  const key = recordKey(record, index);
  draftByKey.value[key] = cloneRecord(record);
  expandedRecordKey.value = key;
}

function saveDraft(record: Record<string, any>, index: number) {
  const key = recordKey(record, index);
  const draft = draftByKey.value[key];
  if (!draft) {
    return;
  }

  const validationError = getHealthRecordValidationError(props.activeType, draft);
  if (validationError) {
    uni.showToast({ title: validationError, icon: 'none' });
    return;
  }

  emit('save-record', {
    type: props.activeType,
    record: draft,
  });
}
```

- [ ] **Step 6: Keep attachment UI inside expanded cards**

Keep the existing attachment display helper:

```vue
<view v-if="attachmentList(draft).length > 0" class="attachment-list">
  <view
    v-for="(attachment, attachmentIndex) in attachmentList(draft)"
    :key="`${recordKey(record, index)}-${attachment}-${attachmentIndex}`"
    class="attachment-item"
  >
    <view class="attachment-item__copy" @tap="previewAttachment(attachment)">
      <text class="attachment-item__title">
        {{ attachmentDisplay(attachment, attachmentIndex).title }}
      </text>
      <text class="attachment-item__hint">
        {{ attachmentDisplay(attachment, attachmentIndex).detail }}
      </text>
    </view>
    <button class="attachment-item__action" @tap="previewAttachment(attachment)">预览</button>
    <button class="attachment-item__action attachment-item__action--danger" @tap="removeAttachment(record, index, attachmentIndex)">删除</button>
  </view>
</view>
```

When upload succeeds, append `uploaded.url` to the draft record's `attachments`.

- [ ] **Step 7: Run component regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/components/dog-profile/HealthRecordsSection.regression.spec.ts --runInBand
```

Expected: tests pass.

- [ ] **Step 8: Commit component refactor**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add miniapp/src/components/dog-profile/HealthRecordsSection.vue \
  miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts
git commit -m "feat: redesign health record section interaction"
```

## Task 5: Health Records Page Integration

**Files:**

- Modify: `miniapp/src/pages/dog-profile-health/index.vue`
- Test: `miniapp/src/pages/dog-profile-health.regression.spec.ts`

- [ ] **Step 1: Write failing page regression tests**

Extend `miniapp/src/pages/dog-profile-health.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('dog-profile-health page CRUD integration', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
    'utf-8',
  );

  it('loads health records through independent APIs instead of dog profile health arrays', () => {
    expect(source).toContain('dogApi.healthRecords.medical.list');
    expect(source).toContain('dogApi.healthRecords.checkup.list');
    expect(source).toContain('dogApi.healthRecords.allergy.list');
    expect(source).not.toContain('mergeDogHealthStateSnapshot');
    expect(source).not.toContain('writeDogHealthStateSnapshotCache');
  });

  it('saves one health record through POST or PUT and never through updateHealthRecords', () => {
    expect(source).toContain('saveHealthRecord');
    expect(source).toContain('.create(targetDogId');
    expect(source).toContain('.update(targetDogId');
    expect(source).not.toContain('dogApi.updateHealthRecords');
  });

  it('keeps diet reminder as an isolated card save', () => {
    expect(source).toContain('diet-reminder-card');
    expect(source).toContain('saveDietReminder');
    expect(source).toContain('dogApi.updateDietReminders');
  });
});
```

- [ ] **Step 2: Run page regression tests to verify they fail**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/pages/dog-profile-health.regression.spec.ts --runInBand
```

Expected: tests fail because the page still uses profile health state and does not use the independent CRUD methods.

- [ ] **Step 3: Add category-scoped state**

In `miniapp/src/pages/dog-profile-health/index.vue`, replace health arrays in `form` with explicit record state:

```ts
const activeRecordType = ref<HealthRecordType>('medical');
const recordsByType = reactive<Record<HealthRecordType, Record<string, any>[]>>({
  medical: [],
  checkup: [],
  allergy: [],
});
const loadingByType = reactive<Record<HealthRecordType, boolean>>({
  medical: false,
  checkup: false,
  allergy: false,
});
const savingRecordKey = ref('');
const hasUnsavedRecordDraft = ref(false);
const dietReminderDraft = ref('');
const savedPickyFoods = ref('');
```

Keep dog list and dog detail loading state, but remove health record cache state.

- [ ] **Step 4: Load independent health record lists**

Add:

```ts
function recordApiForType(type: HealthRecordType) {
  return dogApi.healthRecords[type];
}

async function loadHealthRecordList(type: HealthRecordType, targetDogId = dogId.value) {
  if (!targetDogId) {
    recordsByType[type] = [];
    return;
  }

  loadingByType[type] = true;
  try {
    const res: any = await recordApiForType(type).list(targetDogId);
    recordsByType[type] = normalizeHealthRecordListResponse(res);
  } catch (error: any) {
    uni.showToast({ title: error?.message || '健康记录加载失败', icon: 'none' });
    recordsByType[type] = [];
  } finally {
    loadingByType[type] = false;
  }
}

async function loadAllHealthRecordLists(targetDogId = dogId.value) {
  await Promise.all(
    HEALTH_RECORD_TYPES.map((type) => loadHealthRecordList(type, targetDogId)),
  );
}
```

After dog selection or page load:

```ts
await loadDogProfile(requestedDogId);
await loadAllHealthRecordLists(requestedDogId);
```

`loadDogProfile` should only populate dog-level fields:

```ts
dietReminderDraft.value = typeof profile.pickyFoods === 'string' ? profile.pickyFoods : '';
savedPickyFoods.value = dietReminderDraft.value;
```

- [ ] **Step 5: Add per-record save/delete handlers**

Add:

```ts
async function saveHealthRecord({
  type,
  record,
}: {
  type: HealthRecordType
  record: Record<string, any>
}) {
  const targetDogId = dogId.value;
  if (!targetDogId) {
    return;
  }

  const key = record.id || record.__localId || `${type}-saving`;
  savingRecordKey.value = key;

  try {
    const payload = buildCrudHealthRecordPayload(type, record);
    const res: any = record.id
      ? await recordApiForType(type).update(targetDogId, record.id, payload)
      : await recordApiForType(type).create(targetDogId, payload);

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '保存失败');
    }

    const nextRecord = normalizeHealthRecordResponse(res.data);
    recordsByType[type] = replaceHealthRecordInList(recordsByType[type], nextRecord);
    hasUnsavedRecordDraft.value = false;
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  } finally {
    savingRecordKey.value = '';
  }
}

async function deleteHealthRecord({
  type,
  record,
}: {
  type: HealthRecordType
  record: Record<string, any>
}) {
  const targetDogId = dogId.value;
  if (!targetDogId || !record.id) {
    return;
  }

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除记录',
      content: '删除后将无法恢复，确认继续吗？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) {
    return;
  }

  savingRecordKey.value = record.id;
  try {
    const res: any = await recordApiForType(type).delete(targetDogId, record.id);
    if (res.code !== 0) {
      throw new Error(res.message || '删除失败');
    }
    recordsByType[type] = removeHealthRecordFromList(recordsByType[type], record.id);
    uni.showToast({ title: '已删除', icon: 'success' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' });
  } finally {
    savingRecordKey.value = '';
  }
}
```

- [ ] **Step 6: Render redesigned page**

Use the component:

```vue
<HealthRecordsSection
  :dog-id="dogId"
  :active-type="activeRecordType"
  :records="recordsByType[activeRecordType]"
  :loading="loadingByType[activeRecordType]"
  :saving-record-key="savingRecordKey"
  @change-type="activeRecordType = $event"
  @save-record="saveHealthRecord"
  @delete-record="deleteHealthRecord"
  @dirty-change="hasUnsavedRecordDraft = $event"
/>
```

Render diet reminder separately:

```vue
<view class="diet-reminder-card">
  <view class="section-title">饮食提醒</view>
  <textarea
    v-model="dietReminderDraft"
    class="textarea-field"
    placeholder="记录挑食、不爱吃或需要提醒的食物"
  />
  <button
    class="primary-action"
    :disabled="!hasUnsavedDietReminderChange(dietReminderDraft, savedPickyFoods)"
    @tap="saveDietReminder"
  >
    保存饮食提醒
  </button>
</view>
```

Update `saveDietReminder`:

```ts
async function saveDietReminder() {
  const targetDogId = dogId.value;
  if (!targetDogId) {
    return;
  }

  try {
    const res: any = await dogApi.updateDietReminders(targetDogId, {
      pickyFoods: dietReminderDraft.value,
    });
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败');
    }
    savedPickyFoods.value = dietReminderDraft.value;
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  }
}
```

- [ ] **Step 7: Preserve dog switching safety**

Before switching dogs:

```ts
async function confirmDiscardUnsavedChanges() {
  if (
    !hasUnsavedRecordDraft.value &&
    !hasUnsavedDietReminderChange(dietReminderDraft.value, savedPickyFoods.value)
  ) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '放弃未保存内容？',
      content: '当前页面有未保存内容，切换狗狗后将不会保留。',
      confirmText: '继续切换',
      cancelText: '先不切换',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
}
```

Call this from dog picker change before updating `dogId`.

- [ ] **Step 8: Run page regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/pages/dog-profile-health.regression.spec.ts --runInBand
```

Expected: tests pass.

- [ ] **Step 9: Commit page integration**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add miniapp/src/pages/dog-profile-health/index.vue \
  miniapp/src/pages/dog-profile-health.regression.spec.ts
git commit -m "feat: integrate health record CRUD page"
```

## Task 6: Full Verification And Production Build

**Files:**

- No required source changes unless verification finds issues.

- [ ] **Step 1: Run backend health tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/controllers/health-records.controller.spec.ts --runInBand
```

Expected: all targeted backend health tests pass.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 3: Run miniapp targeted tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm test -- src/api/dogs.spec.ts src/utils/health-records.spec.ts src/components/dog-profile/HealthRecordsSection.regression.spec.ts src/pages/dog-profile-health.regression.spec.ts --runInBand
```

Expected: all targeted miniapp tests pass.

- [ ] **Step 4: Run miniapp production build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm build:mp-weixin
```

Expected: production build succeeds and updates `miniapp/dist/build/mp-weixin`.

- [ ] **Step 5: Check generated production bundle for removed risky path**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
rg -n "updateHealthRecords|buildPersistedRecordsForSave|mergeDogHealthStateSnapshot|writeDogHealthStateSnapshotCache" dist/build/mp-weixin || true
```

Expected: no matches for the redesigned health page/component path. If matches remain in unused compatibility modules, inspect and confirm they are not imported by `pages/dog-profile-health`.

- [ ] **Step 6: Commit verification-only fixes if needed**

If verification required source or test fixes, inspect the exact changed paths first:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status --short
```

Then stage only the files that were changed to fix verification and commit them:

```bash
git add backend/src/interfaces/dto/health/create-checkup.dto.ts \
  backend/src/interfaces/dto/health/update-checkup.dto.ts \
  backend/src/interfaces/dto/health/update-medical-record.dto.ts \
  backend/src/interfaces/dto/health/medical-record-response.dto.ts \
  backend/src/application/health/health.service.ts \
  backend/tests/controllers/health-records.controller.spec.ts \
  miniapp/src/api/dogs.ts \
  miniapp/src/api/dogs.spec.ts \
  miniapp/src/utils/health-records.ts \
  miniapp/src/utils/health-records.spec.ts \
  miniapp/src/components/dog-profile/HealthRecordsSection.vue \
  miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts \
  miniapp/src/pages/dog-profile-health/index.vue \
  miniapp/src/pages/dog-profile-health.regression.spec.ts
git commit -m "fix: stabilize health records page verification"
```

If no fixes were needed, do not create an empty commit.

## Task 7: Manual Acceptance Checklist

**Files:**

- No source files unless manual acceptance finds issues.

- [ ] **Step 1: Open production miniapp build**

Open this directory in WeChat Developer Tools:

```text
/Users/zhaochen/Documents/SevenKitchen/miniapp/dist/build/mp-weixin
```

- [ ] **Step 2: Verify record isolation**

Manual steps:

1. Open health records page.
2. Add one medical record with an attachment.
3. Add one checkup record with an attachment.
4. Add one allergy record with an attachment.
5. Return home.
6. Re-enter health records page.

Expected:

- All three records remain.
- Attachment names are visible.
- Preview works for uploaded attachments.

- [ ] **Step 3: Verify edit isolation**

Manual steps:

1. Edit the checkup record notes.
2. Save that card.
3. Re-enter page.

Expected:

- Checkup notes changed.
- Medical and allergy records remain unchanged.

- [ ] **Step 4: Verify delete isolation**

Manual steps:

1. Delete the allergy record.
2. Re-enter page.

Expected:

- Allergy record is gone.
- Medical and checkup records remain.

- [ ] **Step 5: Verify diet reminder isolation**

Manual steps:

1. Edit diet reminder.
2. Save diet reminder.
3. Re-enter page.

Expected:

- Diet reminder persists.
- Medical and checkup records remain.

- [ ] **Step 6: Verify dog switching**

Manual steps:

1. Start editing a record without saving.
2. Switch dog from picker.

Expected:

- Confirm modal appears.
- Cancel keeps current dog and draft.
- Confirm switches dog and loads the selected dog's own records.

## Task 8: Deployment

**Files:**

- No source files.

- [ ] **Step 1: Push backend changes to deployable branch**

Because production backend deployment pulls `origin/main`, ensure backend compatibility commits are on `main`.

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status --short
git log --oneline --max-count=5
```

Expected:

- No unexpected unstaged source changes.
- Health record backend compatibility commit is present.

- [ ] **Step 2: Deploy backend if backend files changed**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
bash backend/scripts/remote_deploy_v2.sh
```

Expected:

- Server pulls latest `origin/main`.
- Backend build succeeds.
- `sevenkitchen-backend` restarts.
- Health endpoint passes.

- [ ] **Step 3: Final public health check**

Run:

```bash
curl -sf http://1.14.3.2:3000/api/v1/health
```

Expected:

```json
{"status":"ok"}
```

The timestamp field may also be present.
