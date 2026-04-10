# Dog Avatar Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared fixed `1:1` avatar crop flow to the dog-create page and dog-profile-overview page before preview or upload.

**Architecture:** Introduce a reusable cropper overlay component plus a pure crop math utility. The create page stores the cropped temp file for post-create upload, while the overview page uses the cropped temp file as an optimistic local preview before immediate upload.

**Tech Stack:** Vue 3, uni-app, TypeScript, Vitest, WeChat Mini Program canvas APIs.

---

### Task 1: Lock crop math and integration expectations with tests

**Files:**
- Create: `miniapp/src/utils/dog-avatar-crop.spec.ts`
- Create: `miniapp/src/components/dog-profile/DogAvatarCropper.regression.spec.ts`
- Modify: `miniapp/src/pages/dog-create.regression.spec.ts`
- Modify: `miniapp/src/pages/dog-profile-overview.regression.spec.ts`

- [ ] Add a failing utility test for cover-layout initialization, drag clamping, and export-rect calculation.
- [ ] Add a failing regression test that expects a reusable `DogAvatarCropper.vue` file and crop-specific touch/canvas hooks.
- [ ] Add failing page regression assertions that expect both pages to open the cropper before updating preview/upload flow.
- [ ] Run the targeted Vitest files and confirm they fail for the missing crop flow.

### Task 2: Implement shared crop utility and reusable cropper component

**Files:**
- Create: `miniapp/src/utils/dog-avatar-crop.ts`
- Create: `miniapp/src/components/dog-profile/DogAvatarCropper.vue`

- [ ] Implement the pure crop utility for initial layout, clamping, and export rectangle calculation.
- [ ] Implement the full-screen cropper overlay with drag, pinch zoom, dimmed outside-frame masks, reset action, and canvas export.
- [ ] Wire the component to emit `close`, `confirm`, and `error` events.
- [ ] Run the new utility/component-targeted tests until green.

### Task 3: Connect the crop flow to dog-create and dog-profile-overview

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/pages/dog-profile-overview/index.vue`
- Modify: `miniapp/src/utils/dog-avatar.ts`

- [ ] Update the create page to open the cropper after `chooseImage`, store the cropped temp path, and keep draft/local preview behavior.
- [ ] Update the overview page to open the cropper after `chooseImage`, show a local cropped preview during upload, and roll back on upload failure.
- [ ] Reuse `resolveDogAvatarSrc` preview precedence instead of duplicating avatar resolution logic.
- [ ] Run the targeted page regression tests until green.

### Task 4: Verify the miniapp avatar crop flow end to end

**Files:**
- Test: `miniapp/src/utils/dog-avatar-crop.spec.ts`
- Test: `miniapp/src/components/dog-profile/DogAvatarCropper.regression.spec.ts`
- Test: `miniapp/src/pages/dog-create.regression.spec.ts`
- Test: `miniapp/src/pages/dog-profile-overview.regression.spec.ts`

- [ ] Run the focused avatar/crop regression slice and confirm all crop-related tests pass.
- [ ] Run the full miniapp test suite and confirm no regressions.
- [ ] Run `pnpm build:mp-weixin`.
- [ ] Sync `miniapp/dist/build/mp-weixin` into `/Users/zhaochen/Documents/SevenKitchen-miniapp-preview`.
