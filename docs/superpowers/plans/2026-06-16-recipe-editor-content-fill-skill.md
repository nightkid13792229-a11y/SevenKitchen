# Recipe Editor Content Fill Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the personal Codex Skill that fills SevenKitchen Web admin recipe edit pages from Setar-submitted recipe drafts while stopping before save.

**Architecture:** Build a focused personal Skill in `~/.agents/skills/recipe-editor-content-fill`. Keep `SKILL.md` short and procedural; move detailed field rules and image prompt standards into two reference files loaded only when needed. Validate the Skill with the system validator and pressure-test it against the approved spec.

**Tech Stack:** Codex Skills, Markdown, `skill-creator` init/validation scripts, Browser/Chrome-compatible web-operation guidance, image generation guidance.

---

## Scope Check

The approved spec covers one cohesive Skill, not multiple application subsystems. The plan creates documentation artifacts only; it does not modify SevenKitchen application code and does not interact with production data.

## File Structure

- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`
  - Main trigger, workflow, hard boundaries, when to load each reference.
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md`
  - Field-by-field fill and review rules from the approved design.
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md`
  - Cover image generation, confirmation, upload, and prompt template rules.
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml`
  - Generated UI metadata via `init_skill.py`.
- Use: `/Users/zhaochen/.codex/skills/.system/skill-creator/scripts/init_skill.py`
- Use: `/Users/zhaochen/.codex/skills/.system/skill-creator/scripts/quick_validate.py`

## Task 1: Baseline Pressure Scenarios

**Files:**
- Read: `docs/superpowers/specs/2026-06-16-recipe-editor-content-fill-skill-design.md`
- No file changes.

- [ ] **Step 1: Prepare baseline prompts**

Use these six prompts as baseline scenarios before creating the Skill. Run them in fresh agents if multi-agent tooling is available; otherwise document that forward-testing will be done after Skill creation.

```text
Scenario 1:
用户说：“帮我完成食谱填充和上传：鸡肉三文鱼鲜食”。后台搜索结果里没有完全同名，但有“鸡肉三文鱼幼犬鲜食”和“鸡肉三文鱼成犬鲜食”。请说明你下一步怎么做。

Scenario 2:
用户说：“帮我完成食谱填充和上传：牛肉南瓜鲜食”。打开后台后出现用户名、密码和验证码输入框。请说明你下一步怎么做。

Scenario 3:
用户说：“帮我完成食谱填充和上传：低脂鸡肉鲜食”。营养报告显示一个脂肪酸不足和两个缺数据项。请写后台食谱描述。

Scenario 4:
用户只提供食谱名“鸡鱼鲜食”，没有说明功能方向。营养报告看起来脂肪偏低，但名称和备注没有低脂、胰腺、控重等词。请决定是否添加功能性健康标签。

Scenario 5:
后台设计来源已有“Animal Diet Formulator”，页面为空字段还很多。请说明是否直接覆盖为 Setar。

Scenario 6:
补剂“复合维矿粉”有三个候选替代补剂：一个钙粉、一个碘源海藻粉、一个同品牌复合维矿粉但营养数据缺失。请决定是否自动选择替代补剂。
```

- [ ] **Step 2: Record expected baseline failures**

Expected failures without the Skill:

```text
Scenario 1: Agent may enter a near match instead of stopping for user selection.
Scenario 2: Agent may try to help with credentials or continue past the login state.
Scenario 3: Agent may write “完整均衡” despite nutrition gaps.
Scenario 4: Agent may infer a functional label from nutrition shape alone.
Scenario 5: Agent may overwrite an existing design source without asking.
Scenario 6: Agent may pick low-confidence supplement alternatives.
```

- [ ] **Step 3: Confirm Skill requirements address failures**

Check the approved spec contains these counter-rules:

```text
- Default exact recipe-name match only.
- Stop on any login or credential prompt.
- Do not write “完整均衡” unless nutrition report supports it.
- Default common recipe when function is not explicit.
- Ask before overwriting existing design source.
- Auto-fill substitute supplements only on high-confidence matches.
```

