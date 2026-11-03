# 生产任务详情页即时上传功能设计

**日期**: 2026-01-28
**作者**: Claude
**状态**: 设计阶段

---

## 一、需求概述

### 当前问题
用户需要先选择所有照片，然后点击"确认上传"按钮才能批量上传。这种模式有以下问题：
- 用户体验不佳，不能即时看到上传结果
- 上传失败时无法快速定位是哪张照片失败
- 不符合现代应用"即选即传"的交互习惯

### 改进目标
1. **即时上传**：选择照片后立即上传到腾讯云COS，无需等待
2. **状态反馈**：清晰显示每张照片的上传状态（上传中/成功/失败）
3. **独立操作**：每张照片独立上传，互不影响
4. **完成确认**：照片满足要求（2-3张）后，点击"确认完成"提交任务

---

## 二、整体架构设计

### 2.1 状态管理

页面使用 Vue 3 Composition API 管理以下状态：

```typescript
// 任务详情
const taskDetail = ref<PackagingUnitDetail | null>(null);

// 已上传成功的照片URL数组
const uploadedPhotos = ref<string[]>([]);

// 正在上传的照片任务数组
interface UploadTask {
  id: number;
  file: string; // 本地临时文件路径
  status: 'uploading' | 'error';
  progress: number;
  error?: string;
}
const uploadingPhotos = ref<UploadTask[]>([]);

// 是否正在提交完成操作
const isCompleting = ref(false);
```

### 2.2 数据流

#### 上传流程

```
用户点击"上传照片"
  ↓
uni.chooseMedia 选择照片
  ↓
uni.compressImage 压缩到200KB以内
  ↓
创建上传任务对象 { id, file, status: 'uploading' }
  ↓
添加到 uploadingPhotos 数组
  ↓
显示 loading 占位符
  ↓
调用 uni.uploadFile 上传到后端
  ↓
后端上传到COS，返回 photoUrl
  ↓
后端更新 packagingUnit.photosRaw 数组
  ↓
前端收到响应：
  ├─ 成功：从 uploadingPhotos 移除，添加到 uploadedPhotos
  └─ 失败：更新 task.status = 'error'，显示重试按钮
```

#### 删除流程

```
用户点击照片上的删除按钮（×）
  ↓
显示确认对话框："确认删除这张照片？"
  ↓
用户确认
  ↓
调用 DELETE /packaging-units/:id/photos API
  ↓
后端从 COS 删除文件，从 photosRaw 数组移除
  ↓
前端从 uploadedPhotos 移除
  ↓
如果 uploadedPhotos.length < 2
  ↓
隐藏"确认完成"按钮
```

#### 完成流程

```
用户点击"确认完成"按钮
  ↓
验证：uploadedPhotos.length >= 2
  ↓
设置 isCompleting = true，禁用按钮
  ↓
调用 POST /packaging-units/:id/complete API
  ↓
成功：
  ├─ toast 提示"制作完成"
  ├─ 延迟 1 秒
  └─ uni.navigateBack() 返回列表页

失败：
  ├─ toast 提示错误信息
  ├─ isCompleting = false
  └─ 允许用户重试
```

---

## 三、UI组件设计

### 3.1 照片上传区域结构

```
┌─────────────────────────────────────────┐
│ 备料照片（必填，2-3张）  当前：2/3       │
├─────────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  │
│  │图1  │  │图2  │  │🔄   │  │  +  │  │
│  │     │  │     │  │上传中│  │上传 │  │
│  │  ×  │  │  ×  │  │     │  │照片 │  │
│  └─────┘  └─────┘  └─────┘  └─────┘  │
│   已上传   已上传   上传中    上传按钮   │
└─────────────────────────────────────────┘
│ 支持从相册选择或拍照，自动压缩到200KB以内 │
└─────────────────────────────────────────┘
```

### 3.2 照片状态样式

#### 状态1：正在上传
- 灰色占位符（#f0f0f0）
- 居中显示旋转的 loading 图标
- 下方显示"上传中..."文字（灰色）

