<template>
  <div class="order-detail" v-loading="loading">
    <div v-if="order" class="detail-container">
        <el-alert
          v-if="allergyComparison.changed || medicalComparison.changed"
          type="warning"
          :closable="false"
          show-icon
          class="profile-updated-alert"
          title="下单后档案有更新，请按最新信息设计"
          :description="profileUpdateDetail"
        />


      <!-- 左侧：订单信息 -->
      <div class="order-info-section">
        <h3>订单信息</h3>

        <div class="info-group">
          <div class="info-item">
            <label>订单号</label>
            <span class="copy-value">
              <span class="mono">{{ order.orderId }}</span>
              <el-button link type="primary" size="small" @click="copyOrderNo">复制</el-button>
            </span>
          </div>
          <div class="info-item">
            <label>状态</label>
            <!-- 状态文案与色调来自选项字典（后端下发），不在页面里再维护一份 -->
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
            <label>转入制作</label>
            <span>{{ formatDateTime(order.inProgressAt) }}</span>
          </div>
          <div class="info-item" v-if="order.deliveredAt">
            <label>交付时间</label>
            <span>{{ formatDateTime(order.deliveredAt) }}</span>
          </div>
          <!--
            交付历史（2026-10-18 · 需求 2.8.6）

            此前交付完**只是改一个状态**，没有任何地方能回答：
            「这一单交过几版、每版什么时候、谁交的、通知发出去没有」。
            顾客说"我收到的是旧版"时，**查不出来**。
          -->
          <div class="info-item delivery-history" v-if="deliveryHistory.length">
            <label>交付历史</label>
            <div class="delivery-history__list">
              <div
                v-for="item in deliveryHistory"
                :key="item.id"
                class="delivery-history__row"
              >
                <span class="delivery-history__version">
                  第 {{ item.version }} 版
                  <el-tag v-if="item.isCurrent" size="small" type="success">
                    当前
                  </el-tag>
                </span>
                <span class="delivery-history__time">
                  {{ formatDateTime(item.deliveredAt) }}
                </span>
                <span class="delivery-history__by">
                  交付人 {{ item.deliveredBy }}
                </span>
                <span class="delivery-history__notify">
                  {{ notifyStatusText(item.notifyStatus) }}
                </span>
              </div>
            </div>
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

        <!--
          线下收款（2026-10-21 · 代客定制食谱订单 Task 5）。

          代客单的钱是线下收的（微信转账/支付宝/现金），但订单同样是 PAID。
          微信里没有这笔支付，所以取消**不能**走原路退款 —— 页面必须说清楚，
          否则客服会以为点「取消订单」就能把钱退回去。
        -->
        <template v-if="isOfflinePaidOrder">
          <el-divider />
          <h3>线下收款</h3>
          <div class="info-group">
            <div class="info-item">
              <label>收款方式</label>
              <span>{{ paymentChannelText }}</span>
            </div>
            <div
              class="info-item"
              v-if="order.actualPaidAmount !== null && order.actualPaidAmount !== undefined"
            >
              <label>实收金额</label>
              <span class="amount">¥{{ Number(order.actualPaidAmount).toFixed(2) }}</span>
            </div>
            <div class="info-item" v-if="order.externalPaymentRef">
              <label>收款备注</label>
              <span>{{ order.externalPaymentRef }}</span>
            </div>
          </div>
          <p v-if="offlineRefundCap > 0" class="offline-refund-tip">
            这是线下收款订单，退款不走微信原路退回。
            平时无需处理；如果顾客提出退款，请先在线下把款退回，再用「线下退款并取消」登记。
            系统只登记这笔线下退款，不会自动调用微信退款。
          </p>
          <p v-else class="offline-refund-tip">
            这是 0 元赠送单，没有实收金额，也没有款可退；取消时直接点「取消赠送订单」即可，不会调用微信退款。
          </p>
        </template>

        <!-- 线下退款登记记录：谁、什么时候、退了多少、怎么退、备注什么 -->
        <template v-if="hasOfflineRefundInfo">
          <el-divider />
          <h3>线下退款登记</h3>
          <div class="info-group">
            <div class="info-item">
              <label>退款方式</label>
              <span>{{ offlineRefundMethodText }}</span>
            </div>
            <div
              class="info-item"
              v-if="order.offlineRefundAmount !== null && order.offlineRefundAmount !== undefined"
            >
              <label>退款金额</label>
              <span class="amount">¥{{ Number(order.offlineRefundAmount).toFixed(2) }}</span>
            </div>
            <div class="info-item" v-if="order.offlineRefundedAt">
              <label>登记时间</label>
              <span>{{ formatDateTime(order.offlineRefundedAt) }}</span>
            </div>
            <div class="info-item" v-if="order.offlineRefundByStaffId">
              <label>操作人</label>
              <span class="mono">{{ order.offlineRefundByStaffId }}</span>
            </div>
            <div class="info-item" v-if="order.offlineRefundNote">
              <label>备注</label>
              <span>{{ order.offlineRefundNote }}</span>
            </div>
          </div>
          <p class="offline-refund-tip">
            这是手工退款登记，系统没有调用微信退款；如对金额有疑问请核对线下转账记录。
          </p>
        </template>

        <el-divider />

        <h3>客户信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>姓名</label>
            <span>
              {{ order.customer?.nickname }}
              <el-tag
                v-if="isInternalCustomer"
                size="small"
                type="danger"
                effect="plain"
                class="internal-customer-tag"
              >
                {{ INTERNAL_CUSTOMER_BADGE }}
              </el-tag>
            </span>
          </div>
          <div class="info-item">
            <label>微信</label>
            <!-- openid 是账号标识，只用于核对身份，不把完整值摊在页面上 -->
            <span class="mono">{{ maskOpenid(order.customer?.wechatOpenid) }}</span>
          </div>
          <div class="info-item">
            <label>手机</label>
            <span class="copy-value">
              <span>{{ order.customer?.phone || '未填写' }}</span>
              <el-button link type="primary" size="small" @click="copyPhone">复制</el-button>
            </span>
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
            <label>品种</label>
            <span>{{ dogBreedName || '未填写' }}</span>
          </div>
          <div class="info-item">
            <label>年龄</label>
            <span>{{ calculateAge(order.dog?.birthday) }}</span>
          </div>
          <div class="info-item">
            <label>当前体重</label>
            <span>{{ order.dog?.currentWeightKg }}kg</span>
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

        <h3>订单备注</h3>
        <div v-if="order.additionalNotes" class="notes-section">
          <p>{{ order.additionalNotes }}</p>
        </div>
        <p v-else class="empty-text">无</p>

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
          <!--
            线下收款单（2026-10-21 · 代客定制食谱订单 Task 5）。

            钱是线下收的，微信里没有这笔支付 —— 原来的「取消订单」会误调微信退款。
            线下单改为「线下退款并取消」：管理员先线下把款退回顾客，
            再在弹窗里登记金额/方式/备注；系统只登记，不调用微信退款。
          -->
          <el-button
            v-if="canOfflineRefund"
            type="danger"
            plain
            :loading="offlineRefunding"
            @click="openOfflineRefundDialog"
          >
            线下退款并取消
          </el-button>
          <span v-if="canOfflineRefund" class="offline-refund-tip">
            仅在顾客提出退款时使用：先线下退款，再登记；不会调用微信退款
          </span>
          <!-- 取消会退款、会释放当天接单名额（每天只有 5 个），口径 2 定为仅管理员。
               已交付的单不允许取消（后端也会拒绝）。线下单走上面的线下退款入口。 -->
          <el-button
            v-if="canCancelOrder"
            type="danger"
            plain
            @click="cancelOrder"
          >
            {{ cancelOrderLabel }}
          </el-button>
          <span
            v-else-if="!isAdmin && isCancellableStatus"
            class="admin-only-tip"
          >
            {{ ADMIN_ONLY_TIP }}：{{ isOfflinePaidOrder ? '线下退款并取消' : '取消订单' }}
          </span>
          <!-- 补退款（2026-10-21）：取消时该退而没退成的历史单。
               订单取消后「取消订单」按钮就没了，没有这个入口就再也退不了钱。
               仅在"已取消 + 已收款 + 退款未成功/未处理中"时出现，仅管理员可见。 -->
          <el-button
            v-if="canManualRefund"
            type="warning"
            plain
            :loading="manualRefunding"
            @click="manualRefund"
          >
            补退款
          </el-button>
          <span v-if="canManualRefund" class="manual-refund-tip">
            该单已取消但退款未完成，点这里补发起原路退款
          </span>
        </div>
      </div>

      <!-- 交付：接在订单信息下方（单列布局） -->
      <div class="recipe-creation-section" v-if="canDeliver">
        <!-- 一键交付（2026-10-04 第 1、2 条）：
             设计器里做好的食谱直接挂到订单上，不再在订单页手工抄一份。 -->
        <div class="recipe-delivery-block">
          <div class="delivery-toolbar">
            <span class="delivery-toolbar__label">食谱设计</span>
            <el-button
              v-if="order.dog?.id"
              type="success"
              plain
              :loading="openingDesigner"
              :disabled="!canStartDesign || openingDesigner"
              @click="openInDesigner"
            >
              {{ designEntryLabel }}
            </el-button>
            <!--
              代客发起调整（2026-10-27）：
              已交付的单，顾客不会/不方便在小程序提单时，老板从这里开一张调整单并直接改稿。
            -->
            <el-button
              v-if="canInitiateAdjustment"
              type="warning"
              plain
              :loading="adjustSubmitting"
              @click="openAdjustDialog"
            >
              代客发起调整
            </el-button>
            <span
              v-if="legacyOrderWithoutDesignSlots"
              class="design-workspace-note"
            >
              本单还没有本单设计记录（老订单）：进入「{{ designEntryLabel }}」可为本单新建 N 份设计；
              下方旧候选交付仍然可用。
            </span>
          </div>

          <!--
            订单绑定食谱设计（2026-10-22）：
            有槽位的新流程单只显示工作台入口；旧候选交付只在没有槽位的老订单上出现。
          -->
          <el-alert
            v-if="hasOrderDesignSlots"
            class="order-design-alert"
            type="info"
            :closable="false"
            show-icon
          >
            <template #title>本单已进入「订单设计」流程</template>
            <div>
              本单 {{ designWorkspace?.quantity ?? 0 }} 份<span
                v-if="designDeliveredCount > 0"
              >，已交付 {{ designDeliveredCount }} 份</span><span
                v-else
              >，已就绪 {{ designWorkspace?.readyCount ?? 0 }} 份</span>；
              请进入本单设计工作台逐份「加入本单待提交」，N 份齐了由管理员最终提交交付。
            </div>
            <el-button
              class="order-design-alert__action"
              link
              type="primary"
              @click="openInDesigner"
            >
              进入本单工作台
            </el-button>
          </el-alert>

          <template v-else>
            <!-- 1 份订单保持原来的单份交付；N 份订单必须一次交齐（2026-10-21） -->
            <template v-if="isMultiRecipeOrder">
            <h3>一次性交付 {{ multiRecipeQuantity }} 份食谱</h3>
            <p class="section-desc">
              本单购买了 {{ multiRecipeQuantity }} 份，这里列出「{{ order.dog?.name || '这只狗' }}」的全部私密定制候选。
              勾选恰好 {{ multiRecipeQuantity }} 份后一次性交付，顾客会收到一条通知。
            </p>

            <div class="multi-recipe-progress">
              <span class="multi-recipe-progress__designed">{{ multiRecipeProgressText }}</span>
              <span class="multi-recipe-progress__selected">
                已选 {{ selectedBatchRecipeIds.length }} / {{ multiRecipeQuantity }} 份
              </span>
            </div>
            <p v-if="candidates.length < multiRecipeQuantity" class="delivery-warning">
              候选食谱还差 {{ multiRecipeQuantity - candidates.length }} 份才能交齐；
              请先在设计器里补满这 {{ multiRecipeQuantity }} 份。
            </p>
          </template>
          <template v-else>
            <h3>{{ isRedelivery ? '重新交付食谱' : '从已设计好的食谱交付' }}</h3>
            <p class="section-desc">
              这里只列出「{{ order.dog?.name || '这只狗' }}」的私密定制食谱（该顾客 + 该狗狗）。
              选中一条点交付即可，顾客会收到通知。
            </p>
          </template>

          <div v-loading="candidatesLoading" class="candidate-list">
            <!-- 多份订单：多选；勾满 N 份后其余候选禁用，但已勾选的仍可取消 -->
            <el-checkbox-group
              v-if="isMultiRecipeOrder && candidates.length"
              v-model="selectedBatchRecipeIds"
              class="candidate-group"
            >
              <el-checkbox
                v-for="candidate in candidates"
                :key="candidate.recipeId"
                :value="candidate.recipeId"
                :disabled="!isBatchRecipeSelectable(candidate.recipeId)"
                class="candidate-item"
              >
                <span class="candidate-name">{{ candidate.name }}</span>
                <span class="candidate-meta">
                  v{{ candidate.version }} · 更新于 {{ formatDateTime(candidate.updatedAt) }}
                </span>
                <el-tag v-if="candidate.linkedToThisOrder" type="success" size="small">
                  当前已挂
                </el-tag>
              </el-checkbox>
            </el-checkbox-group>

            <el-radio-group
              v-if="!isMultiRecipeOrder && candidates.length"
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
              v-if="!candidatesLoading && !candidates.length"
              :image-size="70"
              description="这只狗还没有已发布的定制食谱，请先点上方「开始设计」"
            />
          </div>

          <div class="delivery-actions">
            <template v-if="isMultiRecipeOrder">
              <el-button
                v-if="isAdmin"
                type="primary"
                :disabled="!canSubmitBatchDelivery"
                :loading="batchDelivering"
                @click="deliverBatchRecipes"
              >
                一次性交付 {{ multiRecipeQuantity }} 份
              </el-button>
              <span v-else class="admin-only-tip">
                {{ ADMIN_ONLY_TIP }}：一次性交付多份食谱会给顾客发通知，只有管理员能做
              </span>
            </template>
            <template v-else>
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
            </template>
          </div>
          <p v-if="isMultiRecipeOrder && isRedelivery" class="delivery-warning">
            该订单已经交付过，暂不支持批量重新交付；如需调整请走售后流程。
          </p>
          <p v-if="!isMultiRecipeOrder && isRedelivery" class="delivery-warning">
            重新交付会替换当前交付的食谱，并再次给顾客发送通知。
          </p>
          <p v-if="batchDeliverError" class="delivery-error">
            {{ batchDeliverError }}
          </p>
          </template>
        </div>

      </div>

      <!--
        已交付的食谱信息（2026-10-16 批次 5.5 修）。

        ⚠️ 这里原来是 `order.status === 'DELIVERED'` ——
        而同一个文件里"能不能交付"用的是 `canDeliverCustomRecipe()`（含 `COMPLETED`）。
        **同一件事两套判断**，后果是：顾客点完「确认收到」订单变成已完成，
        这一块**整块消失** —— 老板反而看不到交付的是哪份食谱了。

        现在两处用同一个常量。
      -->
      <div class="completed-recipe-section" v-if="canDeliver && order.recipe">
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

    <!--
      线下退款并取消（2026-10-21 · 代客定制食谱订单 Task 5）。

      这是**手工退款**：钱由管理员在线下退回顾客，系统只登记
      「退了多少、怎么退、谁操作的」，然后取消订单并释放名额。
      **不调用微信退款** —— 线下收款在微信里没有交易可退。
    -->
    <el-dialog
      v-model="offlineRefundDialogVisible"
      title="线下退款并取消"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="这是手工退款，不会调用微信退款"
        description="仅在顾客提出退款时使用：请先在线下（微信/支付宝/现金）把款退给顾客，再在这里登记。登记后订单会变为「已取消」并释放当天接单名额。"
      />

      <el-form label-width="90px" class="offline-refund-form">
        <el-form-item label="退款金额">
          <div class="offline-refund-amount">
            <el-input-number
              v-model="offlineRefundForm.amount"
              :min="0.01"
              :max="offlineRefundCap"
              :precision="2"
              :step="10"
            />
            <span class="offline-refund-cap">
              最多可退实收 ¥{{ offlineRefundCap.toFixed(2) }}
            </span>
          </div>
        </el-form-item>
        <el-form-item label="退款方式">
          <el-select v-model="offlineRefundForm.method" placeholder="请选择退款方式">
            <el-option
              v-for="item in CUSTOM_RECIPE_OFFLINE_REFUND_METHOD_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="offlineRefundForm.note"
            maxlength="200"
            show-word-limit
            placeholder="例如：微信转账退回，流水号 xxx（可选）"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="offlineRefundDialogVisible = false">再想想</el-button>
        <el-button
          type="danger"
          :loading="offlineRefunding"
          @click="submitOfflineRefund"
        >
          确认已线下退款并取消
        </el-button>
      </template>
    </el-dialog>

    <!-- 代客发起调整：先写一句给顾客看的说明，再进入设计器改稿 -->
    <el-dialog
      v-model="adjustDialogVisible"
      title="代客发起调整"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="这是商家主动发起的调整"
        description="不占用顾客的免费调整次数，也不受售后受理期限制。发起后会直接打开设计器改稿；改完回「售后处理」页点「重新交付并完成」即可交回给顾客。"
      />

      <el-form label-width="90px" class="offline-refund-form">
        <el-form-item label="调整说明">
          <el-input
            v-model="adjustDescription"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="例如：狗狗体重下降，把兔里脊换成鸭胸，蛋白比例上调"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="adjustDialogVisible = false">再想想</el-button>
        <el-button
          type="primary"
          :loading="adjustSubmitting"
          @click="submitStaffAdjustment"
        >
          发起并去改稿
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document } from '@element-plus/icons-vue';
import {
  customRecipeApi,
  type CustomRecipeDeliveryHistoryItem,
  type OfflineRefundMethod,
} from '@/api/customRecipe';
import type {
  CustomRecipeAttachment,
  CustomRecipeCandidate,
  CustomRecipeOrderDetail,
} from '@/api/customRecipe';
import { dogApi } from '@/api/dogs';
import { orderRecipeDesignApi } from '@/api/orderRecipeDesign';
import { recipeDesignerApi } from '@/api/recipeDesigner';
import type { OrderDesignWorkspace } from '@/types/orderRecipeDesign';
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole';
import {
  CUSTOM_RECIPE_OFFLINE_REFUND_METHOD_OPTIONS,
  buildMultiRecipeProgressText,
  canDeliverCustomRecipe,
  canManualRefundCustomRecipeOrder,
  canOfflineRefundCustomRecipeOrder,
  canSubmitBatchDelivery as isBatchDeliveryReady,
  getCustomRecipeOfflineRefundMethodText,
  getCustomRecipePaymentChannelText,
  getCustomRecipeRefundStatusText,
  isBatchRecipeSelectable as canSelectBatchRecipe,
  isCustomRecipeRedelivery,
  isCustomRecipeRefundSucceeded,
  isMultiRecipeOrderQuantity,
  isOfflinePaidCustomRecipeOrder,
  normalizeRecipeQuantity,
} from '@/constants/customRecipeOrder';
import {
  CUSTOM_RECIPE_GOAL_SET,
  CUSTOM_RECIPE_STATUS_SET,
  useOptionSet,
} from '@/composables/useOptionSet';
import {
  compareDogProfileAllergies,
  compareDogProfileMedicalConditions,
  getEstimatedDeliveryInfo,
  parseAllergyText,
} from '@/utils/customRecipe';
import {
  getApiErrorMessage,
  isUserCancel,
  toastApiError,
} from '@/utils/apiError';
import {
  INTERNAL_CUSTOMER_BADGE,
  isInternalCustomerRole,
} from '@/utils/customerRole';

