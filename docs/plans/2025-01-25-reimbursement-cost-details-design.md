# 报销单费用明细功能设计文档

**创建日期**: 2025-01-25
**作者**: Claude Code
**状态**: 设计已完成，待实施

---

## 📋 概述

本文档描述了如何在报销单中增加费用明细存储和展示功能，包括平台运费、平台打包费和自定义费用明细。

### 业务目标

- 在报销单中详细记录各项费用明细（采购清单、运费、打包费、自定义费用）
- 在详情页面清晰展示费用结构，提供计算公式
- 支持重新提交时修改费用明细
- 兼容历史数据

---

## 第一部分：数据库Schema修改

### 新增字段

在 `reimbursement` 表中增加以下字段：

| 字段名 | 类型 | 默认值 | 可空 | 说明 |
|--------|------|--------|------|------|
| `platform_shipping_fee` | `Decimal(10, 2)` | `0` | `true` | 平台运费 |
| `platform_packaging_fee` | `Decimal(10, 2)` | `0` | `true` | 平台打包费 |
| `custom_fees` | `Json` (JSONB) | `[]` | `true` | 自定义费用数组 |

### customFees 数据结构

```json
[
  {
    "description": "打车费",
    "amount": 50.00
  },
  {
    "description": "搬运费",
    "amount": 30.00
  }
]
```

### Prisma Schema 修改

```prisma
model Reimbursement {
  id                    String               @id @default(uuid()) @map("id")
  claimNumber           String               @unique @map("claim_number") @db.VarChar(20)
  status                ReimbursementStatus  @map("status")
  totalActualCost       Decimal              @map("total_actual_cost") @db.Decimal(10, 2)
  totalEstimatedCost    Decimal              @map("total_estimated_cost") @db.Decimal(10, 2)
  receiptUrls           String[]             @map("receipt_urls")
  submittedById         String               @map("submitted_by_id")
  submittedAt           DateTime             @map("submitted_at")
  reviewedById          String?              @map("reviewed_by_id")
  reviewedAt            DateTime?            @map("reviewed_at")
  reviewComment         String?              @map("review_comment") @db.Text
  createdAt             DateTime             @default(now()) @map("created_at")
  updatedAt             DateTime             @updatedAt @map("updated_at")

  // 新增费用明细字段
  platformShippingFee   Decimal?             @map("platform_shipping_fee") @db.Decimal(10, 2)
  platformPackagingFee  Decimal?             @map("platform_packaging_fee") @db.Decimal(10, 2)
  customFees            Json?                @map("custom_fees") @db.JsonB

  purchaseLists         PurchaseList[]
  submittedBy           User                 @relation("ReimbursementSubmitter", fields: [submittedById], references: [id])
  reviewedBy            User?                @relation("ReimbursementReviewer", fields: [reviewedById], references: [id])

  @@index([status])
  @@index([submittedById])
  @@index([claimNumber])
  @@map("reimbursement")
}
```

### 数据完整性约束

- `totalActualCost` 应该等于：采购清单总额 + platformShippingFee + platformPackagingFee + sum(customFees[].amount)

---

## 第二部分：后端修改

### 1. 实体层修改

**文件**: `backend/src/domain/purchasing/reimbursement.entity.ts`

```typescript
export interface ReimbursementConstructor {
  id?: string;
  claimNumber: string;
  status?: ReimbursementStatus;
  totalActualCost: number;
  totalEstimatedCost: number;
  receiptUrls: string[];
  submittedById: string;
  submittedAt: Date;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewComment?: string;
  createdAt?: Date;
  updatedAt?: Date;
  purchaseLists?: PurchaseList[];

  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}

export class Reimbursement {
  // ... 现有属性 ...

  public readonly platformShippingFee?: number;
  public readonly platformPackagingFee?: number;
  public readonly customFees?: Array<{ description: string; amount: number }>;

  constructor(data: ReimbursementConstructor) {
    // ... 现有初始化代码 ...
    this.platformShippingFee = data.platformShippingFee;
    this.platformPackagingFee = data.platformPackagingFee;
    this.customFees = data.customFees || [];

    this.validateInvariants();
  }

  toPrisma() {
    return {
      // ... 现有字段 ...
      platformShippingFee: this.platformShippingFee,
      platformPackagingFee: this.platformPackagingFee,
      customFees: this.customFees,
    };
  }

  static fromPrisma(data: any): Reimbursement {
    // ... 现有代码 ...
    return new Reimbursement({
      // ... 现有字段 ...
      platformShippingFee: data.platformShippingFee ? Number(data.platformShippingFee) : undefined,
      platformPackagingFee: data.platformPackagingFee ? Number(data.platformPackagingFee) : undefined,
      customFees: data.customFees || [],
    });
  }
}
```

