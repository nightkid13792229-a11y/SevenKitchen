<template>
  <view class="purchase-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">采购清单详情</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="purchaseList" class="detail-content">
      <!-- 日期变更警告横幅 -->
      <view v-if="dateChanges.hasChanges" class="date-change-warning">
        <view class="warning-header">
          <text class="warning-icon">⚠️</text>
          <text class="warning-title">检测到 {{ dateChanges.changedOrders.length }} 个订单的制作日期已变更</text>
        </view>
        <view class="warning-list">
          <view
            v-for="(order, index) in dateChanges.changedOrders"
            :key="index"
            class="warning-item"
          >
            <text class="order-info">{{ order.orderNumber }}: {{ order.originalDate }} → {{ order.currentDate }}</text>
            <text class="order-detail">{{ order.customerName }} · {{ order.dogName }}</text>
          </view>
        </view>
        <view class="warning-actions">
          <button class="warning-btn ignore" @tap="ignoreDateChanges">忽略</button>
        </view>
      </view>

      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <view class="header-left">
            <text class="target-date">{{ formatDate(purchaseList.targetDate) }}</text>
            <text class="create-time">创建于 {{ formatFullDateTime(purchaseList.createdAt) }}</text>
          </view>
          <view class="status-badge" :class="getStatusClass(purchaseList.status)">
            <text>{{ getStatusText(purchaseList.status) }}</text>
          </view>
        </view>

        <!-- 完成时间 -->
        <view v-if="purchaseList.completedAt" class="complete-time">
          <text class="label">完成时间:</text>
          <text class="value">{{ formatFullDateTime(purchaseList.completedAt) }}</text>
        </view>

        <!-- 创建人 -->
        <view class="creator">
          <text class="label">创建人:</text>
          <text class="value">{{ purchaseList.createdBy?.nickname || '-' }}</text>
        </view>
      </view>

      <!-- 原料明细 -->
      <view class="section">
        <text class="section-title">原料明细 ({{ items.length }})</text>

        <!-- 按类型分组显示原料 -->
        <view v-if="groupedItems.length > 0" class="grouped-items">
          <view
            v-for="group in groupedItems"
            :key="group.type"
            class="ingredient-group"
          >
            <!-- 类型标题 -->
            <view class="group-header">
              <text class="group-title">{{ getTypeLabel(group.type) }} ({{ group.items.length }})</text>
            </view>

            <!-- 该类型的原料列表 -->
            <view class="items-list">
              <view
                v-for="(item, index) in group.items"
                :key="index"
                class="item-card"
              >
                <!-- 原料基本信息（始终显示） -->
                <view class="item-basic">
                  <view class="item-info">
                    <text class="item-name">{{ item.ingredientName || '未知原料' }}</text>
                    <view v-if="item.resolvedProcurementSkuName || item.resolvedSuggestedProductName" class="item-sku-lines">
                      <text v-if="item.resolvedProcurementSkuName" class="item-sku primary">
                        采购SKU：{{ item.resolvedProcurementSkuName }}
                      </text>
                      <text
                        v-if="item.resolvedSuggestedProductName && item.resolvedSuggestedProductName !== item.resolvedProcurementSkuName"
                        class="item-sku secondary"
                      >
                        推荐参考：{{ item.resolvedSuggestedProductName }}
                      </text>
                    </view>
                    <view v-if="item.resolvedPurchaseChannel || item.resolvedProductModel" class="item-specs">
                      <text v-if="item.resolvedPurchaseChannel" class="spec">{{ item.resolvedPurchaseChannel }}</text>
                      <text v-if="item.resolvedProductModel" class="spec">{{ item.resolvedProductModel }}</text>
                    </view>
                    <view class="item-quantity">
                      <text class="quantity-label">需求: </text>
                      <text class="quantity-value">{{ formatQuantity(item) }}</text>
                      <text class="quantity-unit">{{ getDisplayUnit(item) }}</text>
                    </view>
                  </view>

                  <view class="item-actions">
                    <!-- 删除原料按钮 (仅PENDING状态且未开始采购时显示) -->
                    <button
                      v-if="purchaseList.status === 'PENDING' && !purchaseList.startedAt"
                      class="delete-item-btn"
                      @tap="confirmDeleteItem(item)"
                    >
                      删除
                    </button>

                    <!-- 开始采购后显示的添加按钮 -->
                    <button
                      v-if="purchaseList.startedAt"
                      class="continue-add-btn"
                      @tap="handleContinueAdd(item)"
                    >
                      添加采购记录
                    </button>
                  </view>
                </view>

                <!-- 已开始采购且有记录：显示采购记录列表 -->
                <view v-if="purchaseList.startedAt && item.records.length > 0" class="item-expanded">
                  <view class="divider"></view>

                  <!-- 采购记录列表 -->
                  <view class="records-list">
                    <view
                      v-for="record in item.records"
                      :key="record.id"
                      class="record-item"
                    >
                      <view class="record-main">
                        <text v-if="record.resolvedProcurementSkuName" class="record-sku">
                          采购SKU：{{ record.resolvedProcurementSkuName }}
                        </text>
                        <view class="record-info">
                          <text class="record-quantity">{{ record.actualQuantity }}{{ getPurchaseUnit(item) }}</text>
                          <text class="record-cost">¥{{ record.actualCost.toFixed(2) }}</text>
                          <text v-if="record.resolvedPurchaseChannel" class="record-channel">{{ record.resolvedPurchaseChannel }}</text>
                        </view>
                        <view class="record-details">
                          <text v-if="record.resolvedProductModel" class="detail">{{ record.resolvedProductModel }}</text>
                          <text class="detail-time">{{ formatFullDateTime(record.createdAt) }}</text>
                        </view>
                      </view>
                      <view v-if="purchaseList.status === 'PENDING' && !purchaseList.reimbursementId" class="record-actions">
                        <button class="delete-btn" @tap="deleteRecord(record.id)">删除</button>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-else class="empty-items">
          <text class="empty-text">该采购清单暂无原料</text>
        </view>

      </view>

      <!-- 关联订单 -->
      <view v-if="purchaseList.sourceOrderIds && purchaseList.sourceOrderIds.length > 0" class="section">
        <text class="section-title">关联订单 ({{ purchaseList.sourceOrderIds.length }})</text>
        <view class="order-list">
          <view
            v-for="(orderId, index) in purchaseList.sourceOrderIds"
            :key="index"
            class="order-item"
          >
            <text class="order-id">{{ formatOrderId(orderId) }}</text>
            <button class="copy-btn" @tap="copyOrderId(orderId)">
              <text class="copy-btn-text">复制</text>
            </button>
          </view>
        </view>
      </view>

      <!-- 底部操作栏 -->
      <view
        v-if="purchaseList.status === 'PENDING'"
        class="bottom-actions"
      >
        <!-- 未开始采购：显示开始采购按钮 -->
        <button
          v-if="!purchaseList.startedAt"
          class="action-btn start"
          @tap="startPurchase"
        >
          开始采购
        </button>

        <!-- 已开始采购：显示确认完成按钮 -->
        <template v-else>
          <button
            class="action-btn complete"
            @tap="completePurchase"
            :loading="completing"
          >
            <text v-if="!completing">确认采购完成</text>
            <text v-else>提交中...</text>
          </button>
        </template>
      </view>

      <!-- 已完成提示 -->
      <view
        v-if="purchaseList.status === 'COMPLETED'"
        class="bottom-actions completed"
      >
        <text class="completed-text">✓ 采购已完成</text>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <button class="retry-btn" @tap="loadDetail">重试</button>
    </view>

    <!-- 采购表单弹窗 -->
    <view v-if="showRecordForm" class="record-form-modal" @tap="closeRecordForm">
      <view class="modal-content" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">添加采购记录</text>
          <text class="modal-close" @tap="closeRecordForm">×</text>
        </view>

        <view class="modal-body">
          <!-- 清单内原料：原料名称只读 -->
          <view class="form-section">
            <text class="form-label">原料</text>
            <view class="form-value readonly">
              {{ selectedIngredient.ingredientName }}
            </view>
          </view>

          <!-- 生产采购 SKU（选填） -->
          <view v-if="selectedIngredientProcurementSkus.length > 0" class="form-section">
            <text class="form-label">生产采购SKU</text>
            <picker
              mode="selector"
              :range="selectedIngredientProcurementSkus"
              range-key="name"
              :value="selectedProcurementSkuIndex"
              @change="onProcurementSkuChange"
            >
              <view class="picker-input">
                <text class="value">{{ selectedProcurementSkuLabel }}</text>
                <text class="arrow">›</text>
              </view>
            </picker>
            <text class="form-hint">会随采购记录一起保存，便于后续统计同一标准原料下的不同采购商品</text>
          </view>

          <!-- 采购渠道 -->
          <view class="form-section">
            <text class="form-label">采购渠道 *</text>
            <view class="channel-input-wrapper">
              <input
                v-model="recordForm.purchaseChannel"
                class="form-input channel-input"
                placeholder="请输入或选择采购渠道"
                placeholder-class="input-placeholder"
              />
              <picker
                v-if="channelOptions.length > 0"
                mode="selector"
                :range="channelOptions"
                @change="onChannelChange"
              >
                <view class="quick-select-btn">
                  <text>快速选择</text>
                </view>
              </picker>
            </view>
          </view>

          <!-- 实际采购数量（动态单位） -->
          <view class="form-section">
            <text class="form-label">实际采购数量（{{ getPurchaseUnit(selectedIngredient) }}） *</text>
            <input
              v-model.number="recordForm.actualQuantity"
              type="digit"
              class="form-input"
              :placeholder="`请输入${getPurchaseUnit(selectedIngredient)}数`"
              placeholder-class="input-placeholder"
            />
          </view>

          <!-- 实际采购金额 -->
          <view class="form-section">
            <text class="form-label">实际采购金额（元） *</text>
            <input
              v-model="recordForm.actualCost"
              type="digit"
              class="form-input"
              placeholder="请输入金额，如：156.50"
              placeholder-class="input-placeholder"
            />
          </view>

          <!-- 产品型号（选填，预填充） -->
          <view class="form-section">
            <text class="form-label">产品型号（选填）</text>
            <input
              v-model="recordForm.productModel"
              class="form-input"
              placeholder="如：500g装"
              placeholder-class="input-placeholder"
            />
          </view>

          <!-- 备注信息（选填） -->
          <view class="form-section">
            <text class="form-label">备注信息（选填）</text>
            <textarea
              v-model="recordForm.notes"
              class="form-textarea"
              placeholder="请输入备注信息"
              placeholder-class="input-placeholder"
              :maxlength="200"
            />
            <text class="char-count">{{ recordForm.notes.length }}/200</text>
          </view>
        </view>

        <view class="modal-footer">
          <button class="modal-btn cancel" @tap="closeRecordForm">取消</button>
          <button class="modal-btn submit" @tap="submitRecord" :loading="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getPurchaseListDetail,
  completePurchase as completePurchaseApi,
  startPurchase as startPurchaseApi,
  getPurchaseRecords,
  deletePurchaseRecord as deletePurchaseRecordApi,
  addPurchaseRecord,
  removeItemFromList,
  checkOrderDateChanges,
  getPurchaseChannels,
  resolvePurchaseItemDisplay,
  resolvePurchaseRecordDisplay,
  type ProcurementSkuOption,
} from '@/api/purchasing';

