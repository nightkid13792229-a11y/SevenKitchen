# Dog Breed Health Risk Knowledge Base Design

## Goal

Build a backend-managed breed health risk knowledge base and show it in the miniapp so users can understand diseases commonly associated with their dog's breed.

The first release focuses on reading and education only. It does not diagnose a dog, score an individual dog's medical risk, create health records, or trigger care reminders.

## User Experience

The miniapp will expose two entry points:

1. Dog health profile entry
   - On the dog health records page, show a "本品种健康关注项" card when the selected dog has a standard `breedId`.
   - The card shows the breed name, number of published risk items, two or three top items, source count, and a link to view more.
   - Mixed/custom breeds show an empty state explaining that breed-specific information is available for standard breeds first.

2. Standalone breed lookup
   - Add a "品种疾病风险查询" page.
   - Users can search/select a breed using the existing breed search behavior, then view the same risk list and details.
   - The page does not require the user to have a dog profile.

Information is shown progressively:

- Level 1: disease name, attention priority, one-sentence summary, and source count.
- Level 2: expanded content with common signs, why this breed is worth watching, and suggested screening/checkup items.
- Level 3: detailed explanation and full source list with source name, publisher, URL, and recorded/access date.

## Language

Do not present the feature as a diagnosis or a universal risk score.

Use:

- "本品种健康关注项"
- "重点关注"
- "建议了解"
- "补充了解"
- "该品种资料中较常被提及"
- "资料来源"

Avoid:

- "你的狗高风险"
- "一定会得"
- "高风险疾病诊断"
- "权威风险等级"

Every page or detail panel must include this note:

> 本页面为品种资料科普，不替代兽医诊断。如有症状，请及时咨询兽医。

## Source Policy

There is no single universal authoritative `HIGH / MEDIUM / LOW` risk scale across the main veterinary and inherited-disease resources. The product will therefore store and display an internal attention priority for reading order, plus explicit evidence/source metadata.

Preferred source families:

- CIDD: breed pages list serious/common inherited-component disorders and disorder pages describe condition, inheritance, consequences, and care. https://cidd.discoveryspace.ca/
- OFA / CHIC: breed-specific screening recommendations identify health screening tests of primary concern and benefit. https://ofa.org/diseases/
- OMIA: curated inherited disorder, trait, gene, variant, and literature database. https://omia.org/home/?starter=start
- WSAVA: hereditary disease guidance and resource directory. https://wsava.org/global-guidelines/hereditary-disease/

Each published breed-risk item must have at least one visible source.

## Backend Data Model

Add the knowledge base beside the existing `DogBreed` domain. Do not store this data inside user dog profiles or health records.

### BreedHealthCondition

Purpose: the reusable disease/condition master record.

Fields:

- `id`
- `nameCn`
- `nameEn`
- `aliases`
- `category`
- `summary`
- `commonSigns`
- `screeningAdvice`
- `careAdvice`
- `isActive`
- `createdAt`
- `updatedAt`

Database table: `breed_health_condition`.

### BreedHealthRisk

Purpose: the breed-to-condition association and user-facing breed-specific text.

Fields:

- `id`
- `breedId`
- `conditionId`
- `attentionPriority`: `KEY_ATTENTION`, `RECOMMENDED_AWARENESS`, `SUPPLEMENTAL_AWARENESS`
- `oneLineSummary`
- `breedSpecificReason`
- `displayOrder`
- `isPublished`
- `createdAt`
- `updatedAt`

Database table: `breed_health_risk`.

Rules:

- Unique pair: `breedId + conditionId`.
- Only published risks are returned to the miniapp.
- `attentionPriority` is an editorial display priority, not a medical risk grade.

### BreedHealthRiskSource

Purpose: visible evidence/source rows for each breed-risk association.

Fields:

- `id`
- `riskId`
- `sourceType`: `CIDD`, `OFA_CHIC`, `OMIA`, `WSAVA`, `VETERINARY_LITERATURE`, `BREED_CLUB`, `OTHER`
- `sourceName`
- `publisher`
- `title`
- `url`
- `accessedAt`
- `note`
- `createdAt`
- `updatedAt`

Database table: `breed_health_risk_source`.

Rules:

- A published risk must have at least one source row.
- The API returns source rows in the same response as the risk details.

## Backend API

### Get Risks By Breed

`GET /api/v1/dogs/breeds/:breedId/health-risks`

Purpose: used by the dog health profile entry and the breed detail view.

Response shape:

