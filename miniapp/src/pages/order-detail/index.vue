<template>
  <view class="order-detail-page">
    <view v-if="order" class="order-detail">
      <!-- 订单类型标签 -->
      <view class="order-type-tag">鲜食制作订单</view>

      <!-- 订单进度条 -->
      <view class="progress-section">
        <OrderProgressBar :status="order.status" />
      </view>

      <view class="section order-center-section">
        <view class="order-center-header">
          <view class="order-center-title-block">
            <text class="order-center-title">{{ orderCenterTitle }}</text>
            <text class="order-center-subtitle"
              >微信订单中心可查看的商品订单详情</text
            >
          </view>
          <text
            class="order-center-status"
            :style="{ color: getStatusColor(order.status) }"
          >
            {{ getStatusText(order.status) }}
          </text>
        </view>

        <view class="order-center-goods">
          <view class="goods-main">
            <image
              v-if="orderCenterCover"
              class="goods-cover"
              :src="orderCenterCover"
              mode="aspectFill"
            />
            <view v-else class="goods-cover-placeholder">
              <text>{{ orderCenterTitle.charAt(0) }}</text>
            </view>
            <view class="goods-text">
              <text class="goods-name">{{ orderCenterTitle }}</text>
              <text class="goods-desc">{{ orderCenterDescription }}</text>
            </view>
          </view>
          <view class="goods-amount-row">
            <text class="goods-amount-label">实付/应付金额</text>
            <text class="goods-amount-value"
              >¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text
            >
          </view>
        </view>

        <view class="order-center-grid">
          <view class="order-center-cell">
            <text class="cell-label">订单编号</text>
            <text class="cell-value">{{ order.id }}</text>
          </view>
          <view class="order-center-cell">
            <text class="cell-label">下单时间</text>
            <text class="cell-value">{{
              formatDateTime(order.createdAt)
            }}</text>
          </view>
          <view class="order-center-cell">
            <text class="cell-label">购买账号</text>
            <text class="cell-value">{{ customerDisplayName }}</text>
          </view>
          <view class="order-center-cell">
            <text class="cell-label">联系电话</text>
            <text class="cell-value">{{ customerPhoneText }}</text>
          </view>
        </view>
      </view>

      <!-- 订单基本信息 -->
      <view class="section info-section">
        <view class="section-title">基本信息</view>
        <view class="info-row">
          <text class="label">订单编号:</text>
          <text class="value order-id">{{ formatOrderId(order.id) }}</text>
          <button class="btn-copy" @tap="copyOrderId">复制</button>
        </view>
        <view class="info-row">
          <text class="label">订单状态:</text>
          <text
            class="value status"
            :style="{ color: getStatusColor(order.status) }"
          >
            {{ getStatusText(order.status) }}
          </text>
        </view>
        <view class="info-row">
          <text class="label">下单时间:</text>
          <text class="value">{{ formatDateTime(order.createdAt) }}</text>
        </view>
        <view class="info-row" v-if="order.targetProductionDate">
          <text class="label">目标制作日期:</text>
          <text class="value">{{
            formatDate(order.targetProductionDate)
          }}</text>
          <picker
            v-if="canEditDate"
            mode="date"
            :value="selectedDate"
            :start="minDateStr"
            @change="onDateSelected"
          >
            <view class="btn-edit">修改</view>
          </picker>
        </view>
        <view class="info-row address-row">
          <text class="label">收货地址:</text>
          <view class="address-content">
            <template v-if="order.address">
              <text class="value address-value">
                {{ order.address.recipientName }}
                {{ getOrderAddressPhone(order.address) }}
                {{ getOrderAddressRegionText(order.address) }}
                {{ getOrderAddressDetail(order.address) }}
              </text>
              <view class="address-actions">
                <button class="btn-copy-address" @tap="copyAddress">
                  复制
                </button>
                <button
                  v-if="canEditAddress"
                  class="btn-edit"
                  @tap="changeAddress"
                >
                  更换
                </button>
                <button
                  v-if="canEditAddress && isStaffOrAdmin"
                  class="btn-edit btn-edit-secondary"
                  @tap="openEditAddressForm"
                >
                  编辑地址
                </button>
              </view>
            </template>
            <template v-else>
              <text class="value address-value address-empty-text"
                >暂未录入收货地址</text
              >
              <view v-if="canEditAddress" class="address-actions">
                <button
                  v-if="isStaffOrAdmin"
                  class="btn-edit"
                  @tap="openAddressSelect"
                >
                  选择已有地址
                </button>
                <button
                  v-if="isStaffOrAdmin"
                  class="btn-edit"
                  @tap="openCreateAddressForm"
                >
                  录入新地址
                </button>
                <button v-else class="btn-edit" @tap="changeAddress">
                  添加地址
                </button>
              </view>
              <text v-else class="address-lock-hint">已发货后不可修改</text>
            </template>
          </view>
        </view>
        <view class="info-row">
          <text class="label">订单金额:</text>
          <text class="value amount"
            >¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text
          >
        </view>
      </view>

      <view class="section buyer-section">
        <view class="section-title">购买人与配送</view>
        <view class="buyer-card">
          <view class="buyer-row">
            <text class="buyer-label">购买人</text>
            <text class="buyer-value">{{ customerDisplayName }}</text>
          </view>
          <view class="buyer-row">
            <text class="buyer-label">联系方式</text>
            <text class="buyer-value">{{ customerPhoneText }}</text>
          </view>
          <view class="buyer-row">
            <text class="buyer-label">收货人</text>
            <text class="buyer-value">{{
              order.address?.recipientName || '-'
            }}</text>
          </view>
          <view class="buyer-row">
            <text class="buyer-label">收货电话</text>
            <text class="buyer-value">{{
              order.address ? getOrderAddressPhone(order.address) : '-'
            }}</text>
          </view>
          <view class="buyer-row address-line">
            <text class="buyer-label">收货地址</text>
            <text class="buyer-value">{{ fullAddressText }}</text>
          </view>
          <view class="buyer-row">
            <text class="buyer-label">预计制作</text>
            <text class="buyer-value">{{
              formatDate(order.targetProductionDate)
            }}</text>
          </view>
          <view class="buyer-row">
            <text class="buyer-label">预计发货</text>
            <text class="buyer-value">{{
              formatDate(order.estimatedShippingDate)
            }}</text>
          </view>
        </view>
      </view>

      <view class="section merchant-note-section">
        <view class="section-title">商家说明</view>
        <view class="merchant-note-list">
          <view class="merchant-note-item">
            <text class="merchant-note-label">订单备注</text>
            <text class="merchant-note-value">{{
              customerRequirementText
            }}</text>
          </view>
          <view class="merchant-note-item">
            <text class="merchant-note-label">配送说明</text>
            <text class="merchant-note-value">{{
              orderDetailDeliveryNote
            }}</text>
          </view>
          <view class="merchant-note-item">
            <text class="merchant-note-label">售后说明</text>
            <text class="merchant-note-value">{{
              orderDetailAftersaleNote
            }}</text>
          </view>
          <view
            class="merchant-note-item"
            v-if="customerServiceConfig.orderDetailMerchantNote"
          >
            <text class="merchant-note-label">商家补充</text>
            <text class="merchant-note-value">{{
              customerServiceConfig.orderDetailMerchantNote
            }}</text>
          </view>
          <view
            class="merchant-note-item"
            v-if="customerServiceConfig.welcomeMessage"
          >
            <text class="merchant-note-label">客服提示</text>
            <text class="merchant-note-value">{{
              customerServiceConfig.welcomeMessage
            }}</text>
          </view>
        </view>
      </view>

      <view
        v-if="shouldShowFinancialSummary"
        class="section settlement-section"
      >
        <view class="section-title">生产结算</view>
        <view class="settlement-card" :class="settlementAdjustmentClass">
          <view class="settlement-header">
            <text class="settlement-title">{{ formatAdjustmentText() }}</text>
            <text class="settlement-status">{{
              orderFinancialSummary?.settlementStatus === 'SETTLED'
                ? '已结算'
                : '待结算'
            }}</text>
          </view>
          <text class="settlement-desc">{{ settlementDescription }}</text>
          <view
            v-if="orderFinancialSummary?.latestSettlement"
            class="settlement-metrics"
          >
            <view class="settlement-metric">
              <text class="metric-label">计划成品</text>
              <text class="metric-value"
                >{{
                  Math.round(
                    orderFinancialSummary.latestSettlement.plannedOutputG,
                  )
                }}g</text
              >
            </view>
            <view class="settlement-metric">
              <text class="metric-label">实际成品</text>
              <text class="metric-value"
                >{{
                  Math.round(
                    orderFinancialSummary.latestSettlement.actualOutputG,
                  )
                }}g</text
              >
            </view>
            <view class="settlement-metric">
              <text class="metric-label">成品缺口</text>
              <text class="metric-value"
                >{{
                  Math.round(orderFinancialSummary.latestSettlement.shortageG)
                }}g</text
              >
            </view>
          </view>
          <view
            v-if="visibleSettlementAdjustments.length > 0"
            class="settlement-adjustments"
          >
            <view
              v-for="adjustment in visibleSettlementAdjustments"
              :key="adjustment.id"
              class="settlement-adjustment-row"
            >
              <view class="adjustment-main">
                <text class="adjustment-reason">{{ adjustment.reason }}</text>
                <text class="adjustment-status">{{
                  getAdjustmentStatusText(adjustment.status)
                }}</text>
              </view>
              <text
                class="adjustment-amount"
                :class="adjustment.amount > 0 ? 'positive' : 'negative'"
              >
                {{
                  formatSettlementAdjustmentAmount(
                    adjustment.amount,
                    adjustment.status,
                  )
                }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="isStaffOrAdmin" class="section remark-section">
        <view class="section-title">管理员备注</view>
        <textarea
          v-model="remarkDraft"
          class="remark-textarea"
          maxlength="200"
          auto-height
          placeholder="填写分装要求、制作顺序、特殊提醒"
        />
        <view class="remark-meta">
          <text class="remark-hint"
            >仅员工/管理员可见，会同步到生产制作单和打印版</text
          >
          <text class="remark-count">{{ remarkDraft.length }}/200</text>
        </view>
        <view class="remark-actions">
          <button
            class="remark-btn secondary"
            :disabled="savingAdminRemark || !canClearAdminRemark"
            @tap="clearAdminRemark"
          >
            清空
          </button>
          <button
            class="remark-btn primary"
            :disabled="savingAdminRemark || !isAdminRemarkDirty"
            @tap="saveAdminRemark"
          >
            {{ savingAdminRemark ? '保存中...' : '保存备注' }}
          </button>
        </view>
      </view>

      <!-- 待付款状态下的在线支付 -->
      <view
        class="section payment-guide-section"
        v-if="order.status === 'PENDING_PAYMENT'"
      >
        <view class="section-title">订单支付</view>

        <view class="payment-guide-card">
          <view class="guide-header">
            <text class="guide-title">微信支付</text>
          </view>

          <view class="order-amount-info">
            <text class="amount-label">待支付金额</text>
            <text class="amount-value"
              >¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text
            >
          </view>

          <view
            class="payment-deadline-card"
            v-if="order.paymentAutoCloseEnabled"
          >
            <text class="deadline-label">剩余支付时间</text>
            <text class="deadline-value">{{ paymentCountdownText }}</text>
          </view>

          <view class="order-id-copy">
            <text class="order-id-label">订单号:</text>
            <text class="order-id-value">{{ formatOrderId(order.id) }}</text>
            <button class="btn-copy-order-id" @tap="copyOrderId">
              复制订单号
            </button>
          </view>

          <view class="payment-tip">
            <text class="tip-text"
              >支付完成后订单会由微信支付回调确认，请稍后刷新查看状态。</text
            >
          </view>
        </view>
      </view>

      <view class="section service-section">
        <view class="section-title">客服</view>
        <button
          v-if="customerServiceConfig.enabled"
          class="btn-service-contact"
          open-type="contact"
          show-message-card="true"
          :send-message-title="customerServiceOrderTitle"
          :send-message-path="customerServiceOrderPath"
        >
          联系客服
        </button>
        <button
          v-else
          class="btn-service-contact secondary"
          @tap="contactService"
        >
          联系客服
        </button>
      </view>

      <!-- 商品信息 -->
      <view class="section items-section">
        <view class="section-title">商品信息</view>

        <!-- 按狗狗分组 -->
        <view
          v-for="group in groupedItems"
          :key="group.dogId"
          class="dog-group"
        >
          <!-- 狗狗信息卡片 -->
          <view class="dog-info-card">
            <view class="dog-info">
              <text class="dog-name">{{ group.dogName }}</text>
              <text
                class="dog-gender"
                :class="group.dogGender === 'MALE' ? 'male' : 'female'"
              >
                {{ group.dogGender === 'MALE' ? '公' : '母' }}
              </text>
              <text class="dog-divider">|</text>
              <text class="dog-detail">{{ group.dogBreedName }}</text>
              <text class="dog-divider">|</text>
              <text class="dog-detail">{{ group.dogWeightKg }}kg</text>
            </view>
          </view>

          <!-- 订单商品列表 -->
          <view
            v-for="item in group.items"
            :key="item.id"
            class="order-item-card"
          >
            <!-- 第1层：食谱基本信息 -->
            <view class="item-header">
              <text class="recipe-name">{{ item.recipeSnapshot?.name }}</text>
              <text class="recipe-version"
                >v{{ item.recipeSnapshot?.version }}</text
              >
              <text class="nutrition-standard">{{
                getNutritionStandardLabel(
                  item.recipeSnapshot?.nutrition_standard || '',
                )
              }}</text>
            </view>

            <!-- 第2层：订购信息 -->
            <view class="package-info-card">
              <view class="package-row">
                <text class="package-label">总净重:</text>
                <text class="package-value"
                  >{{ Math.round(item.quantityG) }}g</text
                >
              </view>
              <view
                class="package-row"
                v-if="item.packagePlan && item.packagePlan.length > 0"
              >
                <text class="package-label">分装明细:</text>
                <text class="package-value">{{ formatPackagePlan(item) }}</text>
              </view>
              <template v-else>
                <view class="package-row">
                  <text class="package-label">总袋数:</text>
                  <text class="package-value">{{ item.packageCount }}袋</text>
                </view>
                <view class="package-row">
                  <text class="package-label">每袋重量:</text>
                  <text class="package-value">{{ item.packageSpecG }}g/袋</text>
                </view>
              </template>
              <view class="package-row" v-if="item.ingredientSourcePlan">
                <text class="package-label">原料方案:</text>
                <text class="package-value">{{
                  formatIngredientSourcePlan(item.ingredientSourcePlan)
                }}</text>
              </view>
              <view
                class="package-row"
                v-if="order.amountTotal && getTotalPackageCount()"
              >
                <text class="package-label">单价:</text>
                <text class="package-value price"
                  >¥{{ calculatePricePerPackage() }}/袋</text
                >
              </view>
            </view>

            <!-- 第4层：原料清单（可展开/收起） -->
            <view
              class="ingredients-section"
              v-if="
                item.recipeSnapshot?.items &&
                item.recipeSnapshot.items.length > 0
              "
            >
              <view
                class="ingredients-header"
                @tap="toggleIngredients(item.id)"
              >
                <view class="ingredients-title-row">
                  <text class="ingredients-title">原料清单</text>
                  <text class="ingredients-count"
                    >（共{{ item.recipeSnapshot.items.length }}种）</text
                  >
                </view>
                <text class="expand-icon">{{
                  expandedIngredients[item.id] ? '收起' : '展开'
                }}</text>
              </view>

              <view
                class="ingredients-content"
                :class="{ expanded: expandedIngredients[item.id] }"
                v-if="expandedIngredients[item.id]"
              >
                <view
                  v-for="(category, idx) in getGroupedIngredients(
                    item.recipeSnapshot.items,
                  )"
                  :key="idx"
                  class="ingredient-category"
                >
                  <view class="category-title"
                    >【{{ category.typeName }}】</view
                  >
                  <view
                    v-for="(ingredient, iIdx) in category.items"
                    :key="iIdx"
                    class="ingredient-item"
                    @longpress="showIngredientDetail(ingredient, item)"
                  >
                    <text class="ingredient-text">{{
                      formatIngredientDisplay(ingredient, item)
                    }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 原料照片（所有状态下都显示，如果有照片的话） -->
      <view
        class="section production-photos-section"
        v-if="
          order.productionPhotos && order.productionPhotos.photos.length > 0
        "
      >
        <view class="section-title-row">
          <view class="section-title-left">
            <text class="section-title-text">原料照片</text>
            <text class="photos-time">{{
              formatDateTime(order.productionPhotos.uploadedAt)
            }}</text>
          </view>
          <button
            v-if="shareToken"
            class="btn-share-photos"
            open-type="share"
            data-share-type="photos"
          >
            分享照片
          </button>
        </view>

        <view class="production-photos">
          <view class="photos-grid">
            <image
              v-for="(photo, idx) in order.productionPhotos.photos"
              :key="idx"
              :src="photo"
              mode="aspectFill"
              class="production-photo-item"
              @tap="previewProductionPhotos(idx)"
            />
          </view>
          <view class="photos-hint">
            <text>员工在制作完成后上传的原料照片，供您验收</text>
          </view>
        </view>
      </view>

      <!-- 售后服务（付款后到完成前后均可申请） -->
      <view
        class="section aftersale-section"
        v-if="canApplyAftersale(order.status)"
      >
        <view class="section-title">售后服务</view>
        <view class="aftersale-buttons">
          <button
            v-if="canApplyRefund(order.status)"
            class="btn-aftersale"
            @tap="applyAftersaleType('REFUND')"
          >
            <text class="btn-text">申请退款</text>
          </button>
          <button
            v-if="canApplyRemake(order.status)"
            class="btn-aftersale"
            @tap="applyAftersaleType('REMAKE')"
          >
            <text class="btn-text">申请重做</text>
          </button>
          <button
            v-if="canApplyComplaint(order.status)"
            class="btn-aftersale"
            @tap="applyAftersaleType('COMPLAINT')"
          >
            <text class="btn-text">投诉建议</text>
          </button>
        </view>
      </view>

      <!-- 售后信息（AFTERSALE状态显示） -->
      <view
        class="section aftersale-info-section"
        v-if="order.status === 'AFTERSALE'"
      >
        <view class="section-title">售后信息</view>
        <view class="aftersale-info">
          <view class="info-row">
            <text class="label">售后类型:</text>
            <text class="value">{{
              getAftersaleTypeText(order.aftersaleType)
            }}</text>
          </view>
          <view class="info-row">
            <text class="label">申请时间:</text>
            <text class="value">{{
              formatDateTime(order.aftersaleSince)
            }}</text>
          </view>
          <view class="info-row">
            <text class="label">售后原因:</text>
            <text class="value">{{ order.aftersaleReason }}</text>
          </view>
          <view
            class="aftersale-photos"
            v-if="order.aftersalePhotos && order.aftersalePhotos.length > 0"
          >
            <text class="photos-label">凭证图片:</text>
            <view class="photos-grid">
              <image
                v-for="(img, idx) in order.aftersalePhotos"
                :key="idx"
                :src="img"
                mode="aspectFill"
                class="photo-item"
                @tap="previewAftersaleImage(idx)"
              />
            </view>
          </view>
        </view>
      </view>

      <!-- 物流信息（仅在SHIPPED状态显示）-->
      <view
        class="section shipping-section"
        v-if="order.status === 'SHIPPED' && order.trackingNumber"
      >
        <view class="section-title">物流信息</view>
        <view class="info-row">
          <text class="label">快递公司:</text>
          <text class="value">{{ getCarrierName(order.carrierCode) }}</text>
        </view>
        <view class="info-row">
          <text class="label">运单号:</text>
          <text class="value tracking-number">{{ order.trackingNumber }}</text>
          <button class="btn-copy" @tap="copyTrackingNumber">复制</button>
        </view>
        <view class="info-row" v-if="order.shippedAt">
          <text class="label">发货时间:</text>
          <text class="value">{{ formatDateTime(order.shippedAt) }}</text>
        </view>
      </view>
    </view>

    <view
      v-if="addressSelectVisible"
      class="address-modal-mask"
      @tap="closeAddressSelect"
    >
      <view class="address-modal-panel" @tap.stop>
        <view class="address-modal-header">
          <text class="address-modal-title">选择已有地址</text>
          <text class="address-modal-close" @tap="closeAddressSelect">×</text>
        </view>
        <view v-if="addressLoading" class="address-modal-loading"
          >加载中...</view
        >
        <view
          v-else-if="customerAddresses.length === 0"
          class="address-modal-empty"
        >
          <text>该客户暂无地址</text>
          <button
            class="address-action-btn primary"
            @tap="openCreateAddressFormFromSelect"
          >
            录入新地址
          </button>
        </view>
        <view v-else class="address-select-list">
          <view
            v-for="address in customerAddresses"
            :key="address.id"
            class="address-select-item"
            @tap="selectCustomerAddress(address)"
          >
            <view class="address-select-header">
              <text class="address-recipient-name">{{
                address.recipientName
              }}</text>
              <text class="address-recipient-phone">{{
                formatPhone(address.phone)
              }}</text>
              <text v-if="address.isDefault" class="address-default-tag"
                >默认</text
              >
            </view>
            <text class="address-select-text"
              >{{ formatRegionText(address.region) }} {{ address.detail }}</text
            >
          </view>
          <button
            class="address-action-btn primary full"
            @tap="openCreateAddressFormFromSelect"
          >
            录入新地址
          </button>
        </view>
      </view>
    </view>

    <view
      v-if="addressFormVisible"
      class="address-modal-mask"
      @tap="closeAddressForm"
    >
      <view class="address-modal-panel address-form-panel" @tap.stop>
        <view class="address-modal-header">
          <text class="address-modal-title">{{
            addressFormMode === 'edit' ? '编辑地址' : '录入新地址'
          }}</text>
          <text class="address-modal-close" @tap="closeAddressForm">×</text>
        </view>
        <view class="address-form-item">
          <text class="address-form-label">收货人姓名</text>
          <input
            class="address-form-input"
            v-model="addressForm.recipientName"
            placeholder="请输入收货人姓名"
          />
        </view>
        <view class="address-form-item">
          <text class="address-form-label">手机号</text>
          <input
            class="address-form-input"
            v-model="addressForm.phone"
            type="number"
            placeholder="请输入手机号"
          />
        </view>
        <view class="address-form-item">
          <text class="address-form-label">所在地区</text>
          <picker
            mode="region"
            :value="addressRegionValue"
            @change="onAddressRegionChange"
          >
            <view class="address-form-picker">
              <text v-if="addressRegionText">{{ addressRegionText }}</text>
              <text v-else class="address-form-placeholder"
                >请选择省/市/区</text
              >
              <text class="address-picker-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="address-form-item">
          <text class="address-form-label">详细地址</text>
          <textarea
            class="address-form-textarea"
            v-model="addressForm.detail"
            placeholder="请输入详细地址"
          />
        </view>
        <view class="address-form-switch-row">
          <text class="address-form-label">设为默认地址</text>
          <view class="compact-switch-wrap">
            <switch
              class="compact-switch"
              color="#07c160"
              :checked="addressForm.isDefault"
              @change="onAddressDefaultChange"
            />
          </view>
        </view>
        <button
          class="address-save-btn"
          :disabled="savingAddress"
          @tap="saveAddressForm"
        >
          {{ savingAddress ? '保存中...' : '保存地址' }}
        </button>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <!-- Phase 9: Simplified action buttons aligned with e-commerce standards -->
    <!-- Phase 9.1: Added FREEZING and AFTERSALE status actions -->
    <view class="bottom-actions" v-if="order">
      <!-- 待付款状态 -->
      <view v-if="order.status === 'PENDING_PAYMENT'" class="action-buttons">
        <button class="btn-action btn-cancel" @tap="cancelOrder">
          取消订单
        </button>
        <button
          class="btn-action btn-primary"
          :disabled="paying || paymentExpired"
          @tap="payOrder"
        >
          {{ paymentExpired ? '已超时' : '立即支付' }}
        </button>
      </view>

      <!-- 生产中状态 (合并PAID和IN_PRODUCTION) -->
      <view
        v-else-if="order.status === 'PAID' || order.status === 'IN_PRODUCTION'"
        class="action-buttons"
      >
        <!-- 移除联系客服按钮 -->
      </view>

      <!-- 急冻中状态 -->
      <view v-else-if="order.status === 'FREEZING'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="applyAftersale">
          申请售后
        </button>
      </view>

      <!-- 已发货状态 -->
      <view v-else-if="order.status === 'SHIPPED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="viewLogistics">
          查看物流
        </button>
        <button class="btn-action btn-secondary" @tap="applyAftersale">
          申请售后
        </button>
        <button class="btn-action btn-primary" @tap="confirmReceived">
          确认收货
        </button>
      </view>

      <!-- 售后中状态 -->
      <view v-else-if="order.status === 'AFTERSALE'" class="action-buttons">
        <!-- 移除联系客服按钮 -->
      </view>

      <!-- 已完成状态 -->
      <view v-else-if="order.status === 'COMPLETED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">
          再次购买
        </button>
      </view>

      <!-- 已取消状态 -->
      <view v-else-if="order.status === 'CANCELLED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">
          再次购买
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { onShow, onShareAppMessage } from '@dcloudio/uni-app';
import { request } from '../../utils/api';
import {
  bindOrderCustomerAddress as bindExistingOrderAddress,
  createOrderCustomerAddress,
  createWechatPayment,
  getAdminOrderDetail,
  getAdminOrderFinancialSummary,
  getOrderFinancialSummary,
  listOrderCustomerAddresses,
  updateAdminOrderRemark,
  updateOrderCustomerAddress,
  type CustomerOrderFinancialSummary,
  type StaffOrderAddress,
  type WechatPaymentResult,
} from '../../api/orders';
import OrderProgressBar from '../../components/OrderProgressBar.vue';
import { normalizeImageUrl } from '../../utils/config';
import { formatDateTime } from '../../utils/date';
import { getNutritionStandardLabel } from '../../utils/label-mapping';
import { requestWechatOrderPayment } from '../../utils/wechat-payment';
import { ensurePhoneBound } from '../../utils/account';
import {
  getSourcePlanLabel,
  type IngredientSourcePlanCode,
} from '../../utils/order-package-plan';

interface RecipeSnapshotItem {
  ingredient_id: string;
  name: string;
  ratio: number;
  ingredient_type?: string;
  nutrient_target_key?: string;
  nutrient_target_value?: number;
  properties?: any;
  preparation_methods?: string[];
  sort_order?: number;
  unit_display_label?: string;
}

interface OrderItem {
  id: string;
  dogId?: string;
  dogName?: string;
  dogBreedName?: string;
  dogWeightKg?: number;
  dog?: {
    name?: string;
    breedName?: string;
    weightKg?: number;
    mealsPerDay?: number;
    gender?: 'MALE' | 'FEMALE';
  };
  recipeSnapshot?: {
    id: string;
    version: number;
    name: string;
    coverImageUrl?: string | null;
    nutrition_standard: string;
    energy_density_kcal_per_kg: number;
    production_loss_rate: number;
    items: RecipeSnapshotItem[];
  };
  dailyIntakeG?: number;
  quantityG: number;
  packageCount: number;
  packageSpecG: number;
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
  ingredientSourcePlan?: string | null;
  customRequirements?: string | null;
  totalPrice?: number;
}

interface Order {
  id: string;
  customerId?: string; // 添加customerId字段用于权限验证
  type: string;
  status: string;
  createdAt: string;
  targetProductionDate?: string | null;
  estimatedShippingDate?: string | null;
  amountTotal?: number;
  totalAmount?: number;
  amountProduct?: number;
  amountShipping?: number;
  adminRemark?: string | null;
  items?: OrderItem[];
  addressId?: string | null;
  address?: {
    id?: string;
    recipientName: string;
    phone?: string;
    recipientPhone?: string;
    region?: {
      province?: string;
      city?: string;
      district?: string;
    };
    regionText?: string;
    detail?: string;
    detailAddress?: string;
    isDefault?: boolean;
  };
  customer?: {
    id: string;
    nickname?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  } | null;
  trackingNumber?: string;
  carrierCode?: string;
  shippedAt?: string;
  paymentMethod?: string;
  transactionId?: string;
  paidAt?: string;
  paymentDeadline?: string | null;
  paymentRemainingSeconds?: number | null;
  paymentTimeoutMinutes?: number | null;
  paymentAutoCloseEnabled?: boolean | null;
  // Phase 9.1: Aftersale fields
  aftersaleType?: string;
  aftersaleSince?: string;
  aftersaleReason?: string;
  aftersalePhotos?: string[];
  // 原料照片
  productionPhotos?: {
    unitId: string;
    photos: string[];
    uploadedAt: string;
  };
  // 定价快照（驼峰式，与后端保持一致）
  pricingBreakdownSnapshot?: {
    ingredientDetails?: Array<{
      ingredientId: string;
      name: string;
      amount: number;
      unit: string;
      type?: string;
    }>;
  };
}

interface CustomerServiceConfig {
  enabled: boolean;
  provider: string;
  customerServiceUrl?: string | null;
  orderCardTitleTemplate: string;
  orderCardPathTemplate: string;
  welcomeMessage?: string | null;
  orderDetailDeliveryNote?: string | null;
  orderDetailAftersaleNote?: string | null;
  orderDetailMerchantNote?: string | null;
}

const order = ref<Order | null>(null);
const orderId = ref('');
const orderFinancialSummary = ref<CustomerOrderFinancialSummary | null>(null);
const customerServiceConfig = ref<CustomerServiceConfig>({
  enabled: false,
  provider: 'WECHAT_CUSTOMER_SERVICE',
  customerServiceUrl: null,
  orderCardTitleTemplate: '订单 {orderNo}',
  orderCardPathTemplate: '/pages/order-detail/index?id={orderId}',
  welcomeMessage: null,
  orderDetailDeliveryNote: null,
  orderDetailAftersaleNote: null,
  orderDetailMerchantNote: null,
});
const paying = ref(false);
const paymentRemainingSeconds = ref<number | null>(null);
let paymentTimer: ReturnType<typeof setInterval> | null = null;
const remarkDraft = ref('');
const savingAdminRemark = ref(false);
const customerAddresses = ref<StaffOrderAddress[]>([]);
const addressSelectVisible = ref(false);
const addressFormVisible = ref(false);
const addressLoading = ref(false);
const savingAddress = ref(false);
const addressFormMode = ref<'create' | 'edit'>('create');
const editingAddressId = ref('');
const addressRegionValue = ref<string[]>([]);
const addressForm = ref({
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
});

// 获取当前用户信息
const userInfo = ref({
  id: '',
  role: '',
});

const isStaffOrAdmin = computed(() => {
  return userInfo.value.role === 'STAFF' || userInfo.value.role === 'ADMIN';
});

const paymentExpired = computed(() => {
  return (
    order.value?.status === 'PENDING_PAYMENT' &&
    order.value?.paymentAutoCloseEnabled === true &&
    paymentRemainingSeconds.value !== null &&
    paymentRemainingSeconds.value <= 0
  );
});

const paymentCountdownText = computed(() => {
  if (paymentRemainingSeconds.value === null) {
    return '不限时';
  }

  if (paymentRemainingSeconds.value <= 0) {
    return '已超时';
  }

  const minutes = Math.floor(paymentRemainingSeconds.value / 60);
  const seconds = paymentRemainingSeconds.value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const customerServiceOrderTitle = computed(() => {
  const orderNo = order.value?.id ? formatOrderId(order.value.id) : '';
  return customerServiceConfig.value.orderCardTitleTemplate
    .split('{orderNo}')
    .join(orderNo)
    .split('{orderId}')
    .join(order.value?.id || '');
});

const customerServiceOrderPath = computed(() => {
  return customerServiceConfig.value.orderCardPathTemplate
    .split('{orderId}')
    .join(order.value?.id || orderId.value)
    .split('{orderNo}')
    .join(order.value?.id ? formatOrderId(order.value.id) : '');
});

function syncPaymentTimer() {
  if (paymentTimer) {
    clearInterval(paymentTimer);
    paymentTimer = null;
  }

  if (!order.value || order.value.status !== 'PENDING_PAYMENT') {
    paymentRemainingSeconds.value = null;
    return;
  }

  if (!order.value.paymentAutoCloseEnabled) {
    paymentRemainingSeconds.value = null;
    return;
  }

  const computeRemaining = () => {
    if (order.value?.paymentDeadline) {
      return Math.max(
        0,
        Math.floor(
          (new Date(order.value.paymentDeadline).getTime() - Date.now()) / 1000,
        ),
      );
    }

    return Math.max(0, Number(order.value?.paymentRemainingSeconds ?? 0));
  };

  paymentRemainingSeconds.value = computeRemaining();
  paymentTimer = setInterval(() => {
    paymentRemainingSeconds.value = Math.max(
      0,
      (paymentRemainingSeconds.value ?? 0) - 1,
    );
    if (paymentRemainingSeconds.value <= 0 && paymentTimer) {
      clearInterval(paymentTimer);
      paymentTimer = null;
    }
  }, 1000);
}

const normalizedRemarkDraft = computed(() => remarkDraft.value.trim());
const currentAdminRemark = computed(() =>
  (order.value?.adminRemark ?? '').trim(),
);
const isAdminRemarkDirty = computed(() => {
  return normalizedRemarkDraft.value !== currentAdminRemark.value;
});
const canClearAdminRemark = computed(() => {
  return Boolean(normalizedRemarkDraft.value || currentAdminRemark.value);
});

const addressRegionText = computed(() => {
  return [
    addressForm.value.province,
    addressForm.value.city,
    addressForm.value.district,
  ]
    .filter(Boolean)
    .join(' ');
});

const shouldShowFinancialSummary = computed(() => {
  return orderFinancialSummary.value?.settlementStatus === 'SETTLED';
});

const visibleSettlementAdjustments = computed(() => {
  return orderFinancialSummary.value?.adjustments || [];
});

const displayAdjustmentAmount = computed(() => {
  const adjustmentSummary = orderFinancialSummary.value?.adjustmentSummary;
  if (adjustmentSummary) {
    return (
      adjustmentSummary.pendingExtraPaymentAmount -
      adjustmentSummary.pendingRefundAmount
    );
  }
  return orderFinancialSummary.value?.shortageAdjustmentAmount || 0;
});

const settlementAdjustmentClass = computed(() => {
  const amount = displayAdjustmentAmount.value;
  if (amount < 0) return 'refund';
  if (amount > 0) return 'extra-payment';
  return 'balanced';
});

const settlementDescription = computed(() => {
  const adjustmentSummary = orderFinancialSummary.value?.adjustmentSummary;
  if (adjustmentSummary?.pendingRefundAmount) {
    return '本次生产存在成品缺口，客服会联系您确认退差价或抵扣方式。';
  }
  if (adjustmentSummary?.pendingExtraPaymentAmount) {
    return '本次生产结算后需要补收差价，客服会联系您确认补款方式。';
  }
  return '本次生产已完成结算，无需补收或退差价。';
});

function shouldFetchOrderFinancialSummary(status?: string | null): boolean {
  return [
    'IN_PRODUCTION',
    'FREEZING',
    'SHIPPED',
    'COMPLETED',
    'AFTERSALE',
  ].includes(status);
}

function formatIngredientSourcePlan(plan?: string | null): string {
  if (!plan) return '';
  return getSourcePlanLabel(plan as IngredientSourcePlanCode) || plan;
}

// 原料清单展开状态
const expandedIngredients = ref<Record<string, boolean>>({});

// 原料类型映射
const ingredientTypeMap: Record<string, string> = {
  FOOD: '食材',
  VEGETABLE: '食材',
  SUPPLEMENT: '补剂',
  PACKAGING: '包装',
};

// 按狗狗分组
const groupedItems = computed(() => {
  if (!order.value?.items) return [];

  const groups = new Map();

  order.value.items.forEach((item: any) => {
    const dogId = item.dogId || 'unknown';
    if (!groups.has(dogId)) {
      groups.set(dogId, {
        dogId,
        dogName: item.dog?.name || item.dogName || '未知狗狗',
        dogBreedName: item.dog?.breedName || item.dogBreedName || '',
        dogWeightKg: item.dog?.weightKg || item.dogWeightKg || 0,
        dogGender: item.dog?.gender || 'MALE',
        items: [],
      });
    }
    groups.get(dogId).items.push(item);
  });

  return Array.from(groups.values());
});

const orderCenterTitle = computed(() => {
  const firstName = order.value?.items?.[0]?.recipeSnapshot?.name?.trim();
  if (!firstName) return 'SevenKitchen 鲜食订单';
  const itemCount = order.value?.items?.length || 1;
  return itemCount > 1 ? `${firstName}等${itemCount}件` : firstName;
});

const orderCenterCover = computed(() => {
  const raw = order.value?.items?.[0]?.recipeSnapshot?.coverImageUrl;
  return raw ? normalizeImageUrl(raw) : '';
});

const totalPackageCount = computed(() => {
  return (order.value?.items || []).reduce((sum, item) => {
    return sum + Math.max(0, Number(item.packageCount || 0));
  }, 0);
});

const totalQuantityKg = computed(() => {
  const grams = (order.value?.items || []).reduce((sum, item) => {
    return sum + Math.max(0, Number(item.quantityG || 0));
  }, 0);
  return grams > 0 ? Number((grams / 1000).toFixed(1)) : 0;
});

const orderCenterDescription = computed(() => {
  const parts = [
    `${order.value?.items?.length || 0}件商品`,
    totalPackageCount.value > 0 ? `${totalPackageCount.value}袋` : '',
    totalQuantityKg.value > 0 ? `约${totalQuantityKg.value}kg` : '',
  ].filter(Boolean);
  return parts.join(' · ') || '宠物鲜食定制商品';
});

const customerDisplayName = computed(() => {
  return (
    order.value?.customer?.nickname?.trim() ||
    order.value?.address?.recipientName ||
    '微信用户'
  );
});

const customerPhoneText = computed(() => {
  return (
    order.value?.customer?.phone ||
    (order.value?.address ? getOrderAddressPhone(order.value.address) : '') ||
    '未填写'
  );
});

const fullAddressText = computed(() => {
  if (!order.value?.address) return '暂未录入收货地址';
  return [
    getOrderAddressRegionText(order.value.address),
    getOrderAddressDetail(order.value.address),
  ]
    .filter(Boolean)
    .join(' ');
});

const customerRequirementText = computed(() => {
  const requirements = (order.value?.items || [])
    .map((item) => item.customRequirements?.trim())
    .filter(Boolean);

  if (requirements.length > 0) {
    return requirements.join('；');
  }

  return '无特殊备注';
});

const orderDetailDeliveryNote = computed(() => {
  return (
    customerServiceConfig.value.orderDetailDeliveryNote ||
    '默认顺丰冷链/特快配送，制作完成急冻后发出。'
  );
});

const orderDetailAftersaleNote = computed(() => {
  return (
    customerServiceConfig.value.orderDetailAftersaleNote ||
    '如需退款、重做或反馈问题，可在订单详情页售后区域提交申请。'
  );
});

// 判断是否有编辑权限（订单所有者或管理员，不包括员工）
const canEditOrder = computed(() => {
  if (!order.value || !userInfo.value.id) {
    console.log('[Order Detail] canEditOrder: false - missing data', {
      hasOrder: !!order.value,
      hasUserId: !!userInfo.value.id,
    });
    return false;
  }

  // 员工（STAFF）不能编辑
  if (userInfo.value.role === 'STAFF') {
    console.log('[Order Detail] canEditOrder: false - user is STAFF');
    return false;
  }

  // 管理员可以编辑任何订单
  const isAdmin = userInfo.value.role === 'ADMIN';
  if (isAdmin) {
    console.log('[Order Detail] canEditOrder: true - user is ADMIN');
    return true;
  }

  // 普通用户：检查是否是订单所有者
  const orderData = order.value as any;
  const isOwner = orderData.customerId === userInfo.value.id;

  console.log('[Order Detail] canEditOrder:', {
    isOwner,
    isAdmin,
    orderCustomerId: orderData.customerId,
    userId: userInfo.value.id,
  });

  return isOwner;
});

// 判断是否可以修改地址（状态 < SHIPPED）
const canEditAddress = computed(() => {
  if (!order.value) return false;
  const editableStatuses = [
    'INIT',
    'PENDING_PAYMENT',
    'PAID',
    'PURCHASING',
    'IN_PRODUCTION',
    'FREEZING',
  ];
  if (!editableStatuses.includes(order.value.status)) return false;
  return isStaffOrAdmin.value || canEditOrder.value;
});

// 判断是否可以修改日期（状态 < PURCHASING）
const canEditDate = computed(() => {
  if (!order.value || !canEditOrder.value) return false;
  const editableStatuses = ['INIT', 'PENDING_PAYMENT', 'PAID'];
  return editableStatuses.includes(order.value.status);
});

// 日期选择器状态
const selectedDate = ref('');
const minDateStr = ref('');

// 监控计算属性的变化
watch(
  [canEditOrder, canEditAddress, canEditDate],
  ([canEdit, canAddr, canDate]) => {
    console.log('[Order Detail] Edit permissions:', {
      canEditOrder: canEdit,
      canEditAddress: canAddr,
      canEditDate: canDate,
      orderStatus: order.value?.status,
      userInfo: userInfo.value,
    });
  },
);

// 切换原料清单展开/收起
function toggleIngredients(itemId: string) {
  expandedIngredients.value[itemId] = !expandedIngredients.value[itemId];
}

// 获取分组后的原料
function getGroupedIngredients(items: RecipeSnapshotItem[]) {
  const groups = new Map<string, RecipeSnapshotItem[]>();

  items.forEach((ingredient) => {
    const type = ingredient.ingredient_type || 'FOOD';
    const typeName = ingredientTypeMap[type] || '其他';

    if (!groups.has(typeName)) {
      groups.set(typeName, []);
    }

    groups.get(typeName)!.push(ingredient);
  });

  // 转换为数组并排序
  return Array.from(groups.entries()).map(([typeName, items]) => ({
    typeName,
    items: items.sort((a, b) => {
      // 优先按sort_order排序
      if (a.sort_order !== undefined && b.sort_order !== undefined) {
        return a.sort_order - b.sort_order;
      }
      // 然后按ratio降序排序
      return b.ratio - a.ratio;
    }),
  }));
}

// 格式化原料显示
function formatIngredientDisplay(
  ingredient: RecipeSnapshotItem,
  item: OrderItem,
): string {
  const isSupplement = ingredient.ingredient_type === 'SUPPLEMENT';

  if (isSupplement) {
    // 补剂类型：从pricing_breakdown中获取实际用量
    const actualAmount = getSupplementActualAmount(ingredient);
    const unit = ingredient.unit_display_label || 'g';

    if (actualAmount > 0) {
      return `${ingredient.name} ${actualAmount}${unit}`;
    } else {
      return `${ingredient.name}`;
    }
  } else {
    // 普通原料：计算实际用量（克数）
    // ratio在数据库中存储的是百分比（如42.83），需要除以100
    const actualAmountG = Math.round(item.quantityG * (ingredient.ratio / 100));
    return `${ingredient.name} ${actualAmountG}g`;
  }
}

// 获取补剂的实际用量（从pricingBreakdownSnapshot）
// 使用netAmount（不含损耗）而不是amount（含损耗）
function getSupplementActualAmount(ingredient: RecipeSnapshotItem): number {
  if (!order.value?.pricingBreakdownSnapshot?.ingredientDetails) {
    return 0;
  }

  const ingredientDetails =
    order.value.pricingBreakdownSnapshot.ingredientDetails;
  const detail = ingredientDetails.find(
    (d: any) => d.ingredientId === ingredient.ingredient_id,
  );

  if (detail) {
    // 使用netAmount（净需求，不含制作损耗）
    const amount =
      detail.netAmount !== undefined ? detail.netAmount : detail.amount;
    // 根据单位决定保留小数位数
    if (detail.unit === '片' || detail.unit === '粒') {
      return Math.round(amount * 100) / 100; // 保留两位小数
    } else if (detail.unit === 'kg') {
      // kg转换为g
      return Math.round(amount * 1000);
    } else {
      return Math.round(amount * 10) / 10; // 保留一位小数
    }
  }

  return 0;
}

// 长按查看原料详情
function showIngredientDetail(ingredient: RecipeSnapshotItem, item: OrderItem) {
  const isSupplement = ingredient.ingredient_type === 'SUPPLEMENT';
  const typeName =
    ingredientTypeMap[ingredient.ingredient_type || ''] || '其他';

  let content = `类型：${typeName}\n`;

  if (isSupplement) {
    const actualAmount = getSupplementActualAmount(ingredient);
    const unit = ingredient.unit_display_label || 'g';
    content += `实际用量：${actualAmount}${unit}\n`;
  } else {
    const ratio = Math.round(ingredient.ratio);
    const actualAmountG = Math.round(item.quantityG * (ingredient.ratio / 100));
    content += `比例：${ratio}%\n`;
    content += `实际用量：${actualAmountG}g\n`;
  }

  uni.showModal({
    title: ingredient.name,
    content: content.trim(),
    showCancel: false,
    confirmText: '关闭',
  });
}

onMounted(async () => {
  if (!(await ensurePhoneBound())) {
    return;
  }

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1] as any;
  orderId.value = currentPage.options?.id || currentPage.options?.orderId || '';

  // 获取用户信息 - 使用正确的存储key 'user'（与TabBar一致）
  try {
    // 尝试从 'user' key 读取（TabBar使用的key）
    let user = uni.getStorageSync('user') || '{}';
    console.log('[Order Detail] Raw user from storage:', user);

    // 如果 'user' key 为空，尝试 'userInfo' key
    if (user === '{}' || user === '' || !user) {
      user = uni.getStorageSync('userInfo') || '{}';
      console.log('[Order Detail] Trying userInfo key:', user);
    }

    // 处理存储的数据：可能是对象或JSON字符串
    let userData;
    if (typeof user === 'string') {
      userData = JSON.parse(user);
    } else {
      userData = user;
    }
    console.log('[Order Detail] Parsed userData:', userData);

    // 尝试多个可能的字段名
    const userId =
      userData.id ||
      userData.userId ||
      userData.customerId ||
      userData.user?.id ||
      '';
    const userRole = userData.role || userData.user?.role || 'CUSTOMER';

    userInfo.value = {
      id: userId,
      role: userRole,
    };
    console.log('[Order Detail] User info loaded:', userInfo.value);

    // 如果还是没有用户ID，尝试从 API 获取
    if (!userId) {
      console.log('[Order Detail] No user ID in storage, fetching from API');
      loadUserInfoFromApi();
    }
  } catch (err) {
    console.error('Failed to load userInfo:', err);
    // 如果解析失败，尝试从 API 获取
    loadUserInfoFromApi();
  }

  if (orderId.value) {
    loadOrderDetail();
    loadCustomerServiceConfig();
  }
});

onUnmounted(() => {
  if (paymentTimer) {
    clearInterval(paymentTimer);
    paymentTimer = null;
  }
});

async function loadUserInfoFromApi() {
  try {
    const res = await request({
      url: '/users/me',
      method: 'GET',
    });

    if (res.code === 0 && res.data) {
      userInfo.value = {
        id: res.data.id || res.data.userId || res.data.customerId || '',
        role: res.data.role || 'CUSTOMER',
      };
      console.log('[Order Detail] User info loaded from API:', userInfo.value);

      // 保存到两个key，确保兼容性；user 保持对象格式，避免 TabBar 角色判断失效
      uni.setStorageSync('user', res.data);
      uni.setStorageSync('userInfo', res.data);

      if (orderId.value) {
        await loadOrderDetail();
      }
    }
  } catch (error) {
    console.error('[Order Detail] Failed to load user info from API:', error);
  }
}

async function fetchOrderDetailResponse() {
  if (isStaffOrAdmin.value) {
    try {
      const adminRes = await getAdminOrderDetail(orderId.value);
      if (adminRes.code === 0 && adminRes.data) {
        return adminRes;
      }
      console.warn(
        '[Order Detail] Admin detail unavailable, falling back:',
        adminRes,
      );
    } catch (error) {
      console.warn(
        '[Order Detail] Admin detail request failed, fallback to customer detail:',
        error,
      );
    }
  }

  return request({
    url: `/orders/${orderId.value}`,
    method: 'GET',
  });
}

async function loadOrderDetail() {
  try {
    uni.showLoading({ title: '加载中...' });

    const res = await fetchOrderDetailResponse();

    if (res.code === 0 && res.data) {
      order.value = res.data;
      orderId.value = res.data.id || orderId.value;
      syncPaymentTimer();
      remarkDraft.value = res.data.adminRemark || '';
      console.log('[Order Detail] Order loaded:', {
        id: order.value.id,
        status: order.value.status,
        customerId: order.value.customerId,
        targetProductionDate: order.value.targetProductionDate,
        adminRemark: order.value.adminRemark,
      });
      console.log('[Order Detail] Can edit address:', canEditAddress.value);
      console.log('[Order Detail] Can edit date:', canEditDate.value);

      // 预获取分享照片的 token
      prefetchShareToken();
      prefetchSharePhotoImage();
      fetchOrderFinancialSummary();
    }
  } catch (error) {
    console.error('Load order detail error:', error);
  } finally {
    uni.hideLoading();
  }
}

async function fetchOrderFinancialSummary() {
  if (!orderId.value) return;
  if (!shouldFetchOrderFinancialSummary(order.value?.status)) {
    orderFinancialSummary.value = null;
    return;
  }

  try {
    const res = isStaffOrAdmin.value
      ? await getAdminOrderFinancialSummary(orderId.value)
      : await getOrderFinancialSummary(orderId.value);
    orderFinancialSummary.value = res.code === 0 && res.data ? res.data : null;
  } catch (error) {
    console.warn('[Order Detail] Failed to load financial summary:', error);
    orderFinancialSummary.value = null;
  }
}

async function saveAdminRemark() {
  if (
    !order.value ||
    !isStaffOrAdmin.value ||
    savingAdminRemark.value ||
    !isAdminRemarkDirty.value
  ) {
    return;
  }

  try {
    savingAdminRemark.value = true;
    uni.showLoading({ title: '保存中...' });

    const res = await updateAdminOrderRemark(
      order.value.id,
      normalizedRemarkDraft.value || null,
    );

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '保存失败');
    }

    order.value = {
      ...order.value,
      ...res.data,
      adminRemark: res.data.adminRemark ?? null,
    };
    remarkDraft.value = res.data.adminRemark || '';

    uni.showToast({
      title: '备注已保存',
      icon: 'success',
    });
  } catch (error: any) {
    console.error('[Order Detail] Update admin remark error:', error);
    uni.showToast({
      title: error?.message || '保存失败',
      icon: 'none',
    });
  } finally {
    savingAdminRemark.value = false;
    uni.hideLoading();
  }
}

