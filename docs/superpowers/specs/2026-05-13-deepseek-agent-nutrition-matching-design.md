# DeepSeek Agent Nutrition Matching Design

## Background

The current nutrition governance workbench can manually review food candidates and can run single-candidate Agent review through a backend provider. The provider is currently configured through backend environment variables, which is inconvenient for the user and unsuitable for normal Web-admin operation.

The desired first version is:

1. The user configures the model API directly in the Web management console.
2. DeepSeek is the first supported provider.
3. The Agent can batch match/review ingredient nutrition candidates.
4. The system never automatically confirms candidate nutrition profiles in this version.
5. The Web admin remains the only place where formal nutrition profiles are confirmed.

This design extends the existing `原料营养治理` workflow rather than replacing it.

## Goals

- Add a Web-admin Agent settings UI for DeepSeek API configuration.
- Store DeepSeek credentials securely enough for local and production deployment.
- Let an admin test the DeepSeek connection from the Web admin.
- Add a batch Agent matching/review job that can process many food ingredients or candidates.
- Populate existing candidate fields: Agent advice, hard-gate results, review group, suggested nutrition state labels, and risk flags.
- Keep final confirmation manual. The Agent job must not call any candidate-confirmation endpoint or write formal nutrition profiles.
- Handle DeepSeek rate limits gracefully with low default concurrency and retry/backoff.
- Keep the provider abstraction open for later Tencent Hunyuan, Qwen, or other providers.

## Non-Goals

- No automatic nutrition profile confirmation.
- No automatic publication to miniapp.
- No user-facing AI recipe generation.
- No supplement label OCR provider configuration in this first version.
- No general prompt editor for non-technical admins.
- No multi-tenant billing or per-user model keys.
- No replacement of deterministic source import, nutrient normalization, or hard gates with model-only logic.

## DeepSeek API Assumptions

DeepSeek official API documentation states that its API is compatible with OpenAI and Anthropic formats. For the OpenAI-compatible format:

- Base URL: `https://api.deepseek.com`
- Chat endpoint: `/chat/completions`
- Current model names include `deepseek-v4-flash` and `deepseek-v4-pro`
- `deepseek-chat` and `deepseek-reasoner` are marked for deprecation on `2026-07-24`
- DeepSeek dynamically limits concurrency based on server load and returns HTTP `429` when the limit is reached

References:

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/quick_start/rate_limit/

Default first-version model: `deepseek-v4-flash`.

Default base URL: `https://api.deepseek.com`.

Default concurrency: `1`.

## Product Workflow

### Agent Settings

In `原料营养治理`, add an `Agent 设置` area. It may be a button that opens a drawer or a dedicated card above the workbench.

Fields:

- Provider: `DeepSeek` in first version.
- Enabled: boolean.
- Base URL: default `https://api.deepseek.com`.
- Model: default `deepseek-v4-flash`.
- API Key: write-only input.
- API Key status: `未配置` or `已配置，尾号 ****1234`.
- Max concurrency: default `1`, allowed `1-5`.
- Request timeout seconds: default `90`.
- Retry count: default `2`.

Actions:

- Save settings.
- Clear API key.
- Test connection.

The UI must never display the full API key after saving.

### Batch Agent Matching

In the `食材匹配` tab, add `批量 Agent 匹配`.

The first version supports:

- Process current table filter results, or all pending food candidates when no filter is selected.
- Optional `force rerun` checkbox to overwrite existing Agent review advice.
- Limit field, default `50`, to avoid accidentally launching too large a job.
- Start job.
- Show current or latest job progress:
  - status
  - total candidates
  - processed count
  - success count
  - failed count
  - skipped count
  - started/finished time
  - last error summary

The job performs:

1. Select pending food candidates.
2. For each candidate without Agent review, call DeepSeek unless `force rerun` is false and cached advice exists.
3. Parse and normalize structured Agent output.
4. Run deterministic hard gates.
5. Save Agent advice, hard-gate results, review group, and suggested state/spec labels on the candidate.
6. Leave candidate status as pending unless the admin later confirms or rejects it.

The job does not:

