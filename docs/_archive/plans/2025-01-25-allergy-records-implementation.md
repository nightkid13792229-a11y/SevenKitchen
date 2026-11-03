# 过敏记录重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 重构过敏食物板块，支持手动输入和上传过敏检测报告，与病史/体检记录保持一致的交互体验

**架构:** 前后端分离，前端使用Vue 3 + uni-app，后端使用NestJS + Prisma + PostgreSQL，过敏记录存储为JSONB字段，文件存储在腾讯云COS

**技术栈:** Vue 3 Composition API, TypeScript, Prisma ORM, NestJS, 腾讯云COS, uni-app

---

## Task 1: 数据库Schema添加allergyRecords字段

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Test: 手动测试数据库迁移

**Step 1: 在Dog模型中添加allergyRecords字段**

在 `backend/prisma/schema.prisma` 的 `model Dog` 中添加：

```prisma
model Dog {
  // ... 现有字段，找到 allergyFoods 字段附近

  // 新增过敏记录字段（添加在 allergyFoods 后面）
  allergyRecords      Json?    @map("allergy_records") @db.JsonB

  // 保留向后兼容
  allergyFoods        String?  @map("allergy_foods") @db.Text
}
```

**Step 2: 生成并运行数据库迁移**

```bash
cd backend
npx prisma migrate dev --name add_allergy_records
```

Expected output:
```
✔ Generated Prisma Client
✔ The following migration has been created and applied from new schema changes:
migrations/XXXXXX_add_allergy_records/migration.sql
```

**Step 3: 验证迁移成功**

```bash
npx prisma db push
```

Expected output:
```
✔ The database is now in sync with the Prisma schema
```

**Step 4: 提交数据库迁移**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/prisma/backend/prisma/migrations/
git commit -m "feat: 添加allergyRecords字段到Dog模型

- 添加JsonB字段存储过敏记录数组
- 保留allergyFoods字段以向后兼容"
```

---

## Task 2: 后端实现 - 上传附件API

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 在dogs.controller.ts中添加uploadAllergyAttachment方法**

在 `uploadCheckupAttachment` 方法后面（约第1000行）添加：

```typescript
@Post('allergy-records/upload-attachment')
@UseGuards(AuthGuard)
@ApiOperation({ summary: 'Upload allergy record attachment (image/PDF)' })
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        format: 'binary'
      }
    }
  }
})
async uploadAllergyAttachment(
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: RequestUser
): Promise<ApiResponseDto<{ url: string; key: string }>> {
  try {
    console.log('[DogsController] Uploading allergy attachment:', file.originalname)

    // 确定文件类型目录
    const fileType = 'allergy-reports'

    // 上传到COS
    const result = await this.cosService.uploadImage(file, fileType)

    console.log('[DogsController] Allergy attachment uploaded successfully:', result.url)
    return ApiResponseDto.success(result, '上传成功')
  } catch (error) {
    console.error('[DogsController] Upload allergy attachment failed:', error)
    throw new BadRequestException('文件上传失败')
  }
}
```

**Step 2: 添加FileInterceptor装饰器导入（如果缺少）**

确保文件顶部有：
```typescript
import { FileInterceptor } from '@nestjs/platform-express'
```

**Step 3: 提交上传附件API**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: 添加过敏记录附件上传API

- POST /dogs/allergy-records/upload-attachment
- 支持图片和PDF上传到COS
- 返回URL和key用于后续删除"
```

---

## Task 3: 后端实现 - 删除附件API

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 添加deleteAllergyAttachment方法**

在 `deleteCheckupAttachment` 方法后面（约第1100行）添加：

```typescript
@Delete('allergy-records/attachments')
@UseGuards(AuthGuard)
@ApiOperation({ summary: '删除过敏记录附件' })
async deleteAllergyAttachment(
  @Body() dto: { key: string }
): Promise<ApiResponseDto<any>> {
  try {
    console.log('[DogsController] Deleting allergy attachment from COS:', dto.key)

    await this.cosService.deleteImage(dto.key)

    console.log('[DogsController] Allergy attachment deleted successfully')
    return ApiResponseDto.success(null, '删除成功')
  } catch (error) {
    console.error('[DogsController] Delete allergy attachment failed:', error)
    throw new BadRequestException('删除失败')
  }
}
```

**Step 2: 提交删除附件API**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: 添加过敏记录附件删除API

- DELETE /dogs/allergy-records/attachments
- 从COS删除文件
- 需要提供key参数"
```

---

## Task 4: 后端实现 - 创建过敏记录API

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 添加createAllergyRecord方法**

在文件末尾（`getDogProfile` 方法之后）添加：

```typescript
@Post(':dogId/allergy-records')
@UseGuards(AuthGuard)
@ApiOperation({ summary: 'Create allergy record for a dog' })
@ApiParam({ name: 'dogId', description: 'Dog ID' })
async createAllergyRecord(
  @Param('dogId') dogId: string,
  @Body() createDto: {
    testDate: string
    allergens?: string
    notes?: string
    attachments?: string[]
  },
  @CurrentUser() user: RequestUser
): Promise<ApiResponseDto<any>> {
  try {
    console.log('[DogsController] Creating allergy record for dog:', dogId)

    // 验证狗狗归属
    const dog = await this.dogRepository.findById(dogId)
    if (!dog || dog.customerId !== user.customerId) {
      throw new ForbiddenException('无权访问此档案')
    }

    // 生成唯一ID
    const { v4: uuidv4 } = require('uuid')
    const recordId = uuidv4()

    // 获取现有记录
    const existingRecords = (dog.allergyRecords as any[]) || []

    // 添加新记录
    const newRecord = {
      id: recordId,
      testDate: createDto.testDate,
      allergens: createDto.allergens || null,
      notes: createDto.notes || null,
      attachments: createDto.attachments || []
    }

    existingRecords.push(newRecord)

    // 更新狗狗档案
    await this.dogRepository.update(dogId, {
      allergyRecords: existingRecords
    })

    console.log('[DogsController] Allergy record created successfully:', recordId)
    return ApiResponseDto.success(newRecord, '添加成功')
  } catch (error) {
    console.error('[DogsController] Create allergy record failed:', error)
    throw error
  }
}
```

**Step 2: 提交创建记录API**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: 添加创建过敏记录API

- POST /dogs/:dogId/allergy-records
- 生成唯一ID并添加到allergyRecords数组
- 验证用户权限
- 返回完整的记录数据"
```

