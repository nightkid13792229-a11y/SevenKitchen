<template>
  <!--
    狗狗选择面板 · 三页共用（2026-11-07 抽出）

    ## 为什么抽它

    这一块原来被写了三遍：
      · 成品订购页：狗狗胶囊 + 六项读数
      · DIY 配置页：整块照搬（连样式数值都一样），已经漂移出「296g/天」
      · 食谱详情页：只显示胶囊的第三套
    三个页面的「没有档案 / 加载失败」也各写一份，文案还不一致。

    ## 它不做什么

    · 不拉列表、不调接口、不算饭量 —— 列表和数字都由页面给
    · 不存选中状态 —— 只发 select 事件，持久化在页面 / useDogSelection
    · 不决定要不要二次确认 —— 那是页面的业务（换狗会重算价格）

    ## 显示什么由两个开关决定

    · facts：'full' 六项（成品 / DIY）| 'none' 只有胶囊（详情页）
    · panel：true 灰绿底面板（成品 / DIY）| false 直接铺在页面上（详情页）

    ## 六项为什么长这样（2026-11-07）

    原来每格一块浅色底 + 圆角 + 等宽等距 —— 和上面能点的狗狗胶囊是同一套视觉语言，
    顾客会以为这六个也能点。改成「去掉底色 + 一条极细竖线」，读起来是参数表。

    ⚠️ 分隔线用 `--first` 类而不是 `:first-child`：小程序 wxss 不保证支持伪类。
  -->
  <view class="dog-context">
    <!-- 读取中：给个骨架，页面不会“闪一下又出来” -->
    <view v-if="state === 'loading'" :class="['dog-skeleton', { 'dog-skeleton--plain': !panel }]">
      <view class="dog-skeleton-row">
        <view class="dog-skeleton-chip"></view>
        <view class="dog-skeleton-chip"></view>
      </view>
      <view class="dog-skeleton-line"></view>
    </view>

    <!-- 加载失败 ≠ 没有档案：失败时说“暂无”，顾客会去重复建档 -->
    <view v-else-if="state === 'error'" class="dog-state-card">
      <text class="dog-state-title">狗狗档案加载失败</text>
      <text class="dog-state-copy">请检查网络后重试 —— 先把档案拉回来，避免重复建档。</text>
      <button class="dog-state-button dog-state-button--ghost" @tap="emit('retry')">重新加载</button>
    </view>

    <!-- 真的没有档案 -->
    <view v-else-if="state === 'empty'" class="dog-state-card">
      <text class="dog-state-title">请先创建狗狗档案</text>
      <text class="dog-state-copy">系统会结合狗狗档案和当前食谱，算出这只狗每天吃多少。</text>
      <button class="dog-state-button" @tap="emit('create-dog')">创建狗狗档案</button>
    </view>

    <!-- 正常：胶囊 + （可选的）六项读数 -->
    <view v-else>
      <view :class="panel ? 'dog-panel' : 'dog-plain'">
        <scroll-view
          scroll-x
          scroll-with-animation
          class="dog-scroll"
          :scroll-into-view="scrollAnchor"
        >
          <view
            v-for="dog in dogs"
            :id="`dog-chip-${dog.id}`"
            :key="dog.id"
            :class="['dog-chip', { active: dog.id === selectedId }]"
            @tap="emit('select', dog.id)"
          >
            <image class="dog-avatar" :src="resolveDogAvatarSrc(dog.avatarUrl)" mode="aspectFill" />
            <view class="dog-copy">
              <text class="dog-name">{{ dog.name }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-if="showFacts" class="dog-facts-wrap">
          <view class="dog-facts">
            <view
              v-for="(fact, index) in factItems"
              :key="fact.label"
              :class="['dog-fact', { 'dog-fact--first': index === 0 }]"
            >
              <text class="dog-fact-label">{{ fact.label }}</text>
              <text class="dog-fact-value">{{ fact.value }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 有档案但还没选中：不显示六项，避免一排“计算中” -->
      <text v-if="!selectedDog && hint" class="dog-hint">{{ hint }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'

/**
 * 组件只吃“已经拉好的狗”和“已经算好的数”，类型按它真正用到的字段收敛：
 * 页面传 `Dog` / `DogProfile` 都能直接进来，不需要各页转一层。
 */
interface DogLike {
  id: string
  name: string
  avatarUrl?: string
  birthday?: string
  ageText?: string
  gender?: string
  currentWeightKg?: string | number
  mealsPerDay?: string | number
}

const props = withDefaults(
  defineProps<{
    /** 狗狗列表（页面负责拉） */
    dogs?: DogLike[]
    /** 当前选中；空字符串表示还没选 */
    selectedId?: string
    /** 页面级状态：读取中 / 失败 / 没档案 / 正常 */
    state?: 'loading' | 'error' | 'empty' | 'ready'
    /** 参数行：六项 / 不显示（详情页不算饭量，也不该为它多打一次接口） */
    facts?: 'full' | 'none'
    /** 灰绿底面板：成品页和 DIY 页有，详情页直接铺在页面上 */
    panel?: boolean
    /** 每日饭量（g），由页面按食谱算好后传入 */
    dailyIntakeG?: number
    /** 每餐约（g），DIY 页允许顾客改，所以单独传 */
    perMealG?: number
    /** 有档案但还没选中时的一行提示 */
    hint?: string
  }>(),
  {
    dogs: () => [],
    selectedId: '',
    state: 'ready',
    facts: 'full',
    panel: true,
    dailyIntakeG: 0,
    perMealG: 0,
    hint: '',
  },
)

const emit = defineEmits<{
  (event: 'select', dogId: string): void
  (event: 'create-dog'): void
  (event: 'retry'): void
}>()

const selectedDog = computed(
  () => props.dogs.find((dog) => dog.id === props.selectedId) || null,
)

/** 狗多时把选中的那只滑到可见位置（成品页原来不会，选了看不见） */
const scrollAnchor = computed(() =>
  props.selectedId ? `dog-chip-${props.selectedId}` : '',
)

const showFacts = computed(() => props.facts === 'full' && Boolean(selectedDog.value))

/**
 * 年龄口径沿用成品页：优先用后端给的 ageText，否则按月龄自己算。
 * （`utils/dog-profile-overview` 里那个会输出“几年几月”，与这块读数不一致，别混用。）
 */
function dogAgeText(dog: DogLike): string {
  if (dog.ageText) return dog.ageText
  if (!dog.birthday) return '年龄未知'

  const birthday = new Date(dog.birthday)
  if (Number.isNaN(birthday.getTime())) return '年龄未知'

  const now = new Date()
  let months = (now.getFullYear() - birthday.getFullYear()) * 12
    + now.getMonth() - birthday.getMonth()

  if (now.getDate() < birthday.getDate()) {
    months -= 1
  }

  if (months < 0) return '年龄未知'
  if (months < 12) return `${months}个月`

  return `${Math.floor(months / 12)}岁`
}

function dogGenderText(gender?: string): string {
  const map: Record<string, string> = {
    MALE: '弟弟',
    FEMALE: '妹妹',
  }
  return gender ? map[gender] || gender : '性别未知'
}

const factItems = computed(() => {
  const dog = selectedDog.value
  if (!dog) return []

  const mealsText = dog.mealsPerDay ? `${dog.mealsPerDay}餐` : '计算中'
  const dailyText = props.dailyIntakeG > 0 ? `${Math.round(props.dailyIntakeG)}g` : '计算中'
  const perMealText = props.perMealG > 0 ? `${Math.round(props.perMealG)}g` : '计算中'

  return [
    { label: '年龄', value: dogAgeText(dog) },
    { label: '性别', value: dogGenderText(dog.gender) },
    { label: '体重', value: dog.currentWeightKg ? `${dog.currentWeightKg}kg` : '未知' },
    { label: '每日餐次', value: mealsText },
    { label: '每日饭量', value: dailyText },
    { label: '每餐约', value: perMealText },
  ]
})
</script>

<style scoped>
.dog-context {
  width: 100%;
}

/* 选项卡 + 读数同属一只狗：同一个内嵌面板 + 分隔线，建立视觉归属 */
.dog-panel {
  padding: 16rpx;
  border-radius: 16rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
}

/* 详情页没有面板：胶囊直接铺在页面底色上 */
.dog-plain {
  padding: 0;
}

.dog-scroll {
  width: 100%;
  white-space: nowrap;
}

.dog-chip {
  width: 214rpx;
  min-height: 86rpx;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  margin-right: 14rpx;
  padding: 12rpx;
  border-radius: 8rpx;
  border: 2rpx solid #eef1e2;
  background-color: #fbfcf7;
  color: #26261f;
  vertical-align: middle;
}

.dog-chip.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.dog-avatar {
  flex: 0 0 auto;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  background-color: #eef2e4;
}

.dog-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.dog-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25rpx;
  font-weight: 800;
  color: #26261f;
}

/* 六项读数：没有格子底色、没有圆角，只用一条竖线分隔 —— 不是按钮 */
.dog-facts-wrap {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e5e8d4;
}

.dog-facts {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.dog-fact {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  min-width: 0;
  padding: 6rpx 10rpx;
  border-left: 2rpx solid #ccd3b4;
  line-height: 1.3;
}

.dog-fact--first {
  border-left: 0;
}

.dog-fact-label {
  font-size: 20rpx;
  color: #968f6d;
  white-space: nowrap;
}

.dog-fact-value {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 26rpx;
  font-weight: 700;
  color: #1e3a2f;
  white-space: nowrap;
}

.dog-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 21rpx;
  color: #b08d4f;
}

/* 状态：加载失败 / 没有档案 —— 三个页面同一套文案 */
.dog-state-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 24rpx;
  border-radius: 8rpx;
  background-color: #fbfcf7;
  border: 1rpx solid #e5e8d4;
}

.dog-state-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #26261f;
}

.dog-state-copy {
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.dog-state-button {
  display: inline-block;
  width: auto;
  margin-top: 20rpx;
  padding: 0 28rpx;
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #f3eddd;
  background-color: #1e3a2f;
}

.dog-state-button::after {
  border: none;
}

.dog-state-button--ghost {
  color: #6b6653;
  background-color: #fdfbf4;
  border: 1rpx solid #e4dcc2;
}

/* 读取中：两条胶囊 + 一条读数的骨架 */
.dog-skeleton--plain {
  padding: 0;
  border: 0;
  background-color: transparent;
}

.dog-skeleton {
  padding: 16rpx;
  border-radius: 16rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
}

.dog-skeleton-row {
  display: flex;
  gap: 14rpx;
  overflow: hidden;
}

.dog-skeleton-chip {
  flex: 0 0 214rpx;
  height: 86rpx;
  border-radius: 8rpx;
  background-color: #e9ecdd;
}

.dog-skeleton-line {
  width: 62%;
  height: 18rpx;
  margin-top: 24rpx;
  border-radius: 9rpx;
  background-color: #e9ecdd;
}
</style>
