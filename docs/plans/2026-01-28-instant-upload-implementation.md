# 即时上传照片功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现选择照片后立即上传到COS，无需等待用户点击确认按钮，并添加确认完成按钮

**架构:** 前端即时上传模式 - 用户选择照片后立即创建上传任务并执行，显示实时状态（上传中/成功/失败），支持重试和删除。照片满足2-3张要求后显示确认完成按钮。

**技术栈:** Vue 3 Composition API, uni-app, TypeScript, 腾讯云COS

---

## Task 1: 添加上传任务状态管理

**目标:** 添加管理正在上传照片任务的状态和类型定义

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 添加上传任务类型定义**

在 `<script setup>` 部分，类型定义后添加：

```typescript
// 上传任务状态
interface UploadTask {
  id: number;
  file: string; // 本地临时文件路径
  status: 'uploading' | 'error';
  progress: number;
  error?: string;
}
```

**步骤 2: 添加响应式状态**

在 `const uploadedPhotos = ref<string[]>([])` 后添加：

```typescript
// 正在上传的照片任务
const uploadingPhotos = ref<UploadTask[]>([]);

// 是否正在提交完成
const isCompleting = ref(false);
```

**步骤 3: 添加计算属性**

```typescript
// 是否有正在上传的照片
const isUploading = computed(() =>
  uploadingPhotos.value.some(t => t.status === 'uploading')
);

// 是否可以上传更多照片
const canUploadMore = computed(() =>
  uploadedPhotos.value.length + uploadingPhotos.value.length < 3
);

// 照片总数（包括正在上传的）
const totalPhotoCount = computed(() =>
  uploadedPhotos.value.length + uploadingPhotos.value.length
);
```

**步骤 4: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): add upload task state management"
```

---

## Task 2: 修改选择照片函数为立即上传

**目标:** 用户选择照片后立即上传，而不是等待用户点击确认

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 找到并修改 choosePhoto 函数**

找到原有的 `const choosePhoto = () => { ... }` 函数，完全替换为：

```typescript
// 选择照片并立即上传
const choosePhoto = async () => {
  // 防止：正在上传时不允许再次选择
  if (isUploading.value) {
    uni.showToast({
      title: '请等待当前照片上传完成',
      icon: 'none',
    });
    return;
  }

  // 防止：已达到上限
  if (!canUploadMore.value) {
    uni.showToast({
      title: '最多只能上传3张照片',
      icon: 'none',
    });
    return;
  }

  try {
    // 1. 选择照片
    const res = await uni.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    });

    if (!res.tempFiles || res.tempFiles.length === 0) {
      return;
    }

    const tempFilePath = res.tempFiles[0].tempFilePath;

    // 2. 压缩照片到200KB以内
    uni.showLoading({ title: '压缩中...' });
    const compressed = await uni.compressImage({
      src: tempFilePath,
      quality: 80,
      compressedWidth: 1200,
    });
    uni.hideLoading();

    // 3. 创建上传任务
    const task: UploadTask = {
      id: Date.now(),
      file: compressed.tempFilePath,
      status: 'uploading',
      progress: 0,
    };
    uploadingPhotos.value.push(task);

    // 4. 立即开始上传
    uploadSinglePhoto(task);

  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error.message || '选择照片失败',
      icon: 'none',
    });
  }
};
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): upload photo immediately after selection"
```

---

## Task 3: 实现单张照片上传函数

**目标:** 创建上传单张照片的异步函数，处理成功和失败情况

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 在 choosePhoto 函数后添加 uploadSinglePhoto 函数**

```typescript
// 上传单张照片
const uploadSinglePhoto = async (task: UploadTask) => {
  try {
    console.log('[uploadSinglePhoto] Starting upload:', task.id);

    // 调用后端API上传照片
    const result = await uploadProductionPhotos(taskId.value, [{
      uri: task.file,
      name: `photo_${task.id}.jpg`
    }]);

    console.log('[uploadSinglePhoto] Upload success:', task.id);

    // 成功：从上传列表移除，添加到已上传列表
    uploadingPhotos.value = uploadingPhotos.value.filter(
      t => t.id !== task.id
    );
    uploadedPhotos.value.push(result.photosRaw[0]);

    uni.showToast({
      title: '上传成功',
      icon: 'success',
      duration: 1000,
    });

  } catch (error: any) {
    console.error('[uploadSinglePhoto] Upload failed:', task.id, error);

    // 失败：更新任务状态为error
    task.status = 'error';
    task.error = error.message || '上传失败';

    uni.showToast({
      title: task.error,
      icon: 'none',
    });
  }
};
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): implement single photo upload function"
```

---

## Task 4: 实现重试上传功能

**目标:** 添加重试失败照片上传的函数

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 在 uploadSinglePhoto 函数后添加 retryUpload 函数**

```typescript
// 重试上传失败的照片
const retryUpload = async (task: UploadTask) => {
  console.log('[retryUpload] Retrying upload:', task.id);

  // 重置任务状态
  task.status = 'uploading';
  task.error = undefined;
  task.progress = 0;

  // 重新上传
  await uploadSinglePhoto(task);
};
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): add retry upload functionality"
```

---

## Task 5: 修改删除照片函数（已存在，需验证）

**目标:** 验证删除照片函数已正确实现调用后端API

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 检查现有的 deletePhoto 函数**

查找 `const deletePhoto = async (index: number) => { ... }`

如果已存在且包含 `await deleteProductionPhoto(taskId.value, photoUrl)` 调用，则无需修改。

如果不存在或不包含API调用，替换为：

```typescript
// 删除照片
const deletePhoto = async (index: number) => {
  const photoUrl = uploadedPhotos.value[index];

  uni.showModal({
    title: '确认删除',
    content: '确认删除这张照片？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // 调用后端API删除照片（包括COS存储）
          uni.showLoading({ title: '删除中...' });

          await deleteProductionPhoto(taskId.value, photoUrl);

          // 成功后更新本地状态
          uploadedPhotos.value.splice(index, 1);

          uni.hideLoading();
          uni.showToast({
            title: '删除成功',
            icon: 'success',
          });

          // 重新获取任务详情以同步状态
          await fetchTaskDetail();

        } catch (error: any) {
          uni.hideLoading();
          uni.showToast({
            title: error.message || '删除失败',
            icon: 'none',
          });
          console.error('[deletePhoto] Failed:', error);
        }
      }
    },
  });
};
```

**步骤 2: 提交更改（如需修改）**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): ensure deletePhoto calls backend API"
```

