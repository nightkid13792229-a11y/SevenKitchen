# 过敏记录板块重构设计方案

**创建日期：** 2025-01-25
**设计目标：** 重构过敏食物板块，支持手动输入和上传过敏检测报告，与病史/体检记录保持一致的交互体验

---

## 一、需求概述

### 当前问题
- 过敏食物只有一个简单的文本框，用户只能手动输入
- 无法上传过敏检测报告（图片/PDF）
- 与病史/体检记录的功能不一致

### 目标
1. ✅ 保留手动输入过敏食物的功能
2. ✅ 新增上传过敏检测报告功能（类似体检/病史记录）
3. ✅ 支持多次检测记录的历史追踪
4. ✅ 所有保存操作立即同步到后端，不暂存

---

## 二、数据结构设计

### 前端 TypeScript 接口
```typescript
interface AllergyRecord {
  id?: string              // 记录ID（用于编辑）
  testDate: string         // 检测日期（必填）
  allergens?: string       // 过敏原描述，如"鸡肉、牛肉、小麦"（选填）
  notes?: string          // 备注说明，如"皮试结果"、"血液检测"（选填）
  attachments?: string[]  // 检测报告文件URL数组（选填）
}
```

### 后端数据库设计
在 `Dog` Prisma模型中添加：
```prisma
model Dog {
  // ... 现有字段

  // 新增过敏记录字段
  allergyRecords      Json?    @map("allergy_records") @db.JsonB

  // 保留向后兼容
  allergyFoods        String?  @map("allergy_foods") @db.Text
}
```

### JSON存储格式示例
```json
[
  {
    "id": "uuid-1234",
    "testDate": "2024-01-15",
    "allergens": "鸡肉、牛肉、小麦",
    "notes": "血液检测IgE升高",
    "attachments": ["https://cos.sevenkitchen.cloud/allergy-reports/xxx.pdf"]
  },
  {
    "id": "uuid-5678",
    "testDate": "2023-06-10",
    "allergens": "玉米、大豆",
    "notes": "皮试阳性反应",
    "attachments": ["https://cos.sevenkitchen.cloud/allergy-reports/yyy.jpg"]
  }
]
```

---

## 三、UI设计

### 页面布局
在"健康记录"分区中，过敏记录位于挑食食物之前：

```
健康记录
├── 病史记录（卡片列表）
├── 体检记录（卡片列表）
├── ⭐ 过敏记录（卡片列表）← 新增
│   ├── 2024-01-15的检测
│   │   ├── 过敏原：鸡肉、牛肉、小麦
│   │   ├── 备注：血液检测IgE升高
│   │   ├── 📄 2份报告
│   │   └── [编辑] [删除]
│   ├── 2023-06-10的检测
│   └── [+ 添加过敏检测记录]
└── 挑食食物（文本框）
```

### 弹窗设计
```
┌─────────────────────────────┐
│ 编辑过敏检测记录             │
├─────────────────────────────┤
│ 检测日期 * [选择日期]        │
│                             │
│ 过敏原描述                   │
│ [例：鸡肉、牛肉、小麦等]     │
│                             │
│ 备注说明                     │
│ [例：皮试结果、血液检测等]   │
│                             │
│ 检测报告                     │
│ 📄 2024-01-15_报告.pdf       │
│    [预览] [重命名] [删除]    │
│                             │
│ [📷 上传图片] [📄 上传PDF]   │
│                             │
│        [取消] [保存]         │
└─────────────────────────────┘
```

### 样式复用
完全复用病史/体检记录的样式类：
- `.record-section` - 记录区块容器
- `.record-card` - 单条记录卡片
- `.record-header` - 记录头部（日期+操作按钮）
- `.record-content` - 记录内容区域
- `.uploaded-file-item` - 已上传文件项
- `.upload-buttons` - 上传按钮组

---

## 四、交互流程

### 添加记录
1. 用户点击"+ 添加过敏检测记录"
2. 弹窗打开，表单字段为空
3. 用户填写检测日期（必填）、过敏原、备注
4. 用户上传检测报告（图片或PDF）
5. 点击"保存" → 调用 `POST /dogs/:dogId/allergy-records`
6. API返回新记录（含id）
7. 更新本地 `formData.allergyRecords`
8. 提示"添加成功"，弹窗关闭

### 编辑记录
1. 用户点击某条记录的"编辑"
2. 弹窗打开，表单预填充该记录数据
3. 用户修改任何内容（包括删除/重命名附件）
4. 点击"保存" → 调用 `PUT /dogs/:dogId/allergy-records/:id`
5. 提示"更新成功"
6. 弹窗关闭，卡片列表立即更新

### 删除记录
1. 用户点击"删除"
2. 确认对话框："确定要删除这条过敏记录吗？"
3. 调用 `DELETE /dogs/:dogId/allergy-records/:id`
4. API成功后，从本地数组移除
5. 提示"删除成功"

### 文件上传
1. 点击"上传图片" → `uni.chooseImage` → 上传到后端 → 保存URL和COS key
2. 点击"上传PDF" → `uni.chooseMessageFile` → 上传到后端 → 保存URL和COS key
3. 文件预览：图片直接预览，PDF下载后打开
4. 文件删除：调用后端API，同时删除COS文件

