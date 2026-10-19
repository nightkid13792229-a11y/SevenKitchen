import { refreshCustomRecipeDraftAttachmentUrls } from '@/api/custom-recipe';

/**
 * 用草稿里的 COS key 换新的媒体代理 URL（2026-10-19）。
 *
 * 后端媒体 token 是进程内的，重启后旧预览 URL 会 404。
 * 这里只改预览 URL，不动 key/表单内容；失败静默保留旧 URL，
 * 不阻塞定制流程。
 */
export async function refreshCustomRecipeDraftMedia(form: any): Promise<void> {
  if (!form) return;

  const noteKeys: string[] = Array.isArray(form.attachmentKeys)
    ? form.attachmentKeys.map((key: unknown) => String(key || '').trim())
    : [];
  const reports: any[] = Array.isArray(form.reportDrafts)
    ? form.reportDrafts
    : [];
  const reportKeys: string[] = [];
  for (const report of reports) {
    const keys = Array.isArray(report?.attachmentKeys)
      ? report.attachmentKeys
      : [];
    for (const key of keys) {
      const value = String(key || '').trim();
      if (value) reportKeys.push(value);
    }
  }

  const keys = Array.from(new Set([...noteKeys, ...reportKeys].filter(Boolean)));
  if (!keys.length) return;

  let rows: Array<{ key: string; url: string }> = [];
  try {
    rows = await refreshCustomRecipeDraftAttachmentUrls(keys);
  } catch (error) {
    console.warn('[CustomRecipe] 刷新附件预览地址失败:', error);
    return;
  }

  const urlByKey = new Map(
    rows
      .filter((row) => row && row.key && row.url)
      .map((row) => [String(row.key), String(row.url)]),
  );
  if (!urlByKey.size) return;

  if (Array.isArray(form.attachmentUrls)) {
    form.attachmentUrls = form.attachmentUrls.map((url: string, index: number) => {
      const key = noteKeys[index];
      return (key && urlByKey.get(key)) || url;
    });
  }

  for (const report of reports) {
    const keys = Array.isArray(report?.attachmentKeys)
      ? report.attachmentKeys
      : [];
    if (!Array.isArray(report?.attachments)) continue;
    report.attachments = report.attachments.map((url: string, index: number) => {
      const key = String(keys[index] || '').trim();
      return (key && urlByKey.get(key)) || url;
    });
  }
}
