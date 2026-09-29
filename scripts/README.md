# scripts/ 目录说明

本目录存放**运维脚本**。

| 脚本 | 用途 |
|---|---|
| `env.sh` | 本地环境切换（dev / prod / status） |
| `deploy_to_tencent_cdn.sh` | **SSL 证书续期后自动部署到腾讯云 CDN**（详见下文） |

---

# deploy_to_tencent_cdn.sh

## 它解决什么问题

`img.sevenkitchen.cloud` 是小程序的图片 CDN 域名，所有食谱封面、商品图、分享图、狗狗头像都从这里加载。
证书由 **acme.sh** 自动续期（ZeroSSL），但**续期只负责签发新证书，不会自动装到 CDN 上**。
这个脚本就是补上"装到 CDN"这一步。

## 运行位置与触发方式

脚本**不在本仓库运行**，而是部署在**生产服务器**上：

| 项目 | 值 |
|---|---|
| 生产服务器 | `1.14.3.2`（`VM-0-13-ubuntu`） |
| 实际路径 | `/root/.acme.sh/deploy_to_tencent_cdn.sh` |
| 触发方式 | acme.sh 的 `Le_ReloadCmd` 钩子（证书**续期成功后**自动调用） |
| 定时检查 | root crontab：`34 0 * * * /root/.acme.sh/acme.sh --cron`（每日 00:34） |
| 运行日志 | `/var/log/tencent-cdn-deploy.log` |

钩子配置位于 `/root/.acme.sh/img.sevenkitchen.cloud/img.sevenkitchen.cloud.conf`：

```
Le_ReloadCmd='__ACME_BASE64__START_<base64>__ACME_BASE64__END_'
```

解码后为：`/root/.acme.sh/deploy_to_tencent_cdn.sh img.sevenkitchen.cloud`

## 依赖

- **`tccli`**（腾讯云 CLI）—— 已安装在 `/usr/local/bin/tccli`
- **tccli 凭证** —— 位于 `/root/.tccli/default.credential`（**不在本仓库，也不应入库**）
- **`python3`** —— 用于拼装请求参数和解析回读结果
- 证书文件 —— `/etc/letsencrypt/live/img.sevenkitchen.cloud/{fullchain.pem,privkey.pem}`

脚本本身**不含任何密钥**，凭证完全由 tccli 自行管理，因此可以安全入库。

## 执行流程

1. **上传证书** —— `tccli ssl UploadCertificate`，得到一个 `CertId`
2. **绑定到 CDN** —— `tccli cdn UpdateDomainConfig`
3. **回读校验** —— `tccli cdn DescribeDomainsConfig`，确认 CDN **实际生效**的 `CertId` 与本次上传的一致；不一致则报错并以非 0 退出

## ⚠️ 两个必须保留的实现细节

改这个脚本前请务必理解以下两点，它们都是 2026-09-29 P0 事故的直接产物：

### 1. `CertId` 必须放在 `Https.CertInfo` 内

```jsonc
// ✅ 正确
{"Switch":"on", "CertInfo": {"CertId": "xxx"}}

// ❌ 错误 —— 腾讯云会静默忽略顶层 CertId，返回成功但证书不会变
{"Switch":"on", "CertId": "xxx"}
```

腾讯云 API 对**未知字段静默忽略**。旧脚本正是因为把 `CertId` 放在了顶层，导致
"上传成功、接口返回成功、脚本打印成功，但 CDN 一个月都没换证"，直到旧证书过期、图片全站不可用才暴露。

### 2. 必须保留回读校验

只判断接口是否返回 `RequestId` 是**不够的**（上述故障中它每次都返回成功）。
唯一可靠的判断是**回读 CDN 实际生效的证书**。这也让"假装成功"不再可能。

## 手动执行（排查用）

```bash
# 在生产服务器上
/root/.acme.sh/deploy_to_tencent_cdn.sh img.sevenkitchen.cloud
echo "退出码: $?"
tail -30 /var/log/tencent-cdn-deploy.log
```

正常输出应包含：

```
步骤 1: 上传证书 ... ✓ 证书已上传，CertId = xxxxxxxx
步骤 2: 绑定证书到 CDN ...
步骤 3: 回读校验 ... 期望 CertId: xxxxxxxx / 实际 CertId: xxxxxxxx
✓✓ 成功：证书已部署到 CDN 并校验通过
```

## 服务器重建时如何恢复

本脚本已纳入版本控制，服务器重建后按以下步骤恢复：

1. 安装 acme.sh 并配置 `img.sevenkitchen.cloud` 的续期（DNS 验证 `dns_dp`，CA 为 ZeroSSL）
2. 安装 tccli 并配置凭证：`tccli configure`
3. 将本文件复制到服务器并赋予执行权限：
   ```bash
   install -m 755 scripts/deploy_to_tencent_cdn.sh /root/.acme.sh/deploy_to_tencent_cdn.sh
   ```
4. 设置 acme.sh 续期钩子：
   ```bash
   /root/.acme.sh/acme.sh --install-cert -d img.sevenkitchen.cloud \
     --key-file       /etc/letsencrypt/live/img.sevenkitchen.cloud/privkey.pem \
     --fullchain-file /etc/letsencrypt/live/img.sevenkitchen.cloud/fullchain.pem \
     --reloadcmd       "/root/.acme.sh/deploy_to_tencent_cdn.sh img.sevenkitchen.cloud"
   ```
5. 手动跑一次验证：见上方「手动执行」

## 相关文档

- 事故复盘：`docs/reports/2026-09-29-image-cdn-certificate-outage.md`

## 注意：本仓库还有另一套证书体系

除本脚本管理的 `img.sevenkitchen.cloud`（走 acme.sh + 腾讯云 CDN）外，
`api` / `dsh` / `sevenkitchen.cloud` / `www` 四个域名走的是 **Certbot + nginx**，
由 `certbot.timer` 自动续期，与本脚本无关。改动时请勿混淆。
