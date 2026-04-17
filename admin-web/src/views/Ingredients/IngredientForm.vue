<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="formRules"
    label-width="140px"
  >
    <el-alert
      v-if="copySourceName && !isEdit"
      type="info"
      :closable="false"
      show-icon
      class="copy-source-alert"
    >
      <template #title>
        复制自“{{ copySourceName }}”，请确认名称、规格、价格等信息后再保存。
      </template>
    </el-alert>

    <el-alert
      type="success"
      :closable="false"
      show-icon
      class="structure-alert"
    >
      <template #title>
        当前维护按原料类型分治：食材保留三层模型，补剂与包材逐步切换为单层产品模型。
      </template>
      {{ structureAlertDescription }}
    </el-alert>

    <el-alert
      v-if="isEdit && typeCapabilities.supportsChildSkus && !hasActiveProcurementSku"
      type="warning"
      :closable="false"
      show-icon
      class="missing-sku-alert"
    >
      <template #title>
        当前标准原料还没有启用中的采购 SKU。
      </template>
      后续采购建议和采购执行都会缺少可选商品，请先在下方补充至少 1 个启用中的采购 SKU。
    </el-alert>

    <!-- 标准原料信息 -->
    <div class="section-title">标准原料信息</div>

    <el-form-item label="原料名称" prop="name">
      <el-autocomplete
        v-model="formData.name"
        :fetch-suggestions="querySearchIngredients"
        placeholder="输入名称或拼音首字母（如：jxr）"
        maxlength="50"
        show-word-limit
        clearable
        style="width: 100%"
        :trigger-on-focus="false"
        @select="handleIngredientSelect"
        @input="handleIngredientInput"
      />
      <!-- 相似原料提示 -->
      <div v-if="similarIngredients.length > 0" class="similar-ingredients-warning">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>
            <span>已存在相似原料：</span>
            <el-tag
              v-for="item in similarIngredients"
              :key="item.id"
              type="warning"
              size="small"
              style="margin: 0 4px"
              @click="formData.name = item.name; similarIngredients = []"
              class="similar-tag"
            >
              {{ item.name }} ({{ Math.round(item.similarity * 100) }}%)
            </el-tag>
          </template>
        </el-alert>
      </div>
    </el-form-item>

    <el-form-item label="原料类型" prop="type">
      <el-radio-group v-model="formData.type" @change="handleTypeChange">
        <el-radio :value="IngredientType.FOOD" :disabled="isEdit">食材</el-radio>
        <el-radio :value="IngredientType.SUPPLEMENT" :disabled="isEdit">补剂</el-radio>
        <el-radio :value="IngredientType.PACKAGING" :disabled="isEdit">包材</el-radio>
      </el-radio-group>
      <div v-if="isEdit" class="form-item-helper">
        已创建原料的类型不可再修改，避免子 SKU、采购与营养链路悬空。
      </div>
    </el-form-item>

    <el-form-item label="备注">
      <el-input
        v-model="formData.notes"
        type="textarea"
        :rows="2"
        placeholder="请输入备注"
        maxlength="200"
        show-word-limit
      />
    </el-form-item>

    <el-form-item v-if="typeCapabilities.showTagSelector" label="标签分类">
      <div class="tag-selector-wrapper">
        <!-- 操作按钮 -->
        <div class="tag-selector-actions">
          <span class="selected-count">已选 {{ selectedTagIds.length }} 个</span>
          <el-button size="small" @click="selectAllTags">全选</el-button>
          <el-button size="small" @click="clearAllTags">取消全选</el-button>
          <el-button type="primary" size="small" @click="showCreateTagDialog">
            <el-icon><Plus /></el-icon>
            快速新建
          </el-button>
        </div>

        <!-- 标签列表 -->
        <div v-if="allTags.length > 0" class="tag-list">
          <el-tag
            v-for="tag in allTags"
            :key="tag.id"
            class="tag-item"
            :type="selectedTagIds.includes(tag.id) ? 'primary' : 'info'"
            @click="toggleTag(tag.id)"
            style="cursor: pointer"
          >
            {{ tag.name }}
          </el-tag>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty-tags-state">
          <el-empty description="暂无标签，请先创建标签">
            <el-button type="primary" @click="showCreateTagDialog">创建第一个标签</el-button>
          </el-empty>
        </div>
      </div>
      <div class="hint-text">点击标签选择，可多选</div>

      <!-- 快速新建标签对话框 -->
      <el-dialog
        v-model="createTagDialogVisible"
        title="快速新建标签"
        width="500px"
        :close-on-click-modal="false"
      >
        <el-form :model="newTagForm" label-width="80px">
          <el-form-item label="标签名称" required>
            <el-input
              v-model="newTagForm.name"
              placeholder="请输入标签名称"
              maxlength="20"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="newTagForm.description"
              type="textarea"
              :rows="2"
              placeholder="请输入标签描述（可选）"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker v-model="newTagForm.color" />
            <span class="hint-text">可选，为标签设置颜色标识</span>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createTagDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleCreateTag" :loading="creatingTag">
            创建并选中
          </el-button>
        </template>
      </el-dialog>
    </el-form-item>

    <!-- 标准口径 -->
    <div class="section-title">标准口径</div>

    <el-form-item label="基准单位" prop="baseUnit">
      <el-radio-group v-model="formData.baseUnit" @change="handleBaseUnitChange">
        <el-radio :value="BaseUnit.G">克 (G)</el-radio>
        <el-radio :value="BaseUnit.ML">毫升 (ML)</el-radio>
        <el-radio :value="BaseUnit.PCS">个/件 (PCS)</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item label="标准单位展示名">
      <el-input
        v-model="formData.baseUnitDisplayName"
        placeholder="可选，如：平勺、条"
        maxlength="20"
        style="width: 200px"
      />
      <span class="hint-text">仅用于标准单位展示别名，不用于表达袋、包、盒等采购包装</span>
    </el-form-item>

    <el-form-item v-if="formData.baseUnit === BaseUnit.PCS" label="单个重量(克)" prop="weightG">
      <el-input-number
        v-model="formData.weightG"
        :min="0.1"
        :max="100000"
        :step="0.1"
        :precision="1"
        controls-position="right"
        style="width: 200px"
      />
      <span class="unit-label">克</span>
      <span class="hint-text">
        <span v-if="formData.type === IngredientType.PACKAGING">必填（装箱算法需要）</span>
        <span v-else-if="formData.type === IngredientType.SUPPLEMENT">可选（用于运费计算，不填默认为0）</span>
        <span v-else>可选</span>
      </span>
    </el-form-item>

    <el-form-item
      v-if="formData.type === IngredientType.PACKAGING && formData.baseUnit === BaseUnit.PCS"
      label="最大容量(克)"
    >
      <el-input-number
        v-model="formData.maxCapacityG"
        :min="1"
        :max="1000000"
        :step="1"
        controls-position="right"
        style="width: 200px"
      />
      <span class="unit-label">克</span>
      <span class="hint-text">包材装箱算法使用</span>
    </el-form-item>

    <div v-if="typeCapabilities.showProcurementStrategyEditor" class="section-title">业务策略</div>

    <el-form-item
      v-if="typeCapabilities.showProcurementStrategyEditor"
      label="采购策略"
      prop="procurementStrategy"
    >
      <el-radio-group v-model="formData.procurementStrategy">
        <el-radio :value="IngredientProcurementStrategy.DAILY_PURCHASE">
          {{ IngredientProcurementStrategyLabels[IngredientProcurementStrategy.DAILY_PURCHASE] }}
        </el-radio>
        <el-radio :value="IngredientProcurementStrategy.STOCK_REPLENISHMENT">
          {{ IngredientProcurementStrategyLabels[IngredientProcurementStrategy.STOCK_REPLENISHMENT] }}
        </el-radio>
        <el-radio :value="IngredientProcurementStrategy.HYBRID">
          {{ IngredientProcurementStrategyLabels[IngredientProcurementStrategy.HYBRID] }}
        </el-radio>
      </el-radio-group>
      <span class="hint-text">
        日采适合当天买当天用；库存补货适合海产、冻品、补剂、包材；混合表示两种采购方式都会发生。
      </span>
    </el-form-item>

    <!-- 类型特定属性 -->
    <div class="section-title">{{ getTypeSpecificTitle() }}</div>

    <!-- 食材属性 -->
    <template v-if="formData.type === IngredientType.FOOD">
      <el-form-item label="CFCT分类" prop="cfct_class">
        <el-select
          v-model="foodProperties.cfct_class"
          placeholder="请选择分类"
          style="width: 200px"
        >
          <el-option
            v-for="cls in CFCT_CLASS_OPTIONS"
            :key="cls"
            :label="cls"
            :value="cls"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="可食部比率" prop="edible_yield_rate">
        <el-input-number
          v-model="foodProperties.edible_yield_rate"
          :min="0.1"
          :max="1.0"
          :step="0.01"
          :precision="2"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">去除不可食部分后的比率，如带骨肉类为0.85</span>
      </el-form-item>

      <el-form-item label="主要营养价值" prop="main_nutrients_desc">
        <el-input
          v-model="foodProperties.main_nutrients_desc"
          placeholder="如：高蛋白，低脂肪"
          maxlength="100"
        />
      </el-form-item>

      <el-form-item
        v-if="formData.baseUnit === BaseUnit.ML"
        label="密度(g/ml)"
        prop="density_g_per_ml"
      >
        <el-input-number
          v-model="foodProperties.density_g_per_ml"
          :min="0.1"
          :max="10"
          :step="0.01"
          :precision="3"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">ML类型必填，用于体积→质量转换</span>
      </el-form-item>
    </template>

    <!-- 补剂属性 -->
    <template v-if="formData.type === IngredientType.SUPPLEMENT">
      <el-form-item label="产品品牌">
        <el-input
          v-model="formData.brand"
          placeholder="如：NOW FOODS"
          maxlength="100"
          style="width: 240px"
        />
      </el-form-item>

      <el-form-item label="产品规格">
        <el-input
          v-model="formData.productModel"
          placeholder="如：100粒/瓶，134mg(200IU)/粒"
          maxlength="100"
          style="width: 320px"
        />
      </el-form-item>

      <el-form-item label="购买/采购渠道">
        <el-input
          v-model="formData.purchaseChannel"
          placeholder="如：京东、天猫旗舰店"
          maxlength="200"
          style="width: 320px"
        />
      </el-form-item>

      <el-form-item label="添加时机" prop="add_timing">
        <el-select
          v-model="supplementProperties.add_timing"
          placeholder="请选择添加时机"
          style="width: 200px"
        >
          <el-option
            v-for="timing in SUPPLEMENT_ADD_TIMING_OPTIONS"
            :key="timing.value"
            :label="timing.label"
            :value="timing.value"
          />
        </el-select>
        <span class="hint-text">补剂添加到食谱中的时机</span>
      </el-form-item>

      <el-form-item label="生产损耗率">
        <el-input-number
          v-model="supplementProperties.production_loss_rate"
          :min="1.0"
          :max="2.0"
          :step="0.01"
          :precision="2"
          controls-position="right"
          style="width: 200px"
        />
        <span class="hint-text">可选，覆盖全局默认值1.05</span>
      </el-form-item>

      <div class="capability-section">
        <el-form-item label="用于 DIY 推荐">
          <el-switch v-model="formData.diyEnabled" />
          <span class="hint-text">开启后，这条补剂可出现在食谱补剂替代选项和 DIY 制作单中</span>
        </el-form-item>

        <template v-if="showSupplementPurchaseLinkField">
          <div class="capability-fields">
            <el-form-item label="购买链接">
              <div style="width: 100%;">
                <el-select
                  v-model="supplementPurchaseLink.platform"
                  placeholder="平台类型"
                  style="width: 180px; margin-bottom: 8px;"
                >
                  <el-option label="淘宝/天猫" value="TAOBAO" />
                  <el-option label="京东" value="JD" />
                  <el-option label="拼多多" value="PINDUODUO" />
                  <el-option label="iHerb" value="IHERB" />
                  <el-option label="其他小程序" value="OTHER" />
                  <el-option label="网页链接" value="WEBVIEW" />
                </el-select>
                <el-input
                  v-model="supplementPurchaseLink.url"
                  placeholder="补剂产品购买链接"
                  style="width: 100%;"
                />
              </div>
            </el-form-item>

            <el-form-item
              v-if="typeCapabilities.showSupplementImageField"
              label="产品图片"
            >
              <div class="supplement-image-panel">
                <div v-if="supplementProperties.image_url" class="supplement-image-preview-card">
                  <el-image
                    :src="supplementProperties.image_url"
                    :preview-src-list="[supplementProperties.image_url]"
                    fit="cover"
                    preview-teleported
                    class="supplement-image-preview"
                  />
                  <div class="supplement-image-actions">
                    <el-upload
                      v-if="props.ingredient?.id"
                      :show-file-list="false"
                      accept="image/*"
                      :before-upload="handleSupplementImageUpload"
                      :disabled="supplementImageUploading"
                    >
                      <el-button :loading="supplementImageUploading">替换图片</el-button>
                    </el-upload>
                    <el-button
                      v-else
                      :loading="supplementImageUploading"
                      @click="notifySupplementImageRequiresSavedIngredient"
                    >
                      替换图片
                    </el-button>
                    <el-button
                      type="danger"
                      plain
                      :loading="supplementImageUploading"
                      @click="props.ingredient?.id ? handleRemoveSupplementImage() : notifySupplementImageRequiresSavedIngredient()"
                    >
                      删除图片
                    </el-button>
                  </div>
                </div>
                <div v-else class="supplement-image-empty">
                  <div class="supplement-image-empty-copy">
                    推荐上传 1:1 方图，系统会自动裁切并用于小程序 DIY 制作单推荐弹窗展示。
                  </div>
                  <el-upload
                    v-if="props.ingredient?.id"
                    :show-file-list="false"
                    accept="image/*"
                    :before-upload="handleSupplementImageUpload"
                    :disabled="supplementImageUploading"
                  >
                    <el-button type="primary" :loading="supplementImageUploading">上传图片</el-button>
                  </el-upload>
                  <el-button
                    v-else
                    type="primary"
                    :loading="supplementImageUploading"
                    @click="notifySupplementImageRequiresSavedIngredient"
                  >
                    上传图片
                  </el-button>
                </div>
                <div class="hint-text">
                  建议原图清晰、主体居中，推荐尺寸 1200 × 1200。
                  <span v-if="!props.ingredient?.id">请先保存补剂原料，再上传产品图片。</span>
                </div>
              </div>
            </el-form-item>
          </div>
        </template>
      </div>

      <div class="capability-section">
        <el-form-item label="用于采购/生产">
          <el-switch v-model="formData.procurementEnabled" />
          <span class="hint-text">开启后，这条补剂可用于采购、生产和库存执行</span>
        </el-form-item>

        <template v-if="showSupplementPurchaseFields">
          <div class="capability-fields">
            <el-form-item label="采购单位">
              <el-input
                v-model="formData.purchaseUnit"
                placeholder="如：瓶、盒、袋"
                maxlength="50"
                style="width: 180px"
              />
            </el-form-item>

            <el-form-item label="换算倍数">
              <el-input-number
                v-model="formData.purchaseToBaseRatio"
                :min="0.01"
                :precision="2"
                :step="0.01"
                controls-position="right"
                style="width: 180px"
              />
              <span class="hint-text">1 个采购单位等于多少 {{ BaseUnitLabels[formData.baseUnit] }}</span>
            </el-form-item>

            <el-form-item label="当前采购价">
              <el-input-number
                v-model="formData.currentPricePerPurchaseUnit"
                :min="0"
                :precision="2"
                :step="0.1"
                controls-position="right"
                style="width: 180px"
              />
              <span class="hint-text">单层补剂直接使用这条标准原料上的采购价格</span>
            </el-form-item>
          </div>
        </template>
      </div>
    </template>

    <!-- 包材属性 -->
    <template v-if="formData.type === IngredientType.PACKAGING">
      <el-form-item label="用于采购/生产">
        <el-switch v-model="formData.procurementEnabled" />
        <span class="hint-text">开启后，这条包材可用于采购、库存和生产执行</span>
      </el-form-item>

      <el-form-item label="产品品牌">
        <el-input
          v-model="formData.brand"
          placeholder="如：盒马、某包材品牌"
          maxlength="100"
          style="width: 240px"
        />
      </el-form-item>

      <el-form-item label="产品规格">
        <el-input
          v-model="formData.productModel"
          placeholder="如：4号泡沫箱 / 30个装"
          maxlength="100"
          style="width: 320px"
        />
      </el-form-item>

      <el-form-item label="采购渠道">
        <el-input
          v-model="formData.purchaseChannel"
          placeholder="如：盒马、线下包材供应商"
          maxlength="200"
          style="width: 320px"
        />
      </el-form-item>

      <el-form-item label="采购单位">
        <el-input
          v-model="formData.purchaseUnit"
          placeholder="如：箱、卷、袋"
          maxlength="50"
          style="width: 180px"
        />
      </el-form-item>

      <el-form-item label="换算倍数">
        <el-input-number
          v-model="formData.purchaseToBaseRatio"
          :min="0.01"
          :precision="2"
          :step="0.01"
          controls-position="right"
          style="width: 180px"
        />
        <span class="hint-text">1 个采购单位等于多少 {{ BaseUnitLabels[formData.baseUnit] }}</span>
      </el-form-item>

      <el-form-item label="当前采购价">
        <el-input-number
          v-model="formData.currentPricePerPurchaseUnit"
          :min="0"
          :precision="2"
          :step="0.1"
          controls-position="right"
          style="width: 180px"
        />
      </el-form-item>

      <el-form-item label="消耗品类型" prop="is_consumable">
        <el-radio-group v-model="packagingProperties.is_consumable">
          <el-radio :value="true">消耗品</el-radio>
          <el-radio :value="false">固定资产</el-radio>
        </el-radio-group>
        <div class="hint-text">
          消耗品：每单消耗，计入成本（如真空袋、标签）<br>
          固定资产：重复使用，不计入单笔成本（如保温箱、密封盒）
        </div>
      </el-form-item>

      <el-form-item v-if="showPackagingStockPolicyFields" label="安全库存">
        <el-input-number
          v-model="formData.safetyStock"
          :min="0"
          :precision="2"
          :step="0.1"
          controls-position="right"
          style="width: 180px"
        />
      </el-form-item>

      <el-form-item v-if="showPackagingStockPolicyFields" label="补货点">
        <el-input-number
          v-model="formData.reorderPoint"
          :min="0"
          :precision="2"
          :step="0.1"
          controls-position="right"
          style="width: 180px"
        />
      </el-form-item>

      <el-form-item v-if="showPackagingStockPolicyFields" label="目标库存">
        <el-input-number
          v-model="formData.targetStock"
          :min="0"
          :precision="2"
          :step="0.1"
          controls-position="right"
          style="width: 180px"
        />
      </el-form-item>

    </template>

    <!-- FOOD only child SKU management -->
    <template v-if="typeCapabilities.supportsChildSkus && isEdit">
      <div class="section-title section-title-with-tag">
        <span>家庭 DIY 推荐商品</span>
        <el-tag size="small" type="primary">已配置 {{ recommendedProductCount }} 个</el-tag>
      </div>
      <div class="recommended-products-section">
        <div class="rp-header">
          <el-button type="primary" size="small" :icon="Plus" @click="openRpDialog()">新增DIY推荐商品</el-button>
          <span class="hint-text" style="margin-left: 8px;">面向用户家庭制作场景，维护带广告联盟链接的推荐商品</span>
        </div>
        <div v-if="recommendedProducts.length === 0" class="rp-empty">
          暂无家庭 DIY 推荐商品，点击上方按钮添加
        </div>
        <div v-else class="rp-list">
          <div v-for="rp in recommendedProducts" :key="rp.id" class="rp-card">
            <div class="rp-card-main">
              <div class="rp-card-info">
                <span class="rp-name">{{ rp.name }}</span>
                <el-tag v-if="rp.brand" size="small" type="info">{{ rp.brand }}</el-tag>
                <el-tag v-if="rp.productModel" size="small" type="info">{{ rp.productModel }}</el-tag>
                <el-tag v-if="rp.purchaseChannel" size="small" type="warning">{{ rp.purchaseChannel }}</el-tag>
                <el-tag size="small" effect="plain">建议顺序 {{ rp.sortOrder }}</el-tag>
                <el-tag :type="rp.isActive ? 'success' : 'info'" size="small">
                  {{ rp.isActive ? '已启用' : '已停用' }}
                </el-tag>
              </div>
              <div class="rp-card-actions">
                <el-button size="small" link type="primary" @click="openRpDialog(rp)">编辑</el-button>
                <el-button size="small" link type="warning" @click="toggleRpActive(rp)">
                  {{ rp.isActive ? '停用' : '启用' }}
                </el-button>
                <el-popconfirm title="确认删除此家庭 DIY 推荐商品？" @confirm="deleteRp(rp.id)">
                  <template #reference>
                    <el-button size="small" link type="danger">删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <div
              v-if="rp.purchaseChannel || rp.displayUnit || rp.purchaseLink?.url || (rp.marketingNutritionHighlights && Object.keys(rp.marketingNutritionHighlights).length > 0)"
              class="rp-card-detail"
            >
              <span v-if="rp.purchaseChannel">渠道：{{ rp.purchaseChannel }}</span>
              <span v-if="rp.displayUnit">展示单位：{{ rp.displayUnit }}</span>
              <span v-if="rp.purchaseLink?.url">已配置推荐链接</span>
              <span
                v-if="rp.marketingNutritionHighlights && Object.keys(rp.marketingNutritionHighlights).length > 0"
              >
                已配置营养卖点
              </span>
            </div>
          </div>
        </div>
      </div>

      <el-divider content-position="left">生产采购 SKU</el-divider>
      <div class="recommended-products-section">
        <div class="rp-header">
          <el-button type="primary" size="small" :icon="Plus" @click="openProcurementDialog()">新增采购SKU</el-button>
          <span class="hint-text" style="margin-left: 8px;">面向采购和生产场景，维护渠道、规格、换算、价格和库存策略</span>
        </div>
        <div v-if="procurementSkus.length === 0" class="rp-empty">
          暂无生产采购 SKU，点击上方按钮添加
        </div>
        <div v-else class="rp-list">
          <div v-for="sku in procurementSkus" :key="sku.id" class="rp-card">
            <div class="rp-card-main">
              <div class="rp-card-info">
                <span class="rp-name">{{ sku.name }}</span>
                <el-tag v-if="sku.brand" size="small" type="info">{{ sku.brand }}</el-tag>
                <el-tag v-if="sku.productModel" size="small" type="info">{{ sku.productModel }}</el-tag>
                <el-tag v-if="sku.isDefault" size="small" type="primary">默认</el-tag>
                <el-tag :type="sku.isActive ? 'success' : 'info'" size="small">
                  {{ sku.isActive ? '已启用' : '已停用' }}
                </el-tag>
              </div>
              <div class="rp-card-actions">
                <el-button size="small" link type="primary" @click="openProcurementDialog(sku)">编辑</el-button>
                <el-button size="small" link type="warning" @click="toggleProcurementSkuActive(sku)">
                  {{ sku.isActive ? '停用' : '启用' }}
                </el-button>
                <el-popconfirm title="确认删除此生产采购 SKU？" @confirm="deleteProcurementSku(sku.id)">
                  <template #reference>
                    <el-button size="small" link type="danger">删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <div
              v-if="sku.purchaseChannel || sku.purchaseUnit || sku.currentPurchasePrice !== null || sku.referencePurchasePrice !== null || sku.notes"
              class="rp-card-detail"
            >
              <span v-if="sku.purchaseChannel">渠道：{{ sku.purchaseChannel }}</span>
              <span v-if="sku.purchaseUnit">采购单位：{{ sku.purchaseUnit }}</span>
              <span v-if="sku.currentPurchasePrice !== null">
                当前采购价：¥{{ Number(sku.currentPurchasePrice).toFixed(2) }}
                <template v-if="sku.purchaseUnit">/ {{ sku.purchaseUnit }}</template>
              </span>
              <span v-if="sku.referencePurchasePrice !== null">
                参考价：¥{{ Number(sku.referencePurchasePrice).toFixed(2) }}
              </span>
              <span v-if="sku.purchaseToBaseRatio !== null">换算：1 {{ sku.purchaseUnit || sku.displayUnit || '单位' }} = {{ sku.purchaseToBaseRatio }} {{ BaseUnitLabels[formData.baseUnit] }}</span>
              <span v-if="sku.notes">备注：{{ sku.notes }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="typeCapabilities.supportsChildSkus && !isEdit">
      <div class="section-title">SKU 管理</div>
      <div class="sku-guide-card">
        <div class="sku-guide-title">先保存标准原料，再继续补充推荐商品和采购 SKU</div>
        <div class="sku-guide-desc">
          保存成功后，当前弹窗会保持打开，你可以继续补充家庭 DIY 推荐商品，以及面向采购/生产场景的生产采购 SKU。
        </div>
      </div>
    </template>

    <!-- Actions -->
    <el-form-item>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        保存
      </el-button>
      <el-button @click="handleCancel">取消</el-button>
    </el-form-item>
  </el-form>

  <!-- 采购 SKU 编辑弹窗 -->
  <el-dialog
    v-model="rpDialogVisible"
    :title="rpEditingId ? '编辑家庭DIY推荐商品' : '新增家庭DIY推荐商品'"
    width="640px"
    destroy-on-close
  >
    <el-form :model="rpForm" label-width="120px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="sku-dialog-alert"
      >
        这里记录的是面向家庭 DIY 的推荐商品，可配置购买链接、展示单位和营养信息，方便小程序端展示给用户。
      </el-alert>
      <el-form-item label="SKU 名称" required>
        <el-input v-model="rpForm.name" placeholder="如：沃尔玛糙米 600g/罐" maxlength="100" />
      </el-form-item>
      <el-form-item label="品牌">
        <el-autocomplete
          v-model="rpForm.brand"
          :fetch-suggestions="querySearchSkuBrands"
          placeholder="产品品牌"
          maxlength="100"
          style="width: 200px"
        />
      </el-form-item>
      <el-form-item label="零售规格">
        <el-input v-model="rpForm.productModel" placeholder="如：200g装、60粒/瓶、1kg/袋" maxlength="100" style="width: 240px" />
      </el-form-item>
      <el-form-item label="采购渠道">
        <el-autocomplete
          v-model="rpForm.purchaseChannel"
          :fetch-suggestions="querySearchSkuChannels"
          placeholder="如：淘宝、京东、线下宠物店"
          maxlength="200"
          style="width: 300px"
        />
      </el-form-item>
      <el-form-item label="购买链接">
        <div style="width: 100%;">
          <el-select v-model="rpForm.purchaseLinkPlatform" placeholder="平台类型" style="width: 160px; margin-bottom: 8px;">
            <el-option label="淘宝/天猫" value="TAOBAO" />
            <el-option label="京东" value="JD" />
            <el-option label="拼多多" value="PINDUODUO" />
            <el-option label="iHerb" value="IHERB" />
            <el-option label="其他小程序" value="OTHER" />
            <el-option label="网页链接" value="WEBVIEW" />
          </el-select>
          <el-input v-model="rpForm.purchaseLinkUrl" placeholder="商品购买链接" style="width: 100%;" />
        </div>
      </el-form-item>
      <el-form-item label="商品图片">
        <el-input v-model="rpForm.imageUrl" placeholder="产品图片URL" style="width: 400px" />
      </el-form-item>
      <el-form-item label="营养卖点">
        <div style="width: 100%;">
          <div class="nutrient-list">
            <div v-for="(nutrient, idx) in rpFormNutrients" :key="idx" class="nutrient-row-enhanced">
              <el-autocomplete
                v-model="nutrient.name"
                :fetch-suggestions="querySearchNutritionNames"
                placeholder="营养素名称"
                style="width: 160px"
              />
              <el-input-number v-model="nutrient.value" :min="0" :precision="2" placeholder="含量" style="width: 140px" />
              <el-select v-model="nutrient.unit" style="width: 110px">
                <el-option v-for="u in NUTRIENT_UNITS" :key="u.value" :label="u.label" :value="u.value" />
              </el-select>
              <el-button :icon="Delete" size="small" circle @click="rpFormNutrients.splice(idx, 1)" />
            </div>
          </div>
          <el-button size="small" :icon="Plus" @click="rpFormNutrients.push({ name: '', value: 0, unit: 'mg' })">添加卖点</el-button>
        </div>
      </el-form-item>
      <el-form-item label="展示单位">
        <el-input v-model="rpForm.displayUnit" placeholder="如：罐、袋、瓶、粒" maxlength="50" style="width: 140px" />
      </el-form-item>
      <el-form-item label="建议顺序">
        <el-input-number v-model="rpForm.sortOrder" :min="0" style="width: 140px" />
        <span class="hint-text">数字越小越靠前，生成采购清单时越容易成为默认建议 SKU</span>
      </el-form-item>
      <el-form-item label="启用此 SKU">
        <el-switch v-model="rpForm.isActive" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rpDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="rpSaving" @click="saveRp">保存</el-button>
    </template>
  </el-dialog>

  <!-- 生产采购 SKU 编辑弹窗 -->
  <el-dialog
    v-model="procurementDialogVisible"
    :title="procurementEditingId ? '编辑生产采购SKU' : '新增生产采购SKU'"
    width="640px"
    destroy-on-close
  >
    <el-form :model="procurementForm" label-width="120px">
      <el-form-item label="SKU名称" required>
        <el-input v-model="procurementForm.name" placeholder="采购时使用的商品名称" maxlength="100" />
      </el-form-item>
      <el-form-item label="品牌">
        <el-autocomplete
          v-model="procurementForm.brand"
          :fetch-suggestions="querySearchSkuBrands"
          placeholder="商品品牌"
          maxlength="100"
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="产品规格">
        <el-input v-model="procurementForm.productModel" placeholder="如：500g/袋、60粒/瓶" maxlength="100" style="width: 220px" />
      </el-form-item>
      <el-form-item label="采购渠道">
        <el-autocomplete
          v-model="procurementForm.purchaseChannel"
          :fetch-suggestions="querySearchSkuChannels"
          placeholder="如：盒马、淘宝、线下批发市场"
          maxlength="200"
          style="width: 320px"
        />
      </el-form-item>
      <el-form-item label="供应商">
        <el-input v-model="procurementForm.supplierName" placeholder="可选，供应商名称" maxlength="200" style="width: 240px" />
      </el-form-item>
      <el-form-item label="采购单位">
        <el-input v-model="procurementForm.purchaseUnit" placeholder="如：袋、瓶、箱、kg" maxlength="50" style="width: 160px" />
      </el-form-item>
      <el-form-item label="换算倍数">
        <el-input-number
          v-model="procurementForm.purchaseToBaseRatio"
          :min="0.01"
          :precision="2"
          :step="0.01"
          style="width: 180px"
        />
        <span class="hint-text" style="margin-left: 8px;">1 个采购单位等于多少 {{ BaseUnitLabels[formData.baseUnit] }}</span>
      </el-form-item>
      <el-form-item label="当前采购价">
        <el-input-number
          v-model="procurementForm.currentPurchasePrice"
          :min="0"
          :precision="2"
          :step="0.1"
          style="width: 180px"
        />
        <span class="hint-text" style="margin-left: 8px;">采购和执行优先参考这个价格</span>
      </el-form-item>
      <el-form-item label="参考单价">
        <el-input-number
          v-model="procurementForm.referencePurchasePrice"
          :min="0"
          :precision="2"
          :step="0.1"
          style="width: 180px"
        />
        <span class="hint-text" style="margin-left: 8px;">用于补货建议和历史参考</span>
      </el-form-item>
      <el-form-item label="安全库存">
        <el-input-number
          v-model="procurementForm.safetyStock"
          :min="0"
          :precision="2"
          :step="0.1"
          style="width: 180px"
        />
      </el-form-item>
      <el-form-item label="补货点">
        <el-input-number
          v-model="procurementForm.reorderPoint"
          :min="0"
          :precision="2"
          :step="0.1"
          style="width: 180px"
        />
      </el-form-item>
      <el-form-item label="目标库存">
        <el-input-number
          v-model="procurementForm.targetStock"
          :min="0"
          :precision="2"
          :step="0.1"
          style="width: 180px"
        />
      </el-form-item>
      <el-form-item label="显示单位">
        <el-input v-model="procurementForm.displayUnit" placeholder="如：袋、瓶、箱" maxlength="50" style="width: 160px" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="procurementForm.notes"
          type="textarea"
          :rows="3"
          placeholder="可填写渠道说明、规格差异、采购备注"
          maxlength="300"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="procurementForm.sortOrder" :min="0" style="width: 140px" />
      </el-form-item>
      <el-form-item label="默认 SKU">
        <el-switch v-model="procurementForm.isDefault" />
      </el-form-item>
      <el-form-item label="启用状态">
        <el-switch v-model="procurementForm.isActive" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="procurementDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="procurementSaving" @click="saveProcurementSku">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, nextTick } from 'vue'
import type { FormInstance, FormRules, UploadProps } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ingredientTagApi, type IngredientTag, type CreateTagDto } from '@/api/ingredientTags'
import { ingredientApi } from '@/api/ingredients'
import { INGREDIENT_NUTRITION_TAB_DEFINITIONS } from '@/constants/ingredientNutrition'
import { buildSupplementActiveNutrientsFromNutritionProfile } from '@/utils/ingredientNutrition'
import {
  getDefaultProcurementStrategyForType,
  getIngredientTypeCapabilities,
  shouldLoadChildSkuData,
  shouldShowPackagingStockPolicyFields as resolvePackagingStockPolicyVisibility,
  shouldShowSupplementPurchaseFields as resolveSupplementPurchaseFieldsVisibility,
  shouldShowSupplementPurchaseLinkField as resolveSupplementPurchaseLinkVisibility,
} from '@/utils/ingredientTypeCapabilities'
import {
  IngredientType,
  IngredientProcurementStrategy,
  BaseUnit,
  SupplementAddTiming,
  BaseUnitLabels,
  IngredientProcurementStrategyLabels,
  CFCT_CLASS_OPTIONS,
  type PurchaseLinkConfig,
  type Ingredient,
  type IngredientForm,
  type FoodProperties,
  type ProcurementSku,
  type ProcurementSkuForm,
  type SupplementProperties,
  type PackagingProperties,
  type RecommendedProduct,
  type RecommendedProductForm
} from '@/types/ingredient'

