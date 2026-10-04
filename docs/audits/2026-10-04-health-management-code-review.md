# 健康管理 · 代码审查报告

**审查日期**：2026-10-04
**审查对象**：`feature/health-management` 分支（worktree: `.worktrees/health-management`）
**审查版本**：`ef9f0e54c86cf1ba6d09371da80eee6e51fd8c8d`（领先 release 分支 98 个提交）
**审查范围**：健康管理模块全部代码 —— 后端 18 个服务/控制器、12 个 DTO、6 张表；小程序 4 个健康页面、3 个健康组件、8 个健康工具模块；后台狗狗健康页
**审查维度**：隐私与越权、AI 边界与安全、业务算法正确性、数据与契约、健壮性、跨模块接缝、可维护性、测试可信度
**交付性质**：只读审查，**未修改任何业务代码**

---

## 一、一句话结论

> **这个模块的工程素养明显高于项目平均水平，但它有两条互相矛盾的"人设"。**
>
> **做得好的地方是真功夫**：健康记录四类共 21 个增删改查方法**无一遗漏**都做了归属校验；数据库字段命名规范**100% 达标**（8 个维度里唯一满分的一项）；AI 的红线不只写在提示词里，出口还有"出处必须真实存在"的强校验和越界措辞降级；分享用"生成时定稿的快照"而非实时档案，报告原件走服务端转发，使"停止分享"真的能撤销；**跨模块依赖里零循环引用**；**没有发现任何"绕过顾客确认直接落库"的 AI 路径**；"过敏 ≠ 不爱吃"这条安全底线在数据层和提示词层始终分开，没有被破坏。
>
> **但同时存在 12 个 P0**，其中最危险的一条与最扎实的一条恰好是同一个东西：权限校验做到了 21/21 全覆盖，**却一行测试都没有** —— 把它整个删掉，228 项后端测试照样全绿。
>
> **最需要知道的四件事**：
> 1. **测试全绿与严重缺陷并存**：后端 228 项、小程序 1337 项**全部通过**，上述 P0 一个都没挡住；
> 2. **失败的方式是"沉默"**：化验数据被抹掉、报告原件删不掉、疫苗提醒失效、幼犬少打一针却显示"已完成" —— 都不会报错，用户和运营都察觉不到；
> 3. **有的承诺根本没送到用户面前**："分享给医生"整块功能做完了却**没有任何入口**；"疫苗到期提醒"接口是空壳却返回"订阅成功"；
> 4. **根因集中在三处**：用户可自由填写的字符串（图片地址）没做校验；"谁能看什么"被当成了请求参数而不是权限；**"改了一边忘了另一边"**（过敏的读取修好了、写入那条路还漏着）。

---

## 二、问题总览

| 编号 | 严重度 | 问题 | 位置 |
|---|---|---|---|
| P0-1 | 🔴 P0 | 分享附件转发可被利用读取服务器内网（SSRF） | `shared-health.controller.ts:67` |
| P0-2 | 🔴 P0 | 三个"按 key 删文件"的接口无归属校验，登录即可删桶内任意对象 | `health-upload.controller.ts:152`、`dogs.controller.ts:1734`、`dogs.controller.ts:1781` |
| P0-3 | 🔴 P0 | 顾客改一个 URL 参数即可拿到"未审核"的专业内容，并绕过功能开关（**两个接口都有**） | `health-analysis.controller.ts:71`、`vaccine-plan.controller.ts:71` |
| P1-1 | 🟠 P1 | 分享页承诺的"取消的内容不会分享"，对报告原件不生效 | `health-share.service.ts:371-384` |
| P1-2 | 🟠 P1 | 识别失败页的原图被静默删除，档案缺页而用户不知道 | `HealthDocumentScan.vue:557,591` |
| P1-3 | 🟠 P1 | **删记录时报告原件永远删不掉** —— 引用检查把"正在删的这条记录自己"算成了引用方 | `health.service.ts:97-113` + 四处调用顺序 |
| P1-4 | 🟠 P1 | 上传大小限制是"马后炮"，超大文件先吃内存再被拒 | `health-upload.controller.ts:97` |
| P1-5 | 🟠 P1 | 小程序"回归测试"多数是源码文本断言，关键行为改坏不会报警 | 64/113 个测试文件 |
| P1-6 | 🟠 P1 | 归属校验（越权）**零测试** —— 删掉它 228 项测试照样全绿 | `health.service.ts:151-524` |
| P1-7 | 🟠 P1 | 测试不做类型检查，历史上已 3 次让编译错误进主干 | `tsconfig.json:7` |
| P1-8 | 🟠 P1 | AI 识别接口无限流无去重，单次请求最多 4 次付费调用，可被一个顾客无限刷 | `health-upload.controller.ts:182-226` |
| P1-9 | 🟠 P1 | 员工端"健康更新"等查询无分页无上限，随平台规模恶化 | `staff-dog-health.service.ts:304-334` |
| P0-4 | 🔴 P0 | 旧的「档案编辑」接口会把化验/医嘱/体征抹掉，并把病史状态改成"已康复" | `dogs.controller.ts:421-468` |
| P0-5 | 🔴 P0 | 疫苗记录部分更新会把「下次到期日」清空，疫苗提醒随之失效 | `health.service.ts:206-217` |
| P0-6 | 🔴 P0 | 体重计划接口**零校验**（DTO 是 interface 而非 class，且未挂校验管道） | `weight-goal-plan.controller.ts:33-115` |
| P0-7 | 🔴 P0 | **顾客在定制单里写的过敏原，有一条路完全不进配方生成**（AI 向导取定制单时带了口味、没带过敏） | `recipe-designer.service.ts:8249-8259` |
| P0-8 | 🔴 P0 | 幼犬只打 2 针被显示"三针全部完成"（可导致免疫空窗） | `immunization-schedule.ts:245-259, 311-327` |
| P0-9 | 🔴 P0 | 第三针按规范在 16 周龄后接种，被判"逾期"，提示家长补打 | `immunization-schedule.ts:238-265, 329-348` |
| P0-10 | 🔴 P0 | 下单时填的**饮食偏好被写回健康档案**，超出同意书范围（合规），且顾客此后无法删除 | `custom-recipe.service.ts:1330-1341` |
| P0-11 | 🔴 P0 | **"分享给医生"整个功能在小程序里没有任何入口**，是死代码 | 全仓零跳转 |
| P0-12 | 🔴 P0 | 登录态失效时前端收不到信号：token 永不清除，保存/加载永久失败且提示英文 | `unauthorized-exception.filter.ts:26` + `api.ts:345` |
| P1-10 | 🟠 P1 | 三个 update 方法用 `?? null` 覆盖可选字段，未传即清空 | `health.service.ts:211,318-322,418-426` |
| P1-11 | 🟠 P1 | 「备注」在档案编辑路径被写进了「检查结论」列 | `dogs.controller.ts:490-492` |
| P1-12 | 🟠 P1 | 医生打开分享里的 PDF 报告原件**必然打不开**，且静默白屏 | `shared-health/index.vue:243-252` |
| P1-13 | 🟠 P1 | 自动保存的排队队列在切标签/离开页面时被丢弃 → **静默少存一条修改** | `HealthRecordsSection.vue:686-714` |
| P1-14 | 🟠 P1 | 保存期间**所有**输入框被禁用，与代码注释"正存着也照样改"正好相反 | `HealthRecordsSection.vue:215-225` |
| P1-15 | 🟠 P1 | 离开页面时对"还有草稿没存上"没有任何保护，也没有本地兜底 | `dog-profile-health/index.vue:520-526` |
| P1-16 | 🟠 P1 | 分享列表读取失败时整块消失 → 主人**无法撤销仍在生效的病历链接** | `share.vue:199-213` |
| P1-17 | 🟠 P1 | 病史关键词是**单字正则**且不做否定识别，健康狗被判成病犬方向 | `recipe-designer.service.ts:8702-8798` |
| P1-18 | 🟠 P1 | 过敏/病史变更后，已生成的 AI 方案与设计草稿**不失效也无提示** | `schema.prisma:2756-2796` |
| P1-19 | 🟠 P1 | 营养师在后台**看不到**顾客上传的过敏报告与疫苗本原件 | `staff-dog-health.service.ts:139-161` |
| P1-20 | 🟠 P1 | 营养师的"健康标签纠错"**不影响** AI 健康分析；后台标签也与设计器不一致 | `health-analysis.service.ts:547-607` |
| P1-21 | 🟠 P1 | 后台"完整健康档案"实际是顾客侧摘要，就诊/体检**各只显示 5 条**且无提示 | `health-timeline.service.ts:401-407` |
| P2-1 | 🟡 P2 | 分享的"逐项取消"开关 fail-open：传空数组 = 全给 | `health-share.service.ts:337-349` |
| P2-2 | 🟡 P2 | 疫苗计划"完整程序表"注释声明不对顾客开放，实际敞开 | `vaccine-plan.controller.ts:76` |
| P2-3 | 🟡 P2 | 员工账号可读取任意顾客健康档案，并可整体覆盖健康记录 | `dogs.controller.ts:414-419` |
| P2-4 | 🟡 P2 | 报告原件是公开直链，日志里还写着这些地址 | `tencent-cos.service.ts:120-128` |
| P2-5 | 🟡 P2 | 健康模块自造日期工具，未遵守项目时区规范（非 UTC+8 环境差一天） | `immunization-schedule.ts:161-189` |
| P2-6 | 🟡 P2 | 分享令牌明文落库、快照无清理、创建无上限 | `health-share.service.ts:136-145` |
| ⚠️ 域外 | 🔴 严重 | **发现于本次审查、但不属于健康模块**：`staff-kitchen` 控制器完全无鉴权 | `staff-kitchen.controller.ts` |

