import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface PageEntry {
  path: string
  style?: Record<string, unknown>
}

interface PagesConfig {
  pages: PageEntry[]
  subPackages?: Array<{ root: string; pages: PageEntry[] }>
}

const readPagesConfig = (): PagesConfig =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'))

/** 主包 + 分包的完整页面路径（与用户实际导航的路径一致）。 */
export const readAllPagePaths = (): string[] => {
  const config = readPagesConfig()

  return [
    ...config.pages.map((page) => page.path),
    ...(config.subPackages || []).flatMap((subPackage) =>
      subPackage.pages.map((page) =>
        `${subPackage.root}/${page.path}`.replace(/\/+/g, '/'),
      ),
    ),
  ]
}