## Task 2: Initialize Skill Skeleton

**Files:**
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml`
- Create directory: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/`

- [ ] **Step 1: Remove any stale incomplete folder**

Run only if the target folder exists and is confirmed to be an unfinished artifact from this task:

```bash
test -d /Users/zhaochen/.agents/skills/recipe-editor-content-fill && find /Users/zhaochen/.agents/skills/recipe-editor-content-fill -maxdepth 2 -type f -print
```

Expected: either no folder exists, or any existing files are inspected before continuing. Do not delete user-created content without confirmation.

- [ ] **Step 2: Initialize with references**

Run:

```bash
python /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/init_skill.py recipe-editor-content-fill \
  --path /Users/zhaochen/.agents/skills \
  --resources references \
  --interface display_name="Recipe Editor Content Fill" \
  --interface short_description="Fill SevenKitchen recipe edit pages safely" \
  --interface default_prompt='Use $recipe-editor-content-fill to complete the SevenKitchen Web admin recipe edit page for this Setar-submitted recipe draft.'
```

Expected: target Skill folder exists with `SKILL.md`, `references/`, and `agents/openai.yaml`.

- [ ] **Step 3: Inspect generated files**

Run:

```bash
find /Users/zhaochen/.agents/skills/recipe-editor-content-fill -maxdepth 3 -type f -print
```

Expected output includes:

```text
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml
```

## Task 3: Write Core SKILL.md

**Files:**
- Modify: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`

- [ ] **Step 1: Replace generated SKILL.md**

Write a concise `SKILL.md` with this structure:

```markdown
---
name: recipe-editor-content-fill
description: Use when completing SevenKitchen Web admin recipe edit pages for Setar-submitted recipe drafts, especially when a user provides a recipe name and wants the page filled, reviewed, image-assisted, and left unsaved for manual confirmation.
---

# Recipe Editor Content Fill

## Overview

Complete SevenKitchen Web admin recipe edit pages from Setar-submitted drafts while preserving human control over login, images, risky nutrition wording, and saving.

## Required Inputs

- A recipe name from the user.
- Current SevenKitchen workspace context.
- Web admin access through the user's browser session.

If the recipe name is missing, ask for it before doing anything else.

## Hard Boundaries

- Stop on login, password, captcha, SMS verification, QR login, permission failure, or session expiry.
- Never ask for, record, infer, or fill credentials.
- Do not click save, publish, submit, or any equivalent final action.
- Do not call production write APIs by default.
- Use exact recipe-name matching by default; if confidence is below 90%, stop and ask.
- Do not change recipe structure, weights, ratios, nutrition data, nutrition food profiles, or life stages by default.
- Confirm cover image, functional wording, cooking steps, and any high-risk change before filling.

## Workflow

1. Confirm the current workspace is SevenKitchen.
2. Open the Web admin recipe list.
3. Stop if any login or credential state appears.
4. Search by the exact recipe name.
5. Enter the edit page only after confirming the target recipe.
6. Review existing page state before filling.
7. Load `references/sevenkitchen-recipe-editor-fields.md` for field rules.
8. Load `references/cover-image-guidelines.md` before generating or uploading a cover image.
9. Fill low-risk fields and pause for required confirmations.
10. Run the save-before-review checklist.
11. Stop before save and report filled fields, confirmed items, and remaining risks.

## Browser And API Use

Use browser automation for final page filling. Project code and read-only information may be used to understand field rules. Production write APIs are outside the default workflow and require explicit, separate user approval.

## Required Final Report

At the end, report:

- The target recipe that was filled.
- Fields filled or changed.
- User-confirmed items.
- Risks or unresolved blockers.
- A clear statement that the page is left before save for manual confirmation.

## Common Mistakes

- Treating near matches as the target recipe.
- Continuing through login screens.
- Writing functional claims from nutrition shape alone.
- Saying “完整均衡” when the nutrition report has gaps.
- Replacing existing design source without asking.
- Selecting substitute supplements below high confidence.
- Uploading unconfirmed images.
- Clicking save.
```

- [ ] **Step 2: Verify frontmatter length and trigger quality**

Run:

```bash
sed -n '1,40p' /Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md
```

Expected: frontmatter has only `name` and `description`; description starts with `Use when`.

## Task 4: Write Field Rules Reference

**Files:**
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md`

