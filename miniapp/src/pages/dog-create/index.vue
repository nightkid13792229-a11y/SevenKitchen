<template>
  <view class="container">
    <view class="form-section">
      <!-- Loading breeds indicator -->
      <view class="loading-notice" v-if="loadingBreeds">
        <text>正在加载品种列表...</text>
      </view>

      <StepProgressHeader
        class="wizard-step-header"
        :active-step="currentCreateStep"
      />

      <view v-if="showBasicSection" class="wizard-step wizard-step--basic">
        <view class="profile-card">
          <!-- 头像已后置到完成页（U1 第 3 步）：
               建档第一步顾客最想快点看到喂食建议，此时问"上传头像"是负担。
               头像本来就只是可选装饰，放到结果页更合适。 -->
          <view class="profile-card__identity">
            <view class="profile-card__identity-fields">
              <view class="profile-card__field">
                <text class="label">狗狗名字 *</text>
                <input
                  class="input"
                  placeholder="请输入狗狗姓名"
                  :value="String(formData.name || '')"
                  @input="e => formData.name = e.detail.value"
                />
              </view>

              <!-- 性别与绝育：放在姓名正下方，顾客顺手就能完成（老板决定）。
                   这两项影响健康提醒，也影响工作犬的热量基线；填写成本极低，
                   因此保持必填。但**刻意不预选** —— 原先默认「弟弟 / 未绝育」
                   会让顾客无意识跳过，母狗被存成公狗。 -->
              <view class="profile-card__field">
                <text class="label">性别 *</text>
                <view class="gender-selector">
                  <view
                    v-for="option in createGenderChoices"
                    :key="option.value"
                    class="gender-option"
                    :class="[
                      option.value === 'MALE' ? 'gender-option--male' : 'gender-option--female',
                      { active: formData.gender === option.value },
                    ]"
                    @tap="selectGender(option.value)"
                  >
                    <text
                      class="gender-symbol"
                      :class="option.value === 'MALE' ? 'gender-symbol--male' : 'gender-symbol--female'"
                    >
                      {{ option.symbol }}
                    </text>
                    <text class="gender-label">{{ option.label }}</text>
                  </view>
                </view>
              </view>

              <view class="profile-card__field">
                <text class="label">绝育状态 *</text>
                <view class="neuter-selector">
                  <view
                    class="neuter-option"
                    :class="{ active: formData.isNeutered === true }"
                    @tap="selectNeutered(true)"
                  >
                    <text class="neuter-label">已绝育</text>
                  </view>
                  <view
                    class="neuter-option"
                    :class="{ active: formData.isNeutered === false }"
                    @tap="selectNeutered(false)"
                  >
                    <text class="neuter-label">未绝育</text>
                  </view>
                </view>
              </view>

            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__grid">
            <view class="profile-card__field profile-card__field--half">
              <text class="label">生日 *</text>
              <picker mode="date" :value="formData.birthday || ''" @change="onBirthdayChange">
                <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
              </picker>
            </view>

            <view class="profile-card__field profile-card__field--half">
              <text class="label">体重 *</text>
              <!-- 单位必须显示出来：国内顾客习惯按「斤」报体重，
                   原先屏幕上不写单位，填 25 斤会被当成 25 公斤，热量直接翻倍。 -->
              <view class="weight-input-row">
                <input
                  class="input weight-input"
                  type="digit"
                  :value="weightInputText"
                  @input="onWeightInput"
                />
                <view class="weight-unit-toggle">
                  <text
                    v-for="option in weightUnitOptions"
                    :key="option.value"
                    class="weight-unit-option"
                    :class="{ active: weightUnit === option.value }"
                    @tap="onWeightUnitChange(option.value)"
                  >{{ option.label }}</text>
                </view>
              </view>
              <text v-if="weightInputText && !hasValidCurrentWeightKg" class="hint hint-warning">
                {{ weightRangeHint }}
              </text>
              <!-- 只显示单位换算回显：输入 43 公斤时显示「= 86 斤」，
                   顾客自己就能发现单位填错。不做任何「偏大/偏小」判断——
                   系统无法区分填错了还是养的本就是串串/茶杯犬，
                   错误提醒比不提醒更伤信任（2026-09-28 老板决定）。 -->
              <text v-else-if="weightEcho" class="hint hint-echo">{{ weightEcho }}</text>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__section-heading">
            <text class="profile-card__section-title">品种与体型 *</text>
          </view>

          <view v-if="selectedBreed || isMixedBreed" class="selected-breed-display">
            <text class="selected-text">
              {{ isMixedBreed
                ? (formData.customBreedName || '混血/其他')
                : selectedBreed?.name
              }}
            </text>
            <text class="change-btn" @tap="clearBreed">更换品种</text>
          </view>

          <view v-else class="breed-selector">
            <view v-if="breedSearchUiState.showSearchInput" class="search-box">
              <text class="search-box__icon">🔍</text>
              <input
                class="search-input search-input--with-icon"
                placeholder="搜索品种名称"
                v-model="searchKeyword"
                @input="onSearchInput"
              />
            </view>

            <view v-if="showCustomBreedInput" class="inline-manual-entry">
              <text class="inline-manual-entry__title">{{ createManualBreedLabels.nameTitle }}</text>
              <input
                class="input"
                v-model="customBreedName"
                placeholder="如：泰迪串串、田园犬"
              />
              <text class="inline-manual-entry__title">{{ createManualBreedLabels.sizeTitle }}</text>
              <view class="custom-breed-size-grid custom-breed-size-grid--inline">
                <view
                  v-for="option in customBreedSizeOptions"
                  :key="option.value"
                  class="custom-breed-size-option"
                  :class="{ active: customBreedSizeClass === option.value }"
                  @tap="selectCustomBreedSize(option.value)"
                >
                  <text class="custom-breed-size-option-label">{{ option.label }}</text>
                </view>
              </view>
              <text class="hint">{{ createManualBreedLabels.sizeHint }}</text>
              <view class="inline-manual-entry__actions">
                <button
                  class="custom-breed-btn-cancel custom-breed-btn-cancel--inline"
                  @tap="cancelCustomBreed"
                >
                  返回搜索品种
                </button>
                <button
                  class="custom-breed-btn-confirm custom-breed-btn-confirm--inline"
                  :class="{ disabled: !customBreedSizeClass }"
                  :disabled="!customBreedSizeClass"
                  @tap="confirmCustomBreed"
                >
                  确定
                </button>
              </view>
            </view>

            <view v-else-if="hasSearchKeyword" class="search-results">
              <view class="search-results-header">
                <text class="section-title">搜索结果 ({{ filteredBreeds.length }}个品种)</text>
                <text v-if="breedSearchUiState.showSelectionHint" class="search-results-hint">点击卡片即可选中品种</text>
              </view>
              <view class="breed-list breed-search-list">
                <view
                  v-for="breed in filteredBreeds"
                  :key="breed.id"
                  class="breed-search-item"
                  @tap="selectBreed(breed)"
                >
                  <view class="breed-search-main">
                    <text class="breed-search-name">{{ breed.name }}</text>
                    <view class="breed-search-meta">
                      <text class="breed-search-chip">{{ getSizeClassLabel(breed.sizeCategory) }}</text>
                      <text v-if="isHotBreed(breed.id)" class="breed-search-chip common">热门品种</text>
                    </view>
                  </view>
                  <view class="breed-search-action">
                    <text class="breed-search-action-text">选择</text>
                    <text class="breed-search-action-icon">›</text>
                  </view>
                </view>
              </view>
              <!-- 搜不到品种时：先把「没有明确品种」的常见叫法做成一点即选。
                   生产数据里手填的品种名有 70% 是「田园犬 / 串串 / 混血」这一类 ——
                   顾客本来就不是在找一个纯种，而是搜不到只好手打。 -->
              <view v-if="filteredBreeds.length === 0" class="search-empty-state">
                <text class="search-empty-hint">{{ breedSearchUiState.emptyStateHint }}</text>
                <view class="mixed-breed-quick">
                  <text class="mixed-breed-quick__title">如果它没有明确品种，直接选：</text>
                  <view class="mixed-breed-quick__list">
                    <view
                      v-for="item in mixedBreedQuickOptions"
                      :key="`empty-${item}`"
                      class="breed-tag breed-tag--mixed"
                      @tap="startQuickMixedBreed(item)"
                    >{{ item }}</view>
                  </view>
                </view>
                <text
                  v-if="breedSearchUiState.showManualEntryAction"
                  class="search-fallback-link"
                  @tap="selectMixedBreed"
                >
                  其它名字，手动填写
                </text>
              </view>
            </view>

            <view v-else>
              <view class="section">
                <view class="section-header" @tap="toggleHotBreeds">
                  <text class="section-title">热门品种</text>
                  <text class="toggle-icon">{{ showHotBreeds ? '▲' : '▼' }}</text>
                </view>
                <view v-if="showHotBreeds" class="common-breeds">
                  <view
                    v-for="breed in hotBreeds"
                    :key="breed.id"
                    class="breed-tag"
                    @tap="selectBreed(breed)"
                  >
                    {{ breed.name }}
                  </view>
                </view>
                <view v-else class="common-breeds collapsed">
                  <view
                    v-for="breed in hotBreeds.slice(0, 5)"
                    :key="breed.id"
                    class="breed-tag"
                    @tap="selectBreed(breed)"
                  >
                    {{ breed.name }}
                  </view>
                </view>
              </view>

              <!-- 没有明确品种的常见叫法，一点即选，省去打字与"搜不到"的挫败 -->
              <view class="section">
                <view class="section-header">
                  <text class="section-title">没有明确品种？</text>
                </view>
                <view class="common-breeds">
                  <view
                    v-for="item in mixedBreedQuickOptions"
                    :key="`quick-${item}`"
                    class="breed-tag breed-tag--mixed"
                    @tap="startQuickMixedBreed(item)"
                  >
                    {{ item }}
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="selectedBreed || isMixedBreed" class="profile-card__field profile-card__field--size">
            <text class="label">{{ showStandardBreedSizeSummary ? '体型（自动匹配）' : '体型分类' }}</text>
            <view v-if="showStandardBreedSizeSummary" class="auto-size-summary">
              <text class="auto-size-summary__text">{{ getSizeClassDisplay() }}</text>
              <text class="auto-size-summary__link" @tap="enableBreedSizeOverride">手动调整</text>
            </view>
            <view v-else-if="showMixedBreedSizeSummary" class="mixed-size-summary">
              <text class="mixed-size-summary__text">{{ getSizeClassDisplay() }}</text>
              <text class="mixed-size-summary__link" @tap="clearMixedBreedSizeSelection">重新选择</text>
            </view>
            <picker
              v-else
              mode="selector"
              :range="sizeClassOptionsForPicker"
              :value="sizeClassIndex"
              @change="onSizeClassChange"
            >
              <view
                class="size-info"
                :class="{
                  'size-required': isMixedBreed && !formData.sizeClassOverride,
                  'size-info--auto': !isMixedBreed && !formData.sizeClassOverride,
                }"
              >
                <text class="size-text">{{ getSizeClassDisplay() }}</text>
                <text
                  class="manual-select-btn"
                  :class="{ 'manual-select-btn--muted': !isMixedBreed && !formData.sizeClassOverride }"
                >
                  {{ !isMixedBreed && !formData.sizeClassOverride ? '可调整' : '手动选择' }}
                </text>
              </view>
            </picker>
            <text
              v-if="isMixedBreed"
              class="hint"
              :class="{ 'hint-warning': !formData.sizeClassOverride }"
            >
              {{ getSizeClassHint() }}
            </text>
            <!-- 「恢复自动匹配」原先是一行纯文字（无底色/无边框），看不出能点。
                 改成与旁边「手动选择」同级的 chip，并**写明会恢复到哪个体型**，
                 避免顾客点之前不知道结果。 -->
            <view
              v-if="!isMixedBreed && formData.sizeClassOverride"
              class="restore-auto-btn"
              @tap="restoreBreedSizeAutoMatch"
            >
              <text class="restore-auto-btn__text">恢复为：{{ autoMatchedSizeLabel }}</text>
              <text class="restore-auto-btn__hint">按品种自动匹配</text>
            </view>
          </view>
        </view>

      </view>

      <!-- 身体状态区 -->
      <view v-if="showFeedingSection" class="wizard-step wizard-step--feeding">
        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">BCS 体态评分</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('bcs')">热量影响</text>
          </view>

          <!-- 未选择时如实说明：不阻断流程，但这是定制食谱的必需项。
               原先这里默认选中 5 分，顾客不选也会被当成"标准体态"存进档案。 -->
          <view v-if="!formData.bcsScoreConfirmed" class="feeding-unselected-hint">
            <text class="feeding-unselected-hint__text">还没选择 · 定制食谱需要这一项</text>
          </view>

          <!-- 体况引导（2026-09-29，阶段 C）
               原来给 9 张图让顾客直接选一个分数 —— 顾客看不懂、没有参照，
               生产库 76.2% 的狗就停在默认的 5 分。
               改成问 4 个能看懂的动作，系统自己换算成分数。
               长毛犬（泰迪、比熊、萨摩…）看 不出腰线与腹部，只留「摸」的两题。 -->
          <view v-if="isLongHaired" class="bcs-longhair-hint">
            <text class="bcs-longhair-hint__text">长毛狗狗看不出来，所以只问两个「用手摸」的问题。</text>
          </view>

          <!-- 特殊犬种提示（阶段 C9）：不改变算分，只提醒别按常规标准误判 -->
          <view v-if="specialBreedHint" class="bcs-longhair-hint">
            <text class="bcs-longhair-hint__text">{{ specialBreedHint }}</text>
          </view>

          <view
            v-for="question in bcsQuestions"
            :key="question.key"
            class="bcs-question"
          >
            <text class="bcs-question__title">{{ question.title }}</text>
            <text class="bcs-question__hint">{{ question.hint }}</text>
            <view class="bcs-question__options">
              <view
                v-for="option in question.options"
                :key="option.label"
                class="bcs-question__option"
                :class="{ active: bcsAnswers[question.key] === option.bcs }"
                @tap="selectBcsAnswer(question.key, option.bcs)"
              >{{ option.label }}</view>
            </view>
          </view>

          <!-- 算出来的结果：给顾客一个明确的反馈 -->
          <view v-if="bcsResult.bcs !== null" class="bcs-result">
            <text class="bcs-result__score">体况：{{ bcsResult.bcs }} 分 · {{ bcsResultLabel }}</text>
            <text class="bcs-result__note">这是根据你刚才的动作答案算出来的，之后可以随时改。</text>
          </view>
          <view v-else-if="bcsResult.missing.length > 0" class="bcs-result bcs-result--pending">
            <text class="bcs-result__note">还有 {{ bcsResult.missing.length }} 个「用手摸」的问题要答（这两项决定结果，不能跳过）。</text>
          </view>

          <!-- 操作指引图（阶段 C3）：原「演示视频位」改为图文指引。
               官方教学视频是英文且托管在 YouTube —— 国内打不开、小程序也嵌不了
               外部视频；AI 生成的「手放在狗身上」手指偏长偏平、手臂与狗背糊在一起，
               所以改为在狗身上标出「摸哪里」，位置由坐标网格校准，精确且无畸形风险。 -->
          <view v-if="showBcsHowToImage" class="bcs-howto">
            <image
              class="bcs-howto__image"
              :src="bcsHowToImageUrl"
              mode="widthFix"
              @error="onBcsHowToImageError"
            />
          </view>

          <view v-if="feedingImpactExpanded.bcs" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.bcs.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.bcs.summary }}</text>
            <view
              v-for="item in feedingImpactContent.bcs.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>

          <view class="feeding-guide-card">
            <view class="feeding-guide-card__header">
              <text class="feeding-guide-card__title">BCS 评分参考图</text>
            </view>
            <image
              v-if="!showBcsFallback"
              class="feeding-guide-card__image"
              :src="bcsGuideImageUrl"
              mode="widthFix"
              @load="onBcsImageLoad"
              @error="onBcsImageError"
            />
            <view v-else class="bcs-fallback-content">
              <view class="bcs-fallback-title">BCS体态评分标准（9分制）</view>
              <view class="bcs-table">
                <view class="bcs-row bcs-row-thin">
                  <view class="bcs-score-group">
                    <text class="bcs-score">1-3分</text>
                    <text class="bcs-label">偏瘦</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：肉眼可见，极易触摸</text>
                    <text class="bcs-desc-item">• 腰部：明显凹陷</text>
                    <text class="bcs-desc-item">• 腹部：严重内收</text>
                  </view>
                </view>
                <view class="bcs-row bcs-row-ideal">
                  <view class="bcs-score-group">
                    <text class="bcs-score">4-5分</text>
                    <text class="bcs-label">标准</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：可触摸但不明显</text>
                    <text class="bcs-desc-item">• 腰部：从上方可见</text>
                    <text class="bcs-desc-item">• 腹部：略微抬起</text>
                  </view>
                </view>
                <view class="bcs-row bcs-row-overweight">
                  <view class="bcs-score-group">
                    <text class="bcs-score">6-9分</text>
                    <text class="bcs-label">偏胖/肥胖</text>
                  </view>
                  <view class="bcs-desc">
                    <text class="bcs-desc-item">• 肋骨：难以触摸</text>
                    <text class="bcs-desc-item">• 腰部：不可见</text>
                    <text class="bcs-desc-item">• 腹部：明显隆起</text>
                  </view>
                </view>
              </view>
              <view class="bcs-tip">
                <text class="bcs-tip-text">建议尽量维持 4-5 分的理想状态，有助于健康和后续喂食稳定。</text>
              </view>
            </view>
            <!-- 侧视四档对照（阶段 C3）：标签直接用问卷第 4 题的选项原文，
                 与上面的 9 分制总表互补 —— 总表给尺度，这张给「怎么对到自己家狗」。 -->
            <image
              v-if="showBcsSideImage"
              class="feeding-guide-card__image feeding-guide-card__image--sub"
              :src="bcsSideImageUrl"
              mode="widthFix"
              @error="onBcsSideImageError"
            />
          </view>
        </view>

        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">活动水平</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('activity')">热量影响</text>
          </view>

          <view v-if="!formData.activityLevelConfirmed" class="feeding-unselected-hint">
            <text class="feeding-unselected-hint__text">还没选择 · 定制食谱需要这一项</text>
          </view>

          <view class="activity-level-container">
            <view
              v-for="option in createActivityChoices"
              :key="option.value"
              class="activity-level-card"
              :class="{ 'activity-level-card--active': formData.activityLevel === option.value }"
              @tap="selectActivityLevel(option.value)"
            >
              <text class="activity-level-card__label">{{ option.label }}</text>
              <text class="activity-level-card__description">{{ option.description }}</text>
            </view>
          </view>

          <!-- 活动量参考图：AI 生成，放 CDN（避免主包超限）。
               加载失败时降级为文字说明 —— 上方每档已有描述与强度条。 -->
          <view class="feeding-guide-card">
            <view class="feeding-guide-card__header">
              <text class="feeding-guide-card__title">活动量参考图</text>
            </view>
            <image
              v-if="!showActivityFallback"
              class="feeding-guide-card__image"
              :src="activityGuideImageUrl"
              mode="widthFix"
              @load="onActivityImageLoad"
              @error="onActivityImageError"
            />
            <view v-else class="bcs-fallback-content">
              <view class="bcs-fallback-title">按运动时长对照（每日合计）</view>
              <view class="bcs-table">
                <view class="bcs-row">
                  <view class="bcs-score-group"><text class="bcs-score">1 静养</text></view>
                  <view class="bcs-desc"><text class="bcs-desc-item">• 几乎不运动，主要时间在休息，或遵医嘱控量</text></view>
                </view>
                <view class="bcs-row">
                  <view class="bcs-score-group"><text class="bcs-score">2 城市日常</text></view>
                  <view class="bcs-desc"><text class="bcs-desc-item">• 每天遛 1-2 次，合计约 30-45 分钟</text></view>
                </view>
                <view class="bcs-row">
                  <view class="bcs-score-group"><text class="bcs-score">3 规律运动</text></view>
                  <view class="bcs-desc"><text class="bcs-desc-item">• 每天有稳定的主动运动，合计约 1 小时</text></view>
                </view>
                <view class="bcs-row">
                  <view class="bcs-score-group"><text class="bcs-score">4 高活动</text></view>
                  <view class="bcs-desc"><text class="bcs-desc-item">• 每天 2-4 小时，经常跑步、游泳</text></view>
                </view>
                <view class="bcs-row">
                  <view class="bcs-score-group"><text class="bcs-score">5 工作犬</text></view>
                  <view class="bcs-desc"><text class="bcs-desc-item">• 有实际工作任务或高强度训练</text></view>
                </view>
              </view>
            </view>
          </view>

          <view v-if="feedingImpactExpanded.activity" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.activity.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.activity.summary }}</text>
            <view
              v-for="item in feedingImpactContent.activity.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>
        </view>

        <view class="profile-card">
          <view class="profile-card__field">
            <text class="label">每日餐数</text>
            <picker
              mode="selector"
              :range="createMealChoices.map(option => option.label)"
              :value="createMealsIndex"
              @change="onCreateMealsChange"
            >
              <view class="picker">{{ `${formData.mealsPerDay || '2'} 餐/天` }}</view>
            </picker>
            <text class="hint">用于计算每餐的饭量。</text>
          </view>
        </view>

        <view class="profile-card">
          <view class="feeding-card__header">
            <view>
              <text class="profile-card__section-title">零食评估</text>
              <text class="profile-card__section-desc">食谱设计过程中默认会剔除零食的热量。</text>
            </view>
            <text class="feeding-impact-link" @tap="toggleFeedingImpact('treat')">热量影响</text>
          </view>

          <view class="treat-level-grid">
            <view
              v-for="level in createTreatChoices"
              :key="level.level"
              class="treat-level-card"
              :class="{ 'treat-level-card--active': isTreatLevelActive(level.level) }"
              @tap="selectTreatLevel(level.level)"
            >
              <text class="treat-level-card__label">{{ level.label }}</text>
              <text class="treat-level-card__description">{{ level.description }}</text>
            </view>
          </view>

          <view v-if="feedingImpactExpanded.treat" class="feeding-impact-panel">
            <text class="feeding-impact-panel__title">{{ feedingImpactContent.treat.title }}</text>
            <text class="feeding-impact-panel__summary">{{ feedingImpactContent.treat.summary }}</text>
            <view
              v-for="item in feedingImpactContent.treat.items"
              :key="item.label"
              class="feeding-impact-panel__item"
            >
              <text class="feeding-impact-panel__item-label">{{ item.label }}</text>
              <text class="feeding-impact-panel__item-detail">{{ item.detail }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="showRecommendationSection" class="wizard-recommendation-section">
        <!-- 头像：移到完成页，纯可选（U1 第 3 步） -->
        <view class="avatar-prompt-card">
          <view class="avatar-prompt-card__text">
            <text class="avatar-prompt-card__title">给它挑个头像吧</text>
            <text class="avatar-prompt-card__desc">可选。加上头像，之后在爱犬列表里更好认。</text>
          </view>
          <view class="avatar-prompt-card__picker" @tap="handleCreateAvatarTap">
            <image
              v-if="hasCreateAvatarPreview"
              class="avatar-prompt-card__image"
              :src="createAvatarSrc"
              mode="aspectFill"
              @error="onCreateAvatarPreviewError"
            />
            <view v-else class="avatar-prompt-card__placeholder">
              <text class="avatar-prompt-card__placeholder-text">{{ createAvatarPlaceholder }}</text>
            </view>
            <text class="avatar-prompt-card__badge">
              {{ hasCreateAvatarPreview ? '更换' : '上传' }}
            </text>
          </view>
        </view>

        <view v-if="calcStaleNotice" class="calc-stale-notice">
          <text class="calc-stale-text">信息已更新，我们会自动刷新最新喂食建议</text>
        </view>
        <RecommendationSummaryCard
          v-if="createRecommendationSummary"
          class="wizard-recommendation-shell"
          :title="createRecommendationSummary.heading"
          subtitle=""
          :summary-meta="createRecommendationSummary.meta"
          :metrics="createRecommendationMetrics"
          compact
        />
        <view v-if="createRecommendationSummary" class="wizard-recommendation-note">
          <text class="wizard-recommendation-note-title">{{ createRecommendationSummary.note.title }}</text>
          <text class="wizard-recommendation-note-body">{{ createRecommendationSummary.note.body }}</text>
        </view>
        <view v-else class="wizard-recommendation-empty">
          <text class="wizard-recommendation-empty-title">先生成喂食建议</text>
          <text class="wizard-recommendation-empty-desc">回到上一步补齐喂食条件后，我们会自动更新建议结果。</text>
        </view>
      </view>

    </view>

    <StickyActionBar
      :primary-text="createActionConfig.primaryText"
      :secondary-text="createActionConfig.secondaryText"
      :tertiary-text="createActionConfig.tertiaryText"
      :primary-disabled="createActionConfig.primaryDisabled"
      :secondary-disabled="createActionConfig.secondaryDisabled"
      :tertiary-disabled="createActionConfig.tertiaryDisabled"
      @primary="handleCreatePrimaryAction"
      @secondary="handleCreateSecondaryAction"
      @tertiary="handleCreateTertiaryAction"
    />

    <DogAvatarCropper
      :visible="showAvatarCropper"
      :source-path="avatarCropSourcePath"
      title="裁切狗狗头像"
      confirm-text="使用头像"
      @close="closeCreateAvatarCropper"
      @confirm="handleCreateAvatarCropConfirm"
      @error="showCreateAvatarCropError"
    />

    <view v-if="showLifeStageOverride" class="life-stage-sheet" @tap="closeLifeStageOverride">
      <view class="life-stage-sheet-mask"></view>
      <view class="life-stage-sheet-content" @tap.stop>
        <text class="life-stage-sheet-title">请选择生命阶段</text>
        <text class="life-stage-sheet-subtitle">如果你想覆盖系统判断，可以在这里手动指定</text>
        <view class="override-options">
          <view
            v-for="option in lifeStageOverrideOptions"
            :key="option.value"
            class="override-option"
            :class="{ active: formData.lifeStageOverride === option.value }"
            @tap="selectLifeStageOverride(option.value)"
          >
            <text class="override-option-label">{{ option.label }}</text>
            <text class="override-option-desc">{{ option.description }}</text>
          </view>
        </view>
        <button class="life-stage-sheet-cancel" @tap="closeLifeStageOverride">取消</button>
      </view>
    </view>

    <!-- 繁殖期信息（2026-09-29，阶段 A）：
         选了「妊娠期」或「哺乳期」才出现。
         这两个日期是孕期/哺乳期能量分段的唯一依据 —— 没有它们，
         系统只能对孕期全程给一个定值（旧算法就是全程 3.0，比 FEDIAF 高约 59%）。 -->
    <view v-if="needsReproductionInfo" class="profile-card repro-card">
      <view class="feeding-card__header">
        <view>
          <text class="profile-card__section-title">{{ reproductionCardTitle }}</text>
          <text class="profile-card__section-desc">{{ reproductionCardDesc }}</text>
        </view>
      </view>

      <!-- 妊娠期：配种日 / 预产期 -->
      <template v-if="formData.lifeStageOverride === 'PREGNANCY'">
        <view class="repro-field">
          <text class="repro-field__label">预产期</text>
          <picker mode="date" :value="formData.expectedDueDate" @change="onExpectedDueDateChange">
            <view class="repro-field__value">
              {{ formData.expectedDueDate || '请选择（兽医告知的日期更准）' }}
            </view>
          </picker>
        </view>
        <view class="repro-field">
          <text class="repro-field__label">配种日</text>
          <picker mode="date" :value="formData.matingDate" @change="onMatingDateChange">
            <view class="repro-field__value">
              {{ formData.matingDate || '请选择（不知道预产期时填这个）' }}
            </view>
          </picker>
        </view>
        <text class="repro-hint">两个填一个就行。犬的孕期约 63 天，系统会据此算出当前孕周。</text>
      </template>

      <!-- 哺乳期：分娩日 + 窝仔数 -->
      <template v-else>
        <view class="repro-field">
          <text class="repro-field__label">分娩日</text>
          <picker mode="date" :value="formData.deliveryDate" @change="onDeliveryDateChange">
            <view class="repro-field__value">
              {{ formData.deliveryDate || '请选择' }}
            </view>
          </picker>
        </view>
        <view class="repro-field">
          <text class="repro-field__label">这一窝几只</text>
          <input
            class="repro-field__input"
            type="number"
            :value="formData.litterSize"
            placeholder="例如 4"
            @input="onLitterSizeInput"
          />
        </view>
        <text class="repro-hint">哺乳期的能量需求随「产后第几周」和「几只小狗」变化很大，所以要这两个数。</text>
      </template>

      <!-- 繁殖期信息过期提示（阶段 A5）：与后端有效期一致，站内提示代替微信推送 -->
      <view v-if="reproductionExpiredHint" class="repro-expired">
        <text class="repro-expired__text">{{ reproductionExpiredHint }}</text>
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, reactive } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StepProgressHeader from '../../components/dog-profile/StepProgressHeader.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import DogAvatarCropper from '../../components/dog-profile/DogAvatarCropper.vue'
import { type DogProfileCreateStep } from '../../constants/dog-profile'
import { dogApi } from '../../api/dogs'
import { addDogToCache } from '../../utils/dog-cache'
import { trackFunnelEvent } from '../../utils/funnel'
import { DOG_CREATE_SOURCES, type DogCreateSource } from '../../utils/dog-profile-entry'
import {
  clearDogProfileDraft,
  loadDogProfileDraft,
  saveDogProfileDraft,
} from '../../utils/dog-profile-draft'
import {
  getCreateActivityChoices,
  getCreateAvatarPlaceholder,
  getCreateBcsOptions,
  getCreateBcsToneClass,
  getCreateFeedingImpact,
  getCreateMealChoices,
  getCreateManualBreedLabels,
  getCreateMixedBreedSizeHint,
  shouldShowCreateMixedBreedSizeSummary,
  getCreateTreatChoices,
  getCreateGenderChoices,
  normalizeCreateActivityLevel,
  normalizeCreateBcsScore,
  normalizeCreateMealsPerDay,
  normalizeCreateTreatLevel,
  resolveCreateDraftStep,
} from '../../utils/dog-profile-create-view'
import {
  buildDogCreatePayload,
  canAdvanceCreateStep,
  getDogCreateLegacyRedirectRoute,
  getCreateStepAvailability,
  getNextCreateStep,
  getRecommendationDirtyFields,
  shouldAutoPreviewRecommendation,
} from '../../utils/dog-profile-form'
import { getCreateWizardActionConfig } from '../../utils/dog-profile-create-actions'
import { buildRecommendationSummary } from '../../utils/dog-recommendation-summary'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import { filterBreedsByKeyword, normalizeBreedSearchText } from '../../utils/dog-breed-search'
import { getBreedSearchUiState, getManualBreedDraftName } from '../../utils/dog-breed-ui'
import { scrollPageToTop } from '../../utils/page-scroll'
import { buildInitialWeightRecordPayload } from '../../utils/weight-management'
import {
  DEFAULT_ACTIVITY_LEVEL,
  DEFAULT_BCS_SCORE,
} from '../../utils/dog-profile-form'
import {
  getBcsLabel,
  getSpecialBreedHint,
  isLongHairedBreed,
  resolveBcsFromAnswers,
  resolveQuestions,
  resolveSpecialBreedType,
} from '../../utils/bcs-questionnaire'
import {
  formatWeightEcho,
  formatWeightForInput,
  getWeightRangeHint,
  parseWeightInputToKg,
  type WeightUnit,
} from '../../utils/weight-unit'
import {
  buildDogHealthStateSnapshot,
  mergeDogHealthStateSnapshot,
  writeDogHealthStateSnapshotCache,
} from '../../utils/health-records'
import {
  persistDogAvatarLocalPreviewPath,
  resolveDogAvatarSrc,
  resolveDogAvatarUploadErrorMessage,
} from '../../utils/dog-avatar'

