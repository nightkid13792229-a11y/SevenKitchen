<template>
  <div class="cfct-source-review-panel">
    <div class="cfct-header">
      <div>
        <h3>CFCT OCR 审核入库</h3>
        <div class="cfct-subtitle">
          {{ rows.length ? `已载入 ${rows.length} 行，当前可入库 ${validRows.length} 行` : '等待载入结构化 CFCT 行' }}
        </div>
      </div>
      <div class="cfct-actions">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".json,application/json"
          :on-change="handleStructuredFileChange"
        >
          <el-button :icon="Upload">上传结构化 JSON</el-button>
        </el-upload>
        <el-button :icon="DocumentChecked" :disabled="!pastedJson.trim()" @click="handleParsePastedRows">
          解析文本
        </el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!importableRows.length"
          @click="handleImportReviewedRows"
        >
          导入已审核 CFCT
        </el-button>
      </div>
    </div>

    <div class="cfct-local-loader">
      <div class="cfct-local-copy">
        <strong>本地 CFCT 中间库</strong>
        <span>读取全量结构化结果，只载入审核队列，不会直接写入数据库。</span>
      </div>
      <div class="cfct-local-controls">
        <el-radio-group v-model="localLibraryQueue">
          <el-radio-button label="auto-ready">自动可用</el-radio-button>
          <el-radio-button label="needs-review">需复核</el-radio-button>
          <el-radio-button label="full">全部</el-radio-button>
        </el-radio-group>
        <el-button
          :icon="Refresh"
          :loading="loadingLocalLibrary"
          @click="handleLoadLocalLibrary"
        >
          载入本地中间库
        </el-button>
      </div>
    </div>

    <div v-if="localLibrary" class="cfct-local-summary">
      <el-tag type="info">当前队列 {{ localLibraryQueueLabel }}</el-tag>
      <el-tag>文件 {{ localLibrary.sourceFile }}</el-tag>
      <el-tag type="success">自动可用 {{ localLibrary.summary.autoReadyRows ?? '-' }}</el-tag>
      <el-tag type="warning">需复核 {{ localLibrary.summary.needsReviewRows ?? '-' }}</el-tag>
      <el-tag type="info">全量 {{ localLibrary.summary.totalRows ?? localLibrary.rowCount }}</el-tag>
    </div>

    <el-input
      v-model="pastedJson"
      class="cfct-json-input"
      type="textarea"
      :rows="4"
      placeholder="粘贴 cfct-ocr-structured.json 内容"
    />

    <div v-if="rows.length" class="cfct-summary">
      <el-tag type="info">全部 {{ rows.length }}</el-tag>
      <el-tag type="success">可入库 {{ validRows.length }}</el-tag>
      <el-tag type="info">结构完整 {{ structurallyValidRows.length }}</el-tag>
      <el-tag type="warning">需复核 {{ needsReviewCount }}</el-tag>
      <el-tag v-if="selectedRows.length" type="primary">已选择 {{ selectedRows.length }}</el-tag>
    </div>

    <el-table
      v-if="rows.length"
      :data="rows"
      row-key="clientId"
      border
      class="cfct-table"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="44" :selectable="isReviewedImportableRow" />
      <el-table-column type="expand" width="42">
        <template #default="{ row }">
          <div class="cfct-row-detail">
            <section
              v-for="group in reviewNutrientGroups(row)"
              :key="group.title"
              class="cfct-detail-section"
            >
              <div class="cfct-detail-title">{{ group.title }}</div>
              <div class="cfct-nutrient-grid">
                <label
                  v-for="item in group.items"
                  :key="`${item.source}-${item.key}`"
                  class="cfct-nutrient-field"
                >
                  <span>
                    {{ item.label }}
                    <small>{{ item.unit }}</small>
                  </span>
                  <el-input-number
                    :model-value="getReviewNutrientValue(row, item)"
                    :precision="3"
                    controls-position="right"
                    @update:model-value="setReviewNutrientValue(row, item, $event)"
                  />
                </label>
              </div>
            </section>

            <section class="cfct-detail-section">
              <div class="cfct-detail-title">OCR 来源</div>
              <div v-if="row.sourceSegments?.length" class="cfct-source-segments">
                <div
                  v-for="segment in row.sourceSegments"
                  :key="`${segment.kind}-${segment.page}-${segment.row}`"
                  class="cfct-source-segment"
                >
                  <div class="cfct-source-segment-meta">
                    <el-tag size="small" :type="segment.kind === 'PRIMARY' ? 'success' : 'info'">
                      {{ segment.kind === 'PRIMARY' ? '主表' : '续表' }}
                    </el-tag>
                    <span>p{{ segment.page }} / r{{ segment.row }}</span>
                    <span v-if="typeof segment.ocrConfidence === 'number'">
                      置信度 {{ segment.ocrConfidence.toFixed(3) }}
                    </span>
                  </div>
                  <pre>{{ segment.rawOcrText }}</pre>
                </div>
              </div>
              <pre v-else class="cfct-source-segment">{{ row.rawOcrText || '-' }}</pre>
            </section>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="150">
        <template #default="{ row }">
          <div class="source-cell">
            <span>{{ row.volume }}</span>
            <small>p{{ row.page }} / r{{ row.row }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="食物名称" min-width="180">
        <template #default="{ row }">
          <el-input v-model="row.foodName" />
        </template>
      </el-table-column>
      <el-table-column label="编码" width="120">
        <template #default="{ row }">
          <el-input v-model="row.foodCode" />
        </template>
      </el-table-column>
      <el-table-column label="食部%" width="110">
        <template #default="{ row }">
          <el-input-number
            v-model="row.ediblePortionPercent"
            :min="0"
            :max="100"
            :precision="1"
            controls-position="right"
          />
        </template>
      </el-table-column>
      <el-table-column label="能量" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'energyKcal')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'energyKcal', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="水分" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'moisture')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'moisture', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="蛋白质" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'crudeProtein')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'crudeProtein', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="脂肪" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'crudeFat')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'crudeFat', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="碳水" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'carbohydrate')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'carbohydrate', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="纤维" width="115">
        <template #default="{ row }">
          <el-input-number
            :model-value="getNutrient(row, 'insolubleFiber')"
            :precision="3"
            controls-position="right"
            @update:model-value="setNutrient(row, 'insolubleFiber', $event)"
          />
        </template>
      </el-table-column>
      <el-table-column label="质量" width="170">
        <template #default="{ row }">
          <div class="quality-cell">
            <el-tag :type="isReviewedImportableRow(row) ? 'success' : 'warning'">
              {{ row.reviewStatus || '已审核' }}
            </el-tag>
            <small v-if="row.qualityFlags?.length">{{ row.qualityFlags.join(' / ') }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="116" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!isReviewedImportableRow(row) && isStructurallyImportableRow(row)"
            link
            type="primary"
            @click="markRowReviewed(row)"
          >
            标记已审核
          </el-button>
          <el-button link type="danger" @click="removeRow(row.clientId)">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="暂无 CFCT 审核行" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UploadFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DocumentChecked, Refresh, Upload } from '@element-plus/icons-vue'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import type {
  CfctLocalStructuredLibrary,
  CfctLocalStructuredLibraryQueue,
  CfctReviewedSourceRow
} from '@/types/nutritionGovernance'