---

## 三、P0 问题详述

> 本节含 P0-1 ~ P0-3（隐私越权 / AI 维度）。**P0-4 ~ P0-6（数据与契约维度）见第六节。**

### P0-1 · 分享附件转发可被利用读取服务器内网（SSRF）

**位置**：`backend/src/interfaces/controllers/shared-health.controller.ts:67`
**关联**：`backend/src/interfaces/dto/health/create-medical-record.dto.ts:80-83`
**置信度**：高（代码路径完整，未实测外网请求）

**证据**：

```ts
// shared-health.controller.ts:60-73
const attachment = await this.shareService.resolveAttachmentSource(token, Number(index));
// 转发而不是 302 重定向：重定向会把 COS 直链暴露给浏览器
const upstream = await fetch(attachment.sourceUrl);
if (!upstream.ok) {
  res.status(502).json({ code: 502, message: '附件读取失败', data: null });
  return;
}
const buffer = Buffer.from(await upstream.arrayBuffer());
```

`attachment.sourceUrl` 来自分享快照，快照的附件来自记录表的 `attachments` 字段。而该字段**没有任何地址校验**：

```ts
// create-medical-record.dto.ts:80-83
@IsOptional()
@IsArray()
@IsString({ each: true })
attachments?: string[];
```

落库时原样保存（`health.service.ts:365`：`attachments: dto.attachments || []`），`collectAttachments`（`health-share.service.ts:269-304`）也只是把它们搬进快照。

**触发链**（全部为顾客可自行完成的合法调用）：

1. `POST /api/v1/dogs/{自己的狗}/medical-records`，body 里 `attachments: ["http://<内网地址>/..."]`
2. `POST /api/v1/dogs/{自己的狗}/health/shares`，`contentMode: "FILES"`
3. `GET /api/v1/shared-health/{token}/attachment/0` —— **该接口故意免登录**

服务器于是替调用者请求内网地址，并把响应体原样返回。

**后果**：在腾讯云上，这条路的常见终点是实例元数据服务，可换取该实例角色的临时凭据。此外 `fetch` **无超时**、`arrayBuffer()` **无大小上限**，同一个口子也可用于打满内存。

**建议**：
1. 附件地址落库时校验：必须是本bucket 的合法对象地址（域名白名单 + 路径前缀），不符合的直接拒绝；
2. 转发时不要把任意 URL 交给 `fetch` —— 从快照里只保存"对象 key"，由服务端用固定域名重新拼；
3. 补 `AbortSignal.timeout()` 与响应体大小上限。

---

### P0-2 · 三个"按 key 删文件"的接口无归属校验，登录即可删桶内任意对象

**位置**：
- `backend/src/interfaces/controllers/health-upload.controller.ts:152-171` —— `DELETE /api/v1/health/attachments`
- `backend/src/interfaces/controllers/dogs.controller.ts:1734-1752` —— `DELETE /api/v1/dogs/medical-records/attachments`
- `backend/src/interfaces/controllers/dogs.controller.ts:1781-1799` —— `DELETE /api/v1/dogs/checkup-records/attachments`
- 落点：`backend/src/infrastructure/services/tencent-cos.service.ts:210-246`

**置信度**：高（三处代码一致，均无任何归属或前缀校验）

**证据**（三处结构完全相同，以第一处为例）：

```ts
// health-upload.controller.ts:152-163
async deleteAllergyAttachment(@Body() dto: { key: string }) {
  if (!dto.key) { throw new BadRequestException('缺少文件Key'); }
  console.log('[HealthUpload] Deleting allergy attachment:', dto.key);
  try {
    await this.cosService.deleteImage(dto.key);      // key 原样透传，只判断非空
    return ApiResponseDto.success(null, '删除成功');
```

类级只有 `@UseGuards(AuthGuard)` —— 只能证明"是登录用户"，不能证明"这个文件是他的"。作为对照，记录删除路径（`health.service.ts:97-113`）**有**引用检查，这三处**没有**，标准不一致。

**触发条件**：key 不是秘密 —— 它以明文形式存在于图片 URL 中（`https://<CDN>/medical-reports/temp/1750...-a1b2c3d4.jpg`），顾客在小程序里就能看到自己商品图、食谱图、评价图的地址。取出路径部分提交即可。

**后果**：不可恢复地删除他人的医疗报告原件、疫苗本原图，或商品图 / 食谱图 / 评价图等任何同桶资源。删除结果一律返回"删除成功"，被删方与运营方都无从察觉。

**建议**：
1. 改成"按记录 id 删附件"，由服务端自己算出 key 并校验记录归属；
2. 至少校验 key 前缀必须属于该用户 / 该模块；
3. 补操作日志与限流。

---

> ### ⚠️ 误报更正（原 P0-2：经"删记录触发清理"实现任意删除）
>
> 初审时我曾判定：顾客往记录的 `attachments` 里填任意地址，再删除该记录，即可借 `purgeRecordAttachments` 删掉桶内任意文件。
> **经复核，这条路径不成立，属于误报。** 原因见 P1-3：引用检查会把"正在被删的这条记录自己"算进去，导致清理逻辑**永远不会执行**，`deleteImage` 根本到不了。
> 保留这段记录是为了避免他人据此行动 —— 真正的任意删除入口是上面那三个 key 接口。

---

### P0-3 · 顾客改一个 URL 参数即可绕过知识审核门禁与功能开关

**位置**：`backend/src/interfaces/controllers/health-analysis.controller.ts:71`
**关联**：`health-analysis.service.ts:216-222`（开关判定）、`:415-436`（知识上下文组装）、`recipe-designer/knowledge-base.service.ts:181-196`（受众过滤）
**置信度**：高（已逐段核对完整调用链）

**证据**：

```ts
// health-analysis.controller.ts:63-73 —— 受众只看 URL 参数，不看登录身份
@UseGuards(AuthGuard)   // 只有"登录"这一道
async analyze(
  @Param('dogId') dogId: string,
  @Query('audience') audience: string | undefined,
  @CurrentUser() user: RequestUser,
) {
  const data = await this.analysisService.analyze(
    user.customerId, dogId,
    audience === 'staff' ? 'nutritionist' : 'customer',   // ← 问题在这一行
  );
```

