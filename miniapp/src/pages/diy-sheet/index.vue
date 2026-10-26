<template>
  <view class="diy-sheet-page">
    <!-- 1. 食谱信息卡片 -->
    <view class="section recipe-info-section">
      <view class="recipe-cover-wrapper">
        <image
          v-if="recipe.coverImageUrl"
          :src="normalizeImageUrl(recipe.coverImageUrl)"
          class="recipe-cover"
          mode="aspectFill"
        />
        <view v-else class="recipe-cover-placeholder">
          <text class="placeholder-text">食谱封面</text>
        </view>
      </view>

      <view class="recipe-details">
        <text class="recipe-name">{{ recipe.name }}</text>

        <!--
          营养标准背书卡：与 DIY 配置页同一展示方式。
          原来这里是两行平铺的参数（含内部系统名），顾客用不到，现已收敛为一张背书卡。
        -->
        <view class="standard-card" @tap="toggleStandardExplain">
          <view class="standard-main">
            <text class="standard-badge">✓</text>
            <view class="standard-copy">
              <text class="standard-title">符合 {{ recipeNutritionStandardLabel }}</text>
              <text class="standard-sub">犬营养标准</text>
            </view>
          </view>
          <text class="standard-toggle">{{ standardExplainVisible ? '收起' : '说明' }}</text>
        </view>
        <view v-if="standardExplainVisible" class="standard-explain">
          <text class="standard-explain-text">{{ nutritionStandardExplain }}</text>
        </view>
      </view>
    </view>

    <!--
      生命阶段提醒（静态）· 2026-10-18 改用共享组件

      顾客在 DIY 页点「生成制作单」时已经确认过并留痕，这里**不再要求确认**，
      只把结论留在页面上作为记录 —— 避免同一个提醒反复打断。
      所以只给 variant="warning"，不给任何动作按钮。
    -->
    <LifeStageVersionCard
      v-if="!isLifeStageMatch && dog"
      variant="warning"
      :match-type="lifeStageVerdict?.matchType"
      :message="lifeStageVerdict?.message"
      :selected-label="lifeStageVerdict?.selectedLifeStage"
      :dog-name="lifeStageVerdict?.dogName || dog?.name"
    />

      <!-- 后端结论没取到：不静默放行，给一条中性提示 -->
      <view v-if="lifeStageCheckFailed" class="life-stage-unknown-note">
        <text class="life-stage-unknown-text">
          暂时无法确认这份食谱是否适合当前狗狗，建议稍后重试或联系客服。
        </text>
      </view>

    <!-- 2. 制作清单（标题拿掉：导航栏已经叫 DIY制作单） -->
    <view class="section purchase-list-section">
      <view class="purchase-list-content">
        <!-- 狗狗信息：标签 + 数值卡片，一眼可读 -->
        <view v-if="dog" class="purchase-facts">
          <view class="purchase-facts-head">
            <text class="purchase-facts-title">爱犬信息</text>
          </view>
          <view class="purchase-facts-grid">
            <view
              v-for="fact in dogPurchaseFacts"
              :key="'dog-fact-' + fact.label"
              class="purchase-fact"
            >
              <text class="purchase-fact-label">{{ fact.label }}</text>
              <text class="purchase-fact-value">{{ fact.value }}</text>
            </view>
          </view>
        </view>

        <!-- 制作信息：标签 + 数值卡片 -->
        <view class="purchase-facts">
          <view class="purchase-facts-head">
            <text class="purchase-facts-title">制作信息</text>
          </view>
          <view class="purchase-facts-grid">
            <view
              v-for="fact in makingPurchaseFacts"
              :key="'making-fact-' + fact.label"
              class="purchase-fact"
            >
              <text class="purchase-fact-label">{{ fact.label }}</text>
              <text class="purchase-fact-value">{{ fact.value }}</text>
            </view>
          </view>
        </view>

        <!-- 食材 -->
        <view v-if="foodItemsDetailed.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">食材</view>
          <view class="ingredient-table">
            <view class="table-header food-table">
              <text class="header-item name-col">原料</text>
              <text class="header-item recommend-col">{{ DIY_SHEET_FOOD_RECOMMENDATION_LABEL }}</text>
              <text class="header-item method-col">部位 / 状态 / 预处理</text>
              <text class="header-item actual-col">净重</text>
            </view>
            <view v-for="(item, idx) in foodItemsDetailed" :key="'food-' + idx" class="table-row food-table">
              <text class="row-item name-col">{{ item.ingredientName }}</text>
              <view
                v-if="item.selectedProductDisplayText !== '-' && item.hasSpecDetail"
                class="row-item recommend-col recommend-choice"
              >
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
                <text
                  v-if="item.choiceLabel"
                  class="recommend-badge"
                  :class="{ 'recommend-badge-replace': item.allRecommendedProducts && item.allRecommendedProducts.length > 1 }"
                  @tap.stop="showSpecModal(item)"
                >
                  {{ item.choiceLabel }}
                </text>
              </view>
              <view v-else class="row-item recommend-col">
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
              </view>
              <text class="row-item method-col">{{ item.preparationMethod || '—' }}</text>
              <text class="row-item actual-col highlight">
                {{ item.netAmountStr }}
              </text>
            </view>
            <!-- 合计行 -->
            <view class="table-row total-row food-table">
              <text class="row-item name-col total-label">合计净重</text>
              <text class="row-item recommend-col">-</text>
              <text class="row-item method-col">-</text>
              <text class="row-item actual-col total-value highlight">{{ foodItemsTotal.netAmountStr }}</text>
            </view>
          </view>
        </view>

        <!-- 补剂候选获取失败：给一个可点的重试，不阻塞制作单 -->
        <view v-if="supplementCandidateError" class="ingredient-group">
          <view class="ingredient-category-title">营养补充剂</view>
          <view class="production-only-note">
            <text>补剂候选暂时获取失败，</text>
            <button class="supplement-buy-note-btn" @tap="retrySupplementCandidates">点击重试</button>
          </view>
        </view>

        <!-- 补剂类：需额外补充的营养 -->
        <view v-if="supplementItemsDetailed.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">营养补充剂</view>
          <view class="ingredient-table">
            <view class="table-header supplement-table">
              <text class="header-item product-col">补剂名称</text>
              <text class="header-item brand-col">{{ DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL }}</text>
              <text class="header-item timing-col">建议添加时机</text>
              <text class="header-item dosage-col">制作单总量</text>
            </view>
            <view v-for="(item, idx) in supplementItemsDetailed" :key="'supp-' + idx" class="table-row supplement-table">
              <view class="row-item product-col">
                <text>{{ item.name }}</text>
                <text v-if="item.purchasable === false" class="production-only-tag">仅生产，不可购买</text>
              </view>
              <view
                v-if="item.hasSpecDetail"
                class="row-item brand-col recommend-choice"
              >
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
                <text
                  v-if="item.choiceLabel"
                  class="recommend-badge"
                  :class="{ 'recommend-badge-replace': item.allRecommendedProducts && item.allRecommendedProducts.length > 1 }"
                  @tap.stop="showSpecModal(item)"
                >
                  {{ item.choiceLabel }}
                </text>
              </view>
              <view v-else class="row-item brand-col">
                <text class="recommend-main">{{ item.selectedProductDisplayText }}</text>
              </view>
              <text class="row-item timing-col">{{ item.preparationMethod }}</text>
              <view
                class="row-item dosage-col highlight amount-detail-cell"
                @tap.stop="showNutritionInfoModal(item)"
              >
                <text class="amount-detail-value">{{ item.amountStr }}</text>
                <text class="amount-detail-hint">详情</text>
              </view>
            </view>
          </view>
          <view v-if="supplementItemsDetailed.some((item: any) => item.purchasable === false)" class="production-only-note">
            <text>部分补剂仅用于生产，不会进入补剂购买单。</text>
          </view>
        </view>

        <!-- 补剂购买引导（2026-10-24）：不想全买，可以只买本次制作的一次性预分装补剂 -->
        <view v-if="canBuySupplements" class="supplement-buy-note">
          <text class="supplement-buy-note-text">不想购买所有的商品补剂？</text>
          <view class="supplement-buy-note-line">
            <text class="supplement-buy-note-text">可以购买本次制作需要的</text>
            <button class="supplement-buy-note-btn" @tap="handleBuySupplements">一次性预分装补剂</button>
            <text class="supplement-buy-note-text">。</text>
          </view>
        </view>

        <!--
          补剂入口不可用时的说明；可购买时按钮在底部固定栏（购买预分装补剂）。
          说明不再静默消失：接口失败可点击重试。
        -->
        <view
          v-if="supplementItemsDetailed.length > 0 && supplementShopStatus === 'failed'"
          class="supplement-unavailable-card"
          @tap="handleSupplementStatusRetry"
        >
          <text class="supplement-unavailable-text">{{ supplementUnavailableText }}</text>
        </view>
        <view
          v-else-if="supplementItemsDetailed.length > 0 && supplementShopStatus === 'disabled'"
          class="supplement-unavailable-card"
        >
          <text class="supplement-unavailable-text">{{ supplementUnavailableText }}</text>
        </view>

        <!-- 无数据提示 -->
        <view v-if="foodItemsDetailed.length === 0 && supplementItemsDetailed.length === 0" class="no-data">
          <text class="no-data-text">暂无用量数据</text>
        </view>
      </view>
    </view>

    <!-- 3. 制作步骤：结构化步骤优先，老的整段文字兜底 -->
    <view class="section production-steps-section" v-if="displaySteps.length">
      <view class="section-title">
        <text class="title-text">制作步骤</text>
      </view>
      <view class="steps-content">
        <view v-for="step in displaySteps" :key="step.order" class="step-row">
          <text class="step-index">{{ step.order }}</text>
          <view class="step-body">
            <text class="step-instruction">{{ step.instruction }}</text>
            <text v-if="step.meta" class="step-meta">{{ step.meta }}</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      不想自己做？订购成品（2026-10-24）

      位置放在制作步骤之后、储存和烹饪之前（2026-10-24 老板定）：
      顾客刚看完做法，正是最想偷懒的时候；先给成品出口，再讲储存。
      带这份食谱和这只狗，成品页不用再选一次。
    -->
    <view v-if="recipeId" class="finished-food-card">
      <view class="finished-food-copy">
        <text class="finished-food-title">不想自己做？</text>
        <text class="finished-food-desc">这份配方也能做成成品，冷链送到家。</text>
      </view>
      <button class="finished-food-btn" @tap="goFinishedFood">
        订购成品
      </button>
    </view>

    <!-- 3.5 储存和烹饪（2026-10-24 全店统一文案） -->
    <view class="section storage-cooking-section">
      <view class="section-title">
        <text class="title-text">储存和烹饪</text>
      </view>
      <view class="guide-card">
        <view class="guide-row">
          <text class="guide-label">储存</text>
          <text class="guide-text">分装建议用食品真空袋抽真空；-18℃ 冷冻保存 6 个月，0-4℃ 冷藏保存 3 天，开封后 3 小时内吃完。</text>
        </view>
        <view class="guide-row">
          <text class="guide-label">烹饪</text>
          <text class="guide-text">建议蒸、炖、低温慢煮；不建议微波、烤、煎等高温烹饪。</text>
        </view>
      </view>
    </view>

    <!--
      4-8. 固定文案卡片
      制作设备推荐 2026-10-24 暂时下线：代码保留，等做好后把
      SHOW_EQUIPMENT_RECOMMENDATION 改成 true 即可恢复。
    -->
    <view v-if="SHOW_EQUIPMENT_RECOMMENDATION" class="info-cards-grid">
      <!--
        制作设备推荐（2026-10-18 重新打开）

        附录 B #12：**功能做完了但被关掉**（`v-if="false"`），要重新打开。

        决策依据 V56（2026-10-17）：老板说"也需要有制作设备推荐的板块"，
        并且要求**交付页也加**。

        数据来自 `/global-config` 的 `equipmentRecommendations`（全局配置，
        不是每份食谱不同），内容由后台维护；没配时有一份默认清单兜底。
      -->
      <view class="info-card equipment-card" @tap="handleShowEquipmentList">
        <view class="card-title">
          <text class="title-text">制作设备推荐</text>
          <text class="view-more">查看详情 →</text>
        </view>
        <view class="equipment-list">
          <view
            v-for="equipment in equipmentRecommendations"
            :key="equipment.id"
            class="equipment-item"
          >
            <image
              v-if="equipment.imageUrl"
              :src="equipment.imageUrl"
              class="equipment-icon"
              mode="aspectFill"
            />
            <view v-else class="equipment-icon-placeholder">
              <text class="placeholder-icon">{{ equipment.name.charAt(0) }}</text>
            </view>
            <text class="equipment-name">{{ equipment.name }}</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      底部固定操作栏：购买补剂 / 保存 / 分享
      · 原来分开的「出图」与「存档」两个按钮已合并为一个「保存」，
        点击后由顾客选择「保存为图片」还是「保存到收藏夹」。
      · 购买预分装补剂的入口从清单里挪到这里，任何滚动位置都能点到。
    -->
    <view class="bottom-actions">
      <!-- 客服：圆形图标，放最左侧（2026-10-24） -->
      <CustomerServiceInlineButton
        v-if="recipeId"
        class="bottom-service"
        icon-only
        :source-type="orderId ? 'ORDER' : 'GENERAL'"
        :order-id="orderId"
        :order-no="orderId"
        :title="orderId ? `定制订单 ${orderId}` : 'DIY 制作咨询'"
        path="/pages/diy-sheet/index"
      />

      <button
        v-if="canBuySupplements"
        class="action-btn buy"
        @tap="handleBuySupplements"
      >
        <text class="btn-text">购买预分装补剂</text>
      </button>

      <button
        class="action-btn secondary"
        :disabled="!isPageDataLoaded || isGeneratingImage"
        @tap="handleSaveMenu"
      >
        <text class="btn-text">{{ isGeneratingImage ? '生成中…' : '保存' }}</text>
      </button>

      <!--
        分享按钮重新绘制：不再用字体符号，改成用 CSS 画出的「托盘 + 上箭头」图标，
        且不再带中文，只保留图标本身。
      -->
      <button class="action-btn share" open-type="share" aria-role="button" aria-label="分享">
        <view class="share-icon">
          <view class="share-icon-shaft"></view>
          <view class="share-icon-head"></view>
          <view class="share-icon-tray"></view>
        </view>
      </button>
    </view>

    <!-- Canvas用于打印功能（隐藏） - A4竖版: 1200px × 1697px，2倍像素导出 -->
    <canvas
      canvas-id="printCanvas"
      id="printCanvas"
      class="print-canvas"
      :width="PRINT_CANVAS_OUTPUT_WIDTH"
      :height="printCanvasOutputHeight"
      :style="printCanvasStyle"
    ></canvas>

    <!-- 规格详情弹窗 -->
    <view v-if="showSpec" class="spec-modal" @tap="closeSpecModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">{{ DIY_SHEET_SPEC_MODAL_TITLE }}</text>
          <text class="btn-close" @tap="closeSpecModal">✕</text>
        </view>
        <!-- 有多个推荐产品时：展示产品卡片列表（2026-10-24 交互改版） -->
        <view v-if="currentSpec.allRecommendedProducts && currentSpec.allRecommendedProducts.length > 1" class="spec-body">
          <view class="rp-cards-list">
            <view
              v-for="(rp, rpIdx) in currentSpec.allRecommendedProducts"
              :key="rp.ingredientId || rp.id || rpIdx"
              class="rp-card"
              :class="{ 'rp-card-active': rpIdx === modalSelectedRpIndex }"
              @tap="selectRecommendedProduct(modalSelectionKey, rpIdx)"
            >
              <view class="rp-card-header">
                <text class="rp-card-name">{{ rp.name }}</text>
                <!-- 选中状态：右上角打勾（不再用"已选"文字角标） -->
                <text v-if="rpIdx === modalSelectedRpIndex" class="rp-card-check">✓</text>
              </view>

              <view class="rp-card-main">
                <view class="rp-card-body">
                  <view v-if="rp.brand" class="rp-card-field">
                    <text class="rp-card-field-label">品牌</text>
                    <text class="rp-card-field-value">{{ rp.brand }}</text>
                  </view>
                  <view v-if="rp.productModel" class="rp-card-field">
                    <text class="rp-card-field-label">规格</text>
                    <text class="rp-card-field-value">{{ rp.productModel }}</text>
                  </view>
                  <view v-if="supplementFormLabel(rp.physicalForm)" class="rp-card-field">
                    <text class="rp-card-field-label">形态</text>
                    <text class="rp-card-field-value">{{ supplementFormLabel(rp.physicalForm) }}</text>
                  </view>
                  <view v-if="rp.dosage && rp.dosage.amount !== null" class="rp-card-field">
                    <text class="rp-card-field-label">换算用量</text>
                    <text class="rp-card-field-value">
                      {{ formatSupplementAmountWithDisplayUnit(rp.dosage.amount, rp.displayUnit, rp.displayUnit) }}
                    </text>
                  </view>
                  <view v-if="getSpecPurchaseChannelDisplay(rp)" class="rp-card-field">
                    <text class="rp-card-field-label">推荐购买渠道</text>
                    <text class="rp-card-field-value">{{ getSpecPurchaseChannelDisplay(rp) }}</text>
                  </view>
                </view>

                <!-- 有图：图在右侧，按钮在图下方整行展示 -->
                <view v-if="rp.imageUrl" class="rp-card-aside">
                  <view class="rp-card-media">
                    <view
                      v-if="!isProductImageLoaded(productImageKey('card', rp))"
                      class="rp-card-image-skeleton"
                    ></view>
                    <image
                      :src="getOptimizedProductImageUrl(rp.imageUrl)"
                      class="rp-card-image"
                      mode="aspectFill"
                      lazy-load
                      @load="markProductImageLoaded(productImageKey('card', rp))"
                      @error="markProductImageLoaded(productImageKey('card', rp))"
                    />
                  </view>
                </view>

                <!-- 无图：按钮在右侧竖排、垂直居中 -->
                <view v-else class="rp-card-aside rp-card-aside--actions">
                  <view class="rp-card-actions rp-card-actions--stacked">
                    <button
                      v-if="rp.purchaseLink?.url"
                      class="btn-purchase btn-purchase-sm"
                      @tap.stop="handlePurchase(rp.purchaseLink, rp.name)"
                    >去购买</button>
                    <button
                      class="btn-confirm-select"
                      @tap.stop="confirmProductSelection(rpIdx)"
                    >确认选择</button>
                  </view>
                </view>
              </view>

              <view v-if="rp.imageUrl" class="rp-card-actions rp-card-actions--row">
                <button
                  v-if="rp.purchaseLink?.url"
                  class="btn-purchase btn-purchase-sm"
                  @tap.stop="handlePurchase(rp.purchaseLink, rp.name)"
                >去购买</button>
                <button
                  class="btn-confirm-select"
                  @tap.stop="confirmProductSelection(rpIdx)"
                >确认选择</button>
              </view>
            </view>
          </view>
        </view>
        <!-- 只有1个或没有推荐产品时：原有展示 -->
        <view v-else class="spec-body">
          <view class="spec-detail-main">
            <view class="spec-detail-body">
              <view class="spec-detail-field">
                <text class="spec-detail-field-label">商品名称</text>
                <text class="spec-detail-field-value">{{ currentSpec.name }}</text>
              </view>
              <view class="spec-detail-field">
                <text class="spec-detail-field-label">品牌</text>
                <text class="spec-detail-field-value">{{ currentSpec.brand }}</text>
              </view>
              <view v-if="currentSpec.productModel" class="spec-detail-field">
                <text class="spec-detail-field-label">规格</text>
                <text class="spec-detail-field-value">{{ currentSpec.productModel }}</text>
              </view>
              <view v-if="getSpecPurchaseChannelDisplay(currentSpec)" class="spec-detail-field">
                <text class="spec-detail-field-label">推荐购买渠道</text>
                <text class="spec-detail-field-value">{{ getSpecPurchaseChannelDisplay(currentSpec) }}</text>
              </view>
            </view>
            <view class="spec-detail-aside">
              <view v-if="currentSpec.imageUrl" class="spec-image-block">
                <view
                  v-if="!isProductImageLoaded(productImageKey('single', currentSpec))"
                  class="spec-image-skeleton"
                ></view>
                <image
                  :src="getOptimizedProductImageUrl(currentSpec.imageUrl)"
                  class="spec-image"
                  mode="aspectFill"
                  lazy-load
                  @load="markProductImageLoaded(productImageKey('single', currentSpec))"
                  @error="markProductImageLoaded(productImageKey('single', currentSpec))"
                />
              </view>
              <!-- 无图：两个按钮在右侧竖排、垂直居中 -->
              <view v-if="!currentSpec.imageUrl" class="rp-card-actions rp-card-actions--stacked">
                <button
                  v-if="currentSpec.purchaseLink?.url"
                  class="btn-purchase btn-purchase-sm"
                  @tap="handlePurchase(currentSpec.purchaseLink, currentSpec.name)"
                >
                  去购买
                </button>
                <button class="btn-confirm-select" @tap="confirmSingleProductSelection">
                  确认选择
                </button>
              </view>
            </view>
          </view>
          <!-- 有图：按钮在缩略图下方整行展示 -->
          <view v-if="currentSpec.imageUrl" class="rp-card-actions rp-card-actions--row">
            <button
              v-if="currentSpec.purchaseLink?.url"
              class="btn-purchase btn-purchase-sm"
              @tap="handlePurchase(currentSpec.purchaseLink, currentSpec.name)"
            >
              去购买
            </button>
            <button class="btn-confirm-select" @tap="confirmSingleProductSelection">
              确认选择
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 营养信息弹窗 -->
    <view v-if="showNutritionInfo" class="spec-modal" @tap="closeNutritionInfoModal">
      <view class="spec-content" @tap.stop>
        <view class="spec-header">
          <text class="spec-title">营养信息</text>
          <text class="btn-close" @tap="closeNutritionInfoModal">✕</text>
        </view>
        <view class="spec-body">
          <view class="spec-row">
            <text class="spec-label">补剂名称：</text>
            <text class="spec-value">{{ currentNutritionInfo.name }}</text>
          </view>
          <view class="spec-row">
            <text class="spec-label">制作单总量：</text>
            <text class="spec-value">{{ currentNutritionInfo.amountStr }}</text>
          </view>
          <view v-if="currentNutritionInfo.targetSummary" class="spec-divider"></view>
          <view v-if="currentNutritionInfo.targetSummary" class="spec-row">
            <text class="spec-label">营养目标：</text>
            <text class="spec-value">{{ currentNutritionInfo.targetSummary }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 设备推荐列表弹窗 -->
    <view v-if="showEquipmentList" class="equipment-modal" @tap="closeEquipmentListModal">
      <view class="equipment-modal-content" @tap.stop>
        <view class="equipment-modal-header">
          <text class="equipment-modal-title">制作设备推荐</text>
          <text class="btn-close" @tap="closeEquipmentListModal">✕</text>
        </view>
        <view class="equipment-modal-body">
          <scroll-view scroll-y class="equipment-scroll">
            <view
              v-for="equipment in equipmentRecommendations"
              :key="equipment.id"
              class="equipment-detail-item"
              @tap="handleShowEquipmentDetail(equipment)"
            >
              <view class="equipment-detail-header">
                <image
                  v-if="equipment.imageUrl"
                  :src="equipment.imageUrl"
                  class="equipment-detail-image"
                  mode="aspectFill"
                />
                <view v-else class="equipment-detail-image-placeholder">
                  <text class="placeholder-text-large">{{ equipment.name.charAt(0) }}</text>
                </view>
                <view class="equipment-detail-info">
                  <text class="equipment-detail-name">{{ equipment.name }}</text>
                  <text v-if="equipment.brand" class="equipment-detail-brand">推荐品牌：{{ equipment.brand }}</text>
                  <text v-if="equipment.specification" class="equipment-detail-spec">规格：{{ equipment.specification }}</text>
                </view>
              </view>
              <view v-if="equipment.reason" class="equipment-detail-reason">
                <text class="reason-label">推荐理由：</text>
                <text class="reason-text">{{ equipment.reason }}</text>
              </view>
              <view v-if="equipment.purchaseLink" class="equipment-detail-action">
                <button
                  class="btn-purchase-equipment"
                  @tap.stop="handlePurchaseEquipment(equipment)"
                >
                  去购买
                </button>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>

    <!-- 图片预览弹窗 -->
    <ImagePreviewModal
      :visible="showImagePreview"
      :image-url="previewImageUrl"
      @update:visible="showImagePreview = $event"
      @save="handleSaveImage"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  fetchSupplementShopStatus,
  saveSupplementPurchaseDraft
} from '../../api/supplements'
import { PrintCanvasBuilder, type CanvasImageInfo } from '../../utils/print-canvas'
import {
  buildLifeStageReminderText,
  fetchLifeStageMatch,
  getLifeStageLabel,
  isLifeStageMismatch,
  type LifeStageMatchVerdict
} from '../../utils/life-stage-match'
import ImagePreviewModal from '../../components/ImagePreviewModal.vue'
import LifeStageVersionCard from '@/components/recipe/LifeStageVersionCard.vue'
import CustomerServiceInlineButton from '../../components/CustomerServiceInlineButton.vue'
import { buildFinishedFoodOrderUrl } from '../../utils/custom-recipe-delivery'
import { useLifeStageVersion } from '@/composables/useLifeStageVersion'
import { normalizeImageUrl, getOptimizedProductImageUrl } from '../../utils/config'
import { formatSupplementAmountWithDisplayUnit } from '../../utils/diy-sheet-format'
import { getPackagePlanTotal, type PackagePlanItem } from '../../utils/order-package-plan'
import { getNutritionStandardExplain } from '../../utils/label-mapping'
import {
  formatSupplementTargets
} from '../../utils/supplement-nutrients'
import {
  buildSupplementPurchaseLines,
  buildSupplementRows,
  buildSupplementSelections,
  selectionsFromSaved,
  type ServerCandidateItem
} from './supplement-candidates'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  formatFoodSelectedProductDisplayText,
  formatRecommendationActionLabel,
  getPurchaseTipByPlatform,
  getSpecRecommendedPurchaseChannelDisplay
} from './copy'
import {
  buildFallbackFoodIngredientItems,
  collectFoodIngredientIdsForRecommendations
} from './fallback'

