/**
 * 标签Canvas渲染器
 * 负责在Canvas上绘制产品标签（75mm × 100mm）
 * 使用统一配置，确保预览和打印完全一致
 */

import JCAPI from './jcing-sdk/JCAPI';
import { getLifeStageLabel, getHealthTagLabel, getNutritionStandardLabel } from './label-mapping';
import { LABEL_LAYOUT, LABEL_ELEMENTS, mmToPx } from './label-config';

// Canvas尺寸：75mm × 100mm @ 8像素/mm = 600 × 800 像素
const CANVAS_WIDTH = mmToPx(LABEL_LAYOUT.canvas.width);  // 600px
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

/**
 * 获取烹饪建议表格数据
 * @param cookingMethod 烹饪方法对象
 * @returns 表格行数据
 */
export function getCookingAdvice(cookingMethod: {
  steam?: string;
  stew?: string;
  sousvide?: string;
}): Array<{
  method: string;
  time: string;
  description: string;
}> {
  // 防御性检查：如果 cookingMethod 为空或属性不存在，返回默认值
  const steam = cookingMethod?.steam || '10-12分钟';
  const stew = cookingMethod?.stew || '10-12分钟';
  const sousvide = cookingMethod?.sousvide || '45分钟';

  return [
    {
      method: '蒸',
      time: steam,
      description: '无需提前解冻，直接放入蒸锅'
    },
    {
      method: '炖',
      time: stew,
      description: '需提前解冻、拆袋、加水、小火慢炖'
    },
    {
      method: '低温慢煮',
      time: sousvide,
      description: '无需提前解冻，温度设置为65℃'
    }
  ];
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
  y += mmToPx(LABEL_ELEMENTS.productionInfo.lineHeight) * 2;
  y += mmToPx(LABEL_LAYOUT.lineHeight.loose);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 3. 原料表
  y += mmToPx(LABEL_ELEMENTS.ingredientsTitle.lineHeight);
  const allIngredients = [labelData.foodIngredients, labelData.supplementIngredients].filter(Boolean).join('、');
  const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
  y += ingredientLines.length * mmToPx(LABEL_ELEMENTS.ingredientsContent.lineHeight);
  y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 4. 营养成分分析
  if (labelData.nutritionAnalysis) {
    y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
    const na = labelData.nutritionAnalysis;
    const nutritionItems = [
      na.proteinPercent !== undefined ? `蛋白质${na.proteinPercent.toFixed(1)}%` : null,
      na.fatPercent !== undefined ? `脂肪${na.fatPercent.toFixed(1)}%` : null,
      na.ashPercent !== undefined ? `灰分${na.ashPercent.toFixed(1)}%` : null,
      na.moisturePercent !== undefined ? `含水量${na.moisturePercent.toFixed(1)}%` : null,
      na.crudeFiberPercent !== undefined ? `纤维${na.crudeFiberPercent.toFixed(1)}%` : null,
      na.carbohydratePercent !== undefined ? `碳水${na.carbohydratePercent.toFixed(1)}%` : null,
      na.energyDensityKcalPerKg ? `能量${na.energyDensityKcalPerKg}kcal/kg` : null,
      na.calciumPhosphorusRatio ? `钙磷比${na.calciumPhosphorusRatio}:1` : null,
    ].filter(Boolean);
    const itemsPerLine = LABEL_ELEMENTS.nutrition.itemsPerLine || 4;
    const nutritionLineCount = Math.ceil(nutritionItems.length / itemsPerLine);
    y += nutritionLineCount * mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
    y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
    y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
  }

  // 5. 保质期
  y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight) * 2;
  y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
  y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

  // 6. 烹饪建议
  y += mmToPx(LABEL_ELEMENTS.cooking.lineHeight);
  const cookingAdvice = getCookingAdvice(labelData.cookingMethod);
  y += cookingAdvice.length * mmToPx(LABEL_ELEMENTS.cooking.lineHeight);

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

      // ============= 0. 顶部品牌名称已移除 =============
      // 品牌名称已移至底部

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

      // 订购信息（第二行）
      const orderInfo = `${labelData.weightPerPack}g × ${labelData.packageCount}袋  总净重${labelData.totalWeight}g`;
      ctx.fillText(orderInfo, centerX, y);
      y += mmToPx(LABEL_LAYOUT.lineHeight.loose);

      // 粗分隔线已移除
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // ============= 3. 原料表（表格化） =============
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

      const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
      const tableLeft = margin;
      const tableRight = CANVAS_WIDTH - margin;

      // 绘制表格顶部线
      ctx.setStrokeStyle('#000000');
      ctx.setLineWidth(mmToPx(0.3));
      ctx.beginPath();
      ctx.moveTo(tableLeft, y);
      ctx.lineTo(tableRight, y);
      ctx.stroke();
      y += mmToPx(LABEL_ELEMENTS.ingredientsContent.lineHeight);

      // 绘制每行内容 + 底部分隔线
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.ingredientsContent.fontSize));
      ctx.setFillStyle('#333333');
      ctx.setTextAlign('center');

      ingredientLines.forEach((line, index) => {
        ctx.fillText(line, centerX, y);
        y += mmToPx(LABEL_ELEMENTS.ingredientsContent.lineHeight);

        // 绘制底部分隔线（最后一行也画，形成完整表格）
        ctx.setStrokeStyle('#000000');
        ctx.setLineWidth(mmToPx(0.3));
        ctx.beginPath();
        ctx.moveTo(tableLeft, y);
        ctx.lineTo(tableRight, y);
        ctx.stroke();
      });

      y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // ============= 4. 营养成分分析（表格化） =============
      if (labelData.nutritionAnalysis) {
        const na = labelData.nutritionAnalysis;

        // 标题
        ctx.setFontSize(mmToPx(LABEL_ELEMENTS.nutrition.titleFontSize));
        ctx.setFillStyle('#000000');
        ctx.setTextAlign('center');
        const nutritionTitleText = '营养成分分析';
        ctx.fillText(nutritionTitleText, centerX, y);
        y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);

        // 准备营养成分数据（每项一个对象）
        const nutritionItems = [
          na.proteinPercent !== undefined ? { name: '蛋白质', value: `${na.proteinPercent.toFixed(1)}%` } : null,
          na.fatPercent !== undefined ? { name: '脂肪', value: `${na.fatPercent.toFixed(1)}%` } : null,
          na.ashPercent !== undefined ? { name: '灰分', value: `${na.ashPercent.toFixed(1)}%` } : null,
          na.moisturePercent !== undefined ? { name: '含水量', value: `${na.moisturePercent.toFixed(1)}%` } : null,
          na.crudeFiberPercent !== undefined ? { name: '纤维', value: `${na.crudeFiberPercent.toFixed(1)}%` } : null,
          na.carbohydratePercent !== undefined ? { name: '碳水', value: `${na.carbohydratePercent.toFixed(1)}%` } : null,
          na.energyDensityKcalPerKg ? { name: '能量', value: `${na.energyDensityKcalPerKg}kcal/kg` } : null,
          na.calciumPhosphorusRatio ? { name: '钙磷比', value: `${na.calciumPhosphorusRatio}:1` } : null,
        ].filter(Boolean);

        // 表格布局参数
        const tableLeft = margin;
        const tableRight = CANVAS_WIDTH - margin;
        const tableWidth = tableRight - tableLeft;
        const colWidth = tableWidth / 2;  // 两列：名称列 | 数值列
        const middleX = tableLeft + colWidth;

        // 绘制表格顶部线
        ctx.setStrokeStyle('#000000');
        ctx.setLineWidth(mmToPx(0.3));
        ctx.beginPath();
        ctx.moveTo(tableLeft, y);
        ctx.lineTo(tableRight, y);
        ctx.stroke();
        y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);

        // 绘制表格内容
        ctx.setFontSize(mmToPx(LABEL_ELEMENTS.nutrition.contentFontSize));
        ctx.setFillStyle('#000000');

        nutritionItems.forEach((item: any, index: number) => {
          // 绘制竖线（中间分隔线）
          ctx.setStrokeStyle('#000000');
          ctx.setLineWidth(mmToPx(0.3));
          ctx.beginPath();
          ctx.moveTo(middleX, y - mmToPx(LABEL_ELEMENTS.nutrition.lineHeight));
          ctx.lineTo(middleX, y);
          ctx.stroke();

          // 左列：营养名称（右对齐到中间线）
          ctx.setTextAlign('right');
          ctx.fillText(item.name, middleX - mmToPx(2), y);

          // 右列：数值（左对齐到中间线）
          ctx.setTextAlign('left');
          ctx.fillText(item.value, middleX + mmToPx(2), y);

          // 绘制底部分隔线
          ctx.beginPath();
          ctx.moveTo(tableLeft, y);
          ctx.lineTo(tableRight, y);
          ctx.stroke();

          y += mmToPx(LABEL_ELEMENTS.nutrition.lineHeight);
        });

        y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
        y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);
      }

      // ============= 5. 保质期 =============
      // 标题（纯文本，不使用装饰字符）
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.shelfLife.titleFontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      const shelfLifeTitleText = '保质期';
      ctx.fillText(shelfLifeTitleText, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight);

      // 保质期信息（移除特殊符号）
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.shelfLife.contentFontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText(`冷冻保存6个月  冷藏保存3天`, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.shelfLife.lineHeight);

      // 移除"开封后3小时内食用完"提示
      y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);

      // 分隔线已移除
      y += mmToPx(LABEL_LAYOUT.spacing.sectionGap);

      // ============= 6. 烹饪建议 =============
      // 标题（纯文本，不使用装饰字符）
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.cooking.titleFontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      const cookingTitleText = '烹饪建议';
      ctx.fillText(cookingTitleText, centerX, y);
      y += mmToPx(LABEL_ELEMENTS.cooking.lineHeight);

      // 绘制烹饪建议（同行展示）
      const cookingAdvice = getCookingAdvice(labelData.cookingMethod);
      const indent = mmToPx(3); // 缩进3mm

      cookingAdvice.forEach((row) => {
        // 同行展示：方法+时间+说明
        ctx.setFontSize(mmToPx(LABEL_ELEMENTS.cooking.descriptionFontSize));
        ctx.setFillStyle('#000000');
        ctx.setTextAlign('left');
        const lineText = `${row.method} ${row.time}：${row.description}`;
        ctx.fillText(lineText, margin + indent, y);
        y += mmToPx(LABEL_ELEMENTS.cooking.lineHeight);
      });

      // ============= 7. 底部品牌名称 =============
      y += mmToPx(LABEL_LAYOUT.spacing.blockInternal);
      const brandBottomY = CANVAS_HEIGHT - mmToPx(LABEL_ELEMENTS.brandBottom.yOffsetFromBottom);
      ctx.setFontSize(mmToPx(LABEL_ELEMENTS.brandBottom.fontSize));
      ctx.setFillStyle('#000000');
      ctx.setTextAlign('center');
      ctx.fillText(labelData.brandName, centerX, brandBottomY);

      // 恢复Canvas状态（恢复缩放前的坐标系）
      ctx.restore();

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