const dogCreateApi = {
  breeds: dogApi.breeds,
  hotBreeds: dogApi.hotBreeds,
  preview: dogApi.preview,
  create: dogApi.create,
  createWeightRecord: dogApi.createWeightRecord,
  uploadAvatar: dogApi.uploadAvatar,
}

interface FormData {
  name: string
  breedId: string
  customBreedName?: string
  avatarTempFilePath: string
  birthday: string
  /**
   * 性别与绝育（2026-09-27 老板决定：放回第 1 步姓名下方，且必填）。
   *
   * 空字符串 / null = 顾客还没选。**刻意不预选**：
   * 原先默认「弟弟 / 未绝育」会让顾客无意识跳过 —— 母狗被存成公狗，
   * 而未绝育的默认值又会进入 AI 配方提示词。改动成本很低，不值得用默认值换。
   */
  gender: string
  isNeutered: boolean | null
  currentWeightKg: string
  /**
   * 体况评分。`null` = 顾客还没选过。
   *
   * 2026-09-27（U1）：原先默认 5 分且渲染成"已选中"，顾客不选也会提交 ——
   * 数据库里因此永远有值，分不清是顾客选的还是系统替他选的
   * （生产 4544 只狗里 3466 只等于默认值 5）。现在留空，顾客点过才算数。
   */
  bcsScore: number | null
  /** 活动水平。空字符串 = 顾客还没选过（同上，原先默认 'LOW'） */
  activityLevel: string
  lifeStageOverride: string
  matingDate: string
  expectedDueDate: string
  deliveryDate: string
  litterSize: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  medicalHistory?: string  // 保留用于向后兼容
  medicalRecords: any[]  // 新的病史记录列表
  checkupRecords: any[]  // 体检记录列表
  allergyRecords: any[]  // 过敏记录列表
  allergyFoods: string
  /** 喜欢的食材（决策 7）：与"不吃的食材"成对 */
  preferredFoods: string
  pickyFoods: string
  /**
   * 顾客是否亲自选过这几项（定制门槛按此判定，不看"有没有值"）。
   * 体况评分/活动量/每日餐数都有兜底值，所以必须有独立的确认标记。
   */
  bcsScoreConfirmed: boolean
  activityLevelConfirmed: boolean
  mealsPerDayConfirmed: boolean
}

// Constants
const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const formData = ref<FormData>({
  name: '',
  breedId: '',
  customBreedName: '',
  avatarTempFilePath: '',
  birthday: '',
  // 不预选：顾客必须自己选（填写成本很低，但默认值会造成错误数据）
  gender: '',
  isNeutered: null,
  currentWeightKg: '',
  bcsScore: null,
  // 不再预选：顾客点过才算"确认过"。不选也能继续建档（不阻断），
  // 但未确认的档案不算满足定制门槛，进定制页时会要求补确认。
  activityLevel: '',
  lifeStageOverride: 'NONE',
  // 繁殖期信息（2026-09-29，阶段 A）
  matingDate: '',
  expectedDueDate: '',
  deliveryDate: '',
  litterSize: '',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalRecords: [],
  checkupRecords: [],
  allergyRecords: [],
  allergyFoods: '',
  preferredFoods: '',
  pickyFoods: '',
  // 默认都未确认：只有顾客真的点了才算
  bcsScoreConfirmed: false,
  activityLevelConfirmed: false,
  mealsPerDayConfirmed: false
})

const lifeStageOptions = ['NONE', 'PUPPY', 'ADULT', 'SENIOR', 'PREGNANCY', 'LACTATION']

