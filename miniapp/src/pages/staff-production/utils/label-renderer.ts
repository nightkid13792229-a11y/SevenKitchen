/**
 * 标签Canvas渲染器
 * 负责在Canvas上绘制产品标签（70mm × 100mm）
 * 使用统一配置，确保预览和打印完全一致
 */

import JCAPI from './jcing-sdk/JCAPI';
import { getLifeStageLabel, getHealthTagLabel, getNutritionStandardLabel } from '../../../utils/label-mapping';
import { LABEL_LAYOUT, LABEL_ELEMENTS, mmToPx } from './label-config';
import { calculateSupplementAmountForProduction } from '../../../utils/supplement-nutrients';

// Canvas尺寸：70mm × 100mm @ 8像素/mm = 560 × 800 像素
const CANVAS_WIDTH = mmToPx(LABEL_LAYOUT.canvas.width);  // 560px
const CANVAS_HEIGHT = mmToPx(LABEL_LAYOUT.canvas.height); // 800px

export interface LabelData {
  // 品牌信息
  brandName: string;

  // 产品信息
  recipeName: string;
  nutritionStandard: string;
  lifeStages: string[];
  healthTags: string[];
  dogName: string;

  // 原料信息（用顿号分隔的字符串）
  foodIngredients: string;
  supplementIngredients: string;

  // 订购信息
  weightPerPack: number;
  packageCount: number;
  totalWeight: number;
  packagePlan?: Array<{
    packageSpecG: number;
    packageCount: number;
  }>;

  // 营养成分分析
  nutritionAnalysis?: {
    proteinPercent?: number;
    fatPercent?: number;
    ashPercent?: number;
    moisturePercent?: number;
    crudeFiberPercent?: number;
    carbohydratePercent?: number;
    energyDensityKcalPerKg?: number;
    calciumPhosphorusRatio?: string;
  };

  // 储存与烹饪
  shelfLife: string;
  cookingMethod: {
    steam: string;
    stew: string;
    sousvide: string;
  };

  // 制作时间
  productionTime: string;

  // 排版配置
  layoutConfig?: {
    titleFontSize: number;
    bodyFontSize: number;
    smallFontSize: number;
    showNutrition: boolean;
    showCooking: boolean;
    showShelfLife: boolean;
    showBrand: boolean;
  };
}

export function buildCompleteNutritionItems(
  nutritionAnalysis?: LabelData['nutritionAnalysis']
): string[] {
  if (!nutritionAnalysis) {
    return [];
  }

  const na = nutritionAnalysis;
  return [
    na.proteinPercent !== undefined ? `蛋白质 ${na.proteinPercent.toFixed(1)}%` : null,
    na.fatPercent !== undefined ? `脂肪 ${na.fatPercent.toFixed(1)}%` : null,
    na.ashPercent !== undefined ? `灰分 ${na.ashPercent.toFixed(1)}%` : null,
    na.moisturePercent !== undefined ? `水分 ${na.moisturePercent.toFixed(1)}%` : null,
    na.crudeFiberPercent !== undefined ? `纤维 ${na.crudeFiberPercent.toFixed(1)}%` : null,
    na.carbohydratePercent !== undefined ? `碳水 ${na.carbohydratePercent.toFixed(1)}%` : null,
    na.energyDensityKcalPerKg ? `能量 ${na.energyDensityKcalPerKg}kcal/kg` : null,
    na.calciumPhosphorusRatio ? `钙磷比 ${na.calciumPhosphorusRatio}` : null,
  ].filter((item): item is string => Boolean(item));
}

function normalizePackagePlanRows(
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
): Array<{ packageSpecG: number; packageCount: number }> {
  return (packagePlan || [])
    .map((row) => {
      const packageSpecG = Math.floor(Number(row?.packageSpecG));
      const packageCount = Math.floor(Number(row?.packageCount));
      if (!Number.isFinite(packageSpecG) || !Number.isFinite(packageCount) || packageSpecG <= 0 || packageCount <= 0) {
        return null;
      }
      return { packageSpecG, packageCount };
    })
    .filter((row): row is { packageSpecG: number; packageCount: number } => row !== null);
}