interface Props {
  ingredient?: IngredientForm | Ingredient
  copySourceName?: string
}

interface Emits {
  (e: 'submit', data: IngredientForm): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const allTags = ref<IngredientTag[]>([])
const allIngredients = ref<Ingredient[]>([])
const selectedTagIds = ref<string[]>([])
const similarIngredients = ref<Array<{ id: string; name: string; similarity: number }>>([])
const similarUnits = ref<string[]>([])

// 常用采购单位数据库
const COMMON_PURCHASE_UNITS = [
  'kg', 'g', '斤', '两', '吨',  // 重量单位
  '箱', '盒', '瓶', '袋', '包', '桶',  // 容器单位
  '个', '片', '粒', '条', '块', '张',  // 计数单位
  '米', '卷', '捆', '把', '扎',  // 长度/束状单位
  '升', '毫升', 'ml', 'L', 'ml'  // 容积单位
]

// 单位别名映射表（别名 -> 标准单位）
const UNIT_ALIASES: Record<string, string> = {
  // kg 别名
  'KG': 'kg',
  'Kg': 'kg',
  '公斤': 'kg',
  '千克': 'kg',
  'kilo': 'kg',

  // g 别名
  'G': 'g',
  '克': 'g',
  'gram': 'g',
  '公克': 'g',

  // 斤两
  '市斤': '斤',
  '市两': '两',

  // 箱盒
  '箱子': '箱',
  '盒子': '盒',
  '纸箱': '箱'
}

// 拼音映射表（常用汉字）
const PINYIN_MAP: Record<string, string> = {
  '鸡': 'j', '胸': 'x', '肉': 'r', '腿': 't', '肝': 'g', '心': 'x',
  '猪': 'z', '牛': 'n', '羊': 'y', '鸭': 'y', '鹅': 'e',
  '鱼': 'y', '虾': 'x', '蟹': 'x', '贝': 'b',
  '胡': 'h', '萝': 'l', '卜': 'b', '白': 'b', '红': 'h',
  '南': 'n', '瓜': 'g', '冬': 'd', '黄': 'h', '苦': 'k',
  '大': 'd', '小': 'x', '绿': 'l', '青': 'q', '洋': 'y',
  '土': 't', '番': 'f', '茄': 'q', '椒': 'j', '芹': 'q',
  '菠': 'b', '菜': 'c', '葱': 'c', '蒜': 's', '姜': 'j',
  '苹': 'p', '果': 'g', '香': 'x', '蕉': 'j', '梨': 'l',
  '桃': 't', '杏': 'x', '李': 'l', '枣': 'z', '橘': 'j',
  '豆': 'd', '腐': 'f', '芽': 'y', '干': 'g',
  '玉': 'y', '米': 'm', '面': 'm', '粉': 'f',
  '奶': 'n', '酸': 's', '蛋': 'd',
  '油': 'y', '盐': 'y', '糖': 't'
}

// 快速创建标签相关
const createTagDialogVisible = ref(false)
const creatingTag = ref(false)
const newTagForm = reactive({
  name: '',
  description: '',
  color: ''
})

const formData = reactive<IngredientForm>({
  id: props.ingredient?.id,
  name: props.ingredient?.name || '',
  type: props.ingredient?.type || IngredientType.FOOD,
  procurementStrategy: (
    (props.ingredient?.type || IngredientType.FOOD) === IngredientType.PACKAGING
      ? getDefaultProcurementStrategyForType(IngredientType.PACKAGING)
      : (props.ingredient?.procurementStrategy ||
        getDefaultProcurementStrategyForType(props.ingredient?.type || IngredientType.FOOD))
  ) as IngredientProcurementStrategy,
  brand: props.ingredient?.brand || '',
  productModel: props.ingredient?.productModel || '',
  purchaseChannel: props.ingredient?.purchaseChannel || '',
  diyEnabled: props.ingredient?.diyEnabled ?? false,
  procurementEnabled: props.ingredient?.procurementEnabled ?? false,
  notes: props.ingredient?.notes || '',
  baseUnit: props.ingredient?.baseUnit || BaseUnit.G,
  baseUnitDisplayName: props.ingredient?.baseUnitDisplayName || props.ingredient?.unitDisplayLabel || '',
  weightG: props.ingredient?.weightG ?? undefined,
  maxCapacityG: props.ingredient?.maxCapacityG ?? undefined,
  properties: props.ingredient?.properties || getDefaultProperties(IngredientType.FOOD),
  nutritionProfile: props.ingredient?.nutritionProfile || null,
  tagIds: props.ingredient?.tagIds || []
})

const structureAlertDescription = computed(() => {
  if (formData.type === IngredientType.FOOD) {
    return '食材继续通过 DIY 推荐商品和采购 SKU 管理用户推荐与采购执行；营养数据请在原料列表中通过“营养数据”入口单独编辑。'
  }

  if (formData.type === IngredientType.SUPPLEMENT) {
    return '补剂直接在标准原料上维护产品信息、采购信息与营养数据；营养数据请在原料列表中通过“营养数据”入口单独编辑。'
  }

  return '包材直接在标准原料上维护采购、库存与生产信息，不提供营养数据入口。'
})

// 类型特定属性
const foodProperties = reactive<FoodProperties>(
  (formData.type === IngredientType.FOOD
    ? (formData.properties as FoodProperties)
    : getDefaultFoodProperties())
)

const supplementProperties = reactive<SupplementProperties>(
  (formData.type === IngredientType.SUPPLEMENT
    ? { ...getDefaultSupplementProperties(), ...(formData.properties as SupplementProperties) }
    : getDefaultSupplementProperties())
)
const supplementImageUploading = ref(false)
const persistedSupplementProperties = ref<SupplementProperties>(
  (props.ingredient?.type === IngredientType.SUPPLEMENT
    ? { ...getDefaultSupplementProperties(), ...(props.ingredient.properties as SupplementProperties) }
    : getDefaultSupplementProperties())
)

const packagingProperties = reactive<PackagingProperties>(
  (formData.type === IngredientType.PACKAGING
    ? { ...getDefaultPackagingProperties(), ...(formData.properties as PackagingProperties) }
    : getDefaultPackagingProperties())
)

// 编辑模式判断
const isEdit = computed(() => !!props.ingredient?.id)

// 营养成分单位枚举
const NUTRIENT_UNITS = [
  { label: 'mg (毫克)', value: 'mg' },
  { label: 'g (克)', value: 'g' },
  { label: 'μg (微克)', value: 'μg' },
  { label: 'IU (国际单位)', value: 'IU' },
  { label: '% (百分比)', value: '%' }
]

const NUTRITION_NAME_SUGGESTIONS = Array.from(
  new Set([
    ...INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) => tab.fields.map((field) => field.label)),
    '叶酸',
    '生物素',
    '益生菌',
    '益生元',
    '胶原蛋白',
    '辅酶Q10'
  ])
)

