# SevenKitchen 底部导航栏图标指南

## 当前图标配置

### 1. 首页图标
- 未选中：`/static/tabbar/home.png`
- 选中：`/static/tabbar/home-active.png`
- 尺寸建议：48x48px (2x) 和 81x81px (3x)
- 色彩：
  - 未选中：#999999 (灰色)
  - 选中：#1890ff (蓝色) 或 #667eea (紫色)

### 2. 工作台图标（员工可见）
- 当前使用：emoji 💼
- 建议创建：`/static/tabbar/staff.png` 和 `/static/tabbar/staff-active.png`
- 图标建议：公文包、工具箱、工作台
- 尺寸：48x48px 和 81x81px

### 3. 我的图标
- 未选中：`/static/tabbar/me.png`
- 选中：`/static/tabbar/me-active.png`
- 尺寸：48x48px 和 81x81px
- 色彩：同上

## 快速解决方案

### 方法1：使用iconfont（推荐）
1. 访问 https://www.iconfont.cn/
2. 搜索并下载图标
3. 下载两种颜色的PNG

### 方法2：使用在线SVG转PNG工具
1. 创建SVG文件（见下方SVG代码）
2. 访问 https://cloudconvert.com/svg-to-png
3. 上传SVG并转换为PNG
4. 调整尺寸为48x48和81x81

### 方法3：使用Figma/Sketch绘制
1. 创建48x81的画布
2. 绘制或导入图标
3. 填充颜色（#999999和#1890ff）
4. 导出@2x和@3x版本