---

## Task 6: 添加确认完成函数

**目标:** 实现点击确认完成按钮后的业务逻辑

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 在 retryUpload 函数后添加 completeTask 函数**

```typescript
// 确认完成任务
const completeTask = async () => {
  // 验证照片数量
  if (uploadedPhotos.value.length < 2) {
    uni.showToast({
      title: '请至少上传2张备料照片',
      icon: 'none',
    });
    return;
  }

  // 防止重复提交
  if (isCompleting.value) {
    return;
  }

  isCompleting.value = true;

  try {
    console.log('[completeTask] Completing task:', taskId.value);

    // 调用完成API
    await completeProductionTask(taskId.value);

    console.log('[completeTask] Task completed successfully');

    // 成功提示
    uni.showToast({
      title: '制作完成',
      icon: 'success',
      duration: 1500,
    });

    // 延迟返回列表页
    setTimeout(() => {
      uni.navigateBack();
    }, 1000);

  } catch (error: any) {
    console.error('[completeTask] Failed:', error);

    // 失败处理
    uni.showToast({
      title: error.message || '操作失败',
      icon: 'none',
      duration: 2000,
    });

  } finally {
    isCompleting.value = false;
  }
};
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): add complete task function"
```

---

## Task 7: 修改照片上传区域UI - 显示上传状态

**目标:** 更新模板以显示正在上传和上传失败的照片

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 找到照片预览区域，替换为新的结构**

找到 `<view class="photos-preview">` 区域，替换整个照片预览部分为：