const querySearchNutritionNames = (queryString: string, cb: (results: Array<{ value: string }>) => void) => {
  const normalizedQuery = queryString.trim().toLowerCase()
  const results = NUTRITION_NAME_SUGGESTIONS
    .filter((nutrient) => nutrient.toLowerCase().includes(normalizedQuery))
    .slice(0, 12)
    .map((nutrient) => ({ value: nutrient }))
  cb(results)
}

// 补剂添加时机选项
const SUPPLEMENT_ADD_TIMING_OPTIONS = Object.entries({
  [SupplementAddTiming.BEFORE_MIXING]: '制作中',
  [SupplementAddTiming.BEFORE_MEAL]: '随餐'
}).map(([value, label]) => ({ value, label }))

const recommendedProductCount = computed(() => recommendedProducts.value.length)
const initialHasActiveRecommendedProduct = computed(() => (
  !!props.ingredient &&
  'hasActiveRecommendedProduct' in props.ingredient &&
  !!props.ingredient.hasActiveRecommendedProduct
))
const hasActiveRecommendedProduct = computed(() => (
  recommendedProducts.value.some(product => product.isActive) ||
  initialHasActiveRecommendedProduct.value
))
const initialHasActiveProcurementSku = computed(() => (
  !!props.ingredient &&
  'hasActiveProcurementSku' in props.ingredient &&
  !!props.ingredient.hasActiveProcurementSku
))
const hasActiveProcurementSku = computed(() => (
  procurementSkus.value.some(product => product.isActive) ||
  initialHasActiveProcurementSku.value
))

