# Real User Dry-Run Checklist

This checklist guides you through testing the SevenKitchen Mini Program as a real user would, focusing on UI interactions and user flows, not API endpoints.

## Prerequisites

✅ **Before starting, ensure:**
1. Backend is running: `cd backend && pnpm start:dev`
2. Health check passes: `cd miniapp && bash scripts/doctor.sh`
3. Development build is running: `cd miniapp && pnpm dev:mp-weixin`
4. WeChat DevTools is open with `dist/dev/mp-weixin` imported
5. "Do not verify valid domain names" is enabled in DevTools settings

---

## Step 1: App Launch & Auto-Login

**What to do:**
1. Open the miniapp in WeChat DevTools
2. Check the console logs (should see startup info)

**Expected behavior:**
- ✅ App launches without crashing
- ✅ Console shows:
  - BASE_URL: `http://127.0.0.1:3000/api/v1`
  - Token status (Present or Not found)
  - Build Mode (Development or Production)
- ✅ If no token: Auto-login attempt happens automatically
- ✅ If backend is down: Non-blocking toast appears, app remains usable

**UI to verify:**
- App shows the first page (狗狗档案 / Dog Profile List)
- No error screens or crashes

**If auto-login fails:**
- Toast message appears: "无法连接到服务器，请检查网络设置"
- App continues to function (graceful degradation)
- User can still navigate

---

## Step 2: Create Dog Profile

**Navigation path:**
- Start: `pages/dog-profile-list/index` (狗狗档案)
- Action: Tap "创建狗狗档案" button
- Navigate to: `pages/dog-create/index` (创建狗狗档案)

**What to do:**
1. On the Dog Profile List page, tap "创建狗狗档案"
2. Fill in the dog creation form:
   - Dog name (required)
   - Other fields as shown
3. Submit the form

**Expected behavior:**
- ✅ Page navigates smoothly
- ✅ Form fields are editable
- ✅ Submit button works
- ✅ Loading indicator appears during submission
- ✅ Success: Returns to dog list or shows success message
- ✅ Error: Shows toast with error message (non-blocking)

**UI to verify:**
- Form is visible and functional
- No crashes on submit
- Error messages are user-friendly

---

## Step 3: View Recipe List

**Navigation path:**
- From any page, navigate to: `pages/recipe-list/index` (食谱列表)
- (May need to add navigation button or use DevTools page selector)

**What to do:**
1. Navigate to Recipe List page
2. Wait for recipes to load
3. Tap on a recipe item

**Expected behavior:**
- ✅ Recipe list loads (may be empty if no recipes in backend)
- ✅ If empty: Shows empty state with:
  - Title: "No recipes available yet"
  - Subtitle explaining backend returned empty list
  - "Use Demo Recipe (MVP)" button
  - "Go to Network Settings" button
- ✅ If recipes exist: List displays recipe names and info
- ✅ Tapping a recipe navigates to recipe detail

**UI to verify:**
- List renders correctly
- Empty state is handled gracefully with demo option
- Navigation works

**Demo Recipe Fallback (when recipes=[]):**
- ✅ Empty state shows clear message and demo button
- ✅ Tapping "Use Demo Recipe" opens recipe detail in demo mode
- ✅ Demo recipe shows "DEMO" badge
- ✅ Demo recipe has static DIY sheet (no backend call)
- ✅ Can navigate to order config, but order creation is blocked with clear modal
- ✅ Modal explains limitation and provides navigation options

---

## Demo Recipe Fallback (when recipes=[])

**When backend returns empty recipe list:**

If `GET /api/v1/recipes` returns `code=0` with `data=[]`, the recipe list page shows an empty state with demo options.

**What to do:**
1. Navigate to Recipe List page
2. See empty state message
3. Tap "Use Demo Recipe (MVP)" button

**Expected behavior:**
- ✅ Empty state shows:
  - Title: "No recipes available yet"
  - Subtitle: "Backend returned an empty list (MVP). Use a demo recipe to continue the flow."
  - Primary button: "Use Demo Recipe (MVP)"
  - Secondary button: "Go to Network Settings"
- ✅ Tapping "Use Demo Recipe" navigates to recipe detail with `demo=1` query param
- ✅ Recipe detail page shows:
  - Recipe name: "Demo Chicken Pumpkin Bowl"
  - "DEMO" badge next to recipe ID
  - Description: "MVP demo recipe for end-to-end testing"
  - Energy density: 120 kcal/100g
  - "Generate DIY Sheet (Demo)" button (no backend call)
  - "订购此食谱" (Continue to Order) button
