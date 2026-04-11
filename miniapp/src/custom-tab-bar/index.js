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

  pageLifetimes: {
    show() {
      this.refresh();
    }
  },

  attached() {
    this.refresh();
  },

  methods: {
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
          return;
        }

        // 直接从storage读取用户角色，避免依赖this.data.isStaff（可能有异步延迟）
        const user = wx.getStorageSync('user');
        const isStaff = user && (user.role === 'STAFF' || user.role === 'ADMIN');

        // 根据页面路径计算selected索引
        let newSelected = 0;

        // 注意：currentRoute 可能没有开头的斜杠，如 "pages/home/index"
        if (currentRoute.includes('pages/home/index') || currentRoute.includes('/pages/home/index')) {
          newSelected = 0;
        } else if (currentRoute.includes('pages/me/index') || currentRoute.includes('/pages/me/index')) {
          // 员工/管理员：me页面对应索引2（因为中间插入了工作台）
          // 普通用户：me页面对应索引1
          newSelected = isStaff ? 2 : 1;
        } else if (currentRoute.includes('pages/staff-workbench/index') || currentRoute.includes('/pages/staff-workbench/index')) {
          newSelected = 1;
        } else {
          return;
        }

        // 只在值变化时才更新
        if (this.data.selected !== newSelected) {
          this.setData({
            selected: newSelected
          });
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

      // 立即更新本地状态（视觉反馈）
      this.setData({
        selected: index
      });

      // 切换页面
      wx.switchTab({
        url: url,
        fail: (err) => {
          console.error('[TabBar] Failed to switch page:', err);
        }
      });
    },

    /**
     * 刷新TabBar状态（供外部调用）
     * 重新检查用户角色和当前页面选中状态
     */
    refresh() {
      this.checkUserRole();
      this.updateSelectedByCurrentPage();
    }
  }
});
