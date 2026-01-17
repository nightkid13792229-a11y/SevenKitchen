/**
 * Canvas打印工具 - 绘制生产任务单（A4竖版）
 * 尺寸：1240 × 1754 px (A4 @150 DPI)
 */

export interface TaskDetail {
  recipeName: string;
  recipeVersion: string;
  currentPotNumber: number;
  totalPots: number;
  status: string;
  totalProductionG: number;
  createdAt: string;
  completedAt?: string;
  orderItems?: OrderItem[];
  recipeSnapshot?: {
    items?: RecipeItem[];
    production_loss_rate?: number;
  };
  createdBy?: string; // 创建人
}

export interface OrderItem {
  orderId: string;
  orderItemId: string;
  packageSpecG: number;
  packageCount: number;
  dogName: string;
  recipientName?: string;
  recipientCity?: string;
}

export interface RecipeItem {
  ingredient_id: string;
  name: string;
  ratio: number;
  ingredient_type: string;
  preparation_methods?: string[];
  nutrient_target_key?: string;
  nutrient_target_value?: number;
  unit_display_label?: string;
  properties?: {
    active_nutrients?: Record<string, { value: number; unit: string }>;
    production_loss_rate?: number;
  };
}

export interface ParsedIngredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  type: string;
  method: string;
}

// A4纸尺寸 @150 DPI
const A4_WIDTH = 1240;
const A4_HEIGHT = 1754;
const PADDING = 60;
const CONTENT_WIDTH = A4_WIDTH - PADDING * 2;

// 颜色定义
const COLORS = {
  title: '#333333',
  subtitle: '#666666',
  sectionTitle: '#1890ff',
  text: '#333333',
  textSecondary: '#666666',
  border: '#333333', // 网格线颜色改为深色
  background: '#ffffff',
  highlight: '#f0f9ff',
};

/**
 * 绘制生产任务单打印内容
 */
export async function drawProductionTaskPrint(taskDetail: TaskDetail): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = uni.createCanvasContext('printCanvas');

    // 绘制白色背景
    ctx.setFillStyle(COLORS.background);
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    let y = PADDING;

    // 绘制标题（食谱名称、版本号、锅次）
    y = drawTitle(ctx, taskDetail, y);

    // 绘制副标题（创建人、创建时间）
    y = drawSubtitle(ctx, taskDetail, y);

    // 绘制分装信息（横向排列，无标题）
    if (taskDetail.orderItems && taskDetail.orderItems.length > 0) {
      y = drawPackagingInfo(ctx, taskDetail.orderItems, taskDetail.totalProductionG, y);
    }

    // 绘制原料清单
    const ingredients = parseIngredients(taskDetail);
    if (ingredients.length > 0) {
      y = drawIngredientsList(ctx, ingredients, y);
    }

    // 绘制页脚
    drawFooter(ctx, A4_HEIGHT - 80);

    // 执行绘制
    ctx.draw(false, () => {
      // 生成图片
      uni.canvasToTempFilePath({
        canvasId: 'printCanvas',
        x: 0,
        y: 0,
        width: A4_WIDTH,
        height: A4_HEIGHT,
        destWidth: A4_WIDTH * 2,
        destHeight: A4_HEIGHT * 2,
        success: (res) => {
          resolve(res.tempFilePath);
        },
        fail: (err) => {
          console.error('生成打印图片失败', err);
          reject(err);
        },
      });
    });
  });
}

/**
 * 绘制标题（食谱名称、版本号、锅次）
 */
function drawTitle(ctx: any, taskDetail: TaskDetail, y: number): number {
  // 主标题
  ctx.setFillStyle(COLORS.title);
  ctx.setFontSize(40);
  ctx.setTextAlign('center');
  ctx.fillText(
    `${taskDetail.recipeName} v${taskDetail.recipeVersion} [${taskDetail.currentPotNumber}/${taskDetail.totalPots}]`,
    A4_WIDTH / 2,
    y
  );

  return y + 70;
}