---

## Task 5: 后端实现 - 更新过敏记录API

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 添加updateAllergyRecord方法**

在 `createAllergyRecord` 方法后面添加：

```typescript
@Put(':dogId/allergy-records/:id')
@UseGuards(AuthGuard)
@ApiOperation({ summary: 'Update allergy record' })
@ApiParam({ name: 'dogId', description: 'Dog ID' })
@ApiParam({ name: 'id', description: 'Record ID' })
async updateAllergyRecord(
  @Param('dogId') dogId: string,
  @Param('id') recordId: string,
  @Body() updateDto: {
    testDate: string
    allergens?: string
    notes?: string
    attachments?: string[]
  },
  @CurrentUser() user: RequestUser
): Promise<ApiResponseDto<any>> {
  try {
    console.log('[DogsController] Updating allergy record:', recordId, 'for dog:', dogId)

    // 验证狗狗归属
    const dog = await this.dogRepository.findById(dogId)
    if (!dog || dog.customerId !== user.customerId) {
      throw new ForbiddenException('无权访问此档案')
    }

    // 获取现有记录
    const existingRecords = (dog.allergyRecords as any[]) || []

    // 查找记录索引
    const recordIndex = existingRecords.findIndex(r => r.id === recordId)
    if (recordIndex === -1) {
      throw new NotFoundException('过敏记录不存在')
    }

    // 更新记录
    existingRecords[recordIndex] = {
      id: recordId,
      testDate: updateDto.testDate,
      allergens: updateDto.allergens || null,
      notes: updateDto.notes || null,
      attachments: updateDto.attachments || []
    }

    // 更新狗狗档案
    await this.dogRepository.update(dogId, {
      allergyRecords: existingRecords
    })

    console.log('[DogsController] Allergy record updated successfully:', recordId)
    return ApiResponseDto.success(existingRecords[recordIndex], '更新成功')
  } catch (error) {
    console.error('[DogsController] Update allergy record failed:', error)
    throw error
  }
}
```

**Step 2: 提交更新记录API**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: 添加更新过敏记录API

- PUT /dogs/:dogId/allergy-records/:id
- 验证记录归属和存在性
- 更新记录并同步到数据库
- 返回更新后的记录数据"
```

---

## Task 6: 后端实现 - 删除过敏记录API

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 添加deleteAllergyRecord方法**

在 `updateAllergyRecord` 方法后面添加：

```typescript
@Delete(':dogId/allergy-records/:id')
@UseGuards(AuthGuard)
@ApiOperation({ summary: 'Delete allergy record' })
@ApiParam({ name: 'dogId', description: 'Dog ID' })
@ApiParam({ name: 'id', description: 'Record ID' })
async deleteAllergyRecord(
  @Param('dogId') dogId: string,
  @Param('id') recordId: string,
  @CurrentUser() user: RequestUser
): Promise<ApiResponseDto<any>> {
  try {
    console.log('[DogsController] Deleting allergy record:', recordId, 'for dog:', dogId)

    // 验证狗狗归属
    const dog = await this.dogRepository.findById(dogId)
    if (!dog || dog.customerId !== user.customerId) {
      throw new ForbiddenException('无权访问此档案')
    }

    // 获取现有记录
    const existingRecords = (dog.allergyRecords as any[]) || []

    // 查找记录
    const recordExists = existingRecords.some(r => r.id === recordId)
    if (!recordExists) {
      throw new NotFoundException('过敏记录不存在')
    }

    // 过滤掉要删除的记录
    const filteredRecords = existingRecords.filter(r => r.id !== recordId)

    // 更新狗狗档案
    await this.dogRepository.update(dogId, {
      allergyRecords: filteredRecords
    })

    console.log('[DogsController] Allergy record deleted successfully:', recordId)
    return ApiResponseDto.success(null, '删除成功')
  } catch (error) {
    console.error('[DogsController] Delete allergy record failed:', error)
    throw error
  }
}
```

**Step 2: 提交删除记录API**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: 添加删除过敏记录API

- DELETE /dogs/:dogId/allergy-records/:id
- 验证记录归属和存在性
- 从allergyRecords数组中移除记录
- 同步更新到数据库"
```

---

## Task 7: 后端实现 - getDogProfile返回过敏记录

**Files:**
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

**Step 1: 在getDogProfile方法中加载过敏记录**

在 `checkupRecords` 加载代码之后（约第445行）添加：

```typescript
// Load allergy records
let allergyRecords: any[] | null = null;
try {
  const records = dog.allergyRecords as any[] || null;
  if (records && records.length > 0) {
    allergyRecords = records.map((record: any) => ({
      id: record.id,
      testDate: record.testDate,
      allergens: record.allergens || null,
      notes: record.notes || null,
      attachments: record.attachments || null
    }));
    console.log(`[DogsController] Loaded ${allergyRecords.length} allergy records for dog ${dogId}`);
  }
} catch (error: any) {
  console.warn(`[DogsController] Failed to load allergy records for dog ${dogId}:`, error.message);
}
```

