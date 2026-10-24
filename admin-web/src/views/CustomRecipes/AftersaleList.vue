<template>
  <div class="aftersale-workbench">
    <div class="page-header">
      <h1>售后待办</h1>
      <div class="header-actions">
        <el-switch
          v-model="includeClosed"
          active-text="含已处理"
          @change="load"
        />
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <!--
      这一页的排序与"能做什么"全部由**后端算好**：
      · 等太久的排前面；同等时长下"调整食谱"比"问个问题"急
        （前者顾客的狗可能正在吃着不合适的饭）
      · 每个状态显示哪几个按钮，后端给 actions 清单
      前端不自己排、不自己判断状态。
    -->
    <el-alert
      v-if="includeClosed"
      type="info"
      :closable="false"
      show-icon
      title="正在显示全部（含已处理）"
      description="默认只列未处理完的 —— 打开这一页就该看到「还有几件事没做」。"
      class="tip"
    />

    <el-empty
      v-if="!loading && items.length === 0"
      :description="includeClosed ? '还没有任何售后' : '没有待处理的售后，很好'"
    />

    <el-card
      v-for="item in items"
      :key="item.id"
      shadow="never"
      class="aftersale-card"
      :class="{ 'is-urgent': item.isUrgent }"
    >
      <div class="card-head">
        <div class="head-left">
          <el-tag :type="statusTagType(item.status)" size="small">
            {{ item.statusLabel }}
          </el-tag>
          <el-tag type="info" size="small" effect="plain">
            {{ item.typeLabel }}
          </el-tag>
          <!-- 等了多久：客服一眼看出哪条催得急 -->
          <span class="waiting" :class="{ 'is-long': item.isUrgent }">
            等了 {{ formatWaiting(item.hoursWaiting) }}
          </span>
        </div>
        <div class="head-right">
          <span class="order-no">{{ item.orderId }}</span>
        </div>
      </div>

      <div class="card-body">
        <div class="meta">
          <span v-if="item.dogName">🐕 {{ item.dogName }}</span>
          <span v-if="item.customerName">{{ item.customerName }}</span>
          <span v-if="item.customerPhone">{{ item.customerPhone }}</span>
        </div>
        <div class="description">{{ item.description }}</div>
        <!--
          多份售后（2026-10-21）：涉及哪几份、每份要改什么。
          老订单没有按份选择，整块不显示，仍只看上面那条共用说明。
        -->
        <div v-if="batchRecipesOf(item).length" class="batch-recipes">
          <div class="batch-recipes-title">
            涉及 {{ batchRecipesOf(item).length }} 份食谱
          </div>
          <div
            v-for="recipe in batchRecipesOf(item)"
            :key="recipe.deliveryItemId"
            class="batch-recipe"
          >
            <el-tag size="small" effect="plain">
              {{ recipe.recipeName }}
            </el-tag>
            <span
              v-if="recipe.requestDescription"
              class="batch-recipe-request"
            >{{ recipe.requestDescription }}</span>
            <div
              v-if="recipe.requestPhotos && recipe.requestPhotos.length"
              class="batch-recipe-photos"
            >
              <el-image
                v-for="(photo, photoIndex) in recipe.requestPhotos"
                :key="photoIndex"
                :src="photo"
                :preview-src-list="recipe.requestPhotos"
                :initial-index="photoIndex"
                fit="cover"
                class="batch-recipe-photo"
              />
            </div>
            <el-button
              v-if="isAdmin && ['ACCEPTED', 'PROCESSING'].includes(item.status)"
              size="small"
              link
              type="primary"
              :loading="reopeningId === item.id"
              :disabled="Boolean(reopeningId)"
              @click="editAftersaleRecipe(item, recipe.deliveryItemId)"
            >修改食谱</el-button>
          </div>
        </div>
        <div
          v-if="item.photos && item.photos.length && !hasPerRecipePhotos(item)"
          class="photos"
        >
          <el-image
            v-for="(photo, index) in item.photos"
            :key="index"
            :src="photo"
            :preview-src-list="item.photos"
            fit="cover"
            class="photo"
          />
        </div>
      </div>

      <div class="card-actions">
        <!-- 按钮清单来自后端，前端照它渲染 -->
        <el-button
          v-for="action in item.actions"
          :key="action.code"
          :type="action.style === 'primary' ? 'primary' : 'default'"
          :disabled="!action.enabled"
          :loading="actingId === item.id"
          @click="handleAction(item, action)"
        >
          {{ action.label }}
        </el-button>
        <el-button
          v-if="
            isAdmin &&
            item.deliveryId &&
            batchRecipesOf(item).length === 0 &&
            ['ACCEPTED', 'PROCESSING'].includes(item.status)
          "
          type="primary"
          plain
          :loading="reopeningId === item.id"
          :disabled="Boolean(reopeningId)"
          @click="editAftersaleRecipe(item)"
        >修改食谱</el-button>
        <el-button
          v-if="
            isAdmin &&
            item.deliveryId &&
            item.deliveryRecipeId &&
            batchRecipesOf(item).length === 0 &&
            ['ACCEPTED', 'PROCESSING'].includes(item.status)
          "
          type="success"
          plain
          :loading="redeliveringId === item.id"
          @click="redeliverSingleAftersale(item)"
        >重新交付并完成</el-button>
        <!--
          多份售后改稿（2026-10-21）：只重交顾客选中的那几份。
          老的单份售后没有 deliveryItemIds，按钮不显示 ——
          判断收在 canRedeliverAftersaleBatch 里，页面不自己拼条件。
        -->
        <el-button
          v-if="canRedeliverAftersaleBatch(item) && canResolveAftersale(item)"
          type="primary"
          plain
          :loading="redeliveringId === item.id"
          :disabled="Boolean(redeliveringId)"
          @click="redeliverSelectedRecipes(item)"
        >
          按选中份重新交付
        </el-button>
        <el-button link type="primary" @click="goToOrder(item.orderId)">
          看订单
        </el-button>
      </div>
      <!-- 后端拒绝的原因留在卡片上，员工不用去猜为什么没交成 -->
      <p
        v-if="redeliverErrors[item.id]"
        class="redeliver-error"
      >{{ redeliverErrors[item.id] }}</p>
    </el-card>

    <!--
      处理完成的弹窗。
      处理说明**必填**（后端也会拦）—— 顾客看到"已处理"却不知道
      处理了什么，等于没处理。
    -->
    <el-dialog v-model="resolveVisible" title="处理完成" width="520px">
      <el-form label-position="top">
        <el-form-item label="给顾客的处理说明（会显示给顾客看）">
          <el-input
            v-model="resolveForm.handleNote"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            placeholder="例如：已把鸡胸肉换成火鸡胸并重新交付了一版，请查收"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!resolveForm.handleNote.trim()"
          @click="submitResolve"
        >
          确认完成
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rejectVisible" title="不受理" width="520px">
      <el-form label-position="top">
        <el-form-item label="为什么不受理（会显示给顾客看）">
          <el-input
            v-model="rejectForm.reason"
            type="textarea"
            :rows="4"
            maxlength="200"
            show-word-limit
            placeholder="例如：这属于健康问题，建议先带狗狗看医生"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="submitting"
          :disabled="!rejectForm.reason.trim()"
          @click="submitReject"
        >
          确认不受理
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customRecipeApi, type AdminAftersaleItem } from '@/api/customRecipe';
import { recipeDesignerApi } from '@/api/recipeDesigner';
import { useIsAdmin } from '@/composables/useAdminRole';
import {
  buildAftersaleRecipeDetails,
  canRedeliverAftersaleBatch,
  resolveAftersaleRedeliverItemIds,
} from '@/utils/customRecipeAftersale';
import { getApiErrorMessage, toastApiError } from '@/utils/apiError';
import { useRouter } from 'vue-router';