function getOrderInfoLines(labelData: LabelData): string[] {
  const packagePlanRows = normalizePackagePlanRows(labelData.packagePlan);
  if (packagePlanRows.length > 0) {
    const packagePlanText = packagePlanRows
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('、');
    return splitTextBySeparators(packagePlanText, 28);
  }

  return [`${labelData.weightPerPack}g × ${labelData.packageCount}袋  总净重${labelData.totalWeight}g`];
}

/**
 * 测量标签绘制后的总高度（不实际输出）
 * @param ctx Canvas上下文
 * @param labelData 标签数据
 * @returns 最终的Y坐标（像素）
 */
function measureLabelHeight(ctx: any, labelData: LabelData): number {
  const centerX = CANVAS_WIDTH / 2;
  const margin = mmToPx(LABEL_LAYOUT.margin.left);
  let y = mmToPx(LABEL_ELEMENTS.recipeName.yOffset);

  // 模拟绘制所有内容，只计算Y坐标，不实际输出
  // 1. 食谱名称
  y += mmToPx(LABEL_ELEMENTS.recipeName.lineHeight);

  // 2. 制作信息
  y += mmToPx(LABEL_ELEMENTS.productionInfo.lineHeight);
  y += getOrderInfoLines(labelData).length * mmToPx(LABEL_ELEMENTS.productionInfo.lineHeight);
  y += mmToPx(LABEL_LAYOUT.lineHeight.loose);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 3. 原料表（左对齐，外框线）
  y += mmToPx(LABEL_ELEMENTS.ingredientsTitle.lineHeight);
  const allIngredients = [labelData.foodIngredients, labelData.supplementIngredients].filter(Boolean).join('、');
  const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
  y += ingredientLines.length * mmToPx(LABEL_ELEMENTS.ingredientsContent.lineHeight);
  y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 4. 营养成分分析（分组展示）
  if (labelData.nutritionAnalysis) {
    y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
    // 6项基础营养成分（2行）
    y += 2 * mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
    y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
    // 能量和钙磷比（1行）
    const na = labelData.nutritionAnalysis;
    if (na.energyDensityKcalPerKg || na.calciumPhosphorusRatio) {
      y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
    }
    y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
  }

  // 5. 保质期
  y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight) * 2;
  y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 烹饪建议不在这套旧画布里：2026-11-03 起生产标签走服务端出图，
  // 口径见 backend/src/application/cooking/cooking-time.ts（唯一真源）。

  return y;
}

/**
 * 绘制产品标签（用于预览，与精臣SDK打印保持一致）
 * @param canvasId Canvas组件ID
 * @param ctx Canvas上下文
 * @param labelData 标签数据
 * @param component Vue组件实例(可选,用于Canvas操作)
 * @returns Promise<string> 返回临时图片路径
 */