**Step 2: 在返回的profile对象中添加allergyRecords字段**

找到 `return ApiResponseDto.success({ ... })` 部分，添加字段：

```typescript
return ApiResponseDto.success({
  // ... 现有字段，在 allergyFoods 附近添加
  allergyRecords: allergyRecords || [],
  allergyFoods: dog.allergyFoods || null, // 保留向后兼容
  // ... 其他字段
})
```

**Step 3: 提交getDogProfile修改**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: getDogProfile返回过敏记录数据

- 加载并格式化allergyRecords数组
- 保留allergyFoods字段以向后兼容
- 在profile对象中返回过敏记录"
```

---

## Task 8: 后端启动测试

**Files:**
- Test: 手动测试

**Step 1: 启动后端服务**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm run start:dev
```

Expected output: 服务启动在 `http://localhost:3001`

**Step 2: 测试上传附件API**

```bash
curl -X POST \
  http://localhost:3001/dogs/allergy-records/upload-attachment \
  -H 'X-Customer-Id: test-customer-id' \
  -F 'file=@/path/to/test.pdf'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "url": "https://cos.sevenkitchen.cloud/allergy-reports/xxx.pdf",
    "key": "allergy-reports/xxx.pdf"
  }
}
```

**Step 3: 记录后端测试通过**

如果有任何错误，修复后重新测试。通过后继续下一步。

---

## Task 9: 前端 - 添加TypeScript接口定义

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在文件顶部的接口定义区域添加AllergyRecord接口**

在 `CheckupRecord` 接口后面（约第890行）添加：

```typescript
// 过敏记录接口
interface AllergyRecord {
  id?: string             // 过敏记录ID（用于编辑）
  testDate: string        // 检测日期（必填）
  allergens?: string      // 过敏原描述（选填）
  notes?: string          // 备注说明（选填）
  attachments?: string[]  // 检测报告文件URL数组（选填）
}
```

**Step 2: 在DogFormData接口中添加allergyRecords字段**

找到 `interface DogFormData`，添加字段：

```typescript
interface DogFormData {
  // ... 现有字段

  // 新增过敏记录字段（替换或添加在allergyFoods附近）
  allergyRecords: AllergyRecord[]
  allergyFoods: string  // 保留向后兼容
  pickyFoods: string
}
```

**Step 3: 在formData初始值中添加allergyRecords**

找到 `const formData = ref<DogFormData>({...})`，添加：

```typescript
const formData = ref<DogFormData>({
  // ... 现有字段
  allergyRecords: [],  // 新增
  allergyFoods: '',
  pickyFoods: ''
})
```

**Step 4: 提交接口定义**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 添加过敏记录TypeScript接口定义

- 添加AllergyRecord接口
- 在DogFormData中添加allergyRecords字段
- 保留allergyFoods字段以向后兼容"
```

---

## Task 10: 前端 - 添加过敏记录状态变量

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在状态变量定义区域添加过敏记录相关状态**

在体检记录状态变量后面（约第1175行）添加：

```typescript
// 过敏记录相关状态变量
const showAllergyModal = ref(false)                    // 过敏记录弹窗显示状态
const isEditingAllergyRecord = ref(false)              // 是否正在编辑过敏记录
const currentAllergyRecordIndex = ref(-1)              // 当前编辑的过敏记录索引
const currentAllergyRecord = ref<AllergyRecord>({      // 当前编辑的过敏记录数据
  testDate: '',
  allergens: '',
  notes: '',
  attachments: []
})
const allergyAttachmentKeys = ref<Record<number, string>>({})     // 存储COS key
const allergyAttachmentNames = ref<Record<number, string>>({})    // 自定义文件名
```

**Step 2: 提交状态变量**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 添加过敏记录状态变量

- 添加弹窗控制状态
- 添加当前记录数据
- 添加附件key和名称映射"
```

---

## Task 11: 前端 - 实现添加/编辑/删除/关闭函数

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 添加addAllergyRecord函数**

在 `deleteCheckupRecord` 函数后面添加：

```typescript
/**
 * 添加过敏记录
 */
function addAllergyRecord() {
  if (!dogId.value) {
    uni.showToast({
      title: '请先保存狗狗档案',
      icon: 'none'
    })
    return
  }

  isEditingAllergyRecord.value = false
  currentAllergyRecord.value = {
    testDate: '',
    allergens: '',
    notes: '',
    attachments: []
  }
  allergyAttachmentKeys.value = {}
  allergyAttachmentNames.value = {}
  showAllergyModal.value = true
}
```

**Step 2: 添加editAllergyRecord函数**

```typescript
/**
 * 编辑过敏记录
 */
function editAllergyRecord(index: number) {
  isEditingAllergyRecord.value = true
  currentAllergyRecordIndex.value = index
  // 深拷贝当前记录
  currentAllergyRecord.value = { ...formData.value.allergyRecords[index] }
  showAllergyModal.value = true
}
```

**Step 3: 添加deleteAllergyRecord函数**

```typescript
/**
 * 删除过敏记录
 */
function deleteAllergyRecord(index: number) {
  const record = formData.value.allergyRecords[index]

  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条过敏记录吗？',
    success: async (res) => {
      if (res.confirm && record.id && dogId.value) {
        try {
          uni.showLoading({ title: '删除中...' })

          await request({
            url: `/dogs/${dogId.value}/allergy-records/${record.id}`,
            method: 'DELETE'
          })

          formData.value.allergyRecords.splice(index, 1)

          uni.hideLoading()
          uni.showToast({ title: '删除成功', icon: 'success' })
        } catch (error: any) {
          uni.hideLoading()
          uni.showToast({ title: error.message || '删除失败', icon: 'none' })
        }
      }
    }
  })
}
```

