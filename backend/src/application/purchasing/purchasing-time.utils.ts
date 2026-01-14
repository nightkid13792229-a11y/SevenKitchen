/**
 * Purchasing Time Utilities
 * 采购时间验证工具
 *
 * 根据方案，所有采购操作必须在早上6点至下午2点之间完成
 */

/**
 * 检查当前时间是否在允许的采购操作时间范围内
 * @param currentTime 当前时间（默认为当前本地时间）
 * @returns 是否在允许的时间范围内（6:00-14:00）
 */
export function isWithinPurchasingHours(currentTime: Date = new Date()): boolean {
  const hour = currentTime.getHours();
  return hour >= 6 && hour < 14;
}

/**
 * 检查采购清单是否可以操作（基于目标日期）
 * @param targetDate 采购清单的目标日期
 * @param currentDate 当前日期（默认为今天）
 * @returns 是否可以操作（目标日期必须>=今天）
 */
export function canOperateOnPurchaseList(targetDate: Date, currentDate: Date = new Date()): boolean {
  // 将两个日期都设置为本地时间0点
  const targetLocal = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const currentLocal = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  return targetLocal >= currentLocal;
}

/**
 * 验证采购操作是否被允许
 * @param targetDate 采购清单的目标日期
 * @param operation 操作名称（用于错误提示）
 * @returns 如果不允许，抛出异常
 */
export function validatePurchasingOperation(targetDate: Date, operation: string): void {
  // 检查时间是否在允许范围内（6:00-14:00）
  if (!isWithinPurchasingHours()) {
    throw new Error(
      `${operation}的时间为每天早上6点至下午2点`
    );
  }

  // 检查目标日期是否有效（目标日期必须>=今天）
  if (!canOperateOnPurchaseList(targetDate)) {
    throw new Error(
      `${operation}只能操作当天或未来日期的采购清单`
    );
  }
}

/**
 * 检查采购清单是否为历史清单
 * @param targetDate 采购清单的目标日期
 * @param currentDate 当前日期（默认为今天）
 * @returns 是否为历史清单（目标日期<今天）
 */
export function isHistoricalPurchaseList(targetDate: Date, currentDate: Date = new Date()): boolean {
  return !canOperateOnPurchaseList(targetDate, currentDate);
}
