<template>
  <div class="custom-recipe-config-page">
    <div class="page-header">
      <div>
        <h2>食谱定制设置</h2>
        <p class="page-desc">
          定制费、交付周期与每日接单上限在这里配置，<strong>不用改代码</strong>。
        </p>
      </div>
      <div class="header-actions">
        <!-- 口径 2：改定制费/产能只允许管理员。客服点下去只会吃 403，
             按钮直接说明"需要管理员权限"，不让人白点一次 -->
        <el-tooltip
          v-if="!isAdmin"
          :content="`${ADMIN_ONLY_TIP}：修改食谱定制设置`"
          placement="bottom"
        >
          <span><el-button type="primary" disabled>保存配置</el-button></span>
        </el-tooltip>
        <el-button v-else type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        <span v-if="saveError" class="save-error">{{ saveError }}</span>
      </div>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      class="snapshot-alert"
      title="⚠️ 生产损耗率有两个值，待确认"
      description="设计器发布路径目前写死 1.05（损耗 5%），后台手工建食谱用 1.07（损耗 7%），而小程序 DIY 制作单按 7% 告诉顾客。同一条食谱走不同入口会算出不同的采购量。改这里不会影响那两处写死的值 —— 需要先确认统一成哪个。"
    />

    <el-alert
      v-if="!isAdmin"
      type="warning"
      :closable="false"
      show-icon
      class="snapshot-alert"
      title="需要管理员权限"
      description="食谱定制设置（定制费 / 交付周期 / 接单上限）只允许管理员修改，当前账号只能查看。"
    />

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="snapshot-alert"
      title="改价只影响之后提交的订单"
      description="顾客提交定制单时，当时的定制费会快照进订单。已经提交或已付款的顾客，金额不会被后台调价改动。"
    />

    <el-card shadow="never" v-loading="loading">
      <el-form :model="form" label-width="200px" :disabled="!isAdmin">
        <el-divider content-position="left">价格</el-divider>

        <el-form-item label="定制费（元）">
          <el-input-number
            v-model="form.feeAmount"
            :min="0"
            :max="100000"
            :step="10"
            :precision="2"
            style="width: 200px"
          />
          <span class="form-tip">顾客提交定制单时支付的金额</span>
        </el-form-item>

        <el-divider content-position="left">产能与交付</el-divider>

        <el-form-item label="交付周期（工作日）">
          <el-input-number
            v-model="form.deliveryWorkDays"
            :min="1"
            :max="60"
            :step="1"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">从预约日起算，遇公众假期自动顺延</span>
        </el-form-item>


        <el-divider content-position="left">支付</el-divider>

        <el-form-item label="支付超时（分钟）">
          <el-input-number
            v-model="form.paymentTimeoutMinutes"
            :min="0"
            :max="1440"
            :step="5"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">
            超时未付款的定制订单会自动关闭，释放当天的排期名额；0 表示不自动关单
          </span>
        </el-form-item>

        <el-divider content-position="left">交付与售后</el-divider>

        <el-form-item label="每日交付上限">
          <el-input-number
            v-model="form.dailyDeliveryCapacity"
            :min="1"
            :max="200"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">
            一天最多交出几份。与「每日接单上限」分开：接单是收钱那一刻，交付是交出食谱那一天
          </span>
        </el-form-item>

        <!--
          2026-10-18：删掉「交付后自动完成」这个字段。

          老板 2026-10-17（V12）明确取消：
            "我们也不需要设置多少多少天内未确认，系统将自动完成"

          现在的口径（需求 2.5.5）：**交付后满售后窗口天数（7 天）自动完成**，
          有未处理完的售后则等处理完 —— 天数跟售后窗口**同一个来源**，
          不再单独配。

          `autoCompleteDays` 仍留在表单状态里（只从界面移除，不删数据）——
          跟这次删掉的另外 5 个字段一样的处理。
        -->


        <el-form-item label="交付物">
          <el-select
            v-model="form.deliveryItemCodes"
            multiple
            style="width: 420px"
            placeholder="至少留一样"
          >
            <el-option
              v-for="item in deliveryItemOptions"
              :key="item.code"
              :label="item.label"
              :value="item.code"
            />
          </el-select>
          <span class="form-tip">
            交付给顾客时包含哪几样；候选项来自「选项字典」的交付物选项集
          </span>
        </el-form-item>

        <el-form-item label="售后窗口（天）">
          <el-input-number
            v-model="form.aftersaleWindowDays"
            :min="0"
            :max="365"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">交付后多少天内顾客可以提售后</span>
        </el-form-item>

        <el-form-item label="免费调整">
          <el-input-number
            v-model="form.freeRevisionCount"
            :min="0"
            :max="20"
            :precision="0"
            style="width: 120px"
          />
          <span class="form-tip" style="margin: 0 8px">次，限交付后</span>
          <el-input-number
            v-model="form.freeRevisionWindowDays"
            :min="0"
            :max="365"
            :precision="0"
            style="width: 120px"
          />
          <span class="form-tip" style="margin-left: 8px">天内（不能超过售后窗口）</span>
        </el-form-item>

        <!-- ===== 2026-10-18 新增三个（配置页「5 加」里缺的）===== -->
        <el-form-item label="售后超时提醒">
          <el-input-number
            v-model="form.aftersaleOverdueHours"
            :min="1"
            :max="720"
            :precision="0"
            style="width: 120px"
          />
          <span class="form-tip" style="margin-left: 8px">
            小时内没处理，后台待办标红（这是给顾客的响应承诺）
          </span>
        </el-form-item>

        <el-form-item label="交付前无理由退款">
          <el-switch v-model="form.allowRefundBeforeDelivery" />
          <span class="form-tip">
            开启后顾客在交付前可随时全额退（不设天数）；交付后只调整食谱、不退款
          </span>
        </el-form-item>

        <el-form-item label="站内消息中心">
          <el-switch v-model="form.messageCenterEnabled" />
          <span class="form-tip">关了之后小程序隐藏消息入口（已有消息仍在库里）</span>
        </el-form-item>

        <el-divider content-position="left">资料附件</el-divider>

        <el-form-item label="附件张数上限">
          <el-input-number
            v-model="form.attachmentMaxCount"
            :min="1"
            :max="30"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">顾客提交定制单时最多传几张（小程序原先写死 9 张）</span>
        </el-form-item>

        <el-form-item label="附件大小上限">
          <el-input-number
            v-model="form.attachmentMaxSizeMb"
            :min="1"
            :max="50"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">
            MB（原先这个 10 在后端**两个控制器里各写一遍**）
          </span>
        </el-form-item>

        <el-divider content-position="left">设计默认值与排期</el-divider>

        <el-form-item label="默认营养标准">
          <el-input
            v-model="form.defaultNutritionStandard"
            style="width: 220px"
          />
          <span class="form-tip">后台手工建定制食谱时的默认值</span>
        </el-form-item>


        <el-form-item label="生产损耗率">
          <el-input-number
            v-model="form.productionLossRate"
            :min="1"
            :max="2"
            :step="0.01"
            :precision="2"
            style="width: 200px"
          />
          <span class="form-tip">
            1.07 表示损耗 7%。
            <strong>注意：设计器发布路径目前仍写死 1.05，改这里不会影响它</strong>
            —— 两处口径不一致待确认，见下方提示
          </span>
        </el-form-item>



        <el-form-item label="占位重试次数">
          <el-input-number
            v-model="form.slotRetryTimes"
            :min="1"
            :max="30"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">抢名额抢输时最多换几天重试（原写死 5）</span>
        </el-form-item>

        <el-form-item label="业务编号前缀">
          <el-input
            v-model="form.orderNoPrefix"
            maxlength="8"
            style="width: 140px"
          />
          <span class="form-tip">
            1~8 位大写字母；会拼进顾客看到的单号（如 CR20261016-0001），原写死 CR
          </span>
        </el-form-item>
      </el-form>

      <div v-if="updatedAt" class="updated-at">上次更新时间：{{ updatedAt }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { customRecipeApi } from '@/api/customRecipe';
import { platformOptionsApi } from '@/api/platformOptions';
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole';
import { getApiErrorMessage, toastApiError } from '@/utils/apiError';

/** 口径 2：这套参数（单价与产能）只允许管理员改，客服可以看 */
const isAdmin = useIsAdmin();

const loading = ref(false);
const saving = ref(false);
const saveError = ref('');
const updatedAt = ref('');

/**
 * ⚠️ 2026-10-18：这 5 个字段**已从界面移除，但保留在表单状态里**。
 *
 * 移除的：每日接单上限 / 要求顾客确认 / 排期往前找 / 默认能量密度 / 默认工时
 *   · 接单不限量了 → 接单上限没意义
 *   · 取消"确认收货" → 要求顾客确认没意义
 *   · 排期不设上限 → 往前找多少天没意义
 *   · 后两个**只在配置里读写、全后端 0 处业务引用**（查过）
 *
 * **为什么保留在状态里**：从界面拿掉一个字段，不该把它的值也清掉 ——
 * 保存时原样带回，数据库里的旧值不受影响。
 * 如果哪天要彻底删列，走 migration，别靠"表单不再传"来实现。
 *
 * 注意：**「生产损耗率」不在此列**。它一度被我误判为可删，
 * 实际是"新食谱的默认生产损耗率"，生产模块靠它算投料量。**已保留**。
 */
const form = reactive({
  feeAmount: 300,
  deliveryWorkDays: 3,
  dailyCapacity: 4,
  paymentTimeoutMinutes: 30,

  // ===== 批次 1.4：原先写死在代码里的参数 =====
  dailyDeliveryCapacity: 4,
  aftersaleWindowDays: 7,   // 老板 2026-10-17 V22：售后窗口 7 天
  aftersaleOverdueHours: 48,        // 2026-10-18：售后单超多少小时没处理要标红
  allowRefundBeforeDelivery: true,  // 2026-10-18：交付前可无理由全额退
  messageCenterEnabled: true,       // 2026-10-18：站内消息中心开关
  freeRevisionCount: 2,     // 老板 2026-10-17 V23：7 天内免费修改 2 次
  freeRevisionWindowDays: 7,
  autoCompleteDays: 3,
  requireCustomerConfirm: true,
  deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'] as string[],
  attachmentMaxCount: 9,
  attachmentMaxSizeMb: 10,
  defaultNutritionStandard: 'FEDIAF_2025',
  defaultEnergyDensityKcalPerKg: 3200,
  productionLossRate: 1.07,
  defaultLaborHours: 2,
  scheduleLookaheadDays: 45,
  slotRetryTimes: 5,
  orderNoPrefix: 'CR',
});

/**
 * 交付物候选项从**选项字典**读，不在这里写死。
 *
 * 这一页本身就是在拆"前端各写一份清单"的问题，
 * 自己再写一份就说不过去了。
 */
const deliveryItemOptions = ref<Array<{ code: string; label: string }>>([]);

const loadConfig = async () => {
  loading.value = true;
  saveError.value = '';
  try {
    const data = await customRecipeApi.getConfig();
    form.feeAmount = Number(data?.feeAmount ?? 300);
    form.deliveryWorkDays = Number(data?.deliveryWorkDays ?? 3);
    form.dailyCapacity = Number(data?.dailyCapacity ?? 4);
    form.paymentTimeoutMinutes = Number(data?.paymentTimeoutMinutes ?? 30);

    form.dailyDeliveryCapacity = Number(data?.dailyDeliveryCapacity ?? 4);
    form.aftersaleWindowDays = Number(data?.aftersaleWindowDays ?? 30);
    form.freeRevisionCount = Number(data?.freeRevisionCount ?? 1);
    form.freeRevisionWindowDays = Number(data?.freeRevisionWindowDays ?? 7);
    form.autoCompleteDays = Number(data?.autoCompleteDays ?? 3);
    form.requireCustomerConfirm = Boolean(data?.requireCustomerConfirm ?? true);
    form.deliveryItemCodes = Array.isArray(data?.deliveryItemCodes)
      ? [...data.deliveryItemCodes]
      : ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'];
    form.attachmentMaxCount = Number(data?.attachmentMaxCount ?? 9);
    form.attachmentMaxSizeMb = Number(data?.attachmentMaxSizeMb ?? 10);
    form.defaultNutritionStandard = data?.defaultNutritionStandard ?? 'FEDIAF_2025';
    form.defaultEnergyDensityKcalPerKg = Number(
      data?.defaultEnergyDensityKcalPerKg ?? 3200,
    );
    form.productionLossRate = Number(data?.productionLossRate ?? 1.07);
    form.defaultLaborHours = Number(data?.defaultLaborHours ?? 2);
    form.scheduleLookaheadDays = Number(data?.scheduleLookaheadDays ?? 45);
    form.slotRetryTimes = Number(data?.slotRetryTimes ?? 5);
    form.orderNoPrefix = data?.orderNoPrefix ?? 'CR';

    updatedAt.value = data?.updatedAt
      ? new Date(data.updatedAt).toLocaleString()
      : '';
  } catch (error) {
    // 具体原因（没登录过期 / 后端拒绝）比"读取配置失败"有用得多
    saveError.value = getApiErrorMessage(error, '读取配置失败，请刷新重试');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  saveError.value = '';

  if (!isAdmin.value) {
    // 后端 AdminGuard 也会拦，这里先给出人话
    saveError.value = `${ADMIN_ONLY_TIP}：修改食谱定制设置`;
    return;
  }

  /**
   * 这两条后端也会拦（并且是权威），在前端先判一次只是为了
   * 让用户不用等一次往返才知道哪里填错了。
   */
  if (form.freeRevisionWindowDays > form.aftersaleWindowDays) {
    saveError.value = `免费调整窗口（${form.freeRevisionWindowDays} 天）不能超过售后窗口（${form.aftersaleWindowDays} 天）`;
    return;
  }
  if (form.deliveryItemCodes.length === 0) {
    saveError.value = '交付物至少要留一样；一样都不给的话顾客收到的是空的';
    return;
  }

  saving.value = true;
  try {
    const data = await customRecipeApi.updateConfig({ ...form });
    ElMessage.success('配置已保存，新提交的订单立即生效');
    updatedAt.value = data?.updatedAt
      ? new Date(data.updatedAt).toLocaleString()
      : '';
  } catch (error) {
    // 保存失败必须在按钮旁显式显示：否则用户只看到按钮转圈、值没变，
    // 以为是自己没点保存。toastApiError 负责"后端原因优先、不重复弹同一句"。
    saveError.value = getApiErrorMessage(error, '保存失败，请重试');
    toastApiError(error, '保存失败，请重试', (message) => ElMessage.error(message));
  } finally {
    saving.value = false;
  }
};

/**
 * 交付物候选项从「选项字典」读。
 *
 * 读失败**不拦住页面**：交付物下拉空着不影响改其它参数，
 * 页面顶部已经有整体报错提示了。
 */
const loadDeliveryItemOptions = async () => {
  try {
    const data = await customRecipeApi.getDeliveryItemOptions();
    deliveryItemOptions.value = data;
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  loadConfig();
  loadDeliveryItemOptions();
});
</script>

<style scoped>
.custom-recipe-config-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.save-error {
  font-size: 13px;
  color: #d92d20;
}

.snapshot-alert {
  margin-bottom: 16px;
}

.form-tip {
  margin-left: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #909399;
}

.updated-at {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
</style>