const props = defineProps<{
  orderId: string;
}>();

const emit = defineEmits(['refresh', 'close']);

/** 口径 2：交付 / 取消只允许管理员，前端按角色隐藏敏感按钮 */
const isAdmin = useIsAdmin();

// 状态
const loading = ref(false);
/** 打开设计器 / 把 PAID 单改成制作中，进行中时防重复点击 */
const openingDesigner = ref(false);
/** 手工补退款进行中（防止连点重复提交） */
const manualRefunding = ref(false);
/** 线下退款登记进行中（防止连点重复提交） */
const offlineRefunding = ref(false);
/** 「线下退款并取消」弹窗 */
const offlineRefundDialogVisible = ref(false);
const offlineRefundForm = ref<{
  amount: number;
  method: string;
  note: string;
}>({
  amount: 0,
  method: 'OFFLINE_WECHAT',
  note: '',
});
const order = ref<CustomRecipeOrderDetail | null>(null);
/** 品种不在订单详情返回里，用狗狗档案补齐；失败不影响订单展示 */
const dogBreedName = ref('');

/**
 * 2026-10-19：未付款订单禁止开始设计。
 *
 * 只拦“待付款/已取消”；已付款（含制作中/已交付）仍可进入设计器，
 * 售后改稿/重新交付还要用这个入口。
 */
