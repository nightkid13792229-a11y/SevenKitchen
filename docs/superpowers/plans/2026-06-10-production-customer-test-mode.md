# Production Customer Test Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin using the WeChat miniapp experience build switch globally into a fixed production `CUSTOMER` test identity, then restore admin mode safely.

**Architecture:** Add admin-only backend endpoints that mint/reset one fixed test customer and never accept arbitrary target user ids. Add a miniapp identity helper that backs up the admin session, applies the customer test session globally, clears user caches, and restores the admin session from a hidden `我的` page panel.

**Tech Stack:** NestJS, Prisma, Jest, uni-app Vue 3, Vitest, WeChat miniapp storage.

---

## File Structure

- `backend/src/interfaces/controllers/admin.controller.ts`  
  Add fixed test-customer constants plus admin-only endpoints for entering customer test mode and resetting the fixed test user's recipe designer data.

- `backend/tests/interfaces/controllers/admin.controller.spec.ts`  
  Add controller tests for token minting, fixed identity creation/recovery, reset scope, and route guard source contracts.

- `miniapp/src/utils/customer-test-mode.ts`  
  New focused helper for session backup, mode detection, applying the test user, restoring admin mode, and cache cleanup.

- `miniapp/src/utils/customer-test-mode.spec.ts`  
  Unit tests for helper behavior using a mocked `uni` storage/runtime.

- `miniapp/src/pages/me/index.vue`  
  Add hidden admin-only test identity panel, visible test-mode banner, entry tap counter, enter/exit/reset actions.

- `miniapp/src/pages/me.regression.spec.ts`  
  Lock hidden panel copy, API routes, test-mode helper usage, and ensure the switch is not placed on the home page.

---

### Task 1: Backend Fixed Customer Test Identity

**Files:**
- Modify: `backend/tests/interfaces/controllers/admin.controller.spec.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`

- [ ] **Step 1: Write failing tests for admin test identity contracts**

Add tests under `describe('AdminController', () => { ... })`:

```ts
  describe('customer test identity mode', () => {
    it('mints a customer token for one fixed production experience test user', async () => {
      const prisma = {
        user: {
          upsert: jest.fn().mockResolvedValue({
            id: 'production-experience-customer-test-user',
            phone: '19900000001',
            nickname: '生产体验版普通用户测试号',
            avatarUrl: null,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            lastLoginAt: new Date('2026-06-10T00:00:00.000Z'),
            createdAt: new Date('2026-06-10T00:00:00.000Z'),
          }),
        },
      };
      const jwtAuthService = {
        generateTokenForUser: jest.fn().mockReturnValue('customer-test-token'),
      };
      const controller = buildController({ prisma, jwtAuthService });

      const result = await controller.enterCustomerTestMode();

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { id: 'production-experience-customer-test-user' },
        create: expect.objectContaining({
          id: 'production-experience-customer-test-user',
          phone: '19900000001',
          nickname: '生产体验版普通用户测试号',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        }),
        update: expect.objectContaining({
          phone: '19900000001',
          nickname: '生产体验版普通用户测试号',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        }),
      });
      expect(jwtAuthService.generateTokenForUser).toHaveBeenCalledWith(
        'production-experience-customer-test-user',
        'CUSTOMER',
      );
      expect(result.data).toEqual(
        expect.objectContaining({
          token: 'customer-test-token',
          mode: 'CUSTOMER_TEST',
          user: expect.objectContaining({
            id: 'production-experience-customer-test-user',
            role: 'CUSTOMER',
            phoneBound: true,
          }),
        }),
      );
    });

    it('resets only the fixed customer test user recipe designer data', async () => {
      const prisma = {
        $transaction: jest.fn(async (callback: any) =>
          callback({
            designRecipeItem: {
              deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
            },
            designRecipe: {
              deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
            recipeSeries: {
              deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
          }),
        ),
      };
      const controller = buildController({ prisma });

      const result = await controller.resetCustomerTestModeData();

      expect(result.data).toEqual({
        deletedDesignRecipeItems: 7,
        deletedDesignRecipes: 3,
        deletedRecipeSeries: 2,
      });
    });

    it('keeps customer test identity endpoints admin-only and fixed-target', () => {
      const source = readFileSync(
        resolve(process.cwd(), 'src/interfaces/controllers/admin.controller.ts'),
        'utf8',
      );

      expect(source).toContain("@Post('test-identity/customer-mode')");
      expect(source).toContain("@Post('test-identity/customer-mode/reset')");
      expect(source).toMatch(
        /@Post\('test-identity\/customer-mode'\)\s+@UseGuards\(AuthGuard, AdminGuard\)/,
      );
      expect(source).toMatch(
        /@Post\('test-identity\/customer-mode\/reset'\)\s+@UseGuards\(AuthGuard, AdminGuard\)/,
      );
      expect(source).toContain(
        "const CUSTOMER_TEST_USER_ID = 'production-experience-customer-test-user'",
      );
      expect(source).not.toContain('targetUserId');
    });
  });
```