**Step 4: 添加closeAllergyModal函数**

```typescript
/**
 * 关闭过敏记录弹窗
 */
function closeAllergyModal() {
  showAllergyModal.value = false
  currentAllergyRecord.value = {
    testDate: '',
    allergens: '',
    notes: '',
    attachments: []
  }
}
```

**Step 5: 提交CRUD基础函数**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 添加过敏记录CRUD基础函数

- addAllergyRecord: 打开添加弹窗
- editAllergyRecord: 打开编辑弹窗
- deleteAllergyRecord: 调用API删除记录
- closeAllergyModal: 关闭弹窗"
```

---

## Task 12: 前端 - 实现保存函数（API调用）

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 添加saveAllergyRecord函数**

在 `closeAllergyModal` 函数后面添加：

```typescript
/**
 * 保存过敏记录
 */
async function saveAllergyRecord() {
  // 验证必填字段
  if (!currentAllergyRecord.value.testDate) {
    uni.showToast({ title: '请选择检测日期', icon: 'none' })
    return
  }

  if (isEditingAllergyRecord.value && dogId.value && currentAllergyRecord.value.id) {
    // 编辑模式：调用PUT更新
    try {
      uni.showLoading({ title: '保存中...' })

      const recordId = currentAllergyRecord.value.id
      const updateData = {
        testDate: currentAllergyRecord.value.testDate,
        allergens: currentAllergyRecord.value.allergens || null,
        notes: currentAllergyRecord.value.notes || null,
        attachments: currentAllergyRecord.value.attachments || []
      }

      await request({
        url: `/dogs/${dogId.value}/allergy-records/${recordId}`,
        method: 'PUT',
        data: updateData
      })

      // 更新本地数据
      formData.value.allergyRecords[currentAllergyRecordIndex.value] = {
        id: recordId,
        ...updateData
      }

      uni.hideLoading()
      uni.showToast({ title: '更新成功', icon: 'success' })
      closeAllergyModal()
    } catch (error: any) {
      uni.hideLoading()
      uni.showToast({ title: error.message || '更新失败', icon: 'none' })
    }
  } else {
    // 新增模式：调用POST创建
    try {
      uni.showLoading({ title: '保存中...' })

      const createData = {
        testDate: currentAllergyRecord.value.testDate,
        allergens: currentAllergyRecord.value.allergens || null,
        notes: currentAllergyRecord.value.notes || null,
        attachments: currentAllergyRecord.value.attachments || []
      }

      const res = await request({
        url: `/dogs/${dogId.value}/allergy-records`,
        method: 'POST',
        data: createData
      })

      // API返回的记录包含id
      const newRecord = {
        id: res.data.id,
        ...createData
      }

      formData.value.allergyRecords.push(newRecord)

      uni.hideLoading()
      uni.showToast({ title: '添加成功', icon: 'success' })
      closeAllergyModal()
    } catch (error: any) {
      uni.hideLoading()
      uni.showToast({ title: error.message || '添加失败', icon: 'none' })
    }
  }
}
```

**Step 2: 添加onAllergyDateChange函数**

```typescript
/**
 * 过敏检测日期选择变更
 */
function onAllergyDateChange(e: any) {
  currentAllergyRecord.value.testDate = e.detail.value
}
```

**Step 3: 提交保存函数**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 实现过敏记录保存函数

- saveAllergyRecord: 调用API创建或更新记录
- 编辑模式使用PUT,新增模式使用POST
- 保存成功后同步更新本地formData
- onAllergyDateChange: 日期选择变更处理"
```

---

## Task 13: 前端 - 实现文件上传函数

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 添加chooseAllergyImage函数**

在日期选择函数后面添加：

```typescript
/**
 * 选择过敏记录图片
 */
function chooseAllergyImage() {
  uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      res.tempFilePaths.forEach((filePath: string) => {
        uploadAllergyFile(filePath, 'image')
      })
    },
    fail: (err) => {
      console.error('[DogCreate] Choose image failed:', err)
      uni.showToast({ title: '选择图片失败', icon: 'none' })
    }
  })
}
```

**Step 2: 添加chooseAllergyPDF函数**

```typescript
/**
 * 选择过敏记录PDF
 */
function chooseAllergyPDF() {
  uni.chooseMessageFile({
    count: 9,
    type: 'file',
    extension: ['pdf'],
    success: (res) => {
      res.tempFiles.forEach((file: any) => {
        uploadAllergyFile(file.path, 'pdf')
      })
    },
    fail: (err) => {
      console.error('[DogCreate] Choose PDF failed:', err)
      uni.showToast({ title: '选择文件失败', icon: 'none' })
    }
  })
}
```

**Step 3: 添加uploadAllergyFile函数**

```typescript
/**
 * 上传过敏记录文件到后端
 */
async function uploadAllergyFile(filePath: string, fileType: 'image' | 'pdf') {
  try {
    uni.showLoading({ title: '上传中...' })

    const token = getToken()
    const baseUrl = getBaseUrl()

    const uploadRes = await uni.uploadFile({
      url: `${baseUrl}/dogs/allergy-records/upload-attachment`,
      filePath: filePath,
      name: 'file',
      header: {
        'X-Customer-Id': token
      }
    })

    uni.hideLoading()

    if (uploadRes.statusCode === 200) {
      const data = JSON.parse(uploadRes.data)
      if (data.success) {
        // 保存URL
        const currentIndex = currentAllergyRecord.value.attachments!.length
        currentAllergyRecord.value.attachments!.push(data.data.url)

        // 保存COS key（用于删除）
        if (data.data.key) {
          allergyAttachmentKeys.value[currentIndex] = data.data.key
        }

        uni.showToast({ title: '上传成功', icon: 'success', duration: 1000 })
      } else {
        throw new Error(data.message || '上传失败')
      }
    } else {
      throw new Error('上传失败')
    }
  } catch (error: any) {
    uni.hideLoading()
    console.error('[DogCreate] Upload allergy file failed:', error)
    uni.showToast({ title: error.message || '上传失败', icon: 'none' })
  }
}
```

