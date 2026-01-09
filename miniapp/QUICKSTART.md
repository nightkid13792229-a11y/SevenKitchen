# Quick Start Guide - WeChat Mini Program Preview

## What Changed (Latest Updates)

### Network & Connection Fixes
- ✅ **BASE_URL now defaults to `127.0.0.1`** (instead of `localhost`) for WeChat DevTools compatibility
- ✅ **Network Settings page** added - change API URL at runtime without rebuilding
- ✅ **Improved auto-login** - shows helpful error messages without crashing, retries once, then gracefully degrades
- ✅ **New diagnostic tools** - `doctor.sh` (comprehensive health check) and `open-devtools.sh` (show import directory)

### Runtime Hardening
- ✅ **App never crashes** - all errors are handled gracefully
- ✅ **Graceful degradation** - app remains usable if backend is down/slow
- ✅ **Startup diagnostics** - console logs show BASE_URL, token status, build mode
- ✅ **Non-blocking errors** - all error messages are toasts, never block navigation

### Quick Health Check
Before starting, run the doctor script to check your setup:
```bash
bash scripts/doctor.sh
```

This will verify:
- ✅ Backend health endpoint (`GET /api/v1/health`)
- ✅ JWT login availability (`POST /auth/login`)
- ✅ BASE_URL configuration and resolution
- ✅ Build output directories (which to import)
- ✅ Project structure
- ✅ Network Settings page

**The script fails loudly if critical issues are found.**

## Build and Verify

### Production Build (Recommended for Testing)

Run the verification script to build and verify the output:

```bash
bash scripts/mp-weixin-verify.sh
```

This will:
1. ✅ Install dependencies (if needed)
2. ✅ Build the Uni-app project for WeChat Mini Program (production build)
3. ✅ Verify that `app.json`, `app.js`, and `pages/` exist
4. ✅ Print the absolute output directory path
5. ✅ Exit with error if verification fails

### Development Build (Hot Reload)

For development with hot reload:

```bash
bash scripts/mp-weixin-dev.sh
```

This will:
1. ✅ Install dependencies (if needed)
2. ✅ Start the development server with hot reload
3. ✅ Show you the exact directory to open
4. ✅ Optionally open WeChat Developer Tools (macOS)

## What Directory to Open?

**⚠️ CRITICAL: Use the correct directory for your workflow**

**For Development (Watch Mode - Recommended):**
```bash
# Use this helper script
bash scripts/open-devtools.sh dev
```
- **Import Directory:** `<project-root>/dist/dev/mp-weixin`
- **When to use:** During active development with hot reload
- **Command:** `pnpm dev:mp-weixin` (runs in watch mode)

**For Production Build (Testing Only):**
```bash
# Use this helper script
bash scripts/open-devtools.sh build
```
- **Import Directory:** `<project-root>/dist/build/mp-weixin`
- **When to use:** Final testing before release
- **Command:** `pnpm build:mp-weixin` (one-shot build)