// 页面参数
const recipeId = ref('')
/**
 * 定制订单号（2026-10-24）：从定制食谱进来时带着，
 * 取食谱与生成补剂草稿都按交付那一版；橱窗 DIY 为空，行为不变。
 */
const orderId = ref('')
const shareToken = ref('')
const dogId = ref('')
const cycleDays = ref(7)
const perMealG = ref(0)
const dailyIntakeG = ref(0)
const packagePlan = ref<PackagePlanItem[]>([])
// 补剂商城状态：
//   loading  —— 还在查，什么都不展示，避免闪烁
//   enabled  —— 开放，展示购买入口
//   disabled —— 明确关闭，展示中性说明而不是静默隐藏
//   failed   —— 接口异常，展示可重试的说明
const supplementShopStatus = ref<'loading' | 'enabled' | 'disabled' | 'failed'>('loading')
const supplementShopEnabled = computed(() => supplementShopStatus.value === 'enabled')

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 数据
const dog = ref<any>(null)  // 狗狗信息
const recipe = ref<any>({
  id: '',
  name: '',
  coverImageUrl: '',
  nutritionStandard: '',
  designSource: '',
  applicableLifeStages: [],
  targetHealthTags: [],
  productionSteps: '',
  productionStepsList: []
})
const pricePreview = ref<any>(null)

