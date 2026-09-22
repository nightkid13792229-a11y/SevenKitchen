/**
 * Jest 全局环境准备
 *
 * 测试里有相当一部分 e2e 用例依赖开发用的身份后门（X-Customer-Id 请求头兜底）来鉴权，
 * 而该后门在代码里是 **fail-closed（默认关闭）**，所以这里为测试统一打开。
 *
 * ⚠️ 这仅作用于测试进程。生产环境不设置 ALLOW_DEV_AUTH，后门保持关闭。
 *
 * 「关闭时必须拒绝」这一行为由以下用例专门覆盖，不要删：
 *   - tests/interfaces/auth/auth.guard.spec.ts
 *     （未开启 ALLOW_DEV_AUTH 时，带 X-Customer-Id 也必须 401）
 *   - tests/interfaces/controllers/auth.controller.spec.ts
 *     （未开启 ALLOW_DEV_AUTH 时，/auth/login 不得签发任何令牌）
 */
process.env.ALLOW_DEV_AUTH = 'true';
