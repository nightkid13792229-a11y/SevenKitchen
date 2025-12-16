# Configuration Reference

This document describes all configuration sources and hardcoded values in the miniapp.

## Single Source of Truth

### BASE_URL Configuration

**Source:** `src/utils/config.ts`

**Default Value:** `http://127.0.0.1:3000/api/v1`

**Runtime Override:** Stored in uni storage with key `api_base_url`

**Usage:**
- Always use `getBaseUrl()` function to get the current BASE_URL
- Storage value takes precedence over default
- Can be changed at runtime via Network Settings page

**Why 127.0.0.1 instead of localhost?**
- WeChat Developer Tools has better compatibility with `127.0.0.1`
- Avoids DNS resolution issues
- More reliable in simulator environment

**Functions:**
- `getBaseUrl()` - Get current BASE_URL (storage first, then default)
- `setBaseUrl(url)` - Set BASE_URL in storage (runtime config)
- `resetBaseUrl()` - Clear storage, use default
- `getDefaultBaseUrl()` - Get default value (for display)

---

### Token Storage

**Source:** `src/utils/api.ts`

**Storage Key:** `token` (uni storage)

**Functions:**
- `getToken()` - Get token from storage (single source of truth)
- `setToken(token)` - Save token to storage
- `clearToken()` - Remove token from storage

**Usage:**
- Token is automatically stored after successful login
- Token is automatically cleared on 401 errors
- Token is checked on app launch for auto-login

---

### Hardcoded Values (MVP)

These values are intentionally hardcoded for MVP and should be documented:

#### Customer ID

**Location:** `src/App.vue` and `src/utils/api.ts`

**Value:** `'mvp-user-001'`

**Usage:**
- Used for auto-login on app launch
- Used as default parameter in `performLogin()`

**Rationale:**
- MVP uses a single test customer
- Future: Should be replaced with actual user selection or WeChat OpenID

**Documentation:**
- This is explicitly an MVP limitation
- Not a bug, but a known simplification

---

## Configuration Flow

### App Startup

1. App launches → `App.vue` `onLaunch()`
2. Logs current configuration:
   - BASE_URL (from storage or default)
   - Token status
   - Build mode
3. If no token → Auto-login with `mvp-user-001`
4. Auto-login retries once on failure
5. After max retries → Graceful degradation (app continues)

### Runtime Configuration

1. User opens Network Settings page
2. Current BASE_URL is displayed
3. User can edit and test connection
4. Settings saved to uni storage
5. Next API call uses new BASE_URL

### API Request Flow

1. `request()` function called
2. Gets BASE_URL via `getBaseUrl()` (storage first)
3. Gets token via `getToken()` (storage)
4. Builds full URL: `${baseUrl}${endpoint}`
5. Adds Authorization header if token exists
6. Makes request
7. On 401 → Auto re-login and retry once

---

## No Duplicate Config Sources

✅ **Single source of truth for BASE_URL:** `src/utils/config.ts`
✅ **Single source of truth for token:** `src/utils/api.ts`
✅ **No globalData usage:** All state in storage or component state
✅ **No environment variables:** All config in code (can be overridden at runtime)

---

## Build Artifacts

**Note:** `dist/build/mp-weixin/utils/config.js` is a build artifact.
- It contains the default BASE_URL at build time
- Runtime storage override still works
- Do not edit build artifacts directly

---

## Migration Notes

If you need to change the default BASE_URL:

1. Edit `src/utils/config.ts` → `DEFAULT_BASE_URL`
2. Rebuild: `pnpm dev:mp-weixin` or `pnpm build:mp-weixin`
3. Users with stored overrides are unaffected (storage takes precedence)

If you need to change the customer ID:

1. Edit `src/App.vue` → `ensureAuthenticated()` function
2. Edit `src/utils/api.ts` → `performLogin()` default parameter
3. Consider making it configurable in the future

---

## Validation

Run `bash scripts/doctor.sh` to verify:
- ✅ BASE_URL uses 127.0.0.1
- ✅ BASE_URL resolution logic exists
- ✅ Storage-based override works
- ✅ No duplicate config sources