**Step 4: 提交文件上传函数**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 实现过敏记录文件上传函数

- chooseAllergyImage: 选择图片上传
- chooseAllergyPDF: 选择PDF上传
- uploadAllergyFile: 上传文件到COS
- 保存URL和key用于后续管理"
```

---

## Task 14: 前端 - 实现文件管理函数（删除/预览/重命名/获取文件名）

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 添加removeAllergyAttachment函数**

在 `uploadAllergyFile` 函数后面添加：

```typescript
/**
 * 删除过敏记录附件
 */
async function removeAllergyAttachment(index: number) {
  const cosKey = allergyAttachmentKeys.value[index]

  if (cosKey && dogId.value) {
    try {
      // 调用后端API删除COS文件
      await request({
        url: '/dogs/allergy-records/attachments',
        method: 'DELETE',
        data: { key: cosKey }
      })
    } catch (error) {
      console.error('[DogCreate] Delete COS file failed:', error)
    }
  }

  // 从附件列表移除
  currentAllergyRecord.value.attachments!.splice(index, 1)

  // 清理对应的key和name映射
  delete allergyAttachmentKeys.value[index]
  delete allergyAttachmentNames.value[index]

  // 重新索引后面的keys和names
  const newKeys: Record<number, string> = {}
  const newNames: Record<number, string> = {}
  Object.keys(allergyAttachmentKeys.value).forEach((key) => {
    const keyNum = parseInt(key)
    if (keyNum > index) {
      newKeys[keyNum - 1] = allergyAttachmentKeys.value[keyNum]
      newNames[keyNum - 1] = allergyAttachmentNames.value[keyNum]
    } else if (keyNum < index) {
      newKeys[keyNum] = allergyAttachmentKeys.value[keyNum]
      newNames[keyNum] = allergyAttachmentNames.value[keyNum]
    }
  })
  allergyAttachmentKeys.value = newKeys
  allergyAttachmentNames.value = newNames
}
```

**Step 2: 添加previewAllergyFile函数**

```typescript
/**
 * 预览过敏记录文件
 */
function previewAllergyFile(index: number) {
  const url = currentAllergyRecord.value.attachments?.[index]
  if (!url) return

  const isPdf = url.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    // PDF：下载后打开
    uni.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          uni.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            success: () => {
              console.log('[DogCreate] Open PDF success')
            },
            fail: (err) => {
              console.error('[DogCreate] Open PDF failed:', err)
              uni.showToast({ title: '打开文件失败', icon: 'none' })
            }
          })
        }
      },
      fail: (err) => {
        console.error('[DogCreate] Download PDF failed:', err)
        uni.showToast({ title: '下载文件失败', icon: 'none' })
      }
    })
  } else {
    // 图片：预览
    uni.previewImage({
      urls: [url]
    })
  }
}
```

**Step 3: 添加renameAllergyAttachment函数**

```typescript
/**
 * 重命名过敏记录附件
 */
function renameAllergyAttachment(index: number) {
  const currentName = allergyAttachmentNames.value[index] ||
                     getAllergyFileName(currentAllergyRecord.value.attachments![index], index)

  uni.showModal({
    title: '重命名文件',
    editable: true,
    placeholderText: '请输入新的文件名',
    content: currentName,
    success: (res) => {
      if (res.confirm && res.content) {
        allergyAttachmentNames.value[index] = res.content.trim()
        uni.showToast({ title: '重命名成功', icon: 'success', duration: 1000 })
      }
    }
  })
}
```

**Step 4: 添加getAllergyFileName函数**

```typescript
/**
 * 获取过敏记录文件名
 */
function getAllergyFileName(url: string, index: number): string {
  // 如果有自定义名称，使用自定义名称
  if (allergyAttachmentNames.value[index]) {
    return allergyAttachmentNames.value[index]
  }

  // 从URL中提取文件名（使用字符串操作，小程序环境兼容）
  try {
    const lastSlashIndex = url.lastIndexOf('/')
    if (lastSlashIndex > -1 && lastSlashIndex < url.length - 1) {
      let filename = url.substring(lastSlashIndex + 1)

      // 去除查询参数
      const queryIndex = filename.indexOf('?')
      if (queryIndex > -1) {
        filename = filename.substring(0, queryIndex)
      }

      // 如果文件名为空，使用默认名称
      if (!filename || filename === '') {
        return `文件${index + 1}`
      }

      // 如果文件名过长，截断显示
      return filename.length > 25 ? filename.substring(0, 22) + '...' : filename
    }
  } catch (err) {
    console.error('[getAllergyFileName] Parse URL failed:', err)
  }

  return `文件${index + 1}`
}
```

**Step 5: 提交文件管理函数**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 实现过敏记录文件管理函数

- removeAllergyAttachment: 删除附件并同步删除COS文件
- previewAllergyFile: 预览图片或打开PDF
- renameAllergyAttachment: 重命名附件
- getAllergyFileName: 获取显示的文件名"
```

---

## Task 15: 前端 - 更新populateFormData加载过敏记录

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在populateFormData函数中添加过敏记录加载**

找到 `function populateFormData(profile: any)`，在 `checkupRecords` 加载后面添加：

```typescript
formData.value.allergyRecords = profile.allergyRecords || []
console.log('[DogCreate] Loaded allergyRecords:', formData.value.allergyRecords)
```

