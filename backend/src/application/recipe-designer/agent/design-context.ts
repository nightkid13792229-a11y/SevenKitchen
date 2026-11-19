import type {
  AgentDesignContext,
  AgentDesignContextAttachment,
  AgentDesignContextAttachmentKind,
  AgentDesignContextAttachmentRecordType,
} from './design-context.types';

/**
 * 本单设计上下文的纯函数部分（2026-11-19）。
 *
 * 查询在 `RecipeDesignerService.getAgentDesignContext` 里做；这里只放
 * “附件分类 / 标签生成 / 给模型看的摘要”这类可单测的逻辑。
 */

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
]);

const PDF_EXTENSIONS = new Set(['pdf']);

/** 按 URL 的扩展名判断原件类型；判断不了时按 OTHER 处理，不猜。 */
export function classifyAttachment(
  url: string,
): AgentDesignContextAttachmentKind {
  const path = String(url ?? '')
    .split('?')[0]
    .split('#')[0];
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const extension = match?.[1]?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(extension)) return 'IMAGE';
  if (PDF_EXTENSIONS.has(extension)) return 'PDF';
  return 'OTHER';
}

const RECORD_TYPE_LABEL: Record<
  AgentDesignContextAttachmentRecordType,
  string
> = {
  MEDICAL: '就诊',
  CHECKUP: '体检',
  ALLERGY: '过敏报告',
};

/**
 * 把一条记录上的附件 URL 数组转成稳定 id + 标签。
 *
 * id 用「记录类型:记录 id:序号」而不是 URL：模型引用的是“第几张”，
 * URL 又长又可能带签名参数，不适合进上下文。
 */
export function buildAttachmentList(
  recordType: AgentDesignContextAttachmentRecordType,
  recordId: string,
  recordDate: string | null,
  urls: readonly string[] | null | undefined,
): AgentDesignContextAttachment[] {
  const list = Array.isArray(urls) ? urls : [];
  return list
    .map((url, index) => ({ url, index }))
    .filter(({ url }) => typeof url === 'string' && url.trim().length > 0)
    .map(({ url, index }) => ({
      id: `${recordType}:${recordId}:${index}`,
      recordType,
      recordId,
      recordDate,
      kind: classifyAttachment(url as string),
      label: `${RECORD_TYPE_LABEL[recordType]}${recordDate ? ` ${recordDate}` : ''} 附件${index + 1}`,
      url: url as string,
    }));
}

/** 给模型看的一句摘要：这单是谁、读到了多少、缺什么。 */
export function summarizeDesignContext(context: AgentDesignContext): string {
  const parts: string[] = [];
  if (context.mode === 'ORDER') {
    const orderNo = context.order?.orderNo ?? '订单缺失';
    const dogName = context.dog?.name ?? '狗狗缺失';
    parts.push(`订单定制 ${orderNo}，狗狗 ${dogName}`);
  } else {
    parts.push('产品线设计（不绑定订单/狗狗）');
  }

  if (context.unavailableReason) {
    parts.push(`背景读取失败：${context.unavailableReason}`);
  }

  const counts = context.counts;
  parts.push(
    `就诊 ${counts.medicalRecords} 条、体检 ${counts.checkupRecords} 条、过敏 ${counts.allergyRecords + counts.allergyReports} 条、体重 ${counts.weightRecords} 条、附件 ${counts.attachments} 张（图片 ${counts.images} 张）`,
  );

  if (context.missing.length > 0) {
    parts.push(`缺：${context.missing.join('、')}`);
  }

  return `${parts.join('；')}。`;
}