```ts
// health-analysis.service.ts —— 功能开关也只拦 customer
if (audience === 'customer' && !this.isCustomerEnabled()) { ... 返回"暂未开放" }
```

```ts
// knowledge-base.service.ts:181-196 —— nutritionist 不过滤审核状态
private filterByAudience(entries, audience) {
  if (audience === 'nutritionist') { return entries; }      // ← 全量放行
  return entries.filter((entry) => entry.reviewStatus === 'APPROVED');
}
```

真正守门的是后台接口 `analyzeForStaff()`（受 `StaffGuard` 保护），顾客侧这条分支**没有任何角色校验**。

**当前实际暴露面（已核实）**：

| 项目 | 数量 |
|---|---|
| 知识条目总数 | 387 |
| 带 `reviewStatus: 'APPROVED'` | 201 |
| **无审核标记（按设计对顾客隐藏）** | **186** |

`?audience=staff` 会让这 186 条未审核条目直接进入提示词，产出的分析返回给顾客。

**后果**：项目约定"新条目一律先写 PENDING_REVIEW；**改内容就退回 PENDING_REVIEW**，顾客侧立刻看不到"——这正是兽医审核门禁的意义。目前 186 条未审内容**此刻就能被顾客读到**；同一个参数还能绕过 `HEALTH_ANALYSIS` 功能开关（即使准备关闭顾客侧，改一个词照样能用）。

**建议**：
1. 受众必须由服务端根据登录身份判定，**不允许**由客户端指定；staff 走独立的、受 `StaffGuard` 保护的接口；
2. 在服务层而非控制器层做角色判定，避免后续新增入口再次漏掉。

---

## 四、P1 问题详述

### P1-1 · 分享页承诺的"取消的内容不会分享"，对报告原件不生效

**位置**：`backend/src/application/health/health-share.service.ts:371-384`
**对照**：`miniapp/src/pages/dog-health/share.vue:34-36` 的界面承诺
**置信度**：高

后端的分区过滤只作用于**文字摘要**：

```ts
// health-share.service.ts:371-384
if (picked.has('allergies')) summaryOut.allergies = summary.allergies ?? []
if (picked.has('visits'))    summaryOut.recentVisits = summary.recentVisits ?? []
...
// 附件不看 sections，只看 contentMode
const attachments =
  contentMode === 'FILES' || contentMode === 'BOTH' ? input.attachments || [] : [];
```

而附件是在 `createShare` 里**全量**收集的（`collectAttachments(dogId)` 取该狗**所有**就诊与体检记录的全部附件，`:269-304`），与顾客勾掉了哪些分区无关。

**界面却明确承诺**（`share.vue:34-36`）：

> 默认全部给出去。不想给的那一项，点一下取消即可 —— 取消的内容**不会**出现在分享里。

**触发条件**：顾客选择默认的"合并"形态（推荐项），然后取消勾选"最近就诊""最近体检"，以为这两项不给出去 —— 实际上这两次就诊/体检的化验单、B 超照片**照样**在分享里，且可被下载。

**为什么测试没挡住**：`tests/application/health/health-share.service.spec.ts` 的用例只断言了摘要，附件只在 `contentMode: 'SUMMARY'` 下断言为空（`:203`），从未测过"非 SUMMARY 形态 + 取消分区"这个组合 —— 等于把错误行为固化成了正确。

**建议**：`collectAttachments` 接受分区参数，取消勾选 `visits`/`checkups` 时对应记录的原件一并排除；或在界面上如实说明"报告原件不受上面勾选影响"。

---

### P1-2 · 识别失败页的原图被静默删除，档案缺页而用户不知道

**位置**：`miniapp/src/components/dog-profile/HealthDocumentScan.vue:557`、`:591`
**对照**：`miniapp/src/utils/health-records.ts:1596-1597` 的既定契约
**置信度**：高

```ts
// 只有读出内容的那页才把原图挂到草稿上（:544-546）
const bucket = draftsByType.get(imageType) || []
bucket.push(...list.map((draft) => ({ ...draft, attachments: [uploaded.url] })))

// 这张啥也没读出来 → 传上去的图没用了，立刻删掉，别占 COS 空间（:557）
await dropUploadedFile(uploadedUrl)

// 抛错的路径同样删掉（:591）
} catch (error: any) {
  await dropUploadedFile(uploadedUrl)
```

合并工具的既定契约是：

```ts
// health-records.ts:1596-1597
 *   · 附件：每一页的原图都留下，按页序排列、去重
```

**后果**：家长传 7 页、3 页识别失败 → 档案里只留 4 页原图，失败那 3 页的**照片被从仓库删掉**。而这 3 页恰恰是最需要人工核对的（识别不出来往往是因为模糊、遮挡）。界面只提示"第 X 张没能识别"，**不会告诉家长这几页的原图已经没了**，家长会以为档案是完整的。

**定级说明**：本条是数据丢失而非安全漏洞，且用户能看到"没能识别"的提示，故列 P1 而非 P0；但丢失的是医疗凭证原件，建议按高优先级处理。

**建议**：识别失败也要保留原图并挂到"待人工确认"的草稿上；确实要清理时，至少先明确告知用户，或延后到用户确认之后再清理。

---

### P1-3 · 删记录时报告原件永远删不掉（引用检查把"自己"算成了引用方）

**位置**：`backend/src/application/health/health.service.ts:97-113`（引用检查）、`:120-143`（清理逻辑）、四处调用点 `:232`、`:337`、`:441`、`:521`
**置信度**：高（必现，非概率问题）

**证据**：四个删除方法的顺序完全一致 —— **先清理附件，再删记录**：

```ts
// health.service.ts:439-443（其余三处同构）
async deleteMedicalRecord(id: string, customerId: string): Promise<void> {
  const record = await this.medicalRecordRepo.findById(id);
  if (!record) { throw new NotFoundException('Medical record not found'); }
  await this.verifyDogOwnership(record.dogId, customerId);
  await this.purgeRecordAttachments(record.attachments);   // ← 此刻本行还在库里
  await this.medicalRecordRepo.delete(id);                 // ← 之后才删
```

而"是否仍被引用"会查这张表本身：

```ts
// health.service.ts:98-112
const [medical, checkup, allergy, vaccine, shares] = await Promise.all([
  this.prisma.medicalRecord.count({ where: { attachments: { has: url } } }),
  ...
]);
return medical + checkup + allergy + vaccine + shares > 0;
```

**正在被删除的这条记录，此刻仍然存在于表中，且它的 `attachments` 必然包含 `url`** → 计数恒 ≥ 1 → 判定"仍被引用" → `continue` 跳过删除。

**后果**：家长删掉了健康记录，**照片仍然留在公开可读的 CDN 上，永久可访问** —— 这与"删记录就是不想留"的用户预期直接冲突，属医疗隐私问题；同时存储只增不减。代码注释（`health.service.ts:139`）声称有"每日清理任务兜底"，但**该任务不存在**（全项目定时任务只有财务与订单两个调度器，都不碰 COS；只有一个需手工执行的一次性脚本）。

此外顺序本身也不安全：一旦先删文件、后删行失败，就会变成"记录还在、图没了"且原图不可恢复。

**为什么测试没挡住**：`tests/application/health/vaccine-attachments.spec.ts:71-79` 把四张表的 `count` 全部 mock 成 `0`：

```ts
const prisma = {
  medicalRecord: { count: jest.fn().mockResolvedValue(0) },
  checkupRecord: { count: jest.fn().mockResolvedValue(0) },
  ...
};
```

这个 mock 在现实中**不可能成立**（表里至少有正在被删的这条）。测试因此长期"通过"，掩盖了清理逻辑从未生效的事实。