// 推荐产品映射 { ingredientId: RecommendedProduct[] }
const recommendedProductsMap = ref<Record<string, any[]>>({})

// UI状态
// 规格弹窗状态
const showSpec = ref(false)
const currentSpec = ref<any>({})
const modalSelectedRpIndex = ref(0)
/** 商品图加载状态：加载前显示骨架，避免弹窗一打开就是一片空白 */
const loadedProductImageKeys = ref<Record<string, boolean>>({})
const modalSelectionKey = ref('')

// 用量详情弹窗状态

// 营养信息弹窗状态
const showNutritionInfo = ref(false)
const currentNutritionInfo = ref<any>({})

// 设备推荐相关状态
/**
 * 制作设备推荐开关（2026-10-24 暂时下线）。
 * 代码与数据都保留；做好后把这里改成 true 即恢复，不需要改模板。
 */
const SHOW_EQUIPMENT_RECOMMENDATION = false

const equipmentRecommendations = ref<any[]>([])
const diySheetHeaderBgImageUrl = ref('')
/** 当前制作单 id：首次买补剂时要带给后端冻结快照 */
const currentDiySheetId = ref('')
const showEquipmentList = ref(false)
const currentEquipmentDetail = ref<any>(null)

// 每个原料当前选中的推荐产品索引 { ingredientId: index }
const selectedRpIndexMap = ref<Record<string, number>>({})
/** 服务端算好的补剂候选（新协议） */
const supplementCandidateItems = ref<ServerCandidateItem[]>([])
/** 每条补剂当前选中的原料：recipeItemId -> ingredientId */
const selectedSupplementIngredientMap = ref<Record<string, string>>({})
/** 制作单存档里恢复出来的选择 */
const savedSupplementSelections = ref<Record<string, string>>({})
const supplementCandidateError = ref(false)

// 图片预览弹窗状态
const showImagePreview = ref(false)
const previewImageUrl = ref('')
const isPageDataLoaded = ref(false)
const isGeneratingImage = ref(false)

const PRINT_CANVAS_LOGICAL_WIDTH = 1200
const PRINT_CANVAS_LOGICAL_HEIGHT = 1697
const PRINT_CANVAS_OUTPUT_SCALE = 2
const PRINT_CANVAS_OUTPUT_WIDTH = PRINT_CANVAS_LOGICAL_WIDTH * PRINT_CANVAS_OUTPUT_SCALE
const PRINT_CANVAS_OUTPUT_HEIGHT = PRINT_CANVAS_LOGICAL_HEIGHT * PRINT_CANVAS_OUTPUT_SCALE
/** 画布底部为页脚预留的高度 */
const PRINT_CANVAS_FOOTER_SPACE = 60

/**
 * 画布高度按内容自适应（不再固定 A4）：
 * canvas 不会自动分页，内容超出就被裁掉，裁掉的偏偏是最下面的储存提示和页脚。
 * 所以先画一遍量出内容高度，再决定画布多高、重画一次。
 */
const printCanvasLogicalHeight = ref(PRINT_CANVAS_LOGICAL_HEIGHT)
const printCanvasOutputHeight = computed(
  () => printCanvasLogicalHeight.value * PRINT_CANVAS_OUTPUT_SCALE
)
const printCanvasStyle = computed(() => ({
  width: `${PRINT_CANVAS_OUTPUT_WIDTH}px`,
  height: `${printCanvasOutputHeight.value}px`
}))

// 全局配置中的补剂损耗率（默认5%）
const packagePlanTotal = computed(() => getPackagePlanTotal(packagePlan.value))
const totalFoodNetWeightG = computed(() => packagePlanTotal.value.totalGrams || dailyIntakeG.value * cycleDays.value)

/**
 * 这一批实际覆盖多少天（2026-09-24）。
 *
 * 为什么不能直接用 cycleDays：
 *   启用「自定义分装」后，食物总量由**包规**决定，recipe-diy 页也明确提示
 *   「上方天数选择暂不生效」。此时 cycleDays 只是用户之前选的一个数，
 *   **跟这批食物没关系**。而补剂用量是按**整批食物总重**配的
 *   （见 supplementNutrientBaseWeightG），所以天数必须按这批的实际消耗反推，
 *   否则补剂下单页会显示错误的天量，服务端「总天数 ≤ 效期安全线」也会算错。
 *
 * 口径：**总袋数 ÷ 狗狗每天餐数**（默认一餐一袋）。
 *
 * ⚠️ 这里踩过一次坑，别再改回「总重 ÷ 每日摄入」：
 *   那个口径隐含"用户会按配方建议的每餐克数喂"，但自定义分装的意义恰恰是
 *   用户自己定袋规。实测案例：30 袋 × 100g = 3000g，配方建议 140g/餐（日摄入 280g），
 *   按总重口径算出 11 天；但用户是按"每天 2 袋"喂的，实际能吃 3000 ÷ 200 = 15 天。
 *   补剂配的是那 3000g 食物，食物吃多久补剂就吃多久 —— **15 才是对的**。
 *
 * 用「袋数 ÷ 餐数」还有一个好处：包规默认每袋 = perMealG，所以默认情况下
 * 它算出来正好等于用户选的天数，不会凭空变化。
 */
const effectiveCycleDays = computed(() => {
  const bags = packagePlanTotal.value.totalPackages
  // 餐数一律从狗狗档案取。这里曾经写成 mealsPerDay.value —— 本文件根本没有这个
  // 绑定，取值时直接抛 ReferenceError，导致「一键购买补剂」点了没反应。
  const meals = Number(dog.value?.mealsPerDay) || 0
  if (bags > 0 && meals > 0) {
    const days = Math.round(bags / meals)
    if (days > 0) return days
  }

  // 没有包规（普通模式）：总量就是"每日摄入 × 天数"，反推即天数
  const intake = Number(dailyIntakeG.value) || 0
  if (intake <= 0) return cycleDays.value
  const days = Math.round(totalFoodNetWeightG.value / intake)
  return days > 0 ? days : cycleDays.value
})
const packagePlanSummaryText = computed(() => {
  if (packagePlan.value.length === 0) {
    return `${Math.round(perMealG.value)}g×${Math.max(1, Math.round(totalFoodNetWeightG.value / Math.max(perMealG.value, 1)))}袋`
  }

  return packagePlan.value
    .map(row => `${row.packageSpecG}g×${row.packageCount}袋`)
    .join('，')
})
const packagePlanSubText = computed(() => {
  const totalPackages = packagePlanTotal.value.totalPackages
  const totalGrams = totalFoodNetWeightG.value
  if (!totalPackages || !totalGrams) return '按当前饭量生成分装'
  return `共 ${totalPackages}袋 / 总净重 ${Math.round(totalGrams)}g`
})

// 营养标准背书卡（与 DIY 配置页 / 成品订购页同一展示方式）
const recipeNutritionStandardLabel = computed(() =>
  getNutritionStandardLabel(recipe.value.nutritionStandard)
)
const nutritionStandardExplain = computed(() =>
  getNutritionStandardExplain(recipe.value.nutritionStandard || 'FEDIAF_2021')
)
const standardExplainVisible = ref(false)

function toggleStandardExplain() {
  standardExplainVisible.value = !standardExplainVisible.value
}

/**
 * 狗狗信息 / 制作信息改成「标签 + 数值」卡片网格。
 * 原来是一整行用 | 串起来的句子，手机上要逐字读才能对上号。
 */
const dogPurchaseFacts = computed(() => {
  const currentDog = dog.value
  if (!currentDog) return []

  // 不展示年龄：制作单关心的是"给谁做、做多少"，年龄在这页不做决策
  return [
    { label: '名字', value: currentDog.name || '-' },
    { label: '体重', value: `${currentDog.currentWeightKg}kg` },
    { label: '餐次', value: `${currentDog.mealsPerDay}餐/天` },
  ]
})

/**
 * 制作信息：只留三个顾客真正要用的数 —— 每餐多重、一共几餐、总共多少克。
 * 制作周期 / 每日 / 分装规格 / 采购量都不再重复出现在这里。
 */
const totalMealCount = computed(() => {
  const mealsPerDay = Number(dog.value?.mealsPerDay || 0)
  if (!mealsPerDay || !cycleDays.value) return 0
  return mealsPerDay * cycleDays.value
})

const makingPurchaseFacts = computed(() => [
  { label: '每餐重量', value: `${Math.round(perMealG.value)}g` },
  { label: '总餐数', value: totalMealCount.value > 0 ? `${totalMealCount.value}餐` : '-' },
  { label: '总净重', value: `${Math.round(totalFoodNetWeightG.value)}g` },
])

/** 底部固定栏是否展示「购买预分装补剂」 */
const canBuySupplements = computed(
  () =>
    supplementShopEnabled.value &&
    supplementItemsDetailed.value.some((item: any) => item.purchasable !== false)
)

const ingredientDetails = computed(() => {
  return pricePreview.value?.pricingBreakdown?.ingredientDetails || []
})

const foodSourceItems = computed(() => {
  const pricedFoodItems = ingredientDetails.value.filter((item: any) => item.type === 'FOOD')
  if (pricedFoodItems.length > 0) {
    return pricedFoodItems
  }

  return buildFallbackFoodIngredientItems(recipe.value.items || [], totalFoodNetWeightG.value)
})

// 计算采购清单数据
const purchaseListData = computed(() => {
  if (foodSourceItems.value.length === 0 && ingredientDetails.value.length === 0) {
    return []
  }

  return [
    ...foodSourceItems.value.map((item: any) => buildPurchaseListItem(item)),
    ...supplementItemsDetailed.value.map((row: any) => ({
      name: row.name,
      type: 'SUPPLEMENT',
      netAmount: row.amount,
      displayUnit: row.displayUnit,
      nutritionStateLabel: '',
      preparationMethod: row.preparationMethod || null,
      theoreticalAmountStr: row.amountStr,
      netAmountStr: row.amountStr
    }))
  ]
})

// 分类：食材类
const foodItems = computed(() => {
  return purchaseListData.value.filter((item: any) => item.type === 'FOOD')
})

// 分类：补剂类
const supplementItems = computed(() => {
  return purchaseListData.value.filter((item: any) => item.type === 'SUPPLEMENT')
})