interface EditableCfctRow extends CfctReviewedSourceRow {
  clientId: string
}

const emit = defineEmits<{
  imported: []
}>()

const rows = ref<EditableCfctRow[]>([])
const selectedRows = ref<EditableCfctRow[]>([])
const pastedJson = ref('')
const importing = ref(false)
const loadingLocalLibrary = ref(false)
const localLibraryQueue = ref<CfctLocalStructuredLibraryQueue>('auto-ready')
const localLibrary = ref<CfctLocalStructuredLibrary | null>(null)

const validRows = computed(() => rows.value.filter(isReviewedImportableRow))
const structurallyValidRows = computed(() => rows.value.filter(isStructurallyImportableRow))
const importableRows = computed(() => (
  selectedRows.value.length
    ? selectedRows.value.filter(isReviewedImportableRow)
    : validRows.value
))
const needsReviewCount = computed(() => (
  rows.value.filter((row) => !isReviewedImportableRow(row)).length
))
const localLibraryQueueLabel = computed(() => {
  if (localLibraryQueue.value === 'auto-ready') return '自动可用'
  if (localLibraryQueue.value === 'needs-review') return '需复核'
  return '全部'
})

const nutrientGroups = [
  {
    kind: 'macros',
    title: '宏量营养',
    items: [
      { key: 'energyKcal', label: '能量 (Energy)', unit: 'kcal' },
      { key: 'moisture', label: '水分 (Moisture)', unit: 'g' },
      { key: 'crudeProtein', label: '蛋白质 (Protein)', unit: 'g' },
      { key: 'crudeFat', label: '脂肪 (Fat)', unit: 'g' },
      { key: 'ash', label: '灰分 (Ash)', unit: 'g' },
      { key: 'carbohydrate', label: '碳水化合物 (Carbohydrate)', unit: 'g' },
      { key: 'fiber', label: '总膳食纤维 (Total dietary fiber)', unit: 'g' },
      { key: 'insolubleFiber', label: '不溶性纤维 (Insoluble fiber)', unit: 'g' }
    ]
  },
  {
    kind: 'minerals',
    title: '矿物质',
    items: [
      { key: 'calcium', label: '钙 (Calcium)', unit: 'mg' },
      { key: 'phosphorus', label: '磷 (Phosphorus)', unit: 'mg' },
      { key: 'potassium', label: '钾 (Potassium)', unit: 'mg' },
      { key: 'sodium', label: '钠 (Sodium)', unit: 'mg' },
      { key: 'magnesium', label: '镁 (Magnesium)', unit: 'mg' },
      { key: 'iron', label: '铁 (Iron)', unit: 'mg' },
      { key: 'zinc', label: '锌 (Zinc)', unit: 'mg' },
      { key: 'selenium', label: '硒 (Selenium)', unit: 'μg' },
      { key: 'copper', label: '铜 (Copper)', unit: 'mg' },
      { key: 'manganese', label: '锰 (Manganese)', unit: 'mg' },
      { key: 'iodine', label: '碘 (Iodine)', unit: 'μg' }
    ]
  },
  {
    kind: 'vitamins',
    title: '维生素',
    items: [
      { key: 'vitaminA', label: '维生素 A (Vitamin A)', unit: 'IU' },
      { key: 'vitaminD', label: '维生素 D (Vitamin D)', unit: 'IU' },
      { key: 'vitaminE', label: '维生素 E (Vitamin E)', unit: 'IU' },
      { key: 'vitaminK', label: '维生素 K (Vitamin K)', unit: 'μg' },
      { key: 'vitaminB1', label: '维生素 B1 (Thiamin)', unit: 'mg' },
      { key: 'vitaminB2', label: '维生素 B2 (Riboflavin)', unit: 'mg' },
      { key: 'vitaminB3', label: '维生素 B3 (Niacin)', unit: 'mg' },
      { key: 'vitaminB5', label: '维生素 B5 (Pantothenic acid)', unit: 'mg' },
      { key: 'vitaminB6', label: '维生素 B6 (Pyridoxine)', unit: 'mg' },
      { key: 'vitaminB7', label: '维生素 B7 (Biotin)', unit: 'μg' },
      { key: 'vitaminB9', label: '维生素 B9 (Folate)', unit: 'μg' },
      { key: 'vitaminB12', label: '维生素 B12 (Cobalamin)', unit: 'μg' },
      { key: 'choline', label: '胆碱 (Choline)', unit: 'mg' },
      { key: 'vitaminC', label: '维生素 C (Vitamin C)', unit: 'mg' }
    ]
  },
  {
    kind: 'amino-acids',
    title: '氨基酸',
    items: [
      { key: 'arginine', label: '精氨酸 (Arginine)', unit: 'g' },
      { key: 'lysine', label: '赖氨酸 (Lysine)', unit: 'g' },
      { key: 'methionine', label: '蛋氨酸 (Methionine)', unit: 'g' },
      { key: 'cystine', label: '胱氨酸 (Cystine)', unit: 'g' },
      { key: 'taurine', label: '牛磺酸 (Taurine)', unit: 'g' },
      { key: 'tryptophan', label: '色氨酸 (Tryptophan)', unit: 'g' },
      { key: 'threonine', label: '苏氨酸 (Threonine)', unit: 'g' },
      { key: 'leucine', label: '亮氨酸 (Leucine)', unit: 'g' },
      { key: 'isoleucine', label: '异亮氨酸 (Isoleucine)', unit: 'g' },
      { key: 'valine', label: '缬氨酸 (Valine)', unit: 'g' },
      { key: 'phenylalanine', label: '苯丙氨酸 (Phenylalanine)', unit: 'g' },
      { key: 'tyrosine', label: '酪氨酸 (Tyrosine)', unit: 'g' },
      { key: 'histidine', label: '组氨酸 (Histidine)', unit: 'g' },
      { key: 'glutamicAcid', label: '谷氨酸 (Glutamic acid)', unit: 'g' },
      { key: 'glycine', label: '甘氨酸 (Glycine)', unit: 'g' },
      { key: 'proline', label: '脯氨酸 (Proline)', unit: 'g' }
    ]
  },
  {
    kind: 'fatty-acids',
    title: '脂肪酸',
    items: [
      { key: 'saturatedFattyAcids', label: '饱和脂肪酸 (Saturated fatty acids)', unit: 'g' },
      { key: 'monounsaturatedFattyAcids', label: '单不饱和脂肪酸 (Monounsaturated fatty acids)', unit: 'g' },
      { key: 'polyunsaturatedFattyAcids', label: '多不饱和脂肪酸 (Polyunsaturated fatty acids)', unit: 'g' },
      { key: 'linoleicAcid', label: '亚油酸 (Linoleic acid)', unit: 'g' },
      { key: 'alphaLinolenicAcid', label: 'α-亚麻酸 (Alpha-linolenic acid)', unit: 'g' },
      { key: 'arachidonicAcid', label: '花生四烯酸 (Arachidonic acid)', unit: 'g' },
      { key: 'epa', label: 'EPA', unit: 'mg' },
      { key: 'dpa', label: 'DPA', unit: 'mg' },
      { key: 'dha', label: 'DHA', unit: 'mg' }
    ]
  }
] as const