```vue
<!-- 照片预览区 -->
<view class="photos-preview">
  <!-- 正在上传的照片 -->
  <view
    v-for="task in uploadingPhotos"
    :key="task.id"
    class="photo-item photo-uploading"
  >
    <!-- 上传中状态 -->
    <view v-if="task.status === 'uploading'" class="uploading-placeholder">
      <text class="loading-icon">⏳</text>
      <text class="uploading-text">上传中...</text>
    </view>

    <!-- 上传失败状态 -->
    <view v-else class="error-placeholder">
      <text class="error-icon">⚠️</text>
      <text class="error-text">{{ task.error || '上传失败' }}</text>
      <button class="retry-btn" @tap="retryUpload(task)">重试</button>
    </view>
  </view>

  <!-- 已上传的照片 -->
  <view v-for="(photo, index) in uploadedPhotos" :key="index" class="photo-item">
    <image :src="photo" mode="aspectFill" class="photo-image" @tap="previewPhoto(photo)" />
    <view class="photo-delete" @tap="deletePhoto(index)">
      <text>×</text>
    </view>
  </view>

  <!-- 上传按钮（总数<3时显示） -->
  <view v-if="canUploadMore" class="photo-upload" @tap="choosePhoto">
    <text class="upload-icon">+</text>
    <text class="upload-text">上传照片</text>
  </view>
</view>
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): update UI to show upload status"
```

---

## Task 8: 移除旧的确认上传按钮

**目标:** 删除原有的"点击上传到服务器"按钮，因为现在选择照片后立即上传

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 找到并删除确认上传按钮**

找到以 `<button class="section-upload-btn"` 开头的按钮代码块，删除整个按钮元素。

同时删除相关的 `pendingPhotoFiles` 状态和 `uploadPhotos` 函数（如果存在）。

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "refactor(instant-upload): remove old upload button and related code"
```

---

## Task 9: 添加确认完成按钮UI

**目标:** 在页面底部添加确认完成按钮，只在照片数量满足要求时显示

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 在照片上传区域后添加确认完成按钮**

在 `</view>` 闭合标签（照片section结束）后添加：

```vue
<!-- 确认完成按钮 -->
<view
  v-if="taskDetail.status === 'IN_PROGRESS' && uploadedPhotos.length >= 2 && uploadedPhotos.length <= 3"
  class="section complete-section"
>
  <button
    class="complete-btn"
    :disabled="isCompleting"
    @tap="completeTask"
  >
    <text v-if="!isCompleting">确认完成</text>
    <text v-else>提交中...</text>
  </button>
</view>
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "feat(instant-upload): add complete task button UI"
```

---

## Task 10: 添加样式

**目标:** 为新的UI组件添加样式，包括上传状态、错误状态、确认完成按钮

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 在 <style> 部分添加新样式**

在现有样式后添加：

```vue
<style lang="scss" scoped>
// ... 现有样式 ...

/* 上传状态样式 */
.photo-uploading {
  background-color: #f0f0f0;
  border: 2px dashed #d9d9d9;
}

.uploading-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx;
}

.loading-icon {
  font-size: 48rpx;
  margin-bottom: 10rpx;
}

.uploading-text {
  font-size: 24rpx;
  color: #999;
}

/* 错误状态样式 */
.error-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx;
  background-color: #fff2f0;
  border: 2px solid #ff4d4f;
}

.error-icon {
  font-size: 48rpx;
  margin-bottom: 10rpx;
}

.error-text {
  font-size: 24rpx;
  color: #ff4d4f;
  margin-bottom: 10rpx;
  text-align: center;
}

.retry-btn {
  margin-top: 10rpx;
  padding: 10rpx 20rpx;
  background-color: #fa8c16;
  color: white;
  border-radius: 8rpx;
  font-size: 24rpx;
}

/* 确认完成区域 */
.complete-section {
  margin-top: 40rpx;
}

.complete-btn {
  width: 100%;
  height: 88rpx;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 8rpx;
  font-size: 32rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    background-color: #d9d9d9;
    color: #999;
  }
}
</style>
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "style(instant-upload): add styles for upload status and complete button"
```

---

## Task 11: 更新照片计数显示

**目标:** 修改计数器，显示总照片数（包括正在上传的）

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 修改照片计数显示**

找到 `<text class="photo-count">当前：{{ uploadedPhotos.length }}/3</text>`，替换为：

```vue
<text class="photo-count">当前：{{ totalPhotoCount }}/3</text>
```

**步骤 2: 提交更改**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "refactor(instant-upload): update photo count to include uploading photos"
```

---

## Task 12: 编译并验证前端更改

**目标:** 编译小程序并验证基本功能正常

**文件:**
- Test: `miniapp/`