/**
 * 售后待办（2026-10-16，批次 3.1）
 *
 * ## 这一页里没有业务判断
 *
 * · **顺序**由后端算（等太久的排前面；同等的"调整食谱"比"问个问题"急）
 * · **能做什么**由后端给（`item.actions`）—— 前端不判断状态
 * · **"等了多久"**也是后端算的
 *
 * 前端只做两件带主观判断的事：**紧急度变红**（等超过 24 小时）与
 * **状态标签的颜色** —— 都是纯呈现。
 */

const loading = ref(false);
const router = useRouter();
const isAdmin = useIsAdmin();
const items = ref<AdminAftersaleItem[]>([]);
const includeClosed = ref(false);
const actingId = ref('');
const submitting = ref(false);

/** 正在按选中份重新交付的售后 id；同一时间只允许一笔，避免重复提交 */
const redeliveringId = ref('');
const reopeningId = ref('');
/** 每张卡片自己的重新交付失败原因（后端原话），刷新或重试时清掉 */
const redeliverErrors = reactive<Record<string, string>>({});

const resolveVisible = ref(false);
const rejectVisible = ref(false);
const activeItem = ref<AdminAftersaleItem | null>(null);
const resolveForm = reactive({ handleNote: '' });
const rejectForm = reactive({ reason: '' });