**建议**：
1. 顺序改为**先删记录、再清附件**（或清理时排除当前记录 id）；
2. 引用检查补上商品图 / 食谱图 / 评价图等其它引用来源；
3. 补一条"删除后 COS 确实收到删除调用"的行为测试，且 mock 要反映真实计数。

---

### P1-4 · 上传大小限制是"马后炮"

**位置**：`backend/src/interfaces/controllers/health-upload.controller.ts:97`、`:104-107`
**置信度**：高（若生产 nginx 已配 `client_max_body_size`，后果降级，见"待确认"）

```ts
@UseInterceptors(FileInterceptor('file'))   // ← 未传 limits，multer 默认内存存储且不限大小
async uploadHealthImage(@UploadedFile() file: Express.Multer.File) {
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) { throw new BadRequestException('File size exceeds 10MB limit'); }
```

10MB 的检查发生在**整个文件已被读进内存之后**。应当通过 `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })` 前置拦截。
作为对照，同项目其它模块（如 `recipe-designer.controller.ts:157`）**都传了 limits**，只有健康模块漏了。

---

### P1-5 · 小程序"回归测试"多数是源码文本断言，不是行为测试

**位置**：`miniapp/src/pages/dog-profile-health.regression.spec.ts`、`miniapp/src/components/dog-profile/HealthRecordsSection.regression.spec.ts`、`miniapp/src/pages/auto-save.regression.spec.ts`、`miniapp/src/components/dog-profile/document-scan.regression.spec.ts`
**置信度**：高（已核实统计口径）

**证据**：

| 事实 | 数值 |
|---|---|
| 小程序测试文件总数 | 113 |
| 其中靠 `readFileSync` 读源码做 `toContain` 断言的 | **64** |
| `@vue/test-utils` 是否为依赖 | **否**（package.json 中 0 次） |
| 真实挂载组件的测试 | **0** |

```ts
// HealthRecordsSection.regression.spec.ts:36-38 —— 连缩进换行一起断言
expect(source).toContain(
  "const attachmentApiType = computed<HealthRecordType>(() => (\n  currentType.value === 'visit' ? 'allergy' : currentType.value\n))",
)
```

**问题**：这类断言只证明"文件里存在这串字"。字符串出现在注释里也通过；函数被调用但条件写反也通过；`flex-wrap: wrap` 这类样式断言与用户能否正常使用毫无关系。

**已经真实发生过一次**：`b0599692` 加过一条"未保存草稿不跨标签显示"的回归保护，后来 `ce575d02` 把它改成锁"渲染时过滤" —— 因为前一版把**已保存**记录也一起隐藏了（线上三个标签全空）。也就是说，那个 bug 在线上真实存在时，用来防它的测试是**通过**的。

**后果**：实时保存的竞态、重复提交、跨标签草稿归属、多页合并编排 —— 这些改坏了都不会报警。

**建议**：引入 `@vue/test-utils` + happy-dom，给三个核心组件各写 3-5 个真实挂载测试；把源码文本断言降级为"接线检查"并明确标注。

---

### P1-6 · 归属校验（越权）零测试 —— 删掉它 228 项测试照样全绿

**位置**：`backend/src/application/health/health.service.ts:151-524`（21 处 `verifyDogOwnership` 调用）、`:528-539`（实现）
**置信度**：高（已核实）

**证据**：

```
$ grep -rn "verifyDogOwnership" backend/tests/ | wc -l
0
```

`tests/` 里**零引用**。所有相关测试的 dogRepo mock 都是"自己人"：

```ts
// medical-record-fields.spec.ts:90-93
{ findById: jest.fn().mockResolvedValue({ id: DOG_ID, ownerId: CUSTOMER_ID }) } as any,
```

反向对照：`health-timeline.service.spec.ts`、`health-share.service.spec.ts:217-227`、`diet-preference.service.spec.ts` 都**有**越权用例 —— 唯独承载 21 个接口的 `HealthService` 没有。

另外：`tests/controllers/health-records.controller.spec.ts` 文件名像是控制器测试，**实际只测 4 个 DTO 的校验规则**（57 行，只 import DTO，不 import 控制器）：

```ts
describe('Health record DTO compatibility', () => { ...
```

**后果**：任何人删掉或改错这一行，就能读写别人家狗的病史、化验单、过敏记录 —— 而测试不会响。这恰好是本次审查中唯一"做得最好"的一处防护，却没有测试守着。

**建议**：新增 `health-service-ownership.spec.ts`，对 get/update/delete 各写一条 `ownerId: 'someone-else'` → `ForbiddenException`，以及"狗不存在 → 404"。

---

### P1-7 · 测试不做类型检查，历史上已 3 次让编译错误进主干

**位置**：`backend/tsconfig.json:7`（`"isolatedModules": true`）、`backend/package.json`（jest 段无 `globals` 配置，且**无 `typecheck` 脚本**）
**置信度**：高（已核实机制与历史）

**机制**：ts-jest 在 `isolatedModules` 为真时**不创建 LanguageService**，改用 `transpileModule`，即完全跳过类型检查。源码可证：

```js
// backend/node_modules/ts-jest/dist/legacy/compiler/ts-compiler.js:74
if (!this.configSet.isolatedModules) {
    ...this._createLanguageService()...
```

**历史证据**（三条提交说明自述）：

| 提交 | 原文 |
|---|---|
| `3ad25359` | "线上部署的 tsc 比本地 jest 严……结果 nest build 直接失败（TS2345 ×4）" |
| `f1c55c03` | "本地 tsc 之所以通过，是因为这次改动当时还没提交，推上去的版本编译不过、部署失败" |
| `dea8a858` | "导致发布构建失败（我的疏忽）" |

**后果**："测试全绿"被当成了"能构建"。类型层不一致只能等部署脚本卡住才发现 —— 三次都靠"构建失败即不换代码"兜住，没出事，但每次都要多一轮返工。

**建议**：加 `"typecheck": "tsc --noEmit"`（后端）/ `vue-tsc --noEmit`（小程序），并入提交前钩子或 CI。

---

### P1-8 · AI 识别接口无限流无去重，可被单个顾客无限刷

**位置**：`backend/src/interfaces/controllers/health-upload.controller.ts:182-226`、`backend/src/application/health/health-report-extraction.service.ts:750-810`
**置信度**：高（代码路径确定；实际滥用与否需看线上调用日志）

单次识别请求的模型调用次数可以叠加到 **4 次**：视觉模型 A → 失败换视觉模型 B → 再退到 OCR + 文本模型，且 `deepseek-chat.ts` 对"无内容"还会重试一次。同一张图重复提交**不去重**，全项目也没有限流模块。配置里的 `maxConcurrency` 从未被使用，等于没有并发上限。

**后果**：一个顾客可以在短时间内反复提交，把付费模型的调用量放大；这类成本不会像功能 bug 那样暴露，只会体现在账单上。

**建议**：加限流（按用户 + 时间窗）、同图去重（按文件内容哈希缓存识别结果）、给并发设上限。

---

### P1-9 · 员工端"健康更新"接口无分页无上限

**位置**：`backend/src/application/health/staff-dog-health.service.ts:304-334`
**置信度**：中（属"随规模恶化"，当前是否已慢未实测）

一次请求会拉取全平台近 7 天的更新：六张表 `findMany` 均无 `take`、无分页，再用几千个 `dogId` 做 `IN` 查询，结果一次性返回。同类问题也出现在 `health-timeline.service.ts:141-147、227-253` 与 `health-share.service.ts:269-279` —— 单狗记录全量取出，最后才 `slice(0, 100)`。

**建议**：给列表接口补分页；把"先全量再截断"改成数据库层 `take`。

---

## 五、方法、依据与可信度

