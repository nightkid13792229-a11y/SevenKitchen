# 运维文档

| 文档 | 用途 |
|---|---|
| [生产部署与 SSH](deploy-and-ssh.md) | 后端/后台部署、SSH、日志、回滚 |
| [对象存储与图片](object-storage-and-images.md) | COS/CDN、证书、图片打不开 |
| [打印与标签](printing.md) | B3S 打印机、JCING SDK、打印排查 |

原则：**部署走脚本，不手改生产源码；配置以控制台/生产 `.env` 为准。**
