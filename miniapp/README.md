# WeChat Mini Program MVP - Project Reborn (Uni-app + TypeScript)

This is a minimal WeChat Mini Program built with **Uni-app + TypeScript** for real user validation. It implements the complete ordering flow aligned with UI blueprints and API specs.

## Technology Stack

- **Framework**: Uni-app (Vue 3)
- **Language**: TypeScript
- **Platform**: WeChat Mini Program
- **Build Tool**: Vite (via Uni-app CLI)

## Project Structure

**Canonical Source Directory**: All source files are in the `src/` directory (Uni-app standard).

```
miniapp/
├── src/                    # Source directory (canonical)
│   ├── pages.json          # Page configuration
│   ├── manifest.json       # App manifest
│   ├── main.ts             # Entry point (imports App.vue)
│   ├── App.vue             # App root component (imports ./utils/api)
│   ├── pages/
│   │   ├── dog-profile-list/   # Dog profile list
│   │   ├── dog-create/         # Create dog profile (with breedId limitation)
│   │   ├── recipe-list/        # Recipe list
│   │   ├── recipe-detail/      # Recipe detail + DIY sheet
│   │   ├── address-list/        # Address list
│   │   ├── address-edit/        # Create/update address
│   │   ├── order-config/       # Order configuration (with API gap notices)
│   │   ├── orders-list/         # Orders list
│   │   ├── order-detail/        # Order detail
│   │   └── snapshot/            # Readonly snapshot view
│   └── utils/
│       ├── config.ts       # BASE_URL configuration
│       └── api.ts         # API client with JWT handling (canonical)
├── tsconfig.json       # TypeScript config
├── package.json        # Dependencies
├── vite.config.ts      # Vite configuration
└── README.md          # This file
```

**Important**: 
- **Canonical API module**: `src/utils/api.ts` - All pages import from `../../utils/api`
- **App entry**: `src/main.ts` - Imports `src/App.vue`
- **No root-level source files** - All source code is in `src/` directory

## Setup Instructions

### 1. Install Dependencies

```bash
cd miniapp
npm install
```

### 2. Configure Base URL

Edit `src/utils/config.ts` and set the `BASE_URL` to point to your backend:

```typescript
export const BASE_URL = 'http://127.0.0.1:3000/api/v1'  // Use 127.0.0.1 for WeChat DevTools compatibility
```