const typeCapabilities = computed(() => getIngredientTypeCapabilities(formData.type))
const showPackagingStockPolicyFields = computed(() => (
  resolvePackagingStockPolicyVisibility({
    type: formData.type,
    procurementEnabled: !!formData.procurementEnabled,
    procurementStrategy: formData.procurementStrategy
  })
))
const showSupplementPurchaseLinkField = computed(() => (
  resolveSupplementPurchaseLinkVisibility({
    type: formData.type,
    diyEnabled: !!formData.diyEnabled
  })
))
const showSupplementPurchaseFields = computed(() => (
  resolveSupplementPurchaseFieldsVisibility({
    type: formData.type,
    procurementEnabled: !!formData.procurementEnabled
  })
))
const supplementPurchaseLink = computed<PurchaseLinkConfig>({
  get: () => {
    if (!supplementProperties.purchase_link) {
      supplementProperties.purchase_link = {
        url: '',
        platform: 'WEBVIEW'
      }
    }
    return supplementProperties.purchase_link
  },
  set: (value) => {
    supplementProperties.purchase_link = value
  }
})

function extractIngredientDiyImageKey(imageUrl?: string | null): string | null {
  if (!imageUrl) return null

  try {
    const parsedUrl = new URL(imageUrl)
    const normalizedPath = parsedUrl.pathname.replace(/^\/+/, '')
    return normalizedPath.includes('ingredient-diy-images/') ? normalizedPath : null
  } catch {
    const normalizedPath = imageUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '')
    return normalizedPath.includes('ingredient-diy-images/') ? normalizedPath : null
  }
}

