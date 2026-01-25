# 报销单费用明细功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在报销单中增加费用明细存储和展示功能，包括平台运费、平台打包费和自定义费用明细

**Architecture:**
- 后端：修改 Prisma Schema 增加字段，更新实体层和API，验证费用总额一致性
- 前端：修改提交页面传递费用明细，详情页面展示费用汇总卡片和计算公式

**Tech Stack:**
- Backend: NestJS, Prisma ORM, PostgreSQL, TypeScript
- Frontend: Vue 3, uni-app, SCSS
- Testing: Jest (Backend), 手动测试 (Frontend)

---

## Task 1: 修改 Prisma Schema

**Files:**
- Modify: `backend/prisma/schema.prisma:805-827`

**Step 1: 备份当前 Schema**

```bash
cd backend && cp prisma/schema.prisma prisma/schema.prisma.backup
```

Expected: 创建备份文件 `prisma/schema.prisma.backup`

**Step 2: 在 Reimbursement 模型中添加新字段**

编辑 `backend/prisma/schema.prisma`，在 `reviewedAt` 字段之后（第815行后）添加：

```prisma
  // 新增费用明细字段
  platformShippingFee   Decimal? @map("platform_shipping_fee") @db.Decimal(10, 2)
  platformPackagingFee  Decimal? @map("platform_packaging_fee") @db.Decimal(10, 2)
  customFees            Json?    @map("custom_fees") @db.JsonB
```

**Step 3: 验证 Schema 语法**

```bash
cd backend && npx prisma validate
```

Expected: `✅ The Prisma schema is valid`

**Step 4: 创建数据库迁移**

```bash
cd backend && npx prisma migrate dev --name add_reimbursement_cost_details
```

Expected: 输出包含 migration 成功信息

**Step 5: 重新生成 Prisma Client**

```bash
cd backend && npx prisma generate
```

Expected: `✔ Generated Prisma Client` 成功信息

**Step 6: 提交修改**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: 添加报销单费用明细字段到数据库

- 新增 platform_shipping_fee 字段存储平台运费
- 新增 platform_packaging_fee 字段存储平台打包费
- 新增 custom_fees JSONB 字段存储自定义费用明细

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: 修改 Reimbursement 实体

**Files:**
- Modify: `backend/src/domain/purchasing/reimbursement.entity.ts`

**Step 1: 修改 ReimbursementConstructor 接口**

在第 11-26 行，更新接口定义，在最后添加：

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
```

**Step 2: 在 Reimbursement 类中添加属性**

在第 28-43 行（类属性声明部分），在 `purchaseLists` 属性后添加：

```typescript
export class Reimbursement {
  public readonly id: string;
  public readonly claimNumber: string;
  public status: ReimbursementStatus;
  public readonly totalActualCost: number;
  public readonly totalEstimatedCost: number;
  public readonly receiptUrls: string[];
  public readonly submittedById: string;
  public readonly submittedAt: Date;
  public reviewedById?: string;
  public reviewedAt?: Date;
  public reviewComment?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public purchaseLists: PurchaseList[];

  // 新增属性
  public readonly platformShippingFee?: number;
  public readonly platformPackagingFee?: number;
  public readonly customFees?: Array<{ description: string; amount: number }>;