const extraNutrientGroupDefinitions = [
  { kind: 'minerals', title: '矿物质' },
  { kind: 'vitamins', title: '维生素' },
  { kind: 'amino-acids', title: '氨基酸' },
  { kind: 'fatty-acids', title: '脂肪酸' },
  { kind: 'other', title: '其他营养素' },
  { kind: 'uncategorized', title: '待分类' }
] as const

type ExtraNutrientGroupKind = (typeof extraNutrientGroupDefinitions)[number]['kind']

const extraNutrientLabels: Record<string, { label: string; unit: string }> = {
  cfctVitaminATotalUg: { label: '总维生素 A (Total vitamin A)', unit: 'μg' },
  cfctCaroteneUg: { label: '胡萝卜素 (Carotene)', unit: 'μg' },
  cfctRetinolUg: { label: '视黄醇 (Retinol)', unit: 'μg' },
  cfctVitaminETotalAlphaEquivalentMg: { label: '维生素 E 总 α 当量 (Vitamin E, total alpha equivalent)', unit: 'mg' },
  cfctVitaminEAlphaTocopherolMg: { label: 'α-生育酚 (Alpha-tocopherol)', unit: 'mg' },
  cfctVitaminEBetaGammaTocopherolMg: { label: 'β+γ-生育酚 (Beta + gamma tocopherol)', unit: 'mg' },
  cfctVitaminEDeltaTocopherolMg: { label: 'δ-生育酚 (Delta-tocopherol)', unit: 'mg' },
  cfctFolateUg: { label: '叶酸 (Folate)', unit: 'μg' },
  cfctFreeCholineMg: { label: '游离胆碱 (Free choline)', unit: 'mg' },
  cfctGpcMg: { label: '甘油磷酸胆碱 (Glycerophosphocholine)', unit: 'mg' },
  cfctPchoMg: { label: '磷酸胆碱 (Phosphocholine)', unit: 'mg' },
  cfctPtdchoMg: { label: '磷脂酰胆碱 (Phosphatidylcholine)', unit: 'mg' },
  cfctSmMg: { label: '鞘磷脂 (Sphingomyelin)', unit: 'mg' },
  cfctBetaineMg: { label: '甜菜碱 (Betaine)', unit: 'mg' },
  cfctAminoAcidWaterG: { label: '氨基酸表水分 (Amino acid table water)', unit: 'g' },
  cfctAminoAcidProteinG: { label: '氨基酸表蛋白质 (Amino acid table protein)', unit: 'g' },
  cfctSulfurAminoAcidsTotalMg: { label: '含硫氨基酸合计 (Total sulfur amino acids)', unit: 'mg' },
  cfctAromaticAminoAcidsTotalMg: { label: '芳香族氨基酸合计 (Total aromatic amino acids)', unit: 'mg' },
  cfctAlanineMg: { label: '丙氨酸 (Alanine)', unit: 'mg' },
  cfctAsparticAcidMg: { label: '天冬氨酸 (Aspartic acid)', unit: 'mg' },
  cfctSerineMg: { label: '丝氨酸 (Serine)', unit: 'mg' },
  cfctFatG: { label: '脂肪酸表脂肪 (Fat in fatty acid table)', unit: 'g' },
  cfctFattyAcidTotalG: { label: '脂肪酸总量 (Total fatty acids)', unit: 'g' },
  cfctUnknownFattyAcidsG: { label: '未明脂肪酸 (Unknown fatty acids)', unit: 'g' },
  cfctSaturatedFattyAcidsPercentOfTotal: { label: '饱和脂肪酸占比 (Saturated fatty acids percent)', unit: '%' },
  cfctMonounsaturatedFattyAcidsPercentOfTotal: { label: '单不饱和脂肪酸占比 (Monounsaturated fatty acids percent)', unit: '%' },
  cfctPolyunsaturatedFattyAcidsPercentOfTotal: { label: '多不饱和脂肪酸占比 (Polyunsaturated fatty acids percent)', unit: '%' },
  cfctDhaEpaTotalMg: { label: 'DHA+EPA 合计 (DHA + EPA total)', unit: 'mg' },
  cfctDhaEpaPercentOfTotalFattyAcids: { label: 'DHA+EPA 占脂肪酸比 (DHA + EPA percent)', unit: '%' },
  cfctDhaPercentOfTotalFattyAcids: { label: 'DHA 占脂肪酸比 (DHA percent)', unit: '%' },
  cfctEpaPercentOfTotalFattyAcids: { label: 'EPA 占脂肪酸比 (EPA percent)', unit: '%' },
  cfctIodineUg: { label: '碘 (Iodine)', unit: 'μg' },
  cfctCholesterolMg: { label: '胆固醇 (Cholesterol)', unit: 'mg' },
  cfctPurineTotalMg: { label: '嘌呤总量 (Total purines)', unit: 'mg' },
  cfctSequenceNumber: { label: '序号 (Sequence number)', unit: '' },
  cfctSpecialRowCode: { label: '特殊行编码 (Special row code)', unit: '' },
  cfctUsdaCholineSourceRow: { label: 'USDA 胆碱来源行 (USDA choline source row)', unit: '' }
}