### 2. DTO修改

**文件**: `backend/src/application/purchasing/reimbursement.service.ts`

```typescript
export interface SubmitReimbursementDto {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;

  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}
```

### 3. Service验证逻辑

**文件**: `backend/src/application/purchasing/reimbursement.service.ts`

```typescript
async submitReimbursement(
  dto: SubmitReimbursementDto,
  submittedById: string
): Promise<Reimbursement> {
  // 验证发票照片
  if (dto.receiptUrls.length === 0) {
    throw new BadRequestException('至少需要一张发票照片');
  }

  // 加载采购清单
  const purchaseLists = await this.purchaseListRepository.findByIds(dto.purchaseListIds);

  // 计算采购清单总金额
  const purchaseListsTotal = purchaseLists.reduce((sum, list) => {
    const actualCost = list.totalActualCost ?? list.totalEstimatedCost;
    return sum + Number(actualCost);
  }, 0);

  // 计算自定义费用总额
  const customFeesTotal = dto.customFees?.reduce((sum, fee) => sum + (fee.amount || 0), 0) || 0;

  // 验证总金额
  const calculatedTotal = purchaseListsTotal +
    (dto.platformShippingFee || 0) +
    (dto.platformPackagingFee || 0) +
    customFeesTotal;

  if (Math.abs(dto.totalActualCost - calculatedTotal) > 0.01) {
    throw new BadRequestException(
      `报销总金额与费用明细不匹配。期望: ¥${calculatedTotal.toFixed(2)}, 实际: ¥${dto.totalActualCost.toFixed(2)}`
    );
  }

  // ... 创建报销单的代码 ...
}
```

---

## 第三部分：前端修改

### 1. API接口更新

**文件**: `miniapp/src/api/purchasing.ts`

```typescript
// 更新接口定义
export interface ReimbursementDetail {
  // ... 现有字段 ...
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}

export interface SubmitReimbursementParams {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}
```

### 2. 提交页面修改

**文件**: `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`

**修改提交函数**：

```typescript
const submitReimbursement = async () => {
  if (!canSubmit.value) {
    return;
  }

  if (receiptUrls.value.length === 0) {
    uni.showToast({ title: '请上传支付记录照片', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const totalAmount = parseFloat(totalReimbursementAmount.value);
    const urls = receiptUrls.value.map(photo => photo.url);

    const res: any = await submitReimbursementApi({
      purchaseListIds: selectedListIds.value,
      receiptUrls: urls,
      totalActualCost: totalAmount,
      // 新增字段
      platformShippingFee: parseFloat(platformShippingFee.value) || 0,
      platformPackagingFee: parseFloat(platformPackagingFee.value) || 0,
      customFees: customFees.value
        .filter(fee => fee.description && fee.amount)
        .map(fee => ({
          description: fee.description,
          amount: parseFloat(fee.amount) || 0
        })),
    });

    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        uni.redirectTo({
          url: '/pages/staff-purchasing/reimbursement/list'
        });
      }, 1500);
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('提交报销申请失败', error);
    uni.showToast({ title: error.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};
```

**支持重新提交时加载已有数据**：

```typescript
import { onLoad } from '@dcloudio/uni-app';
import { getReimbursementDetail } from '@/api/purchasing';

onLoad((options: any) => {
  if (options.resubmitId) {
    loadExistingReimbursement(options.resubmitId);
  } else {
    loadCompletedPurchaseLists();
  }
});

const loadExistingReimbursement = async (id: string) => {
  try {
    uni.showLoading({ title: '加载中...' });

    const res: any = await getReimbursementDetail(id);

    if (res.code === 0) {
      const data = res.data;

      // 填充费用明细
      platformShippingFee.value = data.platformShippingFee?.toString() || '';
      platformPackagingFee.value = data.platformPackagingFee?.toString() || '';
      customFees.value = data.customFees?.map((fee: any) => ({
        description: fee.description,
        amount: fee.amount.toString()
      })) || [];

      // 填充采购清单
      completedPurchaseLists.value = data.purchaseLists || [];
      selectedListIds.value = data.purchaseLists?.map((list: any) => list.id) || [];

      // 填充照片
      receiptUrls.value = data.receiptUrls?.map((url: string, index: number) => ({
        url,
        key: `existing_${index}` // 临时key，用于删除操作
      })) || [];

      // 重新计算总额
      calculateTotal();
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载报销单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
};
```

### 3. 详情页面修改