- create a confirmed `NutritionFood`;
- create or replace a `NutritionFoodMapping`;
- write `Ingredient.nutritionProfile`;
- call batch confirm;
- hide failed candidates.

### Manual Confirmation

After a batch job finishes, the admin reviews candidates in the existing table and drawer:

- `AUTO_REVIEWABLE`: Agent and hard gates suggest it is likely safe, but still requires admin confirmation.
- `NEEDS_REVIEW`: likely useful, but identity/state/specification requires manual judgment.
- `NOT_RECOMMENDED`: should usually be rejected or replaced with another source.
- `MISSING_SOURCE`: no usable source or nutrition data.

Manual confirmation remains:

- open drawer via `审批`;
- inspect source, Agent advice, hard gates, and nutrition preview;
- edit state/spec labels if needed;
- click `确认为主档案` or `确认为次级档案`;
- or reject.

The existing explicit `批量确认` button may remain as an admin action for selected hard-gate-passing candidates, but the Agent batch job must not trigger it automatically.

## Backend Design

### Agent Provider Settings Table

Do not store model API credentials in `global_config`, because the project already has a public global config endpoint. Add a dedicated admin-only table, for example `agent_provider_config`.

Proposed fields:

- `id`
- `purpose`: `NUTRITION_CANDIDATE_REVIEW`
- `provider`: `DEEPSEEK`
- `enabled`
- `base_url`
- `model`
- `api_key_encrypted`
- `api_key_last4`
- `max_concurrency`
- `request_timeout_ms`
- `retry_count`
- `created_at`
- `updated_at`
- `updated_by`

Add a unique constraint on `(purpose, provider)`.

### API Key Storage

The backend stores API keys encrypted at rest.

Configuration:

- Production should require `AGENT_CONFIG_ENCRYPTION_KEY`.
- Local development may fall back to `JWT_SECRET` with a warning, but production must not.
- Use AES-GCM or an equivalent authenticated encryption primitive.
- Never log the plain API key.
- Return only `apiKeyConfigured` and `apiKeyLast4` to the frontend.

Updating settings:

- If `apiKey` is omitted, keep the existing key.
- If `apiKey` is a non-empty string, encrypt and replace the key.
- If `clearApiKey` is true, remove the encrypted key and last4.

### Admin Endpoints

Add endpoints under:

`/api/v1/admin/nutrition-governance/agent-settings`

Endpoints:

- `GET /agent-settings`
  - returns non-secret settings and key status.
- `PUT /agent-settings`
  - saves provider settings and optional API key.
- `POST /agent-settings/test`
  - sends a minimal DeepSeek request and returns success/error.

Add endpoints for batch jobs:

- `POST /candidates/batch-agent-review`
  - starts a batch Agent review job.
- `GET /candidates/agent-review-jobs/latest`
  - returns latest job summary.
- `GET /candidates/agent-review-jobs/:id`
  - returns job detail.

### Batch Job Persistence

Add a job table, for example `nutrition_agent_review_job`.

Proposed fields:

- `id`
- `status`: `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL_FAILED`, `FAILED`, `CANCELED`
- `provider`
- `model`
- `scope`
- `force_rerun`
- `limit`
- `total_count`
- `processed_count`
- `success_count`
- `failed_count`
- `skipped_count`
- `last_error`
- `created_by`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

First version can store item-level failures in a JSON column on the job. A separate job item table can be added later if we need detailed retry management.

### Provider Implementation

Add a DeepSeek provider that implements the existing nutrition candidate review provider interface.

Request shape:

- URL: `${baseUrl}/chat/completions`
- Method: `POST`
- Header: `Authorization: Bearer <api key>`
- Body:
  - `model`
  - `messages`
  - `response_format: { type: "json_object" }`
  - `stream: false`
  - `temperature: 0`
  - `thinking: { type: "disabled" }` when supported

Prompt requirements:

- The system prompt must explicitly require valid JSON.
- The JSON keys must match the existing `NutritionCandidateAgentReview` shape.
- The model must evaluate:
  - ingredient identity
  - raw/cooked/dried/powder/canned state
  - edible portion
  - processing/fortification/salt/UV/wild/farmed risks
  - primary vs secondary suitability