const canStartDesign = computed(() => {
  const status = String(order.value?.status || '');
  return Boolean(status) && !['PENDING_PAYMENT', 'CANCELLED'].includes(status);
});

// ---------- 代客发起调整（2026-10-27）----------

/**
 * 已交付（含已自动完成）的订单才需要这个入口。
 *
 * 未交付的单直接在订单设计工作台改就行，不需要走调整单 ——
 * 多开一条只会让售后列表多一条「没有顾客诉求」的记录。
 */
const canInitiateAdjustment = computed(() => {
  if (!isAdmin.value) return false;
  const status = String(order.value?.status || '');
  return status === 'DELIVERED' || status === 'COMPLETED';
});

const adjustDialogVisible = ref(false);
const adjustDescription = ref('');
const adjustSubmitting = ref(false);

function openAdjustDialog() {
  adjustDescription.value = '';
  adjustDialogVisible.value = true;
}

/**
 * 发起调整 → 直接打开设计器改稿。
 *
 * 三步顺序不能变：先建单（售后页才有记录可重交）→ 再 reopen（把已交付的
 * 槽位改回编辑中并开新版本草稿）→ 最后跳设计器。
 *
 * ⚠️ 空窗口必须在**点击的同步栈**里先开：建单和 reopen 都要 await，
 * 等完再 window.open 会被浏览器当成非用户触发的弹窗直接拦掉。
 */