export async function drawProductionLabel(
  canvasId: string,
  ctx: any,
  labelData: LabelData,
  component?: any
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      console.log('[LabelRenderer] 开始绘制标签（使用统一配置 - 热敏打印机优化版）');

      // 1. 清空画布并填充白色背景(重复清空确保干净)
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.draw();  // 立即执行清空操作
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. 测量内容高度，计算缩放比例
      const measuredHeight = measureLabelHeight(ctx, labelData);
      const availableHeight = mmToPx(92); // 可用内容高度 92mm
      const bottomReserve = mmToPx(6); // 底部品牌预留空间

      console.log('[LabelRenderer] 测量高度:', Math.round(measuredHeight), 'px, 可用:', availableHeight, 'px');

      let scale = 1.0;
      if (measuredHeight + bottomReserve > availableHeight) {
        // 内容溢出，需要缩放
        scale = (availableHeight - bottomReserve) / measuredHeight;
        // 限制最小缩放比例 0.85，避免字体过小
        scale = Math.max(scale, 0.85);
        console.log('[LabelRenderer] ⚠️ 内容溢出，启用缩放模式，缩放比例:', scale.toFixed(2));
      } else {
        console.log('[LabelRenderer] ✓ 内容高度正常，无需缩放');
      }

      // 3. 应用缩放变换
      ctx.save();
      if (scale !== 1.0) {
        ctx.scale(scale, scale);
      }

      // 4. 计算缩放后的起始Y坐标（保持垂直居中）
      const centerY = (availableHeight - (availableHeight - bottomReserve) * scale) / 2;
      let y = centerY + (mmToPx(LABEL_ELEMENTS.recipeName.yOffset) - centerY) * scale;

      // 使用统一配置：将mm转换为px
      const centerX = CANVAS_WIDTH / 2;
      const margin = mmToPx(LABEL_LAYOUT.margin.left);

      // ============= 0. 顶部品牌名称（紧贴标签纸最上方） =============
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.brandTop.fontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText(labelData.brandName, centerX, mmToPx(LABEL_ELEMENTS.brandTop.yOffset));
      y = mmToPx(LABEL_ELEMENTS.brandTop.yOffset) + mmToPx(LABEL_ELEMENTS.brandTop.lineHeight);

      // 分隔线已移除，增加间距避免内容太靠上
      y += mmToPx(7);  // 增加 7mm 间距，确保不遮挡品牌名称

      // ============= 1. 食谱名称（主标题，加粗） =============
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.recipeName.fontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      // 注意：Canvas API 不直接支持 bold，使用 fontSize 模拟加粗效果
      ctx.fillText(labelData.recipeName, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.recipeName.lineHeight);

      // ============= 2. 制作信息 =============
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.productionInfo.fontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText(`为"${labelData.dogName}"制作于${labelData.productionTime}`, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.productionInfo.lineHeight);

      // 订购信息
      const orderInfoLines = getOrderInfoLines(labelData);
      orderInfoLines.forEach((line) => {
        ctx.fillText(line, centerX, y);
        y += mmToPx(LABEL_ELEMENTS.productionInfo.lineHeight);
      });

      y += mmToPx(LABEL_LAYOUT.lineHeight.loose);

      // 粗分隔线已移除
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // ============= 3. 原料表（居中展示，无框线） =============
      // 标题
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.ingredientsTitle.fontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      const ingredientsTitleText = '原料表';
      ctx.fillText(ingredientsTitleText, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.ingredientsTitle.lineHeight);

      // 组合食材和补剂
      let allIngredients = '';
      if (labelData.foodIngredients) {
        allIngredients += labelData.foodIngredients;
      }
      if (labelData.supplementIngredients) {
        if (allIngredients) {
          allIngredients += '、' + labelData.supplementIngredients;
        } else {
          allIngredients += labelData.supplementIngredients;
        }
      }

      // 使用智能换行（按顿号分割，避免单词截断）
      const ingredientLines = splitTextBySeparators(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);

      // 绘制每行内容（居中对齐）
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.ingredientsContent.fontSize));
      ctx.setFillStyle('#333333');
      ctx.setTextAlign('center');

      ingredientLines.forEach((line) => {
        ctx.fillText(line, centerX, y);
        y += mmToPx(LABEL_ELEMENTS.ingredientsContent.lineHeight);
      });

      y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // ============= 4. 营养成分分析（无框线，显示占比） =============
      if (labelData.nutritionAnalysis) {
        const na = labelData.nutritionAnalysis;

        // 标题
        ctx.setFontSize(mmToPx(LABEL_ELEMENTS.nutrition.titleFontSize));
        ctx.setFillStyle('#000000');
        ctx.setTextAlign('center');
        const nutritionTitleText = '营养成分分析';
        ctx.fillText(nutritionTitleText, centerX, y);
        y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);

        // 前6项基础营养成分（包含名称和占比）
        const basicNutrition = [
          na.proteinPercent !== undefined ? `蛋白质 ${na.proteinPercent.toFixed(1)}%` : null,
          na.fatPercent !== undefined ? `脂肪 ${na.fatPercent.toFixed(1)}%` : null,
          na.ashPercent !== undefined ? `灰分 ${na.ashPercent.toFixed(1)}%` : null,
          na.moisturePercent !== undefined ? `含水量 ${na.moisturePercent.toFixed(1)}%` : null,
          na.crudeFiberPercent !== undefined ? `纤维 ${na.crudeFiberPercent.toFixed(1)}%` : null,
          na.carbohydratePercent !== undefined ? `碳水 ${na.carbohydratePercent.toFixed(1)}%` : null,
        ].filter(Boolean);

        // 能量和钙磷比
        const energyText = na.energyDensityKcalPerKg ? `能量 ${na.energyDensityKcalPerKg}kcal/kg` : null;
        const caPRatioText = na.calciumPhosphorusRatio ? `钙磷比 ${na.calciumPhosphorusRatio}:1` : null;

        // 绘制6项基础营养成分（每行3个，共2行）
        ctx.setFontSize(mmToPx(LABEL_ELEMENTS.nutrition.contentFontSize));
        ctx.setFillStyle('#000000');
        ctx.setTextAlign('center');

        const tableLeft = margin;
        const tableRight = CANVAS_WIDTH - margin;
        const tableWidth = tableRight - tableLeft;
        const colWidth = tableWidth / 3;  // 三列布局

        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const index = row * 3 + col;
            if (index < basicNutrition.length) {
              const text = basicNutrition[index];
              const x = tableLeft + col * colWidth + colWidth / 2;
              ctx.fillText(text, x, y);
            }
          }
          y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
        }

        // 额外间距
        y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);

        // 能量和钙磷比（能量左对齐，钙磷比右对齐）
        if (energyText || caPRatioText) {
          if (energyText) {
            ctx.setTextAlign('left');
            ctx.fillText(energyText, tableLeft, y);
          }
          if (caPRatioText) {
            ctx.setTextAlign('right');
            ctx.fillText(caPRatioText, tableRight, y);
          }
          y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
        }

        y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
        y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
      }

      // ============= 5. 储存&保质期 =============
      // 标题
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.shelfLife.titleFontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText('储存&保质期', centerX, y);
      y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight);

      // 保质期信息（两行显示）
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.shelfLife.contentFontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText('● 冷冻保存，保质期6个月', centerX, y);
      y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight);
      ctx.fillText('● 0-5℃冷藏保存，保质期3天', centerX, y);
      y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight);

      // 移除"开封后3小时内食用完"提示
      y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);

      // 分隔线已移除
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // 恢复Canvas状态（恢复缩放前的坐标系）
      ctx.restore();

      // 底部品牌名称已移除（用户要求）

      // 绘制完成后导出图片(使用Promise确保稳定性)
      ctx.draw(false, () => {
        // 延迟一点确保绘制完成
        setTimeout(() => {
          uni.canvasToTempFilePath({
            canvasId,
            success: (res) => {
              console.log('[LabelRenderer] 标签绘制成功');
              resolve(res.tempFilePath);
            },
            fail: (err) => {
              console.error('[LabelRenderer] 导出图片失败:', err);
              reject(err);
            }
          }, component || this);
        }, 100);
      });
    } catch (error) {
      console.error('[LabelRenderer] 绘制标签失败:', error);
      reject(error);
    }
  });
}

