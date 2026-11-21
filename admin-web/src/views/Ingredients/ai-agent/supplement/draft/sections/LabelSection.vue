<template>
  <section class="draft-section">
    <div class="draft-section__group">
      <h4 class="draft-section__title">标签分类与规范名</h4>
      <div class="draft-section__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>标签分类</span>
            <span
              v-if="isManual('label.labelCategory')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="label.labelCategory ?? undefined"
            placeholder="饲料原料 / 饲料添加剂"
            style="width: 100%"
            @update:model-value="(value: string) => updateCategory(value)"
          >
            <el-option label="饲料原料" value="FEED_MATERIAL" />
            <el-option label="饲料添加剂" value="FEED_ADDITIVE" />
          </el-select>
          <em class="draft-field__hint">
            两本目录只用来查规范名，不判断犬用适用范围。
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>添加时机</span>
            <span
              v-if="isManual('basic.addTiming')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="addTiming || undefined"
            placeholder="制作中 / 随餐"
            style="width: 100%"
            @update:model-value="(value: string) => updateAddTiming(value)"
          >
            <el-option label="制作中" value="BEFORE_MIXING" />
            <el-option label="随餐" value="BEFORE_MEAL" />
          </el-select>
          <em class="draft-field__hint">
            写入原料档案的添加时机，最终审核会按允许值再校验一次。
          </em>
        </label>
      </div>
    </div>

    <div class="draft-section__group">
      <h4 class="draft-section__title">标签名称与分类标签</h4>
      <div class="draft-section__grid">
        <label class="draft-field">
          <span class="draft-field__label">
            <span>标签名称（目录规范名）</span>
            <span
              v-if="isManual('label.labelNames')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="label.labelNames"
            multiple
            filterable
            allow-create
            :reserve-keyword="false"
            default-first-option
            placeholder="目录规范名由 AI 填入，可手改（输入后回车新增）"
            style="width: 100%"
            @update:model-value="(value: string[]) => updateLabelNames(value)"
          />
          <em class="draft-field__hint">
            目录规范名由 AI 填入，可手改；这里不判断犬用适用范围。没把握的名称请对照目录再确认。
          </em>
        </label>

        <label class="draft-field">
          <span class="draft-field__label">
            <span>标签分类标签</span>
            <span
              v-if="isManual('label.tagNames')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-select
            :model-value="label.tagNames"
            multiple
            filterable
            allow-create
            :reserve-keyword="false"
            default-first-option
            placeholder="如 矿物质 / 维生素（输入后回车新增）"
            style="width: 100%"
            @update:model-value="(value: string[]) => updateTagNames(value)"
          />
          <em class="draft-field__hint">
            按允许词表填写；AI 从标签里认出来的会先放在这里，最终审核会再核对。
          </em>
        </label>
      </div>

      <div class="draft-section__row" style="margin-top: 14px">
        <label class="draft-field" style="flex: 1">
          <span class="draft-field__label">
            <span>标签名称依据</span>
            <span
              v-if="isManual('label.labelNameSource')"
              class="draft-field__manual"
              title="你手动改过，AI 不会覆盖"
            >
              人改
            </span>
          </span>
          <el-input
            :model-value="label.labelNameSource"
            placeholder="为什么选这个规范名，如「目录中同名条目」"
            maxlength="300"
            @update:model-value="(value: string) => updateNameSource(value)"
          />
        </label>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * ③ 标签与合规（spec §12.3）。
 *
 * 只编辑草稿里的标签字段；目录/规范名候选由 AI 起草时查好写进草稿，
 * 这里不拉目录、也不显示/判断犬用适用范围（Global Constraints）。
 * 添加时机虽然落在 `basic.addTiming`，但按交互放在本区块，避免和其他
 * 标签字段分两处找。
 */
import { computed } from 'vue'
import type {
  SupplementDraftLabel,
  SupplementLabelCategory
} from '@/api/supplementDrafts'
import { isManualDraftPath } from '../supplementDraftState'

const props = defineProps<{
  /** 人改过的字段路径；用于显示「人改」标记 */
  manualFields?: string[]
  /** 只有人的输入事件才调用它（初始加载/AI 回写都不调用） */
  markManual?: (path: string) => void
}>()

const label = defineModel<SupplementDraftLabel>({ required: true })
const addTiming = defineModel<string>('addTiming', { required: true })

const manual = computed(() => props.manualFields ?? [])

function isManual(path: string): boolean {
  return isManualDraftPath(path, manual.value)
}

function updateCategory(value: string): void {
  props.markManual?.('label.labelCategory')
  label.value.labelCategory = value as SupplementLabelCategory
}

function updateLabelNames(value: string[]): void {
  props.markManual?.('label.labelNames')
  label.value.labelNames = value
}

function updateTagNames(value: string[]): void {
  props.markManual?.('label.tagNames')
  label.value.tagNames = value
}

function updateNameSource(value: string): void {
  props.markManual?.('label.labelNameSource')
  label.value.labelNameSource = value
}

function updateAddTiming(value: string): void {
  props.markManual?.('basic.addTiming')
  addTiming.value = value
}
</script>

<style scoped src="./draftSection.css"></style>
