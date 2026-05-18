# Multi-Model Trusted Web Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek default/review model configuration and a whitelist web-search/fetch path for nutrition candidate discovery.

**Architecture:** Keep DeepSeek as the reasoning layer and implement search/fetch as deterministic backend tools. Web results can only create source drafts/candidates when the URL is trusted and the page payload contains parseable source nutrition values.

**Tech Stack:** NestJS, Prisma, Vue 3, Element Plus, Jest, Node test runner.

---

### Task 1: Multi-Model Agent Settings

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Add: `backend/prisma/migrations/202605180002_add_agent_review_model/migration.sql`
- Modify: `backend/src/application/nutrition-governance/agent-provider-config.service.ts`
- Modify: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Modify: `admin-web/src/types/nutritionGovernance.ts`
- Modify: `admin-web/src/views/NutritionGovernance/components/AgentSettingsDrawer.vue`
- Test: `backend/tests/application/nutrition-governance/agent-provider-config.service.spec.ts`
- Test: `admin-web/tests/nutritionGovernanceAgentSettings.test.ts`

- [ ] Add failing tests for `reviewModel`.
- [ ] Add schema field and migration.
- [ ] Save, expose, validate, and display `reviewModel`.
- [ ] Use review model for nutrition validation.

### Task 2: Trusted Web Search Tool

**Files:**
- Create: `backend/src/application/nutrition-governance/trusted-nutrition-web-search.service.ts`
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `admin-web/src/views/NutritionGovernance/components/IngredientNutritionWorkbenchDrawer.vue`
- Test: `backend/tests/application/nutrition-governance/trusted-nutrition-web-search.service.spec.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts`
- Test: `admin-web/tests/nutritionGovernanceWorkbench.test.js`

- [ ] Add failing tests for trusted URL extraction, whitelist web discovery, and whitelisted fetch.
- [ ] Implement trusted domain checks, direct URL fetch, whitelist search discovery, and lightweight CSV/HTML table extraction.
- [ ] Make `onlineWhitelistSearch` run USDA API when configured and trusted web search when no USDA key exists.
- [ ] Show UI copy that this is a trusted web search, not arbitrary web scraping.

### Task 3: Verification

- [ ] Run focused backend tests.
- [ ] Run focused frontend tests.
- [ ] Run backend and admin builds.