// 生命阶段手动覆盖选项（排除 NONE）
const lifeStageOverrideOptions = [
  { value: 'PUPPY', label: '幼犬期', description: '成长发育阶段，需要更高能量' },
  { value: 'ADULT', label: '成年期', description: '成年犬，标准能量需求' },
  { value: 'SENIOR', label: '老年期', description: '老年犬，新陈代谢减缓' },
  { value: 'PREGNANCY', label: '妊娠期', description: '怀孕母犬，需要额外营养' },
  { value: 'LACTATION', label: '哺乳期', description: '哺乳母犬，高能量需求' }
]
const sizeClassOptions = ['SMALL', 'MEDIUM', 'LARGE', 'GIANT']
const sizeClassOptionsForPicker = ['小型犬', '中型犬', '大型犬', '巨型犬']
const customBreedSizeOptions = sizeClassOptions.map((value, index) => ({
  value,
  label: sizeClassOptionsForPicker[index],
}))
const createBcsOptions = getCreateBcsOptions()
const createActivityChoices = getCreateActivityChoices()
const createMealChoices = getCreateMealChoices()
const createTreatChoices = getCreateTreatChoices()
const createAvatarPlaceholder = getCreateAvatarPlaceholder()
const createGenderChoices = getCreateGenderChoices()
const createManualBreedLabels = getCreateManualBreedLabels()
const showAvatarCropper = ref(false)
const avatarCropSourcePath = ref('')
const hasCreateAvatarPreview = computed(() => Boolean(String(formData.value.avatarTempFilePath || '').trim()))
const createAvatarSrc = computed(() => resolveDogAvatarSrc('', formData.value.avatarTempFilePath))
const showMixedBreedSizeSummary = computed(() =>
  shouldShowCreateMixedBreedSizeSummary(isMixedBreed.value, Boolean(formData.value.sizeClassOverride)),
)
const createMealsIndex = computed(() => {
  const currentValue = normalizeCreateMealsPerDay(formData.value.mealsPerDay)
  const nextIndex = createMealChoices.findIndex(option => option.value === currentValue)
  return nextIndex >= 0 ? nextIndex : 1
})
const feedingImpactContent = {
  bcs: getCreateFeedingImpact('bcs'),
  activity: getCreateFeedingImpact('activity'),
  treat: getCreateFeedingImpact('treat'),
}

interface Breed {
  id: string
  name: string
  aliases?: string[]
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg?: number
  isCommon?: boolean
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
  calcDetails?: {
    weightKg: number
    ageMonths: number
    sizeClass: string
    lifeStage: string
    stageFactor: number
    bcsMultiplier: number
    isNeutered: boolean
    activityLevel: string
    treatMode: string
    treatLevel?: string
    treatPercentage?: number
  }
}

const breeds = ref<Breed[]>([])
const hotBreeds = ref<Breed[]>([])

const selectedBreed = ref<Breed | null>(null)
const calcResult = ref<CalcResult | null>(null)
const calcStaleNotice = ref(false)
const showCalcProcess = ref(false)
const loadingBreeds = ref(false)
const calculating = ref(false)

// 后端返回的生命阶段信息（用于显示）
const backendLifeStageInfo = ref<{
  stage: string
  label: string
  detail: string
} | null>(null)

const isLegacyRedirecting = ref(false)

// 建档入口来源（由 utils/dog-profile-entry.ts 统一带上）。
// 2026-09-21 之前这里被硬编码成 'dog_list'，导致从订购页/详情页来的用户无法区分。
const entrySource = ref<DogCreateSource>('unknown')
// 是否已成功建档：用于在用户中途离开时判断这是一次放弃
const hasCreatedProfile = ref(false)
const createStartedAt = ref(0)

// 从订购配置页跳转建档：建档成功后回跳订购页继续下单
const returnToOrderRecipeId = ref('')
const currentCreateStep = ref<DogProfileCreateStep>('basic')
const restoringCreateDraft = ref(false)
const suppressDerivedStateInvalidation = ref(false)
let previousCreateFormSnapshot = JSON.parse(JSON.stringify(formData.value))
let createAutoPreviewTimer: ReturnType<typeof setTimeout> | null = null

// New state variables
const searchKeyword = ref('')
const showHotBreeds = ref(true)
const isMixedBreed = ref(false)
const showCustomBreedInput = ref(false)
const showBreedSizeOverridePicker = ref(false)
const customBreedName = ref('')
const customBreedSizeClass = ref<string | null>(null)
const feedingImpactExpanded = reactive<Record<'bcs' | 'activity' | 'treat', boolean>>({
  bcs: false,
  activity: false,
  treat: false,
})

// BCS评分图URL - 使用腾讯云COS CDN加速域名
const bcsGuideImageUrl = ref('https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.jpg')
/**
 * 活动量参考图（2026-09-27 用 AI 生成后上传 CDN）。
 *
 * 与 BCS 参考图同样放 CDN 而不是打进小程序包 —— 图片有 143KB，
 * 放进主包会挤占 2MB 的额度。
 * 加载失败时降级为文字说明（下面各档已有描述与强度条，不会因此看不懂）。
 */
const activityGuideImageUrl = ref('https://img.sevenkitchen.cloud/dog-profile-charts/activity-levels.jpg')
const showActivityFallback = ref(false)
const showBcsFallback = ref(false) // 是否显示降级内容（图片加载失败时）

/**
 * 体况引导的两张图（2026-09-29，阶段 C3）。
 *
 * 均放 CDN 而不是打进主包 —— 主包只有 2MB 额度，两张图合计 246KB。
 * 加载失败时直接不显示，不额外加兜底文案：
 * 上方问卷本身是纯文字的，参考图只是辅助，缺了不影响答题。
 */
const bcsHowToImageUrl = ref('https://img.sevenkitchen.cloud/bcs-standards/bcs-how-to-feel.jpg')
const showBcsHowToImage = ref(true)
const bcsSideImageUrl = ref('https://img.sevenkitchen.cloud/bcs-standards/bcs-side-reference.jpg')
const showBcsSideImage = ref(true)
const showLifeStageOverride = ref(false) // 生命阶段手动选择面板展开状态

const filteredBreeds = computed(() => {
  return filterBreedsByKeyword(breeds.value, searchKeyword.value)
})
const hotBreedIds = computed(() => new Set(hotBreeds.value.map(breed => breed.id)))

const hasSearchKeyword = computed(() => normalizeBreedSearchText(searchKeyword.value).length > 0)

const hasSelectedStandardBreed = computed(() => Boolean(selectedBreed.value) && !isMixedBreed.value)

const breedSearchUiState = computed(() => {
  return getBreedSearchUiState(filteredBreeds.value.length, {
    hasKeyword: hasSearchKeyword.value,
    isManualEntry: showCustomBreedInput.value,
    hasSelectedStandardBreed: hasSelectedStandardBreed.value,
  })
})

const lifeStageIndex = computed(() => {
  const idx = lifeStageOptions.indexOf(formData.value.lifeStageOverride)
  return Math.max(0, idx) // 确保返回非负整数
})

function resolveSizeClassByPickerValue(value: unknown): string | null {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index >= sizeClassOptions.length) {
    return null
  }

  return sizeClassOptions[index]
}

function resolveSizeClassIndex(sizeClass?: string | null): number {
  if (!sizeClass) {
    return 0
  }

  const idx = sizeClassOptions.indexOf(sizeClass)
  return Math.max(0, idx)
}

const sizeClassIndex = computed(() => {
  const effectiveSizeClass =
    formData.value.sizeClassOverride ||
    selectedBreed.value?.sizeCategory ||
    null

  return resolveSizeClassIndex(effectiveSizeClass)
})

const showStandardBreedSizeSummary = computed(() => (
  Boolean(selectedBreed.value) &&
  !isMixedBreed.value &&
  Boolean(selectedBreed.value?.sizeCategory) &&
  !showBreedSizeOverridePicker.value &&
  !formData.value.sizeClassOverride
))

// ========== 生命阶段自动计算逻辑 ==========

/**
 * 计算狗狗的年龄（月）
 */
const calculateAgeMonths = computed(() => {
  if (!formData.value.birthday) return 0
  const birthday = new Date(formData.value.birthday)
  const today = new Date()
  const diffTime = today.getTime() - birthday.getTime()
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  return Math.floor(diffDays / 30.4375) // 平均每月30.4375天
})

/**
 * 获取体型分类的成年标准（月）
 */
const getAdultThresholdMonths = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 10,
    'MEDIUM': 12,
    'LARGE': 18,
    'GIANT': 24
  }
  // 如果有品种且品种有自定义成年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.adultAgeMonths) {
    return selectedBreed.value.adultAgeMonths
  }
  return thresholds[sizeClass] || 12
})

/**
 * 获取体型分类的老年标准（年）
 */
const getSeniorThresholdYears = computed(() => {
  const sizeClass = getCurrentSizeClass.value
  const thresholds: Record<string, number> = {
    'SMALL': 11,
    'MEDIUM': 10,
    'LARGE': 8,
    'GIANT': 7
  }
  // 如果有品种且品种有自定义老年标准，使用品种的
  if (selectedBreed.value && selectedBreed.value.seniorAgeYears) {
    return selectedBreed.value.seniorAgeYears
  }
  return thresholds[sizeClass] || 10
})

/**
 * 获取当前体型分类
 */
const getCurrentSizeClass = computed(() => {
  // 优先使用手动覆盖
  if (formData.value.sizeClassOverride) {
    return formData.value.sizeClassOverride
  }
  // 使用品种的体型分类
  if (selectedBreed.value) {
    return selectedBreed.value.sizeCategory
  }
  return 'MEDIUM' // 默认中型
})

/**
 * 计算自动识别的生命阶段
 * 优先使用后端返回的结果，如果没有则使用前端简化逻辑（仅作为fallback）
 * 注意：必须先选择品种（或混血犬选择体型分类）才能进行生命阶段判断
 */
const autoDetectedLifeStage = computed(() => {
  // 优先使用后端返回的生命阶段信息
  if (backendLifeStageInfo.value) {
    return backendLifeStageInfo.value
  }

  // Fallback：前端简化计算逻辑（用于未触发计算时的即时显示）
  // 但前提是必须已经选择了品种（或混血犬选择了体型分类）
  if (!selectedBreed.value && !formData.value.sizeClassOverride) {
    // 没有品种信息，无法判断生命阶段
    return null
  }

  const ageMonths = calculateAgeMonths.value
  const adultThreshold = getAdultThresholdMonths.value
  const ageYears = ageMonths / 12.0
  const seniorThreshold = getSeniorThresholdYears.value

  // 判断生命阶段
  if (ageMonths < adultThreshold) {
    // 幼犬期 - 根据月龄显示详细信息
    if (ageMonths < 4) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（快速成长期）` }
    } else if (ageMonths < 6) {
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月（成长期）` }
    } else {
      // 6个月及以上，统一显示月龄
      return { stage: 'PUPPY', label: '幼犬期', detail: `${ageMonths}个月` }
    }
  } else if (ageYears >= seniorThreshold) {
    // 老年期
    return { stage: 'SENIOR', label: '老年期', detail: `${Math.floor(ageYears)}岁` }
  } else {
    // 成年期
    // 对于不足1岁的成年犬，显示月龄而不是"0岁"
    if (ageYears < 1) {
      return { stage: 'ADULT', label: '成年期', detail: `${ageMonths}个月` }
    }
    return { stage: 'ADULT', label: '成年期', detail: `${Math.floor(ageYears)}岁` }
  }
})

/**
 * 显示的生命阶段文本（如果有手动覆盖则显示覆盖后的，否则显示自动识别的）
 */
const displayLifeStage = computed(() => {
  const override = formData.value.lifeStageOverride
  if (override && override !== 'NONE') {
    // 显示手动覆盖的选项
    const labels: Record<string, string> = {
      'PUPPY': '幼犬期（手动覆盖）',
      'ADULT': '成年期（手动覆盖）',
      'SENIOR': '老年期（手动覆盖）',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期'
    }
    return labels[override] || override
  }
  // 显示自动识别的
  return autoDetectedLifeStage.value?.label || '请先选择品种'
})

/**
 * 判断是否处于手动覆盖模式
 */
const isLifeStageOverride = computed(() => {
  return formData.value.lifeStageOverride && formData.value.lifeStageOverride !== 'NONE'
})

/**
 * 显示的生命阶段文本（手动或自动）
 */
const displayLifeStageText = computed(() => {
  if (isLifeStageOverride.value) {
    // 手动选择：显示手动选择的阶段
    const override = formData.value.lifeStageOverride
    const labels: Record<string, string> = {
      'PUPPY': '幼犬期',
      'ADULT': '成年期',
      'SENIOR': '老年期',
      'PREGNANCY': '妊娠期',
      'LACTATION': '哺乳期'
    }
    return labels[override] || override
  }
  // 自动匹配：显示自动识别的阶段
  if (!autoDetectedLifeStage.value) {
    return '请先选择品种'
  }
  return autoDetectedLifeStage.value.label
})

/**
 * 显示的生命阶段详情（手动或自动）
 */
const displayLifeStageDetail = computed(() => {
  // 手动选择和自动匹配都显示年龄信息，保持格式一致
  if (!autoDetectedLifeStage.value) {
    return ''
  }
  return autoDetectedLifeStage.value.detail
})

// ========== 生命阶段计算逻辑结束 ==========

const parsedCurrentWeightKg = computed(() => {  if (typeof formData.value.currentWeightKg !== 'string') {
    return null
  }

  const trimmed = formData.value.currentWeightKg.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? parsed : null
})

const hasValidCurrentWeightKg = computed(() => parsedCurrentWeightKg.value !== null)

// ========== 体重单位（公斤 / 斤）==========
// formData.currentWeightKg 内部**始终是公斤**，单位只影响输入框展示，
// 这样下游的校验、提交、体重记录都不需要改，也不会有「斤」漏进数据库。
const weightUnit = ref<WeightUnit>('KG')
const weightUnitOptions: Array<{ value: WeightUnit; label: string }> = [
  { value: 'KG', label: '公斤' },
  { value: 'JIN', label: '斤' },
]
// 输入框里正在编辑的原始文本：单独存一份，避免换算把顾客的按键序列打断
// （例如输入 "12." 时若直接回写格式化结果，小数点会被吃掉，接着输入就变成 125）。
const weightInputText = ref('')
const weightRangeHint = computed(() => getWeightRangeHint(weightUnit.value))

const syncWeightInputFromForm = () => {
  weightInputText.value = formatWeightForInput(
    formData.value.currentWeightKg,
    weightUnit.value,
  )
}

const onWeightInput = (event: any) => {
  const raw = String(event?.detail?.value ?? '')
  weightInputText.value = raw
  formData.value.currentWeightKg = parseWeightInputToKg(raw, weightUnit.value)
}

const weightEcho = computed(() =>
  hasValidCurrentWeightKg.value
    ? formatWeightEcho(parsedCurrentWeightKg.value, weightUnit.value)
    : '',
)

const onWeightUnitChange = (unit: WeightUnit) => {
  if (unit === weightUnit.value) return
  // 先把当前输入按「旧单位」固化成公斤，再按新单位重新展示
  formData.value.currentWeightKg = parseWeightInputToKg(
    weightInputText.value,
    weightUnit.value,
  )
  weightUnit.value = unit
  syncWeightInputFromForm()
}
// ========== 体重单位结束 ==========

// ========== 顾客确认状态（U3/U4）==========
// 体况评分、活动量、每日餐数都有"兜底值"，顾客不选也能提交。
// 但老板定的定制门槛按**是否确认过**判定，所以必须单独记住"顾客到底点没点过"。
// 只认顾客的真实操作：默认值不算确认。
// 放在 formData 里是为了让提交 payload 构造器能直接带上，不必额外穿参。
/** 未确认时的兜底值：保持与改造前一致，避免悄悄改变热量口径 */
const FALLBACK_BCS_SCORE = DEFAULT_BCS_SCORE
const FALLBACK_ACTIVITY_LEVEL = DEFAULT_ACTIVITY_LEVEL

// ========== 体况引导（2026-09-29，阶段 C） ==========
const bcsAnswers = ref<Record<string, number>>({})

/** 是否是长毛犬（决定只问题两道「摸」的题） */
const isLongHaired = computed(() =>
  isLongHairedBreed(
    isMixedBreed.value
      ? formData.value.customBreedName
      : selectedBreed.value?.name,
  ),
)

/** 特殊犬种判断提示（阶段 C9）：深胸细腰型 / 短鼻桶胸型 */
const specialBreedHint = computed(() =>
  getSpecialBreedHint(
    resolveSpecialBreedType(
      isMixedBreed.value
        ? formData.value.customBreedName
        : selectedBreed.value?.name,
    ),
  ),
)

const bcsQuestions = computed(() =>
  resolveQuestions({ isLongHaired: isLongHaired.value }),
)

const bcsResult = computed(() =>
  resolveBcsFromAnswers({
    answers: bcsAnswers.value,
    questions: bcsQuestions.value,
  }),
)

const bcsResultLabel = computed(() =>
  bcsResult.value.bcs === null ? '' : getBcsLabel(bcsResult.value.bcs),
)

/** 顾客点某一题的某个选项 */
function selectBcsAnswer(questionKey: string, bcs: number) {
  bcsAnswers.value = { ...bcsAnswers.value, [questionKey]: bcs }
  const result = resolveBcsFromAnswers({
    answers: bcsAnswers.value,
    questions: bcsQuestions.value,
  })
  if (result.bcs !== null) {
    // 算出来了 → 写进表单并标记「顾客亲自确认过」
    formData.value.bcsScore = result.bcs
    formData.value.bcsScoreConfirmed = true
  }
}

// ========== 体况引导结束 ==========

/** 体况评分/活动量是否已经由顾客亲自选择 */
const isFeedingConfirmed = computed(
  () =>
    formData.value.bcsScoreConfirmed && formData.value.activityLevelConfirmed,
)
// ========== 顾客确认状态结束 ==========