**步骤 1: 编译小程序**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/instant-upload/miniapp
pnpm run dev:mp-weixin > /tmp/uni-compile-instant.log 2>&1 &
```

**步骤 2: 等待编译完成**

```bash
sleep 20 && tail -20 /tmp/uni-compile-instant.log
```

预期输出: `DONE Build complete. Watching for changes...`

**步骤 3: 验证编译输出**

```bash
ls -lh dist/dev/mp-weixin/pages/staff-production/detail.js
```

预期: 文件存在且大小合理

**步骤 4: 提交编译验证**

```bash
git add miniapp/dist/dev/mp-weixin/pages/staff-production/detail.js
git commit -m "chore(instant-upload): verify compilation success"
```

---

## Task 13: 手动测试检查清单

**目标:** 在微信开发者工具中测试所有功能

**测试环境:**
- 微信开发者工具
- 导入项目: `/Users/zhaochen/Documents/SevenKitchen/miniapp/dist/dev/mp-weixin`
- 登录员工账号

**测试步骤:**

**1. 测试立即上传**
- [ ] 进入制作中的任务详情页
- [ ] 点击"上传照片"按钮
- [ ] 选择1张照片
- [ ] 验证：照片立即开始上传（显示loading）
- [ ] 验证：上传成功后照片显示在预览区
- [ ] 验证：控制台显示上传日志

**2. 测试上传失败重试**
- [ ] 断开网络连接
- [ ] 选择1张照片
- [ ] 验证：显示上传失败状态（红色边框+错误图标）
- [ ] 验证：显示重试按钮
- [ ] 恢复网络连接
- [ ] 点击重试按钮
- [ ] 验证：照片重新上传并成功

**3. 测试照片数量限制**
- [ ] 上传第1张照片 → 成功
- [ ] 上传第2张照片 → 成功
- [ ] 上传第3张照片 → 成功
- [ ] 验证：上传按钮消失
- [ ] 删除1张照片
- [ ] 验证：上传按钮重新出现
- [ ] 验证：确认完成按钮隐藏

**4. 测试删除照片**
- [ ] 上传2张照片
- [ ] 点击其中一张的删除按钮
- [ ] 验证：弹出确认对话框
- [ ] 点击确认
- [ ] 验证：照片从预览区消失
- [ ] 验证：确认完成按钮隐藏
- [ ] 刷新页面
- [ ] 验证：删除的照片没有重新出现
- [ ] 验证：COS中对应文件被删除

**5. 测试确认完成**
- [ ] 上传2张照片
- [ ] 验证：确认完成按钮显示
- [ ] 点击确认完成按钮
- [ ] 验证：按钮变为"提交中..."并禁用
- [ ] 验证：显示"制作完成"提示
- [ ] 验证：1秒后自动返回列表页
- [ ] 验证：任务状态变为"已完成"

**6. 测试边界情况**
- [ ] 快速连续点击上传按钮 → 应该提示"请等待"
- [ ] 上传3MB照片 → 应该成功压缩并上传
- [ ] 只上传1张照片 → 确认完成按钮不显示
- [ ] 上传4张照片 → 上传按钮应该在第3张后隐藏

**步骤 2: 记录测试结果**

创建测试结果文档：

```bash
cat > /tmp/test-results.md << 'EOF'
# 即时上传功能测试结果

**测试日期**: 2026-01-28
**测试人员**: [您的名字]

## 测试通过项
- [x] 立即上传功能
- [ ] ...

## 测试失败项
- [ ] ...
- [ ] ...

## 问题和建议
- ...
EOF
```

**步骤 3: 如测试通过，提交测试验证**

```bash
echo "All manual tests passed" > /tmp/test-passed.txt
git add /tmp/test-passed.txt
git commit -m "test(instant-upload): manual testing completed"
```

---

## Task 14: 后端验证（无需修改）

**目标:** 确认后端API支持新的前端功能

**验证步骤:**

**1. 验证删除照片API**

```bash
# 获取token
TOKEN="your-token-here"

# 测试删除端点
curl -X DELETE http://localhost:3001/api/v1/staff/production/packaging-units/{unit-id}/photos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"photoUrl":"https://example.com/photo.jpg"}'
```

预期返回: `{"code":0,"message":"照片删除成功","data":{...}}`

**2. 验证完成任务API**

```bash
curl -X POST http://localhost:3001/api/v1/staff/production/packaging-units/{unit-id}/complete \
  -H "Authorization: Bearer $TOKEN"