---

## 五、前端状态管理

### 状态变量
```typescript
// 过敏记录相关状态
const showAllergyModal = ref(false)                    // 弹窗显示状态
const isEditingAllergyRecord = ref(false)              // 是否编辑模式
const currentAllergyRecordIndex = ref(-1)              // 当前编辑索引
const currentAllergyRecord = ref<AllergyRecord>({      // 当前记录数据
  testDate: '',
  allergens: '',
  notes: '',
  attachments: []
})
const allergyAttachmentKeys = ref<Record<number, string>>({})     // COS key存储
const allergyAttachmentNames = ref<Record<number, string>>({})    // 自定义文件名
```

### 核心函数
- `addAllergyRecord()` - 打开添加弹窗
- `editAllergyRecord(index)` - 打开编辑弹窗
- `saveAllergyRecord()` - 保存记录（调用API）
- `deleteAllergyRecord(index)` - 删除记录（调用API）
- `closeAllergyModal()` - 关闭弹窗
- `chooseAllergyImage()` - 选择图片
- `chooseAllergyPDF()` - 选择PDF
- `uploadAllergyFile()` - 上传文件到后端
- `removeAllergyAttachment()` - 删除附件
- `previewAllergyFile()` - 预览文件
- `renameAllergyAttachment()` - 重命名文件
- `getAllergyFileName()` - 获取文件名

---

## 六、后端API设计

### 端点列表

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/dogs/:dogId/allergy-records` | 创建过敏记录 |
| PUT | `/dogs/:dogId/allergy-records/:id` | 更新过敏记录 |
| DELETE | `/dogs/:dogId/allergy-records/:id` | 删除过敏记录 |
| POST | `/dogs/allergy-records/upload-attachment` | 上传附件 |
| DELETE | `/dogs/allergy-records/attachments` | 删除附件 |
| GET | `/dogs/:id` | 获取档案（包含过敏记录） |

### 请求/响应格式

**创建记录：**
```typescript
POST /dogs/{dogId}/allergy-records

Request Body:
{
  "testDate": "2024-01-15",
  "allergens": "鸡肉、牛肉、小麦",
  "notes": "血液检测IgE升高",
  "attachments": ["https://cos.sevenkitchen.cloud/..."]
}

Response (200):
{
  "success": true,
  "data": {
    "id": "uuid-1234",
    "testDate": "2024-01-15",
    "allergens": "鸡肉、牛肉、小麦",
    "notes": "血液检测IgE升高",
    "attachments": ["https://cos.sevenkitchen.cloud/..."]
  }
}
```

**更新记录：**
```typescript
PUT /dogs/{dogId}/allergy-records/{recordId}

Request Body: 同上

Response (200):
{
  "success": true,
  "data": { /* 更新后的记录 */ }
}
```

**删除记录：**
```typescript
DELETE /dogs/{dogId}/allergy-records/{recordId}

Response (200):
{
  "success": true,
  "data": null,
  "message": "删除成功"
}
```

---

## 七、实施要点

### 前端开发
1. 在 `miniapp/src/pages/dog-create/index.vue` 添加过敏记录UI
2. 实现状态变量和核心函数（约400行代码）
3. 完全复用病史/体检记录的样式和交互逻辑
4. 确保文件上传、预览、删除功能正常

### 后端开发
1. 在 `schema.prisma` 添加 `allergyRecords` 字段
2. 在 `dogs.controller.ts` 添加5个新端点（约200行代码）
3. 执行数据库迁移
4. 更新 `getDogProfile` 返回过敏记录数据

### 关键技术点
1. **立即同步：** 所有保存操作不暂存，直接调用API
2. **COS文件管理：** 上传时保存key，删除时同步删除COS文件
3. **向后兼容：** 保留 `allergyFoods` 字段，避免破坏现有数据
4. **权限验证：** 所有API验证用户是否有权操作该狗狗档案
5. **错误处理：** 完善的错误提示和加载状态

### 测试要点
1. 创建档案时添加过敏记录
2. 编辑现有过敏记录（修改文字、上传/删除文件）
3. 删除过敏记录
4. 图片预览和PDF打开
5. 离线档案页面查看过敏记录
6. 跨设备数据同步

---

## 八、用户价值

### 改进前
- ❌ 只能手动输入过敏食物
- ❌ 无法上传检测报告
- ❌ 信息展示不直观

### 改进后
- ✅ 可以手动记录过敏原
- ✅ 支持上传图片和PDF检测报告
- ✅ 记录每次检测的历史
- ✅ 与病史/体检记录体验一致
- ✅ 所有操作立即保存，数据安全

---

## 九、参考资料

- 现有病史记录实现：`miniapp/src/pages/dog-create/index.vue:2000-2300`
- 现有体检记录实现：`miniapp/src/pages/dog-create/index.vue:2650-2950`
- COS文件上传服务：`backend/src/interfaces/controllers/dogs.controller.ts:934-1100`
- 前端设计蓝图：`docs/03_Features_and_UI_Blueprints.md`