const canSubmit = computed(() => {
  return Boolean(
    formData.value.name &&
    formData.value.breedId &&
    formData.value.birthday &&
    hasValidCurrentWeightKg.value &&
    // 活动量不再列为必填（U3：不强制阻断）。
    // 没选也能建档，只是不算满足定制门槛 —— 门槛改按"确认过"判定，
    // 而不是靠"表单必填"硬卡。原先这里要求 activityLevel 有值，
    // 配合默认值相当于"永远通过"，是没有意义的假校验。
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

const canPreview = computed(() => {
  return Boolean(
    formData.value.breedId &&
    formData.value.birthday &&
    hasValidCurrentWeightKg.value &&
    !calculating.value &&
    (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
  )
})

const createStepAvailability = computed(() => getCreateStepAvailability(formData.value))

/**
 * 健康信息（过敏 / 检查报告 / 体重 / 疫苗）**不在建档流程里**。
 *
 * 2026-09-27 一度把它做成建档第 3 步（含"常用过敏原一点即选"和"上传报告 AI 识别"），
 * 老板否掉了：建档只该收集"算喂食方案必须的参数"，健康记录由顾客到「健康管理」补充。
 * 那两个降低填写成本的做法没有丢，已整体搬到「健康管理」页的过敏区。
 */
const showBasicSection = computed(() => currentCreateStep.value === 'basic')
const showFeedingSection = computed(() => currentCreateStep.value === 'feeding')
const showRecommendationSection = computed(() => currentCreateStep.value === 'recommendation')
const canAdvanceFromBasic = computed(() => canAdvanceCreateStep('basic', createStepAvailability.value))
const canAdvanceFromFeeding = computed(() => canAdvanceCreateStep('feeding', createStepAvailability.value))
const canAdvanceFromRecommendation = computed(() => canAdvanceCreateStep('recommendation', createStepAvailability.value))
const createPreviewReady = computed(() => Boolean(
  canAdvanceFromFeeding.value &&
  canPreview.value &&
  !calculating.value
))
const createActionConfig = computed(() => getCreateWizardActionConfig({
  step: currentCreateStep.value,
  canAdvanceFromBasic: canAdvanceFromBasic.value,
  canAdvanceFromFeeding: canAdvanceFromFeeding.value,
  canAdvanceFromRecommendation: canAdvanceFromRecommendation.value && hasCreateRecommendationResult.value,
  canSubmit: canSubmit.value,
  recommendationReady: hasCreateRecommendationResult.value,
  calculating: calculating.value,
}))
const createRecommendationSummary = computed(() => {
  if (!calcResult.value) {
    return null
  }

  return buildRecommendationSummary({
    dogName: String(formData.value.name || '').trim() || '喂食建议',
    ageText: displayLifeStageDetail.value,
    lifeStageLabel: displayLifeStageText.value,
    weightKg: calcResult.value.calcDetails?.weightKg ?? parsedCurrentWeightKg.value,
    rer: calcResult.value.rer,
    totalDer: calcResult.value.totalDer,
    treatDeduction: calcResult.value.treatDeduction,
    finalFoodKcal: calcResult.value.finalFoodKcal,
    isTreatCapped: calcResult.value.isTreatCapped,
    calcDetails: calcResult.value.calcDetails,
  })
})
const createRecommendationCards = computed(() => {
  if (!createRecommendationSummary.value) {
    return []
  }

  const { cards } = createRecommendationSummary.value
  return cards.length === 3 ? cards : []
})
const createRecommendationMetrics = computed(() => {
  if (createRecommendationCards.value.length !== 3) {
    return []
  }

  return createRecommendationCards.value.map(card => ({
    label: card.label,
    value: card.value,
    hint: card.summary,
    emphasis: card.emphasis,
  }))
})
const hasCreateRecommendationResult = computed(() => (
  Boolean(calcResult.value) &&
  createRecommendationCards.value.length === 3 &&
  !calcStaleNotice.value
))

// onLoad lifecycle hook - receives page parameters
onLoad((options: any) => {
  console.log('[DogCreate] onLoad called with options:', options)

  const legacyDogId = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  const legacyRedirectRoute = getDogCreateLegacyRedirectRoute(legacyDogId)
  if (legacyRedirectRoute) {
    isLegacyRedirecting.value = true
    uni.redirectTo({ url: legacyRedirectRoute })
    return
  }

  // 入口来源：由各引导点通过 utils/dog-profile-entry.ts 统一带上
  const sourceParam = Array.isArray(options?.source) ? options.source[0] : options?.source
  const normalizedSource = String(sourceParam || '')
  entrySource.value = (DOG_CREATE_SOURCES as readonly string[]).includes(normalizedSource)
    ? (normalizedSource as DogCreateSource)
    : 'unknown'

  // 从订购配置页进入：记录回跳信息（建档成功后回到订购页继续下单）
  const redirectParam = Array.isArray(options?.redirect) ? options.redirect[0] : options?.redirect
  if (redirectParam === 'order') {
    const recipeId = Array.isArray(options?.recipeId) ? options.recipeId[0] : options?.recipeId
    returnToOrderRecipeId.value = String(recipeId || '')
    console.log('[DogCreate] Will return to order after create, recipeId:', returnToOrderRecipeId.value)
  }

  console.log('[DogCreate] Create mode, entrySource:', entrySource.value)
})

onMounted(async () => {
  if (isLegacyRedirecting.value) {
    return
  }

  createStartedAt.value = Date.now()
  await Promise.all([loadBreeds(), loadHotBreeds()])
  console.log('[DogCreate] onMounted: create mode')
  const restoredDraft = restoreCreateDraft()

  if (currentCreateStep.value === 'recommendation' && createPreviewReady.value) {
    scheduleCreateAutoPreview()
  }

  void trackDogProfileEvent('dog_profile_create_started', {
    mode: 'create',
    entrySource: entrySource.value,
    stepName: getCreateAnalyticsStepName(currentCreateStep.value),
    hasDraft: restoredDraft,
  })

  // 漏斗：把「建档」接进成品购买漏斗（原先这条漏斗里没有建档这一步，
  // 导致「点买成品 → 订购页」之间掉了多少人完全看不到）
  trackFunnelEvent({
    eventName: 'dog_profile_started',
    step: 'dog_profile',
    entrySource: entrySource.value,
    properties: { hasDraft: restoredDraft },
  })

  trackCreateStepViewed(currentCreateStep.value)
})

onUnload(() => {
  // 漏斗：没能建完就离开了。埋点失败不影响任何业务逻辑。
  if (hasCreatedProfile.value) return
  trackFunnelEvent({
    eventName: 'dog_profile_abandoned',
    step: 'dog_profile',
    entrySource: entrySource.value,
    properties: {
      stepName: getCreateAnalyticsStepName(currentCreateStep.value),
      stayedMs: createStartedAt.value ? Date.now() - createStartedAt.value : 0,
    },
  })
})

onUnmounted(() => {
  clearCreateAutoPreviewTimer()
})

watch(formData, () => {
  if (restoringCreateDraft.value) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return
  }

  const nextFormSnapshot = cloneFormSnapshot()
  const dirtyFields = getRecommendationDirtyFields(previousCreateFormSnapshot, nextFormSnapshot)

  previousCreateFormSnapshot = nextFormSnapshot

  if (dirtyFields.length > 0 && shouldAutoPreviewRecommendation(dirtyFields)) {
    invalidateBreedDerivedState()

    if (createPreviewReady.value) {
      scheduleCreateAutoPreview(dirtyFields)
    } else {
      clearCreateAutoPreviewTimer()
    }
  }

  saveCreateDraft()
}, { deep: true })

watch(() => formData.value.currentWeightKg, (newValue, oldValue) => {
  if (suppressDerivedStateInvalidation.value || oldValue === undefined || newValue === oldValue) {
    return
  }

  invalidateBreedDerivedState()
})

watch(currentCreateStep, (step) => {
  if (restoringCreateDraft.value) {
    return
  }

  saveCreateDraft()
  trackCreateStepViewed(step)

  if (step === 'recommendation' && !calcResult.value) {
    scheduleCreateAutoPreview()
  }
})

function getCreateAnalyticsStepName(step: DogProfileCreateStep) {
  const stepMap: Record<DogProfileCreateStep, string> = {
    basic: 'basic_info',
    feeding: 'feeding_info',
    recommendation: 'recommendation',
  }

  return stepMap[step]
}

function trackCreateStepViewed(step: DogProfileCreateStep) {
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'create',
    stepName: getCreateAnalyticsStepName(step),
  })
}

function trackCreateStepCompleted(step: DogProfileCreateStep) {
  void trackDogProfileEvent('dog_profile_step_completed', {
    mode: 'create',
    stepName: getCreateAnalyticsStepName(step),
  })
}

/**
 * 建档时是否带了任何健康信息（病史/体检/过敏/饮食提醒）。
 *
 * 建档流程已不含健康信息（2026-09-27 老板决定），这里是**如实记录**而不是判断：
 * 结果恒为 false，于是每次建档都会上报一次"建档未带健康信息"。
 * 后台「狗档案转化分析」靠它统计"健康记录有多少来自建档之外"。
 */
function hasAnyHealthInput() {
  const form = formData.value
  const hasRecords = [form.medicalRecords, form.checkupRecords, form.allergyRecords]
    .some(records => Array.isArray(records) && records.length > 0)
  const hasNotes = Boolean(
    String(form.allergyFoods || '').trim() || String(form.pickyFoods || '').trim(),
  )
  return hasRecords || hasNotes
}

async function loadBreeds() {
  loadingBreeds.value = true
  try {
    const res: any = await dogCreateApi.breeds()
    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[DogCreate] Loaded breeds:', breeds.value.length)
      if (breeds.value.length === 0) {
        uni.showToast({
          title: '品种列表为空，请先运行seed脚本',
          icon: 'none',
          duration: 3000
        })
      }
    } else {
      throw new Error(res.message || 'Failed to load breeds')
    }
  } catch (err) {
    console.error('[DogCreate] Load breeds error:', err)
    uni.showToast({
      title: '加载品种列表失败',
      icon: 'none',
      duration: 2000
    })
  } finally {
    loadingBreeds.value = false
  }
}

async function loadHotBreeds() {
  try {
    const res: any = await dogCreateApi.hotBreeds()
    if (res.code === 0 && Array.isArray(res.data)) {
      hotBreeds.value = res.data
      return
    }

    throw new Error(res.message || 'Failed to load hot breeds')
  } catch (err) {
    hotBreeds.value = []
    console.warn('[DogCreate] Load hot breeds error:', err)
  }
}

// 加载已有的狗狗档案
// 将 API 数据填充到表单
function populateFormData(profile: any) {
  console.log('[DogCreate] populateFormData called with profile:', profile)
  suppressDerivedStateInvalidation.value = true

  try {
    calcStaleNotice.value = false
    customBreedSizeClass.value = null

    // 基本信息
    formData.value.name = profile.name || ''
    formData.value.avatarTempFilePath = profile.avatarTempFilePath || ''
    formData.value.birthday = profile.birthday ?
      new Date(profile.birthday).toISOString().split('T')[0] : ''
    formData.value.gender = profile.gender || 'MALE'
    formData.value.isNeutered = profile.isNeutered ?? false
    formData.value.currentWeightKg = profile.currentWeightKg?.toString() || ''
    formData.value.bcsScore = normalizeCreateBcsScore(profile.bcsScore)
    formData.value.activityLevel = normalizeCreateActivityLevel(profile.activityLevel)
    formData.value.lifeStageOverride = profile.lifeStageOverride || 'NONE'
    formData.value.sizeClassOverride = profile.sizeClassOverride || null
    formData.value.mealsPerDay = normalizeCreateMealsPerDay(profile.mealsPerDay)
    formData.value.treatInputMode = 'ESTIMATE_LEVEL'
    formData.value.treatLevel = normalizeCreateTreatLevel(profile.treatLevel)
    formData.value.manualTreatKcal = ''
    formData.value.medicalHistory = profile.medicalHistory || ''
    formData.value.medicalRecords = profile.medicalRecords || []
    console.log('[DogCreate] Loaded medicalRecords:', formData.value.medicalRecords)
    formData.value.checkupRecords = profile.checkupRecords || []
    console.log('[DogCreate] Loaded checkupRecords:', formData.value.checkupRecords)
    formData.value.allergyRecords = profile.allergyRecords || []
    console.log('[DogCreate] Loaded allergyRecords:', formData.value.allergyRecords)
    formData.value.allergyFoods = profile.allergyFoods || ''
    formData.value.pickyFoods = profile.pickyFoods || ''

    // 体重是按公斤回填的，输入框显示文本要按当前单位重建一次
    syncWeightInputFromForm()

    // 品种信息
    formData.value.breedId = profile.breedId || ''
    formData.value.customBreedName = profile.customBreedName || ''

    console.log('[DogCreate] Breed info - breedId:', formData.value.breedId, 'customBreedName:', formData.value.customBreedName)

    // 判断是否为混血犬
    if (profile.breedId === MIXED_BREED_VIRTUAL_ID) {
      isMixedBreed.value = true
      selectedBreed.value = null
      console.log('[DogCreate] Detected mixed breed dog')
    } else {
      // 查找品种对象
      const breed = breeds.value.find(b => b.id === profile.breedId)
      if (breed) {
        selectedBreed.value = breed
        isMixedBreed.value = false
        console.log('[DogCreate] Found breed in list:', breed)
      } else {
        // 找不到品种时，创建临时品种对象（防止数据丢失）
        console.warn('[DogCreate] Breed not found in list:', profile.breedId, '- creating temp breed object')
        selectedBreed.value = {
          id: profile.breedId,
          name: profile.customBreedName || '未知品种',
          sizeCategory: profile.sizeClassOverride || 'MEDIUM',
          adultAgeMonths: 12,
          seniorAgeYears: 10,
          averageAdultWeightKg: undefined
        }
        isMixedBreed.value = false
        // 保持原有的 breedId 和 customBreedName
        formData.value.breedId = profile.breedId
        formData.value.customBreedName = profile.customBreedName || ''
        formData.value.sizeClassOverride = profile.sizeClassOverride || null
      }
    }

    console.log('[DogCreate] Form data after populate:', {
      name: formData.value.name,
      breedId: formData.value.breedId,
      customBreedName: formData.value.customBreedName,
      sizeClassOverride: formData.value.sizeClassOverride,
      isMixedBreed: isMixedBreed.value,
      selectedBreed: selectedBreed.value?.name
    })

    // 如果有缓存的计算结果，可以选择显示
    if (profile.cachedTargetFoodKcal) {
      console.log('[DogCreate] Cached target food kcal:', profile.cachedTargetFoodKcal)
    }
  } finally {
    suppressDerivedStateInvalidation.value = false
  }
}

function cloneFormSnapshot() {
  return JSON.parse(JSON.stringify(formData.value))
}

function openCreateAvatarCropper(filePath: string) {
  avatarCropSourcePath.value = filePath
  showAvatarCropper.value = true
}

function closeCreateAvatarCropper() {
  showAvatarCropper.value = false
  avatarCropSourcePath.value = ''
}

async function handleCreateAvatarCropConfirm(croppedFilePath: string) {
  formData.value.avatarTempFilePath = await persistDogAvatarLocalPreviewPath(croppedFilePath)
  closeCreateAvatarCropper()
}

function showCreateAvatarCropError(message: string) {
  uni.showToast({
    title: message || '裁切失败，请重试',
    icon: 'none',
  })
}

async function handleCreateAvatarTap() {
  try {
    const res = await uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })

    const filePath = res.tempFilePaths?.[0]
    if (!filePath) {
      return
    }

    openCreateAvatarCropper(filePath)
  } catch (error: any) {
    if (String(error?.errMsg || '').includes('cancel')) {
      return
    }

    uni.showToast({
      title: error?.message || '选择头像失败',
      icon: 'none',
    })
  }
}

function onCreateAvatarPreviewError() {
  formData.value.avatarTempFilePath = ''
}

function getCustomerId() {
  const rawCustomerId = uni.getStorageSync('userId')
  return typeof rawCustomerId === 'string' && rawCustomerId.trim()
    ? rawCustomerId.trim()
    : ''
}

function clearCreateAutoPreviewTimer() {
  if (createAutoPreviewTimer) {
    clearTimeout(createAutoPreviewTimer)
    createAutoPreviewTimer = null
  }
}

function invalidateBreedDerivedState() {
  const hadCalcResult = Boolean(calcResult.value)

  backendLifeStageInfo.value = null
  calcResult.value = null
  showCalcProcess.value = false
  calcStaleNotice.value = calcStaleNotice.value || hadCalcResult
}

function setCreateStep(step: DogProfileCreateStep) {
  // 走到「喂食建议」（第 3 步）说明顾客已经看过第 2 步的每日餐数
  // —— 那一栏默认高亮 2 餐，并写着「影响制作单的生成，请确认」。
  // 看过后继续，即视为确认；没走到这一步则仍未确认。
  if (step === 'recommendation') {
    formData.value.mealsPerDayConfirmed = true
  }

  currentCreateStep.value = step

  nextTick(() => {
    scrollPageToTop()
  })
}

function getPreviousCreateStep(step: DogProfileCreateStep): DogProfileCreateStep {
  if (step === 'recommendation') {
    return 'feeding'
  }

  if (step === 'feeding') {
    return 'basic'
  }

  return 'basic'
}

function saveCreateDraft() {
  if (restoringCreateDraft.value) {
    return
  }

  const customerId = getCustomerId()
  if (!customerId) {
    return
  }

  saveDogProfileDraft(customerId, 'create', {
    step: currentCreateStep.value,
    form: cloneFormSnapshot(),
  })

  void trackDogProfileEvent('dog_profile_draft_saved', {
    mode: 'create',
    hasDraft: true,
    stepName: getCreateAnalyticsStepName(currentCreateStep.value),
  })
}

function restoreCreateDraft() {
  const customerId = getCustomerId()
  if (!customerId) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return false
  }

  const draft = loadDogProfileDraft(customerId, 'create')
  if (!draft) {
    previousCreateFormSnapshot = cloneFormSnapshot()
    return false
  }

  restoringCreateDraft.value = true

  try {
    populateFormData(draft.form)
    setCreateStep(resolveCreateDraftStep(draft.step, draft.form))
    previousCreateFormSnapshot = cloneFormSnapshot()
    calcResult.value = null
    void trackDogProfileEvent('dog_profile_draft_restored', {
      mode: 'create',
      hasDraft: true,
      stepName: getCreateAnalyticsStepName(currentCreateStep.value),
    })
    return true
  } finally {
    restoringCreateDraft.value = false
  }
}

function clearCreateDraft() {
  const customerId = getCustomerId()
  if (!customerId) {
    return
  }

  clearDogProfileDraft(customerId, 'create')
}

