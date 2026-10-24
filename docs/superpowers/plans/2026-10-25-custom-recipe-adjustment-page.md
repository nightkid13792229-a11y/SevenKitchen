# 食谱调整页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「售后与问题反馈」页改成只做食谱调整的「食谱调整」页，支持多份食谱分 Tab 填写、每份独立附件、撤销/额度/历史，并打通后台按份查看。

**Architecture:** 后端仍用 `CustomRecipeAftersale` 一张表；`recipeRequests` JSON 扩展每份 `photos`，顶层 `photos` 存并集。小程序页重写为“调整哪个食谱？”大容器 + Tab；进入时从 `recipeId` 默认激活对应 Tab。后台订单中心按份显示说明与附件；设计器联动留第二阶段。

**Tech Stack:** NestJS + Prisma + Jest；uni-app Vue 3 + vitest；admin-web Vue 3 + Element Plus。

**Spec:** `docs/superpowers/specs/2026-10-24-custom-recipe-adjustment-design.md`

## Global Constraints

- 一次只能有一条未处理完的 `ADJUST_RECIPE`；多份一起提交只算 1 次。
- 顾客撤回、商家驳回都不占调整次数。
- 额度/历史/未处理判断只统计 `ADJUST_RECIPE`。
- 每份附件独立；删除附件必须同时删除 COS 对象。
- 只有文字非空才能提交；附件不作门禁。
- 小程序只上传体验版，不发布正式版；后端/admin 可部署。
- 小程序构建目录：`miniapp/dist/build/mp-weixin`。

---

### Task 1: 售后额度/列表只统计食谱调整

**Files:**
- Modify: `backend/src/application/custom-recipe/custom-recipe-aftersale.service.ts`
- Test: `backend/tests/application/custom-recipe/aftersale-quota.spec.ts`

**Interfaces:**
- Produces: `getQuota` 只统计 `type='ADJUST_RECIPE'`；`usedCount` 排除 `REJECTED`；`hasOpen` 只看调整类；`listForCustomer` 只返回调整类，并加 `customerStatusLabel`。

- [ ] **Step 1: 写失败测试**
  - 额度 rows 增加 `type`，默认 `ADJUST_RECIPE`；新增：一条 `QUESTION` 不占次数/不 block；两条 `REJECTED`（一条撤回、一条商家驳回）不占次数；`listForCustomer` 过滤非调整类；撤回显示“已撤销”。
- [ ] **Step 2: 运行失败**
  - `npx jest tests/application/custom-recipe/aftersale-quota.spec.ts --runInBand`
- [ ] **Step 3: 实现**
  - `getQuota` 的 `findMany` select 加 `type`，过滤 `type==='ADJUST_RECIPE'`；`usedCount` 排除 `REJECTED`；`hasOpen` 只看调整类。
  - `listForCustomer` 查询加 `where: { orderId, type: 'ADJUST_RECIPE' }`；响应加 `customerStatusLabel`（`RESOLVED`→已交付，撤回→已撤销，其它驳回→未受理，其余用现有 label）。
  - `create` 的 open 检查加 `type: 'ADJUST_RECIPE'`。
- [ ] **Step 4: 跑测试**
- [ ] **Step 5: 提交**

### Task 2: 每份附件 + 附件删除连 COS

**Files:**
- Modify: `backend/src/application/custom-recipe/custom-recipe-aftersale.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`（如签名受影响）
- Test: `backend/tests/controllers/custom-recipe.customer-aftersale.spec.ts`、新增附件删除 spec

**Interfaces:**
- `CustomRecipeAftersaleRecipeRequest = { deliveryItemId; description; photos: string[] }`
- `create` 接受 `recipeRequests[].photos`，顶层 `photos` 为并集。
- `uploadAttachment` 响应加 `id`。
- `CustomRecipeService.deleteAttachment(id, customerId?)`：校验归属 → 删 COS → 删记录；COS 失败不删记录。

- [ ] **Step 1: 写失败测试**
  - 提交 2 份，每份 photos 不同：服务层返回每份 photos；顶层 photos 为并集。
  - 上传响应包含 id。
  - 删除：非本人订单抛 Forbidden；COS 失败不删 DB；成功删 COS + DB。
- [ ] **Step 2: 运行失败**
- [ ] **Step 3: 实现**
  - `parseRecipeRequestsShape` 加 `photos`；校验为字符串数组；`readRecipeRequests` 读 photos。
  - `create` 每份 photos；顶层 `photos` 去重并集。
  - `uploadAttachment` 响应加 `id`。
  - `CustomRecipeService.deleteAttachment` 查附件+订单归属，`cosService.deleteImageByUrl` 后删记录；后台调用不传 customerId。
  - 顾客控制器加 `DELETE attachments/:attachmentId`，传 `req.user.userId`。