**❌ DO NOT:**
- ❌ Open `dist/build/mp-weixin` for development (no hot reload)
- ❌ Open `miniapp/` (source directory - won't work)
- ❌ Open `miniapp/pages/` (source pages - won't work)
- ✅ **Always use:** `dist/dev/mp-weixin` for development

## WeChat Developer Tools Settings

1. Open WeChat Developer Tools
2. Click "Import Project" (导入项目)
3. Select: `dist/dev/mp-weixin` (absolute path)
4. Go to Settings → Project Settings
5. Enable "Do not verify valid domain names" (不校验合法域名)

## Troubleshooting

### "app.json not found" Error

**Cause**: You opened the source directory instead of the build output.

**Solution**:
1. Run: `bash scripts/mp-weixin-dev.sh`
2. Open the directory shown in the output (should be `dist/dev/mp-weixin`)

### Build Fails

**Check**:
1. Node.js is installed: `node --version`
2. Dependencies installed: `npm install` or `pnpm install`
3. Check build output for errors

### WeChat DevTools Can't Connect (ERR_CONNECTION_REFUSED)

**Quick Fix:**
1. Run diagnostic: `bash scripts/doctor.sh`
2. Check if backend is running: `cd backend && pnpm start:dev`
3. **Use Network Settings page** in the app to change BASE_URL at runtime:
   - Navigate to "Network Settings" page in the miniapp
   - Update BASE_URL if needed (default: `http://127.0.0.1:3000/api/v1`)
   - Test connection using the "Test Connection" button
4. Ensure "Do not verify valid domain names" is enabled in DevTools

**Common Issues:**
- **Wrong directory opened**: Use `bash scripts/open-devtools.sh dev` to see correct path
- **Backend not running**: Start backend first: `cd backend && pnpm start:dev`
- **Wrong BASE_URL**: Default is now `127.0.0.1` (not `localhost`) - change via Network Settings page if needed
- **Port mismatch**: Ensure backend runs on port 3000, or update BASE_URL accordingly

## Alternative: Manual Build

```bash
# Install dependencies
pnpm install  # or npm install

# Build for production (one-shot)
pnpm run build:mp-weixin

# Output: dist/build/mp-weixin
# Then open dist/build/mp-weixin in WeChat Developer Tools

# OR build for development (with hot reload)
pnpm run dev:mp-weixin

# Output: dist/dev/mp-weixin
# Then open dist/dev/mp-weixin in WeChat Developer Tools
```

## Verification

After building, verify the output structure:

```bash
bash scripts/mp-weixin-verify.sh
```

This script will:
- Run a clean production build
- Check for required files (`app.json`, `app.js`, `pages/`)
- Print the absolute path to the output directory
- Exit with a clear error message if anything is missing

## Network Configuration

### Runtime Configuration (Recommended)

The app includes a **Network Settings** page that allows you to change the API base URL at runtime without rebuilding:

1. Open the miniapp in WeChat Developer Tools
2. Navigate to the "Network Settings" page (网络设置)
3. Edit the BASE_URL if needed
4. Click "Test Connection" to verify
5. Click "Save Settings"

The URL is stored in uni storage and persists across app restarts.

### Default Configuration

The default BASE_URL is: `http://127.0.0.1:3000/api/v1`

This uses `127.0.0.1` instead of `localhost` for better compatibility with WeChat Developer Tools.

### Auto-Login Behavior

- App attempts auto-login on launch if no token exists
- If backend is unreachable, shows a non-blocking toast message
- App remains usable even if auto-login fails
- Login will be retried automatically on next API call (401 handling)

## Helper Scripts

### `scripts/doctor.sh` - Health Check
```bash
bash scripts/doctor.sh
```
Checks:
- Backend connectivity
- Build output directories
- Project structure
- Configuration

### `scripts/open-devtools.sh` - Show Import Directory
```bash
# For development
bash scripts/open-devtools.sh dev

# For production
bash scripts/open-devtools.sh build
```
Shows the exact directory to import in WeChat Developer Tools and optionally opens it.

## How to Run

### Complete Workflow

1. **Start backend** (if not running):
   ```bash
   cd backend && pnpm start:dev
   ```

2. **Run health check** (One-Command Dev Verification):
   ```bash
   cd miniapp && bash scripts/doctor.sh
   ```
   This checks everything and tells you if you're ready to proceed.

3. **Start development build**:
   ```bash
   cd miniapp && bash scripts/mp-weixin-dev.sh
   ```
   Or manually:
   ```bash
   cd miniapp && pnpm dev:mp-weixin
   ```
   **⚠️ IMPORTANT:** This outputs to `dist/dev/mp-weixin` (NOT `dist/build/mp-weixin`)

4. **Open in WeChat DevTools**:
   ```bash
   cd miniapp && bash scripts/open-devtools.sh dev
   ```
   This shows the exact directory to import: `dist/dev/mp-weixin`
   
   **DO NOT open `dist/build/mp-weixin` for development** - it's for production only.

5. **Verify app startup**:
   - Check console logs - should show BASE_URL, token status, build mode
   - Auto-login should attempt (if no token)
   - If backend is down, toast appears but app continues

6. **If connection fails**:
   - Open Network Settings page in the app (网络设置)
   - Verify BASE_URL is `http://127.0.0.1:3000/api/v1`
   - Test connection using "测试连接" button
   - Ensure backend is running: `cd backend && pnpm start:dev`

### Real User Verification

After the app is running, follow the **Real User Dry-Run Checklist**:
```bash
# See: docs/REAL_USER_DRY_RUN.md
```

This guides you through testing all user flows as a real user would.

---

## READY FOR REAL USER VERIFICATION

✅ **What is guaranteed to work:**
- App boots without crashing (even if backend is down)
- Auto-login with retry and graceful degradation
- Runtime BASE_URL configuration
- All navigation flows
- Error handling (non-blocking, user-friendly)
- Network Settings page for troubleshooting

✅ **What is intentionally deferred (not blockers):**
- Full payment integration (may be mocked)
- Print/export for DIY sheets
- Advanced form validation
- Image uploads
- Production HTTPS setup (dev only)
- Some API endpoints may return empty data (API gaps documented separately)

**If `doctor.sh` passes and app boots successfully → ✅ READY FOR REAL USER VERIFICATION**