**文件**: `miniapp/src/pages/staff-purchasing/reimbursement/detail.vue`

**在状态卡片后增加费用汇总卡片**：

```vue
<!-- 费用汇总卡片 -->
<view class="section cost-summary-card">
  <text class="section-title">费用明细</text>

  <!-- 采购清单金额 -->
  <view class="cost-row">
    <text class="label">采购清单金额</text>
    <text class="value">¥{{ purchaseListsTotal }}</text>
  </view>

  <!-- 平台运费 -->
  <view v-if="reimbursement.platformShippingFee > 0" class="cost-row">
    <text class="label">平台运费</text>
    <text class="value">¥{{ reimbursement.platformShippingFee.toFixed(2) }}</text>
  </view>

  <!-- 平台打包费 -->
  <view v-if="reimbursement.platformPackagingFee > 0" class="cost-row">
    <text class="label">平台打包费</text>
    <text class="value">¥{{ reimbursement.platformPackagingFee.toFixed(2) }}</text>
  </view>

  <!-- 自定义费用明细 -->
  <view v-if="hasCustomFees" class="custom-fees-section">
    <text class="custom-fees-title">其它费用</text>
    <view
      v-for="(fee, index) in reimbursement.customFees"
      :key="index"
      class="custom-fee-row"
    >
      <text class="fee-desc">{{ fee.description }}</text>
      <text class="fee-amount">¥{{ fee.amount.toFixed(2) }}</text>
    </view>
  </view>

  <!-- 计算公式 -->
  <view v-if="showFormula" class="formula-row">
    <text class="formula-text">{{ costFormula }}</text>
  </view>

  <!-- 总金额 -->
  <view class="total-row">
    <text class="total-label">报销总额</text>
    <text class="total-value">¥{{ reimbursement.totalActualCost.toFixed(2) }}</text>
  </view>
</view>
```

**增加计算属性**：

```typescript
// 采购清单总金额
const purchaseListsTotal = computed(() => {
  if (!reimbursement.value) return '0.00';
  const total = reimbursement.value.purchaseLists?.reduce(
    (sum: number, list: any) => sum + (list.totalActualCost || list.totalEstimatedCost || 0),
    0
  ) || 0;
  return total.toFixed(2);
});

// 是否有自定义费用
const hasCustomFees = computed(() => {
  if (!reimbursement.value?.customFees) return false;
  return reimbursement.value.customFees.length > 0;
});

// 自定义费用总金额
const customFeesTotal = computed(() => {
  if (!reimbursement.value?.customFees) return 0;
  return reimbursement.value.customFees.reduce(
    (sum: number, fee: any) => sum + (fee.amount || 0),
    0
  );
});

// 是否显示计算公式
const showFormula = computed(() => {
  if (!reimbursement.value) return false;
  return (
    reimbursement.value.platformShippingFee > 0 ||
    reimbursement.value.platformPackagingFee > 0 ||
    hasCustomFees.value
  );
});

// 费用计算公式
const costFormula = computed(() => {
  if (!reimbursement.value) return '';

  const parts: string[] = [];

  // 采购清单金额
  parts.push(`采购清单(¥${purchaseListsTotal.value})`);

  // 平台运费
  if (reimbursement.value.platformShippingFee > 0) {
    parts.push(`运费(¥${reimbursement.value.platformShippingFee.toFixed(2)})`);
  }

  // 平台打包费
  if (reimbursement.value.platformPackagingFee > 0) {
    parts.push(`打包费(¥${reimbursement.value.platformPackagingFee.toFixed(2)})`);
  }

  // 其它费用
  if (customFeesTotal.value > 0) {
    parts.push(`其它费用(¥${customFeesTotal.value.toFixed(2)})`);
  }

  return parts.join(' + ') + ` = ¥${reimbursement.value.totalActualCost.toFixed(2)}`;
});
```

**增加样式**：