**做法**：
1. 8 个维度分别由独立审查者深入阅读（合计覆盖约 15,000 行健康相关代码）
2. 每条 P0 / P1 由本人**逐段复核原始代码**后写入本报告，未采信未经核实的结论
3. **复核中推翻了自己的一条结论**：初审曾判定"顾客可通过删除记录触发桶内任意文件删除"（原 P0-2）。复核时发现引用检查会把正在删除的记录自身算作引用方，导致该清理逻辑**从未执行**，攻击路径不成立 —— 已改写为 P0-2（真正的入口是三个 key 接口）与 P1-3（清理逻辑失效）。这条更正是本报告"逐条复核"机制有效的直接证据，也提醒读者：**本报告中未被复核的次级结论仍需谨慎对待**。
3. 亲自运行两套测试取得基准事实

**实跑结果**（2026-10-04，本人亲自执行）：

| 套件 | 命令 | 结果 |
|---|---|---|
| 后端健康相关 | `npx jest tests/application/health tests/controllers/health-records.controller.spec.ts tests/domain/health tests/interfaces/dto/health-record-dto.spec.ts` | **13 套件 / 228 项全通过**，2.7s |
| 小程序全量 | `npx vitest run` | **113 文件 / 1337 项全通过**，5.6s |

> ⚠️ **这两行是本次审查最值得注意的地方：测试全绿，与 6 个 P0 并存。**
>
> 原因不是测试写得少（1400+ 项不算少），而是**测试断言的层次不对**。三个具体证据：
> 1. **64 / 113** 个小程序测试文件靠 `readFileSync` 读源码做字符串断言，**0 个**真实挂载组件（`@vue/test-utils` 根本不是依赖）；
> 2. 承载 21 个接口越权防护的 `verifyDogOwnership`，在 `tests/` 里**零引用**；
> 3. `vaccine-attachments.spec.ts` 把引用计数 mock 成 `0` —— 这个 mock 在现实中不可能成立，于是**一个从未生效的清理逻辑被测试"证明"是对的**（见 P1-3）。
>
> 换句话说：这些测试在回答"函数有没有按我写的那样返回"，而没有回答"**不该发生的事有没有发生**"。
>
> 附带问题：测试套件**不做类型检查**（`tsconfig.json` 的 `isolatedModules: true` 会让 ts-jest 跳过类型检查，项目也没有 `typecheck` 脚本）。历史上已因此 3 次让编译错误进主干，全靠"部署构建失败即不换代码"兜住 —— 详见 P1-7。

**已确认做对、不要改坏的地方**（审查中反复确认）：

- 健康记录四类共 **21 个增删改查方法全部**调用 `verifyDogOwnership`，无一处遗漏
- 分享存的是**生成时定稿的快照**，而非指向档案的引用 —— 因此"逐项取消"可信、"不设有效期"不失控
- 分享出去的附件**不下发真实地址**，由服务端校验令牌后转发，使"停止分享"真的能撤销
- AI 红线的三道防线：提示词写死禁令、**出处必须命中本次上下文**（防编造引用）、越界措辞命中即整段降级
- 分析缓存指纹取自档案内容本身，改档案必然失效；缓存键含用户与狗 → 不串用户
- 发给 AI 的数据**不含**手机号 / openid / 姓名
- 免责声明由前端写死，AI 无法改写
- **数据库命名规范 100% 达标**：9 张健康表每一个列名都符合规范，`dog_id` 全部有索引、全部配 `ON DELETE CASCADE`
- **跨模块零循环依赖**：对 `backend/src` 全部 467 个文件做 import 图环检测，应用层无真实环
- **没有"AI 提取绕过顾客确认直接落库"的路径**：识别服务不依赖数据库，控制器只回传结果，前端有确认闸门
- **"过敏 ≠ 不爱吃"这条安全底线没有被破坏**：过敏与口味在数据层与提示词层始终分开
- **体重记录 → 增减重计划衔接可靠**：称重即触发自动校正，且有双层异常保护
- 饮食偏好的变更历史**不会因并发丢失**（唯一约束兜住，代价是第二次操作报 500）
- 测试范围内**无 `it.skip` / `describe.skip` / `.only`**，也无 `try/catch` 吞断言

---

## 六、其余 P0 问题（数据与契约维度）

### P0-4 · 旧的「档案编辑」接口会抹掉化验数据，并把病史状态改成"已康复"

**位置**：`backend/src/interfaces/controllers/dogs.controller.ts:421-468`（病史）、`:471-516`（体检），触发点 `:365-373`
**置信度**：高

```ts
// dogs.controller.ts:438-452 —— 建档时代的旧结构，2026-10-02 新增的列全部硬编码 null
await this.medicalRecordRepository.create({
  dogId, visitDate,
  chiefComplaint: record.chiefComplaint,
  diagnosis: record.diagnosis || '',
  labValues: null, treatment: null, exams: null, vitals: null,
  medications: [], status: 'RECOVERED', followUpDate: null, veterinarian: null,
  notes: record.notes || null,
  attachments: record.attachments || [],
});
...
for (const record of existingRecords) {
  await this.medicalRecordRepository.delete(record.id);   // ← 无条件全删
}
```

**问题**：先全量删除、再按一个字段更少的**旧结构**重建。`lab_values` / `treatment` / `exams` / `vitals` / `medications` / `follow_up_date` / `veterinarian` 被写死为 null，`status` 强制 `RECOVERED`；记录 id 与 `created_at` 也会变化。

**后果**：顾客拍照识别出的**化验数值、医嘱、体征、用药清单整条抹掉且不可恢复**；"治疗中"的病史变成"已康复"（直接影响食谱设计器与营养师看到的病况）；已分享给医生的链接因记录 id 变化而失效。

**待确认**：该路径是否仍有真实流量（见"待确认"第 6 条）。若有，本条应升级为立即止血。

**建议**：已废弃就下线该路由；若要保留，改成按 id 做差量增删改，不能整表重建。

---

### P0-5 · 疫苗记录部分更新会把「下次到期日」清空

**位置**：`backend/src/application/health/health.service.ts:206-217`、`health.service.ts:315-324`（体检）、`:413-428`（病史）、`:504-508`（过敏）
**置信度**：高

```ts
const updated = await this.vaccineRecordRepo.update(id, {
  vaccineName: dto.vaccineName ?? undefined,
  vaccinationDate: dto.vaccinationDate ? new Date(dto.vaccinationDate) : undefined,
  nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,   // ← 不传 = 写 NULL
  notes: dto.notes ?? null,                                          // ← 不传 = 写 NULL
  status: dto.status ?? undefined,
  attachments: dto.attachments ?? undefined,                         // ← 唯独这个用了正确写法
});
```

DTO 里 `nextDueDate` / `notes` 都是 `@IsOptional()`，语义是"没传 = 不改"；服务层却翻译成了"没传 = 清空"。**同一个方法里 `attachments` 用了 `?? undefined` 并专门写了注释**，说明作者知道这个坑，只是这几处漏了。

`next_due_date` 是疫苗到期提醒（`findUpcoming`）的唯一依据 —— 一旦被清空，提醒静默消失，逾期不再提示。

**当前为何没暴露**：小程序每次都提交全量字段。属"契约已经写错、只是暂时没踩到"。

**建议**：统一改为 `?? undefined`；需要清空时由前端显式传 `null`。

---

### P0-6 · 体重计划接口零校验

**位置**：`backend/src/interfaces/controllers/weight-goal-plan.controller.ts:33-115`
**置信度**：高

```ts
@Controller('api/v1/dogs/:dogId/weight-goal-plan')
@UseGuards(AuthGuard)          // ← 只有鉴权，没有 @UsePipes
```

```ts
// dto/weight-goal-plan/weight-goal-plan.dto.ts —— 是 interface，不是 class
export interface CreateWeightGoalPlanDto { targetWeightKg?: number; intensity?: WeightGoalIntensityKey; ... }
```

class-validator 依赖**运行时类型元数据**，而 interface 在编译后完全消失 → 这些接口实际上**没有任何字段校验**。