/**
 * 绘制副标题（创建人、创建时间）
 */
function drawSubtitle(ctx: any, taskDetail: TaskDetail, y: number): number {
  ctx.setFillStyle(COLORS.subtitle);
  ctx.setFontSize(24);
  ctx.setTextAlign('center');

  const creator = taskDetail.createdBy || '系统';
  const createTime = formatDateTime(taskDetail.createdAt);

  ctx.fillText(`创建人：${creator}  |  创建时间：${createTime}`, A4_WIDTH / 2, y);

  return y + 60;
}

/**
 * 绘制分装信息（横向排列）
 */
function drawPackagingInfo(
  ctx: any,
  orderItems: OrderItem[],
  totalProductionG: number,
  y: number
): number {
  const cardPadding = 20;
  const lineHeight = 36;

  // 计算订单卡片的内容高度（5个字段 + 标题，缩减一行）
  const cardHeight = 70 + 4 * lineHeight + 20; // 标题区域 + 4行信息 + 底部边距（缩减了一行）

  // 分组显示订单（每组最多4个）
  for (let group = 0; group < Math.ceil(orderItems.length / 4); group++) {
    const startIdx = group * 4;
    const endIdx = Math.min(startIdx + 4, orderItems.length);
    const groupOrders = orderItems.slice(startIdx, endIdx);

    // 计算每列宽度（固定每列宽度，不是整行平分）
    const columnWidth = 280; // 固定每列宽度
    const startX = PADDING; // 左对齐，从左边开始绘制

    // 绘制每一列（独立的卡片边框）
    groupOrders.forEach((order, index) => {
      const cardX = startX + index * (columnWidth + 20); // 添加20px列间距
      const cardY = y;

      // 绘制每个订单卡片的独立边框
      ctx.setStrokeStyle(COLORS.border);
      ctx.setLineWidth(2);
      ctx.strokeRect(cardX, cardY, columnWidth, cardHeight);

      // 订单标题（订单1、订单2...）
      ctx.setFillStyle(COLORS.sectionTitle);
      ctx.setFontSize(26);
      ctx.setTextAlign('center');
      ctx.fillText(`订单${startIdx + index + 1}`, cardX + columnWidth / 2, cardY + 35);

      // 订单详情
      ctx.setFillStyle(COLORS.text);
      ctx.setFontSize(22);
      ctx.setTextAlign('left');

      let infoY = cardY + 65;
      const fields = [
        { label: '狗狗', value: order.dogName },
        { label: '总袋数', value: `${order.packageCount}袋` },
        { label: '每袋重量', value: `${order.packageSpecG}g` },
        { label: '总净重', value: `${formatDecimal(totalProductionG)}g` },
        { label: '收货人', value: order.recipientName ? `${order.recipientName}（${order.recipientCity || '未知'}）` : '未填写' },
      ];

      fields.forEach((field) => {
        ctx.setFillStyle(COLORS.textSecondary);
        ctx.fillText(field.label + '：', cardX + cardPadding, infoY);

        ctx.setFillStyle(COLORS.text);
        ctx.fillText(field.value, cardX + cardPadding + 100, infoY);

        infoY += lineHeight;
      });
    });

    y += cardHeight + 40; // 组之间的间距
  }

  return y;
}

/**
 * 绘制原料清单（带网格线，大字体）
 */