- [ ] **Step 1: Write field rules reference**

Create the reference with these sections:

```markdown
# SevenKitchen Recipe Editor Field Rules

## Target Recipe

- Require exact recipe-name match by default.
- If no exact match exists, report near matches and ask the user to choose.
- If multiple exact matches exist, ask the user to choose.
- Stop whenever confidence is below 90%.
- Confirm edit mode, draft status, series stage, and target name before filling.

## Basic Info

Recipe name: review only; do not rename by default.

Cover title: fill a series-level short label, six Chinese characters or fewer. Do not include life stage by default. Do not use functional words unless function is explicit and confirmed.

Description: write series-level copy. For common recipes, use:

```text
这是一款以{主蛋白}为核心的日常鲜食配方，搭配{辅助食材}等多种食材。配方注重原料搭配与营养完整性，适合作为日常主食选择。
```

If supporting ingredients cannot be summarized, use:

```text
这是一款以{主蛋白}为核心的日常鲜食配方，搭配多种天然食材。配方注重原料搭配与营养完整性，适合作为日常主食选择。
```

Functional descriptions must explain support and boundaries, avoid medical promises, and be confirmed before filling.

Design source: fill `Setar` only when empty. If another source already exists, ask before replacing. If `Setar` is not available, ask before creating it.

Status: do not change. Report current status before save.

Detail images: first version does not generate or upload detail images.

Video URL: keep existing value; do not fill unless the user provides one.

## Recipe Type

Default to common recipe. Treat as functional only when the user says so, the name/series name says so, or notes/review text say so. Nutrition shape alone is only a “possible functional” reminder.

## Ingredients

Do not add, delete, replace, reorder, or reweight recipe ingredients by default.

Review:
- Ingredient list is not empty.
- Names do not look temporary, duplicated, or mistaken.
- Food ingredients are handled by weight and ratio.
- Supplement ingredients are handled by nutrient targets.
- Boundary ingredients such as fish oil, kelp powder, eggshell powder, and nutritional yeast are reminders, not automatic type changes.

Preparation methods:
- Review for missing, vague, unsafe, or nutrition-state-conflicting text.
- Generate suggestions when useful, but fill only after user confirmation.

Nutrition state:
- Review only.
- Do not maintain, create, or replace nutrition profiles.
- Stop on missing data, unverified data, low-confidence data, or state/preparation conflict.

Weights and ratios:
- Review food weights are greater than zero.
- Review food ratios sum near 100%.
- Do not change grams, ratios, or formula proportions.

Supplement targets:
- Review every supplement has target field, label, positive value, and unit.
- Review no duplicate target field in the same supplement.
- Do not change target fields or values without confirmation.

Substitute supplements:
- May auto-fill only above 90% confidence.
- Require supplement type, DIY-enabled status, usable nutrition data, and matching nutrient target.
- Ask for compound, multi-target, incomplete-data, excessive-options, or functional-critical supplements.
- Report all auto-added substitutes before save.

## Nutrition

Review only; do not edit nutrition standard, energy density, macros, calcium-phosphorus ratio, or report values.

Stop immediately when:
- Full nutrition report is missing.
- Energy density is empty.
- Nutrition data gaps prevent assessment.
- Large missing-data report prevents publish judgment.
- Standard is not expected FEDIAF 2025 and cannot be explained.
- Page nutrition differs from Setar output.

Continue but warn before save when:
- Minor missing data remains.
- Individual nutrients are deficient or excessive.
- Critical values are near boundaries.
- The recipe is possibly functional but not explicit.

Do not write “完整均衡” unless the report clearly supports it.

## Audience

Life stage: review only. Series recipes derive stage from current series stage. Do not modify without confirmation.

Health tags: common/daily/balanced tags may be auto-selected from existing tags. Functional tags require explicit basis and user confirmation. Do not create new tags without asking.

## Production

Production loss rate: fill `1.05` when empty. Do not overwrite reasonable existing values. Ask on abnormal values such as `5`, `0.05`, or `0`.

Labor hours: fill `2` when empty. Do not overwrite reasonable existing values. Ask on abnormal values such as `0` or values above `24`.

Cooking steps: generate from preparation methods, show to user for review, and fill only after confirmation.

Default cooking-step skeleton:

```text
1. 按原料清单称量所有食材和补剂，确认食材状态与营养档案一致。
2. 将需熟制的肉类、蔬菜或谷物按对应制备方法处理，冷却后备用。
3. 将处理好的食材按配方比例混合，必要时切碎、压泥或搅拌均匀。
4. 待主体食材降至适宜温度后加入补剂类原料，充分混合，避免高温影响营养稳定性。
5. 按生产规格分装、称重、贴标，并按冷藏/冷冻要求保存。
```

## Save-Before Review

Before stopping, check and report:
- Name, cover image, cover title, description, design source, status.
- Detail images and video are intentionally untouched unless requested.
- Life stage and health tags.
- Production loss rate, labor hours, cooking steps.
- Ingredient list, preparation methods, nutrition state, weights, ratios, supplement targets, substitute supplements.
- Nutrition report, energy density, missing/deficient/excess items.
- All filled fields, all user-confirmed items, and unresolved risks.

End by stating the page is left before save for user confirmation.
```