#### 状态2：上传失败
- 红色边框（#ff4d4f）
- 背景色偏红（#fff2f0）
- 错误图标（⚠️）
- 下方显示"上传失败"文字（红色）
- 重试按钮（橙色）

#### 状态3：已上传成功
- 正常显示照片
- 右上角删除按钮
  - 半透明圆形背景
  - 灰色 × 图标
  - hover 时变为红色

### 3.3 确认完成按钮

**位置**：页面内容最下方（非 fixed 定位）

**显示条件**：
```typescript
uploadedPhotos.value.length >= 2
&& uploadedPhotos.value.length <= 3
```

**样式**：
- 全宽按钮
- 主色调背景色（#1890ff）
- 白色文字
- 禁用状态：灰色背景（#d9d9d9）

**状态变化**：
- 默认：可点击
- 提交中：loading 图标 + "提交中..."文字，禁用

---

## 四、交互流程详解

### 4.1 上传照片完整流程

```typescript
// 1. 用户触发
用户点击"上传照片"按钮

// 2. 选择照片
const res = await uni.chooseMedia({
  count: 1,  // 每次只选1张
  mediaType: ['image'],
  sourceType: ['album', 'camera']
});

// 3. 压缩照片
const compressed = await uni.compressImage({
  src: res.tempFiles[0].tempFilePath,
  quality: 80,
  compressedWidth: 1200
});

// 4. 创建上传任务
const task: UploadTask = {
  id: Date.now(),
  file: compressed.tempFilePath,
  status: 'uploading',
  progress: 0
};
uploadingPhotos.value.push(task);

// 5. 立即开始上传（不等待用户操作）
uploadSinglePhoto(task);
```

### 4.2 单张照片上传实现

```typescript
const uploadSinglePhoto = async (task: UploadTask) => {
  try {
    // 调用上传 API
    const response = await uploadProductionPhoto(
      taskId.value,
      task.file
    );

    // 成功：从上传列表移除，添加到已上传列表
    uploadingPhotos.value = uploadingPhotos.value.filter(
      t => t.id !== task.id
    );
    uploadedPhotos.value.push(response.photoUrl);

    // 成功提示（可选，避免打扰）
    // uni.showToast({ title: '上传成功', icon: 'success', duration: 1000 });

  } catch (error) {
    // 失败：更新任务状态
    task.status = 'error';
    task.error = error.message;
  }
};
```

### 4.3 重试上传

```typescript
const retryUpload = async (task: UploadTask) => {
  // 重置状态
  task.status = 'uploading';
  task.error = undefined;

  // 重新上传
  await uploadSinglePhoto(task);
};
```

### 4.4 删除照片

```typescript
const deletePhoto = async (index: number) => {
  const photoUrl = uploadedPhotos.value[index];

  // 确认对话框
  uni.showModal({
    title: '确认删除',
    content: '确认删除这张照片？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // 调用删除 API
          await deleteProductionPhoto(taskId.value, photoUrl);

          // 从本地移除
          uploadedPhotos.value.splice(index, 1);

          // 成功提示
          uni.showToast({ title: '删除成功', icon: 'success' });

        } catch (error) {
          uni.showToast({
            title: error.message || '删除失败',
            icon: 'none'
          });
        }
      }
    }
  });
};
```

### 4.5 确认完成

```typescript
const completeTask = async () => {
  // 验证照片数量
  if (uploadedPhotos.value.length < 2) {
    uni.showToast({
      title: '请至少上传2张备料照片',
      icon: 'none'
    });
    return;
  }

  // 防止重复提交
  if (isCompleting.value) return;

  isCompleting.value = true;

  try {
    // 调用完成 API
    await completeProductionTask(taskId.value);

    // 成功提示
    uni.showToast({ title: '制作完成', icon: 'success' });

    // 延迟返回
    setTimeout(() => {
      uni.navigateBack();
    }, 1000);

  } catch (error) {
    // 失败处理
    uni.showToast({
      title: error.message || '操作失败',
      icon: 'none'
    });
  } finally {
    isCompleting.value = false;
  }
};
```

