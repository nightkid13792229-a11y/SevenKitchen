/**
 * 小程序运行时的全局对象声明（2026-10-01 自查补）。
 *
 * 为什么需要这个文件：
 *   `tsconfig.json` 的 `lib` 只给了 `ES2017 + ESNext`（故意不给 DOM —— 小程序里
 *   没有 `document`/`window`，给了反而会让人误用浏览器 API），`types` 只给了
 *   `@dcloudio/types`（没有 node）。于是**运行时明明有的东西**在类型上找不到：
 *   `setTimeout` / `clearTimeout` / `console` 全都是 "Cannot find name"。
 *   结果类型检查里 1600 多条报错有 1100 多条是这种噪音，真正的问题被淹在里面。
 *
 * 这里只声明**微信小程序与 uni-app 都确实提供**的那几个：
 *   · 定时器：setTimeout / clearTimeout / setInterval / clearInterval
 *     （uni-app 官方文档明确支持，返回值是数字句柄）
 *   · console：小程序基础库提供 log/info/warn/error/debug
 *
 * **故意不声明** `window` / `document` / `localStorage` 这类浏览器专属对象，
 * 也不声明 `process`（小程序里没有）：代码里真用到了就该报错。
 */
declare const console: {
  log(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace(...args: unknown[]): void
  group(...args: unknown[]): void
  groupEnd(): void
  time(label?: string): void
  timeEnd(label?: string): void
}

declare function setTimeout(
  handler: (...args: unknown[]) => void,
  timeout?: number,
  ...args: unknown[]
): number

declare function clearTimeout(handle?: number | null): void

declare function setInterval(
  handler: (...args: unknown[]) => void,
  timeout?: number,
  ...args: unknown[]
): number

declare function clearInterval(handle?: number | null): void