/**
 * 文字换行辅助函数
 * @param ctx Canvas上下文
 * @param text 文本内容
 * @param maxWidth 最大宽度
 * @returns 分行后的文本数组
 */
function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const chars = text.split('');
  const lines: string[] = [];
  let currentLine = '';

  chars.forEach(char => {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  });
  lines.push(currentLine);

  return lines;
}

export type IngredientLabelInfo = {
  id: string;
  labelCategory?: string | null;
  labelNames?: string[] | null;
};

/**
 * 用原料主数据里的标签字段覆盖快照（主数据优先，快照兜底）。
 *
 * 老订单（2026-10-30 之前）的快照里没有 label_category / label_names，
 * 打印前回查原料库后，通过这里把分类补进快照再分组。
 */
export function applyIngredientLabelInfo(
  recipeSnapshot: any,
  labelInfo: Map<string, IngredientLabelInfo>
) {
  if (!recipeSnapshot || !Array.isArray(recipeSnapshot.items)) {
    return recipeSnapshot;
  }
  return {
    ...recipeSnapshot,
    items: recipeSnapshot.items.map((item: any) => {
      const info = item?.ingredient_id ? labelInfo.get(item.ingredient_id) : undefined;
      if (!info) {
        return item;
      }
      const properties = item.properties || {};
      const labelNames = Array.isArray(info.labelNames)
        ? info.labelNames.filter((name) => typeof name === 'string' && name.trim())
        : [];
      return {
        ...item,
        properties: {
          ...properties,
          label_category: info.labelCategory || properties.label_category,
          label_names: labelNames.length > 0 ? labelNames : properties.label_names
        }
      };
    })
  };
}

/**
 * 格式化原料信息
 * @param recipeSnapshot 食谱快照
 * @returns 食材字符串和补剂字符串（用顿号分隔）
 */