---

## 五、错误处理策略

### 5.1 上传失败分类处理

| 错误类型 | 表现 | 处理方式 | 用户操作 |
|---------|------|---------|---------|
| 网络错误 | 超时/中断 | 显示"上传失败" | 重试或删除 |
| 服务器错误 (500) | 后端异常 | 显示服务器错误消息 | 重试或删除 |
| 业务错误 (400) | 数量超限/状态错误 | 显示具体错误提示 | 根据提示操作 |
| 文件错误 | 格式/大小不符 | 立即 toast 提示 | 重新选择 |

### 5.2 边界情况处理

#### 快速连续点击
```typescript
// 防御：上传中的照片不允许重复上传
const isUploading = computed(() =>
  uploadingPhotos.value.some(t => t.status === 'uploading')
);

const choosePhoto = async () => {
  if (isUploading.value) {
    uni.showToast({
      title: '请等待当前照片上传完成',
      icon: 'none'
    });
    return;
  }
  // ... 选择照片逻辑
};
```

#### 退出页面时未完成上传
```typescript
// 页面生命周期处理
onShow(() => {
  // 检查是否有未完成的上传
  const pending = uploadingPhotos.value.filter(
    t => t.status === 'uploading'
  );

  if (pending.length > 0) {
    uni.showModal({
      title: '提示',
      content: '有照片正在上传，是否继续等待？',
      confirmText: '继续等待',
      cancelText: '放弃上传',
      success: (res) => {
        if (!res.confirm) {
          // 取消上传
          uploadingPhotos.value = [];
        }
      }
    });
  }
});
```

#### COS删除失败
```typescript
// 前端：视为删除成功（不影响用户体验）
// 后端：记录warning日志
// 定期清理：后台任务清理未被引用的照片
```

#### 状态冲突
```typescript
// 其他设备已完成任务
catch (error) {
  if (error.code === 409) {
    uni.showModal({
      title: '提示',
      content: '任务状态已变更，即将刷新页面',
      showCancel: false,
      success: () => {
        // 强制刷新并返回
        uni.navigateBack();
      }
    });
  }
}
```

---

## 六、API接口

### 6.1 上传照片（已存在，复用）

**端点**: `POST /api/v1/staff/production/packaging-units/:id/photos`

**请求**:
- Method: POST
- Content-Type: multipart/form-data
- Body: files (单个文件)

**响应**:
```json
{
  "code": 0,
  "message": "照片上传成功",
  "data": {
    "photosRaw": ["https://xxx.cos.ap-guangzhou.myqcloud.com/..."]
  }
}
```

### 6.2 删除照片（已实现）

**端点**: `DELETE /api/v1/staff/production/packaging-units/:id/photos`

**请求**:
```json
{
  "photoUrl": "https://xxx.cos.ap-guangzhou.myqcloud.com/..."
}
```

**响应**:
```json
{
  "code": 0,
  "message": "照片删除成功",
  "data": {
    "id": "uuid",
    "photosRaw": []
  }
}
```

### 6.3 完成任务（已存在，复用）

**端点**: `POST /api/v1/staff/production/packaging-units/:id/complete`

**请求**: 无需 body

**响应**:
```json
{
  "code": 0,
  "message": "制作完成",
  "data": {
    "id": "uuid",
    "status": "COMPLETED"
  }
}
```

**副作用**:
- PackagingUnit 状态: IN_PROGRESS → COMPLETED
- 关联的所有 Order 状态: PRODUCTION → FREEZING

---

## 七、技术实现要点

### 7.1 图片压缩

```typescript
const compressImage = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src: filePath,
      quality: 80,
      compressedWidth: 1200,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(err)
    });
  });
};
```

### 7.2 上传进度监听（可选）

```typescript
const uploadTask = uni.uploadFile({
  url: uploadUrl,
  filePath: file,
  name: 'files',
  success: (res) => { /* ... */ },
  fail: (err) => { /* ... */ }
});

// 监听上传进度
uploadTask.onProgressUpdate((res) => {
  task.progress = res.progress;
});
```