async function submitStaffAdjustment() {
  if (!order.value || adjustSubmitting.value) return;
  const description = adjustDescription.value.trim();
  if (!description) {
    ElMessage.warning('请写一句这次要调整什么，顾客会看到这句话');
    return;
  }

  const orderId = order.value.orderId;
  const designerWindow = window.open('', '_blank');
  adjustSubmitting.value = true;
  try {
    const aftersale = await customRecipeApi.createStaffAftersale(orderId, {
      description,
    });
    const reopened = await recipeDesignerApi.reopenAftersaleDesign(aftersale.id);

    adjustDialogVisible.value = false;
    const url =
      `/recipe-designer/series/${reopened.seriesId}/drafts/${reopened.draftId}` +
      `?orderId=${encodeURIComponent(reopened.orderId)}` +
      `&designId=${encodeURIComponent(reopened.designId)}` +
      `&aftersaleId=${encodeURIComponent(aftersale.id)}`;
    if (designerWindow) {
      designerWindow.location.href = url;
    } else {
      window.open(url, '_blank');
    }
    ElMessage.success('已发起调整，正在打开设计器');
    emit('refresh');
  } catch (error) {
    designerWindow?.close();
    toastApiError(error, '发起调整失败，请重试', (message) =>
      ElMessage.error(message),
    );
  } finally {
    adjustSubmitting.value = false;
  }
}

/**
 * 订单绑定食谱设计（2026-10-22 · Task 5）。
 *
 * 有设计槽位的订单必须去 `/order-design/:orderId` 工作台完成 N 份并最终提交；
 * 没有任何槽位的老订单仍然保留下方旧的候选交付流程。
 */
const designWorkspace = ref<OrderDesignWorkspace | null>(null);
const designWorkspaceLoading = ref(false);
const hasOrderDesignSlots = computed(
  () => (designWorkspace.value?.slots.length ?? 0) > 0,
);
const designEntryLabel = computed(() =>
  hasOrderDesignSlots.value ? '继续设计' : '开始设计',
);
const designDeliveredCount = computed(
  () =>
    designWorkspace.value?.slots.filter((slot) => slot.status === 'DELIVERED')
      .length ?? 0,
);
/** 制作中的老订单还没有本单设计记录：提示旧交付入口仍可用。 */
const legacyOrderWithoutDesignSlots = computed(
  () =>
    String(order.value?.status || '') === 'IN_PROGRESS' &&
    !designWorkspaceLoading.value &&
    !hasOrderDesignSlots.value,
);

/** 交付历史（2026-10-18 · 需求 2.8.6）—— 订单详情只带最新一版，这里要全部 */
const deliveryHistory = ref<CustomRecipeDeliveryHistoryItem[]>([]);

// ---------- 面板上的派生展示 ----------

/**
 * 状态中文与色调来自**选项字典**（2026-10-16 批次 3.3）。
 *
 * 此前是本地那份 `CUSTOM_RECIPE_STATUS_META` —— 后端加「已完成」时没跟上，
 * 顾客在小程序点「确认收到」后，**这里会显示英文 `COMPLETED`**。
 */
const {
  ensure: ensureStatusOptions,
  labelOf: statusLabel,
  toneOf: statusTone,
} = useOptionSet(CUSTOM_RECIPE_STATUS_SET);