/**
 * 根据真空袋规格计算烹饪时间
 * @param vacuumBagSpec 真空袋规格（如 "12*17cm"）
 * @returns 烹饪时间对象
 */
export function getCookingTime(vacuumBagSpec: string) {
  // 提取尺寸：从 "12*17cm" 提取 "12*17"
  const sizeMatch = vacuumBagSpec.match(/(\d+)\*(\d+)/);
  const size = sizeMatch ? `${sizeMatch[1]}*${sizeMatch[2]}` : '12*17';

  const timeMap: Record<string, { steam: string; stew: string; sousvide: string }> = {
    '10*15': {
      steam: '8-10分钟',
      stew: '8-10分钟',
      sousvide: '30分钟'
    },
    '12*17': {
      steam: '10-12分钟',
      stew: '10-12分钟',
      sousvide: '45分钟'
    },
    '15*20': {
      steam: '12-15分钟',
      stew: '12-15分钟',
      sousvide: '60分钟'
    },
    '20*25': {
      steam: '20-25分钟',
      stew: '20-25分钟',
      sousvide: '90分钟'
    }
  };

  return timeMap[size] || timeMap['12*17'];
}

/**
 * 格式化原料信息
 * @param recipeSnapshot 食谱快照
 * @returns 食材字符串和补剂字符串（用顿号分隔）
 */
