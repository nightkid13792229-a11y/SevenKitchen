/**
 * 日期格式化工具（AdminWeb端）
 * 统一处理日期显示格式
 * 自动转换为浏览器本地时区（中国用户为UTC+8）
 */

/**
 * 格式化为本地日期时间
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Date parsing error:', error);
    return '-';
  }
}

/**
 * 格式化为本地日期
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    console.error('Date parsing error:', error);
    return '-';
  }
}