// 食材类合计
// 2026-10-24 修复：清单行返回的是 netAmount（克），不是 theoreticalAmount；
// 原来加的是不存在的字段，合计恒为 0（打印出来的合计也是 0）。
const foodItemsTotal = computed(() => {
  const totalNet = foodItems.value.reduce(
    (sum: number, item: any) => sum + (Number(item.netAmount) || 0),
    0,
  )
  return {
    theoreticalAmount: totalNet,
    theoreticalAmountStr: formatNetAmount(totalNet, true),
    netAmountStr: formatNetAmount(totalNet, true)
  }
})

const supplementNutrientBaseWeightG = computed(() => {
  return foodItemsTotal.value.theoreticalAmount || totalFoodNetWeightG.value
})

/**
 * 生命阶段匹配结论 —— **由后端给出**（2026-09-19 起不再前端自己算）。
 * 前端重算认不出混血犬的体型，算不出时还会被当成"匹配"静默放行。
 */
/**
 * 生命阶段状态（2026-10-18 收进 composable）。
 *
 * 这段原来在**四个页面各写一遍**（21 computed + 13 函数）。
 * 现在数据在 composable、UI 在 `LifeStageVersionCard`，页面只剩"什么时候调 check"。
 */
const {
  verdict: lifeStageVerdict,
  checkFailed: lifeStageCheckFailed,
  dogLifeStage,
  isMatch: isLifeStageMatch,
  reminderText: lifeStageReminderText,
  check: checkLifeStageMatch,
} = useLifeStageVersion({
  recipeId: () => recipeId.value,
  dogId: () => dogId.value,
  applicableStages: () => recipe.value?.applicableLifeStages || [],
  dogName: () => dog.value?.name,
})

// 格式化狗狗年龄
const dogAgeText = computed(() => {
  if (!dog.value) return '-'
  const birthday = new Date(dog.value.birthday)
  const today = new Date()
  const ageInMonths = Math.floor((today.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24 * 30))

  if (ageInMonths < 12) {
    return `${ageInMonths}个月`
  } else {
    const years = Math.floor(ageInMonths / 12)
    const months = ageInMonths % 12
    return months > 0 ? `${years}岁${months}个月` : `${years}岁`
  }
})

/**
 * 制作步骤（2026-10-24）。
 *
 * 新设计器写的是结构化 productionStepsList；老食谱只有一整段 productionSteps。
 * 优先结构化，老数据按行拆，保证两代食谱都能显示。
 */
const displaySteps = computed(() => {
  const raw = Array.isArray(recipe.value.productionStepsList)
    ? recipe.value.productionStepsList
    : []
  if (raw.length > 0) {
    return raw
      .map((step: any, index: number) => {
        const meta = [
          step.durationMinutes ? `${step.durationMinutes} 分钟` : '',
          step.temperatureC !== null && step.temperatureC !== undefined
            ? `${step.temperatureC}℃`
            : '',
          step.equipment ? String(step.equipment) : '',
        ]
          .filter(Boolean)
          .join(' · ')
        return {
          order: Number(step.sortOrder) || index + 1,
          instruction: String(step.instruction || '').trim(),
          meta,
        }
      })
      .filter((step: any) => step.instruction)
  }

  const legacy = String(recipe.value.productionSteps || '').trim()
  if (!legacy) return []
  return legacy
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      order: index + 1,
      instruction: line,
      meta: '',
    }))
})

const foodItemsDetailed = computed(() => {
  return foodSourceItems.value
    .map((item: any) => {
      const base = buildPurchaseListItem(item)
      const recipeItem = (recipe.value.items || []).find((candidate: any) => {
        return candidate.ingredientId === item.ingredientId
      })
      const nutritionStateLabel =
        base.nutritionStateLabel || formatNutritionStateForDisplay(recipeItem)
      const rps = recommendedProductsMap.value[item.ingredientId] || []
      const selectedRpIndex = selectedRpIndexMap.value[item.ingredientId] ?? 0
      const selectedRp = rps[selectedRpIndex] || rps[0]
      const selectedProductDisplayText = formatFoodSelectedProductDisplayText(selectedRp, item)
      const purchaseLink = selectedRp?.purchaseLink || undefined
      const hasSpecDetail = hasRecommendationDetail(selectedRp, {}, purchaseLink)

      return {
        ...base,
        // 2026-10-24：部位 / 状态 / 预处理以食谱详情解析后的文字为准；
        // 价格预览里的值可能是字典 id，不能直接给顾客看。
        preparationMethod: recipeItem?.preparationMethod || base.preparationMethod || '',
        selectionKey: item.ingredientId,
        ingredientId: item.ingredientId,
        ingredientName: item.name,
        nutritionStateLabel,
        name: selectedRp?.name || item.name,
        brand: selectedRp?.brand || '-',
        productModel: selectedRp?.productModel,
        purchaseChannel: selectedRp?.purchaseChannel,
        imageUrl: selectedRp?.imageUrl,
        purchaseLink,
        selectedProductDisplayText,
        choiceLabel: formatRecommendationActionLabel(rps.length),
        recommendedPrintText: selectedProductDisplayText,
        allRecommendedProducts: rps,
        hasSpecDetail
      }
    })
})

// 补剂类详细数据（用于需额外补充的营养表格）
//
// 2026-10-26 起候选与用量都来自服务端；这里只做展示行映射，不再自己算浓度。
const supplementItemsDetailed = computed(() => {
  return buildSupplementRows(
    supplementCandidateItems.value,
    selectedSupplementIngredientMap.value
  ).map((row) => ({
    ...row,
    amountStr: formatSupplementAmountWithDisplayUnit(
      row.amount,
      row.unit,
      row.displayUnit
    ),
    allRecommendedProducts: row.candidates,
    selectedRPIndex: row.selectedCandidateIndex,
    recommendedSpecPrintText: row.selectedProductDisplayText,
    selectedProductDisplayText: row.selectedProductDisplayText,
    type: 'SUPPLEMENT',
    properties: {}
  }))
})

/**
 * 商城关闭或状态查询失败时的中性说明文案。
 * 入口不再静默消失，用户至少知道为什么没有「一键购买补剂」。
 */
const supplementUnavailableText = computed(() =>
  supplementShopStatus.value === 'failed'
    ? '补剂信息暂时获取失败，点击重试'
    : '补剂商城暂未开放，可联系客服了解'
)

// 格式化用量显示
/**
 * 食材用量取整到「好买的量」。
 *
 * 为什么不是精确到 0.1g：顾客去菜场/超市买不到 243.7g 鸡胸，
 * 给这么精确的数字反而显得外行。一律**向上**取整，宁可多买不可买少。
 *   · 小于 10g  → 保留 1 位小数（盐、奇亚籽这类微量，取整到 5g 会离谱）
 *   · 10 ~ 100g → 进位到 1g
 *   · 100g 以上 → 进位到 5g
 */
function formatPurchaseAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0g'
  if (amount < 10) return `${amount.toFixed(1)}g`
  if (amount < 100) return `${Math.ceil(amount)}g`
  return `${Math.ceil(amount / 5) * 5}g`
}

/**
 * 净重的展示格式：不做「好买的量」进位，保留真实用量，
 * 2026-10-18：采购量删掉后，这一列就是唯一的用量数字（净用量）。
 */
function supplementFormLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    POWDER: '粉剂',
    TABLET: '片剂',
    CAPSULE: '胶囊',
    LIQUID: '液体'
  }
  return labels[value || ''] || ''
}

function formatNetAmount(amount: number, isFood: boolean): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0g'
  if (!isFood) return `${amount.toFixed(1)}g`
  if (amount < 10) return `${amount.toFixed(1)}g`
  return `${Math.round(amount)}g`
}

function formatAmount(amount: number, isFood: boolean): string {
  if (isFood) {
    // 食材类：按「好买的量」取整
    return formatPurchaseAmount(amount)
  } else {
    // 补剂类：保留1位小数
    return `${amount.toFixed(1)}g`
  }
}

function formatFoodPrepAmountForPrint(amount: number): string {
  return formatPurchaseAmount(amount)
}

function formatFoodPrepTotalForPrint(amount: number): string {
  return `${amount.toFixed(1)}g`
}

/**
 * 纸质制作单上这一列给顾客看的是「净用量」（2026-10-18 起不再含缩水余量）。
 * 不再写「含 7% 损耗」——损耗率是我们的内部口径，顾客只需要知道该买多少。
 */
function getFoodPrepAmountHeaderForPrint(): string {
  return '净重'
}

function formatSupplementTargetForPrint(item: any): string {
  return formatSupplementTargets(item) || '-'
}

