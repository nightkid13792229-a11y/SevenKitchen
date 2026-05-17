import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("FEDIAF 2025 dog standard page is routed and visible in sidebar", () => {
  const routerSource = readFileSync(
    new URL("../src/router/index.ts", import.meta.url),
    "utf8",
  );
  const layoutSource = readFileSync(
    new URL("../src/layouts/MainLayout.vue", import.meta.url),
    "utf8",
  );

  assert.match(routerSource, /nutrition-standards\/fediaf-2025-dog/);
  assert.match(routerSource, /FediafDogStandard/);
  assert.match(layoutSource, /营养标准/);
  assert.match(layoutSource, /FEDIAF 2025 犬标准/);
});

test("FEDIAF 2025 dog standard page is read-only and supports review markers", () => {
  const pageSource = readFileSync(
    new URL(
      "../src/views/NutritionStandards/FediafDogStandard.vue",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(pageSource, /FEDIAF 2025 犬标准/);
  assert.match(pageSource, /nutritionStandardApi\.getFediaf2025DogOverview/);
  assert.match(pageSource, /nutritionStandardApi\.listFediaf2025DogEntries/);
  assert.match(
    pageSource,
    /nutritionStandardApi\.updateFediaf2025DogEntryReview/,
  );
  assert.match(pageSource, /标准值只读/);
  assert.match(pageSource, /已审核/);
  assert.match(pageSource, /有疑问/);
  assert.match(pageSource, /需修正/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.minValue"/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.maxValue"/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.recommendedValue"/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.unit"/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.basis"/);
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.lifeStage"/);
});