function notifySupplementImageRequiresSavedIngredient() {
  ElMessage.warning('请先保存补剂原料，保存成功后可继续上传产品图片')
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片读取失败，请重试'))
    }
    image.src = objectUrl
  })
}

async function cropImageFileToSquare(file: File): Promise<File> {
  const image = await loadImageFromFile(file)
  const side = Math.min(image.width, image.height)
  const offsetX = Math.max(0, (image.width - side) / 2)
  const offsetY = Math.max(0, (image.height - side) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('图片裁切失败，请重试')
  }

  ctx.drawImage(image, offsetX, offsetY, side, side, 0, 0, side, side)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error('图片裁切失败，请重试'))
      }
    }, 'image/jpeg', 0.92)
  })

  return new File([blob], `supplement-diy-square-${Date.now()}.jpg`, {
    type: 'image/jpeg'
  })
}

async function deleteSupplementImageByUrl(imageUrl?: string | null) {
  const key = extractIngredientDiyImageKey(imageUrl)
  if (!key) return
  await ingredientApi.deleteIngredientDiyImage(key)
}

const handleSupplementImageUpload: UploadProps['beforeUpload'] = async (rawFile) => {
  if (!props.ingredient?.id) {
    notifySupplementImageRequiresSavedIngredient()
    return false
  }

  if (!rawFile.type.startsWith('image/')) {
    ElMessage.error('请上传图片文件')
    return false
  }

  if (rawFile.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 10MB')
    return false
  }

  supplementImageUploading.value = true

  try {
    const previousImageUrl = supplementProperties.image_url || null
    const croppedFile = await cropImageFileToSquare(rawFile as File)
    const uploaded = await ingredientApi.uploadIngredientDiyImage(croppedFile)
    supplementProperties.image_url = uploaded.url
    await persistSupplementImageUrl(uploaded.url)

    if (previousImageUrl && previousImageUrl !== uploaded.url) {
      try {
        await deleteSupplementImageByUrl(previousImageUrl)
      } catch (deleteError) {
        console.error('Failed to delete previous supplement DIY image:', deleteError)
        ElMessage.warning('新图片已上传，但旧图片删除失败，请稍后重试')
      }
    }

    ElMessage.success('图片已上传并裁切为 1:1 方图')
  } catch (error: any) {
    const latestImageUrl = supplementProperties.image_url || null
    supplementProperties.image_url = persistedSupplementProperties.value.image_url || null
    if (latestImageUrl && latestImageUrl !== persistedSupplementProperties.value.image_url) {
      try {
        await deleteSupplementImageByUrl(latestImageUrl)
      } catch (cleanupError) {
        console.error('Failed to cleanup uploaded supplement DIY image:', cleanupError)
      }
    }
    console.error('Failed to upload supplement DIY image:', error)
    ElMessage.error(error?.message || '图片上传失败')
  } finally {
    supplementImageUploading.value = false
  }

  return false
}

async function handleRemoveSupplementImage() {
  if (!supplementProperties.image_url) {
    return
  }

  supplementImageUploading.value = true
  try {
    const previousImageUrl = supplementProperties.image_url
    supplementProperties.image_url = null
    await persistSupplementImageUrl(null)
    await deleteSupplementImageByUrl(previousImageUrl)
    ElMessage.success('图片已删除')
  } catch (error: any) {
    supplementProperties.image_url = persistedSupplementProperties.value.image_url || null
    console.error('Failed to remove supplement DIY image:', error)
    ElMessage.error(error?.message || '删除图片失败')
  } finally {
    supplementImageUploading.value = false
  }
}

// 方法
function getDefaultProperties(type: IngredientType): FoodProperties | SupplementProperties | PackagingProperties {
  switch (type) {
    case IngredientType.FOOD:
      return getDefaultFoodProperties()
    case IngredientType.SUPPLEMENT:
      return getDefaultSupplementProperties()
    case IngredientType.PACKAGING:
      return getDefaultPackagingProperties()
  }
}

function getDefaultFoodProperties(): FoodProperties {
  return {
    cfct_class: '',
    edible_yield_rate: 1.0,
    main_nutrients_desc: ''
  }
}

function getDefaultSupplementProperties(): SupplementProperties {
  return {
    category_type: '',
    active_nutrients: {},
    display_unit: '',
    supplier_name: null,
    purchase_link: {
      url: '',
      platform: 'WEBVIEW'
    },
    image_url: null,
    marketing_highlights: {},
    production_loss_rate: undefined
  }
}

function cloneSupplementProperties(properties?: SupplementProperties | null): SupplementProperties {
  return {
    ...getDefaultSupplementProperties(),
    ...(properties || {}),
    purchase_link: properties?.purchase_link
      ? { ...properties.purchase_link }
      : undefined,
    active_nutrients: properties?.active_nutrients
      ? { ...properties.active_nutrients }
      : {},
    marketing_highlights: properties?.marketing_highlights
      ? { ...properties.marketing_highlights }
      : {},
  }
}

function buildPersistedSupplementPropertiesPatch(imageUrl: string | null): SupplementProperties {
  return {
    ...cloneSupplementProperties(persistedSupplementProperties.value),
    image_url: imageUrl
  }
}

async function persistSupplementImageUrl(imageUrl: string | null) {
  if (!props.ingredient?.id) {
    throw new Error('请先保存补剂原料，再上传产品图片')
  }

  const nextProperties = buildPersistedSupplementPropertiesPatch(imageUrl)
  await ingredientApi.update(props.ingredient.id, {
    properties: nextProperties
  })
  persistedSupplementProperties.value = cloneSupplementProperties(nextProperties)
  formData.properties = nextProperties
}

function getDefaultPackagingProperties(): PackagingProperties {
  return {
    is_consumable: true,
    supplier_name: null
  }
}

function getTypeSpecificTitle() {
  switch (formData.type) {
    case IngredientType.FOOD:
      return '食材属性'
    case IngredientType.SUPPLEMENT:
      return '补剂属性'
    case IngredientType.PACKAGING:
      return '包材属性'
  }
}

function getResolvedFoodPurchaseUnit() {
  return formData.baseUnitDisplayName || BaseUnitLabels[formData.baseUnit] || ''
}

function getSingleLayerPurchaseUnit() {
  return formData.purchaseUnit?.trim() || ''
}

function sanitizeTopLevelFieldsForFood() {
  formData.brand = ''
  formData.productModel = ''
  formData.purchaseChannel = ''
  formData.diyEnabled = false
  formData.procurementEnabled = false
  formData.purchaseUnit = getResolvedFoodPurchaseUnit()
  formData.purchaseToBaseRatio = 1
  formData.currentPricePerPurchaseUnit = 0
  formData.effectivePricePerPurchaseUnit = 0
  formData.safetyStock = undefined
  formData.reorderPoint = undefined
  formData.targetStock = undefined
}

function sanitizeTypeSpecificPayload() {
  if (formData.type === IngredientType.FOOD) {
    sanitizeTopLevelFieldsForFood()
    return
  }

  if (formData.type === IngredientType.SUPPLEMENT) {
    formData.safetyStock = undefined
    formData.reorderPoint = undefined
    formData.targetStock = undefined
    return
  }

  formData.diyEnabled = false
  formData.procurementStrategy = IngredientProcurementStrategy.STOCK_REPLENISHMENT
  formData.nutritionProfile = null
}