```

预期返回: `{"code":0,"message":"制作完成","data":{...}}`

**步骤 2: 记录验证结果**

```bash
echo "Backend API verification passed" > /tmp/backend-verify.txt
```

---

## Task 15: 清理和优化代码

**目标:** 移除不再使用的代码和变量

**文件:**
- Modify: `miniapp/src/pages/staff-production/detail.vue`

**步骤 1: 移除 pendingPhotoFiles 相关代码**

搜索并删除所有 `pendingPhotoFiles` 相关的代码，包括：
- 状态定义
- 相关的判断逻辑

**步骤 2: 移除旧的 uploadPhotos 函数**

如果有旧的 `uploadPhotos` 函数（批量上传逻辑），删除它。

**步骤 3: 提交清理**

```bash
git add miniapp/src/pages/staff-production/detail.vue
git commit -m "refactor(instant-upload): remove unused code for old upload flow"
```

---

## Task 16: 更新设计文档

**目标:** 标记设计文档为已实现状态

**文件:**
- Modify: `docs/plans/2026-01-28-production-task-instant-upload-design.md`

**步骤 1: 更新文档状态**

在文档顶部添加实施状态：

```markdown
**实施状态**: ✅ 已完成 (2026-01-28)
**实施分支**: feature/instant-upload-photo-upload
**相关PR**: (待创建)
```

**步骤 2: 添加实施笔记**

在文档末尾添加：

```markdown
## 实施笔记

### 已完成的改进
1. ✅ 选择照片后立即上传，无需等待
2. ✅ 实时显示上传状态（上传中/成功/失败）
3. ✅ 支持重试失败的照片上传
4. ✅ 删除照片时同步删除COS文件
5. ✅ 添加确认完成按钮
6. ✅ 达到3张照片时自动隐藏上传按钮

### 已知限制
- 每次只能选择1张照片
- 不支持批量上传（未来可优化）

### 用户反馈
(待收集)
```

**步骤 3: 提交文档更新**

```bash
git add docs/plans/2026-01-28-production-task-instant-upload-design.md
git commit -m "docs(instant-upload): mark design as implemented"
```

---

## Task 17: 合并到主分支

**目标:** 将实施完成的功能合并回主分支

**步骤 1: 切换回主分支并更新**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git checkout main
git pull origin main
```

**步骤 2: 合并feature分支**

```bash
git merge feature/instant-upload-photo-upload --no-ff -m "Merge branch 'feature/instant-upload-photo-upload'

Implement instant photo upload feature:
- Photos upload immediately after selection
- Real-time upload status feedback
- Retry failed uploads
- Complete task button with 2-3 photos
- Delete photos from COS storage"
```

**步骤 3: 推送到远程**

```bash
git push origin main
```

**步骤 4: 删除worktree（可选）**

```bash
git worktree remove .worktrees/instant-upload
git branch -d feature/instant-upload-photo-upload
```

---

## 实施完成检查清单

在认为实施完成前，确认以下所有项：

### 功能完整性
- [ ] 选择照片后立即开始上传
- [ ] 上传中显示loading状态
- [ ] 上传成功后照片显示在预览区
- [ ] 上传失败后显示错误和重试按钮
- [ ] 点击重试能重新上传
- [ ] 达到3张照片时上传按钮隐藏
- [ ] 删除照片时调用后端API删除COS文件
- [ ] 照片数量<2时确认完成按钮隐藏
- [ ] 点击确认完成能成功提交任务
- [ ] 提交成功后显示提示并返回列表

### 代码质量
- [ ] 无TypeScript类型错误
- [ ] 无ESLint警告
- [ ] 代码格式化正确
- [ ] 移除了所有未使用的代码
- [ ] 提交信息清晰规范

### 测试
- [ ] 编译成功无错误
- [ ] 手动测试所有场景通过
- [ ] 后端API验证通过
- [ ] 边界情况处理正确

### 文档
- [ ] 设计文档已更新状态
- [ ] 实施笔记已添加
- [ ] 代码注释清晰

### Git管理
- [ ] 所有更改已提交
- [ ] 提交信息符合规范
- [ ] 分支已合并到main
- [ ] 远程仓库已更新