const load = async () => {
  loading.value = true;
  try {
    const data = await customRecipeApi.listAftersales({
      includeClosed: includeClosed.value,
    });
    items.value = data?.items ?? [];
  } catch (error) {
    toastApiError(error, '加载售后列表失败', ElMessage);
  } finally {
    loading.value = false;
  }
};

/** 状态标签颜色 —— 纯呈现映射 */
const statusTagType = (status: string) => {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'ACCEPTED':
      return 'primary';
    case 'PROCESSING':
      return 'primary';
    case 'RESOLVED':
      return 'success';
    case 'REJECTED':
      return 'info';
    default:
      return 'info';
  }
};

/** 等了多久 → 人话 */
const formatWaiting = (hours: number) => {
  if (hours < 1) return '不到 1 小时';
  if (hours < 24) return `${Math.floor(hours)} 小时`;
  return `${Math.floor(hours / 24)} 天`;
};

/**
 * 多份售后：把选中的每份摊平成「食谱名 + 这一份的诉求」。
 *
 * 老订单没有按份选择时返回空数组，页面整块不渲染 ——
 * 保持原来只显示一条共用说明的样子。
 */
const batchRecipesOf = (item: AdminAftersaleItem) =>
  buildAftersaleRecipeDetails(item);

/** 新记录每份附件在 recipeRequests[].photos 里；旧记录才看整单 photos */
const hasPerRecipePhotos = (item: AdminAftersaleItem) =>
  batchRecipesOf(item).some((recipe) => recipe.requestPhotos.length > 0);

/**
 * 按选中份重新交付（2026-10-21 · 多份售后改稿）。
 *
 * 与订单详情里的「一次性交付」分工：
 *   · 那个是**首次**交付整批（`deliver-batch`）；
 *   · 这里是售后改稿后只重交**顾客选中的那几份**（`redeliver-batch`）。
 *
 * 后端会在新批次里保留未选中的份，所以对话框要说清"只刷新选中的份"，
 * 否则处理人会以为把整单都换了。成功后重新拉列表：售后状态可能跟着变。
 */
/**
 * 售后改稿：重新打开已交付的某一份设计，直接进入设计器。
 * 改完并「加入本单待提交」后，再回本页按选中份重新交付。
 */
const editAftersaleRecipe = async (
  item: AdminAftersaleItem,
  deliveryItemId?: string,
) => {
  if (!isAdmin.value || reopeningId.value) return;
  reopeningId.value = item.id;
  try {
    const result = await recipeDesignerApi.reopenAftersaleDesign(
      item.id,
      deliveryItemId,
    );
    await router.push({
      path: `/recipe-designer/series/${result.seriesId}/drafts/${result.draftId}`,
      query: {
        orderId: result.orderId,
        designId: result.designId,
        aftersaleId: item.id,
      },
    });
  } catch (error) {
    toastApiError(error, '打开售后改稿失败，请重试', (message) =>
      ElMessage.error(message),
    );
  } finally {
    reopeningId.value = '';
  }
};