- [ ] **Step 4: 跑测试**
- [ ] **Step 5: 提交**

### Task 3: 小程序 API + DM 工具

**Files:**
- Modify: `miniapp/src/api/custom-recipe.ts`
- Create: `miniapp/src/utils/nutrition-dm.ts`
- Test: `miniapp/src/utils/nutrition-dm.spec.ts`

**Interfaces:**
- `AftersaleRecipeRequest` 加 `photos?: string[]`。
- `AftersaleItem` 加 `customerStatusLabel?: string`。
- `uploadAftersaleAttachment` 返回 `{ id, url, fileName, fileSize, fileType }`，兼容 `fileUrl`。
- `deleteAftersaleAttachment(id)` 调用 DELETE。
- `toDryMatterMacros(macros)` 返回 `{ protein, fat, ash, fiber, carbohydrate }`（DM%，缺项 null）。

- [ ] **Step 1: 写失败测试**
  - DM：水分 60、蛋白 20 → 蛋白 50% DM；水分 0/缺 → null。
- [ ] **Step 2: 运行失败**
- [ ] **Step 3: 实现**
  - API 类型/上传/删除；DM helper。
- [ ] **Step 4: 跑测试**
- [ ] **Step 5: 提交**

### Task 4: 重写食谱调整页

**Files:**
- Rewrite: `miniapp/src/pages/custom-recipe/aftersale.vue`
- Modify: `miniapp/src/pages.json`（标题“食谱调整”）
- Modify: `miniapp/src/pages/custom-recipe/order-detail.vue`（按钮“调整食谱/查看进展”）
- Test: `miniapp/src/pages/custom-recipe/aftersale.regression.spec.ts`（重写/新增）

**Interfaces:**
- 页面读取 `orderId`、`recipeId`、`scene=refund`。
- 容器 Tab：`activeItemId`；每份 `{ description, attachments: {id,url,name,size,type}[] }`。
- 提交：有文字的份 → `deliveryItemIds` + `recipeRequests`（含 photos）；顶层 `description` 汇总、`photos` 并集。
- 进入时可提交且 `recipeId` 命中 → 默认 `activeItemId` 为该份。
- 退款场景只显示占位 + 企业微信。

- [ ] **Step 1: 写页面结构/关键行为测试**（标题、容器、Tab、默认选中、空文字禁用、每份附件、已交付总结/最新入口、退款占位）
- [ ] **Step 2: 实现页面**
  - 加载：`fetchAftersales` + `fetchOrderDetail` + `fetchDelivery`，映射每份 content。
  - 额度条、历史卡、大容器、Tab、摘要（DM）、表单、附件底部弹窗、固定栏、撤销、提交。
  - 附件上传/删除/预览；每份独立列表。
  - 已交付 `handleNote` + 最新食谱入口。
- [ ] **Step 3: 跑测试 + 构建**
- [ ] **Step 4: 提交**

### Task 5: 后台按份显示附件

**Files:**
- Modify: `admin-web/src/api/customRecipe.ts`（`AdminAftersaleRecipeRequest.photos`）
- Modify: `admin-web/src/utils/customRecipeAftersale.ts`（`requestPhotos`）
- Modify: `admin-web/src/views/CustomRecipes/AftersaleList.vue`
- Test: `admin-web/src/utils/__tests__/customRecipeAftersale.spec.ts`

- [ ] **Step 1: 写/改测试**
- [ ] **Step 2: 实现按份缩略图**
- [ ] **Step 3: 跑测试/构建**
- [ ] **Step 4: 提交**

### Task 6: 全量验证与体验版

- [ ] 后端 Jest（相关 spec + tsc 过滤）
- [ ] 小程序 vitest + `npm run build:mp-weixin`
- [ ] admin-web 构建
- [ ] 合并 main、推送；按规则部署后端/admin（如改动）
- [ ] 上传体验版 `2026.10.25.x`
- [ ] 更新第二阶段待办勾选状态

## Review Focus

- 多份订单从某份卡进入：可提交时默认激活该份，不能退回第一份。
- 只写一份 / 写多份：提交份数、次数只扣 1。
- 每份附件：切换/删除/提交后后台看到的是对的份；删除后 COS 不再可访问。
- 旧记录没有每份 photos：回退整单 photos，不报错。
- 旧订单单份交付：不传 `deliveryItemIds`，请求仍合法。