const statusText = computed(() => statusLabel(order.value?.status));
const statusTagType = computed(() => statusTone(order.value?.status) || undefined);

/** 内部账号（老板/员工）下的测试单，后台要能和真实顾客单一眼区分 */
const isInternalCustomer = computed(() =>
  isInternalCustomerRole(order.value?.customer?.role),
);

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

/**
 * 「补退款」入口（2026-10-21）。
 *
 * 只服务"已取消、钱已收、退款没成"的历史单 —— 例如生产单 CR202610201196：
 * 取消时只认 PAID，制作中的单没退钱，之后订单已取消，取消按钮消失，
 * 后台就再没有任何退款入口了。
 *
 * 判定条件收在 `canManualRefundCustomRecipeOrder` 纯函数里
 * （已取消 + 有付款确认 + 退款不是成功/处理中），页面不自己拼状态。
 * 再加 `isAdmin`：接口仅管理员，员工看不到这个按钮，也不用点完吃 403。
 */
const canManualRefund = computed(
  () =>
    isAdmin.value &&
    canManualRefundCustomRecipeOrder({
      status: order.value?.status,
      paymentConfirmedAt: order.value?.paymentConfirmedAt,
      refundStatus: order.value?.refundStatus,
      // 线下单没有微信退款可补，入口是「线下退款并取消」
      paymentChannel: order.value?.paymentChannel,
      orderSource: order.value?.orderSource,
    }),
);

// ===== 线下收款 / 线下退款（2026-10-21 · 代客定制食谱订单 Task 5）=====

/**
 * 这张单的钱是不是线下收的。
 *
 * 判定与后端同一个口径（`isOfflinePaidCustomRecipeOrder`）：
 * 线下渠道，或代客单已确认收款。是线下单就**绝不能**再显示
 * 「取消订单 / 补退款」这两个会调微信退款的入口。
 */
const isOfflinePaidOrder = computed(() =>
  isOfflinePaidCustomRecipeOrder({
    paymentChannel: order.value?.paymentChannel,
    orderSource: order.value?.orderSource,
    paymentConfirmedAt: order.value?.paymentConfirmedAt,
  }),
);

const paymentChannelText = computed(() =>
  getCustomRecipePaymentChannelText(order.value?.paymentChannel),
);

/** 线下退款的登记记录（有登记过才显示那一块） */
const hasOfflineRefundInfo = computed(
  () =>
    Boolean(order.value?.offlineRefundedAt) ||
    (order.value?.offlineRefundAmount !== null &&
      order.value?.offlineRefundAmount !== undefined),
);

const offlineRefundMethodText = computed(() =>
  getCustomRecipeOfflineRefundMethodText(order.value?.offlineRefundMethod),
);

/**
 * 线下退款上限：**实收多少最多退多少**。
 *
 * 订单 `amount` 是系统报价；线下实收记在 `actualPaidAmount`。
 * 实收缺失时退回报价（老数据），绝不返回负数 —— 弹窗默认值也用它。
 */
const offlineRefundCap = computed(() => {
  const actual = Number(order.value?.actualPaidAmount);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const quoted = Number(order.value?.amount);
  return Number.isFinite(quoted) && quoted > 0 ? quoted : 0;
});

/**
 * 是否显示「线下退款并取消」。
 *
 * 线下已收款 + 还能取消（未交付/未取消/未登记过）+ 管理员。
 * 员工看不到这个按钮，也不用点完吃 403（后端还有 AdminGuard）。
 */
const canOfflineRefund = computed(
  () =>
    isAdmin.value &&
    // 没有可退金额时不给入口：弹窗的金额下限是 0.01，开了也提交不了
    offlineRefundCap.value > 0 &&
    canOfflineRefundCustomRecipeOrder({
      status: order.value?.status,
      paymentConfirmedAt: order.value?.paymentConfirmedAt,
      paymentChannel: order.value?.paymentChannel,
      orderSource: order.value?.orderSource,
      offlineRefundedAt: order.value?.offlineRefundedAt,
      cancelledAt: order.value?.cancelledAt,
    }),
);

/** 是否还能取消（与原来按钮条件一致：已交付/已取消不再显示） */
const isCancellableStatus = computed(() => {
  const status = String(order.value?.status || '');
  return Boolean(status) && !['DELIVERED', 'CANCELLED'].includes(status);
});

const cancelOrderLabel = computed(() =>
  isOfflinePaidOrder.value && offlineRefundCap.value <= 0
    ? '取消赠送订单'
    : '取消订单',
);

/**
 * 「取消订单」按钮：线上单保持原样；线下单交给「线下退款并取消」。
 *
 * 线下单若还显示这个按钮，后端虽然会 400 挡住，但页面等于给了错误入口。
 */
const canCancelOrder = computed(
  () =>
    isAdmin.value &&
    isCancellableStatus.value &&
    // 线下单有实收金额时必须走「线下退款并取消」；
    // 0 元赠送单没有款可退，允许直接取消。
    (!isOfflinePaidOrder.value || offlineRefundCap.value <= 0),
);

