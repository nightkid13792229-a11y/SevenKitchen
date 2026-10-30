import { createRouter, createWebHistory } from "vue-router";
import type { RouteLocation, RouteRecordRaw } from "vue-router";
import { ElMessage } from "element-plus";
import {
  CHUNK_RELOAD_STORAGE_KEY,
  recoverFromStalePageFile,
} from "@/utils/chunkLoadRecovery";

/** 旧地址 → 新入口。保留 query，书签和群里的链接不失效。 */
const redirectTo =
  (path: string, query: Record<string, string> = {}) =>
  (to: RouteLocation) => ({
    path,
    query: { ...to.query, ...query },
  });

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/Login.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    component: () => import("@/layouts/MainLayout.vue"),
    redirect: "/dashboard",
    meta: { requiresAuth: true },
    children: [
      {
        path: "dashboard",
        name: "Dashboard",
        component: () => import("@/views/Dashboard.vue"),
        meta: { title: "工作台" },
      },
      {
        path: "dogs",
        name: "Dogs",
        component: () => import("@/views/Dogs/index.vue"),
        meta: { title: "狗档案" },
      },
      {
        path: "dogs/create",
        name: "DogCreate",
        component: () => import("@/views/Dogs/DogDetail.vue"),
        meta: { title: "新增档案" },
      },
      {
        path: "dogs/:id",
        name: "DogDetail",
        component: () => import("@/views/Dogs/DogDetail.vue"),
        meta: { title: "档案详情" },
      },
      {
        path: "dogs/:id/edit",
        name: "DogEdit",
        component: () => import("@/views/Dogs/DogDetail.vue"),
        meta: { title: "编辑档案" },
      },
      {
        // 营养师端 · 健康档案（2026-10-01，第八期）
        path: "dogs/:id/health",
        name: "DogHealth",
        component: () => import("@/views/Dogs/Health.vue"),
        meta: { title: "健康档案" },
      },
      {
        // 品种已并进狗档案（2026-10-30 导航整理），旧地址保留。
        path: "breeds",
        redirect: redirectTo("/dogs", { tab: "breeds" }),
      },
      {
        path: "users",
        name: "Users",
        component: () => import("@/views/Users/index.vue"),
        meta: { title: "顾客" },
      },
      {
        path: "ingredients",
        name: "Ingredients",
        component: () => import("@/views/Ingredients/index.vue"),
        meta: { title: "原料库" },
      },
      {
        // 旧地址：判断食材/补剂的半成品页已下线，统一落到 Agent 页。
        path: "ingredients/ai-create",
        redirect: { name: "IngredientAiAgent" },
      },
      {
        path: "ingredients/ai-agent",
        name: "IngredientAiAgent",
        component: () => import("@/views/Ingredients/ai-agent/index.vue"),
        meta: { title: "AI 添加原料" },
      },

      /* ---------------- 补剂（看板 / 商品 / 分装） ---------------- */
      {
        path: "supplement-shop",
        name: "SupplementShop",
        component: () => import("@/views/SupplementShop/index.vue"),
        meta: { title: "补剂" },
      },
      {
        path: "supplement-shop/dashboard",
        redirect: redirectTo("/supplement-shop", { tab: "board" }),
      },
      {
        path: "supplement-shop/catalog",
        redirect: redirectTo("/supplement-shop", {
          tab: "products",
          sub: "catalog",
        }),
      },
      {
        path: "supplement-shop/equivalence-groups",
        redirect: redirectTo("/supplement-shop", {
          tab: "products",
          sub: "equivalence",
        }),
      },
      {
        path: "supplement-shop/packing-summary",
        redirect: redirectTo("/supplement-shop", {
          tab: "packing",
          sub: "summary",
        }),
      },
      {
        path: "supplement-shop/packaging",
        redirect: redirectTo("/supplement-shop", {
          tab: "packing",
          sub: "rules",
        }),
      },
      {
        path: "supplement-shop/config",
        redirect: redirectTo("/settings/pricing", { tab: "supplement" }),
      },
      {
        path: "supplement-shop/aftersales",
        redirect: redirectTo("/aftersale-center", { tab: "supplement" }),
      },
      {
        // 补剂订单已并入订单中心（2026-10-31）：旧地址保留跳转，带上订单号关键词。
        path: "supplement-shop/orders",
        redirect: redirectTo("/order-center", { type: "SUPPLEMENT" }),
      },
      {
        path: "supplement-shop/orders/:id/labels",
        name: "SupplementShopLabelPrint",
        component: () => import("@/views/SupplementShop/LabelPrint.vue"),
        meta: { title: "分装标签" },
      },

      /* ---------------- 试吃装（商品 / 库存 / 备货） ---------------- */
      {
        path: "tasting-pack",
        name: "TastingPack",
        component: () => import("@/views/TastingPack/index.vue"),
        meta: { title: "试吃装" },
      },
      {
        path: "tasting-pack/config",
        redirect: redirectTo("/settings/pricing", { tab: "tasting" }),
      },
      {
        path: "tasting-pack/packs",
        redirect: redirectTo("/tasting-pack", { tab: "products" }),
      },
      {
        path: "tasting-pack/stock",
        redirect: redirectTo("/tasting-pack", { tab: "stock" }),
      },
      {
        path: "tasting-pack/production-plans",
        redirect: redirectTo("/tasting-pack", { tab: "plans" }),
      },

      /* ---------------- 订单与售后 ---------------- */
      {
        path: "order-center",
        name: "OrderCenter",
        component: () => import("@/views/OrderCenter/index.vue"),
        meta: { title: "订单中心" },
      },
      {
        path: "aftersale-center",
        name: "AftersaleCenter",
        component: () => import("@/views/AftersaleCenter/index.vue"),
        meta: { title: "售后与退款" },
      },
      {
        path: "aftersale",
        redirect: redirectTo("/aftersale-center", { tab: "tickets" }),
      },
      {
        path: "refunds",
        redirect: redirectTo("/aftersale-center", { tab: "refunds" }),
      },
      {
        path: "custom-recipes/aftersales",
        redirect: redirectTo("/aftersale-center", { tab: "tickets" }),
      },
      {
        path: "custom-recipes/refunds",
        redirect: redirectTo("/aftersale-center", { tab: "refund-requests" }),
      },
      {
        path: "custom-recipes/schedule",
        name: "CustomRecipeSchedule",
        component: () => import("@/views/CustomRecipes/ScheduleCalendar.vue"),
        meta: { title: "排期日历" },
      },

      /* ---------------- 食谱与原料 ---------------- */
      {
        // 旧「食谱列表」已合并到食谱设计器（2026-10-23）。
        path: "recipes",
        redirect: "/recipe-designer",
      },
      {
        path: "recipe-designer",
        name: "RecipeDesigner",
        component: () => import("@/views/RecipeDesigner/index.vue"),
        meta: { title: "食谱设计" },
      },
      {
        path: "recipe-designer/series/:seriesId/drafts/:draftId",
        name: "RecipeDesignerEditor",
        component: () => import("@/views/RecipeDesigner/Editor.vue"),
        meta: { title: "配方编辑" },
      },
      {
        // 订单绑定食谱设计工作台（2026-10-22）。
        path: "order-design/:orderId",
        name: "OrderDesignWorkspace",
        component: () => import("@/views/RecipeDesigner/OrderDesignWorkspace.vue"),
        meta: { title: "本单食谱设计" },
      },
      {
        path: "recipes/create",
        name: "RecipeCreate",
        component: () => import("@/views/Recipes/RecipeForm.vue"),
        meta: { title: "新建食谱" },
      },
      {
        path: "recipes/:id",
        name: "RecipeDetail",
        component: () => import("@/views/Recipes/RecipeForm.vue"),
        meta: { title: "查看食谱" },
      },
      {
        path: "recipes/:id/edit",
        name: "RecipeEdit",
        component: () => import("@/views/Recipes/RecipeForm.vue"),
        meta: { title: "编辑食谱" },
      },
      {
        path: "nutrition-standards",
        name: "NutritionStandards",
        component: () => import("@/views/NutritionStandards/index.vue"),
        meta: { title: "营养标准" },
      },
      {
        path: "nutrition-standards/fediaf-2025-dog",
        redirect: redirectTo("/nutrition-standards", { tab: "standard" }),
      },
      {
        path: "nutrition-standards/ingredient-readiness",
        redirect: redirectTo("/nutrition-standards", { tab: "readiness" }),
      },
      {
        path: "nutrition-standards/fediaf-target-preview",
        redirect: redirectTo("/nutrition-standards", { tab: "preview" }),
      },
      {
        path: "nutrition-governance",
        redirect: { path: "/ingredients", query: { tab: "nutrition" } },
      },
      {
        path: "ingredient-tags",
        redirect: { path: "/ingredients", query: { tab: "tags" } },
      },
      {
        path: "search-governance",
        name: "SearchGovernance",
        component: () => import("@/views/SearchGovernance/index.vue"),
        meta: { title: "搜索治理" },
      },
      {
        path: "reviews",
        name: "Reviews",
        component: () => import("@/views/Reviews/index.vue"),
        meta: { title: "评价管理" },
      },

      /* ---------------- 顾客 ---------------- */
      {
        path: "analytics/dog-profile",
        name: "DogProfileAnalytics",
        component: () => import("@/views/Analytics/DogProfileAnalytics.vue"),
        meta: { title: "转化分析" },
      },
      {
        path: "weight-goal-plan",
        name: "WeightGoalPlan",
        component: () => import("@/views/WeightGoalPlan/PlanList.vue"),
        meta: { title: "体重管理计划" },
      },
      {
        path: "customer-service",
        name: "CustomerServiceConversations",
        component: () => import("@/views/CustomerServiceConversations.vue"),
        meta: { title: "客服会话" },
      },

      /* ---------------- 库存与生产 ---------------- */
      {
        path: "inventory",
        name: "Inventory",
        component: () => import("@/views/Inventory.vue"),
        meta: { title: "库存" },
      },
      {
        path: "production",
        name: "Production",
        component: () => import("@/views/Production.vue"),
        meta: { title: "生产" },
      },

      /* ---------------- 订单详情 / 定制订单 ---------------- */
      {
        path: "orders",
        redirect: "/order-center?type=FOOD",
        meta: { title: "订单管理" },
      },
      {
        path: "orders/:id",
        name: "OrderDetail",
        component: () => import("@/views/Orders/Detail.vue"),
        meta: { title: "订单详情" },
      },
      {
        path: "custom-recipes/assisted-order",
        name: "CustomRecipeAssistedOrder",
        component: () => import("@/views/CustomRecipes/AssistedOrderCreate.vue"),
        meta: { title: "代客下单" },
      },
      {
        path: "custom-recipes",
        // 定制订单已合并到订单中心（2026-10-21）。
        redirect: "/order-center?type=CUSTOM_RECIPE",
        meta: { title: "食谱定制订单" },
      },

      /* ---------------- 采购与财务 ---------------- */
      {
        path: "purchasing",
        name: "Purchasing",
        component: () => import("@/views/Purchasing/index.vue"),
        meta: { title: "采购" },
      },
      {
        path: "purchasing/lists",
        redirect: redirectTo("/purchasing", { tab: "lists" }),
      },
      {
        path: "purchasing/history",
        redirect: redirectTo("/purchasing", { tab: "history" }),
      },
      {
        path: "purchasing/reimbursements",
        name: "ReimbursementList",
        component: () => import("@/views/Purchasing/ReimbursementList.vue"),
        meta: { title: "报销" },
      },
      {
        path: "purchasing/reimbursements/detail",
        name: "ReimbursementDetail",
        component: () => import("@/views/Purchasing/ReimbursementDetail.vue"),
        meta: { title: "报销单详情" },
      },
      {
        path: "finance",
        name: "FinanceCenter",
        component: () => import("@/views/Finance/index.vue"),
        meta: { title: "财务" },
      },
      {
        path: "finance/overview",
        redirect: redirectTo("/finance", { tab: "overview" }),
      },
      {
        path: "finance/expense-bills",
        redirect: redirectTo("/finance", { tab: "expense-bills" }),
      },
      {
        path: "finance/expense-analysis",
        redirect: redirectTo("/finance", { tab: "expense-analysis" }),
      },
      {
        path: "finance/contribution-analysis",
        redirect: redirectTo("/finance", { tab: "contribution" }),
      },

      /* ---------------- 设置 ---------------- */
      {
        path: "settings/pricing",
        name: "SettingsPricing",
        component: () => import("@/views/Settings/Pricing.vue"),
        meta: { title: "成本与定价" },
      },
      {
        path: "settings/payment",
        name: "SettingsPayment",
        component: () => import("@/views/Settings/Payment.vue"),
        meta: { title: "支付与客服" },
      },
      {
        path: "settings/options",
        name: "PlatformOptions",
        component: () => import("@/views/PlatformOptions/index.vue"),
        meta: { title: "选项与文案" },
      },
      {
        path: "settings/ai",
        name: "AgentConfig",
        component: () => import("@/views/AgentConfig/index.vue"),
        meta: { title: "AI 配置" },
      },
      {
        path: "global-config",
        redirect: redirectTo("/settings/pricing", { tab: "global" }),
      },
      {
        path: "payment-config",
        redirect: redirectTo("/settings/payment", { tab: "payment" }),
      },
      {
        path: "customer-service-config",
        redirect: redirectTo("/settings/payment", { tab: "customer-service" }),
      },
      {
        path: "platform-options",
        redirect: "/settings/options",
      },
      {
        path: "agent-config",
        redirect: "/settings/ai",
      },
      {
        path: "custom-recipes/config",
        redirect: redirectTo("/settings/pricing", { tab: "recipe" }),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 「页面文件已过期」自愈（2026-10-15 老板报的"点生命阶段进不去配方编辑器"）。
 *
 * 后台是单页应用，每个页面都是按需下载的独立 JS 文件、文件名带内容指纹；
 * 部署会清空服务器目录并上传新指纹，于是**部署前就打开的标签页**一点尚未加载过的页面
 * （例如从"食谱设计"点进配方编辑器）就会去要一个已被删掉的文件 → 404 →
 * 页面切换被静默中止，看起来就是"点了没反应"。
 */
router.onError((error, to) => {
  recoverFromStalePageFile(error, to?.fullPath || window.location.pathname, {
    readLastReloadAt: () =>
      Number(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) || 0),
    writeLastReloadAt: (at) =>
      window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(at)),
    now: () => Date.now(),
    reload: (target) => window.location.assign(target),
    notify: (level, message) =>
      level === "error" ? ElMessage.error(message) : ElMessage.info(message),
  });
});

// Navigation guard for authentication
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem("admin_token");
  const requiresAuth = to.meta.requiresAuth !== false;

  if (requiresAuth && !token) {
    next("/login");
  } else if (to.path === "/login" && token) {
    next("/dashboard");
  } else {
    next();
  }
});

export default router;