function handleTypeChange() {
  // 切换类型时，重置特定属性为默认值
  const defaultProps = getDefaultProperties(formData.type)
  formData.properties = defaultProps
  formData.procurementStrategy = getDefaultProcurementStrategyForType(formData.type) as IngredientProcurementStrategy
  if (!typeCapabilities.value.supportsChildSkus) {
    clearIngredientSkuLists()
  }
  if (formData.type === IngredientType.PACKAGING) {
    formData.nutritionProfile = null
    formData.diyEnabled = false
  }
  if (formData.type === IngredientType.FOOD) {
    sanitizeTopLevelFieldsForFood()
  } else if (formData.type === IngredientType.SUPPLEMENT) {
    formData.safetyStock = undefined
    formData.reorderPoint = undefined
    formData.targetStock = undefined
  }

  // 更新响应式对象
  if (formData.type === IngredientType.FOOD) {
    Object.assign(foodProperties, defaultProps)
  } else if (formData.type === IngredientType.SUPPLEMENT) {
    Object.assign(supplementProperties, defaultProps)
  } else if (formData.type === IngredientType.PACKAGING) {
    Object.assign(packagingProperties, defaultProps)
  }
}

function handleBaseUnitChange() {
  // 当切换baseUnit时，处理density字段
  if (formData.type === IngredientType.FOOD) {
    if (formData.baseUnit !== BaseUnit.ML) {
      // 如果不是ML类型，清除density字段以避免验证问题
      delete foodProperties.density_g_per_ml
    }
  }
}

function syncProperties() {
  if (formData.type === IngredientType.FOOD) {
    formData.properties = { ...foodProperties }
  } else if (formData.type === IngredientType.SUPPLEMENT) {
    const normalizedPurchaseLink = supplementProperties.purchase_link?.url?.trim()
      ? {
          ...supplementProperties.purchase_link,
          url: supplementProperties.purchase_link.url.trim()
        }
      : undefined
    supplementProperties.active_nutrients = buildSupplementActiveNutrientsFromNutritionProfile(
      formData.nutritionProfile,
      supplementProperties.active_nutrients
    )
    formData.properties = {
      ...supplementProperties,
      purchase_link: normalizedPurchaseLink,
    }
  } else if (formData.type === IngredientType.PACKAGING) {
    formData.properties = {
      ...packagingProperties,
      supplier_name: packagingProperties.supplier_name?.trim() || null,
      linked_item_id: packagingProperties.linked_item_id?.trim() || undefined
    }
  }
}

// Load tags
const loadTags = async () => {
  try {
    allTags.value = await ingredientTagApi.list()
  } catch (error: any) {
    console.error('Failed to load tags:', error)
  }
}

// Load all ingredients for duplicate-name/pricing-group suggestions
const loadIngredients = async () => {
  try {
    allIngredients.value = await ingredientApi.list()
  } catch (error: any) {
    console.error('Failed to load ingredients:', error)
  }
}

// 拼音转换函数（转首字母）
const convertToPinyin = (text: string): string => {
  let result = ''
  for (const char of text) {
    result += PINYIN_MAP[char] || char
  }
  return result.toLowerCase()
}

// Levenshtein距离算法（计算字符串相似度）
const calculateSimilarity = (str1: string, str2: string): number => {
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0) return len2 === 0 ? 1 : 0
  if (len2 === 0) return 0

  const matrix = Array.from({ length: len1 + 1 }, (_, index) =>
    Array.from({ length: len2 + 1 }, () => 0)
  )
  for (let i = 0; i <= len1; i++) {
    matrix[i]![0] = i
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      )
    }
  }

  const maxLen = Math.max(len1, len2)
  return 1 - matrix[len1]![len2]! / maxLen
}

// 查询原料（支持拼音首字母搜索）
const querySearchIngredients = (queryString: string, cb: any) => {
  if (!queryString || queryString.length < 1) {
    cb([])
    return
  }

  const searchLower = queryString.toLowerCase()
  const results: Array<{ value: string; item: Ingredient }> = []
  const addedNames = new Set<string>() // 用于追踪已添加的名称，去重

  allIngredients.value.forEach(ingredient => {
    // 排除当前编辑的原料
    if (formData.id && ingredient.id === formData.id) return

    // 检查名称是否已经添加过（去重）
    if (addedNames.has(ingredient.name)) return

    // 完全匹配
    if (ingredient.name.toLowerCase().includes(searchLower)) {
      results.push({ value: ingredient.name, item: ingredient })
      addedNames.add(ingredient.name) // 标记名称为已添加
      return
    }

    // 拼音首字母匹配
    const pinyin = convertToPinyin(ingredient.name)
    if (pinyin.includes(searchLower)) {
      results.push({ value: ingredient.name, item: ingredient })
      addedNames.add(ingredient.name) // 标记名称为已添加
    }
  })

  cb(results.slice(0, 10)) // 限制最多显示10条
}

// 处理原料输入，检测相似原料
const handleIngredientInput = (value: string) => {
  if (!value || value.length < 2) {
    similarIngredients.value = []
    return
  }

  const similarities: Array<{ id: string; name: string; similarity: number }> = []

  allIngredients.value.forEach(ingredient => {
    // 排除当前编辑的原料
    if (formData.id && ingredient.id === formData.id) return

    // 排除完全相同的名称
    if (ingredient.name === value) return

    // 计算相似度
    const similarity = calculateSimilarity(value, ingredient.name)

    // 相似度大于60%才提示
    if (similarity > 0.6) {
      similarities.push({
        id: ingredient.id,
        name: ingredient.name,
        similarity
      })
    }
  })

  // 按相似度排序，取前3个
  similarIngredients.value = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
}

// 处理原料选择
const handleIngredientSelect = (item: any) => {
  similarIngredients.value = []
}

// 标签选择相关方法
const toggleTag = (tagId: string) => {
  const index = selectedTagIds.value.indexOf(tagId)
  if (index > -1) {
    selectedTagIds.value.splice(index, 1)
  } else {
    selectedTagIds.value.push(tagId)
  }
}

const selectAllTags = () => {
  selectedTagIds.value = allTags.value.map(tag => tag.id)
  ElMessage.success('已选中所有标签')
}

const clearAllTags = () => {
  selectedTagIds.value = []
  ElMessage.info('已取消所有选中')
}

// 快速创建标签相关方法
const showCreateTagDialog = () => {
  // 重置表单
  newTagForm.name = ''
  newTagForm.description = ''
  newTagForm.color = ''
  createTagDialogVisible.value = true
}

const handleCreateTag = async () => {
  // 验证
  if (!newTagForm.name.trim()) {
    ElMessage.warning('请输入标签名称')
    return
  }

  try {
    creatingTag.value = true

    const createData: CreateTagDto = {
      name: newTagForm.name.trim(),
      description: newTagForm.description.trim() || null,
      color: newTagForm.color || null
    }

    const newTag = await ingredientTagApi.create(createData)

    // 重新加载标签列表
    await loadTags()

    // 自动选中新创建的标签
    selectedTagIds.value.push(newTag.id)

    // 关闭对话框
    createTagDialogVisible.value = false
    ElMessage.success(`标签"${newTag.name}"创建成功并已选中`)
  } catch (error: any) {
    console.error('Failed to create tag:', error)
    ElMessage.error(error?.message || '创建标签失败')
  } finally {
    creatingTag.value = false
  }
}

// Watch for tagIds changes
watch(selectedTagIds, (newIds) => {
  formData.tagIds = newIds
})

// Watch for ingredient changes
watch(() => props.ingredient, (newIngredient, oldIngredient) => {
  // 只在从编辑切换到新增时重置表单
  if (oldIngredient && !newIngredient) {
    // ✅ 修复：当新增原料时，重置表单数据（清除 id 等字段）
    formData.id = undefined
    formData.name = ''
    formData.type = IngredientType.FOOD
    formData.procurementStrategy = IngredientProcurementStrategy.DAILY_PURCHASE
    formData.brand = ''
    formData.productModel = ''
    formData.purchaseChannel = ''
    formData.diyEnabled = false
    formData.procurementEnabled = false
    formData.notes = ''
    formData.baseUnit = BaseUnit.G
    formData.baseUnitDisplayName = ''
    formData.purchaseUnit = ''
    formData.purchaseToBaseRatio = undefined
    formData.currentPricePerPurchaseUnit = undefined
    formData.effectivePricePerPurchaseUnit = undefined
    formData.weightG = undefined
    formData.maxCapacityG = undefined
    formData.safetyStock = undefined
    formData.reorderPoint = undefined
    formData.targetStock = undefined
    formData.properties = getDefaultProperties(IngredientType.FOOD)
    formData.nutritionProfile = null
    formData.tagIds = []

    // 重置类型特定属性
    Object.assign(foodProperties, getDefaultFoodProperties())
    Object.assign(supplementProperties, getDefaultSupplementProperties())
    persistedSupplementProperties.value = cloneSupplementProperties(getDefaultSupplementProperties())
    Object.assign(packagingProperties, getDefaultPackagingProperties())

    // 重置其他状态
    selectedTagIds.value = []
    similarIngredients.value = []
    clearIngredientSkuLists()

    // 清除表单验证状态
    nextTick(() => {
      formRef.value?.clearValidate()
    })
  } else if (newIngredient) {
    // ✅ 重置相似原料提示和单位提示
    similarIngredients.value = []

    Object.assign(formData, newIngredient)
    formData.baseUnitDisplayName = newIngredient.baseUnitDisplayName || newIngredient.unitDisplayLabel || ''
    formData.nutritionProfile = newIngredient.nutritionProfile || null

    // Update type-specific properties
    if (newIngredient.type === IngredientType.FOOD) {
      Object.assign(foodProperties, getDefaultFoodProperties(), newIngredient.properties as FoodProperties)
    } else if (newIngredient.type === IngredientType.SUPPLEMENT) {
      Object.assign(supplementProperties, getDefaultSupplementProperties(), newIngredient.properties as SupplementProperties)
      persistedSupplementProperties.value = cloneSupplementProperties(newIngredient.properties as SupplementProperties)
    } else if (newIngredient.type === IngredientType.PACKAGING) {
      Object.assign(packagingProperties, getDefaultPackagingProperties(), newIngredient.properties as PackagingProperties)
    }

    // Update selected tag IDs
    if (newIngredient.tagIds) {
      selectedTagIds.value = newIngredient.tagIds
    }

    // 清除表单验证状态
    nextTick(() => {
      formRef.value?.clearValidate()
    })

    // 重新加载 SKU 列表（切换原料时）
    loadIngredientSkuLists()
  } else {
    clearIngredientSkuLists()
  }

  // Reload ingredient master data whenever form is opened
  loadIngredients()
})