async function handleStructuredFileChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) return

  try {
    loadRowsFromText(await uploadFile.raw.text())
    localLibrary.value = null
    ElMessage.success('CFCT 结构化文件已载入')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'CFCT 文件解析失败')
  }
}

function handleParsePastedRows() {
  try {
    loadRowsFromText(pastedJson.value)
    localLibrary.value = null
    ElMessage.success('CFCT 文本已解析')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'CFCT 文本解析失败')
  }
}

async function handleLoadLocalLibrary() {
  if (loadingLocalLibrary.value) return

  loadingLocalLibrary.value = true
  try {
    const library = await nutritionGovernanceApi.getLocalCfctStructuredLibrary(
      localLibraryQueue.value
    )
    localLibrary.value = library
    loadRowsFromSourceRows(library.rows)
    ElMessage.success(`已载入 ${library.rowCount} 条 CFCT ${localLibraryQueueLabel.value}队列`)
  } catch (error) {
    ElMessage.error('本地 CFCT 中间库载入失败')
  } finally {
    loadingLocalLibrary.value = false
  }
}

function loadRowsFromText(content: string) {
  const parsed = JSON.parse(content)
  const sourceRows = Array.isArray(parsed) ? parsed : parsed?.rows
  if (!Array.isArray(sourceRows)) {
    throw new Error('JSON 必须是数组，或包含 rows 数组')
  }

  loadRowsFromSourceRows(sourceRows)
}

