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
      icon: "💼",
      text: "工作台"
    }
  },

  attached() {
    this.checkUserRole();
    this.updateSelected();

    // 监听页面显示，每次页面显示时更新
    this._observer = null;
  },

  detached() {
    if (this._observer) {
      this._observer.disconnect();
    }
  },

  methods: {
    checkUserRole() {
      try {
        const user = wx.getStorageSync('user');
        const isStaff = user && (user.role === 'STAFF' || user.role === 'ADMIN');
        this.setData({
          isStaff: isStaff
        });
        console.log('[TabBar] User role check:', isStaff ? 'Staff' : 'Customer');
      } catch (error) {
        console.error('[TabBar] Failed to check user role:', error);
        this.setData({
          isStaff: false
        });
      }
    },

    updateSelected() {
      try {
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        const route = currentPage?.route || '';

        let selected = 0;
        if (route.includes('home/index')) {
          selected = 0;
        } else if (route.includes('staff-workbench')) {
          selected = this.data.isStaff ? 1 : 0;
        } else if (route.includes('me/index')) {
          selected = this.data.isStaff ? 2 : 1;
        }

        this.setData({
          selected: selected
        });
      } catch (error) {
        console.error('[TabBar] Failed to update selected:', error);
      }
    },

    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;

      wx.switchTab({
        url: url
      });

      this.setData({
        selected: data.index
      });
    }
  }
});