**根因**：全局管道被显式关成 `transform: false, whitelist: false`（`main.ts:94-98`）。健康记录那 7 个 controller 各自补了 `@UsePipes(...)` 所以安全，**体重计划这两个漏补**。

**后果**：目前最坏是"改目标体重没生效"（业务层有兜底判断），但任何一次漏判断都会直接变成脏数据，且没有测试能发现。

**建议**：全局恢复 `{ transform: true, whitelist: true }`（需一轮全项目回归），或至少先给这两个 controller 补上。

---

## 七、P0-7 ~ P0-12 详述（跨模块接缝 / 业务算法 / 小程序）

### P0-7 · 顾客在定制单里写的过敏原，有一条路完全不进配方生成

**位置**：`backend/src/application/recipe-designer/recipe-designer.service.ts:8249-8276`、`custom-recipe.service.ts:172-191`、`miniapp/src/pages/custom-recipe/index.vue:1269-1274`
**置信度**：高（已逐段复核）

**证据**：AI 向导读取顾客定制单时，**取了口味，没取过敏**：

```ts
// recipe-designer.service.ts:8252-8259
select: {
  orderId: true,
  targetGoal: true,
  needsHealthManagement: true,
  additionalNotes: true,
  preferredIngredients: true,      // ← 口味带上了
  dislikedIngredients: true,       // ← 口味带上了
  // ← allergies / medicalConditions 不在这里
},
```

而过敏原要进档案，得先过一道开关：

```ts
// custom-recipe.service.ts:173
if (data.syncToHealthProfile) {     // ← false 时，过敏完全不写库
  await this.syncToHealthProfileTx(tx, data.dogId, data.allergies || [], ...)
```

```ts
// miniapp/src/pages/custom-recipe/index.vue:1269-1274
syncToHealthProfile:
  formData.value.enableHealthManagement && formData.value.healthInfoConsent,
```

**触发条件**：顾客在定制单的「过敏」栏填了内容，但**没勾「需要健康管理」或没勾同意书**。这两种情况下订单照常创建，过敏原只存在于 `custom_recipe_order.allergies` —— 而这个字段 AI 侧从来不读。

**后果**：顾客白纸黑字写下的过敏原，在 AI 生成配方、食材推荐、食谱审核**三条路径上全部不可见**。唯一兜底是营养师恰好打开设计面板、恰好滚动到「本次定制单」卡片、恰好逐行读完。

> 这正是项目自己的注释（`allergy-keywords.ts` 头部）定性为"**食品安全级缺陷**"的场景 —— 2026-09-27 修过一次，但那个入口堵上了，这个入口还在。
>
> 对比之下更刺眼：**不影响安全的"口味偏好"被完整带上了，影响安全的"过敏"没带。**

**建议**：把"过敏"与"是否回写档案"解耦 —— AI 侧一律读 `customRecipeOrder.allergies` 并入约束（与偏好的处理方式一致），档案写回仍尊重同意开关。

---

### P0-8 · 幼犬只打 2 针，被显示"三针全部完成"

**位置**：`backend/src/domain/health/immunization-schedule.ts:245-259`（窗口构造）、`:311-327`（匹配逻辑）
**置信度**：高（**已实跑复现**）

**根因**：相邻两针的窗口**首尾相接**，且同一条记录可以被多个步骤重复认领。

```ts
// :246-249 每针窗口 = [cursor, cursor+4周]
const windowEnd = laterOf(earlierOf(addWeeks(cursor, intervalWeeksMax), finish), cursor);
// :258 下一针直接从上一针的右端点开始 → 窗口首尾重合
cursor = addWeeks(cursor, intervalWeeksMax);
```

```ts
// :316-321 匹配是"闭区间"，且各步骤独立匹配、记录不被消费
const inWindow = records.filter(
  (item) => item.kind === seed.kind &&
    item.date.getTime() >= seed.windowStart.getTime() &&
    item.date.getTime() <= seed.windowEnd.getTime(),
);
```

出生 2026-01-01 时窗口为：`[02-12, 03-12]`、`[03-12, 04-09]`、`[04-09, 04-23]`。
**03-12 同时是第 1 针的右端和第 2 针的左端** → 一条 03-12 的记录同时让第 1、2 针变成"已完成"。

**实跑结果**（`node --experimental-strip-types` 直接加载模块）：

| 输入 | 代码输出 |
|---|---|
| 三针 02-12 / 03-12 / 04-09 | 三针全 DONE ✅ |
| **只打两针 03-12 / 04-09** | **三针全 DONE** ❌（实际缺一针） |
| **只打一针 03-12** | 第 1、2 针 DONE，第 3 针 OVERDUE ❌（一针顶两针） |

**后果**：幼犬核心免疫（犬瘟、细小）**少打一针却显示"已完成"**，系统随后把注意力转到狂犬，家长不会再去补。这是本次审查中**唯一可能直接导致动物健康损害**的问题。

**触发条件**：接种日恰好落在"生日 + 70 天"或"生日 + 98 天"（国内常见的 7/10/13 周龄排法，第 2 针正好 10 周整）。

**建议**：窗口改**左闭右开**；匹配时做一对一配对（一条记录只能认领一个步骤）。

---

### P0-9 · 第三针按规范在 16 周龄后接种，被判"逾期"

**位置**：`backend/src/domain/health/immunization-schedule.ts:238-265`、`:329-348`
**置信度**：高（**已实跑复现**）

```ts
// :241 末针窗口的右端被写死在 16 周龄
const finish = addWeeks(birthday, CORE_PUPPY_SERIES.finishWeeksMin);
// :247 第三针的 windowEnd = min(cursor+4周, 16周) = 16周
```

而同一份文件里，该常量的 `basis` 依据文字自己写的是"**直到 16 周龄或更大**"。

**实跑结果**：出生 2026-01-01，三针打 02-12 / 03-12 / **04-30**（17 周龄，完全符合规范）→

```
core-puppy-3 = OVERDUE    ← 第 3 针被判逾期
```

**后果**：家长看到"第 3 针已经过了建议时间，建议尽快安排"，会**给已经按规范接种完的狗白补一针**；或对整栏结论失去信任。

**建议**：末针窗口右端放宽（例如到 20 周龄），与 `basis` 依据文字一致。

---

### P0-10 · 下单时填的饮食偏好被写回健康档案，超出同意书范围

**位置**：`backend/src/application/custom-recipe/custom-recipe.service.ts:1281-1286`、`:1330-1341`、`:1344-1371`
**置信度**：高（代码行为确定；是否越权取决于老板那句话的原文，而该决定**没有任何文档留痕**）

**顾客看到的同意书**（`miniapp/src/pages/custom-recipe/index.vue:393-395`）：

> 我同意把本次填写的**过敏、疾病**信息记入狗狗的健康档案

**代码实际写回的内容**：

```ts
// custom-recipe.service.ts:1330-1341
await tx.dog.update({
  where: { id: dogId },
  data: {
    ...(liked.length > 0 ? { preferredFoods: mergeText(dog.preferredFoods, liked) } : {}),
    ...(notLiked.length > 0 ? { pickyFoods: mergeText(dog.pickyFoods, notLiked) } : {}),
  },
});
// 另写 dogDietPreference 与 dogDietPreferenceChange（变更历史）
```

**三方说法互相矛盾**（这就是为什么必须由人来定夺）：

| 来源 | 说法 |
|---|---|
| 需求文档 `audit-and-refactor-plan.md:41` | "下单时填的**不写回档案** —— 知情同意范围只有过敏与疾病" |
| 同仓另一处代码注释 `recipe-designer.service.ts:8298-8304` | "定制单里的喜好/忌口**不写回档案**……不能顺手把口味也写进去" |
| 实际代码 `custom-recipe.service.ts:179-186` | 写回了，注释称"2026-10-02 老板定" |