export function formatIngredients(recipeSnapshot: any, totalWeightG = 0) {
  const foodIngredients: string[] = [];
  const supplementIngredients: string[] = [];
  const additiveIngredients: string[] = [];
  const ingredientIds: string[] = [];
  // 只要有一条原料带了标签分类，就认为这单走"按标签分类分组"的新口径
  let hasLabelCategory = false;

  if (!recipeSnapshot.items || !Array.isArray(recipeSnapshot.items)) {
    return {
      foodIngredients: '',
      supplementIngredients: '',
      additiveIngredients: '',
      ingredientIds: [],
      labelIssues: [],
      hasLabelCategory: false
    };
  }

  const labelIssues: string[] = [];

  /** 饲料原料：有占比就写占比，算不出就只写名称（法规不强制标占比） */
  const pushFeedMaterial = (name: string, ratio: unknown) => {
    const percentage = Number(ratio);
    if (Number.isFinite(percentage) && percentage > 0) {
      foodIngredients.push(`${name}${percentage.toFixed(2)}%`);
    } else {
      foodIngredients.push(name);
    }
  };

  recipeSnapshot.items.forEach((item: any) => {
    const props = item.properties || {};
    const labelCategory = props.label_category as string | undefined;
    const labelNames: string[] = Array.isArray(props.label_names)
      ? props.label_names.filter((n: unknown) => typeof n === 'string' && n.trim())
      : [];
    if (labelCategory) {
      hasLabelCategory = true;
    }
    if (item.ingredient_id) {
      ingredientIds.push(item.ingredient_id);
    }

    // 包材/耗材不上标签
    if (labelCategory === 'NON_FEED') {
      return;
    }

    // 补剂/食材是否要出现在标签上，由标签分类决定；没有分类的走旧口径
    if (labelCategory === 'FEED_ADDITIVE') {
      if (labelNames.length === 0) {
        labelIssues.push(item.name);
      } else {
        labelNames.forEach((n) => {
          if (!additiveIngredients.includes(n)) {
            additiveIngredients.push(n);
          }
        });
      }
      return;
    }

    // 2026-10-30 起：饲料原料一律进「原料组成」，不再按食材/补剂区分。
    // 海藻粉、酵母粉这类补剂其实是原料，以前被塞进补剂行，新排版会把它丢掉。
    if (labelCategory === 'FEED_MATERIAL') {
      if (labelNames.length === 0) {
        labelIssues.push(item.name);
        return;
      }
      if (item.ingredient_type === 'FOOD' || item.ingredient_type === 'SUPPLEMENT') {
        pushFeedMaterial(labelNames[0], item.ratio);
      }
      return;
    }

    // 没有标签分类：老快照。保持旧口径输出，但标记缺失，打印前会拦下。
    if (item.ingredient_type === 'FOOD') {
      labelIssues.push(item.name);
      if (item.ratio) {
        // ratio 已经是百分比值（如 25.51 表示 25.51%），直接格式化即可
        const percentage = Number(item.ratio).toFixed(2);
        foodIngredients.push(`${labelNames[0] || item.name}${percentage}%`);
      }
    } else if (item.ingredient_type === 'SUPPLEMENT') {
      labelIssues.push(item.name);
      const supplementAmount = calculateSupplementAmountForProduction(item, totalWeightG, {
        includeProductionLoss: true
      });
      if (supplementAmount.amount > 0) {
        const displayName = labelNames[0] || item.name;
        supplementIngredients.push(`${displayName}${formatSupplementAmount(supplementAmount.amount)}${supplementAmount.unit}`);
      }
    }
  });

  return {
    foodIngredients: foodIngredients.join('、'),
    supplementIngredients: supplementIngredients.join('、'),
    additiveIngredients: additiveIngredients.join('、'),
    ingredientIds,
    labelIssues,
    hasLabelCategory
  };
}

function formatSupplementAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toFixed(2);
}

/**
 * 获取保质期说明
 * @returns 保质期文本
 */
export function getShelfLifeText(): string {
  return '保质期：建议-18℃以下冷冻保存，保质期为6个月；0-5℃冷藏保存，保质期为3天；开封后建议3小时内吃完';
}

// ==================== 精臣SDK绘制函数 ====================

/**
 * 使用精臣SDK绘制产品标签（用于实际打印）
 * @param canvasId Canvas组件ID
 * @param component Vue组件实例（用于this上下文）
 * @param labelData 标签数据
 * @param printCallback 打印回调函数（在endDrawLabel中调用）
 * @returns Promise<void>
 */
/**
 * 测量标签绘制后的总高度（精臣SDK版本）
 * @param labelData 标签数据
 * @returns 最终的Y坐标（毫米）
 */