**Step 2: 提交populateFormData修改**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: populateFormData加载过敏记录

- 从profile中加载allergyRecords数组
- 添加日志输出用于调试"
```

---

## Task 16: 前端 - 添加过敏记录UI（卡片列表）

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在健康记录区域添加过敏记录卡片列表**

在体检记录列表之后、挑食食物之前（约第522行）添加：

```html
<!-- 过敏记录区块 -->
<view class="record-section">
  <text class="section-title">过敏记录</text>

  <!-- 过敏记录卡片列表 -->
  <view v-if="formData.allergyRecords.length > 0">
    <view
      v-for="(record, index) in formData.allergyRecords"
      :key="record.id"
      class="record-card"
    >
      <view class="record-header">
        <text class="record-date">{{ record.testDate }}的检测</text>
        <view class="record-actions">
          <text class="action-btn" @tap="editAllergyRecord(index)">编辑</text>
          <text class="action-btn delete" @tap="deleteAllergyRecord(index)">删除</text>
        </view>
      </view>
      <view class="record-content">
        <text v-if="record.allergens" class="record-detail">
          过敏原：{{ record.allergens }}
        </text>
        <text v-if="record.notes" class="record-detail">
          备注：{{ record.notes }}
        </text>
        <view v-if="record.attachments && record.attachments.length > 0" class="record-attachments">
          <text class="attachment-count">📄 {{ record.attachments.length }}份报告</text>
        </view>
      </view>
    </view>
  </view>

  <!-- 空状态提示 -->
  <view v-else class="empty-allergy">
    <text class="empty-text">暂无过敏检测记录</text>
  </view>

  <!-- 添加按钮 -->
  <button class="btn-add-record" @tap="addAllergyRecord">
    + 添加过敏检测记录
  </button>
</view>
```

**Step 2: 提交UI组件**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 添加过敏记录卡片列表UI

- 显示所有过敏记录卡片
- 支持编辑和删除操作
- 空状态提示
- 添加新记录按钮
- 复用现有样式类"
```

---

## Task 17: 前端 - 添加过敏记录弹窗

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 添加过敏记录弹窗组件**

在病史记录弹窗之后添加：

```html
<!-- 过敏记录弹窗 -->
<uni-popup ref="allergyPopup" type="dialog">
  <view class="medical-record-modal">
    <text class="medical-record-title">
      {{ isEditingAllergyRecord ? '编辑过敏检测记录' : '添加过敏检测记录' }}
    </text>

    <!-- 检测日期（必填） -->
    <view class="form-item">
      <text class="field-label required">检测日期</text>
      <picker
        mode="date"
        :value="currentAllergyRecord.testDate"
        @change="onAllergyDateChange"
      >
        <view class="picker-input">
          {{ currentAllergyRecord.testDate || '请选择日期' }}
        </view>
      </picker>
    </view>

    <!-- 过敏原描述（选填） -->
    <view class="form-item">
      <text class="field-label">过敏原描述</text>
      <input
        class="input"
        placeholder="例：鸡肉、牛肉、小麦等"
        v-model="currentAllergyRecord.allergens"
      />
    </view>

    <!-- 备注说明（选填） -->
    <view class="form-item">
      <text class="field-label">备注说明</text>
      <textarea
        class="textarea"
        placeholder="例：皮试结果、血液检测等"
        v-model="currentAllergyRecord.notes"
      />
    </view>

    <!-- 检测报告上传（选填） -->
    <view class="form-item">
      <text class="field-label">检测报告</text>

      <!-- 已上传文件列表 -->
      <view v-if="currentAllergyRecord.attachments && currentAllergyRecord.attachments.length > 0" class="uploaded-files">
        <view
          v-for="(url, index) in currentAllergyRecord.attachments"
          :key="index"
          class="uploaded-file-item"
        >
          <view class="file-info" @tap="previewAllergyFile(index)">
            <text class="file-icon">📄</text>
            <text class="file-name">{{ getAllergyFileName(url, index) }}</text>
          </view>
          <view class="file-actions">
            <text class="file-rename" @tap="renameAllergyAttachment(index)">重命名</text>
            <text class="file-delete" @tap="removeAllergyAttachment(index)">删除</text>
          </view>
        </view>
      </view>

      <!-- 上传按钮 -->
      <view class="upload-buttons">
        <button class="upload-btn" @tap="chooseAllergyImage">
          <text class="upload-icon">📷</text>
          <text class="upload-text">上传图片</text>
        </button>
        <button class="upload-btn" @tap="chooseAllergyPDF">
          <text class="upload-icon">📄</text>
          <text class="upload-text">上传PDF</text>
        </button>
      </view>
    </view>

    <!-- 操作按钮 -->
    <view class="medical-record-actions">
      <button class="medical-btn-cancel" @tap="closeAllergyModal">取消</button>
      <button class="medical-btn-confirm" @tap="saveAllergyRecord">保存</button>
    </view>
  </view>
</uni-popup>
```

**Step 2: 提交弹窗UI**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 添加过敏记录弹窗UI

