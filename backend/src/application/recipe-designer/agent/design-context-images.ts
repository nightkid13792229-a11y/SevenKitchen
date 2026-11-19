import type {
  DeepSeekContentPart,
  DeepSeekToolsMessage,
} from '../deepseek-tools-chat';
import type { ToolOutcome } from './agent-types';
import type { AgentDesignContext } from './design-context.types';

/**
 * 健康档案附件 → 模型图片消息（2026-11-19）。
 *
 * 与知识库页图不同，这里给的是**公网原件 URL**，不需要后端先下载。
 * `deepseek-flash` 支持外部图片 URL（≤8192 字符、60 秒内可下载）。
 *
 * 只处理 IMAGE；PDF/Word 先不内联（需要 Files API 上传拿 file_id），
 * 在附件列表里保留 kind，模型能看到但不会假装读过。
 */

export interface DesignContextImage {
  url: string;
  label: string;
}

/**
 * 一次最多内联多少张图。
 *
 * 上限设得高（200）是为了“不能漏”：常见狗狗只有几张到几十张；
 * 极端情况再截断，并在工具结果里明确告诉模型还有多少张没读。
 */
const MAX_INLINE_IMAGES = 200;

export function splitDesignContextImages(
  name: string,
  outcome: ToolOutcome,
): { outcome: ToolOutcome; images: DesignContextImage[] } {
  if (name !== 'read_design_context' || !outcome.ok) {
    return { outcome, images: [] };
  }
  const data = outcome.data as AgentDesignContext | undefined;
  if (!data || !Array.isArray(data.attachments)) {
    return { outcome, images: [] };
  }

  const imageAttachments = data.attachments.filter(
    (item) => item.kind === 'IMAGE' && Boolean(item.url),
  );
  const images = imageAttachments
    .slice(0, MAX_INLINE_IMAGES)
    .map((item) => ({ url: item.url, label: item.label }));

  const strippedAttachments = data.attachments.map(({ url, ...rest }) => rest);

  return {
    outcome: {
      ...outcome,
      data: {
        ...data,
        attachments: strippedAttachments,
        // URL 摘掉后仍告诉模型“有几张图被内联 / 被截断”，避免它以为没有附件。
        inlineImageCount: images.length,
        omittedImageCount: Math.max(0, imageAttachments.length - images.length),
        uninlinedAttachmentCount: data.attachments.filter(
          (item) => item.kind !== 'IMAGE',
        ).length,
      },
    },
    images,
  };
}

export function buildDesignContextImageMessage(
  images: DesignContextImage[],
): DeepSeekToolsMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: '（系统注入）以下是本单健康档案的图片附件，按标签顺序逐张阅读；看不清的写【看不清】，不要猜。PDF/其它附件未内联，不要假装读过。',
      },
      ...images.flatMap((image): DeepSeekContentPart[] => [
        { type: 'text', text: image.label },
        { type: 'image_url', image_url: { url: image.url } },
      ]),
    ],
  };
}