// 格式化补剂用量显示（参考订购成品页，保留用于向后兼容）
function formatSupplementAmount(amount: number, unit?: string): string {
  if (unit === 'kg') {
    return `${(amount * 1000).toFixed(1)}g`
  }
  if (unit === 'g') {
    return `${amount.toFixed(1)}g`
  }
  if (unit === 'mg') {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}g`
    }
    return `${amount.toFixed(1)}mg`
  }
  return `${amount}${unit || 'g'}`
}

function parsePackagePlanParam(value: string | undefined): PackagePlanItem[] {
  if (!value) return []

  try {
    const decoded = decodeURIComponent(value)
    const parsed = JSON.parse(decoded)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((row: any) => {
        const packageSpecG = Math.floor(Number(row?.packageSpecG))
        const packageCount = Math.floor(Number(row?.packageCount))

        if (
          !Number.isFinite(packageSpecG)
          || !Number.isFinite(packageCount)
          || packageSpecG <= 0
          || packageCount <= 0
        ) {
          return null
        }

        return { packageSpecG, packageCount }
      })
      .filter((row: PackagePlanItem | null): row is PackagePlanItem => row !== null)
  } catch (error) {
    console.warn('[DIYSheet] packagePlan 参数解析失败:', error)
    return []
  }
}

function buildLegacyPackagePlan(): PackagePlanItem[] {
  const totalG = dailyIntakeG.value * cycleDays.value
  const packageSpecG = Math.max(1, Math.round(perMealG.value || dailyIntakeG.value || totalG || 1))
  const packageCount = Math.max(1, Math.round(totalG / packageSpecG))

  return [{ packageSpecG, packageCount }]
}

function getPrimaryPackageSpecG(plan: PackagePlanItem[]): number {
  const primaryRow = [...plan].sort(
    (left, right) =>
      right.packageCount - left.packageCount
      || right.packageSpecG - left.packageSpecG,
  )[0]

  return primaryRow?.packageSpecG || Math.max(1, Math.round(perMealG.value || 1))
}

async function loadSupplementShopStatus() {
  try {
    const res = await fetchSupplementShopStatus()
    if (res.code !== 0 || !res.data) {
      // 拿到了响应但结论不可用，同样按失败处理，允许重试
      supplementShopStatus.value = 'failed'
      return
    }
    supplementShopStatus.value = res.data.enabled ? 'enabled' : 'disabled'
  } catch (error) {
    // 不再静默隐藏：标为 failed，页面给可重试的说明
    supplementShopStatus.value = 'failed'
  }
}

function handleSupplementStatusRetry() {
  if (supplementShopStatus.value !== 'failed') return
  supplementShopStatus.value = 'loading'
  void loadSupplementShopStatus()
}

/**
 * 订购成品（2026-10-24）：这份配方也能做成成品，冷链到家。
 *
 * 带业务食谱编号 + 这只狗 —— 成品页不用再让顾客选一次。
 */
function goFinishedFood() {
  if (!recipeId.value) {
    uni.showToast({ title: '缺少食谱编号', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: buildFinishedFoodOrderUrl(recipeId.value, dogId.value)
  })
}

/**
 * 购买预分装补剂：把制作单上的补剂清单交给下单页。
 * 补剂行带用量，塞不进 URL，因此走本地存储传递。
 */
async function handleBuySupplements() {
  // 只带“选了哪个原料”，用量由后端按配方重算（2026-10-26）
  const lines = buildSupplementPurchaseLines(supplementItemsDetailed.value)

  if (lines.length === 0) {
    uni.showToast({ title: '暂无可购买的补剂', icon: 'none' })
    return
  }

  // 首次买补剂必须让后端有制作单可冻结；没有 id 时先保存一次
  const diySheetId =
    currentDiySheetId.value || (await autoSaveDiySheet())
  if (!diySheetId) {
    uni.showToast({ title: '制作单保存失败，请重试', icon: 'none' })
    return
  }

  saveSupplementPurchaseDraft({
    lines,
    recipeId: recipeId.value,
    recipeName: recipe.value && recipe.value.name,
    dogId: dogId.value,
    dogName: dog.value && dog.value.name,
    // 用实际覆盖天数，而不是用户选的天数 —— 自定义分装下两者不一样
    cycleDays: effectiveCycleDays.value,
    diySheetId
  })

  uni.navigateTo({ url: '/pages/supplement-order/index' })
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[DIYSheet] 页面参数:', options)

  recipeId.value = options.recipeId || ''
  orderId.value = options.orderId || ''
  shareToken.value = options.shareToken || ''
  dogId.value = options.dogId || ''
  cycleDays.value = parseInt(options.cycleDays || '7')
  perMealG.value = parseFloat(options.perMealG || '0')
  dailyIntakeG.value = parseFloat(options.dailyIntakeG || '0')
  packagePlan.value = parsePackagePlanParam(options.packagePlan)
  if (packagePlan.value.length === 0) {
    packagePlan.value = buildLegacyPackagePlan()
  }

  void loadSupplementShopStatus()

  if (recipeId.value && dogId.value) {
    loadData()
  } else {
    uni.showToast({
      title: '参数错误',
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
})

async function loadData() {
  isPageDataLoaded.value = false

  try {
    // 先加载健康标签映射
    await loadHealthTagMapping()

    // 并行加载食谱详情、价格预览、狗狗信息和设备推荐
    await Promise.all([
      loadRecipe(),
      loadPricePreview(),
      loadDog(),
      loadEquipmentRecommendations()
    ])

    // 生命阶段结论由后端给出（需等食谱与狗狗都就绪）
    await checkLifeStageMatch()

    // 价格预览加载完成后，加载推荐产品（需要 ingredientIds）
    await loadRecommendedProducts()

    // 先拿到制作单 id（算量/版本锚定/冻结快照都靠它），再取服务端补剂候选
    const sheetId = await autoSaveDiySheet()
    await loadSupplementCandidates(sheetId)
    // 候选/选择就绪后再存一次，把默认选择写进制作单（已冻结则后端不会覆盖）
    await autoSaveDiySheet()
  } catch (error) {
    console.error('[DIYSheet] Load data error:', error)
  } finally {
    isPageDataLoaded.value = true
  }
}

/**
 * 自动保存制作单到数据库（用于评价权限验证）
 * 幂等操作：后端会检查是否已存在相同的 user+recipe+dog 组合
 */
async function autoSaveDiySheet(): Promise<string> {
  try {
    const selections =
      supplementCandidateItems.value.length > 0
        ? buildSupplementSelections(supplementItemsDetailed.value)
        : undefined
    const res: any = await request({
      url: '/user/diy-sheets',
      method: 'POST',
      data: {
        recipeId: recipeId.value,
        recipeName: recipe.value.name,
        dogId: dogId.value,
        cycleDays: cycleDays.value,
        perMealG: perMealG.value,
        dailyIntakeG: dailyIntakeG.value,
        packagePlan: packagePlan.value,
        purchaseList: purchaseListData.value,
        productionSteps: recipe.value.productionSteps,
        recipeVersion: recipe.value.version || undefined,
        ...(selections ? { supplementSelections: selections } : {})
      }
    })
    if (res.code === 0 && res.data?.id) {
      currentDiySheetId.value = res.data.id
      if (Array.isArray(res.data.supplementSelections)) {
        savedSupplementSelections.value = selectionsFromSaved(
          res.data.supplementSelections
        )
        restoreSupplementSelections()
      }
      return res.data.id
    }
  } catch {
    // 静默失败；购买时会再尝试一次
  }
  return ''
}

/**
 * 服务端补剂候选（2026-10-26）。
 * 候选、换算用量都在后端算；失败时降级为“只有原原料”，不阻塞制作单。
 */
async function loadSupplementCandidates(sheetId?: string) {
  if (!recipeId.value) return
  try {
    const res: any = await request({
      url: `/recipes/${recipeId.value}/supplement-candidates`,
      method: 'GET',
      data: {
        ...(sheetId ? { diySheetId: sheetId } : {}),
        ...(supplementNutrientBaseWeightG.value > 0
          ? { totalWeightG: supplementNutrientBaseWeightG.value }
          : {}),
        ...(orderId.value ? { orderId: orderId.value } : {}),
        ...(shareToken.value ? { shareToken: shareToken.value } : {})
      }
    })
    if (res.code === 0 && Array.isArray(res.data?.items)) {
      supplementCandidateItems.value = res.data.items
      supplementCandidateError.value = false
      restoreSupplementSelections()
    } else {
      supplementCandidateError.value = true
    }
  } catch (error) {
    console.error('[DIYSheet] Load supplement candidates error:', error)
    supplementCandidateError.value = true
  }
}

/** 恢复顾客上次选的原料（只认仍在候选里的 ingredientId） */
function restoreSupplementSelections() {
  const saved = savedSupplementSelections.value
  if (!saved || Object.keys(saved).length === 0) return
  const next = { ...selectedSupplementIngredientMap.value }
  const indexes = { ...selectedRpIndexMap.value }
  for (const item of supplementCandidateItems.value) {
    const wanted = saved[item.recipeItemId]
    if (!wanted) continue
    const index = item.candidates.findIndex(
      (candidate) => candidate.ingredientId === wanted
    )
    if (index >= 0) {
      next[item.recipeItemId] = wanted
      indexes[item.recipeItemId] = index
    }
  }
  selectedSupplementIngredientMap.value = next
  selectedRpIndexMap.value = indexes
}

function retrySupplementCandidates() {
  supplementCandidateError.value = false
  void loadSupplementCandidates(currentDiySheetId.value)
}

async function loadRecipe() {
  try {
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET',
      data: {
        ...(orderId.value ? { orderId: orderId.value } : {}),
        ...(shareToken.value ? { shareToken: shareToken.value } : {})
      }
    })

    if (res.code === 0 && res.data) {
      recipe.value = res.data
      console.log('[DIYSheet] 食谱加载成功:', res.data)
    }
  } catch (error) {
    console.error('[DIYSheet] Load recipe error:', error)
    uni.showToast({
      title: '加载食谱失败',
      icon: 'none'
    })
  }
}


async function loadHealthTagMapping() {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    })
    if (res.code === 0 && res.data?.healthTags) {
      const uuidMap: Record<string, string> = {}
      if (Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
    }
  } catch (error) {
    console.error('[DIYSheet] Load health tag mapping error:', error)
  }
}

async function loadDog() {
  console.log('[DIYSheet] 开始加载狗狗信息, dogId:', dogId.value)

  try {
    const res = await request({
      url: `/dogs/${dogId.value}`,
      method: 'GET'
    })

    console.log('[DIYSheet] 狗狗API响应:', res)

    if (res.code === 0 && res.data) {
      dog.value = res.data.profile
      console.log('[DIYSheet] 狗狗信息加载成功:', res.data.profile)
      console.log('[DIYSheet] 狗狗字段检查:', res.data.profile)
    } else {
      console.error('[DIYSheet] API返回错误:', res)
    }
  } catch (error) {
    console.error('[DIYSheet] Load dog error:', error)
  }
}

async function loadPricePreview() {
  try {
    const totalG = totalFoodNetWeightG.value
    const pkgSpecG = getPrimaryPackageSpecG(packagePlan.value)
    const pkgCount = packagePlanTotal.value.totalPackages || Math.max(1, Math.round(totalG / pkgSpecG))

    const res = await request({
      url: '/orders/pricing/preview',
      method: 'POST',
      data: {
        dogId: dogId.value,
        type: 'FRESH_FOOD',
        pricingPurpose: 'DIY_SHEET',
        items: [{
          recipeId: recipeId.value,
          quantityG: totalG,
          packageCount: pkgCount,
          packageSpecG: pkgSpecG,
          packagePlan: packagePlan.value,
          cycleDays: cycleDays.value,
          dailyIntakeG: dailyIntakeG.value
        }]
      }
    })

    if (res.code === 0 && res.data) {
      pricePreview.value = res.data
      console.log('[DIYSheet] DIY清单明细加载成功')
    }
  } catch (error) {
    pricePreview.value = null
    console.error('[DIYSheet] Load DIY sheet details error:', error)
    // 不显示错误提示，因为采购清单可以降级处理
  }
}

async function loadRecommendedProducts() {
  try {
    const uniqueIngredientIds = collectFoodIngredientIdsForRecommendations(
      pricePreview.value,
      recipe.value.items || []
    )

    if (uniqueIngredientIds.length === 0) return

    const res = await request({
      url: `/recommended-products?ingredientIds=${uniqueIngredientIds.join(',')}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      recommendedProductsMap.value = res.data
    }
  } catch (error) {
    console.error('[DIYSheet] Load recommended products error:', error)
    // 推荐产品加载失败不影响主流程
  }
}