function drawIngredientsList(ctx: any, ingredients: ParsedIngredient[], y: number): number {
  y += 20; // 缩小与分装信息的间距

  // 居中绘制标题
  ctx.setFillStyle(COLORS.sectionTitle);
  ctx.setFontSize(28);
  ctx.setTextAlign('center');
  ctx.fillText(`原料清单（共${ingredients.length}种）`, A4_WIDTH / 2, y);

  y += 30; // 缩小标题与表格的间距

  // 表格配置
  const headerHeight = 50;
  const rowHeight = 45;

  // 列宽度配置（重新分配，填满整个CONTENT_WIDTH）
  const colType = 120; // 类型列
  const colName = 300; // 原料名称列
  const colAmount = 200; // 用量列
  const colMethod = CONTENT_WIDTH - colType - colName - colAmount; // 制备方法列（500px，填满剩余空间）

  // 绘制表头
  ctx.setFillStyle(COLORS.highlight);
  ctx.fillRect(PADDING, y, CONTENT_WIDTH, headerHeight);

  ctx.setStrokeStyle(COLORS.border);
  ctx.setLineWidth(2);
  ctx.strokeRect(PADDING, y, CONTENT_WIDTH, headerHeight);

  ctx.setFillStyle(COLORS.sectionTitle);
  ctx.setFontSize(25); // 缩小30%：36 * 0.7 = 25.2，取整25
  ctx.setTextAlign('center');

  // 表头标题（类型在最左边）
  let headerX = PADDING;
  ctx.fillText('类型', headerX + colType / 2, y + 35);
  headerX += colType;

  ctx.fillText('原料名称', headerX + colName / 2, y + 35);
  headerX += colName;

  ctx.fillText('用量', headerX + colAmount / 2, y + 35);
  headerX += colAmount;

  ctx.fillText('制备方法', headerX + colMethod / 2, y + 35);

  y += headerHeight;

  // 绘制原料列表
  let lastFoodIndex = -1; // 记录最后一个食材的索引
  ingredients.forEach((ingredient, index) => {
    if (ingredient.type === '食材') {
      lastFoodIndex = index;
    }
  });

  let hasInsertedTotalRow = false; // 标记是否已插入总重行

  ingredients.forEach((ingredient, index) => {
    // 绘制行背景（注意：在插入总重行后要重新计算背景）
    if (index % 2 === 0 && !hasInsertedTotalRow) {
      ctx.setFillStyle('#fafafa');
      ctx.fillRect(PADDING, y, CONTENT_WIDTH, rowHeight);
    }

    // 绘制网格线
    ctx.setStrokeStyle(COLORS.border);
    ctx.setLineWidth(1);

    // 外边框
    ctx.strokeRect(PADDING, y, CONTENT_WIDTH, rowHeight);

    // 竖向网格线
    let lineX = PADDING + colType;
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + rowHeight);
    ctx.stroke();

    lineX += colName;
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + rowHeight);
    ctx.stroke();

    lineX += colAmount;
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + rowHeight);
    ctx.stroke();

    // 绘制文字（缩小30%）
    ctx.setFontSize(23); // 缩小30%：33 * 0.7 = 23.1，取整23
    ctx.setTextAlign('center');

    let textX = PADDING;

    // 类型列（最左边）
    ctx.setFillStyle(ingredient.type === '食材' ? '#52c41a' : ingredient.type === '补剂' ? '#fa8c16' : '#999');
    ctx.fillText(ingredient.type, textX + colType / 2, y + 30);
    textX += colType;

    // 原料名称列（居中）
    ctx.setFillStyle(COLORS.text);
    ctx.fillText(ingredient.name, textX + colName / 2, y + 30);
    textX += colName;

    // 用量列（居中）
    ctx.fillText(`${ingredient.amount}${ingredient.unit}`, textX + colAmount / 2, y + 30);
    textX += colAmount;

    // 制备方法列（居中）
    if (ingredient.method) {
      ctx.fillText(ingredient.method, textX + colMethod / 2, y + 30);
    }

    y += rowHeight;

    // 如果是最后一个食材，在下一行插入"食材总重"（无边框）
    if (index === lastFoodIndex && !hasInsertedTotalRow) {
      hasInsertedTotalRow = true;

      // 计算食材总重
      const totalFoodWeight = ingredients
        .filter(ing => ing.type === '食材')
        .reduce((sum, ing) => {
          const amount = parseFloat(ing.amount);
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);

      // 绘制文字（无边框、无背景）
      ctx.setFontSize(23); // 使用与表格内容相同的字体大小
      ctx.setTextAlign('center');

      // 类型列：空
      ctx.setFillStyle(COLORS.text);
      ctx.fillText('', PADDING + colType / 2, y + 30);

      // 原料名称列：显示"食材总重"
      ctx.setFillStyle(COLORS.sectionTitle);
      ctx.setFontSize(25); // 使用与表头相同的字体大小
      ctx.fillText('食材总重', PADDING + colType + colName / 2, y + 30);

      // 用量列：显示重量数值和单位
      ctx.setFillStyle(COLORS.sectionTitle);
      ctx.setFontSize(25);
      ctx.fillText(
        `${formatDecimal(totalFoodWeight)}g`,
        PADDING + colType + colName + colAmount / 2,
        y + 30
      );

      // 制备方法列：空
      ctx.setFontSize(23);
      ctx.setFillStyle(COLORS.text);
      ctx.fillText('', PADDING + colType + colName + colAmount + colMethod / 2, y + 30);

      y += rowHeight;

      // 绘制分隔线（加粗，区分食材和补剂）
      ctx.setStrokeStyle(COLORS.sectionTitle);
      ctx.setLineWidth(2);
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(PADDING + CONTENT_WIDTH, y);
      ctx.stroke();
    }
  });

  return y + 30; // 删除提示文案，减少底部间距
}