const redeliverSelectedRecipes = async (item: AdminAftersaleItem) => {
  if (!canRedeliverAftersaleBatch(item)) return;

  const deliveryItemIds = resolveAftersaleRedeliverItemIds(item);
  const selectedItemIds = new Set(deliveryItemIds);
  const recipeNames = batchRecipesOf(item)
    .filter((recipe) => selectedItemIds.has(recipe.deliveryItemId))
    .map((recipe) => `《${recipe.recipeName}》`);

  try {
    await ElMessageBox.confirm(
      h('div', [
        h('p', `将按选中的 ${deliveryItemIds.length} 份食谱重新交付：`),
        h('p', recipeNames.join('、')),
        h(
          'p',
          '只刷新选中的份，其余份保持原样；顾客会收到一条新的交付通知。',
        ),
      ]),
      '确认按选中份重新交付',
      {
        confirmButtonText: '确认重新交付',
        cancelButtonText: '再想想',
        type: 'warning',
      },
    );
  } catch {
    // 点「再想想」不是失败，不能弹红色报错
    return;
  }

  redeliveringId.value = item.id;
  delete redeliverErrors[item.id];

  try {
    // 一次请求提交全部选中份：后端在一个事务里生成新批次
    const result = await customRecipeApi.redeliverBatch(
      item.orderId,
      deliveryItemIds,
    );

    const redeliveredCount =
      result?.selectedRecipes?.length ?? deliveryItemIds.length;
    await resolveAfterRedelivery(item);
    ElMessage.success(
      `已按选中的 ${redeliveredCount} 份重新交付，并完成售后`,
    );
    await load();
  } catch (error) {
    // 后端会说清原因（比如"这张订单还没有多份交付批次"），留在卡片上
    const message = getApiErrorMessage(
      error,
      '按选中份重新交付失败，请重试',
    );
    redeliverErrors[item.id] = message;
    toastApiError(error, '按选中份重新交付失败，请重试', (toastMessage) =>
      ElMessage.error(toastMessage),
    );
  } finally {
    redeliveringId.value = '';
  }
};

/**
 * 售后还没受理时先受理，避免重新交付后停在“待受理”。
 * 能不能受理由后端下发（`actions`），前端不判断状态字符串。
 */
const canResolveAftersale = (item: AdminAftersaleItem) =>
  (item.actions || []).some(
    (action) => action.code === 'RESOLVE' && action.enabled,
  );

const ensureAftersaleAccepted = async (item: AdminAftersaleItem) => {
  const canAccept = (item.actions || []).some(
    (action) => action.code === 'ACCEPT' && action.enabled,
  );
  if (canAccept) {
    await customRecipeApi.acceptAftersale(item.id);
  }
};

/**
 * 重新交付后自动完成售后。
 * 处理说明可改，默认带一句系统口径；顾客能直接看到改了什么。
 */
const resolveAfterRedelivery = async (item: AdminAftersaleItem) => {
  const defaultNote =
    '已按你的要求调整并重新交付了一版食谱，请在小程序里查看最新交付内容。';
  let handleNote = defaultNote;
  try {
    const result = await ElMessageBox.prompt(
      '给顾客的处理说明（会显示在售后记录里）',
      '完成售后',
      {
        inputType: 'textarea',
        inputValue: defaultNote,
        confirmButtonText: '重新交付并完成',
        cancelButtonText: '使用默认说明',
        type: 'success',
      },
    );
    handleNote = result.value?.trim() || defaultNote;
  } catch {
    // 顾客端仍需要看到结果；取消编辑就用默认说明，不留下未完成的售后
  }
  try {
    await customRecipeApi.resolveAftersale(item.id, { handleNote });
  } catch (error) {
    // 交付已经成功，售后完成失败要提示但不能再报成交付失败
    toastApiError(error, '食谱已重新交付，但售后状态未自动完成，请手动处理', (message) =>
      ElMessage.warning(message),
    );
  }
};

/**
 * 老单份售后：修改后重新交付同一份食谱，然后自动完成售后。
 * 多份订单仍走「按选中份重新交付」。
 */
