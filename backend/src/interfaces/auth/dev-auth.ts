/**
 * 开发用身份后门开关
 *
 * 背景（2026-09-22 安全排查）：线上存在两条可以"只要知道用户 ID 就能冒充他"的通道 ——
 *
 *   1. `POST /auth/login`：传入任意 customerId 即签发该用户的 JWT，
 *      且令牌里带的是数据库中的**真实角色**。拿到管理员 ID 就等于拿到管理员权限（提权）。
 *   2. `AuthGuard` 的 `X-Customer-Id` 请求头兜底：无需令牌即可冒充任意用户
 *      （角色固定为 CUSTOMER，不能提权，但能读写他人数据）。
 *
 * 两条通道对本地开发与冒烟脚本有用，所以在开发环境保留；线上必须关闭。
 *
 * 为什么用显式开关、而不是判断 NODE_ENV：
 *   主生产服务（systemd `sevenkitchen-backend.service`）**并未设置 NODE_ENV**，
 *   用它判断会把线上误判成"非生产"，后门依旧敞开。
 *
 * 因此这里采用 **fail-closed（默认关闭）**：只有显式设置 ALLOW_DEV_AUTH=true 才启用。
 * 生产什么都不用配，天然是安全的。
 */
export function isDevAuthEnabled(): boolean {
  return process.env.ALLOW_DEV_AUTH === 'true';
}