- ✅ Tapping "Generate DIY Sheet (Demo)" shows static 4-step DIY sheet without network call
- ✅ Tapping "Continue to Order" navigates to order config with demo flag

**Order Config in Demo Mode:**
- ✅ Order config page loads normally
- ✅ Can select dog from cache
- ✅ Can select/create address
- ✅ "创建订单" button is disabled and shows "Demo Mode: Order Creation Disabled"
- ✅ Tapping the button shows blocking modal:
  - Title: "Backend has no real recipes yet"
  - Message: "Demo mode cannot create a real order. The backend requires a real recipeId."
  - Buttons: "Go to Network Settings" and "Back to Recipes"
- ✅ Modal prevents confusing 404/500 errors
- ✅ User can navigate away via modal buttons

**Console logs to verify:**
- `[RecipeList] recipes empty -> showing demo entry`
- `[RecipeDetail] demo mode enabled`
- `[OrderConfig] demo mode -> real order disabled until backend has recipes`

---

## Step 4: View Recipe Detail & Configure Order

**Navigation path:**
- From Recipe List: Tap recipe → `pages/recipe-detail/index` (食谱详情)
- From Recipe Detail: Tap "下单" or "配置订单" → `pages/order-config/index` (下单配置)

**What to do:**
1. On Recipe Detail page, review recipe information
2. Tap button to configure order (e.g., "下单" or "配置订单")
3. On Order Config page:
   - Select dog profile (if multiple)
   - Configure order parameters
   - Select delivery address

**Expected behavior:**
- ✅ Recipe detail page shows recipe information
- ✅ Navigation to order config works
- ✅ Order config form is functional
- ✅ Dog selection works (if applicable)
- ✅ Address selection works

**UI to verify:**
- All form fields are accessible
- Navigation flows smoothly
- No crashes on form interactions

---

## Step 5: Create/Select Address

**Navigation path:**
- From Order Config: Tap address selector → `pages/address-list/index` (收货地址)
- From Address List: Tap "添加地址" → `pages/address-edit/index` (编辑地址)

**What to do:**
1. On Address List page, review existing addresses
2. Tap "添加地址" or edit existing address
3. Fill in address form:
   - Recipient name
   - Phone number
   - Address details
   - etc.
4. Save address

**Expected behavior:**
- ✅ Address list loads (may be empty)
- ✅ Add/Edit address form is functional
- ✅ Form validation works (if implemented)
- ✅ Save button works
- ✅ Returns to address list after save

**UI to verify:**
- Form fields are editable
- Save operation completes
- Navigation back works

---

## Step 6: Complete Order & Payment

**Navigation path:**
- From Order Config: Complete form → Submit order
- After submission: Navigate to `pages/orders-list/index` (我的订单) or `pages/order-detail/index` (订单详情)

**What to do:**
1. On Order Config page, ensure all fields are filled:
   - Recipe selected (from recipe detail page)
   - Dog profile selected (from dog cache)
   - Address selected
   - Daily grams and cycle days entered
2. Tap "创建订单 -> 确认 -> 支付（测试）" button
3. Wait for order creation, confirmation, and payment (mock) to complete

**Expected behavior:**
- ✅ Order submission works
- ✅ Loading indicator during submission
- ✅ Console shows: `[OrderCreate] payload = {...}` with normalized UUIDs
- ✅ Success: Shows "订单创建成功" toast, then navigates to orders list
- ✅ Error: Shows toast with normalized error message (never an array)
- ✅ Payment flow completes automatically (mock)

**UI to verify:**
- Order submission completes
- Success/error feedback is clear (no array errors in toast)
- Navigation after submission works
- New order appears in orders list

**If order creation fails:**
- Check console log `[OrderCreate] payload =` to see what was sent
- Ensure recipeId is a UUID string (not array/object)
- If recipeId is invalid, modal shows: "Invalid recipeId. Please re-enter the flow from Recipe Detail."
- All error messages are normalized (arrays converted to strings)

---

## Step 7: View Order List

**Navigation path:**
- Navigate to: `pages/orders-list/index` (我的订单)

**What to do:**
1. Open Order List page
2. Review list of orders
3. Tap on an order to view details

