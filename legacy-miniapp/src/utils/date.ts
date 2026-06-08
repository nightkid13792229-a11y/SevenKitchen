/**
 * 日期格式化工具（MiniApp端）
 * 统一处理日期显示格式
 * 自动转换为浏览器本地时区（中国用户为UTC+8）
 */

/**
 * 格式化为完整日期时间（YYYY/MM/DD HH:mm）
 * 用于订单详情页
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为短日期时间（MM-DD HH:mm）
 * 用于订单列表页
 */
export function formatShortDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '';
  }
}

/**
 * 格式化为纯日期（YYYY-MM-DD）
 * 用于生产标签、日期选择器
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为中文日期（X月X日）
 * 用于采购管理
 */
export function formatChineseDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}

/**
 * 格式化为中文日期时间（X月X日 HH:mm）
 * 用于采购管理详情
 */
export function formatChineseDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  } catch (error) {
    console.error('Date format error:', error);
    return '-';
  }
}