- [ ] **Step 2: Run backend controller test to verify failure**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts --runInBand
```

Expected: FAIL because `buildController` does not accept `jwtAuthService`, and the new controller methods/routes do not exist.

- [ ] **Step 3: Implement backend constants, constructor support, endpoints, and reset transaction**

In `backend/src/interfaces/controllers/admin.controller.ts`, import `Post` if needed, ensure `JwtAuthService` is constructor-injected if not already present, add constants near the top:

```ts
const CUSTOMER_TEST_USER_ID = 'production-experience-customer-test-user';
const CUSTOMER_TEST_USER_PHONE = '19900000001';
const CUSTOMER_TEST_USER_NICKNAME = '生产体验版普通用户测试号';
```

Add methods inside `AdminController`:

```ts
  @Post('test-identity/customer-mode')
  @UseGuards(AuthGuard, AdminGuard)
  async enterCustomerTestMode(): Promise<ApiResponseDto<any>> {
    const user = await this.prisma.user.upsert({
      where: { id: CUSTOMER_TEST_USER_ID },
      create: {
        id: CUSTOMER_TEST_USER_ID,
        phone: CUSTOMER_TEST_USER_PHONE,
        nickname: CUSTOMER_TEST_USER_NICKNAME,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
      update: {
        phone: CUSTOMER_TEST_USER_PHONE,
        nickname: CUSTOMER_TEST_USER_NICKNAME,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
    });

    const token = this.jwtAuthService.generateTokenForUser(user.id, 'CUSTOMER');

    return ApiResponseDto.success({
      mode: 'CUSTOMER_TEST',
      token,
      user: {
        id: user.id,
        nickname: user.nickname || CUSTOMER_TEST_USER_NICKNAME,
        avatarUrl: user.avatarUrl,
        role: 'CUSTOMER',
        phone: user.phone || CUSTOMER_TEST_USER_PHONE,
        phoneBound: true,
      },
    });
  }

  @Post('test-identity/customer-mode/reset')
  @UseGuards(AuthGuard, AdminGuard)
  async resetCustomerTestModeData(): Promise<ApiResponseDto<any>> {
    const result = await this.prisma.$transaction(async (tx) => {
      const deletedDesignRecipeItems = await tx.designRecipeItem.deleteMany({
        where: {
          designRecipe: {
            createdBy: CUSTOMER_TEST_USER_ID,
            publishedRecipeId: null,
            publishedAt: null,
          },
        },
      });
      const deletedDesignRecipes = await tx.designRecipe.deleteMany({
        where: {
          createdBy: CUSTOMER_TEST_USER_ID,
          publishedRecipeId: null,
          publishedAt: null,
        },
      });
      const deletedRecipeSeries = await tx.recipeSeries.deleteMany({
        where: { createdBy: CUSTOMER_TEST_USER_ID },
      });

      return {
        deletedDesignRecipeItems: deletedDesignRecipeItems.count,
        deletedDesignRecipes: deletedDesignRecipes.count,
        deletedRecipeSeries: deletedRecipeSeries.count,
      };
    });

    return ApiResponseDto.success(result);
  }
```

Update the test `buildController` helper to accept and pass `jwtAuthService`.

- [ ] **Step 4: Run backend controller test to verify pass**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts --runInBand
```

Expected: PASS.

---

### Task 2: Miniapp Customer Test Mode Helper

**Files:**
- Create: `miniapp/src/utils/customer-test-mode.ts`
- Create: `miniapp/src/utils/customer-test-mode.spec.ts`

- [ ] **Step 1: Write failing helper tests**

Create `miniapp/src/utils/customer-test-mode.spec.ts` with tests for backup/apply/restore/clear:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCustomerTestModeSession,
  clearCustomerTestUserCaches,
  CUSTOMER_TEST_MODE_ACTIVE_KEY,
  CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY,
  getCustomerTestModeState,
  restoreAdminSessionFromCustomerTestMode,
} from './customer-test-mode'

const storage = new Map<string, any>()

beforeEach(() => {
  storage.clear()
  ;(globalThis as any).uni = {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: any) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
  }
})