**后果**：① 同意书未覆盖口味，属**范围超出授权的写入**；② 写入是**只增不删**的（`mergeText` 追加），而健康管理页的偏好编辑入口已于 2026-10-02 下线 → **顾客此后永远无法删除或纠正档案里的口味**，且下次下单又会被带出来，形成累积。

**建议**：二选一并留痕 —— (a) 按需求文档恢复"不写回"；或 (b) 老板书面确认要写回，则把同意书文案改为覆盖"过敏、疾病、饮食偏好"，并补顾客可删除偏好的入口。

---

### P0-11 · "分享给医生"整个功能没有任何入口

**位置**：`miniapp/src/pages/dog-health/share.vue`（482 行，完整实现但无人进入）
**置信度**：高（已核实全仓，无截断）

**证据**：

```
$ grep -rn "pages/dog-health/" miniapp/src --include=*.vue --include=*.ts | grep -v "\.spec\.ts"
src/pages/dog-profile-health/index.vue:1176:  url: `/pages/dog-health/timeline?dogId=...`
src/pages/dog-profile-health/index.vue:1206:  url: `/pages/dog-health/analysis?dogId=...`
```

时间线、分析页都有入口；**分享页一条都没有**。

分享页本身是完整的：页面已注册、三个接口（生成/列表/停止分享）齐备、隐私勾选与"停止分享"都实现了。这一期（第三期）的全部工作成果，用户点不到。

**建议**：在健康管理页入口区补「分享给医生」按钮，跳 `/pages/dog-health/share?dogId=...&name=<狗名>`。

---

### P0-12 · 登录态失效时前端收不到信号，且提示英文

**位置**：`backend/src/interfaces/common/unauthorized-exception.filter.ts:26`、`miniapp/src/utils/api.ts:345`、`:367`
**置信度**：高（四段链路已逐段复核）

**后端把 401 包装成了 HTTP 200**：

```ts
// unauthorized-exception.filter.ts:16-26
@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception, host) {
    const message = exception.message || 'Unauthorized';
    const apiResponse = ApiResponseDto.error(status, message);
    response.status(HttpStatus.OK).json(apiResponse);   // ← HTTP 200，body 里 code=401
  }
}
```

**前端只认 HTTP 401**：

```ts
// api.ts:345 —— 这段永远不会执行
if (res.statusCode === 401) {
  clearToken()
  resetTokenReady()
  uni.showToast({ title: '请先登录', ... })
  ...
}
// api.ts:367 —— 实际走的是这一支，把后端的英文 message 直接抛出去
if (response.code !== 0) { ... }
```

而后端抛的消息是英文（`auth.guard.ts:42` `'Invalid token'`、`:66` `'Unauthorized'`），页面又原样弹给用户（`dog-profile-health/index.vue:915-918`）。

**后果**：① 用户看到英文技术词；② `clearToken()` 不被调用 → 坏 token 一直留在本地 → **每次保存都失败、点重试永远失败、杀进程重进仍然失败**，必须清小程序缓存才能恢复。

**建议**：在 `api.ts` 的 `code !== 0` 分支补 `response.code === 401` 判断，复用现有清 token 逻辑。

---

## 八、P2 问题清单

| # | 问题 | 位置 |
|---|---|---|
| P2-1 | 分享的"逐项取消"开关 **fail-open**：传 `[]` 或非数组 → 变成"全给"。一个用于"减少分享"的隐私开关，在最坏输入下退化成"全部同意"（前端目前会拦住，靠非官方客户端可触发） | `health-share.service.ts:337-349` |
| P2-2 | 疫苗计划"完整程序表"注释写明"**不对顾客开放**"，实际只挂了登录校验，任何顾客可读 | `vaccine-plan.controller.ts:76` |
| P2-3 | 员工账号（客服/仓库等全部 STAFF）可读任意顾客完整健康档案；且顾客端 `PUT /dogs/:id` 对 STAFF 放行，可整体覆盖健康记录 | `dogs.controller.ts:414-419` |
| P2-4 | 报告原件是公开可读直链（无签名无 ACL），日志里还明文写着这些地址与 key → "停止分享"撤不回已流出的直链 | `tencent-cos.service.ts:120-128`、`health.service.ts:130-137` |
| P2-5 | 健康模块**自造日期工具**，未复用项目规定的 `DateUtil`；模块内混用两种解析约定（`new Date("YYYY-MM-DD")` 按 UTC、`new Date("YYYY-MM-DDT00:00:00")` 按本地）。实测：非 UTC+8 环境下 `toDateText` 会差一天；生产时区下恰好不可见 | `immunization-schedule.ts:161-189` |
| P2-6 | 分享令牌明文落库、快照无清理、每狗分享数无上限；创建接口无 DTO 校验 | `health-share.service.ts:136-145` |
| P2-7 | 健康 DTO 全部无长度上限，单条记录可达 2MB（body 上限） | `dto/health/*.ts` |
| P2-8 | `isAttachmentStillReferenced` 每次删附件全表扫 JSONB 快照，且无 GIN 索引 | `health.service.ts:97-113` |
| P2-9 | 小程序存在一套与后端对不上的旧类型定义（缺 `PENDING_CONFIRMATION` 等），当前无调用方，一旦复用就是老 bug 重演 | `miniapp/src/utils/api.ts:740-870` |
| P2-10 | `mapCheckupRecordToDto` 映射了 4 个不存在的字段（永远 undefined） | `health.service.ts:556-575` |
| P2-11 | `dog_health_share_token.token` 上 `@unique` 与 `@@index` 并存，索引冗余 | `schema.prisma:1303,1314` |
| P2-12 | 订阅消息是 TODO 空壳，却返回"订阅成功/已发送 N 条"，实际什么都没落库 → **疫苗提醒永远不会发** | `health-notification.controller.ts:80-95,113-145` |
| P2-13 | 异常过滤器把原始 message 回给客户端 → 并发冲突时用户看到带文件路径的 Prisma 英文报错 / AI 超时看到 "This operation was aborted" | `all-exceptions.filter.ts:26-52` |
| P2-14 | AI 分析缓存指纹只覆盖"最近 5 条 + 计数"，改更早的旧记录不会失效 | `health-analysis.service.ts:675-681` |
| P2-15 | 饮食偏好"从旧档案导入"逐条独立事务，中途失败留半截数据；且无数量上限（2MB body ≈ 3 万条） | `diet-preference.service.ts:214-239` |
| P2-16 | 时间线最多 100 条且**静默截断**，页头"共 N 条"与实际显示不符（体重记录会持续累积，老狗很容易超） | `health-timeline.service.ts:123-124,209-210` |
| P2-17 | 饮食偏好变更历史 `take: 50`，超出部分同样无声消失 | `diet-preference.service.ts:69-73` |
| P2-18 | 顾客选了"不做"之后又真的打了这一针，卡片会同时显示"已选择不做"和"已记录：X 月 X 日" | `immunization-schedule.ts:335-340` |
| P2-19 | 同一食材可同时出现在"爱吃"和"不吃"两栏，并一起交给 AI | `diet-preference.service.ts:135-146` |
| P2-20 | 免疫程序的"下一步"会给到可选的补强针，把**已逾期的狂犬首针**挤到后面 | `immunization-schedule.ts:269-277,580-585` |
| P2-21 | 疫苗计划决定整份 JSON 读-改-写，并发会静默丢掉前一个决定 | `vaccine-plan.service.ts:151-163` |
| P2-22 | 化验数据里"项目与数值粘连"或"文字型结果（阴性）"的行被判成报告名，显示成"0 项" | `lab-values.ts:166-178` |
| P2-23 | 去重路径残留一份**已废弃的**报告名判定，与新判定矛盾 → 扫描入库时可能少一行化验数值 | `health-records.ts:1753-1767` |
| P2-24 | 每次自动保存成功都会**强制滚动页面**，新建记录还会插到列表最前 | `HealthRecordsSection.vue:1203-1205` |
| P2-25 | 记录列表无分页，每次输入都全列表重算（含多次 JSON 全量序列化） | `HealthRecordsSection.vue:1800-1807` |
| P2-26 | 扫描确认卡片在"没有任何内容进表单"时仍提示"识别到以下内容" | `HealthDocumentScan.vue:636-648` |
| P2-27 | 图太小的提示里 Markdown 星号直接显示给用户（`选**原图**`） | `scan-image.ts:99-101` |
| P2-28 | 约一半的界面代码永不执行（`!embedded` 分支），且残留"记得点保存"等**已被删除的按钮**的提示语 | `HealthRecordsSection.vue:6-32,846-867` |
| P2-29 | 老板第 25 条"健康变化告知营养师"：后端算好了、前端封装了，**界面没人调用** | `admin-web/src/api/dogs.ts:162-164` |
| P2-30 | 体重计划的能量口径固定用 v2，与全站 `ENERGY_ALGORITHM` 开关解耦 → 回滚预案失效时会分叉 | `weight-goal-plan.service.ts:206-210` |
| P2-31 | 首页推荐里过敏只是**扣 40 分**而非排除，含过敏原的食谱仍以至少 3 星出现（当前该接口无客户端调用，属潜伏缺陷） | `recipes.controller.ts:387-392,413-417` |
| P2-32 | 健康记录控制器注入了 **4 个从不使用**的仓储；6 组 CRUD 逐字重复约 600 行 | `health-records.controller.ts:74-85` |
| P2-33 | 识别服务 894 行一个方法串了 5 件事；提示词大段重复；**四份** `toDateText` 副本 | `health-report-extraction.service.ts:695-894` |