function measureLabelHeightForJCSDK(labelData: LabelData): number {
  let y = LABEL_ELEMENTS.recipeName.yOffset;

  // 1. 食谱名称
  y += LABEL_ELEMENTS.recipeName.lineHeight;

  // 2. 制作信息
  y += LABEL_ELEMENTS.productionInfo.lineHeight;
  y += getOrderInfoLines(labelData).length * LABEL_ELEMENTS.productionInfo.lineHeight;
  y += LABEL_LAYOUT.lineHeight.loose;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 3. 原料表（左对齐，外框线）
  y += LABEL_ELEMENTS.ingredientsTitle.lineHeight;
  const allIngredients = [labelData.foodIngredients, labelData.supplementIngredients].filter(Boolean).join('、');
  const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
  y += ingredientLines.length * LABEL_ELEMENTS.ingredientsContent.lineHeight;
  y += LABEL_LAYOUT.spacing.blockInternal;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 4. 营养成分分析（分组展示）
  if (labelData.nutritionAnalysis) {
    y += LABEL_ELEMENTS.nutrition.lineHeight;
    // 6项基础营养成分（2行）
    y += 2 * LABEL_ELEMENTS.nutrition.lineHeight;
    y += LABEL_LAYOUT.spacing.blockInternal;
    // 能量和钙磷比（1行）
    const na = labelData.nutritionAnalysis;
    if (na.energyDensityKcalPerKg || na.calciumPhosphorusRatio) {
      y += LABEL_ELEMENTS.nutrition.lineHeight;
    }
    y += LABEL_LAYOUT.spacing.blockInternal;
    y += LABEL_LAYOUT.spacing.sectionGap;
  }

  // 5. 保质期
  y += LABEL_ELEMENTS.shelfLife.lineHeight * 2;
  y += LABEL_LAYOUT.spacing.blockInternal;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 烹饪建议不在这套旧画布里（生产标签走服务端出图）

  return y;
}

/**
 * 计算缩放比例（精臣SDK版本）
 * @param measuredHeight 测量到的总高度
 * @returns 缩放比例（0.85-1.0）
 */
function calculateScale(measuredHeight: number): number {
  const availableHeight = 92; // mm (可用内容高度)
  const bottomReserve = 6;   // mm (底部品牌预留空间)

  if (measuredHeight + bottomReserve > availableHeight) {
    // 内容溢出，需要缩放
    const scale = (availableHeight - bottomReserve) / measuredHeight;
    // 限制最小缩放比例 0.85，避免字体过小
    return Math.max(scale, 0.85);
  }
  return 1.0;
}

