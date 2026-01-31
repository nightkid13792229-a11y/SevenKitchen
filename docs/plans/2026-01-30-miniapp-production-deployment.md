# WeChat Mini Program Production Deployment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy SevenKitchen WeChat Mini Program to production environment with proper configuration and testing

**Architecture:**
- Build uni-app project for WeChat Mini Program platform
- Configure production API endpoints (api.sevenkitchen.cloud)
- Configure WeChat AppID for production release
- Upload to WeChat platform and submit for review

**Tech Stack:**
- uni-app (Vue 3 + TypeScript)
- WeChat Mini Program platform
- Vite build system
- Production API: https://api.sevenkitchen.cloud

---

## Prerequisites

Before starting deployment, ensure:

1. ✅ Backend API is deployed and accessible at `https://api.sevenkitchen.cloud`
2. ✅ WeChat Mini Program AppID is configured in `manifest.json`
3. ✅ All development features are disabled (dev tools, debug logs)
4. ✅ COS (Tencent Cloud Object Storage) is configured for production

---

## Task 1: Pre-Deployment Configuration Check

**Files:**
- Verify: `miniapp/src/manifest.json`
- Verify: `miniapp/project.config.json`
- Verify: `miniapp/src/utils/config.ts`
- Verify: `miniapp/vite.config.ts`

**Step 1: Check WeChat AppID configuration**

Verify that the production AppID is set in configuration files:

```bash
# Check manifest.json
grep "appid" miniapp/src/manifest.json

# Check project.config.json
grep "appid" miniapp/project.config.json
```

Expected output:
- `manifest.json`: Should have `"appid": "wx2c1e8f1a2d7c2406"` (or your production AppID)
- `project.config.json`: Should have the same AppID

⚠️ **If AppID is empty**, you must obtain it from WeChat MP Platform:
1. Login to https://mp.weixin.qq.com
2. Go to "开发" → "开发设置" → "开发者ID"
3. Copy the AppID and update both files

**Step 2: Verify production API configuration**

Check that `config.ts` uses production URL for builds:

```bash
# View config.ts production settings
grep -A 2 "PROD_BASE_URL" miniapp/src/utils/config.ts
```

Expected: `const PROD_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'`

**Step 3: Check build output configuration**

```bash
# View vite.config.ts build settings
grep -A 5 "build:" miniapp/vite.config.ts
```

Expected: `outDir: 'dist/dev/mp-weixin'` (or appropriate output directory)

**Step 4: Verify domain whitelist in WeChat MP Platform**

Login to WeChat MP Platform and verify domains are whitelisted:

1. Visit: https://mp.weixin.qq.com
2. Navigate: 开发 → 开发管理 → 开发设置 → 服务器域名
3. Verify the following domains are in the whitelist:
   - **request合法域名**: `https://api.sevenkitchen.cloud`
   - **uploadFile合法域名**: `https://api.sevenkitchen.cloud`
   - **downloadFile合法域名**: `https://api.sevenkitchen.cloud`

⚠️ **If domains are not whitelisted**, add them before deployment. Domain changes may take up to 24 hours to take effect.

---

## Task 2: Update manifest.json for Production

**Files:**
- Modify: `miniapp/src/manifest.json`

**Step 1: Update version information**

Edit `miniapp/src/manifest.json`:

```json
{
  "name": "SevenKitchen",
  "appid": "wx2c1e8f1a2d7c2406",
  "description": "专业鲜食套餐定制",
  "versionName": "1.0.0",
  "versionCode": "100"
}
```

Key changes:
- ✅ Set `appid` to production AppID
- ✅ Update `description` for production
- ✅ Set appropriate `versionName` and `versionCode`

**Step 2: Enable production settings**

Ensure the following settings in `manifest.json`:

```json
{
  "mp-weixin": {
    "setting": {
      "urlCheck": true,  // ⚠️ MUST be true for production
      "es6": true,
      "enhance": true,
      "postcss": true,
      "minified": true
    },
    "optimization": {
      "subPackages": true
    }
  }
}
```

⚠️ **CRITICAL**: `urlCheck` must be `true` for production builds!

**Step 3: Commit configuration changes**

```bash
cd miniapp
git add src/manifest.json
git commit -m "chore: update manifest.json for production deployment"
```

---

## Task 3: Build Production Package

**Files:**
- Create: `miniapp/dist/build/mp-weixin/*` (build output)
- Script: `miniapp/scripts/mp-weixin-build.sh`

**Step 1: Clean previous build artifacts**

```bash
cd miniapp
rm -rf dist/build/mp-weixin
echo "✓ Cleaned previous build output"
```

**Step 2: Install dependencies (if needed)**

```bash
# Ensure dependencies are up to date
pnpm install
# or: npm install
```

**Step 3: Run production build**

```bash
# Execute build script
bash scripts/mp-weixin-build.sh
```

Expected output:
```
=== Uni-app WeChat Mini Program Production Build ===
✓ Using pnpm
Building for WeChat Mini Program (mp-weixin)...

✓ Build successful!

Production build output:
/path/to/miniapp/dist/build/mp-weixin

You can now upload this directory to WeChat Developer Tools for release.
```

**Step 4: Verify build output**

```bash
# Check if required files exist
ls -la dist/build/mp-weixin/ | grep -E "app\.(json|js|wxss)"
```

Expected files:
- `app.json` - Mini program configuration
- `app.js` - Main application logic
- `app.wxss` - Global styles
- `pages/` - Page directories
- `project.config.json` - Project configuration

⚠️ **If build failed**, check error messages and fix issues before proceeding.

---

## Task 4: Pre-Upload Testing

**Files:**
- Test: `miniapp/dist/build/mp-weixin/*`

**Step 1: Open build in WeChat Developer Tools**

```bash
# Launch WeChat Developer Tools
# Or manually open from Applications
open -a "wechatwebdevtools"
```

Actions in WeChat Developer Tools:
1. Click "+" (Import Project)
2. Select directory: `miniapp/dist/build/mp-weixin`
3. AppID: Use production AppID (or test AppID for testing)
4. Click "Import"

**Step 2: Test core functionality in DevTools**

Test the following critical user flows:

1. **User Login Flow**
   - Open mini program
   - Verify login page appears
   - Test WeChat authorization login
   - Verify user can login successfully

2. **Home Page**
   - Verify home page loads
   - Check API requests to `https://api.sevenkitchen.cloud`
   - Verify recipe list displays correctly
   - Check no console errors

3. **Order Placement**
   - Select a recipe
   - Add to cart
   - Create order
   - Verify order appears in order list

4. **User Profile**
   - Navigate to profile page
   - Verify user info displays correctly
   - Test logout functionality

5. **Staff Features (if applicable)**
   - Test staff login
   - Verify production tasks
   - Test reimbursement submission

**Step 3: Check console for errors**

Open DevTools console (Console tab) and verify:
- ✅ No `url not in domain list` errors
- ✅ No network errors
- ✅ No JavaScript errors
- ✅ API requests use `https://api.sevenkitchen.cloud`

⚠️ **If errors found**, fix issues and rebuild before proceeding.

**Step 4: Test on real device (optional but recommended)**

1. Click "Preview" button in DevTools
2. Scan QR code with WeChat on real device
3. Test all critical flows again
4. Verify performance and UX are acceptable

---

## Task 5: Upload to WeChat Platform

**Files:**
- Upload: `miniapp/dist/build/mp-weixin/*` → WeChat MP Platform

**Step 1: Prepare upload package**

Verify build directory is ready:

```bash
# Final check of build output
cd miniapp/dist/build/mp-weixin
ls -lh
```

Ensure directory size is reasonable (< 5MB for main package).