async function loadEquipmentRecommendations() {
  try {
    const res = await request({
      url: '/global-config',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      diySheetHeaderBgImageUrl.value = normalizeImageUrl(res.data.diySheetHeaderBgImageUrl)

      // 获取设备推荐
      if (res.data.equipmentRecommendations) {
        equipmentRecommendations.value = res.data.equipmentRecommendations
        console.log('[DIYSheet] 设备推荐加载成功:', equipmentRecommendations.value)
      } else {
        // 如果没有配置设备推荐，使用默认列表
        equipmentRecommendations.value = [
          { id: 'meat-grinder', name: '绞肉机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'blender', name: '搅拌机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'grinder', name: '研磨机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'vacuum-sealer', name: '真空机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
          { id: 'vacuum-bag', name: '真空袋', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
        ]
      }

    }
  } catch (error) {
    console.error('[DIYSheet] Load equipment recommendations error:', error)
    diySheetHeaderBgImageUrl.value = ''
    // 出错时使用默认列表
    equipmentRecommendations.value = [
      { id: 'meat-grinder', name: '绞肉机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'blender', name: '搅拌机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'grinder', name: '研磨机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'vacuum-sealer', name: '真空机', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
      { id: 'vacuum-bag', name: '真空袋', brand: '', specification: '', reason: '', imageUrl: null, purchaseLink: '' },
    ]
  }
}

function resolveCanvasImageInfo(imageUrl: string): Promise<CanvasImageInfo | undefined> {
  if (!imageUrl) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    uni.getImageInfo({
      src: imageUrl,
      success: (info) => {
        resolve({
          path: info.path || imageUrl,
          width: info.width,
          height: info.height
        })
      },
      fail: (error) => {
        console.warn('[DIYSheet] 制作单头部背景图加载失败，使用默认背景:', error)
        resolve(undefined)
      }
    })
  })
}

// 打印制作单
async function handlePrint() {
  if (isGeneratingImage.value) {
    return
  }

  if (!isPageDataLoaded.value || !recipe.value.name || !dog.value) {
    uni.showToast({
      title: '制作单加载中',
      icon: 'none'
    })
    return
  }

  isGeneratingImage.value = true
  uni.showLoading({ title: '生成中...' })

  try {
    const canvasWidth = PRINT_CANVAS_LOGICAL_WIDTH

    /**
     * 头部大图：优先用食谱封面照片（食物照最适合分享），
     * 没有封面时退回后台配置的品牌头图，都没有才用品牌渐变底。
     * 三张图都只解析一次，两遍绘制复用。
     */
    const coverUrl = recipe.value.coverImageUrl
      ? normalizeImageUrl(recipe.value.coverImageUrl)
      : ''
    const headerBackground =
      (coverUrl ? await resolveCanvasImageInfo(coverUrl) : undefined)
      || (await resolveCanvasImageInfo(diySheetHeaderBgImageUrl.value))

    console.log('[DIYSheet] 头部大图来源:', {
      cover: coverUrl || '(无封面)',
      fallback: diySheetHeaderBgImageUrl.value || '(无配置)',
      used: headerBackground?.path || '(品牌渐变)'
    })

    /**
     * 把制作单的全部内容画到构建器上，返回内容末端 Y。
     * 抽成函数是为了「先量后排」两遍绘制能走同一套逻辑。
     * 页脚不在这里画 —— 它要贴在最终画布的最底部。
     */
    const drawSheetContent = (builder: PrintCanvasBuilder): number => {
      // 1. 品牌头部（封面 + 品牌 + 狗狗头像 + 食谱名）
      builder.drawBrandHeader({
        brand: '赛文的食堂',
        logoPath: '/static/logo.png',
        avatarPath: dog.value?.avatarUrl ? normalizeImageUrl(dog.value.avatarUrl) : undefined,
        backgroundImage: headerBackground,
        title: recipe.value.name,
        subtitle: dog.value ? `${dog.value.name} 的 ${cycleDays.value} 天鲜食计划` : `${cycleDays.value} 天鲜食计划`,
        sellingPoint: recipe.value.sellingPoint || ''
      })

      // 2. 狗狗信息 + 制作信息合并成一行六项，省纵向空间
      builder.drawFactCards('', [
        ...dogPurchaseFacts.value,
        ...makingPurchaseFacts.value
      ], { columns: 6 })

      // 3. 食材清单
      if (foodItemsDetailed.value.length > 0) {
        builder.drawSectionTitle('食材清单')

        const foodRows = foodItemsDetailed.value.map(item => [
          item.ingredientName,
          item.recommendedPrintText,
          item.netAmountStr,
          item.preparationMethod || '-'
        ])

        builder.drawTable(
          ['原料', '产品', getFoodPrepAmountHeaderForPrint(), '部位 / 状态 / 预处理'],
          foodRows,
          {
            totalRow: [
              '合计',
              '-',
              foodItemsTotal.value.netAmountStr,
              '-'
            ],
            colWidths: [200, 290, 240, 390],
            wrapColumns: [true, true, false, true]
          }
        )

      }

      // 4. 营养补充剂
      if (supplementItemsDetailed.value.length > 0) {
        builder.drawSectionTitle('营养补充剂')

        // 目标补充量 在 添加总量 之前
        const supplementRows = supplementItemsDetailed.value.map(item => [
          item.name,
          item.recommendedSpecPrintText,
          formatSupplementTargetForPrint(item),
          item.amountStr
        ])

        builder.drawTable(
          ['补剂名称', '产品 / 规格', '目标补充量', '制作单总量'],
          supplementRows,
          {
            colWidths: [180, 490, 250, 200],
            wrapColumns: [false, true, false, false]
          }
        )

        builder.drawSupplementNotice(
          '营养补充剂的制作单总量与产品严格匹配。由于不同营养补剂营养浓度不同，如果要选择其它产品，须按目标补充量自行换算制作单总量。'
        )
      }

      // 5. 制作步骤（结构化优先，老整段文字兜底）
      if (displaySteps.value.length > 0) {
        builder.drawSectionTitle('制作步骤')
        builder.drawProductionSteps(
          displaySteps.value
            .map((step: any) => `${step.order}. ${step.instruction}${step.meta ? `（${step.meta}）` : ''}`)
            .join('\n'),
        )
      }

      // 6. 储存和烹饪（与页面同一套全店统一文案）
      builder.drawSectionTitle('储存和烹饪')
      builder.drawNote('烹饪：建议蒸、炖、低温慢煮；不建议微波、烤、煎等高温烹饪。')
      builder.drawNote('储存：分装建议用食品真空袋抽真空；-18℃ 冷冻保存 6 个月，0-4℃ 冷藏保存 3 天，开封后 3 小时内吃完。')

      return builder.getCurrentY()
    }

    /** 等画布尺寸在视图层生效 */
    const waitForCanvasResize = async () => {
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 30))
    }

    // 第一遍：用基准高度量内容
    printCanvasLogicalHeight.value = PRINT_CANVAS_LOGICAL_HEIGHT
    await waitForCanvasResize()

    let builder = new PrintCanvasBuilder({
      canvasId: 'printCanvas',
      width: canvasWidth,
      height: printCanvasLogicalHeight.value,
      outputScale: PRINT_CANVAS_OUTPUT_SCALE,
      autoHeight: true
    })
    const measuredHeight = drawSheetContent(builder)
    const neededHeight = Math.ceil(measuredHeight + PRINT_CANVAS_FOOTER_SPACE)

    console.log('[DIYSheet] 制作单内容高度:', {
      measuredHeight: Math.round(measuredHeight),
      neededHeight,
      baseHeight: PRINT_CANVAS_LOGICAL_HEIGHT
    })

    // 内容超出基准高度才重画一遍（多数制作单一遍就够）
    if (neededHeight > PRINT_CANVAS_LOGICAL_HEIGHT) {
      printCanvasLogicalHeight.value = neededHeight
      await waitForCanvasResize()

      builder = new PrintCanvasBuilder({
        canvasId: 'printCanvas',
        width: canvasWidth,
        height: printCanvasLogicalHeight.value,
        outputScale: PRINT_CANVAS_OUTPUT_SCALE,
        autoHeight: true
      })
      drawSheetContent(builder)
      console.log('[DIYSheet] 内容超出基准高度，已把画布撑到:', neededHeight)
    }

    // 页脚贴最终画布底部
    const dateStr = new Date().toLocaleDateString('zh-CN')
    builder.drawFooter(`赛文的食堂 | ${dateStr}`)

    const imagePath = await builder.toImage()

    console.log('[DIYSheet] 图片生成成功:', {
      path: imagePath,
      logicalSize: `${canvasWidth}x${printCanvasLogicalHeight.value}`,
      orientation: '竖版'
    })

    safeHideLoading()

    previewImageUrl.value = imagePath
    showImagePreview.value = true
  } catch (error) {
    console.error('[DIYSheet] 生成图片失败:', error)
    safeHideLoading()
    uni.showToast({
      title: '生成失败',
      icon: 'none'
    })
  } finally {
    isGeneratingImage.value = false
  }
}

function safeHideLoading() {
  try {
    uni.hideLoading({
      fail: () => {}
    } as any)
  } catch {
    // 真机上 loading 可能已经被页面切换或 toast 自动清理，忽略即可。
  }
}

// 处理保存图片到相册
function handleSaveImage() {
  if (!previewImageUrl.value) {
    uni.showToast({
      title: '图片未生成',
      icon: 'none'
    })
    return
  }

  saveImageToPhotosAlbum(previewImageUrl.value)
}

// 保存图片到相册
function saveImageToPhotosAlbum(filePath: string) {
  uni.saveImageToPhotosAlbum({
    filePath,
    success: () => {
      uni.showToast({
        title: '已保存到相册',
        icon: 'success'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 保存到相册失败:', err)

      // 如果用户拒绝授权，引导用户开启权限
      if (err.errMsg.includes('auth')) {
        uni.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限，以便保存制作单图片',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              uni.openSetting()
            }
          }
        })
      } else {
        uni.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    }
  })
}

// 保存制作单
/**
 * 保存：合并了原来的「打印」和「保存制作单」。
 * 由顾客自己选要哪一种，避免底部塞两个含义相近的按钮。
 */
function handleSaveMenu() {
  if (!isPageDataLoaded.value || isGeneratingImage.value) return

  uni.showActionSheet({
    itemList: ['保存为图片', '保存到收藏夹'],
    success: (res) => {
      if (res.tapIndex === 0) {
        // 生成制作单图片，走图片预览弹窗，再由顾客保存到相册
        void handlePrint()
        return
      }
      if (res.tapIndex === 1) {
        void handleSave()
      }
    },
    fail: () => {
      // 顾客主动取消，不做任何事
    },
  })
}

async function handleSave() {
  uni.showLoading({ title: '保存中...' })

  try {
    // 收集数据
    const sheetData = {
      recipeId: recipeId.value,
      recipeName: recipe.value.name,
      dogId: dogId.value,
      cycleDays: cycleDays.value,
      perMealG: perMealG.value,
      dailyIntakeG: dailyIntakeG.value,
      packagePlan: packagePlan.value,
      purchaseList: purchaseListData.value,
      productionSteps: recipe.value.productionSteps
    }

    // 调用保存API
    const res = await request({
      url: '/user/diy-sheets',
      method: 'POST',
      data: sheetData
    })

    uni.hideLoading()

    if (res.code === 0) {
      if (res.data?.id) currentDiySheetId.value = res.data.id
      // 告诉顾客去哪儿找：我的 → 我的制作单
      uni.showToast({
        title: '已保存到我的制作单',
        icon: 'none'
      })
    } else {
      uni.showToast({
        title: res.message || '保存失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('[DIYSheet] Save error:', error)
    uni.hideLoading()
    uni.showToast({
      title: '保存失败',
      icon: 'none'
    })
  }
}

// 分享配置
const packagePlanQueryParam = computed(() =>
  `packagePlan=${encodeURIComponent(JSON.stringify(packagePlan.value))}`
)
const shareTokenQueryParam = computed(() =>
  shareToken.value ? `&shareToken=${encodeURIComponent(shareToken.value)}` : ''
)
const sharePath = computed(() => {
  return `/pages/diy-sheet/index?recipeId=${recipeId.value}&dogId=${dogId.value}&cycleDays=${cycleDays.value}&perMealG=${perMealG.value}&dailyIntakeG=${dailyIntakeG.value}&${packagePlanQueryParam.value}${shareTokenQueryParam.value}`
})

const shareTitle = computed(() => {
  return `【DIY制作单】${recipe.value.name} - ${dog.value?.name || '宠物'}专属`
})

// 规格弹窗控制
function showSpecModal(item: any) {
  currentSpec.value = item
  modalSelectionKey.value = item.selectionKey || item.ingredientId || ''
  modalSelectedRpIndex.value = selectedRpIndexMap.value[modalSelectionKey.value] ?? 0
  showSpec.value = true
}

function productImageKey(prefix: string, product: any): string {
  return `${prefix}-${product?.id || product?.imageUrl || ''}`
}

function isProductImageLoaded(key: string): boolean {
  return Boolean(loadedProductImageKeys.value[key])
}

function markProductImageLoaded(key: string): void {
  loadedProductImageKeys.value = {
    ...loadedProductImageKeys.value,
    [key]: true,
  }
}

/** 多商品卡片里的"确认选择"：选中这一张并关闭，不能用别的卡的下标 */
function confirmProductSelection(rpIndex: number): void {
  selectRecommendedProduct(modalSelectionKey.value, rpIndex)
  confirmRecommendedProductSelection()
}

/** 单商品/无推荐商品：当前商品就是选中的，确认即关闭 */
function confirmSingleProductSelection(): void {
  closeSpecModal()
}

function closeSpecModal() {
  showSpec.value = false
  currentSpec.value = {}
  modalSelectionKey.value = ''
  modalSelectedRpIndex.value = 0
}

function getSpecPurchaseChannelDisplay(target: any): string {
  return getSpecRecommendedPurchaseChannelDisplay({
    ingredientType: currentSpec.value?.type,
    purchaseLink: target?.purchaseLink,
    purchaseChannel: target?.purchaseChannel
  })
}

// 显示营养信息弹窗
function showNutritionInfoModal(item: any) {
  // 营养信息只回答"补什么、每公斤加多少"；不再算营养素总量
  currentNutritionInfo.value = {
    ...item,
    targetSummary: formatSupplementTargets(item)
  }

  showNutritionInfo.value = true
}

function closeNutritionInfoModal() {
  showNutritionInfo.value = false
}


// 选择推荐产品（在弹窗中切换）
function selectRecommendedProduct(ingredientId: string, rpIndex: number | string) {
  modalSelectionKey.value = ingredientId
  modalSelectedRpIndex.value = Number(rpIndex)
}

function confirmRecommendedProductSelection() {
  if (!modalSelectionKey.value) {
    closeSpecModal()
    return
  }

  const key = modalSelectionKey.value
  selectedRpIndexMap.value[key] = modalSelectedRpIndex.value
  const candidateItem = supplementCandidateItems.value.find(
    (item) => item.recipeItemId === key
  )
  const chosen = candidateItem?.candidates[modalSelectedRpIndex.value]
  if (chosen) {
    selectedSupplementIngredientMap.value = {
      ...selectedSupplementIngredientMap.value,
      [key]: chosen.ingredientId
    }
    void autoSaveDiySheet()
  }
  closeSpecModal()
}

// 从链接判断平台类型
function detectPlatformFromUrl(url: string): string {
  if (url.includes('taobao') || url.includes('tmall') || url.includes('tb.cn') || url.includes('m.tb.cn')) {
    return 'TAOBAO'
  }
  if (url.includes('jd.com') || url.includes('jd.hk')) {
    return 'JD'
  }
  if (url.includes('pinduoduo') || url.includes('yangkeduo') || url.includes('pdd')) {
    return 'PINDUODUO'
  }
  if (url.includes('iherb.com') || url.includes('iherb.cn')) {
    return 'IHERB'
  }
  return 'OTHER'
}

// 处理推荐商品购买链接 - 复制到剪贴板
function handlePurchase(purchaseLink: any, productName: string) {
  if (!purchaseLink) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  const { url, platform } = purchaseLink
  if (!url) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  uni.setClipboardData({
    data: url,
    success: () => {
      const tip = getPurchaseTipByPlatform(platform)
      uni.showModal({
        title: productName,
        content: tip,
        showCancel: false,
        confirmText: '知道了'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 复制失败:', err)
      uni.showToast({
        title: '复制失败，请重试',
        icon: 'none'
      })
    }
  })
}

function formatNutritionStateForDisplay(item: any): string {
  return (
    item?.nutritionStateLabel ||
    item?.nutrition_state_label ||
    item?.nutritionFood?.preparationStateLabel ||
    item?.nutritionState ||
    item?.nutrition_state ||
    item?.nutritionFood?.preparationState ||
    ''
  )
}

/**
 * 制作清单的一行。
 *
 * 2026-10-18：**采购量整条线删掉**（老板定）——
 * 只给"这次要用多少"（净用量），买多少让顾客自己判断。
 *
 * 所以这里不再算含损耗的「实际用量」，也不再读任何损耗率：
 * 损耗率是经验估算，不同食材差很多，乘进去当"建议采购量"等于用估算冒充精算。
 */
function buildPurchaseListItem(item: any) {
  const isFood = item.type === 'FOOD'
  const netAmount = (item.netAmount ?? item.amount) * 1000

  return {
    name: item.name,
    type: item.type,
    netAmount,
    displayUnit: item.displayUnit || item.unit || 'g',
    nutritionStateLabel: formatNutritionStateForDisplay(item),
    preparationMethod: item.preparationMethod || null,
    theoreticalAmountStr: formatNetAmount(netAmount, isFood),
    netAmountStr: formatNetAmount(netAmount, isFood),
  }
}

function hasRecommendationDetail(selectedRp: any, item: any, purchaseLink: any): boolean {
  return !!(
    selectedRp ||
    item.imageUrl ||
    item.properties?.image_url ||
    item.brand ||
    item.productModel ||
    item.purchaseChannel ||
    purchaseLink
  )
}

function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap.value[tagOrUuid]) {
    return healthTagUuidLabelMap.value[tagOrUuid]
  }

  // 兼容旧的枚举值（用于向后兼容）
  const map: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  }

  if (map[tagOrUuid]) {
    return map[tagOrUuid]
  }

  return tagOrUuid
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'FEDIAF_2025': 'FEDIAF 2025',
    'AAFCO_2021': 'AAFCO 2021',
    'NRC_2006': 'NRC 2006',
  }
  return map[standard] || standard
}

// 设备推荐相关处理函数
function handleShowEquipmentList() {
  console.log('[DIYSheet] 显示设备推荐列表')
  showEquipmentList.value = true
}

function closeEquipmentListModal() {
  showEquipmentList.value = false
}

function handleShowEquipmentDetail(equipment: any) {
  console.log('[DIYSheet] 显示设备详情:', equipment)
  currentEquipmentDetail.value = equipment
  // 可以在这里显示单个设备的详情弹窗
  // 目前直接处理购买
  if (equipment.purchaseLink) {
    handlePurchaseEquipment(equipment)
  }
}

function handlePurchaseEquipment(equipment: any) {
  console.log('[DIYSheet] 购买设备:', equipment)

  const purchaseLink = equipment.purchaseLink
  if (!purchaseLink) {
    uni.showToast({
      title: '购买链接未配置',
      icon: 'none'
    })
    return
  }

  // 从链接判断平台类型
  const platform = detectPlatformFromUrl(purchaseLink)

  // 复制链接到剪贴板
  uni.setClipboardData({
    data: purchaseLink,
    success: () => {
      console.log('[DIYSheet] 设备购买链接复制成功:', purchaseLink)
      const tip = getPurchaseTipByPlatform(platform)
      uni.showModal({
        title: equipment.name,
        content: tip,
        showCancel: false,
        confirmText: '知道了'
      })
    },
    fail: (err) => {
      console.error('[DIYSheet] 复制失败:', err)
      uni.showToast({
        title: '复制失败，请重试',
        icon: 'none'
      })
    }
  })
}

// 微信小程序分享配置
// 分享给朋友
onShareAppMessage(() => {
  return {
    title: shareTitle.value,
    path: sharePath.value,
    imageUrl: normalizeImageUrl(recipe.value.coverImageUrl) || '',
    success: () => {
      console.log('[DIYSheet] 分享成功')
    },
    fail: (err) => {
      console.error('[DIYSheet] 分享失败:', err)
    }
  }
})

// 分享到朋友圈
onShareTimeline(() => {
  return {
    title: shareTitle.value,
    query: `recipeId=${recipeId.value}&dogId=${dogId.value}&cycleDays=${cycleDays.value}&perMealG=${perMealG.value}&dailyIntakeG=${dailyIntakeG.value}&${packagePlanQueryParam.value}${shareTokenQueryParam.value}`,
    imageUrl: normalizeImageUrl(recipe.value.coverImageUrl) || ''
  }
})
</script>

<style scoped>
/* 后端结论未取到：既不静默放行，也不误报"不匹配" */
.life-stage-unknown-note {
  margin: 0 0 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 10rpx;
  background-color: #f7f8f2;
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

.life-stage-unknown-text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--sk-ink-2, #6b6653);
}

.diy-sheet-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-bottom: 180rpx;
}