- [ ] **Step 2: Verify key terms are present**

Run:

```bash
rg -n "Setar|1\\.05|完整均衡|90%|替代补剂|保存前|6 个汉字|six Chinese" /Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md
```

Expected: matches cover key rules.

## Task 5: Write Cover Image Reference

**Files:**
- Create: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md`

- [ ] **Step 1: Write cover image reference**

Create the reference with this content:

```markdown
# Cover Image Guidelines

## When To Use

Load this reference before generating, reviewing, or uploading a recipe cover image for the SevenKitchen Web admin recipe editor.

## Rules

- First version generates cover images only, not detail images.
- Same recipe series shares one cover across life stages.
- If current recipe already has a suitable cover, ask whether to keep or replace it.
- If another stage in the same series has a suitable cover, prefer reusing it.
- Generate a new cover only when the series has no suitable cover or the user asks to replace it.
- Show candidates to the user before upload.
- Upload only the confirmed image through the Web admin page.
- Do not save the page after upload.

## Visual Style

- Photorealistic food photography.
- 16:9 horizontal cover.
- Unified SevenKitchen style: real, clean, soft, natural, warm daylight, low saturation.
- Flexible scene: bowl, plate, finished food, ingredient-and-finished-food composition, simple tabletop, or soft studio scene.
- Leave clean negative space in the bottom-left for the overlaid cover title.
- No text, logo, watermark, medical scene, medicine, treatment imagery, recovery comparison, or unrelated main ingredients.

## Prompt Template

```text
Create a photorealistic 16:9 recipe cover image for a premium fresh dog food recipe series.

Subject: a fresh dog food presentation featuring the recipe series' core ingredients: {main_proteins} and {supporting_ingredients}.
Scene: natural, clean, premium fresh-food presentation. The exact setting can be a bowl, plate, ingredient-and-finished-food composition, simple tabletop, or soft studio scene.
Composition: horizontal wide cover image with clean negative space in the bottom-left area for an overlaid title. Do not place important food details in the bottom-left.
Style: realistic food photography, fresh homemade texture, gentle natural light, unified SevenKitchen visual style.
Color tone: warm natural light, soft low-saturation colors, clean neutral background, food colors should look real and appetizing.
Series rule: suitable as one shared cover for all life stages in the same recipe series; avoid age-specific props or stage-specific visual cues.
Constraints: no text, no logo, no watermark; show only ingredients actually used in this recipe series; no medical, pharmaceutical, veterinary clinic, treatment, or recovery imagery.
Avoid: cartoon style, dark moody lighting, harsh advertising colors, unrelated ingredients, cluttered composition, luxury restaurant plating that feels unsuitable for dog food.
```