describe('customer test mode helper', () => {
  it('backs up the current admin session and applies the customer test session globally', () => {
    storage.set('token', 'admin-token')
    storage.set('user', { id: 'admin-1', role: 'ADMIN' })
    storage.set('userInfo', { id: 'admin-1', role: 'ADMIN' })
    storage.set('dogs_cache', [{ id: 'dog-admin' }])

    applyCustomerTestModeSession({
      token: 'customer-token',
      user: {
        id: 'production-experience-customer-test-user',
        role: 'CUSTOMER',
        nickname: '生产体验版普通用户测试号',
        phoneBound: true,
      },
    })

    expect(storage.get(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)).toEqual({
      token: 'admin-token',
      user: { id: 'admin-1', role: 'ADMIN' },
      userInfo: { id: 'admin-1', role: 'ADMIN' },
    })
    expect(storage.get('token')).toBe('customer-token')
    expect(storage.get('user')).toEqual(
      expect.objectContaining({ role: 'CUSTOMER' }),
    )
    expect(storage.get('userInfo')).toEqual(
      expect.objectContaining({ role: 'CUSTOMER' }),
    )
    expect(storage.get(CUSTOMER_TEST_MODE_ACTIVE_KEY)).toBe(true)
    expect(storage.has('dogs_cache')).toBe(false)
  })

  it('restores the backed up admin session and clears test mode markers', () => {
    storage.set(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
    storage.set(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, {
      token: 'admin-token',
      user: { id: 'admin-1', role: 'ADMIN' },
      userInfo: { id: 'admin-1', role: 'ADMIN' },
    })
    storage.set('token', 'customer-token')
    storage.set('user', { id: 'customer-test', role: 'CUSTOMER' })

    const restored = restoreAdminSessionFromCustomerTestMode()

    expect(restored).toBe(true)
    expect(storage.get('token')).toBe('admin-token')
    expect(storage.get('user')).toEqual({ id: 'admin-1', role: 'ADMIN' })
    expect(storage.get('userInfo')).toEqual({ id: 'admin-1', role: 'ADMIN' })
    expect(storage.has(CUSTOMER_TEST_MODE_ACTIVE_KEY)).toBe(false)
    expect(storage.has(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)).toBe(false)
  })

  it('reports active mode only when active marker and backup both exist', () => {
    expect(getCustomerTestModeState().active).toBe(false)
    storage.set(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
    expect(getCustomerTestModeState().active).toBe(false)
    storage.set(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, { token: 'admin-token' })
    expect(getCustomerTestModeState().active).toBe(true)
  })

  it('clears only user-scoped caches', () => {
    storage.set('dogs_cache', [])
    storage.set('home_recipe_stats_dirty', true)
    storage.set('api_base_url', 'https://api.sevenkitchen.cloud/api/v1')

    clearCustomerTestUserCaches()

    expect(storage.has('dogs_cache')).toBe(false)
    expect(storage.has('home_recipe_stats_dirty')).toBe(false)
    expect(storage.get('api_base_url')).toBe(
      'https://api.sevenkitchen.cloud/api/v1',
    )
  })
})
```

- [ ] **Step 2: Run helper test to verify failure**

Run:

```bash
cd miniapp && npm test -- src/utils/customer-test-mode.spec.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement helper**

Create `miniapp/src/utils/customer-test-mode.ts`:

```ts
export const CUSTOMER_TEST_MODE_ACTIVE_KEY = 'customer_test_mode_active'
export const CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY =
  'customer_test_mode_admin_session_backup'

type StoredUser = Record<string, any> | null

interface CustomerTestModePayload {
  token: string
  user: Record<string, any>
}

function readStorage<T = any>(key: string): T | undefined {
  try {
    return uni.getStorageSync(key)
  } catch (error) {
    return undefined
  }
}

function writeStorage(key: string, value: any) {
  try {
    uni.setStorageSync(key, value)
  } catch (error) {
    console.warn('[CustomerTestMode] failed to write storage:', key, error)
  }
}

function removeStorage(key: string) {
  try {
    uni.removeStorageSync(key)
  } catch (error) {
    console.warn('[CustomerTestMode] failed to remove storage:', key, error)
  }
}

function normalizeStoredUser(value: any): StoredUser {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

export function clearCustomerTestUserCaches() {
  ;[
    'dogs_cache',
    'home_recipe_stats_dirty',
    'home_recipe_cover_original_only_urls_v2',
    'userLoginTrigger',
  ].forEach(removeStorage)
}

export function getCustomerTestModeState() {
  const activeMarker = readStorage<boolean>(CUSTOMER_TEST_MODE_ACTIVE_KEY)
  const backup = readStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  return {
    active: activeMarker === true && Boolean(backup),
    backup: backup || null,
  }
}

export function applyCustomerTestModeSession(payload: CustomerTestModePayload) {
  const existingBackup = readStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  if (!existingBackup) {
    writeStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, {
      token: readStorage('token') || '',
      user: normalizeStoredUser(readStorage('user')) || null,
      userInfo: normalizeStoredUser(readStorage('userInfo')) || null,
    })
  }

  clearCustomerTestUserCaches()
  writeStorage('token', payload.token)
  writeStorage('user', payload.user)
  writeStorage('userInfo', payload.user)
  writeStorage(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
  writeStorage('userLoginTrigger', Date.now())
}

export function restoreAdminSessionFromCustomerTestMode() {
  const backup = readStorage<{
    token?: string
    user?: StoredUser
    userInfo?: StoredUser
  }>(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)

  if (!backup?.token) {
    return false
  }

  clearCustomerTestUserCaches()
  writeStorage('token', backup.token)
  if (backup.user) writeStorage('user', backup.user)
  else removeStorage('user')
  if (backup.userInfo) writeStorage('userInfo', backup.userInfo)
  else removeStorage('userInfo')
  removeStorage(CUSTOMER_TEST_MODE_ACTIVE_KEY)
  removeStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  writeStorage('userLoginTrigger', Date.now())
  return true
}
```

- [ ] **Step 4: Run helper test to verify pass**

Run:

```bash
cd miniapp && npm test -- src/utils/customer-test-mode.spec.ts
```

Expected: PASS.

---

### Task 3: Miniapp Hidden Me Page Panel

**Files:**
- Modify: `miniapp/src/pages/me.regression.spec.ts`
- Modify: `miniapp/src/pages/me/index.vue`

- [ ] **Step 1: Write failing me page regression tests**

Extend `miniapp/src/pages/me.regression.spec.ts`:

```ts
  it('keeps production customer test mode behind the me page admin panel', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const homeSource = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('当前为普通用户测试模式')
    expect(source).toContain('进入普通用户测试模式')
    expect(source).toContain('退出普通用户测试模式')
    expect(source).toContain('重置测试用户数据')
    expect(source).toContain('/admin/test-identity/customer-mode')
    expect(source).toContain('/admin/test-identity/customer-mode/reset')
    expect(source).toContain('applyCustomerTestModeSession')
    expect(source).toContain('restoreAdminSessionFromCustomerTestMode')
    expect(source).toContain('handleTestIdentityHiddenTap')
    expect(homeSource).not.toContain('普通用户测试模式')
    expect(homeSource).not.toContain('/admin/test-identity/customer-mode')
  })
```

- [ ] **Step 2: Run me page regression test to verify failure**

Run:

```bash
cd miniapp && npm test -- src/pages/me.regression.spec.ts
```

Expected: FAIL because the panel and helper integration do not exist.

- [ ] **Step 3: Implement hidden panel and actions**

Modify `miniapp/src/pages/me/index.vue`:

Add a banner below logged-in wrapper start:

```vue
      <view v-if="customerTestModeActive" class="customer-test-banner">
        <text class="customer-test-title">当前为普通用户测试模式</text>
        <text class="customer-test-action" @tap="exitCustomerTestMode">退出</text>
      </view>
```

Attach hidden tap to the account id row or version row:

```vue
        <view class="info-row" @tap="handleTestIdentityHiddenTap">
          <view class="info-label">账户ID</view>
```

Add panel before logout:

```vue
      <view v-if="testIdentityPanelVisible" class="test-identity-panel">
        <view class="section-header">测试身份</view>
        <view class="test-identity-body">
          <text class="test-identity-status">
            {{ customerTestModeActive ? "当前为普通用户测试模式" : "当前为管理员模式" }}
          </text>
          <button
            v-if="!customerTestModeActive"
            class="test-identity-btn"
            @tap="enterCustomerTestMode"
          >
            进入普通用户测试模式
          </button>
          <button
            v-else
            class="test-identity-btn secondary"
            @tap="exitCustomerTestMode"
          >
            退出普通用户测试模式
          </button>
          <button
            class="test-identity-btn danger"
            @tap="resetCustomerTestModeData"
          >
            重置测试用户数据
          </button>
        </view>
      </view>
```

Import helpers:

```ts
import {
  applyCustomerTestModeSession,
  getCustomerTestModeState,
  restoreAdminSessionFromCustomerTestMode,
} from "../../utils/customer-test-mode";
```

Add state and functions:

```ts
const testIdentityPanelVisible = ref(false);
const customerTestModeActive = ref(false);
let testIdentityTapCount = 0;
let testIdentityTapTimer: ReturnType<typeof setTimeout> | null = null;

function refreshCustomerTestModeState() {
  customerTestModeActive.value = getCustomerTestModeState().active;
}

function canUseTestIdentityPanel() {
  return userInfo.value.role === "ADMIN" || customerTestModeActive.value;
}

function handleTestIdentityHiddenTap() {
  if (!canUseTestIdentityPanel()) return;
  testIdentityTapCount += 1;
  if (testIdentityTapTimer) clearTimeout(testIdentityTapTimer);
  testIdentityTapTimer = setTimeout(() => {
    testIdentityTapCount = 0;
    testIdentityTapTimer = null;
  }, 1500);
  if (testIdentityTapCount >= 5) {
    testIdentityPanelVisible.value = true;
    testIdentityTapCount = 0;
  }
}

async function enterCustomerTestMode() {
  isLoading.value = true;
  try {
    const res = await request({
      url: "/admin/test-identity/customer-mode",
      method: "POST",
    });
    if (res.code !== 0 || !res.data?.token || !res.data?.user) {
      throw new Error(res.message || "进入测试模式失败");
    }
    applyCustomerTestModeSession({
      token: res.data.token,
      user: res.data.user,
    });
    uni.showToast({ title: "已进入普通用户测试模式", icon: "success" });
    setTimeout(() => {
      uni.switchTab({ url: "/pages/home/index" });
    }, 500);
  } catch (error: any) {
    uni.showToast({
      title: error?.message || "进入测试模式失败",
      icon: "none",
    });
  } finally {
    isLoading.value = false;
  }
}

function exitCustomerTestMode() {
  const restored = restoreAdminSessionFromCustomerTestMode();
  if (!restored) {
    clearToken();
    uni.showToast({ title: "请重新登录管理员账号", icon: "none" });
    return;
  }
  uni.showToast({ title: "已恢复管理员身份", icon: "success" });
  setTimeout(() => {
    uni.switchTab({ url: "/pages/home/index" });
  }, 500);
}

async function resetCustomerTestModeData() {
  uni.showModal({
    title: "重置测试数据",
    content: "只会清理固定普通用户测试号的食谱设计数据，确定继续吗？",
    confirmText: "重置",
    confirmColor: "#d92d20",
    success: async (modalResult) => {
      if (!modalResult.confirm) return;
      isLoading.value = true;
      try {
        const res = await request({
          url: "/admin/test-identity/customer-mode/reset",
          method: "POST",
        });
        if (res.code !== 0) {
          throw new Error(res.message || "重置失败");
        }
        uni.showToast({ title: "已重置测试数据", icon: "success" });
      } catch (error: any) {
        uni.showToast({
          title: error?.message || "重置失败",
          icon: "none",
        });
      } finally {
        isLoading.value = false;
      }
    },
  });
}
```

In `onShow`, call `refreshCustomerTestModeState()` before loading user info.

Add simple styles for `.customer-test-banner`, `.test-identity-panel`, `.test-identity-body`, `.test-identity-status`, `.test-identity-btn`.

- [ ] **Step 4: Run me page regression test to verify pass**

Run:

```bash
cd miniapp && npm test -- src/pages/me.regression.spec.ts
```

Expected: PASS.

---

### Task 4: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run focused miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/utils/customer-test-mode.spec.ts src/pages/me.regression.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run miniapp preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: PASS and WeChat DevTools should open `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 4: Inspect final git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only planned backend, miniapp, and plan files changed.