// 状态管理
const purchaseListId = ref('');
const purchaseList = ref<any>(null);
const items = ref<any[]>([]);
const loading = ref(true);
const completing = ref(false);
const allPurchaseChannels = ref<string[]>([]); // 所有采购渠道列表

// 按类型分组的原料（计算属性）
const groupedItems = computed(() => {
  if (items.value.length === 0) {
    return [];
  }

  // 定义类型顺序
  const typeOrder = ['FOOD', 'SUPPLEMENT', 'PACKAGING'];

  // 按类型分组
  const groups = new Map<string, any[]>();
  items.value.forEach(item => {
    const type = item.type || 'FOOD';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(item);
  });

  // 按定义的顺序返回分组
  return typeOrder
    .filter(type => groups.has(type))
    .map(type => ({
      type,
      items: groups.get(type)!,
    }));
});

// 获取类型标签
const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'FOOD': '🥩 食材',
    'SUPPLEMENT': '💊 补剂',
    'PACKAGING': '📦 包装材料',
  };
  return labels[type] || type;
};

// 采购表单相关
const showRecordForm = ref(false);
const selectedIngredient = ref<any>(null);
const submitting = ref(false);
const selectedProcurementSkuIndex = ref(0);

const recordForm = ref({
  procurementSkuId: '',
  purchaseChannel: '',
  actualQuantity: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

// 采购渠道选项（从所有原料数据库中加载）
const channelOptions = computed(() => {
  // 返回从API加载的所有采购渠道
  return allPurchaseChannels.value;
});

const selectedIngredientProcurementSkus = computed<ProcurementSkuOption[]>(() => {
  return selectedIngredient.value?.procurementSkuOptions || [];
});

const selectedProcurementSkuLabel = computed(() => {
  if (selectedIngredientProcurementSkus.value.length === 0) {
    return '未配置生产采购 SKU';
  }

  return (
    selectedIngredientProcurementSkus.value[selectedProcurementSkuIndex.value]?.name ||
    selectedIngredientProcurementSkus.value[0]?.name ||
    '请选择生产采购 SKU'
  );
});

// 获取采购单位（多级回退 + 默认值）
const getPurchaseUnit = (item: any): string => {
  if (item?.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  // 优先级1: displayUnit（显示单位标签）
  if (item.displayUnit) {
    return item.displayUnit;
  }

  // 优先级2: quantityUnit（数量单位）
  if (item.quantityUnit) {
    return item.quantityUnit;
  }

  // 优先级3: ingredient.purchaseUnit（原料采购单位）
  if (item.ingredient?.purchaseUnit) {
    return item.ingredient.purchaseUnit;
  }

  // 默认值: 克
  return 'g';
};

// 日期变更检测
const dateChanges = ref<any>({
  hasChanges: false,
  changedOrders: [],
});

// 页面加载
onLoad((options: any) => {
  purchaseListId.value = options.id;
  loadDetail();
});

// 加载详情
const loadDetail = async () => {
  loading.value = true;

  try {
    // 加载采购渠道列表
    await loadPurchaseChannels();

    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      purchaseList.value = res.data;
      items.value = (res.data.items || []).map((item: any) => ({
        ...resolvePurchaseItemDisplay(item),
        records: [],
        expanded: false,
      }));

      // 如果已开始采购，加载采购记录
      if (res.data.startedAt) {
        await loadPurchaseRecords();
      }

      // 检测日期变更
      await checkDateChanges();
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 检测日期变更
const checkDateChanges = async () => {
  try {
    const res: any = await checkOrderDateChanges(purchaseListId.value);
    if (res.code === 0) {
      dateChanges.value = res.data;
    }
  } catch (error: any) {
    console.error('检测日期变更失败', error);
  }
};

// 加载所有采购渠道
const loadPurchaseChannels = async () => {
  try {
    const res: any = await getPurchaseChannels();
    if (res.code === 0) {
      allPurchaseChannels.value = res.data || [];
    } else {
      console.error('加载采购渠道失败:', res.message);
    }
  } catch (error) {
    console.error('加载采购渠道失败', error);
  }
};

// 加载采购记录并按原料分组
const loadPurchaseRecords = async () => {
  try {
    const res: any = await getPurchaseRecords(purchaseListId.value);
    if (res.code === 0) {
      const allRecords = (res.data || []).map((record: any) =>
        resolvePurchaseRecordDisplay(record)
      );

      // 按原料ID分组
      const grouped = new Map<string, any[]>();
      allRecords.forEach((record: any) => {
        const key = record.ingredientId;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(record);
      });

      // 将采购记录关联到对应的原料卡片
      items.value.forEach(item => {
        item.records = grouped.get(item.ingredientId) || [];
      });
    }
  } catch (error: any) {
    console.error('加载采购记录失败', error);
  }
};

// 点击"继续添加采购记录"按钮
const handleContinueAdd = (item: any) => {
  selectedIngredient.value = item;
  resetRecordForm();

  // 预填充采购渠道与规格，优先使用生产采购 SKU
  recordForm.value.purchaseChannel = item.resolvedPurchaseChannel || '';
  recordForm.value.productModel = item.resolvedProductModel || '';

  const procurementSkus = item.procurementSkuOptions || [];
  const matchedIndex = procurementSkus.findIndex((sku: ProcurementSkuOption) => {
    if (item.resolvedProcurementSkuId && sku.id) {
      return sku.id === item.resolvedProcurementSkuId;
    }

    return sku.name === item.resolvedProcurementSkuName;
  });

  if (matchedIndex >= 0) {
    selectedProcurementSkuIndex.value = matchedIndex;
    applyProcurementSku(procurementSkus[matchedIndex], false);
  } else {
    selectedProcurementSkuIndex.value = 0;
    applyProcurementSku(procurementSkus[0], false);
  }

  showRecordForm.value = true;
};

// 关闭采购表单
const closeRecordForm = () => {
  showRecordForm.value = false;
  selectedIngredient.value = null;
  selectedProcurementSkuIndex.value = 0;
};

// 采购渠道快速选择
const onChannelChange = (e: any) => {
  const index = e.detail.value;
  const channel = channelOptions.value[index];
  recordForm.value.purchaseChannel = channel;
};

const applyProcurementSku = (
  sku?: ProcurementSkuOption,
  overrideExistingValues = true
) => {
  if (!sku) {
    recordForm.value.procurementSkuId = '';
    return;
  }

  recordForm.value.procurementSkuId = sku.id || '';

  if (overrideExistingValues || !recordForm.value.purchaseChannel) {
    recordForm.value.purchaseChannel = sku.purchaseChannel || recordForm.value.purchaseChannel;
  }

  if (overrideExistingValues || !recordForm.value.productModel) {
    recordForm.value.productModel = sku.productModel || recordForm.value.productModel;
  }
};

const onProcurementSkuChange = (e: any) => {
  selectedProcurementSkuIndex.value = Number(e.detail.value || 0);
  applyProcurementSku(selectedIngredientProcurementSkus.value[selectedProcurementSkuIndex.value]);
};

// 重置表单
const resetRecordForm = () => {
  recordForm.value = {
    procurementSkuId: '',
    purchaseChannel: '',
    actualQuantity: '',
    actualCost: '',
    productModel: '',
    notes: '',
  };
};

// 提交采购记录
const submitRecord = async () => {
  // 表单验证
  if (!recordForm.value.purchaseChannel || recordForm.value.purchaseChannel.trim().length === 0) {
    uni.showToast({ title: '请输入采购渠道', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualQuantity || recordForm.value.actualQuantity.toString().trim().length === 0) {
    uni.showToast({ title: `请输入实际采购${getPurchaseUnit(selectedIngredient.value)}`, icon: 'none' });
    return;
  }

  const quantity = Number(recordForm.value.actualQuantity);
  if (isNaN(quantity) || quantity <= 0) {
    uni.showToast({ title: '数量必须大于0', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualCost || recordForm.value.actualCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入实际采购金额', icon: 'none' });
    return;
  }

  const cost = Number(recordForm.value.actualCost);
  if (isNaN(cost) || cost <= 0) {
    uni.showToast({ title: '金额必须大于0', icon: 'none' });
    return;
  }

  const costStr = recordForm.value.actualCost.toString();
  const decimalIndex = costStr.indexOf('.');
  if (decimalIndex !== -1 && costStr.length - decimalIndex - 1 > 2) {
    uni.showToast({ title: '金额最多两位小数', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const data: any = {
      purchaseChannel: recordForm.value.purchaseChannel.trim(),
      actualQuantity: Math.round(quantity),  // 确保为整数
      actualCost: cost,
      procurementSkuId: recordForm.value.procurementSkuId || undefined,
      productModel: recordForm.value.productModel?.trim() || undefined,
      notes: recordForm.value.notes?.trim() || undefined,
      purchaseItemId: selectedIngredient.value.id,
      ingredientId: selectedIngredient.value.ingredientId,
      ingredientName: selectedIngredient.value.ingredientName,
    };

    const response: any = await addPurchaseRecord(purchaseListId.value, data);

    if (response.code === 0) {
      uni.showToast({ title: '保存成功', icon: 'success' });

      // 刷新采购记录
      await loadPurchaseRecords();

      // 如果是清单内原料，保持展开状态
      if (selectedIngredient.value) {
        const item = items.value.find(
          i => i.ingredientId === selectedIngredient.value.ingredientId
        );
        if (item) {
          item.expanded = true;
        }
      }

      closeRecordForm();
    } else {
      uni.showToast({ title: response.message || '保存失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('保存采购记录失败', error);
    uni.showToast({ title: error.message || '保存失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

// 删除采购记录
const deleteRecord = (recordId: string) => {
  uni.showModal({
    title: '删除采购记录',
    content: '确认删除该采购记录？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await deletePurchaseRecordApi(recordId);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });
            // 刷新采购记录
            await loadPurchaseRecords();
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除采购记录失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

// 确认采购完成
const completePurchase = () => {
  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料已采购完成？',
    success: async (res) => {
      if (res.confirm) {
        completing.value = true;

        try {
          const response: any = await completePurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('确认采购完成失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        } finally {
          completing.value = false;
        }
      }
    },
  });
};

// 开始采购
const startPurchase = () => {
  uni.showModal({
    title: '开始采购',
    content: '开始采购后可以录入采购记录，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await startPurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('开始采购失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    },
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'DRAFT': 'draft',
    'PENDING': 'pending',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled',
  };
  return classMap[status] || '';
};

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 复制订单ID
const copyOrderId = (orderId: string) => {
  uni.setClipboardData({
    data: orderId,
    success: () => {
      uni.showToast({
        title: '订单ID已复制',
        icon: 'success',
        duration: 2000
      });
    },
    fail: () => {
      uni.showToast({
        title: '复制失败',
        icon: 'none',
        duration: 2000
      });
    }
  });
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
};

// 格式化完整日期时间
const formatFullDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// 格式化原料用量（根据原料类型处理）
const formatQuantity = (item: any) => {
  const quantity = Number(item.quantityNeeded);

  // 食材类型：kg转换为g，显示为整数
  if (item.type === 'FOOD' && item.quantityUnit === 'kg') {
    return Math.round(quantity * 1000);
  }

  // 补剂类型和其他：保留两位小数
  return quantity.toFixed(2);
};

// 获取显示单位
const getDisplayUnit = (item: any) => {
  // 食材类型：kg转换为g
  if (item.type === 'FOOD' && item.quantityUnit === 'kg') {
    return 'g';
  }

  if (item.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  // 补剂类型：优先使用displayUnit，回退到quantityUnit
  if (item.type === 'SUPPLEMENT') {
    return item.displayUnit || item.quantityUnit || 'g';
  }

  // 其他类型：使用quantityUnit
  return item.quantityUnit || '';
};

// ==========================================
// 新增功能：日期变更处理
// ==========================================

// 忽略日期变更
const ignoreDateChanges = () => {
  dateChanges.value = {
    hasChanges: false,
    changedOrders: [],
  };
  uni.showToast({ title: '已忽略日期变更', icon: 'success' });
};

// ==========================================
// 新增功能：删除原料
// ==========================================

// 确认删除原料
const confirmDeleteItem = (item: any) => {
  uni.showModal({
    title: '删除原料',
    content: `确认删除原料"${item.ingredientName}"？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await removeItemFromList(purchaseListId.value, item.id);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });

            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除原料失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

</script>

<style scoped lang="scss">
.purchase-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.header {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
  }
}

.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }

  .error-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }

  .error-text {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    padding: 16rpx 48rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;
  }
}

.detail-content {
  padding: 0 32rpx;
}

.section {
  background-color: #fff;
  margin-bottom: 24rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }

  .section-header {
    margin-bottom: 16rpx;
  }

  .divider {
    height: 1rpx;
    background-color: #f0f0f0;
    margin: 24rpx 0;
  }
}

.status-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16rpx;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-date {
        font-size: 32rpx;
        font-weight: bold;
        color: #333;
      }

      .create-time {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: bold;

      &.draft {
        background-color: #f0f0f0;
        color: #666;
      }

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.completed {
        background-color: #f6ffed;
        color: #52c41a;
      }

      &.cancelled {
        background-color: #ffebee;
        color: #f44336;
      }
    }
  }

  .complete-time, .creator {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid #f5f5f5;

    &:last-child {
      margin-bottom: 0;
      border-bottom: none;
    }

    .label {
      font-size: 26rpx;
      color: #666;
    }

    .value {
      font-size: 26rpx;
      color: #333;
      font-weight: 500;
    }
  }
}

// 原料分组容器
.grouped-items {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.ingredient-group {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  overflow: hidden;

  .group-header {
    background: linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%);
    padding: 16rpx 24rpx;
    border-bottom: 1rpx solid #e5e5e5;

    .group-title {
      font-size: 26rpx;
      font-weight: bold;
      color: #333;
    }
  }

  .items-list {
    padding: 16rpx;
    background-color: transparent;
  }
}

// 原料卡片
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item-card {
  background-color: #f9f9f9;
  border-radius: 16rpx;
  overflow: hidden;
  transition: all 0.3s;

  .item-basic {
    padding: 24rpx;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16rpx;

    .item-info {
      flex: 1;
      min-width: 0;

      .item-name {
        font-size: 30rpx;
        font-weight: 500;
        color: #333;
        margin-bottom: 12rpx;
        display: block;
      }

      .item-sku-lines {
        display: flex;
        flex-direction: column;
        gap: 6rpx;
        margin-bottom: 12rpx;

        .item-sku {
          font-size: 24rpx;

          &.primary {
            color: #1890ff;
            font-weight: 500;
          }

          &.secondary {
            color: #8c8c8c;
          }
        }
      }

      .item-specs {
        display: flex;
        flex-wrap: wrap;
        gap: 8rpx;
        margin-bottom: 12rpx;

        .spec {
          font-size: 22rpx;
          color: #666;
          padding: 4rpx 12rpx;
          background-color: #f0f0f0;
          border-radius: 4rpx;
        }
      }

      .item-quantity {
        display: flex;
        align-items: baseline;
        gap: 4rpx;

        .quantity-label {
          font-size: 24rpx;
          color: #666;
        }

        .quantity-value {
          font-size: 32rpx;
          font-weight: bold;
          color: #1890ff;
        }

        .quantity-unit {
          font-size: 22rpx;
          color: #999;
        }
      }
    }

    .item-action {
      flex-shrink: 0;
      align-self: flex-end;

      .continue-add-btn {
        padding: 12rpx 20rpx;
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: #fff;
        border-radius: 8rpx;
        font-size: 24rpx;
        border: none;
        line-height: 1.5;
        white-space: nowrap;

        &:active {
          opacity: 0.8;
        }
      }
    }
  }

  .item-expanded {
    background-color: #fff;

    .records-list {
      padding: 0 24rpx 24rpx;
      display: flex;
      flex-direction: column;
      gap: 16rpx;
    }

    .record-item {
      padding: 24rpx;
      background-color: #f9f9f9;
      border-radius: 12rpx;
      border-left: 4rpx solid #1890ff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16rpx;

      .record-main {
        flex: 1;
        min-width: 0;

        .record-sku {
          display: block;
          margin-bottom: 8rpx;
          font-size: 24rpx;
          color: #1890ff;
          font-weight: 500;
        }

        .record-info {
          display: flex;
          align-items: center;
          gap: 12rpx;
          margin-bottom: 8rpx;
          flex-wrap: wrap;

          .record-quantity {
            font-size: 28rpx;
            font-weight: bold;
            color: #1890ff;
          }

          .record-cost {
            font-size: 28rpx;
            font-weight: bold;
            color: #ff6b6b;
          }

          .record-channel {
            font-size: 24rpx;
            color: #666;
          }
        }

        .record-details {
          display: flex;
          flex-wrap: wrap;
          gap: 8rpx;

          .detail {
            font-size: 22rpx;
            color: #999;
            padding: 4rpx 8rpx;
            background-color: #f0f0f0;
            border-radius: 4rpx;
          }

          .detail-time {
            font-size: 22rpx;
            color: #999;
          }
        }
      }

      .record-actions {
        flex-shrink: 0;
        align-self: flex-start;

        .delete-btn {
          padding: 8rpx 24rpx;
          background-color: #ff4d4f;
          color: #fff;
          border-radius: 8rpx;
          font-size: 22rpx;
          border: none;
          line-height: 1.5;

          &:active {
            opacity: 0.8;
          }
        }
      }
    }
  }
}

.empty-items {
  display: flex;
  justify-content: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 26rpx;
    color: #999;
  }
}

.order-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;

  .order-id {
    font-size: 24rpx;
    color: #1890ff;
    font-family: monospace;
  }

  .copy-btn {
    padding: 4rpx 12rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 4rpx;
    font-size: 20rpx;
    border: none;
    line-height: 1.5;

    .copy-btn-text {
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// 底部操作栏
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
  z-index: 100;
  display: flex;
  gap: 12rpx;

  .action-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.start {
      background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(82, 196, 26, 0.3);
    }

    &.complete {
      background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(81, 207, 102, 0.3);
    }

    &:active {
      opacity: 0.8;
    }
  }

  &.completed {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 32rpx;
    gap: 12rpx;

    .completed-text {
      font-size: 32rpx;
      font-weight: bold;
      color: #52c41a;
    }

    .reimburse,
    .view-reimburse {
      width: 100%;
      height: 88rpx;
      border-radius: 16rpx;
      font-size: 32rpx;
      font-weight: bold;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .reimburse {
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(24, 144, 255, 0.3);

      &:active {
        opacity: 0.8;
      }
    }

    .view-reimburse {
      background: linear-gradient(135deg, #722ed1 0%, #531dab 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(114, 46, 209, 0.3);

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// 采购表单弹窗
.record-form-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.modal-content {
  width: 100%;
  max-height: 80vh;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .modal-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .modal-close {
    font-size: 48rpx;
    color: #999;
    line-height: 1;
    padding: 0 16rpx;
  }
}

.modal-body {
  padding: 32rpx;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 24rpx;

  .form-label {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
    margin-bottom: 12rpx;
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #333;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    box-sizing: border-box;
  }

  .form-value {
    &.readonly {
      height: 80rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      color: #666;
      background-color: #f5f5f5;
      border-radius: 8rpx;
      display: flex;
      align-items: center;
    }
  }

  .form-hint {
    display: block;
    margin-top: 10rpx;
    font-size: 22rpx;
    line-height: 1.5;
    color: #8c8c8c;
  }

  .picker-input {
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .value {
      color: #333;
    }

    .placeholder {
      color: #999;
    }

    .arrow {
      font-size: 32rpx;
      color: #999;
    }
  }

  .channel-input-wrapper {
    display: flex;
    gap: 12rpx;
    align-items: center;

    .channel-input {
      flex: 1;
    }

    .quick-select-btn {
      flex-shrink: 0;
      padding: 0 24rpx;
      height: 80rpx;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      border-radius: 8rpx;
      display: flex;
      align-items: center;
      justify-content: center;

      text {
        font-size: 26rpx;
        color: #fff;
        font-weight: 500;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }

  .form-textarea {
    width: 100%;
    min-height: 160rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    color: #333;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    box-sizing: border-box;
  }

  .char-count {
    display: block;
    font-size: 22rpx;
    color: #999;
    text-align: right;
    margin-top: 8rpx;
  }
}

.input-placeholder {
  color: #999;
}

.modal-footer {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #f0f0f0;
  display: flex;
  gap: 24rpx;

  .modal-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 12rpx;
    font-size: 32rpx;
    font-weight: 500;
    border: none;

    &.cancel {
      background-color: #f5f5f5;
      color: #666;
    }

    &.submit {
      background: linear-gradient(135deg, #faad14 0%, #d48806 100%);
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// ==========================================
// 新增样式：日期变更警告横幅
// ==========================================
.date-change-warning {
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
  border-left: 6rpx solid #fa8c16;

  .warning-header {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 16rpx;

    .warning-icon {
      font-size: 32rpx;
    }

    .warning-title {
      font-size: 28rpx;
      font-weight: bold;
      color: #ad6800;
    }
  }

  .warning-list {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-bottom: 16rpx;
    padding: 16rpx;
    background-color: rgba(255, 255, 255, 0.6);
    border-radius: 8rpx;

    .warning-item {
      display: flex;
      flex-direction: column;
      gap: 4rpx;

      .order-info {
        font-size: 26rpx;
        color: #ad6800;
        font-weight: 500;
      }

      .order-detail {
        font-size: 22rpx;
        color: #8c6800;
      }
    }
  }

  .warning-actions {
    display: flex;
    gap: 12rpx;

    .warning-btn {
      flex: 1;
      height: 72rpx;
      border-radius: 12rpx;
      font-size: 26rpx;
      font-weight: 500;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;

      &.ignore {
        background-color: rgba(250, 140, 22, 0.1);
        color: #ad6800;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// ==========================================
// 修改样式：原料卡片操作按钮
// ==========================================
.item-actions {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-self: flex-end;

  .delete-item-btn {
    padding: 8rpx 20rpx;
    background-color: #ff4d4f;
    color: #fff;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: none;
    line-height: 1.5;
    white-space: nowrap;

    &:active {
      opacity: 0.8;
    }
  }

  .continue-add-btn {
    padding: 12rpx 20rpx;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    color: #fff;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: none;
    line-height: 1.5;
    white-space: nowrap;

    &:active {
      opacity: 0.8;
    }
  }
}
</style>
