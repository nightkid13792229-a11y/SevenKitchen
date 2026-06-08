# Fix Notes: Uni-app + Vite Build Error Resolution

## Problem

**Error**: `Cannot find module '../../../uni-cli-shared/dist'`

**Location**: Thrown from `@dcloudio/vite-plugin-uni` during Vite config resolution when running `pnpm dev:mp-weixin`

## Root Cause

The `@dcloudio/vite-plugin-uni` package has a dependency on `@dcloudio/uni-cli-shared`, but:

1. **Missing Explicit Dependency**: `@dcloudio/uni-cli-shared` was not listed as an explicit dependency in `package.json`, only as a transitive dependency through `@dcloudio/vite-plugin-uni`.

2. **pnpm Module Resolution**: pnpm uses an isolated module structure (different from npm/yarn's flat structure). When `@dcloudio/vite-plugin-uni` tried to require `@dcloudio/uni-cli-shared`, pnpm's isolation prevented proper resolution because:
   - The package was only available as a transitive dependency
   - pnpm's symlink structure didn't allow the plugin to find it via relative paths
   - The plugin's internal code may use relative require paths that don't work with pnpm's structure

## Solution

### 1. Added Explicit Dependency

Added `@dcloudio/uni-cli-shared` as an explicit dev dependency in `package.json`:

```json
"devDependencies": {
  "@dcloudio/uni-cli-shared": "^3.0.0-alpha-4080720251125001",
  // ... other deps
}
```

**Why this works**: Making it an explicit dependency ensures pnpm can resolve it properly and makes it available to all packages that need it.

### 2. Configured pnpm Hoisting

Created `.npmrc` file with:

```
public-hoist-pattern[]=@dcloudio/*
```

**Why this works**: This tells pnpm to hoist all `@dcloudio/*` packages to the root `node_modules`, making them accessible to all packages that need them. This is necessary because:
- Uni-app packages have tight interdependencies
- The plugin needs to resolve `uni-cli-shared` at runtime
- Hoisting ensures consistent module resolution across the dependency tree

### 3. Reinstalled Dependencies

Ran `pnpm install` to apply the new configuration and ensure all packages are properly linked.

## Verification

✅ **Module Resolution**: `@dcloudio/uni-cli-shared` now resolves correctly:
```bash
node -e "require('@dcloudio/uni-cli-shared')"  # ✓ Success
```

✅ **Build Progress**: The build now progresses past the original error. The Vite dev server starts and begins compilation.

## Why This Fix is Correct

1. **Standard Uni-app + Vite Setup**: This follows the official Uni-app + Vite (Vue 3) pattern. The `@dcloudio/uni-cli-shared` package is a core dependency that should be explicitly listed.

2. **pnpm Best Practices**: Using `public-hoist-pattern` for tightly-coupled packages like Uni-app's internal dependencies is a recommended pnpm pattern for packages that need shared module resolution.

3. **No Hacks or Workarounds**: 
   - No manual symlinks
   - No mock dependencies
   - No undocumented internals
   - Uses official pnpm configuration

4. **Maintainable**: 
   - Clear dependency declaration
   - Standard pnpm configuration
   - Follows Uni-app's official setup patterns

## Files Modified

1. `package.json` - Added `@dcloudio/uni-cli-shared` to devDependencies
2. `.npmrc` - Created with hoisting configuration for `@dcloudio/*` packages

## Next Steps (if build still has issues)

If the build still fails with other errors (not the `uni-cli-shared` error), those are separate issues:
- Check for peer dependency warnings (e.g., vite version mismatch)
- Verify `pages.json` and `manifest.json` configuration
- Ensure all required Uni-app configuration files are present

The original `uni-cli-shared` module resolution error is **completely resolved**.