---

## 九、文档与规范

### ✅ 命名规范：100% 达标

逐字段核对了 9 张健康相关表（`vaccine_record`、`checkup_record`、`medical_record`、`allergy_record`、`weight_record`、`dog_health_share_token`、`dog_vaccine_plan`、`dog_diet_preference`、`dog_diet_preference_change`）：**每一个数据库列名都符合 `DATABASE_NAMING_CONVENTIONS.md` 的蛇形要求**，`dog_id` 全部有索引、全部配了 `ON DELETE CASCADE`、迁移可重复执行。这是本次审查中唯一完全达标的维度。

两处例外均非命名问题：
- `medical_record.treatment`：列名合法，但语义已收窄为"医嘱"，与直觉不符（迁移注释说明改列名会牵动食谱设计器，属有意识取舍）
- `dog.birthday`：列名合法，但**类型是 `TIMESTAMP(3)` 而非 `DATE`** —— 而健康记录的时间列全都是 `@db.Date`。这个不一致是 P2-5 差一天问题的根因

### ⚠️ 接口文档：健康管理模块完全没有被记录

| 文档 | 状态 |
|---|---|
| `docs/05_API_Specs.md`（585 行） | 检索"健康"及 vaccine/checkup/medical-record/allergy —— **0 命中** |
| `docs/07_Core_Architecture.md` | 5 处命中，但**全部是"食谱健康标签"**，与健康管理模块无关 |

而 `CLAUDE.md` 把这两份列为"高"优先级必读，并明确要求"禁止想象字段名"。健康管理是本轮最大的新模块（14+ 接口、9 张表），文档里一行没有 —— **这正是 P0-4 之所以能长期存在的土壤**：后来者按文档写请求，必然字段错位。

---

## 十、⚠️ 域外发现（不属于健康模块，但必须让对应负责人知道）

> 以下问题**不在本次审查范围内**，是审查过程中为了确认健康模块的鉴权基线而顺带核实的。
> 我只核实了"守卫是否存在"，**没有逐条读实现**，也没有评估业务影响。请转给对应模块负责人确认。

**`backend/src/interfaces/controllers/staff-kitchen.controller.ts` —— 整个控制器没有任何鉴权。**

| 核实项 | 结果 |
|---|---|
| 该文件内 `UseGuards` / `AuthGuard` / `StaffGuard` 出现次数 | **0** |
| 暴露的接口 | `GET batches`、`GET batches/:batchId`、`POST tasks/:taskId` |
| 项目是否有全局守卫（`APP_GUARD`） | **无** |
| `main.ts` 是否有全局鉴权中间件 | **无**（只有静态资源与一处 body parser） |

即：这三个接口目前看不到任何登录要求。**请优先核实**（也需确认生产 nginx 是否对该路径另有拦截）。

另外四个控制器只有登录校验、缺少角色校验，同样建议转交核实：

| 控制器 | 现状 |
|---|---|
| `staff-shipping.controller.ts` | 类级无守卫，仅个别路由挂了 AuthGuard+StaffGuard |
| `admin-finance.controller.ts:25` | 只有 `AuthGuard`，缺 AdminGuard |
| `staff-purchasing.controller.ts:59` | 只有 `AuthGuard`，缺 StaffGuard |
| `staff-production-photos.controller.ts:29` | 只有 `AuthGuard`，缺 StaffGuard |

另有一处同类风险：`tencent-cos.service.ts:252` 的 `deleteImageByUrl` 会把传入 URL 的路径部分当作 key 删除，调用方包括头像（`users.controller.ts:228`、`dogs.controller.ts:1550`）与评价图（`reviews.controller.ts:453`）—— 与 P0-2 是同一类问题，建议一并排查。

---

## 十一、待确认事项（需你或运维提供信息才能定级）

| # | 待确认 | 影响 |
|---|---|---|
| 1 | 生产 nginx 是否配置 `client_max_body_size` | 决定 P1-4 是"打满内存"还是"仅浪费带宽" |
| 2 | 生产 PostgreSQL 时区是否 `Asia/Shanghai` | 若非，P2-5 升级为"免疫程序整体偏移一天" |
| 3 | COS 桶是否公开读、是否限制按前缀写权限 | 决定 P0-2 / P2-4 的实际可利用度 |
| 4 | 生产访问日志中是否出现过 `audience=staff` 且身份为顾客的请求 | 可确认 P0-3 是否**已被触发过** |
| 5 | 生产是否设置 `ALLOW_DEV_AUTH=true` | 若开启，`X-Customer-Id` 请求头即可冒充任意用户，本报告所有"需登录"的结论都降级为"需知道用户 ID" |
| 6 | `PUT /api/v1/dogs/:id` 是否仍有携带健康数组的真实流量 | **决定 P0-4 是"潜在风险"还是"正在发生的数据丢失"** |
| 7 | 部署环境是否有内网/出网限制 | 决定 P0-1 的危害上限 |
| 8 | 线上后端实例数 | 决定 P1-8（AI 计费放大）、进程内缓存的实际影响面 |
| 9 | **老板 2026-10-02 关于"饮食偏好是否写回档案"的原始决议** | **决定 P0-10 是"越权写入"还是"同意书文案没跟上"**。代码注释称是老板决定，但 `docs/` 里找不到推翻需求文档"不写回"的记录 |
| 10 | 微信后台是否配了直达 `pages/dog-health/share` 的路径（客服消息 / 小程序码 / 公众号菜单） | 若有，P0-11 从"完全不可达"降为"只能靠外部入口进入" |
| 11 | 拿生产库真实 `medical_history` / `findings` 文本抽样 200 只狗，跑一次病史关键词误匹配统计 | 决定 P1-17 的修复优先级（当前只有机制证据，没有发生率） |
| 12 | 生产标签（`label`）是否应该打印过敏原 | 这是最后的物理安全闸门（厨房与顾客手里的实物包装）。目前标签数据里没有狗级过敏字段 —— 需确认是有意为之还是缺口 |
| 13 | `ENERGY_ALGORITHM` 回滚预案与体重计划口径 | 体重计划固定用 v2 算，回滚全站到 v1 后会与首页/档案页数字分叉（P2-30） |
| 14 | 健康分析接口在生产是否真的经常被调用 | 决定 P1-8 / P1-9（无限流、并发穿透缓存导致双倍计费）的实际金额影响 |