/**
 * 绘制页脚
 */
function drawFooter(ctx: any, y: number) {
  ctx.setFillStyle(COLORS.textSecondary);
  ctx.setFontSize(16);
  ctx.setTextAlign('center');

  // 只显示系统名称，不显示打印时间
  ctx.fillText('Seven的厨房', A4_WIDTH / 2, y + 12);
}

/**
 * 解析原料列表
 */
function parseIngredients(taskDetail: TaskDetail): ParsedIngredient[] {
  if (!taskDetail.recipeSnapshot?.items) return [];

  const recipeSnapshot = taskDetail.recipeSnapshot;
  const totalProductionG = taskDetail.totalProductionG;
  const productionLossRate = recipeSnapshot.production_loss_rate || 1.1;

  const theoreticalWeight = totalProductionG * productionLossRate;

  return recipeSnapshot.items.map((item) => {
    let amount = 0;
    let unit = 'g';

    const typeMap: Record<string, string> = {
      'FOOD': '食材',
      'SUPPLEMENT': '补剂',
      'PACKAGING': '包装',
    };
    const type = item.ingredient_type ? typeMap[item.ingredient_type] : '';

    const preparationMethods = item.preparation_methods && item.preparation_methods.length > 0
      ? item.preparation_methods.join('、')
      : '';

    if (item.ingredient_type === 'SUPPLEMENT') {
      const finishedProductKG = totalProductionG / 1000;
      const totalNutrientNeeded = finishedProductKG * item.nutrient_target_value!;
      const nutrientKey = item.nutrient_target_key!;
      const activeNutrientValue = item.properties?.active_nutrients?.[nutrientKey]?.value;
      const activeNutrientUnit = item.properties?.active_nutrients?.[nutrientKey]?.unit;

      if (activeNutrientValue && activeNutrientUnit) {
        const baseUnits = totalNutrientNeeded / activeNutrientValue;
        const supplementLossRate = item.properties?.production_loss_rate || 1.05;
        const finalUnits = baseUnits * supplementLossRate;

        amount = finalUnits;
        unit = item.unit_display_label || 'g';
      } else {
        amount = 0;
        unit = 'g';
      }
    } else {
      amount = theoreticalWeight * (item.ratio / 100);
      unit = 'g';
    }

    return {
      id: item.ingredient_id,
      name: item.name,
      amount: formatDecimal(amount),
      unit,
      type,
      method: preparationMethods,
    };
  });
}

/**
 * 格式化数字
 */
function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
