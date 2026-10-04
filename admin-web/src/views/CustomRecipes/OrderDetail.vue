<template>
  <div class="order-detail" v-loading="loading">
    <div v-if="order" class="detail-container">
      <!-- 左侧：订单信息 -->
      <div class="order-info-section">
        <h3>订单信息</h3>

        <div class="info-group">
          <div class="info-item">
            <label>订单号</label>
            <span>{{ order.orderId }}</span>
          </div>
          <div class="info-item">
            <label>状态</label>
            <!-- 状态文案走 constants/customRecipeOrder，与列表页同一份字典：
                 此前详情页自己写了一份且漏了「已取消」，同一张单在列表里是
                 "已取消"、点进来却显示英文 CANCELLED -->
            <el-tag :type="statusTagType">
              {{ statusText }}
            </el-tag>
          </div>
          <div class="info-item">
            <label>提交时间</label>
            <span>{{ formatDateTime(order.createdAt) }}</span>
          </div>
          <div class="info-item" v-if="order.paymentConfirmedAt">
            <label>付款确认</label>
            <span>{{ formatDateTime(order.paymentConfirmedAt) }}</span>
          </div>
          <div class="info-item" v-if="order.paymentTransactionId">
            <label>支付流水号</label>
            <span class="mono">{{ order.paymentTransactionId }}</span>
          </div>
          <div class="info-item" v-if="order.inProgressAt">
            <label>开始制作</label>
            <span>{{ formatDateTime(order.inProgressAt) }}</span>
          </div>
          <div class="info-item" v-if="order.deliveredAt">
            <label>交付时间</label>
            <span>{{ formatDateTime(order.deliveredAt) }}</span>
          </div>
          <div class="info-item" v-if="order.cancelledAt">
            <label>取消时间</label>
            <span>{{ formatDateTime(order.cancelledAt) }}</span>
          </div>
          <div class="info-item" v-if="order.cancellationReason">
            <label>取消原因</label>
            <span>{{ order.cancellationReason }}</span>
          </div>
        </div>

        <!-- 退款：线上退款（顾客自助取消 / 后台取消已付款单）会写回这里。
             客服必须先看清"钱到底退没退"再答复顾客，所以单独成块并列全。 -->
        <template v-if="hasRefundInfo">
          <el-divider />
          <h3>退款</h3>
          <div class="info-group">
            <div class="info-item">
              <label>退款状态</label>
              <el-tag :type="refundSucceeded ? 'success' : 'warning'" size="small">
                {{ refundStatusText || '未发起退款' }}
              </el-tag>
            </div>
            <div class="info-item" v-if="order.refundAmount !== null && order.refundAmount !== undefined">
              <label>退款金额</label>
              <span class="amount">¥{{ Number(order.refundAmount) }}</span>
            </div>
            <div class="info-item" v-if="order.refundedAt">
              <label>退款到账</label>
              <span>{{ formatDateTime(order.refundedAt) }}</span>
            </div>
          </div>
          <p v-if="!refundSucceeded" class="refund-tip">
            退款尚未确认成功，请到微信商户平台核实后再答复顾客。
          </p>
        </template>

        <el-divider />

        <h3>客户信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>姓名</label>
            <span>{{ order.customer?.nickname }}</span>
          </div>
          <div class="info-item">
            <label>微信</label>
            <span>{{ order.customer?.wechatOpenid || '未绑定' }}</span>
          </div>
          <div class="info-item">
            <label>手机</label>
            <span>{{ order.customer?.phone || '未填写' }}</span>
          </div>
        </div>

        <el-divider />

        <h3>狗狗信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>名字</label>
            <span>{{ order.dog?.name }}</span>
          </div>
          <div class="info-item">
            <label>年龄</label>
            <span>{{ calculateAge(order.dog?.birthday) }}</span>
          </div>
          <div class="info-item">
            <label>当前体重</label>
            <span>{{ order.dog?.currentWeightKg }}kg</span>
          </div>
          <div class="info-item">
            <label>体况评分</label>
            <span>{{ order.dog?.bcsScore }}/9</span>
          </div>
          <div class="info-item">
            <label>活动量</label>
            <span>{{ getActivityLevelText(order.dog?.activityLevel) }}</span>
          </div>
        </div>

        <el-divider />

        <h3>定制信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>定制目标</label>
            <span>{{ getGoalText(order.targetGoal) }}</span>
          </div>
          <div class="info-item">
            <label>预约日期</label>
            <span>{{ formatDate(order.scheduledDate) }}</span>
          </div>
          <div class="info-item">
            <!-- 预计交付日要能一眼看出"还来得及 / 已经晚了"：
                 只给一个日期，员工得自己算，超期的单就沉在列表里没人催 -->
            <label>预计交付</label>
            <span>
              {{ deliveryInfo.dateText || '未测算' }}
              <el-tag v-if="deliveryInfo.overdue" type="danger" size="small" class="overdue-tag">
                {{ deliveryInfo.text }}
              </el-tag>
              <span v-else-if="deliveryInfo.text" class="countdown-text">{{ deliveryInfo.text }}</span>
            </span>
          </div>
          <div class="info-item">
            <label>金额</label>
            <span class="amount">¥{{ order.amount }}</span>
          </div>
        </div>

        <el-divider />

        <!-- 成品抵扣额度台账：客服在处理退款时按这里的数据决定要不要恢复额度 -->
        <h3>成品抵扣额度</h3>
        <div class="info-group">
          <div class="info-item">
            <label>额度总额</label>
            <span>¥{{ Number(order.creditAmount || 0) }}</span>
          </div>
          <div class="info-item">
            <label>已抵扣</label>
            <span>¥{{ Number(order.creditUsed || 0) }}</span>
          </div>
          <div class="info-item">
            <label>剩余可用</label>
            <span class="credit-remaining">¥{{ Number(order.creditRemaining || 0) }}</span>
          </div>
        </div>
        <div class="credit-actions">
          <!-- 恢复额度等于把顾客的钱还回去，口径 2 定为仅管理员；
               客服看不到按钮，但要知道"这事不归我点"，所以留一句说明 -->
          <el-button
            v-if="isAdmin"
            size="small"
            :disabled="Number(order.creditUsed || 0) <= 0"
            :loading="restoringCredit"
            @click="restoreCredit"
          >
            恢复额度
          </el-button>
          <span v-else class="admin-only-tip">{{ ADMIN_ONLY_TIP }}：恢复抵扣额度</span>
          <span class="credit-tip">
            顾客用了抵扣后退款时点这里，把已用额度还回去；只影响额度，不改订单金额
          </span>
        </div>

        <el-divider />

        <h3>健康信息</h3>

        <!-- 下单后顾客在健康档案里补了过敏，订单上的快照不会跟着变；
             不提示的话营养师会照着旧信息设计 -->
        <el-alert
          v-if="allergyComparison.changed || medicalComparison.changed"
          type="warning"
          :closable="false"
          show-icon
          class="profile-updated-alert"
          title="下单后档案有更新，请按最新信息设计"
          :description="profileUpdateDetail"
        />

        <el-descriptions :column="1" border>
          <el-descriptions-item label="过敏（档案最新）">
            <template v-if="order.dog?.allergyRecords?.length">
              <el-tag
                v-for="(record, index) in order.dog.allergyRecords"
                :key="`record-${index}`"
                :type="getAllergyCertaintyTagType(record.certainty)"
                size="small"
                style="margin-right: 5px;"
              >
                {{ record.allergen }} · {{ getAllergyCertaintyText(record.certainty) }}
              </el-tag>
            </template>
            <span v-else-if="!order.dog?.allergyFoods" class="empty-text">档案里没有过敏记录</span>
            <div v-if="order.dog?.allergyFoods" class="source-note">
              设计备注里记录的过敏：{{ order.dog.allergyFoods }}
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="过敏史（下单时填写）">
            <el-tag
              v-for="(allergen, index) in order.allergies"
              :key="index"
              type="danger"
              size="small"
              style="margin-right: 5px;"
            >
              {{ allergen }}
            </el-tag>
            <span v-if="!order.allergies || order.allergies.length === 0" class="empty-text">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="疾病史（档案最新）">
            <el-tag
              v-for="(condition, index) in medicalComparison.profileConditions"
              :key="`profile-medical-${index}`"
              type="warning"
              size="small"
              style="margin-right: 5px;"
            >
              {{ condition }}
            </el-tag>
            <span
              v-if="medicalComparison.profileConditions.length === 0"
              class="empty-text"
            >档案里没有疾病史记录</span>
          </el-descriptions-item>
          <el-descriptions-item label="疾病史（下单时填写）">
            <el-tag
              v-for="(condition, index) in order.medicalConditions"
              :key="index"
              type="warning"
              size="small"
              style="margin-right: 5px;"
            >
              {{ condition }}
            </el-tag>
            <span v-if="!order.medicalConditions || order.medicalConditions.length === 0" class="empty-text">无</span>
          </el-descriptions-item>
        </el-descriptions>
        <p class="source-hint">
          「档案最新」来自顾客的健康档案与设计备注，顾客之后改了这里会跟着变；
          「下单时填写」是下单当天的快照，不会变。两者不一致时以上面提示为准。
        </p>
        <div v-if="order.additionalNotes" class="notes-section">
          <label>补充说明</label>
          <p>{{ order.additionalNotes }}</p>
        </div>

        <el-divider />

        <h3>饮食偏好</h3>
        <div class="info-group">
          <div class="info-item full-width">
            <label>喜欢的食材</label>
            <div class="tags">
              <el-tag
                v-for="(item, index) in order.preferredIngredients"
                :key="index"
                type="success"
              >
                {{ item }}
              </el-tag>
              <span v-if="!order.preferredIngredients || order.preferredIngredients.length === 0" class="empty-text">无特殊偏好</span>
            </div>
          </div>
          <div class="info-item full-width">
            <label>不吃的食材</label>
            <div class="tags">
              <el-tag
                v-for="(item, index) in order.dislikedIngredients"
                :key="index"
                type="info"
              >
                {{ item }}
              </el-tag>
              <span v-if="!order.dislikedIngredients || order.dislikedIngredients.length === 0" class="empty-text">无</span>
            </div>
          </div>
        </div>

        <el-divider />

        <h3>附件</h3>
        <div class="attachments-list">
          <div
            v-for="attachment in order.attachmentsRecords"
            :key="attachment.id"
            class="attachment-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ attachment.fileName }}</span>
            <el-button link type="primary" @click="downloadFile(attachment)">
              下载
            </el-button>
            <el-button link type="danger" @click="deleteAttachment(attachment.id)">
              删除
            </el-button>
          </div>
          <div v-if="!order.attachmentsRecords || order.attachmentsRecords.length === 0" class="empty-text">
            无附件
          </div>
        </div>

        <el-divider />

        <h3>操作</h3>
        <div class="action-buttons">
          <el-button
            v-if="order.status === 'PENDING_PAYMENT'"
            type="success"
            @click="confirmPayment"
          >
            确认付款
          </el-button>
          <el-button
            v-if="order.status === 'PAID'"
            type="primary"
            @click="startProcessing"
          >
            开始制作
          </el-button>
          <!-- 一键进食谱设计器（2026-09-28）：带着这只狗进去，
               设计器里会显示顾客的定制需求（目标/备注/订单里填的过敏与忌口），
               营养师不必再手工新建系列、自己搜狗。 -->
          <el-button
            v-if="order.dog?.id"
            type="success"
            plain
            @click="openInDesigner"
          >
            在设计器中设计
          </el-button>
          <!-- 取消会退款、会释放当天接单名额（每天只有 5 个），口径 2 定为仅管理员。
               已交付的单不允许取消（后端也会拒绝）。 -->
          <el-button
            v-if="isAdmin && order.status !== 'DELIVERED' && order.status !== 'CANCELLED'"
            type="danger"
            plain
            @click="cancelOrder"
          >
            取消订单
          </el-button>
          <span
            v-else-if="!isAdmin && order.status !== 'DELIVERED' && order.status !== 'CANCELLED'"
            class="admin-only-tip"
          >
            {{ ADMIN_ONLY_TIP }}：取消订单
          </span>
          <el-button @click="contactCustomer">联系客户</el-button>
        </div>
      </div>

      <!-- 右侧：交付已设计好的食谱 / 手工创建 -->
      <div class="recipe-creation-section" v-if="canDeliver">
        <!-- 一键交付（2026-10-04 第 1、2 条）：
             设计器里做好的食谱直接挂到订单上，不必把名称、营养、食材、步骤
             手工重抄进下面结构完全不同的表单里。 -->
        <div class="recipe-delivery-block">
          <h3>{{ isRedelivery ? '重新交付食谱' : '从已设计好的食谱交付' }}</h3>
          <p class="section-desc">
            这里只列出「{{ order.dog?.name || '这只狗' }}」的私密定制食谱（该顾客 + 该狗狗）。
            选中一条点交付即可，顾客会收到通知。
          </p>

          <div v-loading="candidatesLoading" class="candidate-list">
            <el-radio-group
              v-if="candidates.length"
              v-model="selectedCandidateId"
              class="candidate-group"
            >
              <el-radio
                v-for="candidate in candidates"
                :key="candidate.recipeId"
                :value="candidate.recipeId"
                class="candidate-item"
              >
                <span class="candidate-name">{{ candidate.name }}</span>
                <span class="candidate-meta">
                  v{{ candidate.version }} · 更新于 {{ formatDateTime(candidate.updatedAt) }}
                </span>
                <el-tag v-if="candidate.linkedToThisOrder" type="success" size="small">
                  当前已挂
                </el-tag>
              </el-radio>
            </el-radio-group>

            <!-- 空态要说清"下一步做什么"，只显示"暂无数据"员工只能来问开发 -->
            <el-empty
              v-else-if="!candidatesLoading"
              :image-size="70"
              description="这只狗还没有已发布的定制食谱，请先在设计器里设计并发布"
            >
              <el-button v-if="order.dog?.id" type="success" plain @click="openInDesigner">
                在设计器中设计
              </el-button>
            </el-empty>
          </div>

          <div class="delivery-actions">
            <el-button
              v-if="isAdmin"
              type="primary"
              :disabled="!selectedCandidateId"
              :loading="delivering"
              @click="deliverSelectedRecipe"
            >
              {{ isRedelivery ? '重新交付' : '交付到订单' }}
            </el-button>
            <span v-else class="admin-only-tip">
              {{ ADMIN_ONLY_TIP }}：交付食谱（含重新交付）会给顾客发通知，只有管理员能做
            </span>
          </div>
          <p v-if="isRedelivery" class="delivery-warning">
            重新交付会替换当前交付的食谱，并再次给顾客发送通知。
          </p>
        </div>

        <el-divider />

        <!-- 手工创建：正常动线走上面的一键交付，这里只作兜底 -->
        <template v-if="order.status === 'PAID' || order.status === 'IN_PROGRESS'">
          <h3>手工创建定制食谱</h3>
          <p class="section-desc">
            没有对应设计稿时才用这里。带 * 的为必填 ——
            空名称或缺食材的食谱交付出去，顾客收到的通知里什么也没有。
          </p>

          <el-form
            ref="recipeFormRef"
            :model="recipeForm"
            :rules="recipeFormRules"
            label-width="120px"
          >
            <el-form-item label="食谱名称" prop="name">
              <el-input v-model="recipeForm.name" placeholder="为狗狗专属定制的食谱" />
            </el-form-item>

            <el-form-item label="描述">
              <el-input
                v-model="recipeForm.description"
                type="textarea"
                :rows="3"
                placeholder="食谱描述"
              />
            </el-form-item>

            <el-form-item label="封面图片">
              <!-- 走 api 层上传：原来的 action 指向 /api/v1/admin/upload（不存在），
                   而且成功回调判的是 code === 200，而全站统一成功码是 0 -->
              <el-upload
                class="cover-uploader"
                :show-file-list="false"
                :http-request="handleCoverUpload"
                accept="image/*"
              >
                <img v-if="recipeForm.coverImageUrl" :src="recipeForm.coverImageUrl" class="cover-image" />
                <el-icon v-else class="cover-uploader-icon"><Plus /></el-icon>
              </el-upload>
            </el-form-item>

            <el-form-item label="营养标准">
              <el-select v-model="recipeForm.nutritionStandard">
                <el-option label="FEDIAF 2025" value="FEDIAF_2025" />
                <el-option label="FEDIAF 2021" value="FEDIAF_2021" />
                <el-option label="AAFCO 2019" value="AAFCO_2019" />
                <el-option label="国标 GB/T 31216" value="GB_T_31216" />
              </el-select>
            </el-form-item>

            <el-divider content-position="left">营养目标</el-divider>

            <el-form-item label="蛋白质">
              <el-input-number v-model="recipeForm.proteinPercent" :min="0" :max="50" />
              <span style="margin-left: 10px">%</span>
            </el-form-item>

            <el-form-item label="脂肪">
              <el-input-number v-model="recipeForm.fatPercent" :min="0" :max="30" />
              <span style="margin-left: 10px">%</span>
            </el-form-item>

            <el-form-item label="碳水">
              <el-input-number v-model="recipeForm.carbohydratePercent" :min="0" :max="80" />
              <span style="margin-left: 10px">%</span>
            </el-form-item>

            <el-form-item label="能量密度" prop="energyDensityKcalPerKg">
              <el-input-number v-model="recipeForm.energyDensityKcalPerKg" :min="0" :max="10000" />
              <span style="margin-left: 10px">kcal/kg</span>
            </el-form-item>

            <el-divider content-position="left">配方设计</el-divider>

            <!-- prop="items" 让校验器能挂在这一整块上：至少一个食材、每行都得选食材 -->
            <el-form-item prop="items">
              <template #label>
                <span>食材列表 *</span>
                <el-button size="small" @click="addIngredient" style="margin-left: 10px">
                  + 添加食材
                </el-button>
              </template>
              <div class="ingredients-list">
                <div
                  v-for="(item, index) in recipeForm.items"
                  :key="index"
                  class="ingredient-item"
                >
                  <el-select
                    v-model="item.ingredientId"
                    placeholder="选择食材"
                    filterable
                    style="width: 200px"
                  >
                    <el-option
                      v-for="option in ingredientOptions"
                      :key="option.id"
                      :label="option.name"
                      :value="option.id"
                    />
                  </el-select>
                  <el-input
                    v-model="item.preparationMethod"
                    placeholder="制备方法"
                    style="width: 150px"
                  />
                  <el-input-number
                    v-model="item.ratioPercent"
                    :min="0"
                    :max="100"
                    :precision="1"
                    style="width: 120px"
                  />
                  <span>%</span>
                  <el-button type="danger" link @click="removeIngredient(index)">
                    删除
                  </el-button>
                </div>
              </div>
            </el-form-item>

            <el-divider content-position="left">制作说明</el-divider>

            <el-form-item label="制作步骤">
              <el-input
                v-model="recipeForm.productionSteps"
                type="textarea"
                :rows="5"
                placeholder="详细的制作步骤说明"
              />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="submitRecipe" :loading="submitting">
                提交食谱并交付
              </el-button>
              <el-button @click="resetRecipeForm">重置</el-button>
            </el-form-item>
          </el-form>
        </template>
      </div>

      <!-- 已完成的食谱信息 -->
      <div class="completed-recipe-section" v-if="order.status === 'DELIVERED' && order.recipe">
        <h3>已完成的食谱</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="食谱名称">
            {{ order.recipe.name }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag type="success">已交付</el-tag>
          </el-descriptions-item>
          <!-- 营养标准与能量密度明细接口没返回，为空时不占一行空位 -->
          <el-descriptions-item v-if="order.recipe.nutritionStandard" label="营养标准">
            {{ order.recipe.nutritionStandard }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.recipe.energyDensityKcalPerKg" label="能量密度">
            {{ order.recipe.energyDensityKcalPerKg }} kcal/kg
          </el-descriptions-item>
        </el-descriptions>

        <div class="recipe-actions">
          <el-button type="primary" @click="viewRecipeFull">
            查看完整食谱
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Document, Plus } from '@element-plus/icons-vue';
import { customRecipeApi } from '@/api/customRecipe';
import type {
  CustomRecipeAttachment,
  CustomRecipeCandidate,
  CustomRecipeOrderDetail,
} from '@/api/customRecipe';
import { ingredientApi } from '@/api/ingredients';
import { recipeApi } from '@/api/recipes';
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole';
import {
  canDeliverCustomRecipe,
  getCustomRecipeRefundStatusText,
  getCustomRecipeStatusTagType,
  getCustomRecipeStatusText,
  isCustomRecipeRedelivery,
  isCustomRecipeRefundSucceeded,
} from '@/constants/customRecipeOrder';
import {
  compareDogProfileAllergies,
  compareDogProfileMedicalConditions,
  getAllergyCertaintyTagType,
  getAllergyCertaintyText,
  getEstimatedDeliveryInfo,
} from '@/utils/customRecipe';
import { toastApiError } from '@/utils/apiError';
import { validateElementForm } from '@/utils/elementFormValidation';

const props = defineProps<{
  orderId: string;
}>();

const emit = defineEmits(['refresh', 'close']);

/** 口径 2：交付 / 取消 / 恢复额度只允许管理员，前端按角色隐藏敏感按钮 */
const isAdmin = useIsAdmin();

/**
 * 食材候选列表：给「食材列表」用下拉选择。
 *
 * 2026-09-28 修复：原先这里是一个手填「食材ID」的输入框，而那个值是必填外键，
 * 填错（或留空）会在提交时抛出 Prisma 外键错误（500），营养师完全无从下手。
 */
const ingredientOptions = ref<Array<{ id: string; name: string }>>([]);

const loadIngredientOptions = async () => {
  try {
    const list: any = await ingredientApi.list();
    const rows = Array.isArray(list) ? list : list?.data ?? [];
    ingredientOptions.value = rows
      .map((row: any) => ({ id: String(row?.id ?? ''), name: String(row?.name ?? '') }))
      .filter((row: { id: string }) => row.id);
  } catch (error) {
    console.error('[CustomRecipe] 加载食材列表失败:', error);
    ElMessage.error('加载食材列表失败，食材将需要手工填写');
  }
};

// 状态
const loading = ref(false);
const submitting = ref(false);
const restoringCredit = ref(false);
const order = ref<CustomRecipeOrderDetail | null>(null);

// ---------- 面板上的派生展示 ----------

const statusText = computed(() => getCustomRecipeStatusText(order.value?.status));
const statusTagType = computed(() => getCustomRecipeStatusTagType(order.value?.status));

/** 预计交付倒计时：超期的单要标红，已交付/已取消的不再催 */
const deliveryInfo = computed(() =>
  getEstimatedDeliveryInfo(order.value?.estimatedDeliveryDate, order.value?.status),
);

const refundStatusText = computed(() =>
  getCustomRecipeRefundStatusText(order.value?.refundStatus),
);
const refundSucceeded = computed(() =>
  isCustomRecipeRefundSucceeded(order.value?.refundStatus),
);
const hasRefundInfo = computed(
  () =>
    Boolean(order.value?.refundStatus) ||
    (order.value?.refundAmount !== null && order.value?.refundAmount !== undefined),
);

/** 下单时填写的过敏 vs 档案最新：两份口径不同，必须分开显示并提示差异 */
const allergyComparison = computed(() =>
  compareDogProfileAllergies(order.value?.dog, order.value?.allergies),
);

/**
 * 疾病史同理（2026-10-04 补）。
 *
 * 订单上的 `medicalConditions` 是下单当天的快照；顾客之后在健康档案里
 * 补了疾病（例如确诊胰腺炎），快照不会跟着变 —— 不提示的话员工会照旧信息设计。
 */
const medicalComparison = computed(() =>
  compareDogProfileMedicalConditions(
    order.value?.dog,
    order.value?.medicalConditions,
  ),
);

/** 档案与下单快照有出入时，把"差在哪一条"直接写出来，别让员工自己比对 */
const profileUpdateDetail = computed(() => {
  const parts: string[] = [];

  const describe = (label: string, added: string[], removed: string[]) => {
    if (added.length > 0) {
      parts.push(`${label}——档案里有、下单时没写：${added.join('、')}`);
    }
    if (removed.length > 0) {
      parts.push(`${label}——下单时写了、档案里没有：${removed.join('、')}`);
    }
  };

  describe('过敏', allergyComparison.value.added, allergyComparison.value.removed);
  describe(
    '疾病史',
    medicalComparison.value.added,
    medicalComparison.value.removed,
  );

  return parts.join('；');
});

// ---------- 一键交付 ----------

const candidates = ref<CustomRecipeCandidate[]>([]);
const candidatesLoading = ref(false);
const selectedCandidateId = ref('');
const delivering = ref(false);

/** 已付款 / 制作中 / 已交付 都能交付（已交付 = 重新交付，口径 4） */
const canDeliver = computed(() => canDeliverCustomRecipe(order.value?.status));
const isRedelivery = computed(() => isCustomRecipeRedelivery(order.value?.status));
const selectedCandidate = computed(
  () =>
    candidates.value.find((item) => item.recipeId === selectedCandidateId.value) ||
    null,
);

const loadRecipeCandidates = async () => {
  if (!props.orderId) return;
  candidatesLoading.value = true;
  try {
    const list = await customRecipeApi.listRecipeCandidates(props.orderId);
    candidates.value = Array.isArray(list) ? list : [];

    // 选中的那条不在新列表里时重新决定默认值：
    // 首次交付默认选最新的一条（少点一次）；重新交付默认不预选 ——
    // 换掉顾客手里那份食谱必须是有意识的选择，不能靠默认值滑过去。
    const stillThere = candidates.value.some(
      (item) => item.recipeId === selectedCandidateId.value,
    );
    if (!stillThere) {
      selectedCandidateId.value = isRedelivery.value
        ? ''
        : candidates.value[0]?.recipeId || '';
    }
  } catch (error) {
    candidates.value = [];
    toastApiError(error, '加载可交付的食谱失败', (message) => ElMessage.error(message));
  } finally {
    candidatesLoading.value = false;
  }
};

const deliverSelectedRecipe = async () => {
  const candidate = selectedCandidate.value;
  const orderId = order.value?.orderId;
  if (!orderId) return;
  if (!candidate) {
    ElMessage.warning('请先选择要交付的食谱');
    return;
  }

  const dogName = order.value?.dog?.name || '这只狗';
  const amount = Number(order.value?.amount || 0);

  try {
    if (isRedelivery.value) {
      // 口径 4：重新交付会覆盖原来挂的食谱并再次打扰顾客，必须说清这两件事
      await ElMessageBox.confirm(
        h('div', [
          h(
            'p',
            `将用所选食谱《${candidate.name}》替换订单 ${orderId} 当前交付的食谱，并再次给顾客发送通知。`,
          ),
          h('p', `狗狗：${dogName}　金额：¥${amount}`),
        ]),
        '确认重新交付',
        {
          confirmButtonText: '确认重新交付',
          cancelButtonText: '再想想',
          type: 'warning',
        },
      );
    } else {
      await ElMessageBox.confirm(
        h('div', [
          h('p', `把《${candidate.name}》交付给「${dogName}」？`),
          h('p', `订单号：${orderId}　金额：¥${amount}`),
          h('p', '交付后会给顾客发送通知，订单转为「已交付」。'),
        ]),
        '确认交付',
        { confirmButtonText: '确认交付', cancelButtonText: '再想想' },
      );
    }

    delivering.value = true;
    const result = await customRecipeApi.deliverRecipe(orderId, candidate.recipeId);

    ElMessage.success(
      result?.redelivered
        ? `已重新交付《${result.recipeName || candidate.name}》，顾客会收到新通知`
        : `已交付《${result.recipeName || candidate.name}》到订单`,
    );

    await loadOrderDetail();
    emit('refresh');
  } catch (error) {
    // 后端的拒绝理由（"该订单还没确认收款，不能交付""这道食谱不属于该订单的顾客 / 狗狗"）
    // 必须原样显示，不能让员工猜
    toastApiError(error, '交付失败', (message) => ElMessage.error(message));
  } finally {
    delivering.value = false;
  }
};

// ---------- 手工创建食谱 ----------

const recipeFormRef = ref<FormInstance>();

const recipeForm = reactive({
  name: '',
  description: '',
  coverImageUrl: '',
  nutritionStandard: 'FEDIAF_2025',
  proteinPercent: 18,
  fatPercent: 8,
  carbohydratePercent: 45,
  energyDensityKcalPerKg: 3200,
  items: [] as any[],
  productionSteps: '',
});

/**
 * 必填校验。
 *
 * 此前这张表单没有任何校验，空名称、没有食材也能提交并给顾客发通知；
 * 食材那一项还是必填外键，留空会直接抛 500。
 * 这里按字段的实际含义拦在提交之前。
 */
const recipeFormRules: FormRules = {
  name: [
    {
      validator: (_rule: any, value: any, callback: any) => {
        if (!String(value || '').trim()) {
          callback(new Error('请填写食谱名称，顾客收到的通知里会显示它'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  energyDensityKcalPerKg: [
    {
      validator: (_rule: any, value: any, callback: any) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) {
          callback(new Error('请填写能量密度（kcal/kg），它决定每天喂多少克'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
  items: [
    {
      validator: (_rule: any, _value: any, callback: any) => {
        const rows = recipeForm.items || [];
        if (rows.length === 0) {
          callback(new Error('至少添加一个食材，否则这不算一份食谱'));
          return;
        }
        const emptyRow = rows.findIndex(
          (row) => !String(row?.ingredientId || '').trim(),
        );
        if (emptyRow >= 0) {
          callback(new Error(`第 ${emptyRow + 1} 行还没选食材`));
          return;
        }
        const badRatio = rows.findIndex((row) => !(Number(row?.ratioPercent) > 0));
        if (badRatio >= 0) {
          callback(new Error(`第 ${badRatio + 1} 行的占比必须大于 0`));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

// 生命周期
onMounted(() => {
  loadOrderDetail();
  loadIngredientOptions();
});

watch(
  () => props.orderId,
  () => {
    loadOrderDetail();
  },
);

// 方法
const loadOrderDetail = async () => {
  loading.value = true;
  try {
    order.value = await customRecipeApi.getOrderDetail(props.orderId);
    // 状态决定能不能交付（已付款/制作中/已交付），详情到手后再拉候选
    if (canDeliverCustomRecipe(order.value?.status)) {
      await loadRecipeCandidates();
    } else {
      candidates.value = [];
      selectedCandidateId.value = '';
    }
  } catch (error) {
    toastApiError(error, '加载订单详情失败', (message) => ElMessage.error(message));
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const confirmPayment = async () => {
  try {
    await ElMessageBox.confirm('确认该订单已付款？', '确认付款');

    await customRecipeApi.confirmPayment(order.value!.orderId);
    ElMessage.success('付款已确认');
    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '确认付款失败', (message) => ElMessage.error(message));
  }
};

/**
 * 跳到食谱设计器并带上这只狗。
 *
 * 设计器会预填"参考爱犬"并直接打开创建对话框；
 * 进去之后「爱犬指导」面板会显示这笔定制订单的顾客需求。
 */
const openInDesigner = () => {
  const dogId = order.value?.dog?.id;
  if (!dogId) {
    ElMessage.warning('这笔订单没有关联的狗狗档案');
    return;
  }

  const url = `/recipe-designer?dogId=${encodeURIComponent(String(dogId))}&openCreate=1`;
  window.open(url, '_blank');
};

/**
 * 取消订单。
 *
 * 2026-09-28：后端此前"改状态"是裸写 —— 改成已取消既不释放当天名额、
 * 也不记录取消时间；每天只有 5 个名额，取消掉的单会把产能白白吃掉。
 * 现在后端会释放名额并记录原因，这里补上入口。
 *
 * 2026-10-04（口径 3）：取消**已付款**的单，后端会先走微信原路退款，
 * 退款失败就不取消 —— 所以提示要说清"点下去钱就退了"。
 * 该动作仅管理员（口径 2）。
 */
const cancelOrder = async () => {
  try {
    const { value } = await ElMessageBox.prompt(
      order.value!.status === 'PENDING_PAYMENT'
        ? '取消该订单？未付款的订单会释放当天名额。'
        : '取消该订单？系统会立即发起微信原路退款（退款失败则不会取消），并释放当天名额。',
      '取消订单',
      {
        confirmButtonText: '确认取消',
        cancelButtonText: '再想想',
        inputPlaceholder: '取消原因（会记录在订单里）',
        inputValue: '客服取消',
      },
    );

    await customRecipeApi.updateStatus(order.value!.orderId, 'CANCELLED', value || '客服取消');
    ElMessage.success('订单已取消');
    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '取消失败', (message) => ElMessage.error(message));
  }
};

const startProcessing = async () => {
  try {
    await ElMessageBox.confirm('开始制作该订单？', '开始制作');

    await customRecipeApi.updateStatus(order.value!.orderId, 'IN_PROGRESS');
    ElMessage.success('已开始制作');
    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '开始制作失败', (message) => ElMessage.error(message));
  }
};

/**
 * 恢复成品抵扣额度（人工处理退款时使用，仅管理员）。
 *
 * 只把"已用额度"还回去，**不改任何订单金额** ——
 * 退款金额本身仍然走既有的退款流程。
 */
const restoreCredit = async () => {
  const used = Number(order.value?.creditUsed || 0);
  if (used <= 0) return;

  try {
    const { value } = await ElMessageBox.prompt(
      `本单已抵扣 ¥${used}。把已用额度全部还回去？（只影响额度，不改订单金额）`,
      '恢复抵扣额度',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        inputValue: String(used),
        inputPattern: /^\d+(\.\d{1,2})?$/,
        inputErrorMessage: '请输入不小于 0 的数字，最多两位小数',
      },
    );

    restoringCredit.value = true;
    const result: any = await customRecipeApi.restoreCredit(
      order.value!.orderId,
      Number(value),
    );

    ElMessage.success(
      `已恢复 ¥${result?.restored ?? 0}，剩余可用 ¥${result?.creditRemaining ?? 0}`,
    );
    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '恢复额度失败', (message) => ElMessage.error(message));
  } finally {
    restoringCredit.value = false;
  }
};

const contactCustomer = () => {
  const wechat = order.value?.customer?.wechatOpenid;
  const phone = order.value?.customer?.phone;

  ElMessageBox.alert(
    `微信：${wechat || '未绑定'}\n手机：${phone || '未填写'}`,
    '客户联系方式'
  );
};

const addIngredient = () => {
  recipeForm.items.push({
    ingredientId: '',
    preparationMethod: '',
    ratioPercent: 0,
  });
};

const removeIngredient = (index: number) => {
  recipeForm.items.splice(index, 1);
};

/**
 * 封面图上传。
 *
 * 2026-09-28 修复：原先用 el-upload 的 action 直传 /api/v1/admin/upload
 * —— 这个路由**根本不存在**；而且成功回调判的是 code === 200，
 * 全站统一成功码其实是 0。两处一起修，改走 api 层（会自动带上鉴权与解包）。
 */
const handleCoverUpload = async (options: any) => {
  try {
    const result: any = await recipeApi.uploadImage(options.file);
    const url = result?.url || result?.data?.url;
    if (!url) {
      throw new Error('上传未返回图片地址');
    }
    recipeForm.coverImageUrl = url;
    ElMessage.success('封面上传成功');
    options.onSuccess?.(result);
  } catch (error) {
    toastApiError(error, '封面上传失败', (message) => ElMessage.error(message));
    options.onError?.(error);
  }
};

const submitRecipe = async () => {
  if (!(await validateElementForm(recipeFormRef.value))) {
    ElMessage.warning('请先补全：食谱名称、能量密度、至少一个食材');
    return;
  }

  const dogName = order.value?.dog?.name || '这只狗';
  const orderNo = order.value?.orderId || '';
  const amount = Number(order.value?.amount || 0);

  try {
    // 确认框必须带狗名 / 订单号 / 金额：同名顾客或同一顾客多只狗时，
    // 只写订单号很容易把食谱交付到错误的那张单上
    await ElMessageBox.confirm(
      h('div', [
        h('p', `把手工填写的《${recipeForm.name.trim()}》交付给「${dogName}」？`),
        h('p', `订单号：${orderNo}　金额：¥${amount}`),
        h('p', '提交后会立即给顾客发送通知，订单转为「已交付」。'),
      ]),
      '提交食谱并交付',
      { confirmButtonText: '确认提交', cancelButtonText: '再检查一下' },
    );

    submitting.value = true;

    const data = {
      name: recipeForm.name.trim(),
      description: recipeForm.description,
      coverImageUrl: recipeForm.coverImageUrl,
      // 营养标准此前没进载荷，选了等于没选（后端永远写死）
      nutritionStandard: recipeForm.nutritionStandard,
      nutritionTarget: {
        protein_percent: recipeForm.proteinPercent,
        fat_percent: recipeForm.fatPercent,
        carbohydrate_percent: recipeForm.carbohydratePercent,
        energy_density_kcal_per_kg: recipeForm.energyDensityKcalPerKg,
      },
      items: recipeForm.items.map((item, index) => ({
        ingredientId: item.ingredientId,
        preparationMethod: item.preparationMethod,
        ratioPercent: item.ratioPercent,
        sortOrder: index,
      })),
      productionSteps: recipeForm.productionSteps,
    };

    await customRecipeApi.createRecipe(order.value!.orderId, data);
    ElMessage.success('食谱已创建并交付');
    emit('refresh');
    emit('close');
  } catch (error) {
    toastApiError(error, '提交失败', (message) => ElMessage.error(message));
    console.error(error);
  } finally {
    submitting.value = false;
  }
};

const resetRecipeForm = () => {
  Object.assign(recipeForm, {
    name: '',
    description: '',
    coverImageUrl: '',
    nutritionStandard: 'FEDIAF_2025',
    proteinPercent: 18,
    fatPercent: 8,
    carbohydratePercent: 45,
    energyDensityKcalPerKg: 3200,
    items: [],
    productionSteps: '',
  });
  recipeFormRef.value?.clearValidate();
};

const viewRecipeFull = () => {
  window.open(`/recipes/${order.value?.recipeId}`, '_blank');
};

const downloadFile = (attachment: CustomRecipeAttachment) => {
  window.open(attachment.fileUrl, '_blank');
};

const deleteAttachment = async (attachmentId: string) => {
  try {
    await ElMessageBox.confirm('确认删除该附件？', '确认删除');

    await customRecipeApi.deleteAttachment(attachmentId);
    ElMessage.success('附件已删除');
    loadOrderDetail();
  } catch (error) {
    toastApiError(error, '删除失败', (message) => ElMessage.error(message));
  }
};

// 工具函数
const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateTime = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const calculateAge = (birthday?: string) => {
  if (!birthday) return '-';
  const birth = new Date(birthday);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    return age - 1;
  }
  return age;
};

const getActivityLevelText = (level?: string) => {
  const map: Record<string, string> = {
    RESTING: '休息期',
    LOW: '低活动',
    NORMAL: '正常',
    HIGH: '高活动',
    WORKING: '工作犬',
  };
  return level ? map[level] || level : '-';
};

const getGoalText = (goal?: string) => {
  const map: Record<string, string> = {
    MAINTAIN: '维持体重',
    GAIN_WEIGHT: '增重',
    LOSE_WEIGHT: '减重',
    HEALTH_SUPPORT: '健康管理',
  };
  return goal ? map[goal] || goal : '-';
};
</script>

<style scoped>
.order-detail {
  padding: 20px;
}

.detail-container {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 30px;
}

.order-info-section,
.recipe-creation-section,
.completed-recipe-section {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 18px;
  color: #333;
}

.info-group {
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.info-item.full-width {
  flex-direction: column;
  align-items: flex-start;
}

.info-item label {
  font-weight: 500;
  color: #666;
}

.info-item span {
  color: #333;
}

.info-item .amount {
  color: #f56c6c;
  font-weight: bold;
  font-size: 18px;
}

.info-item .mono {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  text-align: right;
}

.info-item .credit-remaining {
  color: #b08d4f;
  font-weight: bold;
}

.credit-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.credit-tip {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-text {
  color: #999;
}

.notes-section {
  margin-top: 20px;
}

.notes-section label {
  display: block;
  font-weight: 500;
  color: #666;
  margin-bottom: 10px;
}

.notes-section p {
  background: #fff;
  padding: 15px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.attachments-list {
  margin-top: 20px;
}

.attachment-item {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #fff;
  border-radius: 4px;
  margin-bottom: 10px;
}

.file-name {
  flex: 1;
  margin: 0 15px;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ingredient-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cover-uploader {
  text-align: center;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}

.cover-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 200px;
  height: 200px;
  line-height: 200px;
}

.cover-image {
  width: 200px;
  height: 200px;
  display: block;
}

.recipe-actions {
  margin-top: 20px;
}

/* ---------- 一键交付 ---------- */

.section-desc {
  margin: -8px 0 16px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

.candidate-list {
  min-height: 60px;
  margin-bottom: 16px;
}

.candidate-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.candidate-group :deep(.el-radio) {
  display: flex;
  align-items: center;
  width: 100%;
  height: auto;
  margin-right: 0;
  padding: 10px 12px;
  background: #fff;
  border-radius: 6px;
}

.candidate-group :deep(.el-radio__label) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
}

.candidate-name {
  font-weight: 500;
}

.candidate-meta {
  font-size: 12px;
  color: #909399;
}

.delivery-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.delivery-warning {
  margin: 10px 0 0;
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.6;
}

.admin-only-tip {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

/* ---------- 档案更新提示与时效 ---------- */

.profile-updated-alert {
  margin-bottom: 12px;
}

.source-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.source-note {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.overdue-tag {
  margin-left: 8px;
}

.countdown-text {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.refund-tip {
  margin: 0;
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.6;
}
</style>