const redeliverSingleAftersale = async (item: AdminAftersaleItem) => {
  if (!item.deliveryRecipeId || redeliveringId.value) return;
  try {
    await ElMessageBox.confirm(
      '将用当前修改后的食谱重新交付给顾客，并完成这条售后。顾客会收到新的交付通知。',
      '重新交付并完成售后',
      { type: 'warning', confirmButtonText: '确认重新交付', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  redeliveringId.value = item.id;
  try {
    await ensureAftersaleAccepted(item);
    await customRecipeApi.deliverRecipe(item.orderId, item.deliveryRecipeId);
    await resolveAfterRedelivery(item);
    ElMessage.success('已重新交付，并完成售后');
    await load();
  } catch (error) {
    toastApiError(error, '重新交付失败，请重试', (message) => ElMessage.error(message));
  } finally {
    redeliveringId.value = '';
  }
};

const handleAction = async (
  item: AdminAftersaleItem,
  action: { code: string; label: string },
) => {
  activeItem.value = item;

  if (action.code === 'RESOLVE') {
    resolveForm.handleNote = '';
    resolveVisible.value = true;
    return;
  }
  if (action.code === 'REJECT') {
    rejectForm.reason = '';
    rejectVisible.value = true;
    return;
  }

  // 受理 / 标记处理中：不需要额外输入，但要二次确认（避免手滑）
  try {
    await ElMessageBox.confirm(
      `确定把「${item.typeLabel}」这条标记为「${action.label}」吗？`,
      action.label,
      { confirmButtonText: action.label, cancelButtonText: '再想想' },
    );
  } catch {
    return;
  }

  actingId.value = item.id;
  try {
    if (action.code === 'ACCEPT') {
      await customRecipeApi.acceptAftersale(item.id);
    } else if (action.code === 'PROCESSING') {
      await customRecipeApi.markAftersaleProcessing(item.id);
    }
    ElMessage.success(`已${action.label}`);
    await load();
  } catch (error) {
    toastApiError(error, `${action.label}失败`, ElMessage);
  } finally {
    actingId.value = '';
  }
};

const submitResolve = async () => {
  if (!activeItem.value) return;
  submitting.value = true;
  try {
    await customRecipeApi.resolveAftersale(activeItem.value.id, {
      handleNote: resolveForm.handleNote.trim(),
    });
    ElMessage.success('已处理完成，顾客能看到你的说明');
    resolveVisible.value = false;
    await load();
  } catch (error) {
    // 后端会说清原因（比如"请写一句给顾客的处理说明"），直接显示它
    toastApiError(error, '处理失败', ElMessage);
  } finally {
    submitting.value = false;
  }
};

const submitReject = async () => {
  if (!activeItem.value) return;
  submitting.value = true;
  try {
    await customRecipeApi.rejectAftersale(activeItem.value.id, {
      reason: rejectForm.reason.trim(),
    });
    ElMessage.success('已标记为不受理，顾客能看到原因');
    rejectVisible.value = false;
    await load();
  } catch (error) {
    toastApiError(error, '操作失败', ElMessage);
  } finally {
    submitting.value = false;
  }
};

const goToOrder = (orderId: string) => {
  // 定制订单详情已收进订单中心抽屉，售后直接深链到对应订单
  const target = `/order-center?type=CUSTOM_RECIPE&orderId=${encodeURIComponent(orderId)}`;
  window.open(target, '_self');
};

onMounted(load);
</script>

<style scoped>
.aftersale-workbench {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.tip {
  margin-bottom: 16px;
}

.aftersale-card {
  margin-bottom: 16px;
}

/*
  催得急的（后端算的 `isUrgent`）：左边一道红条，扫一眼就知道先看哪条。
  ⚠️ 阈值（24 小时）在后端领域层 —— 前端只认这个布尔值，
  老板哪天说"12 小时就该催"，改后端一处即可。
*/
.aftersale-card.is-urgent {
  border-left: 4px solid var(--el-color-danger);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.waiting {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.waiting.is-long {
  color: var(--el-color-danger);
  font-weight: 600;
}

.order-no {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.meta {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.description {
  margin-bottom: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* 多份售后：选中了哪几份、每份要改什么 */
.batch-recipes {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.batch-recipes-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.batch-recipe {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
  line-height: 1.6;
}

.batch-recipe-request {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.batch-recipe-photos {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 6px;
}

.batch-recipe-photo {
  width: 64px;
  height: 64px;
  border-radius: 6px;
}

.photos {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.photo {
  width: 80px;
  height: 80px;
  border-radius: 6px;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

/* 按选中份重新交付失败：把后端原因留在卡片上，而不是只闪一下 toast */
.redeliver-error {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-color-danger);
}
</style>