/** 下单时填写的过敏 vs 档案最新：两份口径不同，必须分开显示并提示差异 */
const allergyComparison = computed(() =>
  compareDogProfileAllergies(order.value?.dog, [
    ...(order.value?.allergies || []),
    ...parseAllergyText(order.value?.allergyText),
  ]),
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

/**
 * 多份订单的批量交付（2026-10-21 · 多份履约第二阶段）。
 *
 * 与单份交付是两条路：
 *   · 1 份订单继续沿用 `selectedCandidateId` + `deliverRecipe`；
 *   · N 份订单必须勾满 N 份，再调一次 `deliver-batch`。
 * 份数判断全部收在 `constants/customRecipeOrder.ts` 的纯函数里，
 * 页面只负责绑定状态，避免"按钮禁用一个规则、函数里又写另一个"。
 */
const selectedBatchRecipeIds = ref<string[]>([]);
const batchDelivering = ref(false);
const batchDeliverError = ref('');

const multiRecipeQuantity = computed(() =>
  normalizeRecipeQuantity(order.value?.recipeQuantity),
);
const isMultiRecipeOrder = computed(() =>
  isMultiRecipeOrderQuantity(order.value?.recipeQuantity),
);
const multiRecipeProgressText = computed(() =>
  buildMultiRecipeProgressText(
    multiRecipeQuantity.value,
    candidates.value.length,
  ),
);
const canSubmitBatchDelivery = computed(() =>
  isBatchDeliveryReady(
    selectedBatchRecipeIds.value.length,
    multiRecipeQuantity.value,
  ),
);

/** 勾满 N 份后，未勾选的候选要禁用；已勾选的始终可点（能取消） */
const isBatchRecipeSelectable = (recipeId: string) =>
  canSelectBatchRecipe(
    recipeId,
    selectedBatchRecipeIds.value,
    multiRecipeQuantity.value,
  );

const loadRecipeCandidates = async () => {
  if (!props.orderId) return;
  candidatesLoading.value = true;
  try {
    const list = await customRecipeApi.listRecipeCandidates(props.orderId);
    candidates.value = Array.isArray(list) ? list : [];

    // 批量勾选只保留仍在本单候选里的：切订单/刷新后不能让上一单的 id 混进来
    selectedBatchRecipeIds.value = isMultiRecipeOrder.value
      ? selectedBatchRecipeIds.value.filter((recipeId) =>
          candidates.value.some((item) => item.recipeId === recipeId),
        )
      : [];

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

/**
 * 一次性交付 N 份（多份订单首次交付）。
 *
 * 只调一次 `deliver-batch`：后端在一个事务里写整批，少交/多交都会被拒绝。
 * 份数不对时**先不发请求**，把具体差几份写在页面上 —— 员工不用去猜按钮为什么灰。
 */
const deliverBatchRecipes = async () => {
  const orderId = order.value?.orderId;
  if (!orderId) return;

  const total = multiRecipeQuantity.value;
  const recipeIds = [...selectedBatchRecipeIds.value];

  if (!isBatchDeliveryReady(recipeIds.length, total)) {
    batchDeliverError.value =
      `本单需要交付 ${total} 份食谱，当前已选 ${recipeIds.length} 份；` +
      `请勾满 ${total} 份再提交`;
    ElMessage.warning(batchDeliverError.value);
    return;
  }

  const dogName = order.value?.dog?.name || '这只狗';
  const amount = Number(order.value?.amount || 0);
  const selectedNames = candidates.value
    .filter((item) => recipeIds.includes(item.recipeId))
    .map((item) => `《${item.name}》`)
    .join('、');

  try {
    await ElMessageBox.confirm(
      h('div', [
        h('p', `将把以下 ${total} 份食谱一次性交付给「${dogName}」：`),
        h('p', selectedNames),
        h('p', `订单号：${orderId}　金额：¥${amount}`),
        h('p', '交付后会给顾客发送一条通知，订单转为「已交付」。'),
      ]),
      `确认一次性交付 ${total} 份`,
      {
        confirmButtonText: `确认交付 ${total} 份`,
        cancelButtonText: '再想想',
      },
    );

    batchDelivering.value = true;
    batchDeliverError.value = '';

    const result = await customRecipeApi.deliverBatch(orderId, recipeIds);

    ElMessage.success(
      `已一次性交付 ${result?.recipeCount ?? total} 份食谱，顾客会收到一条通知`,
    );

    selectedBatchRecipeIds.value = [];
    await loadOrderDetail();
    emit('refresh');
  } catch (error) {
    // 点「再想想」不是失败，不能留下红色报错
    if (isUserCancel(error)) return;

    // 后端拒绝原因（份数不符 / 食谱不属于本单 / 已交付）原样留在页面上，
    // 同时交给统一 toast 处理；网络类错误也有可读的兜底文案。
    batchDeliverError.value = getApiErrorMessage(
      error,
      '批量交付失败，请重试',
    );
    toastApiError(error, '批量交付失败，请重试', (message) =>
      ElMessage.error(message),
    );
  } finally {
    batchDelivering.value = false;
  }
};

// 改了勾选就清掉上一次的报错，避免「份数不对」一直挂在页面上
watch(selectedBatchRecipeIds, () => {
  batchDeliverError.value = '';
});

// 生命周期
onMounted(() => {
  // 状态与目标的中文都来自选项字典（与订单详情并行加载，不阻塞）
  ensureStatusOptions();
  ensureGoalOptions();
  loadOrderDetail();
});

watch(
  () => props.orderId,
  () => {
    dogBreedName.value = '';
    loadOrderDetail();
  },
);

/**
 * 通知状态的中文（2026-10-18 · 需求 2.8.6「通知是否发出」）。
 *
 * ⚠️ **PENDING 要明确写成"未发出"**，不能写"待发送" ——
 * 顾客没点过订阅授权时，订阅消息**永远发不出去**，
 * 写"待发送"会让老板以为再等等就会发。
 */
function notifyStatusText(status: string | null): string {
  switch (status) {
    case 'SENT':
      return '✓ 通知已发出';
    case 'FAILED':
      return '✗ 通知发送失败';
    case 'SKIPPED':
      return '— 未申请订阅，未发通知';
    case 'PENDING':
      return '— 通知未发出';
    default:
      return '— 无通知记录';
  }
}

// 方法
/**
 * 订单详情没带品种，从狗狗档案补一次。
 * 品种只是基础资料，拉取失败就显示「未填写」，不能影响订单本身的展示。
 */
const loadDogBreedName = async (dogId?: string) => {
  dogBreedName.value = '';
  if (!dogId) return;
  try {
    const detail = await dogApi.getDetail(String(dogId));
    // 加载期间切了订单：旧请求的结果不能覆盖新订单
    if (order.value?.dog?.id !== dogId) return;
    dogBreedName.value = String(
      detail?.profile?.customBreedName || detail?.profile?.breedName || '',
    ).trim();
  } catch {
    if (order.value?.dog?.id === dogId) dogBreedName.value = '';
  }
};

const loadDesignWorkspace = async () => {
  designWorkspace.value = null;
  if (!props.orderId) return;
  designWorkspaceLoading.value = true;
  try {
    designWorkspace.value = await orderRecipeDesignApi.getWorkspace(
      props.orderId,
    );
  } catch {
    // 工作台接口失败时仍保留旧交付入口，不能把订单页整块弄没
    designWorkspace.value = null;
  } finally {
    designWorkspaceLoading.value = false;
  }
};

const loadOrderDetail = async () => {
  loading.value = true;
  batchDeliverError.value = '';
  try {
    order.value = await customRecipeApi.getOrderDetail(props.orderId);
    void loadDogBreedName(order.value?.dog?.id);
    // 交付历史单独拉（详情里只有最新一版）；失败不影响详情展示
    try {
      const history = await customRecipeApi.getOrderDeliveries(props.orderId);
      deliveryHistory.value = history?.items ?? [];
    } catch {
      deliveryHistory.value = [];
    }
    // 状态决定能不能交付（已付款/制作中/已交付），详情到手后再拉候选
    if (canDeliverCustomRecipe(order.value?.status)) {
      // 先看本单有没有「订单设计」槽位：有槽位就走新工作台，没有才保留旧交付
      await loadDesignWorkspace();
      await loadRecipeCandidates();
    } else {
      designWorkspace.value = null;
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
 * 打开「本单食谱设计」工作台（2026-10-22 起改入口）。
 *
 * 以前是带 dogId 跳旧设计器再让员工手工新建系列；现在每单 N 份各有独立槽位，
 * 工作台里从模板/空白新建、逐份加入待提交、管理员最终一次交付。
 *
 * 2026-10-21：打开即代表进入制作 ——
 * 已付款（PAID）的单先改成 IN_PROGRESS，成功后才开窗口；
 * 改状态失败就留在订单页并报错，不能让人以为已经在做了。
 */
const openInDesigner = async () => {
  if (openingDesigner.value) return;

  const dogId = order.value?.dog?.id;
  if (!dogId) {
    ElMessage.warning('这笔订单没有关联的狗狗档案');
    return;
  }
  if (!canStartDesign.value) {
    ElMessage.warning('订单未付款，付款后才能开始设计');
    return;
  }

  const orderId = order.value!.orderId;
  /**
   * 必须在点击的同步栈里先开空窗口。
   * 下面要 await 改订单状态；等完再 window.open，浏览器会把它当成
   * 非用户触发的弹窗直接拦掉，按钮看起来"点了没反应"。
   */
  const designerWindow = window.open('', '_blank');
  openingDesigner.value = true;
  try {
    if (order.value?.status === 'PAID') {
      await customRecipeApi.updateStatus(orderId, 'IN_PROGRESS');
      // 只改本地状态即可：候选交付列表不受影响，同时避免多等一次详情请求
      if (order.value?.orderId === orderId) order.value.status = 'IN_PROGRESS';
      emit('refresh');
    }

    const url = `/order-design/${encodeURIComponent(orderId)}`;
    if (designerWindow) {
      designerWindow.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  } catch (error) {
    designerWindow?.close();
    toastApiError(error, '转入制作失败', (message) => ElMessage.error(message));
  } finally {
    openingDesigner.value = false;
  }
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
  /**
   * 线下收款单不能走这里（2026-10-21 · 代客订单 Task 5）。
   *
   * 按钮已换成「线下退款并取消」，这里再兜一层：
   * 旧页面缓存/误触都不能让线下单去调微信原路退款。
   */
  if (isOfflinePaidOrder.value) {
    ElMessage.warning(
      '线下收款订单请使用「线下退款并取消」登记，系统不会调用微信退款',
    );
    return;
  }

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

/**
 * 线下退款默认方式：优先跟收款方式一致（线上微信收的就线下微信退）。
 *
 * 收款渠道缺失/异常时回落到线下微信 —— 绝不能回落到 WECHAT_ONLINE，
 * 那会让"退款方式"看起来像原路退回。
 */
const resolveDefaultOfflineRefundMethod = (): string => {
  const channel = String(order.value?.paymentChannel || '').toUpperCase();
  if (['OFFLINE_WECHAT', 'OFFLINE_ALIPAY', 'OTHER'].includes(channel)) {
    return channel;
  }
  return 'OFFLINE_WECHAT';
};

/**
 * 打开「线下退款并取消」弹窗（2026-10-21 · 代客定制食谱订单 Task 5）。
 *
 * 金额默认 = 实收金额（`actualPaidAmount`，缺失时用订单金额），
 * 方式默认 = 原收款方式。管理员核对后可以改小（部分退款），但不能超过实收。
 */
const openOfflineRefundDialog = () => {
  offlineRefundForm.value = {
    amount: offlineRefundCap.value,
    method: resolveDefaultOfflineRefundMethod(),
    note: '',
  };
  offlineRefundDialogVisible.value = true;
};

/**
 * 提交线下退款登记。
 *
 * 这是**手工退款**：钱已经由管理员在线下退给顾客，这里只是登记并取消订单。
 * 系统不会调用微信退款 —— 线下收款在微信里没有交易可退。
 *
 * 失败原样提示（未确认收款 / 金额超过实收 / 已经取消或登记过），
 * 绝不把失败吞成成功。
 */
const submitOfflineRefund = async () => {
  if (offlineRefunding.value) return;

  const amount = Number(offlineRefundForm.value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    ElMessage.warning('退款金额必须大于 0');
    return;
  }
  if (offlineRefundCap.value > 0 && amount > offlineRefundCap.value) {
    ElMessage.warning(
      `退款金额不能超过实收金额 ¥${offlineRefundCap.value.toFixed(2)}`,
    );
    return;
  }

  try {
    offlineRefunding.value = true;
    const result = await customRecipeApi.registerOfflineRefund(
      order.value!.orderId,
      {
        amount,
        method: offlineRefundForm.value.method as OfflineRefundMethod,
        note: offlineRefundForm.value.note.trim() || undefined,
      },
    );

    offlineRefundDialogVisible.value = false;
    ElMessage.success(
      `已登记线下退款 ¥${Number(result?.amount ?? amount).toFixed(2)}，订单已取消`,
    );
    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '线下退款登记失败', (message) =>
      ElMessage.error(message),
    );
  } finally {
    offlineRefunding.value = false;
  }
};

/**
 * 手工补退款（2026-10-21）。
 *
 * 生产单 CR202610201196：修复前取消"制作中"的单不退钱，
 * 取消后 `refundStatus` 仍为 null；而订单已取消，取消按钮也没了。
 * 这个动作就是给这类单补发起一次微信原路退款。
 *
 * 只对管理员可见（`canManualRefund` 里已判过），后端还有 AdminGuard。
 * 退款是否重复由后端幂等处理：已成功/处理中的会回 `reused=true`，
 * 页面据此说"这笔早就退过了"，而不是假装又退了一笔。
 */
const manualRefund = async () => {
  if (manualRefunding.value) return;

  const total = Number(order.value?.amount);
  const amountText = Number.isFinite(total) && total > 0 ? `¥${total}` : '订单金额';

  try {
    const { value } = await ElMessageBox.prompt(
      `该订单已取消，但退款尚未完成。确认向微信发起${amountText}的原路退款？钱会退回顾客的付款账户。`,
      '补退款',
      {
        confirmButtonText: '确认退款',
        cancelButtonText: '再想想',
        inputPlaceholder: '补退款原因（会记录在订单里）',
        inputValue: '客服补退款',
      },
    );

    manualRefunding.value = true;
    const result = await customRecipeApi.refundOrder(
      order.value!.orderId,
      value || '客服补退款',
    );

    const status = String(result?.status || '').toUpperCase();
    const statusText =
      getCustomRecipeRefundStatusText(status) || status || '已提交';

    if (result?.reused) {
      ElMessage.success(`这笔退款此前已发起，当前状态：${statusText}`);
    } else if (['SUCCESS', 'PROCESSING', 'PENDING'].includes(status)) {
      ElMessage.success(`补退款已发起：${statusText}`);
    } else {
      /**
       * ABNORMAL / CLOSED / FAILED：钱还没退成，**不能报成功**。
       * 后台能做的下一步是去微信商户平台核查，所以提示要指到那里。
       */
      ElMessage.warning(`退款状态：${statusText}，请到微信商户平台核查后再答复顾客`);
    }

    emit('refresh');
    await loadOrderDetail();
  } catch (error) {
    toastApiError(error, '补退款失败', (message) => ElMessage.error(message));
  } finally {
    manualRefunding.value = false;
  }
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

/**
 * 年龄：一岁以内必须显示月份。
 *
 * 此前只返回整岁，7 个月的幼犬显示成 `0`，设计时会把幼犬当成年犬。
 * 满一岁后同时给年和月（如 `1岁3个月`），比只给 `1` 更有用。
 */
const calculateAge = (birthday?: string) => {
  if (!birthday) return '-';
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return '-';

  const now = new Date();
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return '未出生';
  if (months === 0) return '未满1个月';
  if (months < 12) return `${months}个月`;

  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths > 0 ? `${years}岁${restMonths}个月` : `${years}岁`;
};

/**
 * 复制到剪贴板：优先用 Clipboard API，失败时退回 textarea + execCommand。
 * 不新增依赖；后台常在内网/非 HTTPS 环境打开，Clipboard API 不一定可用。
 */
const fallbackCopyText = (text: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('execCommand copy failed');
};

const copyToClipboard = async (value: string | null | undefined, label: string) => {
  const text = String(value || '').trim();
  if (!text) {
    ElMessage.warning(`没有可复制的${label}`);
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopyText(text);
      }
    } else {
      fallbackCopyText(text);
    }
    ElMessage.success(`${label}已复制`);
  } catch {
    ElMessage.error('复制失败，请手动选择复制');
  }
};

const copyOrderNo = () => copyToClipboard(order.value?.orderId, '订单号');
const copyPhone = () => copyToClipboard(order.value?.customer?.phone, '手机号');

/** openid 只用于核对账号，不把完整值展示出来 */
const maskOpenid = (openid?: string | null) => {
  if (!openid) return '未绑定';
  const text = String(openid);
  if (text.length <= 8) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
};

/**
 * 定制目标的中文来自**选项字典**（2026-10-16 批次 5.1）。
 * 后台这边查不到时**如实显示原始码** —— 自己人看到原始码才知道"后端加了新目标"，
 * 与顾客端要兜成中文不一样。
 */
const { ensure: ensureGoalOptions, labelOf: goalLabel } = useOptionSet(
  CUSTOM_RECIPE_GOAL_SET,
);

const getGoalText = (goal?: string) => {
  if (!goal) return '-';
  return goalLabel(goal) || goal;
};
</script>

<style scoped>
.order-detail {
  padding: 20px;
}

.detail-container {
  display: block;
}

/* 交付区接在订单信息下方，不再单独占右栏；订单详情只保留一条纵向阅读路径 */
.recipe-creation-section {
  margin-top: 16px;
}

.delivery-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.delivery-toolbar__label {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.design-workspace-note {
  flex: 1;
  text-align: right;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.order-design-alert {
  margin-bottom: 12px;
}

.order-design-alert__action {
  margin-top: 4px;
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

.info-item label {
  font-weight: 500;
  color: #666;
}

.info-item span {
  color: #333;
}

.internal-customer-tag {
  margin-left: 6px;
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

.copy-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.copy-value .mono {
  text-align: left;
}

.design-summary {
  padding: 14px 16px;
  background: #fff;
  border-radius: 6px;
  margin-bottom: 20px;
}

.design-summary__text {
  margin: 0 0 10px;
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}

.design-links {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.empty-text {
  color: #999;
}

.notes-section {
  margin-top: 20px;
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

.candidate-group :deep(.el-radio),
.candidate-group :deep(.el-checkbox) {
  display: flex;
  align-items: center;
  width: 100%;
  height: auto;
  margin-right: 0;
  padding: 10px 12px;
  background: #fff;
  border-radius: 6px;
}

.candidate-group :deep(.el-radio__label),
.candidate-group :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
}

.multi-recipe-progress {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0 0 12px;
  font-size: 13px;
  color: #606266;
}

.multi-recipe-progress__designed {
  font-weight: 600;
  color: #303133;
}

.multi-recipe-progress__selected {
  color: #409eff;
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

.delivery-error {
  margin: 10px 0 0;
  font-size: 13px;
  color: #f56c6c;
  line-height: 1.6;
}

.admin-only-tip {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

/* 补退款（2026-10-21）：已取消但钱没退成时给管理员的提示 */
.manual-refund-tip {
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.6;
}

/* ---------- 线下退款（2026-10-21 · 代客订单 Task 5）---------- */

.offline-refund-tip {
  margin: 8px 0 0;
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.6;
}

.offline-refund-form {
  margin-top: 16px;
}

.offline-refund-amount {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.offline-refund-cap {
  font-size: 13px;
  color: #909399;
}

/* ---------- 档案更新提示与时效 ---------- */

.profile-updated-alert {
  margin-bottom: 12px;
}

.source-note {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

/* 未付款不能开始设计 */
.design-gate-tip {
  margin-left: 8px;
  font-size: 12px;
  color: #e6a23c;
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

/* ===== 交付历史（2026-10-18 · 需求 2.8.6）===== */
.delivery-history {
  grid-column: 1 / -1;
}

.delivery-history__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.delivery-history__row {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  color: #4b5563;
}

.delivery-history__version {
  min-width: 110px;
  font-weight: 600;
  color: #111827;
}

.delivery-history__time {
  min-width: 150px;
}

.delivery-history__notify {
  color: #6b7280;
}
</style>