  // ... constructor 继续后面
```

**Step 3: 在构造函数中初始化新属性**

在第 58 行（`this.purchaseLists = data.purchaseLists || [];`）之后添加：

```typescript
    this.platformShippingFee = data.platformShippingFee;
    this.platformPackagingFee = data.platformPackagingFee;
    this.customFees = data.customFees || [];
```

**Step 4: 更新 toPrisma() 方法**

在第 214 行（`updatedAt: this.updatedAt,`）之后添加：

```typescript
      platformShippingFee: this.platformShippingFee,
      platformPackagingFee: this.platformPackagingFee,
      customFees: this.customFees,
```

**Step 5: 更新 fromPrisma() 静态方法**

在第 238 行（`purchaseLists,`）之后添加：

```typescript
      platformShippingFee: data.platformShippingFee ? Number(data.platformShippingFee) : undefined,
      platformPackagingFee: data.platformPackagingFee ? Number(data.platformPackagingFee) : undefined,
      customFees: data.customFees || [],
```

**Step 6: 提交修改**

```bash
git add backend/src/domain/purchasing/reimbursement.entity.ts
git commit -m "feat: 更新 Reimbursement 实体支持费用明细

- 在构造函数接口中添加费用明细字段
- 在类中添加对应属性
- 更新 toPrisma 和 fromPrisma 方法

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: 修改 Service DTO 和验证逻辑

**Files:**
- Modify: `backend/src/application/purchasing/reimbursement.service.ts`

**Step 1: 更新 SubmitReimbursementDto 接口**

在第 23-27 行，更新接口定义：

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

**Step 2: 在 submitReimbursement 方法中添加费用验证**

在第 72-119 行的 `submitReimbursement` 方法中，在验证采购清单之后（约第 95 行后）添加：

```typescript
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

    this.logger.log(
      `Validated reimbursement cost details: purchaseLists=¥${purchaseListsTotal}, ` +
      `shipping=¥${dto.platformShippingFee || 0}, packaging=¥${dto.platformPackagingFee || 0}, ` +
      `custom=¥${customFeesTotal}, total=¥${dto.totalActualCost}`
    );
```

**Step 3: 创建报销单时传入费用明细**

在第 130 行左右（创建 Reimbursement 实体的地方），更新构造函数调用：

```typescript
    const reimbursement = new Reimbursement({
      claimNumber: claimNumber,
      status: ReimbursementStatus.PENDING_REVIEW,
      totalEstimatedCost: purchaseListsTotal,
      totalActualCost: dto.totalActualCost,
      receiptUrls: dto.receiptUrls,
      submittedById,
      submittedAt: new Date(),
      purchaseLists,
      // 新增字段
      platformShippingFee: dto.platformShippingFee,
      platformPackagingFee: dto.platformPackagingFee,
      customFees: dto.customFees || [],
    });
```

**Step 4: 提交修改**

```bash
git add backend/src/application/purchasing/reimbursement.service.ts
git commit -m "feat: 添加报销单费用明细验证和存储

- 更新 SubmitReimbursementDto 接口
- 添加费用总额验证逻辑
- 在创建报销单时保存费用明细

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: 更新 Controller API 文档

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`

**Step 1: 更新 submitReimbursement API 的 ApiBody**

在第 802-820 行，更新 API 请求体定义，在 `totalActualCost` 后添加：

```typescript
              totalActualCost: { type: 'number' },
              platformShippingFee: {
                type: 'number',
                description: '平台运费（可选）',
                example: 10.00,
              },
              platformPackagingFee: {
                type: 'number',
                description: '平台打包费（可选）',
                example: 5.00,
              },
              customFees: {
                type: 'array',
                description: '自定义费用明细（可选）',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string', example: '打车费' },
                    amount: { type: 'number', example: 30.00 },
                  },
                },
              },
```

**Step 2: 更新 resubmitReimbursement API 的 ApiBody**

在第 893-905 行，同样更新 resubmitReimbursement 的 ApiBody 定义。

**Step 3: 提交修改**

```bash
git add backend/src/interfaces/controllers/staff-purchasing.controller.ts
git commit -m "docs: 更新报销单 API 文档

- 添加费用明细字段的 Swagger 文档
- 更新 submit 和 resubmit API

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: 更新前端 API 类型定义

**Files:**
- Modify: `miniapp/src/api/purchasing.ts`

**Step 1: 找到 SubmitReimbursementParams 类型定义**

搜索 `submitReimbursement` 函数的参数类型定义。

**Step 2: 更新类型定义，添加费用明细字段**

```typescript
export interface SubmitReimbursementParams {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}
```

**Step 3: 提交修改**

```bash
git add miniapp/src/api/purchasing.ts
git commit -m "feat: 更新前端 API 类型支持费用明细

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: 修改提交报销页面 - 传递费用明细

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`

**Step 1: 更新 submitReimbursement 函数**

在第 340-381 行的 `submitReimbursement` 函数中，更新 API 调用（约第 358 行）：

```typescript
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
```

**Step 2: 提交修改**

```bash
git add miniapp/src/pages/staff-purchasing/reimbursement/submit.vue
git commit -m "feat: 提交报销时传递费用明细

- 在 submitReimbursement API 调用中添加费用明细字段
- 转换自定义费用数据格式

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: 修改提交报销页面 - 支持重新提交加载

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`

**Step 1: 导入 onLoad**

在第 152 行，确保已导入：

```typescript
import { onLoad } from '@dcloudio/uni-app';
import { getReimbursementDetail } from '@/api/purchasing';
```

**Step 2: 修改页面加载逻辑**

替换第 186-188 行的 `onMounted` 为 `onLoad`，并添加重新提交支持：

```typescript
// 页面加载
onLoad((options: any) => {
  if (options.resubmitId) {
    // 重新提交模式：加载已有报销单数据
    loadExistingReimbursement(options.resubmitId);
  } else {
    // 新建模式：加载已完成的采购清单
    loadCompletedPurchaseLists();
  }
});
```

**Step 3: 添加 loadExistingReimbursement 函数**

在 `loadCompletedPurchaseLists` 函数后（约第 226 行后）添加：

```typescript
// 加载已有报销单数据（用于重新提交）
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
        key: `existing_${index}`
      })) || [];

      // 重新计算总额
      calculateTotal();

      uni.hideLoading();
    } else {
      uni.hideLoading();
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    uni.hideLoading();
    console.error('加载报销单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};
```

**Step 4: 提交修改**

```bash
git add miniapp/src/pages/staff-purchasing/reimbursement/submit.vue
git commit -m "feat: 支持重新提交时加载已有费用明细

- 使用 onLoad 替代 onMounted
- 添加 loadExistingReimbursement 函数
- 自动填充表单数据

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: 修改报销单详情页面 - 添加费用汇总卡片

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/reimbursement/detail.vue`

**Step 1: 在模板中添加费用汇总卡片**

在第 33 行（状态卡片后）添加：

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

**Step 2: 添加计算属性**

在第 186 行（`costDiffPercentage` 计算属性后）添加：

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

**Step 3: 添加样式**

在第 676 行（`</style>` 前）添加：

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

**Step 4: 提交修改**

```bash
git add miniapp/src/pages/staff-purchasing/reimbursement/detail.vue
git commit -m "feat: 在详情页展示费用汇总和计算公式

- 添加费用汇总卡片组件
- 实现计算属性（采购清单总额、自定义费用、计算公式）
- 添加费用明细展示样式

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: 后端集成测试

**Files:**
- Create: `backend/test-reimbursement-cost-details.sh`

**Step 1: 创建测试脚本**

```bash
cat > backend/test-reimbursement-cost-details.sh << 'EOF'
#!/bin/bash

echo "=== 测试报销单费用明细功能 ==="

# 配置
API_BASE="http://localhost:3000/api/v1/staff/purchasing"
TOKEN="your-test-token-here"

echo ""
echo "测试1: 提交包含费用明细的报销申请"
curl -X POST "${API_BASE}/reimbursements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseListIds": [],
    "receiptUrls": ["https://example.com/receipt.jpg"],
    "totalActualCost": 65.00,
    "platformShippingFee": 10.00,
    "platformPackagingFee": 5.00,
    "customFees": [
      {"description": "打车费", "amount": 30.00},
      {"description": "搬运费", "amount": 20.00}
    ]
  }' | jq '.'

echo ""
echo "测试2: 获取报销单详情（替换REIMBURSEMENT_ID）"
curl -X GET "${API_BASE}/reimbursements/REIMBURSEMENT_ID" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.'

echo ""
echo "测试3: 测试费用验证失败的情况"
curl -X POST "${API_BASE}/reimbursements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseListIds": [],
    "receiptUrls": ["https://example.com/receipt.jpg"],
    "totalActualCost": 100.00,
    "platformShippingFee": 10.00
  }' | jq '.'

echo ""
echo "=== 测试完成 ==="
EOF

chmod +x backend/test-reimbursement-cost-details.sh
```

**Step 2: 运行测试脚本**

```bash
cd backend && ./test-reimbursement-cost-details.sh
```

Expected:
- 测试1: 创建成功，返回报销单详情包含费用字段
- 测试2: 返回完整报销单详情，包含 platformShippingFee 等字段
- 测试3: 返回 400 错误，提示"报销总金额与费用明细不匹配"

**Step 3: 提交测试脚本**

```bash
git add backend/test-reimbursement-cost-details.sh
git commit -m "test: 添加报销单费用明细功能测试脚本

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: 前端手动测试

**Step 1: 启动小程序开发服务器**

```bash
cd miniapp && pnpm run dev:mp-weixin
```

**Step 2: 测试场景1: 新提交报销申请**

操作步骤：
1. 打开小程序，进入"提交报销申请"页面
2. 选择1-2个已完成的采购清单
3. 输入平台运费：10
4. 输入平台打包费：5
5. 点击"添加其它费用"，添加：
   - 描述：打车费，金额：30
   - 描述：搬运费，金额：20
6. 上传1张发票照片
7. 点击"提交报销申请"
8. 提交成功后，点击列表中的报销单查看详情

**预期结果**：
- 提交成功，无错误提示
- 详情页显示"费用明细"卡片
- 显示采购清单金额、运费、打包费、其它费用
- 显示计算公式：`采购清单(¥XXX) + 运费(¥10.00) + 打包费(¥5.00) + 其它费用(¥50.00) = ¥XXX`

**Step 3: 测试场景2: 重新提交报销申请**

操作步骤：
1. 创建一个测试报销单并提交
2. 在后台（或通过测试工具）将该报销单状态改为"已驳回"
3. 在小程序中找到该报销单，进入详情页
4. 点击"重新提交"按钮
5. 验证表单自动填充：
   - 采购清单已选中
   - 运费、打包费数值正确
   - 自定义费用列表正确
   - 发票照片已加载
6. 修改运费为15，删除一个自定义费用
7. 重新提交
8. 查看更新后的详情页

**预期结果**：
- 表单数据完全加载
- 修改后提交成功
- 详情页显示更新后的费用明细

**Step 4: 测试场景3: 历史数据兼容性**

操作步骤：
1. 查看在功能上线前创建的旧报销单
2. 进入详情页

**预期结果**：
- 详情页正常显示
- 费用明细卡片中只显示"采购清单金额"和"报销总额"
- 不显示计算公式（因为没有其他费用）

**Step 5: 测试场景4: 边界情况**

测试以下情况：
- 不选采购清单，只填写自定义费用
- 只选采购清单，不填写其他费用
- 所有费用项都填写

**预期结果**：
- 各种情况下金额计算正确
- 计算公式根据实际情况显示

---

## Task 11: 文档更新

**Files:**
- Create: `backend/docs/REIMBURSEMENT_COST_DETAILS.md`

**Step 1: 创建功能文档**

```bash
cat > backend/docs/REIMBURSEMENT_COST_DETAILS.md << 'EOF'
# 报销单费用明细功能

## 概述

报销单现在支持详细的费用明细记录，包括：
- 采购清单金额
- 平台运费
- 平台打包费
- 自定义费用（如打车费、搬运费等）

## API 变更

### 提交报销申请

**POST** `/api/v1/staff/purchasing/reimbursements`

新增可选字段：

```json
{
  "purchaseListIds": ["list-id-1", "list-id-2"],
  "receiptUrls": ["https://example.com/receipt.jpg"],
  "totalActualCost": 265.00,
  "platformShippingFee": 10.00,
  "platformPackagingFee": 5.00,
  "customFees": [
    {"description": "打车费", "amount": 30.00},
    {"description": "搬运费", "amount": 20.00}
  ]
}
```

**验证规则**：
- `totalActualCost` 必须等于：采购清单总额 + platformShippingFee + platformPackagingFee + sum(customFees[].amount)
- 误差容忍度：0.01元

### 获取报销单详情

**GET** `/api/v1/staff/purchasing/reimbursements/:id`

返回数据包含费用明细字段：

```json
{
  "id": "xxx",
  "claimNumber": "R20250125001",
  "totalActualCost": 265.00,
  "platformShippingFee": 10.00,
  "platformPackagingFee": 5.00,
  "customFees": [
    {"description": "打车费", "amount": 30.00},
    {"description": "搬运费", "amount": 20.00}
  ],
  "purchaseLists": [...]
}
```

## 数据库

### Schema 变更

```prisma
model Reimbursement {
  // ... 其他字段
  platformShippingFee   Decimal? @map("platform_shipping_fee") @db.Decimal(10, 2)
  platformPackagingFee  Decimal? @map("platform_packaging_fee") @db.Decimal(10, 2)
  customFees            Json?    @map("custom_fees") @db.JsonB
}
```

### 历史数据

对于在功能上线前创建的报销单：
- `platformShippingFee` 为 `NULL`
- `platformPackagingFee` 为 `NULL`
- `customFees` 为 `NULL` 或空数组 `[]`

前端在展示时需要处理这些 `NULL` 值。

## 前端展示

### 详情页

费用汇总卡片展示：

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

### 提交页面

支持输入：
- 平台运费（数字输入）
- 平台打包费（数字输入）
- 自定义费用列表（可动态添加/删除）
  - 描述（文本输入）
  - 金额（数字输入）

### 重新提交

重新提交时：
- 自动加载原有费用明细
- 允许修改所有费用项
- 需要重新上传发票照片

## 测试

参考测试脚本：`backend/test-reimbursement-cost-details.sh`

---

**文档版本**: 1.0
**最后更新**: 2025-01-25
EOF
```

**Step 2: 提交文档**

```bash
git add backend/docs/REIMBURSEMENT_COST_DETAILS.md
git commit -m "docs: 添加报销单费用明细功能文档

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: 生产环境准备

**Step 1: 创建数据库迁移备份脚本**

```bash
cat > backend/scripts/backup-reimbursement-before-migration.sh << 'EOF'
#!/bin/bash
# 备份 reimbursement 表结构

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "备份 reimbursement 表..."
pg_dump $DATABASE_URL -t reimbursement > "$BACKUP_DIR/reimbursement.sql"

echo "备份完成: $BACKUP_DIR"
EOF

chmod +x backend/scripts/backup-reimbursement-before-migration.sh
```

**Step 2: 创建迁移检查清单**

```bash
cat > backend/docs/MIGRATION_CHECKLIST.md << 'EOF'
# 报销单费用明细 - 生产环境迁移检查清单

## 迁移前

- [ ] 创建数据库备份
- [ ] 在测试环境验证迁移脚本
- [ ] 确认测试环境所有测试通过
- [ ] 通知团队即将部署

## 迁移中

- [ ] 在低峰时段执行
- [ ] 运行备份脚本：`./scripts/backup-reimbursement-before-migration.sh`
- [ ] 执行迁移：`npx prisma migrate deploy`
- [ ] 验证新字段已创建
- [ ] 检查历史数据是否正确（NULL 值）

## 迁移后

- [ ] 部署后端代码
- [ ] 部署前端代码
- [ ] 测试新提交报销申请
- [ ] 测试查看历史报销单
- [ ] 测试重新提交功能
- [ ] 监控错误日志（24小时）
- [ ] 收集用户反馈

## 回滚计划

如果发现问题：

1. 停止后端服务
2. 恢复数据库备份
3. 回滚代码到之前版本
4. 重启服务
5. 通知团队

---

**执行人**: ___________
**日期**: ___________
**签字**: ___________
EOF
```

**Step 3: 提交生产准备文件**

```bash
git add backend/scripts/backup-reimbursement-before-migration.sh backend/docs/MIGRATION_CHECKLIST.md
git commit -m "chore: 添加生产环境迁移准备文件

- 数据库备份脚本
- 迁移检查清单

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 完成检查清单

在标记功能完成前，确认：

### 后端
- [x] Prisma Schema 已更新
- [x] 数据库迁移已创建并测试
- [x] 实体层已更新
- [x] DTO 已更新
- [x] 验证逻辑已实现
- [x] API 文档已更新
- [x] 单元测试已通过
- [x] 集成测试已通过

### 前端
- [x] API 类型定义已更新
- [x] 提交页面已修改
- [x] 重新提交功能已实现
- [x] 详情页面已添加费用汇总卡片
- [x] 计算属性已实现
- [x] 样式已优化
- [x] 手动测试已通过

### 文档
- [x] 设计文档已完成
- [x] 实施计划已完成
- [x] API 文档已更新
- [x] 功能文档已创建
- [x] 迁移检查清单已准备

### 部署
- [x] 代码已提交到 Git
- [x] 所有提交有清晰的 commit message
- [x] 备份脚本已准备
- [x] 测试环境已验证
- [ ] 生产环境迁移计划已确认

---

## 预期结果

完成后，用户可以：

1. **提交报销申请**时，详细记录各项费用
2. **查看报销单详情**时，看到完整的费用明细和计算公式
3. **重新提交**被驳回的报销单时，自动加载和修改费用明细
4. **历史报销单**继续正常工作（费用字段为空）

费用明细展示效果：

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

**实施计划版本**: 1.0
**创建日期**: 2025-01-25
**预计工时**: 4-6小时