```scss
.cost-summary-card {
  background: linear-gradient(135deg, #fff9e6 0%, #fff3d3 100%);
  border: 2rpx solid #ffd666;

  .section-title {
    color: #d48806;
    border-bottom: 2rpx solid #ffd666;
    padding-bottom: 16rpx;
  }

  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);

    &:last-child {
      border-bottom: none;
    }

    .label {
      font-size: 28rpx;
      color: #666;
    }

    .value {
      font-size: 30rpx;
      font-weight: bold;
      color: #333;
    }
  }

  .custom-fees-section {
    margin: 16rpx 0;
    padding: 16rpx;
    background-color: rgba(255, 255, 255, 0.6);
    border-radius: 12rpx;

    .custom-fees-title {
      display: block;
      font-size: 26rpx;
      color: #d48806;
      margin-bottom: 12rpx;
      font-weight: bold;
    }

    .custom-fee-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8rpx 0;

      .fee-desc {
        font-size: 26rpx;
        color: #666;
      }

      .fee-amount {
        font-size: 26rpx;
        font-weight: bold;
        color: #ff6b6b;
      }
    }
  }

  .formula-row {
    margin: 16rpx 0;
    padding: 16rpx;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 8rpx;

    .formula-text {
      font-size: 24rpx;
      color: #999;
      line-height: 1.6;
      word-break: break-all;
    }
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 2rpx solid #ffd666;

    .total-label {
      font-size: 32rpx;
      font-weight: bold;
      color: #d48806;
    }

    .total-value {
      font-size: 40rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}
```

---

## 第四部分：实施步骤

### 阶段一：后端开发

**步骤1：数据库Schema修改**
- [ ] 修改 `backend/prisma/schema.prisma`
- [ ] 运行 `npx prisma migrate dev --name add_reimbursement_cost_details`
- [ ] 运行 `npx prisma generate`

**步骤2：实体层修改**
- [ ] 修改 `backend/src/domain/purchasing/reimbursement.entity.ts`
  - [ ] 更新 `ReimbursementConstructor` 接口
  - [ ] 更新 `Reimbursement` 类属性
  - [ ] 修改 `toPrisma()` 方法
  - [ ] 修改 `fromPrisma()` 方法

**步骤3：Service层修改**
- [ ] 修改 `backend/src/application/purchasing/reimbursement.service.ts`
  - [ ] 更新 `SubmitReimbursementDto`
  - [ ] 在 `submitReimbursement()` 中添加费用验证
  - [ ] 修改 `resubmitReimbursement()` 支持费用明细

**步骤4：测试**
- [ ] 编写单元测试
- [ ] 测试历史数据兼容性

### 阶段二：前端开发

**步骤1：API定义更新**
- [ ] 修改 `miniapp/src/api/purchasing.ts`

**步骤2：提交页面修改**
- [ ] 修改 `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`
  - [ ] 修改 `submitReimbursement` 函数
  - [ ] 添加 `loadExistingReimbursement` 函数

**步骤3：详情页面修改**
- [ ] 修改 `miniapp/src/pages/staff-purchasing/reimbursement/detail.vue`
  - [ ] 添加费用汇总卡片
  - [ ] 添加计算属性
  - [ ] 添加样式

### 阶段三：集成测试

**测试场景1：新提交报销申请**
- [ ] 选择采购清单
- [ ] 填写运费、打包费
- [ ] 添加自定义费用
- [ ] 上传发票
- [ ] 提交并验证详情页

**测试场景2：重新提交报销申请**
- [ ] 打开被驳回的报销单
- [ ] 重新提交并验证数据加载
- [ ] 修改费用明细
- [ ] 提交并验证更新

**测试场景3：历史数据兼容性**
- [ ] 查看旧报销单
- [ ] 验证正常显示

**测试场景4：边界情况**
- [ ] 只有采购清单
- [ ] 只有自定义费用
- [ ] 所有费用都填写

---

## 第五部分：部署计划

### 开发环境
1. 部署后端修改（含数据库迁移）
2. 验证后端API
3. 部署前端修改
4. 完整功能测试

### 生产环境
1. 创建数据库备份
2. 低峰时段执行迁移
3. 部署后端
4. 部署前端
5. 监控日志和反馈

---

## 第六部分：注意事项

1. **历史数据处理**：已有报销单的新字段使用默认值
2. **API兼容性**：新增字段都是可选的
3. **数据完整性**：后端必须验证总金额一致性
4. **测试覆盖**：重点测试重新提交场景

---

## 附录：UI效果图

### 报销单详情页 - 费用汇总卡片

```
┌──────────────────────────────────────┐
│ 费用明细                             │
├──────────────────────────────────────┤
│ 采购清单金额          ¥200.00        │
│ 平台运费              ¥10.00         │
│ 平台打包费            ¥5.00          │
│ 其它费用：                           │
│   - 打车费            ¥30.00         │
│   - 搬运费            ¥20.00         │
├──────────────────────────────────────┤
│ 采购清单(¥200.00) + 运费(¥10.00)    │
│ + 打包费(¥5.00) + 其它费用(¥50.00)  │
│ = ¥265.00                          │
├──────────────────────────────────────┤
│ 报销总额              ¥265.00        │
└──────────────────────────────────────┘
```

---

**文档版本**: 1.0
**最后更新**: 2025-01-25