// ==================== 家庭 DIY 推荐商品管理 ====================
const recommendedProducts = ref<RecommendedProduct[]>([])
const rpDialogVisible = ref(false)
const rpEditingId = ref<string | null>(null)
const rpSaving = ref(false)
const procurementSkus = ref<ProcurementSku[]>([])
const procurementDialogVisible = ref(false)
const procurementEditingId = ref<string | null>(null)
const procurementSaving = ref(false)
const skuBrandSuggestions = ref<string[]>([])
const skuChannelSuggestions = ref<string[]>([])

interface RpNutrientItem {
  name: string
  value: number
  unit: string
}

const rpFormNutrients = ref<RpNutrientItem[]>([])
const rpForm = reactive({
  name: '',
  brand: '',
  productModel: '',
  purchaseChannel: '',
  purchaseLinkUrl: '',
  purchaseLinkPlatform: 'TAOBAO' as string,
  imageUrl: '',
  displayUnit: '',
  isActive: true,
  sortOrder: 0
})

const procurementForm = reactive({
  name: '',
  brand: '',
  productModel: '',
  purchaseChannel: '',
  supplierName: '',
  purchaseUnit: '',
  purchaseToBaseRatio: undefined as number | undefined,
  currentPurchasePrice: undefined as number | undefined,
  referencePurchasePrice: undefined as number | undefined,
  referencePricePerPurchaseUnit: undefined as number | undefined,
  displayUnit: '',
  notes: '',
  isDefault: false,
  isActive: true,
  sortOrder: 0,
  safetyStock: undefined as number | undefined,
  reorderPoint: undefined as number | undefined,
  targetStock: undefined as number | undefined
})

const clearIngredientSkuLists = () => {
  recommendedProducts.value = []
  procurementSkus.value = []
}

const normalizeSuggestionText = (value: string) => value.trim()

const sortSuggestionMatches = (queryString: string, values: string[]) => {
  const normalizedQuery = normalizeSuggestionText(queryString).toLowerCase()
  const normalizedValues = Array.from(
    new Set(
      values
        .map(normalizeSuggestionText)
        .filter(value => value.length > 0)
    )
  )

  if (!normalizedQuery) {
    return normalizedValues
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 10)
  }

  const prefixMatches = normalizedValues.filter(value => value.toLowerCase().startsWith(normalizedQuery))
  const includeMatches = normalizedValues.filter(
    value => !value.toLowerCase().startsWith(normalizedQuery) && value.toLowerCase().includes(normalizedQuery)
  )

  return [...prefixMatches, ...includeMatches]
    .sort((left, right) => {
      const leftStartsWith = left.toLowerCase().startsWith(normalizedQuery)
      const rightStartsWith = right.toLowerCase().startsWith(normalizedQuery)
      if (leftStartsWith !== rightStartsWith) {
        return leftStartsWith ? -1 : 1
      }
      return left.localeCompare(right)
    })
    .slice(0, 10)
}

const querySearchSkuBrands = (queryString: string, cb: (results: Array<{ value: string }>) => void) => {
  cb(sortSuggestionMatches(queryString, skuBrandSuggestions.value).map(value => ({ value })))
}

const querySearchSkuChannels = (queryString: string, cb: (results: Array<{ value: string }>) => void) => {
  cb(sortSuggestionMatches(queryString, skuChannelSuggestions.value).map(value => ({ value })))
}

const loadSkuSuggestions = async () => {
  try {
    const [brands, channels] = await Promise.all([
      ingredientApi.listBrandSuggestions(),
      ingredientApi.listPurchaseChannelSuggestions()
    ])
    skuBrandSuggestions.value = brands
    skuChannelSuggestions.value = channels
  } catch (e) {
    console.error('Failed to load sku suggestions:', e)
  }
}

const loadRecommendedProducts = async () => {
  if (!props.ingredient?.id || !shouldLoadChildSkuData(formData.type, isEdit.value)) {
    recommendedProducts.value = []
    return
  }
  try {
    recommendedProducts.value = await ingredientApi.listRecommendedProducts(props.ingredient.id)
  } catch (e: any) {
    console.error('Failed to load purchase SKUs:', e)
  }
}

const loadProcurementSkus = async () => {
  if (!props.ingredient?.id || !shouldLoadChildSkuData(formData.type, isEdit.value)) {
    procurementSkus.value = []
    return
  }
  try {
    procurementSkus.value = await ingredientApi.listProcurementSkus(props.ingredient.id)
  } catch (e: any) {
    console.error('Failed to load procurement skus:', e)
  }
}

const loadIngredientSkuLists = async () => {
  if (!shouldLoadChildSkuData(formData.type, isEdit.value)) {
    clearIngredientSkuLists()
    return
  }
  await Promise.all([
    loadRecommendedProducts(),
    loadProcurementSkus()
  ])
}

const openRpDialog = (rp?: RecommendedProduct) => {
  if (!typeCapabilities.value.supportsChildSkus) {
    ElMessage.warning('当前类型不再维护家庭 DIY 推荐商品')
    return
  }
  if (rp) {
    rpEditingId.value = rp.id
    rpForm.name = rp.name
    rpForm.brand = rp.brand || ''
    rpForm.productModel = rp.productModel || ''
    rpForm.purchaseChannel = rp.purchaseChannel || ''
    rpForm.purchaseLinkUrl = rp.purchaseLink?.url || ''
    rpForm.purchaseLinkPlatform = rp.purchaseLink?.platform || 'TAOBAO'
    rpForm.imageUrl = rp.imageUrl || ''
    rpForm.displayUnit = rp.displayUnit || ''
    rpForm.isActive = rp.isActive
    rpForm.sortOrder = rp.sortOrder
    const highlights = rp.marketingNutritionHighlights || rp.activeNutrients
    rpFormNutrients.value = highlights
      ? Object.entries(highlights).map(([name, v]) => ({
          name,
          value: (v as any).value || 0,
          unit: (v as any).unit || 'mg'
        }))
      : []
  } else {
    rpEditingId.value = null
    rpForm.name = ''
    rpForm.brand = ''
    rpForm.productModel = ''
    rpForm.purchaseChannel = ''
    rpForm.purchaseLinkUrl = ''
    rpForm.purchaseLinkPlatform = 'TAOBAO'
    rpForm.imageUrl = ''
    rpForm.displayUnit = ''
    rpForm.isActive = true
    rpForm.sortOrder = 0
    rpFormNutrients.value = []
  }
  rpDialogVisible.value = true
}

const openProcurementDialog = (sku?: ProcurementSku) => {
  if (!typeCapabilities.value.supportsChildSkus) {
    ElMessage.warning('当前类型不再维护生产采购 SKU')
    return
  }
  if (sku) {
    procurementEditingId.value = sku.id
    procurementForm.name = sku.name
    procurementForm.brand = sku.brand || ''
    procurementForm.productModel = sku.productModel || ''
    procurementForm.purchaseChannel = sku.purchaseChannel || ''
    procurementForm.supplierName = sku.supplierName || ''
    procurementForm.purchaseUnit = sku.purchaseUnit || ''
    procurementForm.purchaseToBaseRatio = sku.purchaseToBaseRatio ?? undefined
    procurementForm.currentPurchasePrice = sku.currentPurchasePrice ?? undefined
    procurementForm.referencePurchasePrice = sku.referencePurchasePrice ?? sku.referencePricePerPurchaseUnit ?? undefined
    procurementForm.referencePricePerPurchaseUnit = sku.referencePricePerPurchaseUnit ?? undefined
    procurementForm.displayUnit = sku.displayUnit || ''
    procurementForm.notes = sku.notes || ''
    procurementForm.isDefault = sku.isDefault
    procurementForm.isActive = sku.isActive
    procurementForm.sortOrder = sku.sortOrder
    procurementForm.safetyStock = sku.safetyStock ?? undefined
    procurementForm.reorderPoint = sku.reorderPoint ?? undefined
    procurementForm.targetStock = sku.targetStock ?? undefined
  } else {
    procurementEditingId.value = null
    procurementForm.name = ''
    procurementForm.brand = ''
    procurementForm.productModel = ''
    procurementForm.purchaseChannel = ''
    procurementForm.supplierName = ''
    procurementForm.purchaseUnit = ''
    procurementForm.purchaseToBaseRatio = undefined
    procurementForm.currentPurchasePrice = undefined
    procurementForm.referencePurchasePrice = undefined
    procurementForm.referencePricePerPurchaseUnit = undefined
    procurementForm.displayUnit = ''
    procurementForm.notes = ''
    procurementForm.isDefault = false
    procurementForm.isActive = true
    procurementForm.sortOrder = 0
    procurementForm.safetyStock = undefined
    procurementForm.reorderPoint = undefined
    procurementForm.targetStock = undefined
  }
  procurementDialogVisible.value = true
}

