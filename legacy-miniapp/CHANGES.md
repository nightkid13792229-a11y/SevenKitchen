# Build Workflow Fixes - Summary

## Problem
User opened the Uni-app source root directory in WeChat Developer Tools and got:
```
"Simulator startup failed: app.json not found in project root"
```

This happened because WeChat DevTools expects a **compiled output directory**, not the source code.

## Solution
Created a one-command workflow that:
1. Installs dependencies if needed
2. Builds the Uni-app project for WeChat Mini Program
3. Shows the exact output directory to open
4. Optionally auto-opens WeChat DevTools (macOS)

## Files Created

### 1. `scripts/mp-weixin-dev.sh`
- Development build helper script
- Detects pnpm/npm automatically
- Installs dependencies if needed
- Builds project and shows output directory
- Auto-opens WeChat DevTools on macOS (optional)

### 2. `scripts/mp-weixin-build.sh`
- Production build helper script
- Similar to dev script but for production builds

### 3. `vite.config.ts`
- Vite configuration for Uni-app
- Ensures proper build output structure

### 4. `QUICKSTART.md`
- Quick reference guide
- One-command setup instructions
- Troubleshooting tips

### 5. `BUILD_OUTPUT.md`
- Detailed reference for build output directories
- Explains which directory to open
- Common error solutions

## Files Modified

### 1. `package.json`
- Added `@dcloudio/uni-cli` dependency
- Updated scripts to use correct Uni-app CLI commands
- Added `preview` script that runs the helper script

### 2. `README.md`
- Added mandatory "WeChat Developer Tools Preview" section
- Clearly states which directory to open
- Added troubleshooting for "app.json not found" error
- Added HBuilderX alternative option
- Updated development commands section

## Usage

### Quick Start (One Command)

```bash
cd miniapp
bash scripts/mp-weixin-dev.sh
```

### What It Does

1. Checks for pnpm (preferred) or npm
2. Installs dependencies if `node_modules/` doesn't exist
3. Verifies Uni-app project structure
4. Builds for WeChat Mini Program (development mode)
5. Shows output directory: `dist/dev/mp-weixin`
6. Optionally opens WeChat DevTools (macOS)

### Output Directory

**Open this in WeChat Developer Tools:**
```
<absolute-path>/miniapp/dist/dev/mp-weixin
```

**DO NOT open:**
- `miniapp/` (source directory)
- `miniapp/pages/` (source pages)

## Verification

After running the script, verify:
- ✅ `dist/dev/mp-weixin/app.json` exists
- ✅ `dist/dev/mp-weixin/app.js` exists
- ✅ `dist/dev/mp-weixin/pages/` directory exists

If these files exist, the build was successful and you can open `dist/dev/mp-weixin` in WeChat Developer Tools.

## Manual Alternative

If you prefer manual control:

```bash
cd miniapp
npm install
npm run dev:mp-weixin
# Then open dist/dev/mp-weixin in WeChat Developer Tools
```

## Next Steps

1. Run: `bash scripts/mp-weixin-dev.sh`
2. Copy the output directory path shown
3. Open WeChat Developer Tools
4. Import Project → Select the `dist/dev/mp-weixin` directory
5. Enable "Do not verify valid domain names" in DevTools settings



