# 对象存储与图片

> 状态：2026-11-03 合并整理。本文是运行手册；具体桶/域名/密钥以腾讯云控制台和生产 `.env` 为准。
> 旧的多份 COS/BCS/分享图片文档已归档到 `docs/_archive/legacy/`，只作历史参考。

---

## 1. 当前配置（已知）

| 项 | 值 |
|---|---|
| 存储桶 | `sevenkitchen-mvp-123-1392823718` |
| 地域 | `ap-chengdu`（成都） |
| CDN 域名 | `img.sevenkitchen.cloud` |
| 头像路径 | `avatars/{用户ID}` |
| BCS 图片路径 | `bcs-standards/` |
| 后端环境变量 | `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION` |

> 这些值来自 2026-02 的配置文档；如果控制台已变，以控制台/生产 `.env` 为准。
> **密钥只放环境变量，绝不写进代码、文档、git。**

图片 URL 形态：

```text
https://img.sevenkitchen.cloud/avatars/{用户ID}/{文件名}
https://img.sevenkitchen.cloud/bcs-standards/{文件名}
```

---

## 2. 图片访问链路

```text
小程序/后台 → 上传接口 → COS 桶 → CDN (img.sevenkitchen.cloud) → 微信/浏览器
```

- 上传走后端统一媒体接口，不要在页面里直传并硬编码密钥。
- 对外展示统一用 CDN 域名，不直接用 COS 原始域名。
- 微信小程序需要把 `img.sevenkitchen.cloud` 配到合法域名（downloadFile 等）里；
  否则开发者工具能看、真机加载失败。

---

## 3. CDN 证书续期

`img.sevenkitchen.cloud` 的证书由 **acme.sh** 自动续期，续期后由
`scripts/deploy_to_tencent_cdn.sh` 自动上传到腾讯云 CDN。

关键信息（详见 [scripts/README](../../scripts/README.md)）：

- 脚本在生产机 `/root/.acme.sh/deploy_to_tencent_cdn.sh`；
- cron 每天 `00:34` 检查续期；
- 日志 `/var/log/tencent-cdn-deploy.log`；
- 证书 `/etc/letsencrypt/live/img.sevenkitchen.cloud/`。

排障顺序：

1. 看日志有没有 `UploadCertificate` / `UpdateDomainConfig` 报错；
2. 看 CDN 控制台实际生效的证书是不是最新；
3. 证书过期会导致图片全站不可用；不要只看看接口返回成功。

---

## 4. 图片打不开的排查清单

- [ ] 浏览器直接打开图片 URL，是否 200？
- [ ] 是 403/404：COS 文件是否存在、权限/防盗链是否拦了？
- [ ] 是证书错误：CDN 证书是否过期/未更新？
- [ ] 开发者工具正常、真机失败：微信合法域名是否配置？
- [ ] 刚上传不显示：CDN 缓存是否未刷新？
- [ ] 图片过大/格式不支持：压缩或转 JPG/PNG/WebP。
- [ ] 分享图不显示：分享图域名/尺寸/格式是否满足微信要求？

---

## 5. 上传流程（新增图片）

1. 确认用途：头像 / BCS / 食谱封面 / 分享图；
2. 按对应路径上传（头像 `avatars/`，BCS `bcs-standards/`，其它按业务前缀）；
3. 确认 CDN URL 可访问；
4. 在小程序真机验证（开发者工具通过不代表真机通过）；
5. 不要提交密钥或临时签名 URL。

---

## 6. 历史文档

已归档到 `docs/_archive/legacy/`：

- `COS_SETUP_GUIDE.md`、`COS_AVATAR_CONFIG.md`、`COS_BCS_IMAGES_CONFIG.md`
- `BCS_IMAGE_FIX_GUIDE.md`、`BCS_IMAGE_TROUBLESHOOTING.md`
- `TENCENT_COS_SETUP.md`
- `2026-02-02-cdn-domain-verification.md`
- `2026-02-02-wechat-share-deployment.md`
- `2026-02-02-wechat-share-fix-testing-guide.md`
- `2026-02-02-wechat-share-image-issue-report.md`

需要看当时的具体步骤/截图时再翻；不要按旧文档直接改生产配置。
