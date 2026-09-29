#!/bin/bash
# 自动部署 SSL 证书到腾讯云 CDN
# 由 acme.sh 续期后自动执行（Le_ReloadCmd）
#
# 2026-09-29 修复说明：
#   1) CertId 必须放在 Https.CertInfo 内。旧脚本放在 Https 顶层，
#      腾讯云 API 会静默忽略未知字段并返回成功，导致"证书上传成功但 CDN 从未换证"，
#      直到旧证书过期才暴露（2026-09-29 图片全站不可用事故的根因）。
#   2) acme.sh 在非 debug 模式会丢弃 reload 命令的输出，故障完全不可见。
#      现改为脚本自行落盘日志，失败时返回非 0。
#   3) 增加回读校验：部署后确认 CDN 上真正生效的证书就是本次上传的证书。

set -uo pipefail

DOMAIN="${1:-img.sevenkitchen.cloud}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
LOG_FILE="/var/log/tencent-cdn-deploy.log"

exec >> "$LOG_FILE" 2>&1

echo ""
echo "=========================================================="
echo "=== 部署证书到腾讯云 CDN: ${DOMAIN} ==="
echo "时间: $(date '+%F %T %Z')"

if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
    echo "ERROR: 证书文件不存在: ${CERT_DIR}"
    exit 1
fi

CERT_PUB=$(cat "${CERT_DIR}/fullchain.pem")
CERT_KEY=$(cat "${CERT_DIR}/privkey.pem")

if [ -z "$CERT_PUB" ] || [ -z "$CERT_KEY" ]; then
    echo "ERROR: 证书文件为空"
    exit 1
fi

echo "步骤 1: 上传证书到腾讯云 SSL ..."
UPLOAD_RESULT=$(tccli ssl UploadCertificate \
    --CertificatePublicKey "$CERT_PUB" \
    --CertificatePrivateKey "$CERT_KEY" \
    --Alias "${DOMAIN}-auto-$(date +%Y%m%d%H%M%S)" \
    --ProjectId 0 \
    --output json 2>&1)

echo "$UPLOAD_RESULT"

CERT_ID=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('CertificateId',''))" 2>/dev/null || echo "")

if [ -z "$CERT_ID" ] || [ "$CERT_ID" = "None" ]; then
    echo "ERROR: 上传证书失败，未拿到 CertificateId"
    exit 1
fi
echo "✓ 证书已上传，CertId = ${CERT_ID}"

echo ""
echo "步骤 2: 绑定证书到 CDN ..."
HTTPS_CONF=$(python3 -c "
import json, sys
print(json.dumps({
    'Switch': 'on',
    'Http2': 'on',
    'OcspStapling': 'off',
    'VerifyClient': 'off',
    'CertInfo': {'CertId': sys.argv[1]},
}, ensure_ascii=False))
" "$CERT_ID")
echo "请求参数: $HTTPS_CONF"

UPDATE_RESULT=$(tccli cdn UpdateDomainConfig \
    --Domain "${DOMAIN}" \
    --Https "$HTTPS_CONF" \
    --output json 2>&1)

echo "$UPDATE_RESULT"

if ! echo "$UPDATE_RESULT" | grep -q "RequestId"; then
    echo "ERROR: 调用 CDN UpdateDomainConfig 失败"
    exit 1
fi

echo ""
echo "步骤 3: 回读校验 ..."
sleep 5

ACTUAL_CERT_ID=$(tccli cdn DescribeDomainsConfig \
    --Filters "[{\"Name\":\"domain\",\"Value\":[\"${DOMAIN}\"]}]" \
    --output json 2>/dev/null \
    | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    doms = d.get('Domains', [])
    print((doms[0].get('Https') or {}).get('CertInfo', {}).get('CertId', '') if doms else '')
except Exception:
    print('')
" 2>/dev/null)

echo "期望 CertId: ${CERT_ID}"
echo "实际 CertId: ${ACTUAL_CERT_ID}"

if [ "$ACTUAL_CERT_ID" = "$CERT_ID" ]; then
    echo "✓✓ 成功：证书已部署到 CDN 并校验通过"
    exit 0
else
    echo "✗✗ 失败：CDN 上的证书与本次上传的不一致！"
    echo "    请手动检查：腾讯云控制台 -> CDN -> ${DOMAIN} -> HTTPS 配置"
    exit 1
fi