**Step 2: Upload to WeChat Platform**

Actions in WeChat Developer Tools:
1. Click "上传" (Upload) button in toolbar
2. Fill in version information:
   - **项目版本**: `1.0.0`
   - **版本备注**: `Production release - MVP launch`
3. Click "上传"

Expected: Progress bar shows upload completion, success message appears.

**Step 3: Verify upload in WeChat MP Platform**

1. Visit: https://mp.weixin.qq.com
2. Navigate: 管理 → 版本管理
3. Verify version `1.0.0` appears in "开发版本"

⚠️ **If upload failed**, check error message and ensure:
- AppID is correct
- Build is valid
- No package size exceeded errors

---

## Task 6: Submit for Review

**Files:**
- WeChat MP Platform settings

**Step 1: Review checklist before submission**

Verify all items are complete:

- [ ] All test cases pass (Task 4)
- [ ] Build uploaded successfully (Task 5)
- [ ] Privacy policy is ready (if required)
- [ ] Customer service contact configured
- [ ] Mini program category selected
- [ ] Any required licenses uploaded (food service, etc.)

**Step 2: Configure mini program settings (if not done)**

In WeChat MP Platform (https://mp.weixin.qq.com):

1. Navigate: 设置 → 基本设置
2. Fill in:
   - **小程序名称**: SevenKitchen
   - **简介**: 专业鲜食套餐定制，为您的爱宠提供健康营养
   - **头像**: Upload logo (120x120px, < 200KB)
   - **服务类目**: 生活服务 -> 宠物 -> 其他
   - **备案号**: (if applicable)

3. Navigate: 设置 → 接口设置
   - Enable required permissions (location, camera, etc.)

**Step 3: Submit for review**

In WeChat MP Platform (https://mp.weixin.qq.com):

1. Navigate: 管理 → 版本管理
2. Find your uploaded version (1.0.0)
3. Click "提交审核" (Submit for Review)
4. Fill in submission form:
   - **审核页面**: Select all pages to be reviewed
   - **测试账号** (if required): Provide test account info
   - **功能页面描述**: Brief description of each page
   - **选择服务类目**: 生活服务 -> 宠物
5. Click "提交"

Expected: Submission successful message appears, status changes to "审核中" (Under Review).

⚠️ **Note**: Review typically takes 1-7 business days.

---

## Task 7: Post-Deployment Monitoring

**Files:**
- Monitor: WeChat MP Platform analytics
- Monitor: Backend API logs

**Step 1: Set up monitoring**

After deployment, monitor the following:

1. **WeChat MP Platform Analytics**
   - Daily active users (DAU)
   - Page views and user paths
   - Error rates
   - Performance metrics

2. **Backend API Monitoring**
   - Request logs from production API
   - Error rates and response times
   - Failed login attempts
   - API usage patterns

**Step 2: Prepare rollback plan**

If critical issues are found:

1. **Hotfix approach**
   - Fix issues in development
   - Rebuild following Task 3
   - Upload new version as `1.0.1`
   - Submit for expedited review

2. **Emergency disable**
   - In WeChat MP Platform, navigate: 管理 → 版本管理
   - Click "下架" (Remove from shelves) to disable mini program

**Step 3: Document deployment**

Create deployment record:

```bash
# Add deployment tag
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0

# Document release notes
cat > docs/releases/v1.0.0.md << 'EOF'
# Release Notes - v1.0.0

**Release Date:** 2026-01-30

**Features:**
- Customer: Recipe browsing, order placement
- Customer: Dog profile management
- Customer: Order history tracking
- Staff: Production task management
- Staff: Purchasing and reimbursement

**Known Issues:**
- None critical

**Deployment:**
- Backend: api.sevenkitchen.cloud
- Mini Program: Uploaded to WeChat platform
- Status: Submitted for review
EOF
```

---

## Task 8: Verification Checklist

**Files:**
- Checklist verification

**Step 1: Final verification before going live**

Complete this checklist:

**Configuration:**
- [ ] Production AppID configured in manifest.json and project.config.json
- [ ] `urlCheck: true` in manifest.json
- [ ] API base URL points to `https://api.sevenkitchen.cloud`
- [ ] Domain whitelisted in WeChat MP Platform

**Build:**
- [ ] Build completed without errors
- [ ] Output directory contains all required files
- [ ] Package size within limits (< 2MB main, < 20MB total)

**Testing:**
- [ ] All user flows tested in DevTools
- [ ] Real device testing completed
- [ ] No console errors or network errors
- [ ] API integration working correctly

**Platform:**
- [ ] Uploaded to WeChat MP Platform successfully
- [ ] Version info and release notes filled
- [ ] Mini program settings configured (name, icon, category)
- [ ] Privacy policy and legal docs ready (if required)
- [ ] Submitted for review

**Monitoring:**
- [ ] Analytics dashboard prepared
- [ ] Error monitoring configured
- [ ] Rollback plan documented
- [ ] Release notes documented

---

## Troubleshooting

### Issue: Build fails with "Cannot find module"

**Solution:**
```bash
cd miniapp
rm -rf node_modules
pnpm install
# Retry build
```

### Issue: "url not in domain list" error in production build

**Solution:**
1. Check `manifest.json`: `urlCheck` should be `true` for production
2. Verify domain is whitelisted in WeChat MP Platform
3. Wait up to 24 hours for domain whitelist to take effect

### Issue: Upload fails with package size error

**Solution:**
1. Check package size: `du -sh dist/build/mp-weixin`
2. Main package must be < 2MB, total < 20MB
3. Use subpackages to split large packages (already configured in project)
4. Remove unused dependencies

### Issue: Review rejected

**Common reasons:**
- Missing required permissions (privacy policy, licenses)
- Inappropriate content or functionality
- Violation of WeChat mini program guidelines
- Missing test account for login-required features

**Solution:**
Read rejection reason carefully, fix issues, and resubmit.

---

## Deployment Timeline Estimate

| Task | Estimated Time |
|------|---------------|
| Task 1: Configuration Check | 15-30 minutes |
| Task 2: Update manifest.json | 5-10 minutes |
| Task 3: Build Production Package | 5-10 minutes |
| Task 4: Pre-Upload Testing | 30-60 minutes |
| Task 5: Upload to Platform | 10-15 minutes |
| Task 6: Submit for Review | 20-30 minutes |
| Task 7: Post-Deployment Monitoring | Ongoing |
| Task 8: Verification Checklist | 15-20 minutes |

**Total Time:** 1.5-3 hours (excluding review wait time)

**Review Time:** 1-7 business days (WeChat platform)

---

## Post-Release Actions

After approval and release:

1. **Monitor first 24 hours closely**
   - Check error rates
   - Monitor user feedback
   - Verify API stability

2. **Prepare for updates**
   - Collect user feedback
   - Prioritize bug fixes
   - Plan next version features

3. **Marketing (optional)**
   - Share mini program QR code
   - Promote on social media
   - Collect early user reviews

---

## Success Criteria

Deployment is considered successful when:

- ✅ Mini program passes review and is published
- ✅ All core features work without critical bugs
- ✅ Error rate < 1%
- ✅ Average response time < 1 second
- ✅ User acceptance (no major complaints in first week)

---

## Appendix: Commands Reference

```bash
# Build production package
cd miniapp
bash scripts/mp-weixin-build.sh

# Clean build output
rm -rf dist/build/mp-weixin

# Check build output size
du -sh dist/build/mp-weixin

# Verify AppID configuration
grep "appid" src/manifest.json project.config.json

# Check domain configuration
grep -A 2 "PROD_BASE_URL" src/utils/config.ts

# Create release tag
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0
```

---

**End of Deployment Plan**