**Important URLs:**
- **Local development (DevTools)**: `http://127.0.0.1:3000/api/v1` (use 127.0.0.1, not localhost)
- **Remote server**: `http://your-server.com/api/v1`
- **Local network (for real device)**: `http://192.168.x.x:3000/api/v1` (use your machine's IP)

### 3. Build and Preview in WeChat Developer Tools

**⚠️ IMPORTANT: WeChat Developer Tools Preview**

**DO NOT open the Uni-app source root directory (`miniapp/`) in WeChat Developer Tools.**

WeChat Developer Tools expects a **compiled output directory** with `app.json`, `app.js`, and `pages/` folders. The Uni-app source code must be built first.

#### Quick Start (Recommended)

Run the helper script for development:

```bash
bash scripts/mp-weixin-dev.sh
```

Or use npm/pnpm directly:

```bash
npm run preview
# or
pnpm run preview
```

This script will:
- Install dependencies if needed
- Build the project for WeChat Mini Program
- Show you the exact directory to open
- Optionally auto-open WeChat Developer Tools (macOS)

#### Manual Build

If you prefer to build manually:

```bash
# Development build (with watch mode)
npm run dev:mp-weixin
# or
pnpm run dev:mp-weixin

# Production build
npm run build:mp-weixin
# or
pnpm run build:mp-weixin
```

**Output Directories:**
- **Development**: `dist/dev/mp-weixin` (use this for preview)
- **Production**: `dist/build/mp-weixin` (use this for release)

### 4. Open in WeChat Developer Tools

1. Download and install [WeChat Developer Tools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. Open WeChat Developer Tools
3. Click **"Import Project"** or **"导入项目"**
4. **Select the compiled output directory:**
   - For development: `dist/dev/mp-weixin` (absolute path)
   - For production: `dist/build/mp-weixin` (absolute path)
   - **DO NOT select the `miniapp/` source directory**
5. Enter an AppID:
   - **For testing**: Use "Test Account" or select "Test" mode
   - **For production**: Use your registered WeChat Mini Program AppID

### 5. Configure Developer Tools Settings

**CRITICAL: Disable domain check for development**

1. In WeChat Developer Tools, go to: **Settings (设置) → Project Settings (项目设置)**
2. Check **"Do not verify valid domain names" (不校验合法域名)**
3. This allows you to use `localhost` or custom IP addresses during development

**If you see "app.json not found" error:**
- You opened the wrong directory (source root instead of build output)
- Make sure you open `dist/dev/mp-weixin` or `dist/build/mp-weixin`
- Run the build script first: `bash scripts/mp-weixin-dev.sh`

**Note for Real Device Testing:**
- Backend must be on a **public HTTPS domain**
- Domain must be configured in mini program's **request domain whitelist** in WeChat Official Platform
- Cannot use `localhost` or `127.0.0.1` on real devices (use actual server IP/domain)

### 6. Verify Build Output

After building, verify the output directory contains:
- `app.json` - Mini program configuration
- `app.js` - App entry point
- `app.wxss` - Global styles
- `pages/` - Page directories with compiled `.js`, `.wxml`, `.wxss` files

If these files are missing, the build failed. Check the build output for errors.

### 7. Start Backend Server

Make sure your backend is running:

```bash
cd backend
npm run start:dev
# Backend should be running on http://127.0.0.1:3000 (or localhost:3000, but 127.0.0.1 is preferred for DevTools)
```

### 8. Run Mini Program

1. In WeChat Developer Tools, click **"Compile" (编译)** or press `Ctrl/Cmd + B`
2. The mini program will open in the simulator
3. You should see the dog profile list page

## User Flow

### Complete Ordering Journey

1. **Dog Profile List** (`pages/dog-profile-list/index`)
   - Lists dog profiles (uses local cache until GET /dogs is available - see MVP Behavior section)
   - **Create Dog**: Navigate to dog creation

2. **Create Dog Profile** (`pages/dog-create/index`)
   - **IMPORTANT**: Requires valid `breedId` (UUID format)
   - Shows MVP limitation notice about missing breeds API
   - Creates dog profile via `POST /api/v1/dogs`
   - Stores `dogId` in local storage

3. **Recipe List** (`pages/recipe-list/index`)
   - Lists all recipes from `GET /api/v1/recipes`
   - Tap recipe → navigate to recipe detail

4. **Recipe Detail** (`pages/recipe-detail/index`)
   - Shows recipe information
   - **Generate DIY Sheet**: Calls `POST /api/v1/recipes/{id}/diy-sheet` (optional dogId)
   - **Order Recipe**: Navigates to order configuration

5. **Address Management**
   - **List** (`pages/address-list/index`): Lists addresses, set default, select for order
   - **Edit** (`pages/address-edit/index`): Create/update address

6. **Order Configuration** (`pages/order-config/index`)
   - Requires: `recipeId`, `dogId`, `addressId`
   - Input: daily grams, cycle days
   - Shows API gap notice for missing pricing/shipping preview APIs
   - Creates order draft: `POST /api/v1/orders`
   - Confirms order: `POST /api/v1/orders/{id}/confirm`
   - Pays order (mock): `POST /api/v1/orders/{id}/pay`
   - Shows orderId and status

7. **Orders List** (`pages/orders-list/index`)
   - Lists orders: `GET /api/v1/orders`
   - Tap order → order detail

8. **Order Detail** (`pages/order-detail/index`)
   - Shows order information and items
   - **View Snapshot**: Navigates to snapshot page

9. **Snapshot** (`pages/snapshot/index`)
   - Readonly view of recipe snapshot: `GET /api/v1/orders/items/{itemId}/snapshot`
   - Clearly marked as historical snapshot (not current recipe)
   - Shows historical recipe data at time of order

## Authentication

- **Auto-login on app launch**: Only if no token exists in storage, calls `POST /api/v1/auth/login` with `customerId: "mvp-user-001"`
- **Token storage**: Token is stored **only** in `uni.getStorageSync('token')` (persistent storage)
  - **NOT stored in `getApp().globalData`** - this was removed to prevent initialization errors
  - Single source of truth: `uni.getStorageSync('token')` / `uni.setStorageSync('token', token)`
- All API requests automatically include `Authorization: Bearer <token>` header
- **401 handling**: If token is missing or expired (401), the app will:
  1. Clear the expired token
  2. Automatically re-login
  3. Retry the original request once
  4. Prevent infinite retry loops
- **Error handling**: Login failures are handled gracefully - app continues to function even if backend is down

## API Client

The `src/utils/api.ts` module (canonical API module) handles:
- Base URL configuration
- **Token management**: `getToken()`, `setToken(token)`, `clearToken()` - all use `uni.getStorageSync/setStorageSync`
- Automatic token injection in request headers
- Unified response format handling (`code`, `message`, `data`)
- Error handling with toast notifications
- Auto re-login on 401 errors with single retry (prevents infinite loops)
- **No dependency on `getApp().globalData`** - prevents initialization errors

## MVP Behavior: Dog List Cache

**Dog list uses local cache until GET /dogs is available.**

The dog profile list page (`pages/dog-profile-list/index`) uses a local cache stored in uni storage to display dogs immediately after creation, even when the backend `GET /dogs` endpoint is missing or unavailable.

**How it works:**
- When a dog is created via `POST /dogs`, the created dog is automatically cached
- The list page loads from cache first (immediate display)
- If `GET /dogs` endpoint exists and works, it fetches and updates the cache
- If `GET /dogs` fails (404/501/etc), the page silently continues using cache
- Cache persists across app restarts

**Implementation:**
- Cache module: `src/utils/dog-cache.ts`
- Storage key: `dogs_cache`
- Functions: `getCachedDogs()`, `addDogToCache()`, `setCachedDogs()`, `clearDogsCache()`

**Future:**
- Once `GET /dogs` endpoint is implemented, the cache will be automatically replaced with backend data
- The cache can be removed in a future refactor when the API gap is closed

## API Gaps (Missing Backend APIs)

This section documents APIs that are required by the UI blueprint but are not currently implemented in the backend.

### 1. Breeds API (CRITICAL)

**Required by**: Dog creation flow (per `07_Core_Architecture.md`)

**Missing Endpoint**: `GET /api/v1/breeds` (or equivalent)

**Expected Response**:
```typescript
{
  code: 0,
  message: "Success",
  data: [
    {
      id: string,        // UUID
      name: string,       // e.g., "金毛", "拉布拉多"
      sizeClass: string, // SMALL | MEDIUM | LARGE | GIANT
      // ... other breed fields per 07_Core_Architecture.md
    }
  ]
}
```

**Current Workaround**:
- Dog creation page has a manual input field for `breedId`
- User must obtain valid UUID from backend database
- UI shows clear limitation notice

**Reference**: `03_Features_and_UI_Blueprints.md` Section 2.2 (Dog Profile), `07_Core_Architecture.md` (Breed entity)

---

### 2. Dog Profile List API

**Required by**: Dog profile list page

**Missing Endpoint**: `GET /api/v1/dogs` (list all dogs for current user)

**Expected Response**:
```typescript
{
  code: 0,
  message: "Success",
  data: DogProfileDto[]
}
```

**Current Workaround**:
- Page attempts to load single dog from storage
- Shows empty state if no dog found
- User must create dog first

**Reference**: `03_Features_and_UI_Blueprints.md` Section 2.2 (DogProfileListPage)

---

### 3. Shipping Fee Preview API

**Required by**: Order configuration page (per `03_Features_and_UI_Blueprints.md` Section 2.7)

**Missing Endpoint**: `GET /api/v1/shipping/fee/preview`

**Expected Request**:
```typescript
{
  addressId: string,
  totalWeightG: number,
  // ... other shipping parameters
}
```

**Expected Response**:
```typescript
{
  code: 0,
  message: "Success",
  data: {
    shippingFee: number,  // in CNY
    estimatedDays: number,
    // ... other shipping info
  }
}
```

**Current Workaround**:
- UI shows notice: "运费预览API未实现"
- Order proceeds without preview
- Backend calculates shipping fee during order creation

**Reference**: `03_Features_and_UI_Blueprints.md` Section 2.7 (OrderConfigPage), `05_API_Specs.md` Section 2.4

---

### 4. Order Pricing Preview API

**Required by**: Order configuration page (per `03_Features_and_UI_Blueprints.md` Section 2.7)

**Missing Endpoint**: `GET /api/v1/orders/pricing/preview` (or equivalent)

**Expected Request**:
```typescript
{
  dogId: string,
  recipeId: string,
  quantityG: number,
  cycleDays: number,
  addressId: string
}
```

**Expected Response**:
```typescript
{
  code: 0,
  message: "Success",
  data: {
    productAmount: number,  // in CNY
    shippingFee: number,    // in CNY
    totalAmount: number,   // in CNY
    // ... breakdown details
  }
}
```

**Current Workaround**:
- UI shows notice: "价格预览API未实现"
- Order proceeds without preview
- Backend calculates pricing during order creation

**Reference**: `03_Features_and_UI_Blueprints.md` Section 2.7 (OrderConfigPage), `05_API_Specs.md` Section 2.4

---

### 5. Get Single Address API

**Required by**: Address edit page

**Missing Endpoint**: `GET /api/v1/addresses/{id}`

**Expected Response**:
```typescript
{
  code: 0,
  message: "Success",
  data: AddressDto
}
```

**Current Workaround**:
- Page loads all addresses and finds the target one
- Inefficient but works for MVP

**Reference**: `03_Features_and_UI_Blueprints.md` Section 2.9 (AddressEditPage)

---

## Important Notes

### No Placeholder IDs

This implementation follows the constraint: **DO NOT invent placeholder IDs**. All IDs must be obtained via backend APIs:
- `recipeId`: From `GET /recipes`
- `dogId`: From `POST /dogs` (after creating dog profile)
- `addressId`: From `GET /addresses` or `POST /addresses`
- `orderId`: From `POST /orders`
- `itemId`: From order detail response

**Exception**: `breedId` - see API Gaps section above

### No Business Calculations in UI

The UI **MUST NOT** calculate:
- RER/DER (Resting/Daily Energy Requirement)
- Shipping fees
- Order pricing
- Any domain logic

All calculations are performed by the backend. The UI only displays backend results.

### Snapshot Display

- Snapshots are displayed as **readonly**
- Clearly marked as **historical snapshot** (not current recipe)
- UI shows warning: "此快照为下单时的配方版本，不可编辑。这是历史数据，不代表当前最新配方。"

### Navigation Rules

- `dogId` is stored in `uni.getStorageSync('dogId')` after creation
- If `dogId` is missing when creating order, user is routed to dog creation
- If no address exists, user is routed to address edit
- Selected `recipeId` and `addressId` are passed via URL parameters

### Response Format

All APIs return unified format:
```typescript
{
  code: number,
  message: string,
  data: T
}
```
- `code === 0` means success
- `code !== 0` shows toast with `message` and stops execution

## Troubleshooting

### "Network Error" or "Request Failed"

1. Check that backend is running on the configured BASE_URL
2. Verify BASE_URL in `src/utils/config.ts` matches your backend
3. Check WeChat DevTools console for detailed error messages
4. Ensure **"Do not verify valid domain names"** is enabled in DevTools settings
5. For real device: Backend must be HTTPS and whitelisted in WeChat Platform

### "Unauthorized" or 401 Errors

1. Check that login endpoint is working: `POST /api/v1/auth/login`
2. Verify token is being stored correctly (check DevTools Storage panel - look for `token` key)
3. Check that Authorization header is being sent (check Network panel in DevTools)
4. Token may have expired - app should auto re-login and retry the request
5. **Note**: Token is stored in `uni.getStorageSync('token')`, NOT in `getApp().globalData`

### "Invalid Input" or 400 Errors

1. Check backend logs for validation errors
2. Verify all required fields are being sent
3. Check enum values match backend expectations
4. **BreedId must be valid UUID** - check format

### Build Errors

1. Make sure all dependencies are installed: `npm install`
2. Check TypeScript version compatibility
3. Verify Uni-app CLI is properly installed
4. Check `dist/build/mp-weixin` folder is generated after build

### Dog Creation Fails

1. **Most common**: Invalid or missing `breedId`
   - Must be valid UUID format
   - Must exist in backend database
   - Check backend logs for breed validation errors
2. Check all required fields are filled
3. Verify date format (ISO string)
4. Check enum values are correct

## Testing Checklist

- [ ] Backend is running on configured BASE_URL
- [ ] DevTools "Do not verify valid domain names" is enabled
- [ ] Can see dog profile list (or empty state)
- [ ] Can create dog profile (with valid breedId)
- [ ] Can view recipes list
- [ ] Can view recipe detail
- [ ] Can generate DIY sheet (with/without dogId)
- [ ] Can create/update address
- [ ] Can set default address
- [ ] Can configure order (with API gap notices visible)
- [ ] Can create order (CREATE → CONFIRM → PAY)
- [ ] Can view orders list
- [ ] Can view order detail
- [ ] Can view snapshot (readonly, marked as historical)

## Development Commands

```bash
# Quick start (recommended) - installs deps, builds, shows output directory
bash scripts/mp-weixin-dev.sh
# or
npm run preview
# or
pnpm run preview

# Manual commands
npm install                    # Install dependencies
npm run dev:mp-weixin         # Development build (watch mode) → dist/dev/mp-weixin
npm run build:mp-weixin       # Production build → dist/build/mp-weixin

# Using pnpm
pnpm install
pnpm run dev:mp-weixin
pnpm run build:mp-weixin
```

**Output Directories:**
- Development: `dist/dev/mp-weixin` - Open this in WeChat Developer Tools for preview
- Production: `dist/build/mp-weixin` - Use this for release/upload

## Alternative: Using HBuilderX

If you prefer using HBuilderX IDE:

1. Download and install [HBuilderX](https://www.dcloud.io/hbuilderx.html)
2. Open HBuilderX
3. File → Open Directory → Select the `miniapp/` folder
4. Run → Run to Mini Program → Run to WeChat Developer Tools
5. HBuilderX will automatically build and open in WeChat DevTools

**Note**: The CLI workflow (above) is recommended for consistency and automation.

## Next Steps for Production

1. **Implement missing APIs** (see API Gaps section):
   - GET /breeds (or equivalent)
   - GET /dogs (list) - Currently using local cache as MVP workaround
   - GET /shipping/fee/preview
   - GET /orders/pricing/preview
   - GET /addresses/{id}

2. **Add proper error handling** and loading states

3. **Add address region picker** (province/city/district)

4. **Add proper validation** and user feedback

5. **Add design system** and better UI/UX

6. **Add proper state management** if needed

7. **Add unit tests** for critical flows

8. **Configure HTTPS domain** for real device testing

9. **Add WeChat payment integration** (replace mock pay)

10. **Add breed selection UI** (once breeds API is available)

## File List

```
miniapp/
├── src/                    # Source directory (canonical)
│   ├── pages.json          # Page configuration
│   ├── manifest.json       # App manifest
│   ├── main.ts             # Entry point
│   ├── App.vue             # App root component
│   ├── pages/
│   │   ├── dog-profile-list/
│   │   │   └── index.vue
│   │   ├── dog-create/
│   │   │   └── index.vue
│   │   ├── recipe-list/
│   │   │   └── index.vue
│   │   ├── recipe-detail/
│   │   │   └── index.vue
│   │   ├── address-list/
│   │   │   └── index.vue
│   │   ├── address-edit/
│   │   │   └── index.vue
│   │   ├── order-config/
│   │   │   └── index.vue
│   │   ├── orders-list/
│   │   │   └── index.vue
│   │   ├── order-detail/
│   │   │   └── index.vue
│   │   └── snapshot/
│   │       └── index.vue
│   └── utils/
│       ├── config.ts       # BASE_URL configuration
│       └── api.ts          # API client (canonical)
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config
├── package.json           # Dependencies and scripts
├── scripts/
│   ├── mp-weixin-dev.sh   # Development build helper
│   ├── mp-weixin-build.sh # Production build helper
│   └── mp-weixin-verify.sh # Build verification script
└── README.md
```

## References

- `00_Tech_Stack_Standards.md` - Technology stack requirements
- `03_Features_and_UI_Blueprints.md` - UI structure and flows
- `05_API_Specs.md` - API contracts
- `07_Core_Architecture.md` - Domain model and enums
- `06_Cursor_Collaboration_Guide.md` - Development constraints