function scheduleCreateAutoPreview(dirtyFields?: string[]) {
  if (dirtyFields && !shouldAutoPreviewRecommendation(dirtyFields)) {
    return
  }

  if (!createPreviewReady.value) {
    return
  }

  clearCreateAutoPreviewTimer()
  createAutoPreviewTimer = setTimeout(() => {
    previewCalculation()
  }, 250)
}

function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value
}

function selectBreed(breed: Breed) {
  selectedBreed.value = breed
  isMixedBreed.value = false
  showCustomBreedInput.value = false
  showBreedSizeOverridePicker.value = false
  formData.value.breedId = breed.id
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null  // Reset override
  searchKeyword.value = ''
  customBreedSizeClass.value = null
  invalidateBreedDerivedState()
}

function isHotBreed(breedId: string) {
  return hotBreedIds.value.has(breedId)
}

/**
 * 「没有明确品种」的常见叫法（2026-09-27）。
 *
 * 生产数据里手填品种名的狗有 333 只，其中 **70%（234 只）** 是
 * 「田园犬 / 中华田园犬 / 田园 / 串串 / 混血」这一类 ——
 * 顾客并不是在找一个纯种，而是搜不到只好手打。
 * 做成一点即选后：不用打字、不用面对"搜不到"的挫败，
 * 并且仍然走**已有的混血通道**（体型必须顾客自己选，不预判）。
 *
 * 注：这三个名字**不收录为品种别名** —— 它们本质是"没有明确品种"，
 * 若挂到某个纯种下会把田园犬当成纯种犬去算热量。
 */
const mixedBreedQuickOptions = ['中华田园犬', '串串', '混血 / 其他']

/** 点一键选项：预填名称，直接进入"选体型"这一步（名称仍可修改） */
function startQuickMixedBreed(name: string) {
  customBreedName.value = name
  customBreedSizeClass.value = null
  showBreedSizeOverridePicker.value = false
  searchKeyword.value = ''
  showCustomBreedInput.value = true
}

/** 恢复自动匹配后会用到的体型（取自品种库），用于把"会恢复到什么"说清楚 */
const autoMatchedSizeLabel = computed(() => {
  const category = selectedBreed.value?.sizeCategory
  return category ? getSizeClassLabel(category) : '按品种'
})

function selectMixedBreed() {
  customBreedName.value = getManualBreedDraftName(searchKeyword.value, customBreedName.value)
  customBreedSizeClass.value = null
  showBreedSizeOverridePicker.value = false
  showCustomBreedInput.value = true
}

function confirmCustomBreed() {
  if (!customBreedSizeClass.value) {
    uni.showToast({
      title: '请选择体型分类',
      icon: 'none'
    })
    return
  }

  const name = customBreedName.value.trim() || '混血/其他'
  const selectedSizeClass = customBreedSizeClass.value
  selectedBreed.value = null
  isMixedBreed.value = true
  formData.value.breedId = MIXED_BREED_VIRTUAL_ID
  formData.value.customBreedName = name
  formData.value.sizeClassOverride = selectedSizeClass
  showBreedSizeOverridePicker.value = false
  showCustomBreedInput.value = false
  customBreedName.value = ''
  customBreedSizeClass.value = null
  searchKeyword.value = ''
  invalidateBreedDerivedState()
}

function cancelCustomBreed() {
  showCustomBreedInput.value = false
  customBreedName.value = ''
  customBreedSizeClass.value = null
}

function clearBreed() {
  selectedBreed.value = null
  isMixedBreed.value = false
  showCustomBreedInput.value = false
  showBreedSizeOverridePicker.value = false
  formData.value.breedId = ''
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null
  searchKeyword.value = ''
  customBreedSizeClass.value = null
  invalidateBreedDerivedState()
}

function toggleHotBreeds() {
  showHotBreeds.value = !showHotBreeds.value
}

function onSizeClassChange(e: any) {
  const selectedSizeClass = resolveSizeClassByPickerValue(e?.detail?.value)
  if (!selectedSizeClass) {
    return
  }

  formData.value.sizeClassOverride = selectedSizeClass
  invalidateBreedDerivedState()
}

function getSizeClassDisplay(): string {
  const override = formData.value.sizeClassOverride
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }

  if (isMixedBreed.value) {
    return override ? labels[override] : '请选择'
  }

  if (override) {
    return labels[override]
  }

  if (selectedBreed.value) {
    return labels[selectedBreed.value.sizeCategory]
  }

  return '请先选择品种'
}

function getSizeClassHint(): string {
  if (isMixedBreed.value) {
    return getCreateMixedBreedSizeHint(Boolean(formData.value.sizeClassOverride))
  }

  return ''
}

function onBirthdayChange(e: any) {
  formData.value.birthday = e.detail.value
  invalidateBreedDerivedState()
}

function restoreBreedSizeAutoMatch() {
  formData.value.sizeClassOverride = null
  showBreedSizeOverridePicker.value = false
  invalidateBreedDerivedState()
}

function clearMixedBreedSizeSelection() {
  if (!isMixedBreed.value) {
    return
  }

  formData.value.sizeClassOverride = null
  invalidateBreedDerivedState()
}

function enableBreedSizeOverride() {
  if (!selectedBreed.value || isMixedBreed.value) {
    return
  }

  showBreedSizeOverridePicker.value = true
}

function selectCustomBreedSize(sizeClass: string) {
  customBreedSizeClass.value = sizeClass
}

// 选择性别
function selectGender(gender: 'MALE' | 'FEMALE') {
  formData.value.gender = gender
}

// 选择是否绝育
function selectNeutered(value: boolean) {
  formData.value.isNeutered = value
  invalidateBreedDerivedState()
}

function selectBcsScore(score: number) {
  formData.value.bcsScore = score
  // 顾客亲自点过 = 确认过。这是定制门槛的判据，也是"这份体重建议靠不靠谱"的依据。
  formData.value.bcsScoreConfirmed = true
  invalidateBreedDerivedState()
}

// 选择活动水平
function selectActivityLevel(value: string) {
  formData.value.activityLevel = value
  formData.value.activityLevelConfirmed = true
  invalidateBreedDerivedState()
}

function onCreateMealsChange(event: any) {
  formData.value.mealsPerDay = createMealChoices[event.detail.value]?.value || '2'
  // 顾客动过餐数就算确认（餐数直接影响制作单的每包克重与包数）
  formData.value.mealsPerDayConfirmed = true
  invalidateBreedDerivedState()
}

/**
 * 某档零食当前是否选中。
 *
 * 兼容历史数据：零食档位由 4 档精简为 3 档后，库里仍有 MODERATE（适中）的档案
 * （生产 1118 只）。把它归到「少量」这一档**展示**，但顾客不动它时
 * 保存值仍是 MODERATE —— 不会被这次改版悄悄改写掉喂养口径。
 */
function isTreatLevelActive(level: string) {
  if (formData.value.treatLevel === level) return true
  return level === 'LOW' && formData.value.treatLevel === 'MODERATE'
}

function toggleFeedingImpact(type: 'bcs' | 'activity' | 'treat') {
  feedingImpactExpanded[type] = !feedingImpactExpanded[type]
}

function onActivityImageLoad() {
  showActivityFallback.value = false
}

function onActivityImageError() {
  console.warn('[Activity Guide] 参考图加载失败，降级为文字说明')
  showActivityFallback.value = true
}

function onBcsImageLoad() {
  console.log('[BCS Guide] Image loaded successfully')
  console.log('[BCS Guide] Image URL:', bcsGuideImageUrl.value)
  showBcsFallback.value = false
}

function onBcsImageError() {
  console.error('[BCS Guide] Failed to load BCS guide image')
  console.error('[BCS Guide] Image URL:', bcsGuideImageUrl.value)
  console.error('[BCS Guide] Possible causes:')
  console.error('  1. Domain not in WeChat miniprogram whitelist')
  console.error('  2. Network connectivity issue')
  console.error('  3. Image file does not exist or is corrupted')
  showBcsFallback.value = true // 显示降级内容
}

/**
 * 体况引导两张辅助图的加载失败处理。
 *
 * 与 BCS-chart 不同：这两张只是辅助，**不做文字兜底**，直接隐藏即可 ——
 * 问卷本身已经是纯文字的，用户不会因为缺图答不了题。
 */
function onBcsHowToImageError() {
  console.error('[BCS HowTo] Failed to load:', bcsHowToImageUrl.value)
  showBcsHowToImage.value = false
}

function onBcsSideImageError() {
  console.error('[BCS SideRef] Failed to load:', bcsSideImageUrl.value)
  showBcsSideImage.value = false
}

// ========== 生命阶段选择函数 ==========

/**
 * 展开手动选择面板
 */
function enableLifeStageOverride() {
  console.log('[LifeStage] enableLifeStageOverride called')
  showLifeStageOverride.value = true
  console.log('[LifeStage] showLifeStageOverride set to:', showLifeStageOverride.value)
}

function closeLifeStageOverride() {
  showLifeStageOverride.value = false
}

// ========== 繁殖期信息（2026-09-29，阶段 A） ==========

/** 是否需要填写繁殖期信息 */
const needsReproductionInfo = computed(() =>
  formData.value.lifeStageOverride === 'PREGNANCY' ||
  formData.value.lifeStageOverride === 'LACTATION',
)

const reproductionCardTitle = computed(() =>
  formData.value.lifeStageOverride === 'PREGNANCY' ? '妊娠期信息' : '哺乳期信息',
)

const reproductionCardDesc = computed(() =>
  formData.value.lifeStageOverride === 'PREGNANCY'
    ? '填了日期，系统才能按孕周调整每日能量。'
    : '填了分娩日和窝仔数，系统才能按哺乳阶段调整每日能量。',
)

/**
 * 繁殖期信息过期提示（阶段 A5）
 * 与后端 energy-v2 的两个有效期保持一致：哺乳 >8 周、预产期过 >14 天。
 */
const reproductionExpiredHint = computed(() => {
  const today = new Date()
  const f = formData.value

  if (f.lifeStageOverride === 'LACTATION' && f.deliveryDate) {
    const d = new Date(f.deliveryDate)
    if (!Number.isNaN(d.getTime()) && (today.getTime() - d.getTime()) / (7 * 86400000) > 8) {
      return '分娩已超过 8 周（通常已断奶），系统会改按成犬计算。建议改回「自动判断」。'
    }
  }

  if (f.lifeStageOverride === 'PREGNANCY' && f.expectedDueDate) {
    const d = new Date(f.expectedDueDate)
    if (!Number.isNaN(d.getTime()) && (today.getTime() - d.getTime()) / 86400000 > 14) {
      return '预产期已过两周以上，系统会改按成犬计算。如果已经生产，请改选「哺乳期」。'
    }
  }

  return ''
})

const onExpectedDueDateChange = (e: any) => {
  formData.value.expectedDueDate = e.detail.value
}

const onMatingDateChange = (e: any) => {
  formData.value.matingDate = e.detail.value
}

const onDeliveryDateChange = (e: any) => {
  formData.value.deliveryDate = e.detail.value
}

const onLitterSizeInput = (e: any) => {
  formData.value.litterSize = String(e?.detail?.value ?? '')
}

// ========== 繁殖期信息结束 ==========

/**
 * 选择手动覆盖的生命阶段（选中后自动收起面板）
 */
function selectLifeStageOverride(stage: string) {
  console.log('[LifeStage] selectLifeStageOverride called with:', stage)
  formData.value.lifeStageOverride = stage
  showLifeStageOverride.value = false // 自动收起面板
  invalidateBreedDerivedState()
  console.log('[LifeStage] Panel closed, lifeStageOverride set to:', formData.value.lifeStageOverride)
}

/**
 * 恢复自动匹配（清除手动覆盖）
 */
function restoreAutoMatch() {
  console.log('[LifeStage] restoreAutoMatch called')
  formData.value.lifeStageOverride = 'NONE'
  showLifeStageOverride.value = false
  invalidateBreedDerivedState()
  console.log('[LifeStage] Restored to auto match')
}

// ========== 生命阶段选择函数结束 ==========

function onLifeStageChange(e: any) {
  formData.value.lifeStageOverride = lifeStageOptions[e.detail.value]
  invalidateBreedDerivedState()
}

function selectTreatLevel(level: string) {
  formData.value.treatInputMode = 'ESTIMATE_LEVEL'
  formData.value.treatLevel = level
  invalidateBreedDerivedState()
}

/**
 * 预计算（生成喂食建议）。
 *
 * 2026-09-27：原先带一个 silent 选项用来决定是否弹「计算完成」。
 * 但两处调用点现在都是静默的（离开喂食步骤只是去下一步，喂食建议在最后一页展示），
 * 那个提示已彻底不可达，因此连同选项一起删除。
 */
async function previewCalculation() {
  // Only calculate if we have minimum required fields
  // Silently return if not ready - don't show error to user
  if (!canPreview.value) {
    // 静默返回：此刻「下一步」本来就是灰的，顾客点不到这里。
    // （原先靠 silent 选项控制，现已简化为始终静默）
    return false
  }

  calculating.value = true
  try {
    void trackDogProfileEvent('dog_profile_calc_requested', {
      mode: 'create',
      stepName: currentCreateStep.value === 'feeding'
        ? 'feeding_info'
        : getCreateAnalyticsStepName(currentCreateStep.value),
      calcStatus: 'requested',
    })

    const payload: any = {
      breedId: formData.value.breedId,
      birthday: new Date(formData.value.birthday).toISOString(),
      gender: formData.value.gender,
      // 未选时用 false 兜底（后端要求布尔）；第 1 步校验保证提交前一定选过
      isNeutered: formData.value.isNeutered ?? false,
      currentWeightKg: parsedCurrentWeightKg.value,
      // 繁殖期信息（2026-09-29，阶段 A）：只在妊娠/哺乳时提交
      ...(formData.value.lifeStageOverride === 'PREGNANCY'
        ? {
            expectedDueDate: formData.value.expectedDueDate || null,
            matingDate: formData.value.matingDate || null,
          }
        : {}),
      ...(formData.value.lifeStageOverride === 'LACTATION'
        ? {
            deliveryDate: formData.value.deliveryDate || null,
            litterSize: formData.value.litterSize
              ? Number(formData.value.litterSize)
              : null,
          }
        : {}),
      // 顾客还没选时用兜底值算预览（不阻断流程），确认状态另行提交
      bcsScore: formData.value.bcsScore ?? FALLBACK_BCS_SCORE,
      activityLevel: formData.value.activityLevel || FALLBACK_ACTIVITY_LEVEL,
      lifeStageOverride: formData.value.lifeStageOverride,
      sizeClassOverride: formData.value.sizeClassOverride,
      mealsPerDay: parseInt(formData.value.mealsPerDay) || 2,
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: formData.value.treatLevel
    }

    console.log('[DogCreate] Preview calculation payload:', payload)

    const res: any = await dogCreateApi.preview(payload)

    console.log('[DogCreate] Preview calculation response:', res)

    if (res.code === 0 && res.data) {
      calcResult.value = {
        rer: res.data.rer,
        totalDer: res.data.totalDer,
        finalFoodKcal: res.data.finalFoodKcal,
        treatDeduction: res.data.treatDeduction,
        isTreatCapped: res.data.isTreatCapped,
        dailyIntakeG: res.data.dailyIntakeG,
        calcDetails: res.data.calcDetails
      }
      console.log('[DogCreate] Preview calculation result:', calcResult.value)
      calcStaleNotice.value = false

      // 从后端返回的 calcDetails 中提取生命阶段信息
      if (res.data.calcDetails) {
        const details = res.data.calcDetails
        const lifeStage = details.lifeStage
        const ageMonths = details.ageMonths

        // 根据后端返回的 lifeStage 生成显示文本
        const labels: Record<string, string> = {
          'GROWTH': '生长期',
          'PUPPY': '幼犬期',
          'ADULT': '成年期',
          'SENIOR': '老年期',
          'PREGNANCY': '妊娠期',
          'LACTATION': '哺乳期'
        }

        // 生成详细信息文本
        let detailText = ''
        if (lifeStage === 'PUPPY') {
          if (ageMonths < 4) {
            detailText = `${ageMonths}个月（快速成长期）`
          } else if (ageMonths < 6) {
            detailText = `${ageMonths}个月（成长期）`
          } else {
            // 6个月及以上，统一显示月龄
            detailText = `${ageMonths}个月`
          }
        } else {
          // 成年期和老年期
          // 对于不足1岁的成年犬，显示月龄而不是"0岁"
          const ageYears = Math.floor(ageMonths / 12)
          if (ageYears < 1) {
            detailText = `${ageMonths}个月`
          } else {
            detailText = `${ageYears}岁`
          }
        }

        backendLifeStageInfo.value = {
          stage: lifeStage,
          label: labels[lifeStage] || lifeStage,
          detail: detailText
        }

        console.log('[DogCreate] Backend life stage info:', backendLifeStageInfo.value)
      }

      void trackDogProfileEvent('dog_profile_calc_succeeded', {
        mode: 'create',
        stepName: 'recommendation',
        calcStatus: 'success',
      })

      return true
    } else {
      throw new Error(res.message || 'Calculation failed')
    }
  } catch (err: any) {
    console.error('[DogCreate] Preview calculation error:', err)
    void trackDogProfileEvent('dog_profile_calc_failed', {
      mode: 'create',
      stepName: getCreateAnalyticsStepName(currentCreateStep.value),
      calcStatus: 'failed',
    })
    // 2026-09-27：失败提示改为**始终展示**。
    // 原先两个调用点都传 silent，把这里的提示静默掉了 ——
    // 于是计算失败时顾客点「下一步」既不跳转也不提示，像按钮坏了。
    uni.showToast({
      title: err?.message || '计算失败，请检查输入',
      icon: 'none',
      duration: 2000
    })
    calcResult.value = null
    return false
  } finally {
    calculating.value = false
  }
}

function showCreateStepBlockedToast(step: DogProfileCreateStep) {
  const messageMap: Record<DogProfileCreateStep, string> = {
    basic: '请先补齐名字、生日、体重，并确认品种/体型',
    feeding: '请先补齐基础信息',
    recommendation: '请先完善喂食信息并生成建议',
  }

  uni.showToast({
    title: messageMap[step],
    icon: 'none',
    duration: 2000,
  })
}

