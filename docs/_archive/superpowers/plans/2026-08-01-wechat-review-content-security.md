# 微信评价内容安全校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在食谱评价写入前调用微信文本内容安全接口，拦截风险内容且不落库。

**Architecture:** 在既有 `WechatService` 中封装微信 `wxa/msg_sec_check` 调用，沿用该服务的 access token 缓存和本地模拟模式。`ReviewsController` 在客户和管理员创建评价时先执行校验；风险或审核服务失败时，控制器不会调用 Prisma 写入。

**Tech Stack:** NestJS、TypeScript、Axios、Jest、微信小程序 OpenAPI。

---

### Task 1: 微信文本审核服务

**Files:**
- Modify: `backend/src/infrastructure/wechat/wechat.service.ts`
- Test: `backend/tests/infrastructure/wechat/wechat.service.spec.ts`

- [ ] **Step 1: 写入失败测试，描述审核请求与风险结果**

```ts
it('checks review text with WeChat content security API', async () => {
  const service = new WechatService();
  jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
  jest.spyOn(axios, 'post').mockResolvedValue({
    data: { errcode: 87014, errmsg: 'risky content' },
  });

  await expect(service.checkTextContent('违规文本', 'openid-1')).resolves.toEqual({
    safe: false,
  });
  expect(axios.post).toHaveBeenCalledWith(
    'https://api.weixin.qq.com/wxa/msg_sec_check?access_token=ACCESS_TOKEN',
    { content: '违规文本', version: 2, scene: 2, openid: 'openid-1' },
  );
});
```

- [ ] **Step 2: 运行测试并确认因方法缺失失败**

Run: `cd backend && npm test -- tests/infrastructure/wechat/wechat.service.spec.ts --runInBand`

Expected: FAIL，指出 `checkTextContent` 不存在。

- [ ] **Step 3: 实现最小审核方法**

```ts
async checkTextContent(content: string, openid: string): Promise<{ safe: boolean }> {
  if (this.isMockMode()) return { safe: true };
  const accessToken = await this.getAccessToken();
  const response = await axios.post<WechatContentSecurityResponse>(
    `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`,
    { content, version: 2, scene: 2, openid },
  );
  if (response.data.errcode === 0) return { safe: true };
  if (response.data.errcode === 87014) return { safe: false };
  throw new Error(`WeChat content security check failed: ${response.data.errcode} - ${response.data.errmsg}`);
}
```

- [ ] **Step 4: 运行服务测试并确认通过**

Run: `cd backend && npm test -- tests/infrastructure/wechat/wechat.service.spec.ts --runInBand`

Expected: PASS。

### Task 2: 在评价写入前强制检查

**Files:**
- Modify: `backend/src/interfaces/controllers/reviews.controller.ts`
- Create: `backend/tests/interfaces/controllers/reviews.controller.spec.ts`

- [ ] **Step 1: 写入失败测试，验证风险评价不写入数据库**

```ts
it('does not save a review when WeChat flags its content', async () => {
  const prisma = { recipe: { findFirst: jest.fn().mockResolvedValue({ id: 'recipe-1', recipeId: 'r-1' }) } };
  const wechat = { checkTextContent: jest.fn().mockResolvedValue({ safe: false }) };
  const controller = new ReviewsController(prisma as any, {} as any, wechat as any);

  const response = await controller.createReview(
    { customerId: 'user-1', wechatOpenid: 'openid-1' } as any,
    'recipe-1',
    { ratingEase: 5, ratingValue: 5, ratingTaste: 5, content: '风险文本' },
  );

  expect(response.code).toBe(400);
  expect(response.message).toBe('发布失败：内容含违规或不适宜信息，请修改后重试');
  expect(prisma.recipeReview?.create).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试并确认因控制器尚未注入微信服务失败**

Run: `cd backend && npm test -- tests/interfaces/controllers/reviews.controller.spec.ts --runInBand`

Expected: FAIL，风险内容目前仍可进入既有写入流程或构造函数参数不匹配。

- [ ] **Step 3: 注入服务并在两个创建入口调用它**

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly cosService: TencentCosService,
  private readonly wechatService: WechatService,
) {}

const securityResult = await this.wechatService.checkTextContent(
  dto.content,
  user.wechatOpenid,
);
if (!securityResult.safe) {
  return ApiResponseDto.error(400, '发布失败：内容含违规或不适宜信息，请修改后重试');
}
```

Apply this before `recipeReview.create` in both `createReview` and `createAdminReview`; use the authenticated operator’s `wechatOpenid` for the latter.

- [ ] **Step 4: 运行控制器测试并确认通过**

Run: `cd backend && npm test -- tests/interfaces/controllers/reviews.controller.spec.ts --runInBand`

Expected: PASS。

### Task 3: 完整验证与提交

**Files:**
- Modify: `backend/src/infrastructure/wechat/wechat.service.ts`
- Modify: `backend/src/interfaces/controllers/reviews.controller.ts`
- Modify: `backend/tests/infrastructure/wechat/wechat.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/reviews.controller.spec.ts`

- [ ] **Step 1: 执行两个相关测试文件**

Run: `cd backend && npm test -- tests/infrastructure/wechat/wechat.service.spec.ts tests/interfaces/controllers/reviews.controller.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 2: 构建后端**

Run: `cd backend && npm run build`

Expected: exit code 0。

- [ ] **Step 3: 检查变更范围并提交**

Run: `git diff --check && git status --short`

Expected: 无空白错误；只暂存本计划列出的后端文件，不暂存工作区已有的无关变更。

Run: `git add backend/src/infrastructure/wechat/wechat.service.ts backend/src/interfaces/controllers/reviews.controller.ts backend/tests/infrastructure/wechat/wechat.service.spec.ts backend/tests/interfaces/controllers/reviews.controller.spec.ts && git commit -m "feat: check recipe reviews with WeChat security"`