const buildNutrientsFromList = (list: RpNutrientItem[]): Record<string, { value: number; unit: string }> | undefined => {
  if (list.length === 0) return undefined
  const result: Record<string, { value: number; unit: string }> = {}
  for (const n of list) {
    if (n.name && n.value > 0) {
      result[n.name] = { value: n.value, unit: n.unit }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const saveRp = async () => {
  if (!rpForm.name) {
    ElMessage.warning('请输入 SKU 名称')
    return
  }
  if (!props.ingredient?.id) return

  const purchaseLink = rpForm.purchaseLinkUrl
    ? { url: rpForm.purchaseLinkUrl, platform: rpForm.purchaseLinkPlatform }
    : undefined

  const data: RecommendedProductForm = {
    name: rpForm.name,
    brand: rpForm.brand || undefined,
    productModel: rpForm.productModel || undefined,
    purchaseChannel: rpForm.purchaseChannel || undefined,
    purchaseLink: purchaseLink as any,
    imageUrl: rpForm.imageUrl || undefined,
    marketingNutritionHighlights: buildNutrientsFromList(rpFormNutrients.value) as any,
    displayUnit: rpForm.displayUnit || undefined,
    isActive: rpForm.isActive,
    sortOrder: rpForm.sortOrder
  }

  rpSaving.value = true
  try {
    if (rpEditingId.value) {
      await ingredientApi.updateRecommendedProduct(props.ingredient.id, rpEditingId.value, data)
      ElMessage.success('家庭 DIY 推荐商品已更新')
    } else {
      await ingredientApi.createRecommendedProduct(props.ingredient.id, data)
      ElMessage.success('家庭 DIY 推荐商品已创建')
    }
    rpDialogVisible.value = false
    await Promise.all([loadRecommendedProducts(), loadSkuSuggestions()])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '操作失败')
  } finally {
    rpSaving.value = false
  }
}

const saveProcurementSku = async () => {
  if (!procurementForm.name.trim()) {
    ElMessage.warning('请输入 SKU 名称')
    return
  }
  if (!props.ingredient?.id) return

  const data: ProcurementSkuForm = {
    name: procurementForm.name.trim(),
    brand: procurementForm.brand || undefined,
    productModel: procurementForm.productModel || undefined,
    purchaseChannel: procurementForm.purchaseChannel || undefined,
    supplierName: procurementForm.supplierName || undefined,
    purchaseUnit: procurementForm.purchaseUnit || undefined,
    purchaseToBaseRatio: procurementForm.purchaseToBaseRatio ?? null,
    currentPurchasePrice: procurementForm.currentPurchasePrice ?? null,
    referencePurchasePrice: procurementForm.referencePurchasePrice ?? null,
    referencePricePerPurchaseUnit: procurementForm.referencePurchasePrice ?? procurementForm.referencePricePerPurchaseUnit ?? null,
    displayUnit: procurementForm.displayUnit || undefined,
    notes: procurementForm.notes || undefined,
    isDefault: procurementForm.isDefault,
    isActive: procurementForm.isActive,
    sortOrder: procurementForm.sortOrder,
    safetyStock: procurementForm.safetyStock ?? null,
    reorderPoint: procurementForm.reorderPoint ?? null,
    targetStock: procurementForm.targetStock ?? null
  }

  procurementSaving.value = true
  try {
    if (procurementEditingId.value) {
      await ingredientApi.updateProcurementSku(props.ingredient.id, procurementEditingId.value, data)
      ElMessage.success('生产采购 SKU 已更新')
    } else {
      await ingredientApi.createProcurementSku(props.ingredient.id, data)
      ElMessage.success('生产采购 SKU 已创建')
    }
    procurementDialogVisible.value = false
    await Promise.all([loadProcurementSkus(), loadSkuSuggestions()])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '操作失败')
  } finally {
    procurementSaving.value = false
  }
}

const toggleRpActive = async (rp: RecommendedProduct) => {
  if (!props.ingredient?.id) return
  try {
    await ingredientApi.updateRecommendedProduct(props.ingredient.id, rp.id, { isActive: !rp.isActive })
    ElMessage.success(rp.isActive ? '已停用' : '已启用')
    await loadRecommendedProducts()
  } catch (e: any) {
    ElMessage.error('操作失败')
  }
}

const toggleProcurementSkuActive = async (sku: ProcurementSku) => {
  if (!props.ingredient?.id) return
  try {
    await ingredientApi.updateProcurementSku(props.ingredient.id, sku.id, { isActive: !sku.isActive })
    ElMessage.success(sku.isActive ? '已停用' : '已启用')
    await loadProcurementSkus()
  } catch (e: any) {
    ElMessage.error('操作失败')
  }
}

const deleteRp = async (id: string) => {
  if (!props.ingredient?.id) return
  try {
    await ingredientApi.deleteRecommendedProduct(props.ingredient.id, id)
    ElMessage.success('家庭 DIY 推荐商品已删除')
    await loadRecommendedProducts()
  } catch (e: any) {
    ElMessage.error('删除失败')
  }
}

const deleteProcurementSku = async (id: string) => {
  if (!props.ingredient?.id) return
  try {
    await ingredientApi.deleteProcurementSku(props.ingredient.id, id)
    ElMessage.success('已删除')
    await loadProcurementSkus()
  } catch (e: any) {
    ElMessage.error('删除失败')
  }
}

// Lifecycle
onMounted(() => {
  loadTags()
  loadIngredients()  // ✅ 确保组件加载时获取原料列表
  loadSkuSuggestions()
  loadIngredientSkuLists()  // FOOD 编辑态才加载 DIY 推荐商品和生产采购 SKU
})

// 表单验证规则
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入原料名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择原料类型', trigger: 'change' }
  ],
  procurementStrategy: [
    { required: true, message: '请选择采购策略', trigger: 'change' }
  ],
  baseUnit: [
    { required: true, message: '请选择基准单位', trigger: 'change' }
  ],
  weightG: [
    {
      type: 'number',
      min: 0.1,
      message: '单个重量必须大于0',
      trigger: 'blur',
      validator: (rule, value, callback) => {
        // ✅ 方案A: 只有包材类型的PCS才强制要求weightG
        if (formData.type === IngredientType.PACKAGING &&
            formData.baseUnit === BaseUnit.PCS &&
            (value === null || value === undefined)) {
          callback(new Error('包材(PCS类型)必须填写单个重量'))
        } else if (value !== null && value !== undefined && value < 0.1) {
          callback(new Error('单个重量必须大于0'))
        } else {
          callback()
        }
      }
    }
  ]
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    // 基础验证
    await formRef.value.validate()

    // 类型特定属性验证
    if (formData.type === IngredientType.FOOD) {
      // 食材验证
      if (!foodProperties.cfct_class) {
        throw new Error('请选择CFCT分类')
      }
      if (!foodProperties.edible_yield_rate || foodProperties.edible_yield_rate < 0.1 || foodProperties.edible_yield_rate > 1.0) {
        throw new Error('可食部比率必须在0.1到1.0之间')
      }
      if (formData.baseUnit === BaseUnit.ML && (!foodProperties.density_g_per_ml || foodProperties.density_g_per_ml <= 0)) {
        throw new Error('ML类型必须输入密度且必须大于0')
      }
    } else if (formData.type === IngredientType.SUPPLEMENT) {
      // 补剂验证
      if (formData.procurementEnabled) {
        if (!getSingleLayerPurchaseUnit()) {
          throw new Error('请填写采购单位')
        }
        if (!formData.purchaseToBaseRatio || formData.purchaseToBaseRatio <= 0) {
          throw new Error('请填写有效的换算倍数')
        }
        if (formData.currentPricePerPurchaseUnit === undefined || formData.currentPricePerPurchaseUnit === null || formData.currentPricePerPurchaseUnit < 0) {
          throw new Error('请填写当前采购价')
        }
      }
    } else if (formData.type === IngredientType.PACKAGING) {
      // 包材验证
      if (packagingProperties.is_consumable === null || packagingProperties.is_consumable === undefined) {
        throw new Error('请选择消耗品类型')
      }
      if (packagingProperties.is_consumable && (!formData.weightG || formData.weightG <= 0)) {
        throw new Error('消耗型包材必须填写单个重量')
      }
      if (!getSingleLayerPurchaseUnit()) {
        throw new Error('请填写采购单位')
      }
      if (!formData.purchaseToBaseRatio || formData.purchaseToBaseRatio <= 0) {
        throw new Error('请填写有效的换算倍数')
      }
      if (formData.currentPricePerPurchaseUnit === undefined || formData.currentPricePerPurchaseUnit === null || formData.currentPricePerPurchaseUnit < 0) {
        throw new Error('请填写当前采购价')
      }
    }

    sanitizeTypeSpecificPayload()

    if (formData.type === IngredientType.FOOD) {
      formData.effectivePricePerPurchaseUnit = formData.currentPricePerPurchaseUnit
    } else {
      formData.purchaseUnit = getSingleLayerPurchaseUnit()
      formData.effectivePricePerPurchaseUnit = formData.currentPricePerPurchaseUnit
    }

    syncProperties()
    submitting.value = true
    const payload = { ...formData }
    emit('submit', payload)
  } catch (error: any) {
    // Validation failed
    const message = error?.message || '表单验证失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin: 24px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #dcdfe6;
}

.section-title-with-tag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.copy-source-alert {
  margin-bottom: 16px;
}

.structure-alert {
  margin-bottom: 20px;
}

.sku-guide-card {
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
}

.sku-guide-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.sku-guide-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.missing-sku-alert {
  margin-bottom: 20px;
}

.stock-policy-alert {
  margin-bottom: 16px;
}

.unit-label {
  margin-left: 8px;
  color: #606266;
  font-size: 14px;
}

.hint-text {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
  display: block;
  margin-top: 4px;
  line-height: 1.5;
}

.cost-display {
  font-size: 16px;
  font-weight: 500;
  color: #409eff;
}

.pricing-group-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.pricing-group-mode {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.pricing-group-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pricing-group-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pricing-group-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pricing-group-option {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.pricing-group-meta {
  color: #909399;
  font-size: 12px;
}

/* 相似原料提示样式 */
.similar-ingredients-warning {
  margin-top: 8px;
}

.similar-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.similar-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(230, 162, 60, 0.3);
}

/* 相似单位提示样式 */
.similar-units-warning {
  margin-top: 8px;
}

.similar-unit-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.similar-unit-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.3);
}

/* 营养成分表格编辑器样式 */
.nutrient-editor {
  width: 100%;
}

.nutrient-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 12px;
}

.nutrient-row-enhanced {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.nutrient-row-enhanced .el-autocomplete {
  flex: 0 0 auto;
}

.concentration-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: #e4e7ed;
  border-radius: 4px;
  min-width: 100px;
}

.concentration-label {
  font-size: 12px;
  color: #606266;
}

.concentration-value {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  font-family: 'Courier New', monospace;
}

/* 标签选择器样式 */
.tag-selector-wrapper {
  width: 100%;
}

.tag-selector-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.selected-count {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.tag-item {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 14px;
}

.empty-tags-state {
  padding: 40px 20px;
  text-align: center;
}

/* 旧样式保留（兼容） */
.tag-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tag-description {
  color: #909399;
  font-size: 12px;
}

.form-item-helper {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

.capability-section {
  margin-top: 16px;
  padding: 16px 16px 4px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafcff;
}

.capability-fields {
  padding-left: 8px;
}

.supplement-image-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.supplement-image-preview-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.supplement-image-preview {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #ebeef5;
  background: #f5f7fa;
}

.supplement-image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.supplement-image-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fff;
}

.supplement-image-empty-copy {
  flex: 1;
  min-width: 240px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

/* 推荐产品样式 */
.recommended-products-section {
  width: 100%;
}

.rp-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.rp-empty {
  padding: 24px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.rp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rp-card {
  padding: 12px 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.rp-card-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.rp-card-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rp-name {
  font-weight: 500;
  font-size: 14px;
  color: #303133;
}

.rp-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sku-dialog-alert {
  margin-bottom: 16px;
}

.rp-card-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}
</style>