- 检测日期选择器（必填）
- 过敏原描述输入框（选填）
- 备注说明输入框（选填）
- 检测报告上传和管理
- 保存和取消按钮
- 复用病史记录弹窗样式"
```

---

## Task 18: 前端 - 连接弹窗ref

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在addAllergyRecord中添加弹窗打开逻辑**

修改 `addAllergyRecord` 函数：

```typescript
function addAllergyRecord() {
  if (!dogId.value) {
    uni.showToast({
      title: '请先保存狗狗档案',
      icon: 'none'
    })
    return
  }

  isEditingAllergyRecord.value = false
  currentAllergyRecord.value = {
    testDate: '',
    allergens: '',
    notes: '',
    attachments: []
  }
  allergyAttachmentKeys.value = {}
  allergyAttachmentNames.value = {}

  // 打开弹窗
  ;(this as any).$refs.allergyPopup.open()
}
```

**Step 2: 在closeAllergyModal中添加弹窗关闭逻辑**

修改 `closeAllergyModal` 函数：

```typescript
function closeAllergyModal() {
  // 关闭弹窗
  ;(this as any).$refs.allergyPopup.close()

  currentAllergyRecord.value = {
    testDate: '',
    allergens: '',
    notes: '',
    attachments: []
  }
}
```

**Step 3: 在editAllergyRecord中添加弹窗打开逻辑**

修改 `editAllergyRecord` 函数：

```typescript
function editAllergyRecord(index: number) {
  isEditingAllergyRecord.value = true
  currentAllergyRecordIndex.value = index
  // 深拷贝当前记录
  currentAllergyRecord.value = { ...formData.value.allergyRecords[index] }

  // 打开弹窗
  ;(this as any).$refs.allergyPopup.open()
}
```

**Step 4: 在saveAllergyRecord成功后关闭弹窗**

修改 `saveAllergyRecord` 函数中的成功处理：

```typescript
// 在 uni.showToast 之后添加
closeAllergyModal()  // 这会自动关闭弹窗
```

**Step 5: 提交弹窗ref连接**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: 连接过敏记录弹窗ref

- addAllergyRecord: 打开弹窗
- editAllergyRecord: 打开弹窗并预填充数据
- closeAllergyModal: 关闭弹窗
- saveAllergyRecord: 保存成功后关闭弹窗"
```

---

## Task 19: 前端 - 添加弹窗ref到模板

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在uni-popup组件上添加ref**

找到过敏记录弹窗的 `<uni-popup>` 标签，添加ref：

```html
<!-- 修改前 -->
<uni-popup ref="allergyPopup" type="dialog">

<!-- 修改后 -->
<uni-popup ref="allergyPopup" type="dialog">
```

确认ref已经正确设置为 `allergyPopup`。

**Step 2: 提交ref确认**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "fix: 确认过敏记录弹窗ref设置正确

- 弹窗ref为allergyPopup
- 确保与函数调用一致"
```

---

## Task 20: 前端 - 更新submit函数包含过敏记录

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 在submit函数的payload中添加allergyRecords**

找到 `const payload = { ... }`，在 `checkupRecords` 后面添加：

```typescript
const payload = {
  // ... 现有字段
  medicalRecords: formData.value.medicalRecords || [],
  checkupRecords: formData.value.checkupRecords || [],
  allergyRecords: formData.value.allergyRecords || [],  // 新增
  allergyFoods: formData.value.allergyFoods || null,
  pickyFoods: formData.value.pickyFoods || null
}
```

**Step 2: 提交submit函数修改**

```bash
git add miniapp/src/pages/dog-create/index.vue
git commit -m "feat: submit函数包含过敏记录数据

- 提交时包含allergyRecords数组
- 保留allergyFoods向后兼容"
```

---

## Task 21: 前端测试和调试

**Files:**
- Test: 手动测试微信开发者工具

**Step 1: 启动小程序开发服务**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
pnpm run dev:mp-weixin
```

**Step 2: 打开微信开发者工具**

1. 打开微信开发者工具
2. 导入项目：`/Users/zhaochen/Documents/SevenKitchen/miniapp/dist/dev/mp-weixin`
3. 编译并预览

**Step 3: 测试创建流程**

1. 创建新狗狗档案
2. 填写基本信息并保存
3. 点击"+ 添加过敏检测记录"
4. 填写检测日期、过敏原、备注
5. 上传测试图片
6. 点击"保存" → 应该显示"添加成功"

**Step 4: 测试编辑流程**

1. 点击已添加记录的"编辑"
2. 修改任何内容
3. 点击"保存" → 应该显示"更新成功"
4. 验证列表立即更新

**Step 5: 测试删除流程**

1. 点击"删除"
2. 确认删除 → 应该显示"删除成功"
3. 验证记录从列表移除

**Step 6: 测试文件管理**

1. 上传图片和PDF
2. 预览图片
3. 打开PDF
4. 重命名文件
5. 删除文件（检查COS是否同步删除）

**Step 7: 检查控制台日志**

打开调试控制台，确认：
- 无JavaScript错误
- API调用成功
- 数据格式正确

**Step 8: 记录测试结果**

如果发现问题，记录错误信息并修复。如果全部通过，继续下一步。

---

## Task 22: 后端测试和验证

**Files:**
- Test: 手动测试API

**Step 1: 测试创建过敏记录API**

```bash
curl -X POST http://localhost:3001/dogs/{dogId}/allergy-records \
  -H 'Content-Type: application/json' \
  -H 'X-Customer-Id: test-customer-id' \
  -d '{
    "testDate": "2024-01-15",
    "allergens": "鸡肉、牛肉",
    "notes": "测试记录",
    "attachments": []
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "testDate": "2024-01-15",
    "allergens": "鸡肉、牛肉",
    "notes": "测试记录",
    "attachments": []
  }
}
```

**Step 2: 测试更新过敏记录API**

```bash
curl -X PUT http://localhost:3001/dogs/{dogId}/allergy-records/{recordId} \
  -H 'Content-Type: application/json' \
  -H 'X-Customer-Id: test-customer-id' \
  -d '{
    "testDate": "2024-01-16",
    "allergens": "鸡肉、牛肉、小麦",
    "notes": "更新后的备注"
  }'
```

**Step 3: 测试删除过敏记录API**

```bash
curl -X DELETE http://localhost:3001/dogs/{dogId}/allergy-records/{recordId} \
  -H 'X-Customer-Id: test-customer-id'
```