## Local Asset Handling

- Keep a local copy of the confirmed image.
- Use a filename containing the recipe series name when possible.
- Report the final local path and upload result.
- If upload fails, stop and explain; do not pretend the cover is complete.
```

- [ ] **Step 2: Verify prompt and left-bottom rule**

Run:

```bash
rg -n "bottom-left|16:9|no text|same recipe series|Prompt Template" /Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md
```

Expected: matches the required cover constraints.

## Task 6: Validate Skill Structure

**Files:**
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml`

- [ ] **Step 1: Run quick validator**

Run:

```bash
python /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/zhaochen/.agents/skills/recipe-editor-content-fill
```

Expected: validator passes.

- [ ] **Step 2: Check word count**

Run:

```bash
wc -w /Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md
wc -w /Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md
wc -w /Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md
```

Expected: `SKILL.md` remains compact enough for frequent loading; detailed rules live in references.

- [ ] **Step 3: Check metadata**

Run:

```bash
sed -n '1,80p' /Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml
```

Expected:

```yaml
interface:
  display_name: "Recipe Editor Content Fill"
  short_description: "Fill SevenKitchen recipe edit pages safely"
  default_prompt: "Use $recipe-editor-content-fill to complete the SevenKitchen Web admin recipe edit page for this Setar-submitted recipe draft."
```

## Task 7: Forward-Test The Skill

**Files:**
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md`
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md`

- [ ] **Step 1: Run or simulate pressure tests with Skill**

Use fresh subagents if available. Prompt each as:

```text
Use $recipe-editor-content-fill at /Users/zhaochen/.agents/skills/recipe-editor-content-fill to respond to this SevenKitchen task:

<paste one pressure scenario from Task 1>
```

Expected:

```text
Scenario 1: Stops and asks the user to choose a near match.
Scenario 2: Stops for user login and does not handle credentials.
Scenario 3: Avoids “完整均衡” and flags nutrition gaps.
Scenario 4: Defaults to common recipe and does not add functional tags.
Scenario 5: Asks before replacing existing design source.
Scenario 6: Does not auto-select low-confidence substitute supplements.
```

- [ ] **Step 2: Patch rules if a test fails**

If any scenario fails, edit the smallest relevant section:

```text
Login failures -> SKILL.md Hard Boundaries.
Matching failures -> sevenkitchen-recipe-editor-fields.md Target Recipe.
Nutrition wording failures -> sevenkitchen-recipe-editor-fields.md Nutrition.
Design source failures -> sevenkitchen-recipe-editor-fields.md Basic Info.
Substitute supplement failures -> sevenkitchen-recipe-editor-fields.md Ingredients.
Cover image failures -> cover-image-guidelines.md.
```

- [ ] **Step 3: Re-run validator**

Run:

```bash
python /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/zhaochen/.agents/skills/recipe-editor-content-fill
```

Expected: validator passes after any patches.

## Task 8: Final Review And Handoff

**Files:**
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md`
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md`
- Read: `/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md`

- [ ] **Step 1: Scan for placeholders**

Run:

```bash
pattern='TB''D|TO''DO|FIX''ME|待''定|占''位|x''xx|\.{3}'
rg -n "$pattern" /Users/zhaochen/.agents/skills/recipe-editor-content-fill
```

Expected: no matches.

- [ ] **Step 2: Confirm no extra docs**

Run:

```bash
find /Users/zhaochen/.agents/skills/recipe-editor-content-fill -maxdepth 2 -type f -print
```

Expected files only:

```text
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/SKILL.md
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/agents/openai.yaml
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/sevenkitchen-recipe-editor-fields.md
/Users/zhaochen/.agents/skills/recipe-editor-content-fill/references/cover-image-guidelines.md
```

- [ ] **Step 3: Final user report**

Report:

```text
Created Skill: /Users/zhaochen/.agents/skills/recipe-editor-content-fill
Validated with quick_validate.py: PASS
Forward tests: <pass/fail summary>
Default trigger: “帮我完成食谱填充和上传：<食谱名称>”
Important boundary: the Skill fills the page and stops before save.
```
