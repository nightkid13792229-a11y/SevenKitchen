import { Injectable } from '@nestjs/common';
import { realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 页图定位（设计 §6.4）。
 *
 * `kb_page.image_path` 存的是**相对** `KB_PAGE_IMAGE_ROOT` 的路径；
 * 这里把它拼成绝对路径，并确认解析后的真实路径仍在 root 下，
 * 避免 `../` 或绝对路径把读取逃逸到知识库目录之外。
 *
 * 文件不存在 / 越界 / 页无图一律返回 `null`，不抛错：
 * 页图缺失不应让整次 `kb_read` 失败（解析器漏渲一页是常态）。
 */

/**
 * 本地开发的默认页图根：`npm run kb:v3:smoke` / `npm test` 的 cwd 是 `backend/`，
 * 页图在仓库根的 `docs/knowledge-base/page-images`，所以默认要往上一级找。
 * 生产显式设置 `KB_PAGE_IMAGE_ROOT=/var/lib/sevenkitchen/kb/page-images`，不依赖默认值。
 */
const DEFAULT_IMAGE_ROOT = path.resolve(
  process.cwd(),
  '../docs/knowledge-base/page-images',
);

export interface ResolvedPageImage {
  absolutePath: string;
  mime: 'image/jpeg';
}

@Injectable()
export class PageImageService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    documentId: string,
    pageNo: number,
  ): Promise<ResolvedPageImage | null> {
    if (!documentId || !Number.isInteger(pageNo)) return null;

    const page = await this.prisma.kbPage.findFirst({
      where: { sourceId: documentId, pageNo },
      select: { imagePath: true },
    });
    const imagePath = page?.imagePath;
    if (!imagePath) return null;

    return resolveWithinRoot(imagePath);
  }
}

/**
 * 导出给测试/调用方复用：root 每次读取环境变量，避免模块加载时就固化。
 */
export function imageRoot(): string {
  return path.resolve(process.env.KB_PAGE_IMAGE_ROOT || DEFAULT_IMAGE_ROOT);
}

async function resolveWithinRoot(
  imagePath: string,
): Promise<ResolvedPageImage | null> {
  const root = imageRoot();
  const candidate = path.resolve(root, imagePath);
  if (!isInside(root, candidate)) return null;

  try {
    // realpath 解析符号链接后再比较一次，防止 root 内软链指向外部。
    const [realRoot, realCandidate] = await Promise.all([
      realpath(root),
      realpath(candidate),
    ]);
    if (!isInside(realRoot, realCandidate)) return null;

    const info = await stat(realCandidate);
    if (!info.isFile()) return null;

    return { absolutePath: realCandidate, mime: 'image/jpeg' };
  } catch {
    // ENOENT（文件不存在）/ 权限问题都按“无页图”处理。
    return null;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