Parsing:

- Read `choices[0].message.content`.
- Parse JSON.
- Normalize enum values using the existing normalizer.
- If parsing fails, store the failure on the job item/job summary and leave the candidate unchanged or mark its Agent review status as failed.

### Rate Limit And Retry

DeepSeek returns `429` when concurrency is limited. The job runner should:

- default to concurrency `1`;
- cap admin-configured concurrency to `5` in first version;
- retry `429` and transient `5xx` failures with exponential backoff;
- respect configured request timeout;
- continue the job when one candidate fails;
- mark the job `PARTIAL_FAILED` if some candidates fail.

## Frontend Design

### Agent Settings UI

Add an `Agent 设置` drawer or panel in `admin-web/src/views/NutritionGovernance/index.vue`.

Display:

- provider: DeepSeek
- enabled switch
- base URL
- model
- API key write-only input
- configured status and last4
- max concurrency
- timeout
- retry count

Actions:

- Save
- Test connection
- Clear key

Validation:

- Base URL must start with `https://` unless running local development.
- Model cannot be empty.
- API key can be omitted when updating non-secret fields.
- If enabled and no key is configured, show a warning.

### Batch Job UI

Add a compact batch panel in the `食材匹配` tab:

- `批量 Agent 匹配` button
- `覆盖已有 Agent 建议` checkbox
- `处理数量` input
- latest job status/progress

When a job starts:

- show progress card;
- disable starting another job while one is running;
- allow refresh/polling;
- reload candidates when the job finishes.

### Candidate Table

Reuse existing columns:

- `队列`
- `Agent建议`
- `营养状态`
- `硬闸门`

After a job finishes, admins should be able to filter by queue and manually review candidates.

## Security And Compliance Notes

- API keys are admin-only secrets.
- API keys must not be returned to frontend after save.
- API keys must not be stored in `global_config`.
- API keys must not be logged.
- Model requests should send only the minimum candidate data required for nutrition matching.
- Do not send customer personal data, dog health records, order addresses, or unrelated business data to DeepSeek.
- Store provider, model, prompt version, and result for auditability.
- Since this is internal admin-assisted review, the Agent output is advisory and not a public user-facing AI response.

## Error Handling

Settings errors:

- Missing key while enabled: show admin warning and block test/run.
- Invalid URL: block save.
- Test connection failure: show sanitized provider error.

Job errors:

- No candidates: mark job succeeded with skipped count.
- Provider disabled: block job start.
- Rate limit: retry with backoff, then record failure.
- Invalid JSON: record failure and keep candidate pending.
- Backend restart during first version job: job may remain `RUNNING`; admin can start a new job after backend marks stale running jobs as failed on boot.

## Testing Strategy

Backend tests:

- settings endpoint masks API key and stores only encrypted value.
- updating settings without `apiKey` preserves existing key.
- clearing key removes encrypted key and last4.
- DeepSeek provider builds `/chat/completions` request and parses `choices[0].message.content`.
- provider handles invalid JSON and non-2xx responses.
- batch job does not confirm candidates or write `NutritionFood`.
- batch job saves Agent review, hard gates, and review group.
- retry logic handles `429`.

Frontend tests:

- Agent settings panel does not display saved API key.
- save/test buttons call expected API endpoints.
- batch Agent matching button starts a job.
- running job disables duplicate start.
- candidate table still requires manual approval.

Verification:

- Prisma validate/generate.
- focused backend Jest tests.
- admin-web focused tests.
- backend build.
- admin-web build.

## Acceptance Criteria

The feature is complete when:

1. Admin can configure DeepSeek in Web management backend.
2. Saved API key is masked and not exposed in API responses.
3. Admin can test DeepSeek connection.
4. Admin can start a batch Agent matching/review job.
5. Job processes candidates with DeepSeek and records structured advice.
6. Job handles DeepSeek 429 or transient failures without aborting all candidates.
7. No candidate is automatically confirmed after Agent review.
8. Admin can manually confirm or reject candidates from the existing review drawer.
9. Existing manual review workflow continues to work when Agent settings are disabled.