function showInvalidWeightToast() {
  uni.showToast({
    title: '请输入有效的体重(0.1-200kg)',
    icon: 'none',
    duration: 2000,
  })
}

async function handleCreatePrimaryAction() {
  if (currentCreateStep.value === 'basic') {
    if (!canAdvanceFromBasic.value) {
      if (!hasValidCurrentWeightKg.value) {
        showInvalidWeightToast()
        return
      }

      if (isMixedBreed.value && !formData.value.sizeClassOverride) {
        uni.showToast({
          title: '混血犬请选择体型分类',
          icon: 'none',
          duration: 2000,
        })
        return
      }

      showCreateStepBlockedToast('basic')
      return
    }

    trackCreateStepCompleted('basic')
    setCreateStep(getNextCreateStep('basic'))
    return
  }

  if (currentCreateStep.value === 'feeding') {
    if (!canAdvanceFromFeeding.value) {
      showCreateStepBlockedToast('recommendation')
      return
    }

    // 2026-09-27：这一步的按钮已改为「下一步」（先进健康管理页），
    // 因此不再弹「计算完成」—— 喂食建议要到最后一页才展示，
    // 此刻提示"计算完成"只会让顾客困惑。计算仍在后台静默完成。
    const previewSucceeded = await previewCalculation()
    if (!previewSucceeded) {
      return
    }

    trackCreateStepCompleted('feeding')
    setCreateStep(getNextCreateStep('feeding'))
    return
  }

  if (currentCreateStep.value === 'recommendation') {
    if (!canAdvanceFromRecommendation.value || !hasCreateRecommendationResult.value) {
      showCreateStepBlockedToast('recommendation')
      return
    }

    trackCreateStepCompleted('recommendation')
    await submit()
    return
  }

  await submit()
}

async function handleCreateSecondaryAction() {
  if (currentCreateStep.value === 'basic') {
    return
  }

  setCreateStep(getPreviousCreateStep(currentCreateStep.value))
}

async function handleCreateTertiaryAction() {
  return
}

// ========== 计算过程辅助函数 ==========

function toggleCalcProcess() {
  showCalcProcess.value = !showCalcProcess.value
}

function getSizeClassLabel(sizeClass: string): string {
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }
  return labels[sizeClass] || sizeClass
}

function getLifeStageLabel(lifeStage: string): string {
  const labels: Record<string, string> = {
    'GROWTH': '生长期',
    'ADULT': '成年期',
    'SENIOR': '老年期',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
    'PUPPY': '幼犬期'
  }
  return labels[lifeStage] || lifeStage
}

function getTreatModeLabel(treatMode: string): string {
  const labels: Record<string, string> = {
    'ESTIMATE_LEVEL': '估算级别',
    'EXACT_KCAL': '精确热量'
  }
  return labels[treatMode] || treatMode
}

function getTreatLevelLabel(treatLevel?: string): string {
  if (!treatLevel) return ''
  const labels: Record<string, string> = {
    'NONE': '无零食',
    'LOW': '少量',
    'MODERATE': '适量',
    'HIGH': '较多'
  }
  return labels[treatLevel] || treatLevel
}

function getActivityLevelText(activityLevel: string): string {
  const texts: Record<string, string> = {
    'RESTING': '休息静养',
    'LOW': '城市日常',
    'NORMAL': '规律运动',
    'HIGH': '高活动量'
  }
  return texts[activityLevel] || activityLevel
}

function getBcsText(bcsMultiplier: number): string {
  // 根据bcsMultiplier判断体况
  if (bcsMultiplier >= 1.1) return '偏瘦（需要增加热量）'
  if (bcsMultiplier === 1.0) return '标准体型'
  if (bcsMultiplier < 1.0 && bcsMultiplier >= 0.6) return '偏胖（需要减少热量）'
  return '未知'
}

/**
 * 获取生命阶段基础系数说明
 */
function getStageFactorBase(details: any): string {
  const stage = details.lifeStage

  if (stage === 'PUPPY') {
    // 幼犬期：系数根据月龄和体型细分，这里显示总体说明
    return `${details.stageFactor.toFixed(1)}（幼犬期，根据月龄和体型确定）`
  } else if (stage === 'ADULT') {
    // 成年期：根据绝育状态显示不同基准
    if (details.isNeutered) {
      return '1.6（已绝育基准）'
    } else {
      return '1.8（未绝育基准）'
    }
  } else if (stage === 'SENIOR') {
    return '1.4（老年期基准）'
  } else if (stage === 'PREGNANCY') {
    return '3.0（妊娠期）'
  } else if (stage === 'LACTATION') {
    return '4.0（哺乳期）'
  }

  // 其他情况（如手动覆盖）返回实际值
  return `${details.stageFactor.toFixed(2)}（${getLifeStageLabel(stage)}）`
}

/**
 * 获取活动水平系数
 */
function getActivityMultiplier(level: string): string {
  const multipliers: Record<string, string> = {
    'RESTING': '0.8',
    'LOW': '0.9',
    'NORMAL': '1.0',
    'HIGH': '1.2',
    'WORKING': '1.5'
  }
  return multipliers[level] || '1.0'
}

// ========== 计算过程辅助函数结束 ==========

async function submit() {
  const { name, breedId, birthday, currentWeightKg, activityLevel } = formData.value

  if (!hasCreateRecommendationResult.value) {
    showCreateStepBlockedToast('recommendation')
    return false
  }

  // Validation
  if (!name || !breedId || !birthday || !currentWeightKg || !activityLevel) {
    uni.showToast({
      title: '请填写必填项',
      icon: 'none'
    })
    return false
  }

  // Validate weight is a valid number
  if (!hasValidCurrentWeightKg.value) {
    showInvalidWeightToast()
    return false
  }

  // For mixed breed, require size class override
  if (isMixedBreed.value && !formData.value.sizeClassOverride) {
    uni.showToast({
      title: '混血犬请选择体型分类',
      icon: 'none'
    })
    return false
  }

  uni.showLoading({ title: '创建中...' })

  void trackDogProfileEvent('dog_profile_submit_requested', {
    mode: 'create',
    submitStatus: 'requested',
  })

  const payload: any = {
    ...buildDogCreatePayload(formData.value),
  }

  // Debug log: Show submit payload
  console.log('[DogCreate] Submit payload:', JSON.stringify(payload, null, 2))
  console.log('[DogCreate] Submit payload breedId:', payload.breedId)
  console.log('[DogCreate] formData.breedId:', formData.value.breedId)
  console.log('[DogCreate] selectedBreed:', selectedBreed.value)

  try {
    const res: any = await dogCreateApi.create(payload)
    console.log('[DogCreate] Submit response:', res)
    if (res.code === 0 && res.data) {
      const updatedDog = res.data.profile || res.data
      const selectedAvatarTempPath = String(formData.value.avatarTempFilePath || '').trim()
      console.log('[DogCreate] Updated dog data:', updatedDog)
      console.log('[DogCreate] Updated dog breedId:', updatedDog.breedId)
      const resultDogId = updatedDog.id

      if (!resultDogId) {
        console.error('[DogCreate] Response missing dog id:', res.data)
        uni.showToast({
          title: '创建失败：响应格式错误',
          icon: 'none',
          duration: 2000
        })
        return false
      }

      console.info(`[DogCreate] Dog created successfully: id=${resultDogId}, name=${updatedDog.name}`)

      writeDogHealthStateSnapshotCache(
        resultDogId,
        mergeDogHealthStateSnapshot(
          buildDogHealthStateSnapshot(payload),
          updatedDog,
        ),
      )

      if (hasValidCurrentWeightKg.value) {
        try {
          await dogCreateApi.createWeightRecord(
            resultDogId,
            buildInitialWeightRecordPayload({
              recordDate: new Date().toISOString().split('T')[0],
              weightKg: parseFloat(formData.value.currentWeightKg),
            }),
          )
        } catch (weightRecordErr) {
          console.error('[DogCreate] Failed to persist initial weight record:', weightRecordErr)
        }
      }

      let avatarUploadFailed = false
      if (selectedAvatarTempPath) {
        try {
          updatedDog.avatarUrl = await dogCreateApi.uploadAvatar(resultDogId, selectedAvatarTempPath)
        } catch (avatarError: any) {
          avatarUploadFailed = true
          console.error(
            '[DogCreate] Failed to upload dog avatar after create:',
            resolveDogAvatarUploadErrorMessage(avatarError),
          )
        }
      }

      void trackDogProfileEvent('dog_profile_submit_succeeded', {
        mode: 'create',
        dogId: resultDogId,
        submitStatus: 'success',
      })

      // 后台「狗档案转化分析」的「跳过健康信息」指标此前恒为 0 —— 前端从未上报过。
      // 建档三步里没有健康信息环节（健康记录在建档后由健康管理页维护），
      // 所以这里如实记录「建档时没有带任何健康信息」。
      if (!hasAnyHealthInput()) {
        void trackDogProfileEvent('dog_profile_health_skipped', {
          mode: 'create',
          dogId: resultDogId,
        })
      }

      // 漏斗：建档完成。与 dog_profile_started 配对，用于算「建档」这一步的流失。
      hasCreatedProfile.value = true
      trackFunnelEvent({
        eventName: 'dog_profile_created',
        step: 'dog_profile',
        dogId: resultDogId,
        entrySource: entrySource.value,
        properties: {
          durationMs: createStartedAt.value ? Date.now() - createStartedAt.value : 0,
          avatarUploadFailed,
        },
      })

      uni.setStorageSync('dogId', resultDogId)
      addDogToCache(updatedDog)
      formData.value.avatarTempFilePath = ''
      clearCreateDraft()

      uni.showToast({
        title: avatarUploadFailed ? '档案已创建，头像上传失败' : '创建成功',
        icon: avatarUploadFailed ? 'none' : 'success',
        duration: avatarUploadFailed ? 2200 : 1500,
      })

      setTimeout(() => {
        // 建档成功后的去向（2026-09-21 统一约定）：
        //   1. 从订购流程进来的 —— 回订购页继续下单；
        //   2. 其余入口 —— 一律先回「用户原来那一页」，让用户接着做刚才的事
        //      （来源页自己负责 onShow 刷新，新狗狗会被自动选中）；
        //   3. 只有页面栈里确实没有上一页时，才回落到爱犬列表。
        if (returnToOrderRecipeId.value) {
          uni.navigateBack({
            delta: 1,
            fail: () => {
              // 兜底：页面栈异常时直接重建订购页
              uni.redirectTo({
                url: `/pages/recipe-order/index?recipeId=${encodeURIComponent(returnToOrderRecipeId.value)}&dogId=${encodeURIComponent(resultDogId)}`,
              })
            },
          })
          return
        }

        if (getCurrentPages().length > 1) {
          uni.navigateBack({ delta: 1 })
          return
        }

        uni.redirectTo({
          url: '/pages/dog-profile-list/index'
        })
      }, avatarUploadFailed ? 2200 : 1500)
      return true
    } else {
      const errorMsg = res.message || '创建失败'
      console.error('[DogCreate] API error:', res.code, errorMsg)
      void trackDogProfileEvent('dog_profile_submit_failed', {
        mode: 'create',
        submitStatus: 'failed',
      })
      uni.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
      return false
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err) || '网络错误'
    console.error('[DogCreate] Create dog error:', err)
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'create',
      submitStatus: 'failed',
    })

    let userMsg = '创建失败，请稍后重试'
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      userMsg = '请求参数错误，请检查填写内容'
    } else if (errMsg.includes('网络') || errMsg.includes('连接') || errMsg.includes('timeout')) {
      userMsg = '网络连接失败，请检查网络设置'
    }

    uni.showToast({
      title: userMsg,
      icon: 'none',
      duration: 2000
    })
    return false
  } finally {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: calc(220rpx + env(safe-area-inset-bottom)); /* 为固定底部按钮和安全区留出空间 */
}

.form-section {
  background-color: #fbfcf7;
  padding: 30rpx;
  border-radius: 8rpx;
}

.wizard-step-header {
  position: sticky;
  top: 0;
  z-index: 40;
  margin: 0 -30rpx 8rpx;
  padding: 0 30rpx 12rpx;
  background: #fbfcf7;
  /* 2026-09-27 老板要求去掉毛玻璃：它在滚动时会糊住底下的信息。
     这里的背景本来就是不透明的，去掉模糊不影响观感。 */
}