function loadRowsFromSourceRows(sourceRows: Array<Partial<CfctReviewedSourceRow>>) {
  rows.value = sourceRows.map((row, index) => normalizeRow(row, index))
  selectedRows.value = []
}

function normalizeRow(row: Partial<CfctReviewedSourceRow>, index: number): EditableCfctRow {
  return {
    clientId: `${row.volume || 'cfct'}-${row.page || 'p'}-${row.row || index}-${index}`,
    volume: String(row.volume || ''),
    page: row.page ?? '',
    row: row.row ?? index + 1,
    foodName: String(row.foodName || ''),
    category: row.category ?? null,
    foodCode: row.foodCode ?? null,
    ediblePortionPercent: toNullableNumber(row.ediblePortionPercent),
    energyKj: toNullableNumber(row.energyKj),
    nutrients: { ...(row.nutrients || {}) },
    sourcePdf: row.sourcePdf,
    ocrPage: row.ocrPage,
    ocrLine: row.ocrLine,
    rawOcrText: row.rawOcrText,
    ocrConfidence: toNullableNumber(row.ocrConfidence) ?? undefined,
    qualityFlags: Array.isArray(row.qualityFlags) ? row.qualityFlags : [],
    reviewStatus: row.reviewStatus || 'AUTO_STRUCTURED',
    sourceSegments: Array.isArray(row.sourceSegments) ? row.sourceSegments : [],
    unmappedNutrients: { ...(row.unmappedNutrients || {}) }
  }
}