### 7.3 照片预览

```typescript
const previewPhoto = (url: string) => {
  uni.previewImage({
    urls: uploadedPhotos.value,
    current: url
  });
};
```

---

## 八、测试计划

### 8.1 功能测试

#### 上传功能
- [ ] 选择1张照片后立即开始上传
- [ ] 上传中显示loading状态
- [ ] 上传成功后照片显示在预览区
- [ ] 上传失败后显示重试按钮
- [ ] 点击重试能重新上传失败的照片
- [ ] 达到3张照片时，上传按钮自动隐藏
- [ ] 删除1张照片后，上传按钮重新显示

#### 删除功能
- [ ] 点击已上传照片的删除按钮能弹出确认对话框
- [ ] 确认后能成功删除照片
- [ ] 删除后照片数量<2时，确认完成按钮隐藏
- [ ] 删除失败时显示错误提示

#### 完成功能
- [ ] 照片数量>=2时，确认完成按钮显示
- [ ] 点击确认完成能成功提交
- [ ] 提交成功后显示成功提示
- [ ] 提交成功后1秒后自动返回列表页
- [ ] 提交失败时显示错误信息
- [ ] 提交失败后允许重试

### 8.2 边界测试

- [ ] 快速连续点击上传按钮
- [ ] 上传过程中退出页面再返回
- [ ] 网络断开时上传照片
- [ ] 上传最后一张照片时达到上限
- [ ] 删除最后一张已上传照片
- [ ] 其他设备同时修改任务状态
- [ ] 选择超大图片（>10MB）
- [ ] 选择非图片文件

### 8.3 性能测试

- [ ] 上传3MB照片的压缩时间
- [ ] 上传到COS的响应时间
- [ ] 多张照片同时上传时的内存占用
- [ ] 页面滚动流畅度

### 8.4 兼容性测试

- [ ] iOS微信小程序
- [ ] Android微信小程序
- [ ] 不同网络环境（WiFi/4G/弱网）

---

## 九、实施步骤

### 阶段1：前端改造（优先级：高）
1. 修改 `choosePhoto` 函数，选择照片后立即上传
2. 添加 `uploadingPhotos` 状态管理
3. 实现上传任务状态组件（loading/错误/重试）
4. 修改删除逻辑，调用删除API
5. 添加"确认完成"按钮和相关逻辑

### 阶段2：UI优化（优先级：中）
1. 优化上传状态的视觉反馈
2. 添加照片预览功能
3. 优化按钮显示/隐藏逻辑
4. 添加操作引导提示

### 阶段3：测试和修复（优先级：高）
1. 功能测试
2. 边界测试
3. 性能测试
4. 修复发现的问题

---

## 十、风险评估

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| COS上传不稳定 | 高 | 中 | 添加重试机制，失败时允许用户手动重试 |
| 并发上传冲突 | 中 | 低 | 后端使用累加模式，避免覆盖 |
| 内存占用过高 | 中 | 低 | 限制同时上传数量，压缩图片 |

### 10.2 用户体验风险

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| 上传失败率高 | 高 | 中 | 清晰的错误提示，便捷的重试入口 |
| 误删照片 | 中 | 低 | 删除前二次确认 |
| 不理解新流程 | 低 | 低 | 保持原有操作习惯，简化流程 |

---

## 十一、后续优化建议

1. **批量上传**：未来可支持一次选择多张照片，依次上传
2. **断点续传**：大文件上传失败后支持断点续传
3. **照片编辑**：上传前支持简单的裁剪、旋转等编辑
4. **AI识别**：上传后自动识别食材类型，辅助质量检查
5. **离线缓存**：支持离线选择照片，联网后自动上传

---

**附录：相关文档**

- [微信小程序上传文件API](https://developers.weixin.qq.com/miniprogram/dev/api/network/upload/wx.uploadFile.html)
- [腾讯云COS存储最佳实践](https://cloud.tencent.com/document/product/436/14672)
- [Vue 3 Composition API](https://cn.vuejs.org/guide/extras/composition-api-faq.html)