.section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
  cursor: pointer;
  user-select: none;
}

.title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.toggle-icon {
  font-size: 24rpx;
  color: #6b6653;
}

/* 食谱信息卡片 */
.recipe-info-section {
  padding: 0;
  overflow: hidden;
}

.recipe-cover-wrapper {
  width: 100%;
  height: 400rpx;
  position: relative;
}

.recipe-cover {
  width: 100%;
  height: 100%;
}

.recipe-cover-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 36rpx;
  color: #f3eddd;
  font-weight: bold;
}

.recipe-details {
  padding: 32rpx 24rpx;
}

.recipe-name {
  font-size: 40rpx;
  font-weight: bold;
  color: #26261f;
  display: block;
  margin-bottom: 20rpx;
  text-align: center;
}

.health-tag {
  background-color: #f6efe0;
  color: #8a6b33;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #6b6653;
}

.nutrition-item .value {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.warning-card {
  margin: 20rpx 24rpx;
  padding: 24rpx;
  background-color: #f6efe0;
  border: 1rpx solid #b08d4f;
  border-radius: 12rpx;
}

.warning-header {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.warning-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #8a6b33;
}

.warning-text {
  display: block;
  font-size: 26rpx;
  color: #8a6b33;
  line-height: 1.6;
  margin-bottom: 16rpx;
}

.btn-continue {
  height: 64rpx;
  line-height: 64rpx;
  background-color: #b08d4f;
  color: #f3eddd;
  border-radius: 8rpx;
  font-size: 26rpx;
  border: none;
}

/* 采购清单 */
.purchase-list-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.preview-warning-summary {
  padding: 16rpx 18rpx;
  background-color: #f6efe0;
  border-radius: 8rpx;
  border-left: 4rpx solid #b08d4f;
}

.preview-warning-text {
  display: block;
  font-size: 25rpx;
  color: #8a6b33;
  line-height: 1.5;
}

.ingredient-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.ingredient-category-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
  padding: 12rpx 0;
}

.ingredient-table {
  display: flex;
  flex-direction: column;
  border: 1rpx solid #e5e8d4;
  border-radius: 8rpx;
  overflow: hidden;
}

.table-header,
.table-row {
  display: flex;
  padding: 16rpx 12rpx;
}

.table-header {
  background-color: #fbfcf7;
  border-bottom: 1rpx solid #e5e8d4;
}

.table-row {
  border-bottom: 1rpx solid #eef1e2;
}

.table-row:last-child {
  border-bottom: none;
}

/* 合计行样式 */
.total-row {
  background-color: #f6efe0;
  border-top: 2rpx solid #b08d4f;
  font-weight: bold;
}

.total-label {
  color: #26261f;
  font-weight: bold;
}

.total-value {
  color: #b4553f;
  font-weight: bold;
}

.header-item,
.row-item {
  font-size: 24rpx;
  display: flex;
  align-items: center;
}

.header-item {
  font-weight: bold;
  color: #26261f;
}

.row-item {
  color: #26261f;
}

.name-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  padding-left: 24rpx;
}

.recommend-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.method-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.actual-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  padding-right: 24rpx;
}

.row-item.highlight {
  color: #b08d4f;
  font-weight: bold;
}

/* 补剂制作单总量：数值 + 固定的“详情”提示（不再用文字下划线） */
.amount-detail-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.amount-detail-value {
  font-size: 24rpx;
  font-weight: 700;
  color: #b08d4f;
  line-height: 1.3;
}

.amount-detail-hint {
  font-size: 18rpx;
  color: #8a7a66;
  line-height: 1.2;
}

.food-table .name-col,
.food-table .recommend-col,
.food-table .method-col,
.food-table .actual-col {
  padding: 0 8rpx;
}

.food-table .name-col {
  flex: 0.95;
}

.food-table .recommend-col {
  flex: 1.15;
  font-size: 22rpx;
  line-height: 1.4;
  word-break: break-word;
}

.food-table .method-col {
  flex: 1.6;
}

.food-table .actual-col {
  flex: 0.7;
}

.recommend-choice {
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.recommend-main {
  max-width: 100%;
  font-size: 22rpx;
  color: #26261f;
  line-height: 1.35;
  word-break: break-word;
}

.recommend-badge {
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  background-color: #eef2e4;
  color: #b08d4f;
  border: 1rpx solid #e5e8d4;
  font-size: 19rpx;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none !important;
  white-space: nowrap;
  cursor: pointer;
}

.recommend-badge-replace {
  background-color: #f6efe0;
  border-color: #b08d4f;
  color: #8a6b33;
}

/* 商城关闭或状态查询失败时的中性说明，取代原来的静默隐藏 */
.supplement-unavailable-card {
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  border: 1rpx dashed #d8d2c4;
  background: #faf8f2;
}

.supplement-unavailable-text {
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a8375;
}

.production-only-tag {
  display: inline-block;
  margin-left: 8rpx;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  background: #f4f4f5;
  color: #909399;
  font-size: 20rpx;
}
.production-only-note {
  padding: 12rpx 16rpx;
  color: #b88230;
  background: #fdf6ec;
  border-radius: 8rpx;
  font-size: 22rpx;
  margin-top: 10rpx;
}
.supplement-table .product-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.supplement-table .brand-col {
  flex: 1;
  justify-content: center;
  text-align: center;
  font-size: 24rpx;
  color: #26261f;
}

.supplement-table .timing-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.supplement-table .dosage-col {
  flex: 1;
  justify-content: center;
  text-align: center;
}

.no-data {
  padding: 60rpx 0;
  text-align: center;
}

.no-data-text {
  font-size: 28rpx;
  color: #6b6653;
}

/* 制作流程 */
.production-steps-section {
  padding: 24rpx;
}

.steps-content {
  padding: 20rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
}

.steps-text {
  font-size: 28rpx;
  color: #26261f;
  line-height: 1.8;
  white-space: pre-wrap;
}

/* 结构化制作步骤（2026-10-24） */
.step-row {
  display: flex;
  gap: 16rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx dashed #ece3d4;
}

.step-row:last-child {
  border-bottom: 0;
}

.step-index {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
  border-radius: 50%;
  background: #1e3a2f;
  color: #f4ecd8;
  font-size: 22rpx;
  font-weight: 700;
  text-align: center;
  line-height: 40rpx;
}

.step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.step-instruction {
  font-size: 26rpx;
  line-height: 1.7;
  color: #26261f;
}

.step-meta {
  font-size: 22rpx;
  color: #8a7a66;
}

/* 储存和烹饪（2026-10-24 全店统一文案） */
.guide-card {
  padding: 20rpx 22rpx;
  background: #f7f1e4;
  border: 1rpx solid #e8decd;
  border-radius: 16rpx;
}

.guide-row {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 12rpx 0;
}

.guide-row + .guide-row {
  border-top: 1rpx dashed #e2d5bf;
}

.guide-label {
  font-size: 24rpx;
  font-weight: 700;
  color: #8a6b33;
}

.guide-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #4f4636;
}

/* 补剂购买引导：句子里嵌一颗小按钮（2026-10-24） */
.supplement-buy-note {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8rpx;
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  background: #f7f1e4;
  border: 1rpx solid #e8decd;
  border-radius: 14rpx;
}

/* 第二行：说明 + 按钮，整体作为一行排版 */
.supplement-buy-note-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6rpx;
  width: 100%;
}

.supplement-buy-note-text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.supplement-buy-note-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48rpx;
  margin: 0;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 23rpx;
  font-weight: 600;
  line-height: 48rpx;
}

.supplement-buy-note-btn::after {
  border: none;
}

.bottom-service {
  margin-right: 4rpx;
}

/* 固定文案卡片网格 */
.info-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 20rpx;
}

.info-card {
  background-color: #fbfcf7;
  padding: 24rpx;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.card-title {
  display: flex;
  align-items: center;
}

/* 底部操作栏 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  background-color: #fbfcf7;
  border-top: 1rpx solid #e5e8d4;
  display: flex;
  gap: 12rpx;
  z-index: 100;
}

.action-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #26261f;
  border: none;
}

.action-btn.primary {
  background-color: #1e3a2f;
  color: #f3eddd;
}

/* 保存：次级动作，浅绿底 + 墨绿字，与实心的「打印」区分开 */
.action-btn.secondary {
  background-color: #eef2e4;
  color: #1e3a2f;
  border: 2rpx solid #1e3a2f;
}

.btn-text {
  font-size: 26rpx;
  font-weight: 500;
}

/* Canvas离屏渲染 - 实际尺寸由 printCanvasStyle 绑定到高分辨率输出尺寸 */
.print-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  z-index: -1;
  pointer-events: none;
}