**Expected behavior:**
- ✅ Order list loads
- ✅ Shows orders (may be empty if no orders)
- ✅ Empty state: "暂无订单" message
- ✅ Tapping order navigates to order detail

**UI to verify:**
- List renders correctly
- Empty state handled
- Navigation works

---

## Step 8: View Order Detail & Snapshot

**Navigation path:**
- From Order List: Tap order → `pages/order-detail/index` (订单详情)
- From Order Detail: Tap "查看快照" or similar → `pages/snapshot/index` (食谱快照)

**What to do:**
1. On Order Detail page, review order information
2. Check that recipe snapshot is shown (read-only)
3. Navigate to Snapshot page if available
4. Review snapshot details

**Expected behavior:**
- ✅ Order detail shows all order information
- ✅ Recipe snapshot is displayed (read-only, from snapshot data)
- ✅ Snapshot page shows historical recipe data
- ✅ No edit buttons on snapshot (it's immutable)

**UI to verify:**
- Order information is complete
- Snapshot is read-only
- Navigation works

---

## Step 9: Generate DIY Sheet (If Implemented)

**Navigation path:**
- From Order Detail or Snapshot: Tap "生成DIY单" or similar button

**What to do:**
1. Navigate to DIY sheet generation (if available)
2. Review generated sheet
3. Check print/export functionality (if available)

**Expected behavior:**
- ✅ DIY sheet generates correctly
- ✅ Shows recipe details, ingredients, instructions
- ✅ Print/export works (if implemented)

**UI to verify:**
- Sheet is readable
- All information is present
- Formatting is correct

---

## Step 10: Network Settings (Runtime Config)

**Navigation path:**
- Navigate to: `pages/network-settings/index` (网络设置)

**What to do:**
1. Open Network Settings page
2. Review current BASE_URL
3. Test connection using "测试连接" button
4. (Optional) Change BASE_URL if needed
5. Save settings

**Expected behavior:**
- ✅ Current BASE_URL is displayed
- ✅ Connection test works
- ✅ Success: Shows "✓ 连接成功"
- ✅ Failure: Shows error message
- ✅ Settings persist after save

**UI to verify:**
- Form is functional
- Connection test provides feedback
- Settings are saved

---

## Common Issues & Solutions

### App Crashes on Launch
- **Check:** Console logs for errors
- **Solution:** Run `bash scripts/doctor.sh` to diagnose
- **Verify:** Backend is running and reachable

### Auto-Login Fails
- **Expected:** Non-blocking toast appears, app continues
- **If blocking:** Check error handling in `src/App.vue`
- **Solution:** Use Network Settings to verify BASE_URL

### Navigation Doesn't Work
- **Check:** Page path in `pages.json` matches file structure
- **Verify:** Build output includes the page

### API Calls Fail
- **Check:** Backend is running: `cd backend && pnpm start:dev`
- **Check:** BASE_URL is correct (use Network Settings page)
- **Verify:** Token is present (check console logs on startup)

### Empty States Not Handled
- **Expected:** Pages show "暂无..." messages when data is empty
- **If not:** This is a UI gap, not a blocker for core functionality

---

## Success Criteria

✅ **All steps complete without crashes:**
- App never crashes, even if backend is down
- All navigation works
- Forms are functional
- Error messages are user-friendly

✅ **Graceful degradation:**
- App remains usable if backend is slow
- Non-blocking error messages
- User can navigate even if some API calls fail

✅ **Real user experience:**
- No technical errors visible to user
- Clear feedback for all actions
- Smooth navigation flow

---

## What is Intentionally Deferred

These features may not be fully implemented yet and are **not blockers**:

- ❓ Full payment integration (may be mocked or simplified)
- ❓ Print/export functionality for DIY sheets
- ❓ Advanced form validation
- ❓ Image uploads (if required)
- ❓ Production HTTPS setup (dev only)
- ❓ Some API endpoints may return empty data (API gaps)

**These are documented separately and should not block real user verification.**

---

## Final Check

Before marking as "READY FOR REAL USER VERIFICATION":

- [ ] All steps above completed without crashes
- [ ] Console shows no red errors
- [ ] Auto-login works when backend is running
- [ ] App remains usable when backend is down
- [ ] Navigation flows are smooth
- [ ] Error messages are user-friendly
- [ ] Network Settings page works

**If all checks pass: ✅ READY FOR REAL USER VERIFICATION**