```json
{
  "code": 0,
  "data": {
    "breed": {
      "id": "breed-id",
      "name": "金毛"
    },
    "risks": [
      {
        "id": "risk-id",
        "conditionId": "condition-id",
        "conditionName": "髋关节发育不良",
        "category": "骨骼关节",
        "attentionPriority": "KEY_ATTENTION",
        "attentionLabel": "重点关注",
        "oneLineSummary": "该品种资料中较常被提及的骨骼关节关注项。",
        "breedSpecificReason": "品种相关说明。",
        "commonSigns": ["运动不愿意", "后肢跛行"],
        "screeningAdvice": "可与兽医讨论髋关节相关检查。",
        "careAdvice": "如出现跛行或疼痛表现，请及时咨询兽医。",
        "sourceCount": 2,
        "sources": [
          {
            "sourceType": "OFA_CHIC",
            "sourceName": "OFA CHIC",
            "publisher": "Orthopedic Foundation for Animals",
            "title": "Breed screening recommendation",
            "url": "https://ofa.org/diseases/",
            "accessedAt": "2026-05-17"
          }
        ]
      }
    ]
  }
}
```

Error behavior:

- Unknown breed returns `code: 404` with a friendly message.
- Valid breed with no published risks returns the breed plus an empty `risks` array.

### Search Breed Risks

Use the existing `/api/v1/dogs/breeds` breed list for search in the first implementation, then call the breed detail endpoint above.

If later performance requires a combined endpoint, add:

`GET /api/v1/dogs/breed-health-risks?keyword=xxx`

That endpoint is not required for the first implementation.

## Miniapp Data Flow

Dog health profile page:

1. Load dog profile as it does today.
2. If `breedId` exists and is not the mixed-breed virtual ID, call `dogApi.breedHealthRisks(breedId)`.
3. Render a compact risk card below the selected dog area and above editable health record cards.
4. Tapping a risk expands the second-level detail.
5. Tapping "资料来源" expands the source list.

Standalone lookup page:

1. Load breed list through existing `dogApi.breeds()`.
2. Reuse the current breed search helper.
3. When a breed is selected, call `dogApi.breedHealthRisks(breedId)`.
4. Render the same risk list/detail component used by the health page.

## Component Boundaries

Add a reusable miniapp component:

`miniapp/src/components/dog-profile/BreedHealthRiskSection.vue`

Responsibilities:

- Shows loading, error, empty, compact list, and expanded detail states.
- Receives `breedName`, `risks`, `loading`, and `error` as props.
- Emits retry/view-detail only if needed.
- Does not call APIs directly.

Add helper functions:

`miniapp/src/utils/breed-health-risks.ts`

Responsibilities:

- Map `attentionPriority` to labels.
- Normalize API response into safe arrays.
- Build empty-state copy.
- Keep source display formatting out of page files.

## Error And Empty States

- Loading: "正在加载本品种健康关注项"
- API failure: show a quiet retry row, not a blocking page error.
- No data: "暂未收录该品种的健康关注项，后续会逐步补充。"
- Mixed/custom breed: "混血/手动填写品种暂不展示品种专属资料，可使用品种查询页查看相近标准品种。"
- Source missing in an unpublished draft is allowed; a published item without sources should be blocked by tests or seed validation.

## Data Maintenance

First release:

- Add Prisma migration for the three tables and enums.
- Add seed/backfill script support. If source-vetted content is ready, seed a small starter set; otherwise seed no published risks and let the miniapp show the no-data state.
- Keep content updates backend-only after deployment.

Later:

- Add admin CRUD pages for conditions, breed-risk associations, and sources.
- Add review workflow fields such as `reviewStatus`, `reviewedBy`, and `reviewedAt` if editorial volume grows.

## Testing

Backend:

- Controller test for `GET /api/v1/dogs/breeds/:breedId/health-risks`.
- Repository/service tests for:
  - only published risks are returned;
  - sources are included;
  - unknown breed returns friendly 404;
  - empty published list returns an empty array;
  - attention priority maps to display label.
- Seed validation test or script check that published rows have at least one source.

Miniapp:

- API adapter test for the new endpoint.
- Helper tests for priority labels, empty states, and source normalization.
- Regression tests for:
  - health page contains the breed health risk section;
  - mixed/custom breed does not call the risk endpoint;
  - standalone lookup page reuses breed search and risk detail display.

Verification:

- Run backend targeted tests.
- Run miniapp targeted Vitest suites.
- Run at least one miniapp build/preview flow before completion, following project rules.

## Out Of Scope

- Individual dog disease prediction.
- Veterinary diagnosis or treatment recommendations.
- One-click creation of medical/checkup records.
- User reminders or follow-up tasks.
- Admin editing UI for the first implementation.