.wizard-step {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.wizard-step__intro {
  padding: 8rpx 8rpx 0;
}

.wizard-step__eyebrow {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: #1e3a2f;
}

.wizard-step__title {
  display: block;
  margin-top: 12rpx;
  font-size: 40rpx;
  line-height: 1.25;
  font-weight: 700;
  color: #26261f;
}

.wizard-step__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.wizard-step--feeding .profile-card {
  background: linear-gradient(180deg, #ffffff 0%, #eef2e4 100%);
  border: 2rpx solid #e5e8d4;
  border-radius: 32rpx;
  padding: 28rpx;
  box-shadow: 0 14rpx 40rpx rgba(30, 46, 36, 0.06);
}

.wizard-step--feeding .label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #26261f;
}

.wizard-step--feeding .input {
  height: 88rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #26261f;
  box-sizing: border-box;
}

.wizard-step--feeding .picker {
  height: 88rpx;
  line-height: 84rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #26261f;
  box-sizing: border-box;
}

.wizard-step--feeding .hint {
  margin-top: 12rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.wizard-step--feeding .feeding-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.wizard-step--feeding .feeding-impact-link {
  flex-shrink: 0;
  font-size: 24rpx;
  line-height: 1.5;
  font-weight: 600;
  color: #1e3a2f;
}

/* BCS 九宫格（2026-09-27 重做）
   老板指出的三个问题：
   1) 1-5 分背景色完全一样，看不出"偏瘦 → 理想"的过渡
      → 改为三色带：偏瘦(青绿) / 理想(品牌绿) / 偏胖(金→橙→红)，逐档加深
   2) 选中态太弱（只有淡边框+阴影），看不出"能点、已点"
      → 选中时整卡填充主题色 + 白字 + 右上角勾
   3) 卡片面积偏大
      → 降低最小高度与内边距，格子更紧凑
   三色带对应国际 9 分制的通用读法：1-3 偏瘦、4-5 理想、6-9 偏胖/肥胖。 */
.wizard-step--feeding .bcs-choice-grid {
  margin-top: 16rpx;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10rpx;
}

.wizard-step--feeding .bcs-choice-card {
  --bcs-accent: #55786a;
  position: relative;
  min-height: 74rpx;
  padding: 10rpx 6rpx 8rpx;
  border-radius: 16rpx;
  background: var(--bcs-bg);
  border: 1rpx solid var(--bcs-border);
  text-align: center;
}

/* 选中：整卡填充 + 白字 + 勾，保证一眼看出"已经点了" */
.wizard-step--feeding .bcs-choice-card--active {
  background: var(--bcs-accent);
  border-color: var(--bcs-accent);
  box-shadow: 0 0 0 4rpx rgba(30, 58, 47, 0.14);
}

.wizard-step--feeding .bcs-choice-card--active .bcs-choice-card__score,
.wizard-step--feeding .bcs-choice-card--active .bcs-choice-card__status {
  color: #fbfcf7;
}

.wizard-step--feeding .bcs-choice-card__tick {
  position: absolute;
  top: 4rpx;
  right: 8rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #fbfcf7;
}

.wizard-step--feeding .bcs-choice-card__score {
  display: block;
  font-size: 25rpx;
  font-weight: 700;
  color: var(--bcs-accent);
}

.wizard-step--feeding .bcs-choice-card__status {
  display: block;
  margin-top: 2rpx;
  font-size: 19rpx;
  line-height: 1.4;
  color: #6b6653;
}

/* ── 偏瘦 1-3：冷调青绿，越接近理想越亮 ── */
.wizard-step--feeding .bcs-choice-card--score-1 {
  --bcs-accent: #3f6b5c;
  --bcs-border: rgba(63, 107, 92, 0.28);
  --bcs-bg: linear-gradient(180deg, #dde8e2 0%, #c6d8cf 100%);
}

.wizard-step--feeding .bcs-choice-card--score-2 {
  --bcs-accent: #47755f;
  --bcs-border: rgba(71, 117, 95, 0.28);
  --bcs-bg: linear-gradient(180deg, #e2ece6 0%, #cddcd3 100%);
}

.wizard-step--feeding .bcs-choice-card--score-3 {
  --bcs-accent: #4f8068;
  --bcs-border: rgba(79, 128, 104, 0.28);
  --bcs-bg: linear-gradient(180deg, #e7efe9 0%, #d3e1d8 100%);
}

/* ── 理想 4-5：品牌绿，正向强调 ── */
.wizard-step--feeding .bcs-choice-card--score-4 {
  --bcs-accent: #1e3a2f;
  --bcs-border: rgba(30, 58, 47, 0.3);
  --bcs-bg: linear-gradient(180deg, #e3efe2 0%, #cce2cb 100%);
}

.wizard-step--feeding .bcs-choice-card--score-5 {
  --bcs-accent: #16301f;
  --bcs-border: rgba(22, 48, 31, 0.34);
  --bcs-bg: linear-gradient(180deg, #dcebd9 0%, #c2dcbf 100%);
}

/* ── 偏胖 6-8：金 → 橙，逐档加暖 ── */
.wizard-step--feeding .bcs-choice-card--score-6 {
  --bcs-accent: #8a6b33;
  --bcs-border: rgba(138, 107, 51, 0.3);
  --bcs-bg: linear-gradient(180deg, #f8f1de 0%, #eee0c3 100%);
}

.wizard-step--feeding .bcs-choice-card--score-7 {
  --bcs-accent: #a1742f;
  --bcs-border: rgba(161, 116, 47, 0.32);
  --bcs-bg: linear-gradient(180deg, #f7ead0 0%, #ecd6ae 100%);
}

.wizard-step--feeding .bcs-choice-card--score-8 {
  --bcs-accent: #b26a2e;
  --bcs-border: rgba(178, 106, 46, 0.34);
  --bcs-bg: linear-gradient(180deg, #f7e2c7 0%, #ebc9a3 100%);
}

/* ── 肥胖 9：红调，最需要干预 ── */
.wizard-step--feeding .bcs-choice-card--score-9 {
  --bcs-accent: #a8452f;
  --bcs-border: rgba(168, 69, 47, 0.34);
  --bcs-bg: linear-gradient(180deg, #f7dcd3 0%, #e9bfb2 100%);
}

.wizard-step--feeding .feeding-impact-panel {
  margin-top: 14rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: rgba(30, 58, 47, 0.05);
  border: 1rpx solid rgba(30, 58, 47, 0.1);
}

.wizard-step--feeding .feeding-impact-panel__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--feeding .feeding-impact-panel__summary {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
}

.wizard-step--feeding .feeding-impact-panel__item {
  margin-top: 14rpx;
}

.wizard-step--feeding .feeding-impact-panel__item-label {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--feeding .feeding-impact-panel__item-detail {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
}

.wizard-step--feeding .feeding-guide-card {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background: #ffffff;
  border: 1rpx solid rgba(30, 58, 47, 0.1);
}

.wizard-step--feeding .feeding-guide-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.wizard-step--feeding .feeding-guide-card__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--feeding .feeding-guide-card__image {
  margin-top: 14rpx;
  width: 100%;
  border-radius: 18rpx;
}

/* 9 分制总表下方的侧视四档对照图，与总表留出间隔 */
.wizard-step--feeding .feeding-guide-card__image--sub {
  margin-top: 20rpx;
}

.wizard-step--feeding .activity-level-container {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.wizard-step--feeding .activity-level-card {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(30, 58, 47, 0.08);
}

.wizard-step--feeding .activity-level-card--active {
  border-color: rgba(30, 58, 47, 0.28);
  background: rgba(30, 58, 47, 0.08);
}

.wizard-step--feeding .activity-level-card__label {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--feeding .activity-level-card__description {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
}

.wizard-step--feeding .treat-level-grid {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.wizard-step--feeding .treat-level-card {
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid rgba(30, 58, 47, 0.08);
}

.wizard-step--feeding .treat-level-card--active {
  border-color: rgba(30, 58, 47, 0.28);
  background: rgba(30, 58, 47, 0.08);
}

.wizard-step--feeding .treat-level-card__label {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--feeding .treat-level-card__description {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: #6b6653;
}

.wizard-step--basic .profile-card {
  background: linear-gradient(180deg, #ffffff 0%, #eef2e4 100%);
  border: 2rpx solid #e5e8d4;
  border-radius: 32rpx;
  padding: 28rpx;
  box-shadow: 0 14rpx 40rpx rgba(30, 46, 36, 0.06);
}

.profile-card__identity {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.profile-card__avatar-picker {
  width: 144rpx;
  height: 144rpx;
  position: relative;
  flex-shrink: 0;
  border-radius: 36rpx;
  overflow: hidden;
}

.profile-card__avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, #eef2e4 0%, #1e3a2f 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 2rpx rgba(30, 46, 36, 0.08);
}

.profile-card__avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 36rpx;
}

.profile-card__avatar-text {
  font-size: 72rpx;
  line-height: 1;
  color: #1e3a2f;
}

.profile-card__avatar-badge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10rpx 0;
  display: flex;
  justify-content: center;
  background: rgba(30, 58, 47, 0.4);
}

.profile-card__avatar-badge-text {
  font-size: 20rpx;
  line-height: 1.2;
  font-weight: 600;
  color: #ffffff;
}

.profile-card__identity-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.profile-card__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.profile-card__field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-card__field--half {
  flex: 1 1 280rpx;
}

/* 体重：输入框 + 单位切换（公斤/斤）。
   单位必须显式可见 —— 国内顾客常按「斤」报体重，不写单位会直接算错热量。 */
.weight-input-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.weight-input {
  flex: 1 1 auto;
  min-width: 0;
}

.weight-unit-toggle {
  display: flex;
  flex: 0 0 auto;
  padding: 3rpx;
  background: #eef3ea;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.weight-unit-option {
  /* 收紧凑一些：切换器越窄，输入框越宽，灰字才不会被切掉 */
  padding: 0 14rpx;
  height: 52rpx;
  line-height: 52rpx;
  font-size: 23rpx;
  color: #6b6653;
  border-radius: 999rpx;
}

.weight-unit-option.active {
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
}

.profile-card__field--size {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #e5e8d4;
}

.profile-card__section-heading {
  margin-bottom: 20rpx;
}

.profile-card__section-title {
  display: block;
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 700;
  color: #26261f;
}

.profile-card__section-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.wizard-step--basic .label {
  margin-bottom: 12rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #26261f;
}

.wizard-step--basic .input,
.wizard-step--basic .picker {
  height: 88rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  padding: 0 24rpx;
  background: #ffffff;
  font-size: 28rpx;
  color: #26261f;
  box-sizing: border-box;
}

.wizard-step--basic .picker {
  line-height: 84rpx;
}

.wizard-step--basic .selected-breed-display {
  padding: 22rpx 24rpx;
  background: #eef2e4;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
}

.wizard-step--basic .change-btn {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #1e3a2f;
  background: rgba(30, 58, 47, 0.08);
}

.wizard-step--basic .breed-selector {
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  background: #ffffff;
}

.wizard-step--basic .search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  background: linear-gradient(180deg, #eef2e4 0%, #e2e8d4 100%);
  border-bottom: 1rpx solid #e5e8d4;
}

.wizard-step--basic .search-box__icon {
  flex-shrink: 0;
  font-size: 28rpx;
  line-height: 1;
  color: #6b6653;
}

.wizard-step--basic .search-input {
  width: 100%;
  border: 2rpx solid #e5e8d4;
  border-radius: 20rpx;
  padding: 0 24rpx;
  background: #ffffff;
}

.wizard-step--basic .search-input--with-icon {
  padding-left: 20rpx;
}

.wizard-step--basic .section {
  padding: 20rpx;
  border-bottom: 1rpx solid #eef1e2;
}

.wizard-step--basic .section-header .section-title {
  margin-bottom: 0;
}

.wizard-step--basic .breed-tag {
  background: #eef2e4;
  border: 1rpx solid #e5e8d4;
  color: #b08d4f;
}

.wizard-step--basic .size-info {
  border: 2rpx solid #e5e8d4;
  border-radius: 22rpx;
  padding: 18rpx 20rpx;
}

.wizard-step--basic .manual-select-btn {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
}

.wizard-step--basic .inline-manual-entry {
  padding: 24rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.wizard-step--basic .inline-manual-entry__title {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-step--basic .inline-manual-entry__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.wizard-step--basic .custom-breed-btn-cancel--inline {
  margin: 0;
  min-width: 200rpx;
}

.wizard-step--basic .custom-breed-size-grid--inline {
  margin-top: 0;
}

.wizard-step--basic .custom-breed-btn-confirm--inline {
  margin: 0;
  min-width: 180rpx;
}

.wizard-step--basic .auto-size-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 20rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 22rpx;
  background: #fbfcf7;
}

.wizard-step--basic .auto-size-summary__text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 600;
}

.wizard-step--basic .auto-size-summary__link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #1e3a2f;
}

.wizard-step--basic .mixed-size-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 20rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 22rpx;
  background: #eef2e4;
}

.wizard-step--basic .mixed-size-summary__text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 600;
}

.wizard-step--basic .mixed-size-summary__link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #1e3a2f;
}

/* 完成页的头像卡片（可选） */
.avatar-prompt-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 26rpx;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
  margin-bottom: 24rpx;
}

.avatar-prompt-card__text {
  flex: 1 1 auto;
  min-width: 0;
}

.avatar-prompt-card__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.avatar-prompt-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.avatar-prompt-card__picker {
  position: relative;
  flex: 0 0 auto;
  width: 128rpx;
  height: 128rpx;
}

.avatar-prompt-card__image,
.avatar-prompt-card__placeholder {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  overflow: hidden;
}

.avatar-prompt-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef3ea;
  border: 1rpx dashed #cddbbe;
}

.avatar-prompt-card__placeholder-text {
  font-size: 44rpx;
}

.avatar-prompt-card__badge {
  position: absolute;
  right: -6rpx;
  bottom: -6rpx;
  padding: 4rpx 14rpx;
  font-size: 20rpx;
  color: #f6efe0;
  background: #1e3a2f;
  border-radius: 999rpx;
}

.wizard-recommendation-section {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.wizard-recommendation-shell {
  padding: 28rpx;
  border-radius: 28rpx;
  background: linear-gradient(180deg, #eef2e4 0%, #ffffff 38%);
  border: 1rpx solid rgba(30, 58, 47, 0.12);
  box-shadow: 0 12rpx 34rpx rgba(30, 46, 36, 0.08);
}

.wizard-recommendation-header {
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid rgba(30, 58, 47, 0.08);
}

.wizard-recommendation-title {
  display: block;
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #26261f;
}

.wizard-recommendation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.wizard-recommendation-meta-item {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: rgba(30, 58, 47, 0.12);
}

.wizard-energy-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 24rpx;
}

.wizard-energy-card {
  display: flex;
  gap: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fbfcf7;
  border: 1rpx solid rgba(30, 58, 47, 0.06);
}

.wizard-energy-card--highlight {
  background: linear-gradient(135deg, #eef2e4 0%, #ffffff 88%);
  border-color: rgba(30, 58, 47, 0.28);
  box-shadow: 0 12rpx 30rpx rgba(30, 46, 36, 0.12);
}

.wizard-energy-main {
  width: 220rpx;
  flex-shrink: 0;
}

.wizard-energy-label {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
}

.wizard-energy-value {
  display: block;
  margin-top: 12rpx;
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #26261f;
}

.wizard-energy-value--highlight {
  font-size: 42rpx;
  color: #1e3a2f;
}

.wizard-energy-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.wizard-energy-summary {
  display: block;
  font-size: 24rpx;
  line-height: 1.5;
  font-weight: 600;
  color: #26261f;
}

.wizard-energy-line {
  display: block;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

.wizard-recommendation-note {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #f6efe0;
  border: 1rpx solid #b08d4f;
}

.wizard-recommendation-note-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #8a6b33;
}

.wizard-recommendation-note-body {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6b33;
}

.wizard-recommendation-empty {
  padding: 30rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(30, 58, 47, 0.06);
}

.wizard-recommendation-empty-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.wizard-recommendation-empty-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.wizard-skip-note {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 20rpx;
  background: #eef2e4;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.loading-notice {
  background-color: #f0f3e9;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  text-align: center;
  font-size: 28rpx;
  color: #26261f;
}

.form-item {
  margin-bottom: 30rpx;
}

.breed-section {
  margin-bottom: 40rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #26261f;
  font-weight: bold;
}

/* Breed Selection Styles */
.breed-selector {
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  overflow: hidden;
}

.search-box {
  padding: 20rpx;
  background-color: #fbfcf7;
  border-bottom: 1px solid #e5e8d4;
}

.search-results-header {
  padding: 20rpx 20rpx 8rpx;
}

.search-results-hint {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6b6653;
}

.search-input {
  width: 100%;
  height: 70rpx;
  border: 1px solid #e5e8d4;
  border-radius: 6rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.section {
  padding: 20rpx;
  border-bottom: 1px solid #e5e8d4;
}

.section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.section-title {
  font-size: 26rpx;
  color: #26261f;
  font-weight: bold;
  display: block;
  margin-bottom: 15rpx;
}

.toggle-icon {
  font-size: 24rpx;
  color: #6b6653;
}

/* Common Breeds Tags */
.common-breeds {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
}

.breed-tag {
  background-color: #eef2e4;
  color: #b08d4f;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  border: 1px solid #e5e8d4;
}

/* Breed List */
.breed-list {
  max-height: 400rpx;
  overflow-y: auto;
}

.breed-search-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  max-height: 520rpx;
  padding: 12rpx 20rpx 8rpx;
  box-sizing: border-box;
}

.all-breeds-list {
  max-height: 600rpx;
}

.breed-item {
  padding: 20rpx;
  border-bottom: 1px solid #eef1e2;
  font-size: 28rpx;
  color: #26261f;
}

.breed-item:last-child {
  border-bottom: none;
}

.breed-search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 16rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.08);
}

.breed-search-item:active {
  background-color: #eef2e4;
  border-color: #e5e8d4;
  transform: scale(0.98);
}

.breed-search-main {
  flex: 1;
  min-width: 0;
}

.breed-search-name {
  display: block;
  font-size: 30rpx;
  color: #26261f;
  font-weight: bold;
}

.breed-search-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 10rpx;
}

.breed-search-chip {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background-color: #eef2e4;
  color: #b08d4f;
  font-size: 22rpx;
  line-height: 1.2;
}

.breed-search-chip.common {
  background-color: #f6efe0;
  color: #8a6b33;
}

.breed-search-action {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.breed-search-action-text {
  font-size: 24rpx;
  color: #b08d4f;
  font-weight: bold;
}

.breed-search-action-icon {
  font-size: 28rpx;
  color: #b08d4f;
  font-weight: bold;
}

.search-empty-state {
  padding: 32rpx 20rpx 12rpx;
  text-align: center;
}

.no-results {
  display: block;
  color: #6b6653;
  font-size: 26rpx;
}

.search-empty-hint {
  display: block;
  margin-top: 12rpx;
  color: #6b6653;
  font-size: 24rpx;
  line-height: 1.5;
}

.search-mixed-entry {
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 8rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: bold;
  background-color: #f6efe0;
  color: #8a6b33;
  border: 1px solid #b08d4f;
}

.search-mixed-entry.primary {
  margin-top: 20rpx;
}

.search-fallback-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 20rpx 8rpx;
}

.search-fallback-text {
  font-size: 24rpx;
  color: #6b6653;
}

.search-fallback-link {
  font-size: 24rpx;
  color: #8a6b33;
  font-weight: bold;
}

/* Selected Breed Display */
.selected-breed-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
}

.selected-text {
  font-size: 28rpx;
  color: #26261f;
  font-weight: bold;
}

.change-btn {
  color: #b08d4f;
  font-size: 26rpx;
}

/* Size Class Display */
.size-display {
  background-color: #fbfcf7;
  padding: 20rpx;
  border-radius: 8rpx;
  border: 1px solid #e5e8d4;
}

.size-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx;
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 6rpx;
}

.size-info--auto {
  background-color: #fbfcf7;
  border-color: #e5e8d4;
}

.size-text {
  font-size: 28rpx;
  color: #26261f;
  font-weight: bold;
}

.edit-icon {
  font-size: 32rpx;
  color: #b08d4f;
}

.manual-select-btn {
  font-size: 26rpx;
  color: #b08d4f;
  padding: 8rpx 20rpx;
  background-color: #eef2e4;
  border-radius: 4rpx;
  white-space: nowrap;
}

.manual-select-btn--muted {
  color: #6b6653;
  background-color: #eef2e4;
}

/* Original Input Styles */
.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.picker {
  height: 80rpx;
  line-height: 80rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}

.hint {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  margin-top: 5rpx;
}


/* 「还没选择」的如实说明：不阻断流程，只讲清后果 */
.feeding-unselected-hint {
  margin-top: 16rpx;
  padding: 14rpx 20rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
  border-radius: 12rpx;
}

.feeding-unselected-hint__text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

/* 「恢复自动匹配」：做成与旁边「手动选择」同级的 chip，并显示将恢复到的体型 */
.restore-auto-btn {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 14rpx;
  padding: 12rpx 22rpx;
  background-color: #eef2e4;
  border: 1rpx solid #cddbbe;
  border-radius: 999rpx;
}

.restore-auto-btn__text {
  font-size: 25rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.restore-auto-btn__hint {
  font-size: 22rpx;
  color: #6b6653;
}

/* 「没有明确品种」的一键选项 */
.breed-tag--mixed {
  background-color: #f6efe0;
  border: 1rpx solid #e6d7b8;
  color: #8a6f3d;
}

.mixed-breed-quick {
  margin-top: 20rpx;
}

.mixed-breed-quick__title {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  text-align: center;
}

.mixed-breed-quick__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14rpx;
  margin-top: 14rpx;
}

.size-required {
  border-color: #dde3cd !important;
  background-color: #f8e8e2 !important;
}

.hint-warning {
  color: #b4553f !important;
  font-weight: bold;
}

/* 体重双向回显（= 86 斤）：弱化显示，只用于让顾客自查单位 */
.hint-echo {
  color: #6b7a70 !important;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
  border: none;
}

.btn:disabled {
  background-color: #f2f4ea;
  color: #6b6653;
}

.btn-secondary {
  background-color: #1e3a2f;
  margin-top: 20rpx;
}

.calc-stale-notice {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #f6efe0;
  border: 1px solid #b08d4f;
  border-radius: 8rpx;
}

.calc-stale-text {
  font-size: 24rpx;
  color: #8a6b33;
  line-height: 1.5;
}

.recommendation-card {
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 30rpx;
  margin-top: 30rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 20rpx;
  border-bottom: 1px solid #e5e8d4;
  padding-bottom: 15rpx;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx 0;
  border-bottom: 1px solid #eef1e2;
}

.calc-item:last-child {
  border-bottom: none;
}

.calc-item.highlight-item {
  background-color: #eef2e4;
  padding: 20rpx;
  border-radius: 4rpx;
  margin: 10rpx 0;
  border-bottom: none;
}

.calc-label {
  font-size: 28rpx;
  color: #26261f;
  flex: 1;
}

.calc-value {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.calc-value.highlight {
  color: #b08d4f;
  font-weight: bold;
  font-size: 32rpx;
}

.calc-warning {
  background-color: #f6efe0;
  border: 1px solid #b08d4f;
  border-radius: 4rpx;
  padding: 15rpx;
  margin-top: 15rpx;
  font-size: 26rpx;
  color: #8a6b33;
  line-height: 1.5;
}

/* Collapsed Common Breeds */
.common-breeds.collapsed {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  max-height: 80rpx;
  overflow: hidden;
}

/* Size Category Groups with Sidebar Navigation */
.breed-selector-with-sidebar {
  display: flex;
  height: 600rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  overflow: hidden;
  background-color: #fbfcf7;
}

/* 侧边快速导航栏 */
.quick-nav-sidebar {
  width: 100rpx;
  background-color: #fbfcf7;
  border-right: 1px solid #e5e8d4;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 10rpx;
  border-bottom: 1px solid #e5e8d4;
  transition: all 0.3s ease;
  cursor: pointer;
}

.nav-item:last-child {
  border-bottom: none;
}

.nav-item.active {
  background-color: #fbfcf7;
  box-shadow: 0 0 10rpx rgba(30, 46, 36, 0.1);
  border-left: 3px solid #1e3a2f;
}

.nav-icon {
  font-size: 28rpx;
  margin-bottom: 4rpx;
}

.nav-label {
  font-size: 20rpx;
  color: #26261f;
}

.nav-item.active .nav-label {
  color: #b08d4f;
  font-weight: bold;
}

/* 品种内容滚动区 */
.breed-content-scroll {
  flex: 1;
  height: 100%;
  overflow-y: auto;
}

.size-category-group {
  margin-bottom: 20rpx;
}

.size-category-group:last-child {
  margin-bottom: 0;
}

.size-category-title {
  font-size: 28rpx;
  font-weight: bold;
  padding: 20rpx;
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  border-radius: 4rpx;
  margin-bottom: 15rpx;
}

/* 不同分类的颜色主题 */
.size-category-group[data-category="SMALL"] .size-category-title {
  background: linear-gradient(135deg, #eef2e4 0%, #1e3a2f 100%);
  color: #b08d4f;
  border-left: 4px solid #1e3a2f;
}

.size-category-group[data-category="MEDIUM"] .size-category-title {
  background: linear-gradient(135deg, #f6efe0 0%, #b08d4f 100%);
  color: #8a6b33;
  border-left: 4px solid #b08d4f;
}

.size-category-group[data-category="LARGE"] .size-category-title {
  background: linear-gradient(135deg, #eef2e4 0%, #1e3a2f 100%);
  color: #1e3a2f;
  border-left: 4px solid #1e3a2f;
}

.size-category-group[data-category="GIANT"] .size-category-title {
  background: linear-gradient(135deg, #eef2e4 0%, #e2e8d4 100%);
  color: #b08d4f;
  border-left: 4px solid #1e3a2f;
}

/* 品种网格布局 */
.breed-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  padding: 0 20rpx 20rpx 20rpx;
}

.breed-item {
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 6rpx;
  padding: 15rpx 25rpx;
  font-size: 26rpx;
  color: #26261f;
  text-align: center;
  min-width: 120rpx;
  transition: all 0.2s ease;
  cursor: pointer;
}

.breed-item:active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
  transform: scale(0.95);
}

/* Custom Breed Input Modal */
.custom-breed-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.custom-breed-content {
  width: 600rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  padding: 40rpx;
  box-shadow: 0 4rpx 20rpx rgba(30, 46, 36, 0.15);
}

.custom-breed-title {
  font-size: 32rpx;
  color: #26261f;
  font-weight: bold;
  margin-bottom: 12rpx;
  display: block;
  text-align: center;
}

.custom-breed-subtitle {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: #26261f;
  text-align: center;
}

.custom-breed-input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  margin-bottom: 12rpx;
}

.custom-breed-input-hint {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.5;
}

.custom-breed-size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.custom-breed-size-option {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  background-color: #fbfcf7;
  border: 2rpx solid #e5e8d4;
  border-radius: 12rpx;
  transition: all 0.2s;
}

.custom-breed-size-option.active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
  box-shadow: 0 10rpx 24rpx rgba(30, 46, 36, 0.12);
}

.custom-breed-size-option-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.custom-breed-hint {
  display: block;
  margin-bottom: 30rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.custom-breed-actions {
  display: flex;
  gap: 20rpx;
}

.custom-breed-btn-cancel,
.custom-breed-btn-confirm {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  text-align: center;
  border: none;
}

.custom-breed-btn-cancel {
  background-color: #fbfcf7;
  color: #26261f;
  border: 1px solid #e5e8d4;
}

.custom-breed-btn-confirm {
  background-color: #1e3a2f;
  color: #f3eddd;
}

.custom-breed-btn-confirm.disabled {
  background-color: #f2f4ea;
  color: #6b6653;
}

/* Gender Selector */
.gender-selector {
  display: flex;
  gap: 18rpx;
}

.gender-option {
  flex: 1;
  min-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 0 20rpx;
  background-color: #fbfcf7;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  transition: all 0.2s;
}

.gender-option--male.active {
  background: #eef2e4;
  border-color: #e5e8d4;
  color: #b08d4f;
}

.gender-option--female.active {
  background: #f8e8e2;
  border-color: #e5e8d4;
  color: #c48f77;
}

.gender-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.gender-symbol {
  font-size: 30rpx;
  line-height: 1;
  font-weight: 700;
}

.gender-symbol--male {
  color: #b08d4f;
}

.gender-symbol--female {
  color: #c48f77;
}

.gender-option.active .gender-label {
  color: inherit;
}

/* Neuter Selector */
.neuter-selector {
  display: flex;
  gap: 18rpx;
}

.neuter-option {
  flex: 1;
  min-height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20rpx;
  background-color: #fbfcf7;
  border: 2rpx solid #e5e8d4;
  border-radius: 24rpx;
  transition: all 0.2s;
}

.neuter-option.active {
  background: #eef2e4;
  border-color: #e5e8d4;
  box-shadow: 0 12rpx 24rpx rgba(30, 46, 36, 0.08);
}

.neuter-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.neuter-option.active .neuter-label {
  color: #1e3a2f;
}

/* BCS Score Row */
.bcs-score-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.bcs-slider {
  flex: 1;
  min-width: 0;
}

.bcs-body-status {
  font-size: 26rpx;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 8rpx 12rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
}

/* Activity Level Options */
.activity-level-container {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.activity-level-option {
  padding: 20rpx;
  background-color: #fbfcf7;
  border: 2px solid #e5e8d4;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.activity-level-option.active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
}

.activity-level-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.activity-level-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
}

.activity-level-option.active .activity-level-label {
  color: #b08d4f;
}

.activity-level-coefficient {
  font-size: 26rpx;
  font-weight: bold;
  color: #b4553f;
  background-color: #f8e8e2;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.activity-level-description {
  font-size: 24rpx;
  color: #26261f;
  line-height: 1.5;
}

/* BCS Guide Popup */
.bcs-guide-popup {
  width: 650rpx;
  max-height: 85vh;
  background-color: #fbfcf7;
  border-radius: 16rpx;
  padding: 30rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.bcs-guide-title {
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;
  color: #26261f;
  margin-bottom: 20rpx;
  width: 100%;
  box-sizing: border-box;
}

.bcs-image-container {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.bcs-image-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.bcs-guide-image {
  max-width: 100%;
  height: auto;
  border-radius: 8rpx;
  display: block;
}

.bcs-image-error {
  padding: 60rpx 20rpx;
  text-align: center;
  color: #6b6653;
  font-size: 26rpx;
}

/* BCS降级内容样式 */
.bcs-fallback-content {
  padding: 30rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
}

.bcs-fallback-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
  text-align: center;
  margin-bottom: 30rpx;
}

.bcs-table {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.bcs-row {
  background-color: #fbfcf7;
  border-radius: 12rpx;
  padding: 24rpx;
  border-left: 6rpx solid #e5e8d4;
}

.bcs-row-thin {
  border-left-color: #dde3cd;
  background-color: #f8e8e2;
}

.bcs-row-ideal {
  border-left-color: #1e3a2f;
  background-color: #eef2e4;
}

.bcs-row-overweight {
  border-left-color: #b08d4f;
  background-color: #f6efe0;
}

.bcs-score-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16rpx;
}

.bcs-score {
  font-size: 36rpx;
  font-weight: bold;
  color: #26261f;
}

.bcs-label {
  font-size: 24rpx;
  color: #26261f;
  margin-top: 8rpx;
}

.bcs-desc {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.bcs-desc-item {
  font-size: 24rpx;
  color: #26261f;
  line-height: 1.6;
}

.bcs-tip {
  margin-top: 30rpx;
  padding: 20rpx;
  background-color: #eef2e4;
  border-radius: 8rpx;
  border-left: 4rpx solid #1e3a2f;
}

.bcs-tip-text {
  font-size: 24rpx;
  color: #b08d4f;
  line-height: 1.6;
}

/* Health Record Section */
.health-record-section {
  margin-bottom: 20rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  overflow: hidden;
}

.health-record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 30rpx;
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 12rpx;
  cursor: pointer;
}

.health-record-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
}

.toggle-icon {
  font-size: 24rpx;
  color: #6b6653;
  transition: transform 0.3s;
}

.health-record-content {
  padding: 20rpx 30rpx;
  background-color: #fbfcf7;
}

.placeholder-box {
  padding: 40rpx 20rpx;
  background-color: #fbfcf7;
  border: 2px dashed #e5e8d4;
  border-radius: 8rpx;
  text-align: center;
}

.placeholder-text {
  font-size: 26rpx;
  color: #6b6653;
}

/* ========== 生命阶段样式 ========== */

.life-stage-section {
  background-color: #fbfcf7;
  border-radius: 12rpx;
  padding: 24rpx;
  border: 1px solid #e5e8d4;
}

/* 生命阶段内容区域 */
.life-stage-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

/* 自动匹配结果展示 */
.auto-match-result {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx;
  background: linear-gradient(135deg, #eef2e4 0%, #e2e8d4 100%);
  border-radius: 8rpx;
  border-left: 4px solid #1e3a2f;
  flex-wrap: wrap;
}

.auto-match-text {
  font-size: 30rpx;
  color: #b08d4f;
  font-weight: bold;
}

.auto-match-label {
  font-size: 26rpx;
  color: #26261f;
  font-weight: 500;
}

/* 手动选择触发按钮 */
.manual-select-trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8rpx;
  padding: 12rpx 0;
  background: transparent;
  border: none;
  transition: all 0.3s;
}

.manual-select-trigger:active {
  opacity: 0.6;
}

.manual-select-text {
  font-size: 26rpx;
  color: #6b6653;
  font-weight: 400;
}

.manual-select-icon {
  font-size: 22rpx;
  color: #6b6653;
}

/* 未填写生日提示 */
.life-stage-prompt {
  padding: 32rpx;
  background-color: #f6efe0;
  border-radius: 8rpx;
  text-align: center;
  border: 1px solid #b08d4f;
}

.prompt-text {
  font-size: 26rpx;
  color: #8a6b33;
  line-height: 1.6;
}

.life-stage-sheet {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: flex-end;
}

.life-stage-sheet-mask {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.38);
}

.life-stage-sheet-content {
  position: relative;
  width: 100%;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  background-color: #fbfcf7;
  border-radius: 28rpx 28rpx 0 0;
  box-shadow: 0 -12rpx 32rpx rgba(30, 46, 36, 0.14);
}

.life-stage-sheet-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
  text-align: center;
}

.life-stage-sheet-subtitle {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
  text-align: center;
}

.override-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.override-option {
  padding: 16rpx;
  background-color: #fbfcf7;
  border: 2px solid #e5e8d4;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  transition: all 0.2s;
}

.override-option.active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
}

.override-option-label {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.override-option.active .override-option-label {
  color: #b08d4f;
  font-weight: bold;
}

.override-option-desc {
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.4;
}

.life-stage-sheet-cancel {
  margin-top: 24rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 16rpx;
  background-color: #fbfcf7;
  color: #26261f;
  border: none;
  font-size: 28rpx;
}

/* ========== 零食设置样式 ========== */

.treat-section {
  background-color: #fbfcf7;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-label {
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
  display: block;
  margin-bottom: 20rpx;
}

.field-label {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
  display: block;
  margin-bottom: 12rpx;
}

/* 零食输入模式选择器 */
.treat-mode-selector,
.treat-level-selector {
  margin-bottom: 20rpx;
}

.treat-exact-input {
  margin-bottom: 20rpx;
}

/* 卡片选项容器 */
.card-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

/* 横向布局的卡片选项容器 */
.card-options-horizontal {
  flex-direction: row;
  gap: 16rpx;
}

/* 单个卡片 */
.card-option {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  background-color: #fbfcf7;
  border: 2px solid #e5e8d4;
  border-radius: 12rpx;
  transition: all 0.3s;
}

.card-option.active {
  background-color: #eef2e4;
  border-color: #1e3a2f;
}

/* 简化卡片（无圆圈，用于输入模式选择） */
.card-option-simple {
  flex: 1;
  justify-content: center;
  padding: 24rpx 16rpx;
}

/* 单选按钮 */
.card-radio {
  width: 40rpx;
  height: 40rpx;
  border: 3px solid #e5e8d4;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-option.active .card-radio {
  border-color: #1e3a2f;
}

.radio-checked {
  width: 20rpx;
  height: 20rpx;
  background-color: #1e3a2f;
  border-radius: 50%;
}

/* 卡片内容 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.card-label {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.card-option.active .card-label {
  color: #b08d4f;
  font-weight: bold;
}

.card-label-simple {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
  flex: 1;
  text-align: center;
}

.card-option-simple.active .card-label-simple {
  color: #b08d4f;
  font-weight: bold;
}

.card-desc {
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.4;
}

/* 零食量卡片特殊样式 */
.treat-level-card .card-label {
  font-size: 28rpx;
}

/* 精确输入框 */
.treat-exact-input .input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #e5e8d4;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.input-white-bg {
  background-color: #ffffff !important;
}

/* ========== 计算过程样式 ========== */
.calc-process-section {
  margin-top: 20rpx;
  border-top: 1px solid #e5e8d4;
  padding-top: 20rpx;
}

.process-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #eef2e4;
  border-radius: 8rpx;
  cursor: pointer;
}

.process-toggle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
}

.process-toggle-icon {
  font-size: 24rpx;
  color: #b08d4f;
}

.process-content {
  margin-top: 20rpx;
}

.process-step {
  margin-bottom: 24rpx;
  padding: 20rpx;
  background-color: #fbfcf7;
  border-radius: 8rpx;
  border-left: 3px solid #1e3a2f;
}

.process-step.final-step {
  background-color: #eef2e4;
  border-left-color: #1e3a2f;
}

.step-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
  margin-bottom: 12rpx;
}

.step-desc {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.6;
  margin-bottom: 10rpx;
}

.step-tip {
  font-size: 24rpx;
  color: #b08d4f;
  line-height: 1.6;
  margin-top: 10rpx;
  background-color: #eef2e4;
  padding: 10rpx 12rpx;
  border-radius: 4rpx;
  border-left: 3px solid #1e3a2f;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.info-item {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.5;
}

.formula-box {
  background-color: #fbfcf7;
  border: 1px solid #e5e8d4;
  border-radius: 6rpx;
  padding: 15rpx;
  margin-top: 10rpx;
}

.formula-text {
  font-size: 26rpx;
  color: #26261f;
  font-family: 'Courier New', monospace;
  line-height: 1.8;
  word-break: break-all;
  display: block;
  margin-bottom: 4rpx;
}

.formula-result {
  font-size: 30rpx;
  font-weight: bold;
  color: #1e3a2f;
  margin-top: 10rpx;
  padding-top: 10rpx;
  border-top: 2px dashed #e5e8d4;
}

.coefficients-box {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 10rpx;
}

.coeff-item {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.5;
}

.treat-box {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 10rpx;
}

.treat-mode,
.treat-level,
.treat-deduction {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.5;
}

.treat-mode {
  font-weight: bold;
  color: #26261f;
}

/* ========== 计算过程样式结束 ========== */

/* 内联计算按钮样式 */
.btn-inline-calc {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 8rpx;
  font-size: 30rpx;
  margin-top: 20rpx;
  border: none;
}

.btn-inline-calc:disabled {
  background-color: #f2f4ea;
  color: #6b6653;
}


/* ===== 繁殖期信息卡片（2026-09-29，阶段 A） ===== */
.repro-card {
  margin-top: 20rpx;
}

.repro-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eef1ea;
}

.repro-field__label {
  font-size: 28rpx;
  color: #33413a;
}

.repro-field__value {
  min-width: 300rpx;
  text-align: right;
  font-size: 28rpx;
  color: #1e3a2f;
}

.repro-field__input {
  min-width: 300rpx;
  text-align: right;
  font-size: 28rpx;
  color: #1e3a2f;
}

.repro-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #6b7a70;
  line-height: 1.5;
}