function handleSelectionChange(selection: EditableCfctRow[]) {
  selectedRows.value = selection
}

function getNutrient(row: EditableCfctRow, key: string): number | undefined {
  const value = row.nutrients?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function setNutrient(row: EditableCfctRow, key: string, value: number | undefined) {
  row.nutrients = {
    ...row.nutrients,
    [key]: typeof value === 'number' && Number.isFinite(value) ? value : null
  }
}

function setUnmappedNutrient(row: EditableCfctRow, key: string, value: number | undefined) {
  row.unmappedNutrients = {
    ...(row.unmappedNutrients || {}),
    [key]: typeof value === 'number' && Number.isFinite(value) ? value : null
  }
}

function extraNutrientEntries(row: EditableCfctRow) {
  return Object.entries(row.unmappedNutrients || {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([key, value]) => ({
      key,
      value: value as number,
      label: extraNutrientLabels[key]?.label || key,
      unit: extraNutrientLabels[key]?.unit || '',
      groupKind: classifyExtraNutrientKey(key),
      source: 'extra' as const
    }))
}

function reviewNutrientGroups(row: EditableCfctRow) {
  const entries = extraNutrientEntries(row)
  const knownGroupKinds = new Set<string>(nutrientGroups.map((group) => group.kind))
  const coreGroups = nutrientGroups.map((group) => ({
    title: group.title,
    items: [
      ...group.items.map((item) => ({
        ...item,
        source: 'mapped' as const
      })),
      ...entries.filter((entry) => entry.groupKind === group.kind)
    ]
  }))
  const overflowGroups = extraNutrientGroupDefinitions
    .filter((group) => !knownGroupKinds.has(group.kind))
    .map((group) => ({
      title: group.title,
      items: entries.filter((entry) => entry.groupKind === group.kind)
    }))
    .filter((group) => group.items.length > 0)

  return [...coreGroups, ...overflowGroups]
}

type ReviewNutrientItem = ReturnType<typeof reviewNutrientGroups>[number]['items'][number]

function getReviewNutrientValue(row: EditableCfctRow, item: ReviewNutrientItem): number | undefined {
  if (item.source === 'extra') {
    const value = row.unmappedNutrients?.[item.key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  return getNutrient(row, item.key)
}

function setReviewNutrientValue(row: EditableCfctRow, item: ReviewNutrientItem, value: number | undefined) {
  if (item.source === 'extra') {
    setUnmappedNutrient(row, item.key, value)
    return
  }
  setNutrient(row, item.key, value)
}

function classifyExtraNutrientKey(key: string): ExtraNutrientGroupKind {
  if (/Vitamin|Folate|Choline|Betaine|Gpc|Pcho|Ptdcho|Sm/u.test(key)) {
    return 'vitamins'
  }
  if (/AminoAcid|Alanine|AsparticAcid|Serine|Sulfur|Aromatic/u.test(key)) {
    return 'amino-acids'
  }
  if (/FattyAcid|Dha|Epa|FatG/u.test(key)) {
    return 'fatty-acids'
  }
  if (/Iodine/u.test(key)) {
    return 'minerals'
  }
  if (/Cholesterol|Purine|SequenceNumber|SpecialRowCode|UsdaCholineSourceRow/u.test(key)) {
    return 'other'
  }
  return 'uncategorized'
}

function markRowReviewed(row: EditableCfctRow) {
  row.reviewStatus = 'REVIEWED'
  row.qualityFlags = []
  ElMessage.success(`${row.foodName || '当前行'} 已标记为可入库`)
}

function removeRow(clientId: string) {
  rows.value = rows.value.filter((row) => row.clientId !== clientId)
  selectedRows.value = selectedRows.value.filter((row) => row.clientId !== clientId)
}

async function handleImportReviewedRows() {
  const nextRows = importableRows.value.map(stripClientFields)
  if (!nextRows.length || importing.value) return

  importing.value = true
  try {
    await ElMessageBox.confirm(
      `确认导入 ${nextRows.length} 条 CFCT 来源行吗？`,
      '导入已审核 CFCT',
      {
        type: 'warning',
        confirmButtonText: '确认导入',
        cancelButtonText: '取消'
      }
    )
  } catch {
    importing.value = false
    return
  }

  try {
    const result = await nutritionGovernanceApi.importReviewedCfctRows({ rows: nextRows })
    ElMessage.success(`已导入 ${result.importedCount} 条 CFCT 来源`)
    rows.value = rows.value.filter(
      (row) => !nextRows.some((importedRow) => isSameSourceRow(row, importedRow))
    )
    selectedRows.value = []
    emit('imported')
  } catch (error) {
    ElMessage.error('CFCT 来源导入失败')
  } finally {
    importing.value = false
  }
}

function stripClientFields(row: EditableCfctRow): CfctReviewedSourceRow {
  const { clientId: _clientId, ...rest } = row
  return rest
}

function isSameSourceRow(row: CfctReviewedSourceRow, other: CfctReviewedSourceRow): boolean {
  return row.volume === other.volume && String(row.page) === String(other.page) && String(row.row) === String(other.row)
}

function isStructurallyImportableRow(row: CfctReviewedSourceRow): boolean {
  return Boolean(
    String(row.volume || '').trim() &&
    String(row.page ?? '').trim() &&
    String(row.row ?? '').trim() &&
    String(row.foodName || '').trim() &&
    row.nutrients &&
    Object.values(row.nutrients).some((value) => typeof value === 'number' && Number.isFinite(value))
  )
}

function isReviewedImportableRow(row: CfctReviewedSourceRow): boolean {
  if (!isStructurallyImportableRow(row)) return false
  if (row.reviewStatus === 'NEEDS_REVIEW') return false
  if (row.qualityFlags?.length !== 0) return false
  return true
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
</script>

<style scoped>
.cfct-source-review-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cfct-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cfct-header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
  line-height: 24px;
}

.cfct-subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}

.cfct-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.cfct-local-loader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #f8fafc;
}

.cfct-local-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cfct-local-copy strong {
  color: #303133;
  font-size: 14px;
  line-height: 20px;
}

.cfct-local-copy span {
  color: #909399;
  font-size: 13px;
  line-height: 18px;
}

.cfct-local-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.cfct-json-input :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cfct-summary,
.cfct-local-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cfct-table {
  width: 100%;
}

.source-cell,
.quality-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-cell small,
.quality-cell small {
  color: #909399;
  line-height: 16px;
}

.cfct-table :deep(.el-input-number) {
  width: 100%;
}

.cfct-row-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 16px 16px;
  background: #f8fafc;
}

.cfct-detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cfct-detail-title {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.cfct-nutrient-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}

.cfct-nutrient-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
}

.cfct-nutrient-field span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: #606266;
  font-size: 13px;
  line-height: 18px;
}

.cfct-nutrient-field small {
  color: #a8abb2;
  font-size: 12px;
}

.cfct-source-segments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cfct-source-segment {
  margin: 0;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
  color: #606266;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

.cfct-source-segment-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
  color: #909399;
  font-family: initial;
  font-size: 12px;
}

.cfct-source-segment pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
