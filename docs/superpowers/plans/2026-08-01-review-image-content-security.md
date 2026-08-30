# 食谱评价图片内容安全校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅将 COS 审核通过的图片返回给食谱评价上传接口。

**Architecture:** `TencentCosService` 在临时 COS 对象上使用已签名的 `sensitive-content-recognition` 同步审核请求；结果为正常时复制对象到 `review-photos` 并删除临时对象。审核风险、疑似风险或异常都删除临时对象且不生成公开 URL，评价控制器将不同结果转成用户提示。

**Tech Stack:** NestJS、TypeScript、cos-nodejs-sdk-v5、腾讯云数据万象 CI、Jest。

---

### Task 1: COS 图片审核与安全发布服务

**Files:**
- Modify: `backend/src/infrastructure/services/tencent-cos.service.ts`
- Create: `backend/tests/infrastructure/services/tencent-cos.service.spec.ts`

- [ ] **Step 1: 写入失败测试，验证风险图片不会被发布**

```ts
it('removes a temporary review image when COS marks it risky', async () => {
  const service = createCosService();
  jest.spyOn(service as any, 'uploadObject').mockResolvedValue({ key: 'review-uploads/pending/a.jpg' });
  jest.spyOn(service as any, 'inspectImage').mockResolvedValue({ safe: false });
  jest.spyOn(service, 'deleteImage').mockResolvedValue();

  await expect(service.uploadReviewedImage(file, 'review-photos')).rejects.toThrow(
    '图片含违规或不适宜信息，请更换后重试',
  );
  expect(service.deleteImage).toHaveBeenCalledWith('review-uploads/pending/a.jpg');
});
```

- [ ] **Step 2: 运行测试并确认因 `uploadReviewedImage` 缺失失败**

Run: `cd backend && npm test -- tests/infrastructure/services/tencent-cos.service.spec.ts --runInBand`

Expected: FAIL，指出 `uploadReviewedImage` 不存在。

- [ ] **Step 3: 实现临时上传、同步审核、复制发布和清理**

```ts
const audit = await cos.request({
  Method: 'GET', Bucket: this.bucket, Region: this.region, Key: temporary.key,
  Query: { 'ci-process': 'sensitive-content-recognition', 'large-image-detect': 1 },
});
const safe = Number(audit.RecognitionResult?.Result) === 0;
if (!safe) throw new BadRequestException('图片含违规或不适宜信息，请更换后重试');
await cos.putObjectCopy({ Bucket, Region, Key: publicKey, CopySource: `/${Bucket}/${temporary.key}` });
await this.deleteImage(temporary.key);
return { url: this.buildPublicUrl(publicKey), key: publicKey };
```

Wrap the flow in `try/finally` so a temporary object is deleted after every rejection or infrastructure error. Preserve a typed `ImageContentSafetyError` with `risk` and `unavailable` kinds for the controller.

- [ ] **Step 4: 运行图片服务测试并确认通过**

Run: `cd backend && npm test -- tests/infrastructure/services/tencent-cos.service.spec.ts --runInBand`

Expected: PASS。

### Task 2: 评价图片接口使用安全发布服务

**Files:**
- Modify: `backend/src/interfaces/controllers/reviews.controller.ts`
- Modify: `backend/tests/interfaces/controllers/reviews.controller.spec.ts`

- [ ] **Step 1: 写入失败测试，验证接口不返回被拒绝图片地址**

```ts
it('rejects a risky review image without returning a public URL', async () => {
  const cosService = {
    uploadReviewedImage: jest.fn().mockRejectedValue(
      new ImageContentSafetyError('risk'),
    ),
  };
  const controller = new ReviewsController({} as any, cosService as any, {} as any);

  await expect(controller.uploadPhotos([file] as any)).rejects.toThrow(
    '图片含违规或不适宜信息，请更换后重试',
  );
  expect(cosService.uploadReviewedImage).toHaveBeenCalledWith(file, 'review-photos');
});
```

- [ ] **Step 2: 运行测试并确认现有接口仍调用 `uploadImage` 而失败**

Run: `cd backend && npm test -- tests/interfaces/controllers/reviews.controller.spec.ts --runInBand`

Expected: FAIL，因 `uploadReviewedImage` 尚未被调用。

- [ ] **Step 3: 将上传接口替换为安全发布调用并映射用户提示**

```ts
const results = await Promise.all(
  files.map((file) => this.cosService.uploadReviewedImage(file, 'review-photos')),
);
return ApiResponseDto.success({ photos: results, count: results.length });
```

Catch `ImageContentSafetyError`: `risk` 返回违规图片提示，`unavailable` 返回安全验证暂不可用提示；其他上传错误保持现有“照片上传失败，请重试”。

- [ ] **Step 4: 运行控制器测试并确认通过**

Run: `cd backend && npm test -- tests/interfaces/controllers/reviews.controller.spec.ts --runInBand`

Expected: PASS。

### Task 3: 文字与图片统一验证

**Files:**
- Modify: `backend/tests/interfaces/controllers/reviews.controller.spec.ts`
- Modify: `backend/tests/infrastructure/wechat/wechat.service.spec.ts`
- Modify: `backend/tests/infrastructure/services/tencent-cos.service.spec.ts`

- [ ] **Step 1: 添加正常文字、违规文字、正常图片、违规图片的测试名称与断言**

```ts
expect(safeTextResponse.code).toBe(0);
expect(riskyTextResponse.code).toBe(400);
await expect(safeImageUpload).resolves.toMatchObject({ url: expect.any(String) });
await expect(riskyImageUpload).rejects.toThrow('图片含违规或不适宜信息，请更换后重试');
```

- [ ] **Step 2: 执行相关测试与构建**

Run: `cd backend && npm test -- tests/infrastructure/wechat/wechat.service.spec.ts tests/infrastructure/services/tencent-cos.service.spec.ts tests/interfaces/controllers/reviews.controller.spec.ts --runInBand && npm run build`

Expected: 所有测试通过，构建 exit code 0。

- [ ] **Step 3: 提交限定范围的后端改动**

Run: `git add backend/src/infrastructure/services/tencent-cos.service.ts backend/src/interfaces/controllers/reviews.controller.ts backend/tests/infrastructure/services/tencent-cos.service.spec.ts backend/tests/interfaces/controllers/reviews.controller.spec.ts && git commit -m "feat: screen review images before publishing"`