.repro-expired {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #fdf3ee;
}

.repro-expired__text {
  font-size: 24rpx;
  color: #b4553f;
  line-height: 1.6;
}

/* ===== 体况引导（2026-09-29，阶段 C） ===== */
.bcs-longhair-hint {
  margin: 12rpx 0;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background-color: #f3f6f0;
}

.bcs-longhair-hint__text {
  font-size: 24rpx;
  color: #46564d;
  line-height: 1.5;
}

.bcs-question {
  margin-top: 24rpx;
}

.bcs-question__title {
  display: block;
  font-size: 28rpx;
  color: #1e3a2f;
  font-weight: bold;
  line-height: 1.5;
}

.bcs-question__hint {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #6b7a70;
  line-height: 1.5;
}

.bcs-question__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.bcs-question__option {
  padding: 14rpx 22rpx;
  border: 1rpx solid #d8ded2;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #46564d;
}

.bcs-question__option.active {
  border-color: #1e3a2f;
  background-color: #eef4ea;
  color: #1e3a2f;
  font-weight: bold;
}

.bcs-result {
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #eef4ea;
}

.bcs-result--pending {
  background-color: #fdf3ee;
}

.bcs-result__score {
  display: block;
  font-size: 28rpx;
  color: #1e3a2f;
  font-weight: bold;
}

.bcs-result__note {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6b7a70;
  line-height: 1.5;
}

/* 操作指引图（阶段 C3）：取代原来的「演示视频位」虚线占位框 */
.bcs-howto {
  margin-top: 20rpx;
}

.bcs-howto__image {
  width: 100%;
  border-radius: 12rpx;
}
</style>