/* 规格弹窗 */
.spec-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.spec-content {
  width: 600rpx;
  background-color: #fbfcf7;
  border-radius: 16rpx;
  overflow: hidden;
}

.spec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border-bottom: 1rpx solid #e5e8d4;
}

.spec-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.btn-close {
  font-size: 40rpx;
  color: #6b6653;
  padding: 0 8rpx;
}

.spec-body {
  padding: 24rpx;
}

.spec-row {
  display: flex;
  margin-bottom: 20rpx;
  align-items: center;
}

.spec-label {
  font-size: 28rpx;
  color: #26261f;
  min-width: 200rpx;
  flex-shrink: 0;
  white-space: nowrap;
}

.spec-value {
  font-size: 28rpx;
  color: #26261f;
  flex: 1;
  word-break: break-all;
}

.btn-purchase {
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  border: none;
  border-radius: 8rpx;
  padding: 8rpx 24rpx;
  font-size: 26rpx;
  font-weight: 500;
  margin-left: 16rpx;
}

.btn-purchase:active {
  opacity: 0.8;
}

/* 用量详情弹窗样式 */
.spec-divider {
  height: 1rpx;
  background-color: #f0f3e9;
  margin: 20rpx 0;
}

.calculation-detail {
  margin: 20rpx 0;
  padding: 20rpx;
  background-color: #eef2e4;
  border-radius: 8rpx;
  border-left: 4rpx solid #1e3a2f;
}

.calculation-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
  display: block;
  margin-bottom: 12rpx;
}

.calculation-text {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.6;
  display: block;
}

.highlight-row {
  background-color: #f6efe0;
  padding: 12rpx;
  border-radius: 8rpx;
  margin-top: 8rpx;
}

.highlight-value {
  color: #b4553f;
  font-weight: bold;
  font-size: 30rpx;
}

/* 设备推荐卡片样式 */
.equipment-card {
  cursor: pointer;
  user-select: none;
}

.card-title .view-more {
  margin-left: auto;
  font-size: 24rpx;
  color: #b08d4f;
}

.equipment-list {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.equipment-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
  min-width: 100rpx;
}

.equipment-icon {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
}

.equipment-icon-placeholder {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 28rpx;
  color: #f3eddd;
  font-weight: bold;
}

.equipment-name {
  font-size: 22rpx;
  color: #26261f;
  text-align: center;
}

/* 设备推荐列表弹窗样式 */
.equipment-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}

.equipment-modal-content {
  width: 100%;
  max-height: 80vh;
  background-color: #fbfcf7;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.equipment-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 32rpx 24rpx;
  border-bottom: 1rpx solid #e5e8d4;
}

.equipment-modal-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #26261f;
}

.equipment-modal-body {
  flex: 1;
  overflow: hidden;
}

.equipment-scroll {
  height: 100%;
  padding: 24rpx 32rpx;
}

.equipment-detail-item {
  padding: 24rpx;
  background-color: #fbfcf7;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.equipment-detail-header {
  display: flex;
  gap: 20rpx;
  align-items: center;
}

.equipment-detail-image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.equipment-detail-image-placeholder {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.placeholder-text-large {
  font-size: 48rpx;
  color: #f3eddd;
  font-weight: bold;
}

.equipment-detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.equipment-detail-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.equipment-detail-brand {
  font-size: 26rpx;
  color: #26261f;
}

.equipment-detail-spec {
  font-size: 24rpx;
  color: #6b6653;
}

.equipment-detail-reason {
  padding: 16rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.reason-label {
  font-size: 26rpx;
  font-weight: bold;
  color: #26261f;
}

.reason-text {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.6;
}

.equipment-detail-action {
  display: flex;
  justify-content: flex-end;
}

.btn-purchase-equipment {
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  border: none;
  border-radius: 12rpx;
  padding: 16rpx 48rpx;
  font-size: 28rpx;
  font-weight: 500;
}

.btn-purchase-equipment:active {
  opacity: 0.8;
}

/* 推荐产品卡片列表（弹窗内） */
.rp-cards-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.rp-card {
  padding: 20rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  border: 2rpx solid #e5e8d4;
  transition: all 0.2s;
}

.rp-card:active {
  opacity: 0.8;
}

.rp-card-active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
}

.rp-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.rp-card-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
}

.rp-card-active .rp-card-name {
  color: #b08d4f;
}

.rp-card-badge {
  font-size: 22rpx;
  color: #f3eddd;
  background-color: #1e3a2f;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
}

.rp-card-body {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex: 1;
  min-width: 0;
}

.rp-card-main {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
}

.rp-card-aside {
  width: 180rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex-shrink: 0;
}

.rp-card-media {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #fbfcf7;
}

.rp-card-image {
  width: 100%;
  height: 100%;
  display: block;
  background-color: #fbfcf7;
}

.rp-card-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4rpx;
}

.rp-card-field-label {
  font-size: 24rpx;
  color: #6b6653;
}

.rp-card-field-value {
  font-size: 24rpx;
  color: #26261f;
  line-height: 1.5;
  text-align: left;
  word-break: break-all;
}

.rp-card-actions {
  display: flex;
  width: 100%;
}

/* 有图：按钮在缩略图下方整行左右展示 */
.rp-card-actions--row {
  gap: 12rpx;
  margin-top: 16rpx;
}

.rp-card-actions--row .btn-purchase,
.rp-card-actions--row .btn-confirm-select {
  flex: 1;
  margin-left: 0;
}

/* 无图：按钮在右侧竖排、垂直居中 */
.rp-card-actions--stacked {
  flex-direction: column;
  gap: 12rpx;
}

.rp-card-actions--stacked .btn-purchase {
  margin-left: 0;
}

.rp-card-aside--actions {
  justify-content: center;
}

/* 选中打勾：替代"已选"文字角标 */
.rp-card-check {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
  border-radius: 50%;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 24rpx;
  font-weight: 700;
  text-align: center;
  line-height: 40rpx;
}

.btn-confirm-select {
  width: 100%;
  height: 68rpx;
  border: none;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 68rpx;
  padding: 0 12rpx;
}

.btn-confirm-select::after {
  border: none;
}

/* 商品图骨架：图片加载前先占位，避免弹窗一打开一片空白 */
.rp-card-media,
.spec-image-block {
  position: relative;
}

.rp-card-image-skeleton,
.spec-image-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, #f1f3ea 25%, #e4e9d8 37%, #f1f3ea 63%);
  background-size: 400% 100%;
  animation: product-image-skeleton 1.4s ease infinite;
}

@keyframes product-image-skeleton {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.spec-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 20rpx;
}

.spec-action-btn {
  min-width: 160rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  font-weight: 500;
}

.spec-action-btn-secondary {
  background: #fbfcf7;
  color: #26261f;
  border: 1rpx solid #e5e8d4;
}

.spec-action-btn-primary {
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  border: none;
}

.spec-image-block {
  width: 220rpx;
  height: 220rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  overflow: hidden;
  background-color: #fbfcf7;
}

.spec-image {
  width: 100%;
  height: 100%;
  display: block;
  background-color: #fbfcf7;
}

.spec-detail-main {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.spec-detail-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.spec-detail-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
}

.spec-detail-field-label {
  font-size: 24rpx;
  color: #6b6653;
}

.spec-detail-field-value {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.5;
  text-align: left;
  word-break: break-all;
}

.spec-detail-aside {
  width: 220rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.spec-detail-actions {
  display: flex;
  width: 100%;
}

/* 「去购买」是弹窗里的核心动作：实心金底 + 白字，明显强于周围的浅色卡片 */
.btn-purchase-sm {
  background: linear-gradient(140deg, #c79a55 0%, #a97c33 100%);
  color: #fffdf7;
  border: none;
  border-radius: 999rpx;
  width: 100%;
  height: 68rpx;
  line-height: 68rpx;
  padding: 0 24rpx;
  font-size: 26rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  margin-left: 0;
  box-sizing: border-box;
  box-shadow: 0 6rpx 16rpx rgba(169, 124, 51, 0.28);
}

.btn-purchase-sm:active {
  background: linear-gradient(140deg, #b98d48 0%, #976d28 100%);
  box-shadow: 0 3rpx 8rpx rgba(169, 124, 51, 0.24);
  opacity: 1;
}

.btn-purchase-sm::after {
  border: none;
}
.standard-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  background: linear-gradient(150deg, #fdf8ee 0%, #f6efe0 100%);
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  border-radius: 16rpx;
  box-shadow: 0 8rpx 22rpx rgba(176, 141, 79, 0.14);
}

.standard-main {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.standard-badge {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #d8bc85;
  font-size: 24rpx;
  font-weight: 700;
  text-align: center;
  line-height: 40rpx;
}

.standard-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.standard-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.standard-sub {
  font-size: 22rpx;
  color: #968f6d;
}

.standard-toggle {
  font-size: 24rpx;
  color: #b08d4f;
}

.standard-explain {
  margin-top: 10rpx;
  padding: 20rpx 24rpx;
  background-color: #f2f4ea;
  border-radius: 12rpx;
}

.standard-explain-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #6b6653;
}

/* 制作清单：狗狗信息 / 制作信息 的标签+数值卡片 */
.purchase-facts {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.purchase-facts-head {
  display: flex;
  align-items: center;
}

.purchase-facts-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #26261f;
}

.purchase-facts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8rpx;
}

.purchase-fact {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  padding: 14rpx 6rpx;
  border-radius: 12rpx;
  background-color: #f2f4ea;
}

.purchase-fact-label {
  font-size: 20rpx;
  color: #968f6d;
  white-space: nowrap;
}

.purchase-fact-value {
  min-width: 0;
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
  text-align: center;
}

/* 购买预分装补剂：底部栏里的商业动作，用金色与「去购买」保持同一语义 */
.action-btn.buy {
  flex: 1.4;
  min-width: 0;
  background: linear-gradient(140deg, #c79a55 0%, #a97c33 100%);
  color: #fffdf7;
  font-weight: 700;
  letter-spacing: 0.5rpx;
  box-shadow: 0 6rpx 16rpx rgba(169, 124, 51, 0.24);
}

.action-btn.buy:active {
  background: linear-gradient(140deg, #b98d48 0%, #976d28 100%);
}

/* 分享：只剩图标，方形描边按钮，与保存同一行高 */
.action-btn.share {
  flex: 0 0 88rpx;
  width: 88rpx;
  padding: 0;
  background-color: #fbfcf7;
  border: 2rpx solid #1e3a2f;
}

/* 分享图标：用 CSS 现画的「托盘 + 上箭头」，不依赖字体符号 */
.share-icon {
  position: relative;
  width: 36rpx;
  height: 36rpx;
}

.share-icon-tray {
  position: absolute;
  left: 3rpx;
  bottom: 2rpx;
  width: 30rpx;
  height: 17rpx;
  border: 3rpx solid #1e3a2f;
  border-top: none;
  border-radius: 0 0 8rpx 8rpx;
  box-sizing: border-box;
}

.share-icon-shaft {
  position: absolute;
  left: 16rpx;
  top: 5rpx;
  width: 3rpx;
  height: 17rpx;
  background-color: #1e3a2f;
}

.share-icon-head {
  position: absolute;
  left: 12rpx;
  top: 4rpx;
  width: 12rpx;
  height: 12rpx;
  border-top: 3rpx solid #1e3a2f;
  border-left: 3rpx solid #1e3a2f;
  transform: rotate(45deg);
  box-sizing: border-box;
}


/* 用量说明：2026-10-18 起不再提损耗，只说明"买多少你自己判断" */
.purchase-amount-note {
  margin-top: 12rpx;
  padding: 0 4rpx;
}

.purchase-amount-note-text {
  font-size: 21rpx;
  line-height: 1.5;
  color: #968f6d;
}

/* 订购成品：放在“怎么做”之后（2026-10-24） */
.finished-food-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 24rpx 24rpx 0;
  padding: 24rpx;
  background: #fffdf7;
  border: 1rpx solid #e8decd;
  border-radius: 24rpx;
}

.finished-food-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.finished-food-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.finished-food-desc {
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a806c;
}

.finished-food-btn {
  flex: 0 0 auto;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 26rpx;
  margin: 0;
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  border-radius: 999rpx;
}

.finished-food-btn::after {
  border: 0;
}

/* 找 Seven爸爸：制作单没有第四颗底栏按钮，放内容末尾 */
.sheet-service {
  display: flex;
  justify-content: center;
  padding: 24rpx 0 180rpx;
}
</style>
