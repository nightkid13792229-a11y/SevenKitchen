# Root Cause Analysis: Uni-app mp-weixin Build Error

## Error
```
Could not resolve entry module "index.html"
```

## Root Cause

The `@dcloudio/vite-plugin-uni` plugin is designed to automatically configure the build entry point for Uni-app projects based on `main.ts` and `pages.json`. However, Vite is attempting to resolve `index.html` as the default entry point **before** the plugin can configure the correct entry.

### Technical Details

1. **Vite's Default Behavior**: When no entry is explicitly configured, Vite defaults to looking for `index.html` in the project root.

2. **Plugin Timing Issue**: The Uni-app plugin needs to run its configuration hooks to set up the entry point based on `main.ts` and `pages.json`, but Vite tries to resolve the entry during its initial configuration phase, before the plugin can intercept.

3. **Version Compatibility**: The installed `@dcloudio/vite-plugin-uni@3.0.0-alpha-4080720251125001` expects `vite@5.2.8` (per peer dependency warnings), but the project uses `vite@4.5.14`. This version mismatch may contribute to the issue.

## What Was Fixed

1. ✅ **Updated build scripts** to use `uni build -p mp-weixin` instead of `vite build` directly
2. ✅ **Added `@dcloudio/uni-mp-weixin`** as a dev dependency (required for mp-weixin builds)
3. ✅ **Simplified vite.config.ts** to use the plugin's default configuration
4. ✅ **Created verification script** (`scripts/mp-weixin-verify.sh`)
5. ✅ **Updated QUICKSTART.md** with correct build instructions

## Remaining Issue

The build still fails with "Could not resolve entry module 'index.html'" even after:
- Using the `uni` CLI command
- Installing `@dcloudio/uni-mp-weixin`
- Ensuring `src/main.ts` and `src/pages.json` exist
- Setting `UNI_PLATFORM=mp-weixin` environment variable

## Potential Solutions

### Option 1: Upgrade Vite to v5 (Recommended)
The plugin expects Vite 5.x. Upgrade might resolve compatibility issues:

```bash
pnpm add -D vite@^5.2.8
```

**Risk**: May require updating other dependencies and testing for compatibility.

### Option 2: Downgrade Plugin to Vite 4 Compatible Version
Find a version of `@dcloudio/vite-plugin-uni` that supports Vite 4:

```bash
# Check available versions
pnpm view @dcloudio/vite-plugin-uni versions --json
```

### Option 3: Create Minimal index.html (Workaround)
Create a minimal `index.html` that the plugin can override:

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body></body>
</html>
```

**Note**: This is a workaround and may not work if the plugin completely bypasses HTML entry points for mini programs.

### Option 4: Check Plugin Configuration
The plugin might need explicit configuration options. Check the plugin's documentation for:
- `input` directory configuration
- Platform-specific options
- Build mode settings

## Current Project State

- ✅ Scripts updated to use `uni` CLI
- ✅ `@dcloudio/uni-mp-weixin` installed
- ✅ `vite.config.ts` configured correctly
- ✅ Source files in `src/` directory
- ❌ Build still fails with index.html resolution error

## Next Steps

1. **Try upgrading Vite to v5** (most likely to fix the issue)
2. **Check Uni-app official documentation** for any known issues with this plugin version
3. **Consider using HBuilderX** or the official Uni-app CLI if the Vite plugin continues to have issues
4. **Report the issue** to the Uni-app GitHub repository if it persists after trying the above

## Files Modified

- `package.json` - Updated scripts, added `@dcloudio/uni-mp-weixin`
- `vite.config.ts` - Simplified to use plugin defaults
- `scripts/mp-weixin-verify.sh` - Created verification script
- `QUICKSTART.md` - Updated with build instructions