export function formatIngredients(recipeSnapshot: any) {
  const foodIngredients: string[] = [];
  const supplementIngredients: string[] = [];

  if (!recipeSnapshot.items || !Array.isArray(recipeSnapshot.items)) {
    return { foodIngredients: '', supplementIngredients: '' };
  }

  recipeSnapshot.items.forEach((item: any) => {
    if (item.ingredient_type === 'FOOD' && item.ratio) {
      // ratio 已经是百分比值（如 25.51 表示 25.51%），直接格式化即可
      const percentage = Number(item.ratio).toFixed(2);
      foodIngredients.push(`${item.name}${percentage}%`);
    } else if (item.ingredient_type === 'SUPPLEMENT' && item.nutrient_target_value) {
      // 从 properties.active_nutrients 中获取营养素单位
      const nutrientKey = item.nutrient_target_key;
      const nutrientUnit = item.properties?.active_nutrients?.[nutrientKey]?.unit || '';
      supplementIngredients.push(`${item.name}（每kg添加${item.nutrient_target_value}${nutrientUnit}${nutrientKey}）`);
    }
  });

  return {
    foodIngredients: foodIngredients.join('、'),
    supplementIngredients: supplementIngredients.join('、')
  };
}

/**
 * 获取保质期说明
 * @returns 保质期文本
 */