**Step 4: 测试获取档案包含过敏记录**

```bash
curl http://localhost:3001/dogs/{dogId} \
  -H 'X-Customer-Id: test-customer-id'
```

验证返回的 `data.allergyRecords` 数组包含记录。

**Step 5: 记录API测试结果**

确认所有API正常工作，记录任何异常。

---

## Task 23: 最终代码审查和优化

**Files:**
- Review: `backend/src/interfaces/controllers/dogs.controller.ts`
- Review: `miniapp/src/pages/dog-create/index.vue`

**Step 1: 检查代码一致性**

- [ ] 所有过敏记录相关函数命名统一（allergyXxx）
- [ ] 样式类名复用现有类
- [ ] 错误处理完整
- [ ] 日志输出清晰

**Step 2: 检查类型安全**

- [ ] TypeScript类型定义完整
- [ ] 无any类型（除非必要）
- [ ] 接口字段可选性正确

**Step 3: 检查用户体验**

- [ ] 加载状态提示
- [ ] 错误提示友好
- [ ] 操作反馈及时
- [ ] 表单验证合理

**Step 4: 性能优化**

- [ ] 避免不必要的API调用
- [ ] 文件上传有loading状态
- [ ] 列表渲染性能良好

**Step 5: 提交最终优化**

```bash
git add backend/src/interfaces/controllers/dogs.controller.ts
git add miniapp/src/pages/dog-create/index.vue
git commit -m "refactor: 过敏记录功能最终优化

- 代码审查和优化
- 添加详细注释
- 优化用户体验
- 确保类型安全"
```

---

## Task 24: 更新文档

**Files:**
- Create: `docs/plans/2025-01-25-allergy-records-redesign-summary.md`

**Step 1: 创建功能总结文档**

```markdown
# 过敏记录重构功能总结

## 实现内容

### 后端修改
1. **数据库Schema** (`backend/prisma/schema.prisma`)
   - 添加 `allergyRecords` JsonB字段

2. **新增API** (`backend/src/interfaces/controllers/dogs.controller.ts`)
   - POST /dogs/:dogId/allergy-records - 创建记录
   - PUT /dogs/:dogId/allergy-records/:id - 更新记录
   - DELETE /dogs/:dogId/allergy-records/:id - 删除记录
   - POST /dogs/allergy-records/upload-attachment - 上传附件
   - DELETE /dogs/allergy-records/attachments - 删除附件

### 前端修改
1. **数据结构** (`miniapp/src/pages/dog-create/index.vue`)
   - AllergyRecord接口定义
   - 添加到DogFormData

2. **UI组件**
   - 过敏记录卡片列表
   - 添加/编辑弹窗
   - 文件上传和管理

3. **核心功能**
   - CRUD操作（立即同步后端）
   - 图片和PDF上传
   - COS文件管理
   - 文件预览和重命名

## 测试要点
- [ ] 创建档案时添加过敏记录
- [ ] 编辑现有记录
- [ ] 删除记录
- [ ] 上传/预览/删除文件
- [ ] 跨设备数据同步

## 向后兼容
- 保留 `allergyFoods` 字段
- 现有档案不受影响
- API返回格式兼容
```

**Step 2: 提交文档**

```bash
git add docs/plans/2025-01-25-allergy-records-redesign-summary.md
git commit -m "docs: 添加过敏记录重构功能总结文档"
```

---

## Task 25: 最终提交和标签

**Files:**
- Git: 最终提交

**Step 1: 查看所有修改**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status
git diff --stat
```

**Step 2: 最终提交（如果有未提交的内容）**

```bash
git add -A
git commit -m "feat: 完成过敏记录板块重构

完整实现过敏记录功能，支持：
- 手动输入过敏原和备注
- 上传图片和PDF检测报告
- 多次检测记录的历史追踪
- 文件预览、重命名、删除
- 所有操作立即同步到后端

与病史/体检记录保持一致的交互体验

后端：
- 添加allergyRecords JsonB字段
- 5个新API端点（CRUD + 文件管理）
- 完整的权限验证

前端：
- AllergyRecord接口和状态管理
- 卡片列表和弹窗UI
- 文件上传和COS集成
- 约400行新增代码

向后兼容：
- 保留allergyFoods字段
- 现有档案不受影响"
```

**Step 3: 创建Git标签（可选）**

```bash
git tag -a v1.1.0-allergy-records -m "过敏记录重构功能"
git push origin v1.1.0-allergy-records
```

---

## 实施完成检查清单

- [ ] 数据库迁移成功
- [ ] 后端5个API正常工作
- [ ] 前端UI显示正确
- [ ] 创建记录功能正常
- [ ] 编辑记录功能正常
- [ ] 删除记录功能正常
- [ ] 文件上传功能正常
- [ ] 文件预览功能正常
- [ ] 文件删除功能正常（包括COS）
- [ ] 向后兼容验证通过
- [ ] 代码审查通过
- [ ] 文档更新完成
- [ ] Git提交完成

---

## 预估工作量

- 后端开发：3-4小时
- 前端开发：4-5小时
- 测试调试：2-3小时
- 文档整理：1小时

**总计：10-13小时**

---

## 参考资料

- 设计文档：`docs/plans/2025-01-25-allergy-records-redesign-design.md`
- 病史记录实现：`miniapp/src/pages/dog-create/index.vue:2000-2300`
- 体检记录实现：`miniapp/src/pages/dog-create/index.vue:2650-2950`
- COS文件上传：`backend/src/interfaces/controllers/dogs.controller.ts:934-1100`
- 数据库命名规范：`docs/DATABASE_NAMING_CONVENTIONS.md`
- API规范：`docs/05_API_Specs.md`
