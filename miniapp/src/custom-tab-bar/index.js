Component({
  data: {
    selected: 0,
    isStaff: false,
    list: [
      {
        pagePath: "/pages/home/index",
        iconPath: "/static/tabbar/home.png",
        selectedIconPath: "/static/tabbar/home-active.png",
        text: "首页"
      },
      {
        pagePath: "/pages/me/index",
        iconPath: "/static/tabbar/me.png",
        selectedIconPath: "/static/tabbar/me-active.png",
        text: "我的"
      }
    ],
    staffTab: {
      pagePath: "/pages/staff-workbench/index",
      iconPath: "/static/tabbar/staff.png",
      selectedIconPath: "/static/tabbar/staff-active.png",
      text: "工作台"
    }
  },

  attached() {
    console.log('[TabBar] Component attached');

    // 先检查用户角色（同步更新）
    this.checkUserRole();

    // 初始化 lastRoute 为当前页面路径（避免初始化时的误判）
    // 直接设置 this.data，不使用 setData（避免异步延迟）
    try {
      const pages = getCurrentPages();
      if (pages.length > 0) {
        const currentPage = pages[pages.length - 1];
        const currentRoute = currentPage.route || currentPage.__route__;
        this.data.lastRoute = currentRoute;
        console.log('[TabBar] Initialized lastRoute:', currentRoute);
      } else {
        this.data.lastRoute = '';
      }
    } catch (error) {
      this.data.lastRoute = '';
    }

    // 根据当前页面设置selected（组件重新加载后必须重新计算）
    this.updateSelectedByCurrentPage();

    // 启动页面监听定时器（监听页面切换）
    this.startPageMonitor();
  },

  detached() {
    // 组件销毁时清除定时器
    if (this.data.pageMonitorTimer) {
      clearInterval(this.data.pageMonitorTimer);
    }
  },

  methods: {
    /**
     * 启动页面监听定时器
     * 定期检查当前页面路径，确保TabBar状态正确
     */
    startPageMonitor() {
      console.log('[TabBar] Starting page monitor...');

      // 避免重复启动
      if (this.data.pageMonitorTimer) {
        console.log('[TabBar] Page monitor already running');
        return;
      }

      this.data.pageMonitorTimer = setInterval(() => {
        try {
          const pages = getCurrentPages();
          if (pages.length === 0) return;

          const currentPage = pages[pages.length - 1];
          const currentRoute = currentPage.route || currentPage.__route__;

          // 只在页面路径变化时更新
          if (currentRoute !== this.data.lastRoute) {
            console.log('[TabBar] Page route changed:', this.data.lastRoute, '->', currentRoute);

            // 更新 lastRoute
            this.setData({
              lastRoute: currentRoute
            });

            // 等待 setData 完成后再更新 selected
            setTimeout(() => {
              this.updateSelectedByCurrentPage();
            }, 50);
          }
        } catch (error) {
          console.error('[TabBar] Page monitor error:', error);
        }
      }, 200); // 每200ms检查一次，频率低不会影响性能
    },

    /**
     * 根据当前页面路径自动计算selected值
     * 这是消除闪烁的关键：不依赖storage，直接从页面路径判断
     */
    updateSelectedByCurrentPage() {
      try {
        const pages = getCurrentPages();
        if (pages.length === 0) return;

        const currentPage = pages[pages.length - 1];
        const currentRoute = currentPage.route || currentPage.__route__;

        // 如果 currentRoute 为空，不处理
        if (!currentRoute) {
          console.log('[TabBar] Current route is empty, skipping update');
          return;
        }

        // 直接从storage读取用户角色，避免依赖this.data.isStaff（可能有异步延迟）
        const user = wx.getStorageSync('user');
        const isStaff = user && (user.role === 'STAFF' || user.role === 'ADMIN');

        console.log('[TabBar] Current page route:', currentRoute, 'isStaff from storage:', isStaff, 'current selected:', this.data.selected);

        // 根据页面路径计算selected索引
        let newSelected = 0;

        // 注意：currentRoute 可能没有开头的斜杠，如 "pages/home/index"
        if (currentRoute.includes('pages/home/index') || currentRoute.includes('/pages/home/index')) {
          newSelected = 0;
        } else if (currentRoute.includes('pages/me/index') || currentRoute.includes('/pages/me/index')) {
          // 员工/管理员：me页面对应索引2（因为中间插入了工作台）
          // 普通用户：me页面对应索引1
          newSelected = isStaff ? 2 : 1;
          console.log('[TabBar] Me page - isStaff from storage:', isStaff, 'newSelected:', newSelected);
        } else if (currentRoute.includes('pages/staff-workbench/index') || currentRoute.includes('/pages/staff-workbench/index')) {
          newSelected = 1;
        } else {
          // 其他页面：保持当前 selected 不变
          console.log('[TabBar] Unknown page route, keeping current selected:', this.data.selected);
          return;
        }

        // 只在值变化时才更新
        if (this.data.selected !== newSelected) {
          console.log('[TabBar] Auto-updating selected:', this.data.selected, '->', newSelected);
          this.setData({
            selected: newSelected
          });
        } else {
          console.log('[TabBar] Selected unchanged:', newSelected);
        }
      } catch (error) {
        console.error('[TabBar] Failed to update selected by current page:', error);
      }
    },

    checkUserRole() {
      try {
        const user = wx.getStorageSync('user');
        const isStaff = user && (user.role === 'STAFF' || user.role === 'ADMIN');

        // 只在isStaff变化时才更新
        if (this.data.isStaff !== isStaff) {
          console.log('[TabBar] User role changed:', isStaff ? 'Staff' : 'Customer');
          this.setData({
            isStaff: isStaff
          });
        }
      } catch (error) {
        console.error('[TabBar] Failed to check user role:', error);
        if (this.data.isStaff !== false) {
          this.setData({
            isStaff: false
          });
        }
      }
    },

    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = parseInt(data.index, 10); // 确保是数字

      console.log('[TabBar] switchTab - Switching to index:', index, 'path:', url);

      // 立即更新本地状态（视觉反馈）
      this.setData({
        selected: index
      });

      // 切换页面
      wx.switchTab({
        url: url,
        success: () => {
          console.log('[TabBar] Page switched successfully');
          // 页面切换成功后，不主动更新 selected
          // 让定时器自动检测页面变化并更新（避免组件重新加载导致的冲突）
        },
        fail: (err) => {
          console.error('[TabBar] Failed to switch page:', err);
        }
      });
    }
  }
});