export function getShelfLifeText(): string {
  return '保质期：建议-18℃以下冷冻保存，保质期为6个月；0-5℃冷藏保存，保质期为3天；开封后建议3小时内吃完';
}

/**
 * 格式化烹饪方法文本
 * @param cookingTime 烹饪时间对象
 * @returns 格式化后的烹饪方法文本
 */
export function formatCookingMethod(cookingTime: {
  steam: string;
  stew: string;
  sousvide: string;
}): string {
  return `蒸${cookingTime.steam} / 炖${cookingTime.stew} / 低温慢煮${cookingTime.sousvide}`;
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
  y += LABEL_ELEMENTS.productionInfo.lineHeight * 2;
  y += LABEL_LAYOUT.lineHeight.loose;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 3. 原料表
  y += LABEL_ELEMENTS.ingredientsTitle.lineHeight;
  const allIngredients = [labelData.foodIngredients, labelData.supplementIngredients].filter(Boolean).join('、');
  const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
  y += ingredientLines.length * LABEL_ELEMENTS.ingredientsContent.lineHeight;
  y += LABEL_LAYOUT.spacing.blockInternal;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 4. 营养成分分析
  if (labelData.nutritionAnalysis) {
    y += LABEL_ELEMENTS.nutrition.lineHeight;
    const na = labelData.nutritionAnalysis;
    const nutritionItems = [
      na.proteinPercent !== undefined ? `蛋白质${na.proteinPercent.toFixed(1)}%` : null,
      na.fatPercent !== undefined ? `脂肪${na.fatPercent.toFixed(1)}%` : null,
      na.ashPercent !== undefined ? `灰分${na.ashPercent.toFixed(1)}%` : null,
      na.moisturePercent !== undefined ? `含水量${na.moisturePercent.toFixed(1)}%` : null,
      na.crudeFiberPercent !== undefined ? `纤维${na.crudeFiberPercent.toFixed(1)}%` : null,
      na.carbohydratePercent !== undefined ? `碳水${na.carbohydratePercent.toFixed(1)}%` : null,
      na.energyDensityKcalPerKg ? `能量${na.energyDensityKcalPerKg}kcal/kg` : null,
      na.calciumPhosphorusRatio ? `钙磷比${na.calciumPhosphorusRatio}:1` : null,
    ].filter(Boolean);
    const itemsPerLine = LABEL_ELEMENTS.nutrition.itemsPerLine || 4;
    const nutritionLineCount = Math.ceil(nutritionItems.length / itemsPerLine);
    y += nutritionLineCount * LABEL_ELEMENTS.nutrition.lineHeight;
    y += LABEL_LAYOUT.spacing.blockInternal;
    y += LABEL_LAYOUT.spacing.sectionGap;
  }

  // 5. 保质期
  y += LABEL_ELEMENTS.shelfLife.lineHeight * 2;
  y += LABEL_LAYOUT.spacing.blockInternal;
  y += LABEL_LAYOUT.spacing.sectionGap;

  // 6. 烹饪建议
  y += LABEL_ELEMENTS.cooking.lineHeight;
  const cookingAdvice = getCookingAdvice(labelData.cookingMethod);
  y += cookingAdvice.length * LABEL_ELEMENTS.cooking.lineHeight;

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

      // ============= 0. 顶部品牌名称已移除 =============
      // 品牌名称已移至底部

      // ============= 1. 食谱名称 =============
      JCAPI.drawText(labelData.recipeName, centerX, y, LABEL_ELEMENTS.recipeName.fontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.recipeName.lineHeight * scale;

      // ============= 2. 制作信息 =============
      JCAPI.drawText(`为"${labelData.dogName}"制作于${labelData.productionTime}`, centerX, y, LABEL_ELEMENTS.productionInfo.fontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.productionInfo.lineHeight * scale;

      // 订购信息（第二行）
      const orderInfo = `${labelData.weightPerPack}g × ${labelData.packageCount}袋  总净重${labelData.totalWeight}g`;
      JCAPI.drawText(orderInfo, centerX, y, LABEL_ELEMENTS.productionInfo.fontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_LAYOUT.lineHeight.loose * scale;

      // 粗分隔线已移除
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // ============= 3. 原料表（表格化） =============
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

      const ingredientLines = splitTextByChars(allIngredients, LABEL_ELEMENTS.ingredientsContent.maxCharsPerLine);
      const tableLeft = margin;
      const tableRight = LABEL_LAYOUT.canvas.width - margin;

      // 绘制表格顶部线
      JCAPI.drawLine(tableLeft, y, tableRight, y, 0.3 * scale);
      y += LABEL_ELEMENTS.ingredientsContent.lineHeight * scale;

      // 绘制每行内容 + 底部分隔线
      ingredientLines.forEach((line) => {
        JCAPI.drawText(line, centerX, y, LABEL_ELEMENTS.ingredientsContent.fontSize * scale, 0, {
          align: 'center'
        });
        y += LABEL_ELEMENTS.ingredientsContent.lineHeight * scale;

        // 绘制底部分隔线
        JCAPI.drawLine(tableLeft, y, tableRight, y, 0.3 * scale);
      });

      y += LABEL_LAYOUT.spacing.blockInternal * scale;
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // ============= 4. 营养成分分析（表格化） =============
      if (labelData.nutritionAnalysis) {
        const na = labelData.nutritionAnalysis;

        // 标题
        const nutritionTitleText = '营养成分分析';
        JCAPI.drawText(nutritionTitleText, centerX, y, LABEL_ELEMENTS.nutrition.titleFontSize * scale, 0, {
          align: 'center'
        });
        y += LABEL_ELEMENTS.nutrition.lineHeight * scale;

        // 准备营养成分数据（每项一个对象）
        const nutritionItems = [
          na.proteinPercent !== undefined ? { name: '蛋白质', value: `${na.proteinPercent.toFixed(1)}%` } : null,
          na.fatPercent !== undefined ? { name: '脂肪', value: `${na.fatPercent.toFixed(1)}%` } : null,
          na.ashPercent !== undefined ? { name: '灰分', value: `${na.ashPercent.toFixed(1)}%` } : null,
          na.moisturePercent !== undefined ? { name: '含水量', value: `${na.moisturePercent.toFixed(1)}%` } : null,
          na.crudeFiberPercent !== undefined ? { name: '纤维', value: `${na.crudeFiberPercent.toFixed(1)}%` } : null,
          na.carbohydratePercent !== undefined ? { name: '碳水', value: `${na.carbohydratePercent.toFixed(1)}%` } : null,
          na.energyDensityKcalPerKg ? { name: '能量', value: `${na.energyDensityKcalPerKg}kcal/kg` } : null,
          na.calciumPhosphorusRatio ? { name: '钙磷比', value: `${na.calciumPhosphorusRatio}:1` } : null,
        ].filter(Boolean);

        // 表格布局参数
        const tableLeft = margin;
        const tableRight = LABEL_LAYOUT.canvas.width - margin;
        const tableWidth = tableRight - tableLeft;
        const middleX = tableLeft + tableWidth / 2;

        // 绘制表格顶部线
        JCAPI.drawLine(tableLeft, y, tableRight, y, 0.3 * scale);
        y += LABEL_ELEMENTS.nutrition.lineHeight * scale;

        // 绘制表格内容
        nutritionItems.forEach((item: any) => {
          // 绘制竖线（中间分隔线）
          JCAPI.drawLine(middleX, y - LABEL_ELEMENTS.nutrition.lineHeight * scale, middleX, y, 0.3 * scale);

          // 左列：营养名称（右对齐到中间线）
          JCAPI.drawText(item.name, middleX - 2, y, LABEL_ELEMENTS.nutrition.contentFontSize * scale, 0, {
            align: 'right'
          });

          // 右列：数值（左对齐到中间线）
          JCAPI.drawText(item.value, middleX + 2, y, LABEL_ELEMENTS.nutrition.contentFontSize * scale, 0, {
            align: 'left'
          });

          // 绘制底部分隔线
          JCAPI.drawLine(tableLeft, y, tableRight, y, 0.3 * scale);

          y += LABEL_ELEMENTS.nutrition.lineHeight * scale;
        });

        y += LABEL_LAYOUT.spacing.blockInternal * scale;
        y += LABEL_LAYOUT.spacing.sectionGap * scale;
      }

      // ============= 5. 保质期 =============
      // 标题（纯文本，不使用装饰字符）
      const shelfLifeTitleText = '保质期';
      JCAPI.drawText(shelfLifeTitleText, centerX, y, LABEL_ELEMENTS.shelfLife.titleFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.shelfLife.lineHeight * scale;

      // 保质期信息（移除特殊符号）
      JCAPI.drawText(`冷冻保存6个月  冷藏保存3天`, centerX, y, LABEL_ELEMENTS.shelfLife.contentFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.shelfLife.lineHeight * scale;

      // 移除"开封后3小时内食用完"提示
      y += LABEL_LAYOUT.spacing.blockInternal * scale;

      // 分隔线已移除
      y += LABEL_LAYOUT.spacing.sectionGap * scale;

      // ============= 6. 烹饪建议 =============
      // 标题（纯文本，不使用装饰字符）
      const cookingTitleText = '烹饪建议';
      JCAPI.drawText(cookingTitleText, centerX, y, LABEL_ELEMENTS.cooking.titleFontSize * scale, 0, {
        align: 'center'
      });
      y += LABEL_ELEMENTS.cooking.lineHeight * scale;

      // 绘制烹饪建议（同行展示）
      const cookingAdvice = getCookingAdvice(labelData.cookingMethod);
      const indent = 3; // 缩进3mm

      cookingAdvice.forEach((row) => {
        // 同行展示：方法+时间+说明
        const lineText = `${row.method} ${row.time}：${row.description}`;
        JCAPI.drawText(lineText, margin + indent, y, LABEL_ELEMENTS.cooking.descriptionFontSize * scale, 0, {
          align: 'left'
        });
        y += LABEL_ELEMENTS.cooking.lineHeight * scale;
      });

      // ============= 7. 底部品牌名称 =============
      y += LABEL_LAYOUT.spacing.blockInternal * scale;
      const brandBottomY = LABEL_LAYOUT.canvas.height - LABEL_ELEMENTS.brandBottom.yOffsetFromBottom;
      JCAPI.drawText(labelData.brandName, centerX, brandBottomY, LABEL_ELEMENTS.brandBottom.fontSize * scale, 0, {
        align: 'center'
      });

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