export async function drawProductionLabelWithJCSDK(
  canvasId: string,
  component: any,
  labelData: LabelData,
  printCallback?: () => void
): Promise<void> {
  console.log('[LabelRenderer] 开始使用精臣SDK绘制标签（使用统一配置 - 热敏打印机优化版）');

  return new Promise((resolve, reject) => {
    try {
      // 1. 测量内容高度，计算缩放比例
      const measuredHeight = measureLabelHeightForJCSDK(labelData);
      const scale = calculateScale(measuredHeight);

      console.log('[LabelRenderer] 测量高度:', measuredHeight.toFixed(1), 'mm');
      if (scale < 1.0) {
        console.log('[LabelRenderer] ⚠️ 内容溢出，启用缩放模式，缩放比例:', scale.toFixed(2));
      } else {
        console.log('[LabelRenderer] ✓ 内容高度正常，无需缩放');
      }

      // 2. 开始绘制标签（75mm × 100mm，旋转0度）
      JCAPI.startDrawLabel(canvasId, component, LABEL_LAYOUT.canvas.width, LABEL_LAYOUT.canvas.height, 0);

      // 3. 计算缩放后的起始Y坐标（保持垂直居中）
      const availableHeight = 92; // mm
      const bottomReserve = 6; // mm
      const centerY = (availableHeight - (availableHeight - bottomReserve) * scale) / 2;
      let y = centerY + (LABEL_ELEMENTS.recipeName.yOffset - centerY) * scale;

      // 使用统一配置（mm单位）
      const margin = LABEL_LAYOUT.margin.left;
      const centerX = LABEL_LAYOUT.canvas.width / 2;

      // ============= 0. 顶部品牌名称（下移1mm） =============
      const brandYOffset = LABEL_ELEMENTS.brandTop.yOffset + 1;  // 下移1mm
      JCAPI.drawText(labelData.brandName, centerX, brandYOffset * scale, LABEL_ELEMENTS.brandTop.fontSize * scale, 0, {
        align: 'center'
      });
      y = brandYOffset * scale + LABEL_ELEMENTS.brandTop.lineHeight * scale;

      // 分隔线已移除，品牌名称与食谱标题之间保留3mm间距
      y += 3 * scale;  // 3mm 间距

      // ============= 1. 食谱名称 =============
      JCAPI.drawText(labelData.recipeName, centerX, y, LABEL_ELEMENTS.recipeName.fontSize * scale, 0, {
        align: 'center'
        // 不设置family参数,让精臣SDK使用默认字体(SimHei)
        // 原因: 微信小程序canvas真机不支持自定义字体参数,会忽略family字段
        // 参考: https://developers.weixin.qq.com/community/develop/doc/000208e74447700dca3893fde56400
      });
      y += LABEL_ELEMENTS.recipeName.lineHeight * scale;

      // ============= 2. 制作信息 =============
      JCAPI.drawText(`为"${labelData.dogName}"制作于${labelData.productionTime}`, centerX, y, LABEL_ELEMENTS.productionInfo.fontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.productionInfo.lineHeight * scale;

      // 订购信息
      const orderInfoLines = getOrderInfoLines(labelData);
      orderInfoLines.forEach((line) => {
        JCAPI.drawText(line, centerX, y, LABEL_ELEMENTS.productionInfo.fontSize * scale, 0, {
          align: 'center'
        });
        y += LABEL_ELEMENTS.productionInfo.lineHeight * scale;
      });

      y += LABEL_LAYOUT.lineHeight.loose * scale;

      // 粗分隔线已移除
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // ============= 3. 原料表（居中展示，无框线） =============
      // 标题
      const ingredientsTitleText = '原料表';
      JCAPI.drawText(ingredientsTitleText, centerX, y, LABEL_ELEMENTS.ingredientsTitle.fontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.ingredientsTitle.lineHeight * scale;

      // 原料内容
      let allIngredients = '';
      if (labelData.foodIngredients) {
        allIngredients += labelData.foodIngredients;
      }
      if (labelData.supplementIngredients) {
        if (allIngredients) {
          allIngredients += '、' + labelData.supplementIngredients;
        } else {
          allIngredients += labelData.supplementIngredients;
        }
      }

      // 使用智能换行（按顿号分割，避免单词截断）
      const ingredientLines = splitTextBySeparators(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);

      // 绘制每行内容（居中对齐）
      ingredientLines.forEach((line) => {
        JCAPI.drawText(line, centerX, y, LABEL_ELEMENTS.ingredientsContent.fontSize * scale, 0, {
          align: 'center'
        });
        y += LABEL_ELEMENTS.ingredientsContent.lineHeight * scale;
      });

      y += LABEL_LAYOUT.spacing.blockInternal * scale;
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // ============= 4. 营养成分分析（无框线，显示占比） =============
      if (labelData.nutritionAnalysis) {
        const na = labelData.nutritionAnalysis;

        // 标题
        const nutritionTitleText = '营养成分分析';
        JCAPI.drawText(nutritionTitleText, centerX, y, LABEL_ELEMENTS.nutrition.titleFontSize * scale, 0, {
          align: 'center'
        });
        y += LABEL_ELEMENTS.nutrition.lineHeight * scale;

        // 前6项基础营养成分（包含名称和占比）
        const basicNutrition = [
          na.proteinPercent !== undefined ? `蛋白质 ${na.proteinPercent.toFixed(1)}%` : null,
          na.fatPercent !== undefined ? `脂肪 ${na.fatPercent.toFixed(1)}%` : null,
          na.ashPercent !== undefined ? `灰分 ${na.ashPercent.toFixed(1)}%` : null,
          na.moisturePercent !== undefined ? `含水量 ${na.moisturePercent.toFixed(1)}%` : null,
          na.crudeFiberPercent !== undefined ? `纤维 ${na.crudeFiberPercent.toFixed(1)}%` : null,
          na.carbohydratePercent !== undefined ? `碳水 ${na.carbohydratePercent.toFixed(1)}%` : null,
        ].filter(Boolean);

        // 能量和钙磷比
        const energyText = na.energyDensityKcalPerKg ? `能量 ${na.energyDensityKcalPerKg}kcal/kg` : null;
        const caPRatioText = na.calciumPhosphorusRatio ? `钙磷比 ${na.calciumPhosphorusRatio}:1` : null;

        // 绘制6项基础营养成分（每行3个，共2行）
        const tableLeft = margin;
        const tableRight = LABEL_LAYOUT.canvas.width - margin;
        const tableWidth = tableRight - tableLeft;
        const colWidth = tableWidth / 3;  // 三列布局

        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const index = row * 3 + col;
            if (index < basicNutrition.length) {
              const text = basicNutrition[index];
              const x = tableLeft + col * colWidth + colWidth / 2;
              JCAPI.drawText(text, x, y, LABEL_ELEMENTS.nutrition.contentFontSize * scale, 0, {
                align: 'center'
              });
            }
          }
          y += LABEL_ELEMENTS.nutrition.lineHeight * scale;
        }

        // 额外间距
        y += LABEL_LAYOUT.spacing.blockInternal * scale;

        // 能量和钙磷比（能量左对齐，钙磷比右对齐）
        if (energyText || caPRatioText) {
          if (energyText) {
            JCAPI.drawText(energyText, tableLeft, y, LABEL_ELEMENTS.nutrition.contentFontSize * scale, 0, {
              align: 'left'
            });
          }
          if (caPRatioText) {
            JCAPI.drawText(caPRatioText, tableRight, y, LABEL_ELEMENTS.nutrition.contentFontSize * scale, 0, {
              align: 'right'
            });
          }
          y += LABEL_ELEMENTS.nutrition.lineHeight * scale;
        }

        y += LABEL_LAYOUT.spacing.blockInternal * scale;
        y += LABEL_LAYOUT.spacing.sectionGap * scale;
      }

      // ============= 5. 储存&保质期 =============
      // 标题
      JCAPI.drawText('储存&保质期', centerX, y, LABEL_ELEMENTS.shelfLife.titleFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.shelfLife.lineHeight * scale;

      // 保质期信息（两行显示）
      JCAPI.drawText('● 冷冻保存，保质期6个月', centerX, y, LABEL_ELEMENTS.shelfLife.contentFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.shelfLife.lineHeight * scale;
      JCAPI.drawText('● 0-5℃冷藏保存，保质期3天', centerX, y, LABEL_ELEMENTS.shelfLife.contentFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.shelfLife.lineHeight * scale;

      y += LABEL_LAYOUT.spacing.blockInternal * scale;

      // 分隔线已移除
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // 底部品牌名称已移除（用户要求）

      // 结束绘制（在回调中调用打印函数）
      JCAPI.endDrawLabel(() => {
        console.log('[LabelRenderer] 精臣SDK标签绘制完成');
        if (printCallback) {
          printCallback();
        }
        resolve();
      });
    } catch (error) {
      console.error('[LabelRenderer] 精臣SDK绘制标签失败:', error);
      reject(error);
    }
  });
}

/**
 * 按字符数和分隔符智能分割文本（用于精臣SDK）
 * @param text 文本内容
 * @param maxChars 每行最大字符数
 * @returns 分割后的文本数组
 */
function splitTextBySeparators(text: string, maxChars: number): string[] {
  // 按顿号分割成各个项
  const items = text.split('、');
  const lines: string[] = [];
  let currentLine = '';
  let currentLength = 0;

  items.forEach((item) => {
    const itemLength = item.length;
    const separatorLength = currentLine.length > 0 ? 1 : 0; // 顿号占1个字符

    // 测试添加当前项后的字符数
    if (currentLength + itemLength + separatorLength > maxChars && currentLine.length > 0) {
      // 超出最大字符数，保存当前行，开始新行
      lines.push(currentLine);
      currentLine = item;
      currentLength = itemLength;
    } else {
      // 未超出，继续累加
      if (currentLine.length > 0) {
        currentLine += '、' + item;
        currentLength += separatorLength + itemLength;
      } else {
        currentLine = item;
        currentLength = itemLength;
      }
    }
  });

  // 添加最后一行
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * 按字符数分割文本（用于简单换行）
 * @param text 文本内容
 * @param maxChars 每行最大字符数
 * @returns 分割后的文本数组
 */
function splitTextByChars(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
}