function clearAdminRemark() {
  if (!canClearAdminRemark.value || savingAdminRemark.value) {
    return;
  }

  uni.showModal({
    title: '清空备注',
    content: '确定要清空管理员备注吗？',
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      remarkDraft.value = '';
      await saveAdminRemark();
    },
  });
}

// 更换收货地址
function changeAddress() {
  if (isStaffOrAdmin.value) {
    openAddressSelect();
    return;
  }

  uni.navigateTo({
    url: `/pages/address-list/index?mode=select&orderId=${orderId.value}&from=order-detail`,
  });
}

// 处理地址选择（从地址列表返回）
async function handleAddressSelected(
  data: string | { addressId: string; from?: string },
) {
  // Handle both string and object formats for compatibility
  const addressId = typeof data === 'string' ? data : data?.addressId;

  if (!addressId) return;

  await updateOrderAddress(addressId);
}

async function updateOrderAddress(addressId: string) {
  try {
    uni.showLoading({ title: '更新中...' });

    const res = isStaffOrAdmin.value
      ? await bindExistingOrderAddress(orderId.value, addressId)
      : await request({
          url: `/orders/${orderId.value}/address`,
          method: 'PUT',
          data: { addressId },
        });

    if (res.code === 0) {
      uni.showToast({
        title: '地址已更新',
        icon: 'success',
      });
      // 重新加载订单详情
      await loadOrderDetail();
    } else {
      throw new Error(res.message || '更新失败');
    }
  } catch (error) {
    console.error('Update address error:', error);
    uni.showToast({
      title: error?.message || '更新失败',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

async function loadCustomerAddresses() {
  if (!orderId.value) return;

  addressLoading.value = true;
  try {
    const response = await listOrderCustomerAddresses(orderId.value);
    customerAddresses.value = response.data || [];
  } catch (error) {
    console.error('[Order Detail] Load customer addresses error:', error);
    uni.showToast({
      title: '地址加载失败',
      icon: 'none',
    });
  } finally {
    addressLoading.value = false;
  }
}

async function openAddressSelect() {
  if (!canEditAddress.value || !isStaffOrAdmin.value) return;

  addressSelectVisible.value = true;
  await loadCustomerAddresses();
}

function closeAddressSelect() {
  addressSelectVisible.value = false;
}

async function selectCustomerAddress(address: StaffOrderAddress) {
  if (!orderId.value || savingAddress.value) return;

  savingAddress.value = true;
  try {
    await bindExistingOrderAddress(orderId.value, address.id);
    uni.showToast({
      title: '地址已绑定',
      icon: 'success',
    });
    addressSelectVisible.value = false;
    await loadOrderDetail();
  } catch (error: any) {
    console.error('[Order Detail] Bind address error:', error);
    uni.showToast({
      title: error?.message || '地址绑定失败',
      icon: 'none',
    });
  } finally {
    savingAddress.value = false;
  }
}

function resetAddressForm() {
  addressForm.value = {
    recipientName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: false,
  };
  addressRegionValue.value = [];
  editingAddressId.value = '';
}

function openCreateAddressForm() {
  if (!canEditAddress.value || !isStaffOrAdmin.value) return;

  addressFormMode.value = 'create';
  resetAddressForm();
  addressFormVisible.value = true;
}

function openCreateAddressFormFromSelect() {
  closeAddressSelect();
  openCreateAddressForm();
}

function openEditAddressForm() {
  if (!canEditAddress.value || !isStaffOrAdmin.value || !order.value?.address)
    return;

  const address = order.value.address;
  addressFormMode.value = 'edit';
  editingAddressId.value = address.id || order.value.addressId || '';
  addressForm.value = {
    recipientName: address.recipientName || '',
    phone: getOrderAddressPhone(address),
    province: address.region?.province || '',
    city: address.region?.city || '',
    district: address.region?.district || '',
    detail: getOrderAddressDetail(address),
    isDefault: !!address.isDefault,
  };
  addressRegionValue.value = [
    addressForm.value.province,
    addressForm.value.city,
    addressForm.value.district,
  ].filter(Boolean);
  addressFormVisible.value = true;
}

function closeAddressForm() {
  if (savingAddress.value) return;
  addressFormVisible.value = false;
}

function onAddressRegionChange(event: any) {
  const value = event.detail.value || [];
  addressRegionValue.value = value;
  addressForm.value.province = value[0] || '';
  addressForm.value.city = value[1] || '';
  addressForm.value.district = value[2] || '';
}

function onAddressDefaultChange(event: any) {
  addressForm.value.isDefault = !!event.detail.value;
}

function validateAddressForm(): boolean {
  const form = addressForm.value;
  if (
    !form.recipientName ||
    !form.phone ||
    !form.province ||
    !form.city ||
    !form.district ||
    !form.detail
  ) {
    uni.showToast({
      title: '请填写完整收货地址',
      icon: 'none',
    });
    return false;
  }
  return true;
}

async function saveAddressForm() {
  if (!orderId.value || savingAddress.value || !validateAddressForm()) return;

  const form = addressForm.value;
  const payload = {
    recipientName: form.recipientName,
    phone: form.phone,
    region: {
      province: form.province,
      city: form.city,
      district: form.district,
    },
    detail: form.detail,
    isDefault: form.isDefault,
  };

  savingAddress.value = true;
  try {
    if (addressFormMode.value === 'edit' && editingAddressId.value) {
      await updateOrderCustomerAddress(
        orderId.value,
        editingAddressId.value,
        payload,
      );
    } else {
      await createOrderCustomerAddress(orderId.value, payload);
    }

    uni.showToast({
      title: '地址已保存',
      icon: 'success',
    });
    addressFormVisible.value = false;
    await loadOrderDetail();
  } catch (error: any) {
    console.error('[Order Detail] Save address error:', error);
    uni.showToast({
      title: error?.message || '保存失败',
      icon: 'none',
    });
  } finally {
    savingAddress.value = false;
  }
}

// 初始化日期选择器的值
watch(
  () => order.value?.targetProductionDate,
  (newDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    minDateStr.value = formatDateToYYYYMMDD(today);

    const currentDate = newDate ? new Date(newDate) : new Date(today);
    currentDate.setHours(0, 0, 0, 0);

    selectedDate.value = formatDateToYYYYMMDD(
      currentDate < today ? today : currentDate,
    );
  },
  { immediate: true },
);

function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 日期选择确认
function onDateSelected(e: any) {
  const newDateStr = e.detail.value;

  // 调用API更新日期
  updateOrderDate(newDateStr);
}

async function updateOrderDate(newDateStr: string) {
  try {
    uni.showLoading({ title: '更新中...' });

    const res = await request({
      url: `/orders/${orderId.value}/production-date`,
      method: 'PUT',
      data: {
        targetProductionDate: newDateStr,
      },
    });

    if (res.code === 0) {
      uni.showToast({
        title: '修改成功',
        icon: 'success',
      });
      // 重新加载订单详情
      await loadOrderDetail();
    } else {
      throw new Error(res.message || '修改失败');
    }
  } catch (error) {
    console.error('Update production date error:', error);
    uni.showToast({
      title: error?.message || '修改失败',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

// 监听地址选择事件（从地址列表返回）
onShow(() => {
  // 监听地址选择事件
  uni.$on('address-selected', handleAddressSelected);
});

// 分享照片相关 - 预获取的分享 token（只有获取成功时才会有值）
const shareToken = ref<string>('');
const shareTokenOrderId = ref<string>('');
const sharePhotoImageUrl = ref<string>('');
const sharePhotoSourceUrl = ref<string>('');
const isPreparingSharePhotoImage = ref(false);

function getFirstProductionPhotoUrl(): string {
  return order.value?.productionPhotos?.photos?.[0] || '';
}

function getProductionPhotosShareDogName(): string {
  const names = new Set<string>();

  order.value?.items?.forEach((item) => {
    const dogName = (item.dog?.name || item.dogName || '').trim();
    if (dogName && dogName !== '未知狗狗') {
      names.add(dogName);
    }
  });

  const dogNames = Array.from(names);
  if (dogNames.length === 0) {
    return 'SevenKitchen';
  }
  if (dogNames.length === 1) {
    return dogNames[0];
  }
  return `${dogNames[0]}等${dogNames.length}只狗狗`;
}

function getProductionPhotosShareTitle(): string {
  const dogName = getProductionPhotosShareDogName();
  return `${dogName}原料照片`;
}

function getProductionPhotosShareImageUrl(): string {
  return (
    sharePhotoImageUrl.value || normalizeImageUrl(getFirstProductionPhotoUrl())
  );
}

async function prefetchSharePhotoImage() {
  const firstPhoto = getFirstProductionPhotoUrl();
  if (!firstPhoto) {
    sharePhotoImageUrl.value = '';
    sharePhotoSourceUrl.value = '';
    isPreparingSharePhotoImage.value = false;
    return;
  }

  const normalizedPhoto = normalizeImageUrl(firstPhoto);
  if (!normalizedPhoto) {
    sharePhotoImageUrl.value = '';
    sharePhotoSourceUrl.value = '';
    isPreparingSharePhotoImage.value = false;
    return;
  }

  if (
    sharePhotoSourceUrl.value === normalizedPhoto &&
    sharePhotoImageUrl.value
  ) {
    return;
  }
  if (
    sharePhotoSourceUrl.value === normalizedPhoto &&
    isPreparingSharePhotoImage.value
  ) {
    return;
  }

  sharePhotoSourceUrl.value = normalizedPhoto;
  sharePhotoImageUrl.value = '';

  if (!/^https?:\/\//.test(normalizedPhoto)) {
    sharePhotoImageUrl.value = normalizedPhoto;
    return;
  }

  isPreparingSharePhotoImage.value = true;

  try {
    const downloadRes = await uni.downloadFile({
      url: normalizedPhoto,
    });

    if (sharePhotoSourceUrl.value !== normalizedPhoto) {
      return;
    }

    const statusCode = Number(downloadRes.statusCode || 0);
    if (statusCode >= 200 && statusCode < 300 && downloadRes.tempFilePath) {
      sharePhotoImageUrl.value = downloadRes.tempFilePath;
      console.log('[Order Detail] Share photo image downloaded successfully');
      return;
    }

    sharePhotoImageUrl.value = normalizedPhoto;
    console.warn(
      '[Order Detail] Share photo image download failed:',
      downloadRes,
    );
  } catch (error) {
    if (sharePhotoSourceUrl.value === normalizedPhoto) {
      sharePhotoImageUrl.value = normalizedPhoto;
    }
    console.warn('[Order Detail] Error downloading share photo image:', error);
  } finally {
    if (sharePhotoSourceUrl.value === normalizedPhoto) {
      isPreparingSharePhotoImage.value = false;
    }
  }
}

// 预获取分享 token
async function prefetchShareToken() {
  // 如果已有 token，不再重复获取
  if (shareToken.value && shareTokenOrderId.value === order.value?.id) {
    return;
  }

  if (!order.value) {
    return;
  }

  // 检查是否有照片
  if (!order.value.productionPhotos?.photos?.length) {
    shareToken.value = '';
    shareTokenOrderId.value = '';
    return;
  }

  try {
    const response = await request({
      url: `/orders/${order.value.id}/share-photos`,
      method: 'POST',
    });

    if (response.code === 0 && response.data?.token) {
      shareToken.value = response.data.token;
      shareTokenOrderId.value = order.value.id;
      console.log('[Order Detail] Share token prefetched successfully');
    } else {
      console.log(
        '[Order Detail] Failed to prefetch share token:',
        response.message,
      );
    }
  } catch (error) {
    console.error('[Order Detail] Error prefetching share token:', error);
  }
}

// 定义分享内容 - 使用预获取的 token（同步返回）
onShareAppMessage((e: any) => {
  // 判断是否是分享照片按钮触发的
  const isSharePhotos = e?.target?.dataset?.shareType === 'photos';

  if (isSharePhotos) {
    // 使用预获取的 token，直接返回同步结果
    // 如果 token 不存在，按钮不会显示，所以这里 token 一定存在
    return {
      title: getProductionPhotosShareTitle(),
      path: `/pages/shared-photos/index?token=${shareToken.value}`,
      imageUrl: getProductionPhotosShareImageUrl(),
    };
  }

  // 默认分享订单详情页
  return {
    title: 'SevenKitchen订单详情',
    path: `/pages/order-detail/index?id=${order.value?.id || ''}`,
    imageUrl: '',
  };
});

function formatOrderId(id: string): string {
  return id.substring(0, 8) + '...';
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00';
  return amount.toFixed(2);
}

function formatPhone(phone?: string): string {
  if (!phone) return '';
  if (phone.length !== 11) return phone;
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function formatRegionText(region?: {
  province?: string;
  city?: string;
  district?: string;
}): string {
  if (!region) return '';
  return [region.province, region.city, region.district]
    .filter(Boolean)
    .join(' ');
}

function getOrderAddressPhone(address: NonNullable<Order['address']>): string {
  return address.phone || address.recipientPhone || '';
}

function getOrderAddressRegionText(
  address: NonNullable<Order['address']>,
): string {
  return address.regionText || formatRegionText(address.region);
}

function getOrderAddressDetail(address: NonNullable<Order['address']>): string {
  return address.detailAddress || address.detail || '';
}

function formatAdjustmentText(): string {
  const amount = displayAdjustmentAmount.value;
  const absAmount = Math.abs(amount).toFixed(2);
  if (amount < 0) return `建议退差价 ¥${absAmount}`;
  if (amount > 0) return `建议补收 ¥${absAmount}`;
  if (visibleSettlementAdjustments.value.length > 0) return '差价已处理';
  return '无需调整';
}

function formatSettlementAdjustmentAmount(
  amount: number,
  status: string,
): string {
  const absAmount = Math.abs(Number(amount || 0)).toFixed(2);
  const prefix = getSettlementAdjustmentAmountPrefix(amount, status);
  if (prefix) return `${prefix} ¥${absAmount}`;
  return '¥0.00';
}

function getSettlementAdjustmentAmountPrefix(
  amount: number,
  status: string,
): string {
  if (amount === 0) return '';
  if (status === 'SETTLED') {
    return amount > 0 ? '已补' : '已退';
  }
  if (status === 'CANCELLED') {
    return '已取消';
  }
  return amount > 0 ? '待补' : '待退';
}

function getAdjustmentStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING: '待处理',
    SETTLED: '已处理',
    CANCELLED: '已取消',
  };
  return statusMap[status] || status;
}

function calculateUnitPrice(item: OrderItem): number {
  if (!item.packageCount || item.packageCount === 0) return 0;
  return (item.totalPrice || 0) / item.packageCount;
}

function formatPackagePlan(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
  packageSpecG?: number;
  packageCount?: number;
}): string {
  const packagePlanRows = (item.packagePlan || [])
    .map((row) => {
      const packageSpecG = Number(row?.packageSpecG);
      const packageCount = Number(row?.packageCount);
      if (
        !Number.isFinite(packageSpecG) ||
        !Number.isFinite(packageCount) ||
        packageSpecG <= 0 ||
        packageCount <= 0
      ) {
        return '';
      }
      return `${packageSpecG}g×${packageCount}袋`;
    })
    .filter(Boolean);

  if (packagePlanRows.length > 0) {
    return packagePlanRows.join('，');
  }

  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`;
}

function getStatusText(status: string): string {
  // Phase 9: Simplified status text aligned with e-commerce standards
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '生产中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  };
  return statusMap[status] || status;
}

function getStatusIcon(status: string): string {
  // Phase 9: Simplified status icons aligned with e-commerce standards
  const iconMap: Record<string, string> = {
    INIT: '📝',
    PENDING_PAYMENT: '💳',
    PAID: '✓',
    PURCHASING: '🛒',
    IN_PRODUCTION: '👨‍🍳',
    FREEZING: '❄️',
    SHIPPED: '🚚',
    COMPLETED: '✅',
    CANCELLED: '✕',
    AFTERSALE: '!',
  };
  return iconMap[status] || '';
}

function getStatusColor(status: string): string {
  // Phase 9: Simplified status colors aligned with e-commerce standards
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#1890ff',
    PURCHASING: '#faad14',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d',
  };
  return colorMap[status] || '#999';
}

function getCarrierName(code?: string): string {
  const carrierMap: Record<string, string> = {
    SF: '顺丰速运',
    STO: '申通快递',
    YTO: '圆通速递',
    ZTO: '中通快递',
    EMS: 'EMS',
  };
  return carrierMap[code || ''] || code || '-';
}

function copyOrderId() {
  uni.setClipboardData({
    data: order.value?.id || '',
    success: () => {
      uni.showToast({ title: '订单号已复制', icon: 'success' });
    },
  });
}

function copyTrackingNumber() {
  uni.setClipboardData({
    data: order.value?.trackingNumber || '',
    success: () => {
      uni.showToast({ title: '运单号已复制', icon: 'success' });
    },
  });
}

function copyAddress() {
  if (!order.value?.address) return;

  const address = order.value.address;
  const fullAddress = `${address.recipientName} ${getOrderAddressPhone(address)} ${getOrderAddressRegionText(address)} ${getOrderAddressDetail(address)}`;

  uni.setClipboardData({
    data: fullAddress,
    success: () => {
      uni.showToast({ title: '地址已复制', icon: 'success' });
    },
  });
}

// 取消订单
async function cancelOrder() {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消这个订单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '取消中...' });
          const result = await request({
            url: `/orders/${orderId.value}/cancel`,
            method: 'POST',
            data: {
              reason: '用户主动取消',
            },
          });
          if (result.code === 0) {
            uni.showToast({
              title: '订单已取消',
              icon: 'success',
            });
            // 重新加载订单详情
            loadOrderDetail();
          }
        } catch (error) {
          uni.showToast({
            title: '取消失败',
            icon: 'none',
          });
        } finally {
          uni.hideLoading();
        }
      }
    },
  });
}

function requestWechatPayment(payment: WechatPaymentResult): Promise<void> {
  return requestWechatOrderPayment(payment);
}

async function loadCustomerServiceConfig() {
  try {
    const res = await request<CustomerServiceConfig>({
      url: '/platform-config/customer-service',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    } as any);

    if (res.code === 0 && res.data) {
      customerServiceConfig.value = {
        ...customerServiceConfig.value,
        ...res.data,
      };
    }
  } catch (error) {
    console.warn('[Order Detail] Load customer service config failed:', error);
  }
}

// 立即付款
async function payOrder() {
  if (paying.value || paymentExpired.value) {
    return;
  }

  try {
    paying.value = true;
    uni.showLoading({ title: '调起支付中...' });

    const res = await createWechatPayment(orderId.value);
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '支付失败');
    }

    uni.hideLoading();
    await requestWechatPayment(res.data);

    uni.showToast({
      title: '支付处理中',
      icon: 'success',
    });

    await loadOrderDetail();
  } catch (error: any) {
    console.error('Payment error:', error);
    const errorMessage = error?.errMsg?.includes('cancel')
      ? '已取消支付'
      : error instanceof Error
        ? error.message
        : '支付失败，请重试';
    uni.showToast({
      title: errorMessage,
      icon: 'none',
    });
  } finally {
    paying.value = false;
    uni.hideLoading();
  }
}

// 联系客服
function contactService() {
  if (customerServiceConfig.value.customerServiceUrl) {
    uni.navigateTo({
      url: `/pages/common/webview?url=${encodeURIComponent(customerServiceConfig.value.customerServiceUrl)}`,
    });
    return;
  }

  uni.showModal({
    title: '联系客服',
    content: '客服暂未启用，请稍后再试',
    showCancel: false,
  });
}

// 查看物流
function viewLogistics() {
  uni.showToast({
    title: '查看物流...',
    icon: 'none',
  });
  // TODO: 跳转到物流详情页
}

// 确认收货
async function confirmReceived() {
  uni.showModal({
    title: '确认收货',
    content: '确认已收到商品吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '确认中...' });
          const result = await request({
            url: `/orders/${orderId.value}/complete`,
            method: 'POST',
          });
          if (result.code === 0) {
            uni.showToast({
              title: '已确认收货',
              icon: 'success',
            });
            loadOrderDetail();
          }
        } catch (error) {
          uni.showToast({
            title: '确认失败',
            icon: 'none',
          });
        } finally {
          uni.hideLoading();
        }
      }
    },
  });
}

// 再次购买
async function buyAgain() {
  if (!order.value?.items || order.value.items.length === 0) {
    uni.showToast({
      title: '订单中没有商品',
      icon: 'none',
    });
    return;
  }

  const firstItem = order.value.items[0];
  const recipeId = firstItem.recipeSnapshot?.id;

  if (!recipeId) {
    uni.showToast({
      title: '食谱信息不完整',
      icon: 'none',
    });
    return;
  }

  try {
    // 检查食谱状态
    uni.showLoading({ title: '检查中...' });

    const res = await request({
      url: `/recipes/${recipeId}`,
      method: 'GET',
    });

    if (res.code === 0 && res.data) {
      const recipe = res.data;

      // 检查食谱是否已下架
      if (recipe.status !== 'ACTIVE') {
        uni.showModal({
          title: '提示',
          content: '该食谱已下架，无法再次购买',
          showCancel: false,
        });
        return;
      }

      // 构建完整参数用于自动配置
      const dogId = firstItem.dogId || '';
      const packageCount = firstItem.packageCount || 7;
      const packageSpecG = firstItem.packageSpecG || 100;

      // ✅ 修复：直接使用用户配置的 packageSpecG 作为每餐饭量
      // 而不是使用系统推荐值 (dailyIntakeG / mealsPerDay)
      const perMealG = packageSpecG;

      // 构建URL参数
      // Note: WeChat miniprogram doesn't support URLSearchParams
      const queryPairs = [
        `recipeId=${encodeURIComponent(recipeId)}`,
        `autoConfig=true`,
        `packageCount=${packageCount}`,
        `packageSpecG=${packageSpecG}`,
        `perMealG=${Math.round(perMealG)}`,
      ];
      if (dogId) {
        queryPairs.push(`dogId=${encodeURIComponent(dogId)}`);
      }
      const queryString = queryPairs.join('&');

      // 跳转到订购成品页
      uni.hideLoading();
      uni.navigateTo({
        url: `/pages/recipe-order/index?${queryString}`,
      });
    } else {
      throw new Error('获取食谱信息失败');
    }
  } catch (error) {
    console.error('Check recipe error:', error);
    uni.showToast({
      title: '检查食谱失败',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

// 判断是否可以申请售后
// Phase 9.1: paid orders can apply for aftersale throughout the fulfillment flow.
function canApplyAftersale(status: string): boolean {
  return (
    canApplyRefund(status) ||
    canApplyRemake(status) ||
    canApplyComplaint(status)
  );
}

function canApplyRefund(status: string): boolean {
  return [
    'PAID',
    'PURCHASING',
    'IN_PRODUCTION',
    'FREEZING',
    'SHIPPED',
    'COMPLETED',
  ].includes(status);
}

function canApplyRemake(status: string): boolean {
  return ['FREEZING', 'SHIPPED', 'COMPLETED'].includes(status);
}

function canApplyComplaint(status: string): boolean {
  return [
    'PAID',
    'PURCHASING',
    'IN_PRODUCTION',
    'FREEZING',
    'SHIPPED',
    'COMPLETED',
  ].includes(status);
}

// 计算总袋数
function getTotalPackageCount(): number {
  if (!order.value?.items) return 0;
  return order.value.items.reduce(
    (sum, item) => sum + (item.packageCount || 0),
    0,
  );
}

// 计算每袋单价（包含运费）
function calculatePricePerPackage(): string {
  if (!order.value?.amountTotal || !getTotalPackageCount()) return '0.00';
  const pricePerPackage = order.value.amountTotal / getTotalPackageCount();
  return pricePerPackage.toFixed(2);
}

// 获取售后类型文本
function getAftersaleTypeText(type?: string): string {
  const typeMap: Record<string, string> = {
    REFUND: '申请退款',
    REMAKE: '申请重做',
    COMPLAINT: '投诉建议',
    RESOLVED: '已解决',
  };
  return typeMap[type || ''] || '';
}

// 申请售后（统一入口）
function applyAftersaleType(type: 'REFUND' | 'REMAKE' | 'COMPLAINT') {
  if (type === 'REFUND') {
    const currentStatusText = order.value
      ? getStatusText(order.value.status)
      : '当前流程';
    uni.showModal({
      title: '申请退款前请确认',
      content: `订单已进入【${currentStatusText}】。建议您先联系客服沟通处理；如仍需退款，可继续提交退款理由，客服/管理员审核后处理。`,
      cancelText: '联系客服',
      confirmText: '继续退款',
      success: (res) => {
        if (res.confirm) {
          navigateToAftersaleApply(type);
        } else if (res.cancel) {
          contactService();
        }
      },
    });
    return;
  }

  navigateToAftersaleApply(type);
}

function navigateToAftersaleApply(type: 'REFUND' | 'REMAKE' | 'COMPLAINT') {
  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${orderId.value}&type=${type}`,
  });
}

// 预览售后图片
function previewAftersaleImage(index: number) {
  if (
    !order.value?.aftersalePhotos ||
    order.value.aftersalePhotos.length === 0
  ) {
    return;
  }

  uni.previewImage({
    current: index,
    urls: order.value.aftersalePhotos,
  });
}

// 预览原料照片
function previewProductionPhotos(index: number) {
  if (
    !order.value?.productionPhotos ||
    !order.value.productionPhotos.photos ||
    order.value.productionPhotos.photos.length === 0
  ) {
    return;
  }

  uni.previewImage({
    current: index,
    urls: order.value.productionPhotos.photos,
  });
}

// 申请售后（旧函数，保留向后兼容）
function applyAftersale() {
  applyAftersaleType('COMPLAINT');
}

// 申请退款（旧函数，保留向后兼容）
async function applyRefund() {
  applyAftersaleType('REFUND');
}
</script>

<style scoped>
.order-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.order-detail {
  padding: 20rpx;
}

/* 底部操作按钮 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 16rpx 20rpx;
  border-top: 1rpx solid #e5e5e5;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
  z-index: 100;
}

.action-buttons {
  display: flex;
  gap: 16rpx;
}

.btn-action {
  flex: 1;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  text-align: center;
}

.btn-cancel {
  background-color: #fff;
  color: #999;
  border: 1rpx solid #ddd;
}

.btn-primary {
  background-color: #1890ff;
  color: #fff;
}

.btn-secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.order-type-tag {
  font-size: 26rpx;
  color: #1890ff;
  margin-bottom: 20rpx;
  padding: 10rpx 20rpx;
  background-color: #fff;
  border-radius: 8rpx;
  display: inline-block;
  text-align: center;
}

.progress-section {
  background-color: #fff;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
}

.section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.order-center-section {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.order-center-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.order-center-title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.order-center-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #222;
  line-height: 1.35;
  word-break: break-word;
}

.order-center-subtitle {
  font-size: 24rpx;
  color: #8c8c8c;
  line-height: 1.4;
}

.order-center-status {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 700;
}

.order-center-goods {
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #f8fafc;
}

.goods-main {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.goods-cover,
.goods-cover-placeholder {
  width: 112rpx;
  height: 112rpx;
  border-radius: 10rpx;
  flex-shrink: 0;
}

.goods-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e6f7ff;
  color: #1890ff;
  font-size: 36rpx;
  font-weight: 700;
}

.goods-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.goods-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
  line-height: 1.4;
  word-break: break-word;
}

.goods-desc {
  font-size: 25rpx;
  color: #666;
  line-height: 1.45;
}

.goods-amount-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #e8edf3;
}

.goods-amount-label {
  font-size: 25rpx;
  color: #666;
}

.goods-amount-value {
  font-size: 36rpx;
  font-weight: 800;
  color: #ff4d4f;
}

.order-center-grid {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.order-center-cell,
.buyer-row,
.merchant-note-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.cell-label,
.buyer-label,
.merchant-note-label {
  flex-shrink: 0;
  min-width: 136rpx;
  font-size: 25rpx;
  color: #777;
}

.cell-value,
.buyer-value,
.merchant-note-value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 25rpx;
  color: #333;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.buyer-card,
.merchant-note-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #fafafa;
}

.address-line .buyer-value {
  text-align: right;
}

.remark-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.service-section {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.btn-service-contact {
  width: 100%;
  height: 82rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 12rpx;
  border: none;
  background-color: #07c160;
  color: #fff;
  font-size: 30rpx;
}

.btn-service-contact.secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.remark-textarea {
  width: 100%;
  min-height: 180rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border-radius: 12rpx;
  background-color: #f8fafc;
  font-size: 28rpx;
  line-height: 1.6;
  color: #333;
}

.remark-meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24rpx;
}

.remark-hint {
  flex: 1;
  font-size: 24rpx;
  color: #8c8c8c;
  line-height: 1.5;
}

.remark-count {
  font-size: 24rpx;
  color: #999;
  white-space: nowrap;
}

.remark-actions {
  display: flex;
  gap: 16rpx;
}

.remark-btn {
  flex: 1;
  height: 80rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}

.remark-btn.primary {
  background-color: #1890ff;
  color: #fff;
}

.remark-btn.secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.remark-btn[disabled] {
  opacity: 0.5;
}

.info-section {
  margin-bottom: 20rpx;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #666;
  margin-right: 20rpx;
  min-width: 150rpx;
}

.value {
  color: #333;
  flex: 1;
  word-break: break-all;
}

.address-value {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  line-height: 1.5;
  flex: 1;
}

.address-row {
  align-items: flex-start;
}

.address-content {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12rpx;
}

.address-actions {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex-shrink: 0;
}

.value-with-action {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.btn-edit {
  padding: 6rpx 16rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-edit::after {
  border: none;
}

.order-id {
  font-family: monospace;
  font-size: 26rpx;
}

.status {
  font-weight: 500;
}

.amount {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.settlement-section {
  margin-bottom: 20rpx;
}

.settlement-card {
  padding: 22rpx;
  border-radius: 12rpx;
  border-left: 6rpx solid #52c41a;
  background-color: #f6ffed;
}

.settlement-card.refund {
  border-left-color: #faad14;
  background-color: #fffbe6;
}

.settlement-card.extra-payment {
  border-left-color: #ff4d4f;
  background-color: #fff1f0;
}

.settlement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 12rpx;
}

.settlement-title {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
  word-break: break-word;
}

.settlement-status {
  flex-shrink: 0;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.8);
  font-size: 22rpx;
  color: #666;
}

.settlement-desc {
  display: block;
  font-size: 25rpx;
  line-height: 1.5;
  color: #666;
}

.settlement-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 18rpx;
}

.settlement-metric {
  min-width: 0;
  padding: 14rpx 10rpx;
  border-radius: 8rpx;
  background-color: rgba(255, 255, 255, 0.72);
  text-align: center;
}

.metric-label {
  display: block;
  font-size: 22rpx;
  color: #888;
  margin-bottom: 6rpx;
}

.metric-value {
  display: block;
  font-size: 25rpx;
  font-weight: 600;
  color: #333;
}

.settlement-adjustments {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.settlement-adjustment-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 12rpx;
  border-radius: 8rpx;
  background-color: rgba(255, 255, 255, 0.72);
}

.adjustment-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.adjustment-reason {
  font-size: 24rpx;
  line-height: 1.45;
  color: #333;
  word-break: break-word;
}

.adjustment-status {
  font-size: 22rpx;
  color: #888;
}

.adjustment-amount {
  flex-shrink: 0;
  font-size: 25rpx;
  font-weight: 700;
  white-space: nowrap;
}

.adjustment-amount.positive {
  color: #ff4d4f;
}

.adjustment-amount.negative {
  color: #fa8c16;
}

.btn-copy {
  padding: 8rpx 20rpx;
  background-color: #f0f0f0;
  color: #333;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

.btn-copy-address {
  padding: 8rpx 20rpx;
  background-color: #f0f0f0;
  color: #333;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
  flex-shrink: 0;
}

.btn-edit-secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.address-empty-text,
.address-lock-hint {
  font-size: 26rpx;
  color: #999;
  line-height: 1.5;
}

.address-action-btn {
  min-width: 180rpx;
  height: 64rpx;
  padding: 0 24rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.address-action-btn.primary {
  background-color: #1890ff;
  color: #fff;
}

.address-action-btn.secondary {
  background-color: #fff;
  color: #1890ff;
  border: 2rpx solid #d6e8ff;
}

.address-action-btn.full {
  width: 100%;
  margin-top: 20rpx;
}

.address-action-btn::after {
  border: none;
}

.address-modal-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 120;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.address-modal-panel {
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  background-color: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx;
  box-sizing: border-box;
}

.address-form-panel {
  padding-bottom: 48rpx;
}

.address-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28rpx;
}

.address-modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.address-modal-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  color: #999;
}

.address-modal-loading,
.address-modal-empty {
  min-height: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  color: #999;
  font-size: 28rpx;
}

.address-select-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.address-select-item {
  padding: 24rpx;
  border-radius: 12rpx;
  border: 2rpx solid #f0f0f0;
}

.address-select-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 10rpx;
}

.address-recipient-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.address-recipient-phone,
.address-select-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.address-default-tag {
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  background-color: #e6f7ff;
  color: #1890ff;
  font-size: 22rpx;
}

.address-form-item {
  margin-bottom: 24rpx;
}

.address-form-label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.address-form-input,
.address-form-picker,
.address-form-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 2rpx solid #eee;
  border-radius: 10rpx;
  background-color: #fafafa;
  font-size: 28rpx;
  color: #333;
}

.address-form-input,
.address-form-picker {
  height: 76rpx;
  padding: 0 20rpx;
}

.address-form-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.address-form-textarea {
  min-height: 150rpx;
  padding: 18rpx 20rpx;
}

.address-form-placeholder,
.address-picker-arrow {
  color: #999;
}

.address-form-switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12rpx 0 28rpx;
}

.compact-switch-wrap {
  width: 88rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  overflow: visible;
}

.compact-switch {
  transform: scale(0.72);
  transform-origin: right center;
}

.address-save-btn {
  width: 100%;
  height: 82rpx;
  border-radius: 12rpx;
  background-color: #1890ff;
  color: #fff;
  font-size: 30rpx;
  border: none;
}

.address-save-btn::after {
  border: none;
}

/* 商品明细 */
.dog-group {
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.dog-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* 狗狗信息卡片 */
.dog-info-card {
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.dog-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}

.dog-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.dog-gender {
  font-size: 22rpx;
  font-weight: normal;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
  color: #666;
  background-color: #f0f0f0;
}

.dog-divider {
  font-size: 22rpx;
  color: #ccc;
  margin: 0 4rpx;
}

.dog-detail {
  font-size: 24rpx;
  color: #666;
}

.order-item-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
}

.order-item-card:last-child {
  margin-bottom: 0;
}

/* 第1层：食谱基本信息 */
.item-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #e8e8e8;
  flex-wrap: wrap;
}

.recipe-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  flex-shrink: 0;
}

.recipe-version,
.nutrition-standard {
  font-size: 22rpx;
  padding: 4rpx 10rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.recipe-version {
  color: #666;
  background-color: #f0f0f0;
}

.nutrition-standard {
  color: #1890ff;
  background-color: #e6f7ff;
}

/* 第2层：订购信息 */
.package-info-card {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
  border-left: 3rpx solid #ff9800;
}

.package-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12rpx;
  gap: 16rpx;
}

.package-row:last-child {
  margin-bottom: 0;
}

.package-label {
  font-size: 26rpx;
  color: #666;
}

.package-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
  min-width: 0;
  flex: 1;
  word-break: break-all;
  overflow-wrap: anywhere;
  text-align: right;
}

.package-value.price {
  color: #ff4d4f;
  font-weight: bold;
  font-size: 28rpx;
}

/* 原料清单 */
.ingredients-section {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e8e8e8;
}

.ingredients-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.ingredients-title-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.ingredients-title {
  font-size: 26rpx;
  font-weight: 500;
  color: #333;
}

.ingredients-count {
  font-size: 22rpx;
  color: #999;
}

.expand-icon {
  font-size: 22rpx;
  color: #1890ff;
  padding: 4rpx 8rpx;
}

.ingredients-content {
  padding: 16rpx;
  background-color: #fafafa;
  border-radius: 8rpx;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.ingredients-content.expanded {
  max-height: 2000rpx;
}

.expand-hint {
  padding: 12rpx 16rpx;
  text-align: center;
  background-color: #fafafa;
  border-radius: 8rpx;
}

.hint-text {
  font-size: 22rpx;
  color: #999;
}

.ingredient-category {
  margin-bottom: 16rpx;
}

.ingredient-category:last-child {
  margin-bottom: 0;
}

.category-title {
  font-size: 24rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
  padding-left: 4rpx;
}

.ingredient-item {
  font-size: 24rpx;
  color: #666;
  line-height: 36rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  transition: background-color 0.2s;
}

.ingredient-item:active {
  background-color: #e8e8e8;
}

.ingredient-text {
  word-break: break-all;
}

/* 售后服务 */
.aftersale-section {
  margin-bottom: 20rpx;
}

.aftersale-buttons {
  display: flex;
  gap: 16rpx;
}

.btn-aftersale {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: none;
}

.btn-aftersale .btn-text {
  font-size: 26rpx;
  color: #333;
}

/* 评价及建议 */
.review-section {
  margin-bottom: 20rpx;
}

.review-rating {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.rating-label {
  font-size: 28rpx;
  color: #333;
  margin-right: 16rpx;
}

.star-rating {
  display: flex;
  gap: 8rpx;
}

.star {
  font-size: 48rpx;
  color: #ddd;
}

.star.active {
  color: #ffd700;
}

.review-content {
  margin-bottom: 24rpx;
}

.content-label {
  font-size: 28rpx;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
}

.review-textarea {
  width: 100%;
  min-height: 200rpx;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #e5e5e5;
}

.char-count {
  text-align: right;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.review-images {
  margin-bottom: 24rpx;
}

.images-label {
  font-size: 28rpx;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
}

.image-upload {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.image-item {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}

.uploaded-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.btn-remove-image {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 40rpx;
  height: 40rpx;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32rpx;
  line-height: 1;
}

.btn-add-image {
  width: 160rpx;
  height: 160rpx;
  background-color: #f9f9f9;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.add-icon {
  font-size: 60rpx;
  color: #999;
  line-height: 1;
}

.add-text {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}

.image-hint {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

.btn-submit-review {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
}

/* 物流信息 */
.transaction-id,
.tracking-number {
  font-family: monospace;
  font-size: 24rpx;
  word-break: break-all;
}

/* 支付方式提示 */
.payment-guide-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.payment-guide-card {
  padding: 24rpx;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%);
  border-radius: 12rpx;
  border-left: 4rpx solid #1890ff;
}

.guide-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.guide-icon {
  font-size: 32rpx;
}

.guide-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #1890ff;
}

.order-amount-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  margin-bottom: 20rpx;
}

.amount-label {
  font-size: 26rpx;
  color: #666;
}

.amount-value {
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.payment-deadline-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.deadline-label {
  font-size: 26rpx;
  color: #666;
}

.deadline-value {
  font-size: 32rpx;
  font-weight: 700;
  color: #ff4d4f;
  font-family: monospace;
}

.guide-steps {
  margin-bottom: 24rpx;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.step-item:last-child {
  margin-bottom: 0;
}

.step-number {
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  background-color: #1890ff;
  color: #fff;
  border-radius: 50%;
  font-size: 22rpx;
  font-weight: bold;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  line-height: 36rpx;
}

.wechat-contact,
.order-id-copy {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.contact-label,
.order-id-label {
  font-size: 26rpx;
  color: #666;
}

.contact-value,
.order-id-value {
  flex: 1;
  font-size: 26rpx;
  color: #1890ff;
  font-weight: bold;
  font-family: monospace;
}

.btn-copy-wechat,
.btn-copy-order-id {
  padding: 8rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

.payment-tip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
}

.tip-icon {
  font-size: 28rpx;
}

.tip-text {
  flex: 1;
  font-size: 24rpx;
  color: #ff9800;
  line-height: 1.5;
}

/* 原料照片样式 */
.production-photos-section {
  margin-bottom: 20rpx;
}

.production-photos {
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.production-photo-item {
  width: 220rpx;
  height: 220rpx;
  border-radius: 8rpx;
}

.photos-hint {
  font-size: 24rpx;
  color: #999;
  text-align: center;
  padding-top: 8rpx;
}

.photos-time {
  font-size: 24rpx;
  color: #999;
  font-weight: normal;
  margin-left: auto;
}

/* 分享按钮样式 */
.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.section-title-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.section-title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.btn-share-photos {
  padding: 12rpx 24rpx;
  background-color: #007aff;
  color: #fff;
  font-size: 26rpx;
  border-radius: 8rpx;
  border: none;
  line-height: 1.4;
}

.btn-share-photos::after {
  border: none;
}
</style>
