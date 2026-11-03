# 精臣小程序SDK配置指南

> **版本**: 3.0.4
> **更新时间**: 2025-01-22

---

## 📦 SDK目录结构

```
miniapp/src/utils/jcing-sdk/
├── JCAPI.js              # 主API入口
├── JCAPIManager.js       # SDK管理器
├── JCAPIErrorCode.js     # 错误码定义
├── JCBle.js              # 蓝牙连接核心
├── JCPrinter.js          # 打印功能
├── JCBarcode.js          # 条码生成
├── JCQrcode.js           # 二维码生成
├── JCDataUntil.js        # 数据处理工具
├── JCAPIDraw.js          # 绘制功能
├── JCCodeWriter.js       # 编码器
└── lzo1x.js              # 压缩算法
```

---

## 🔧 必须的初始化配置

### 1. 设置编译平台（必须）

**非常重要！** 在使用SDK之前，必须设置编译平台类型。

```javascript
import JCAPI from './utils/jcing-sdk/JCAPI';

// 设置为uniapp编译环境（必须）
JCAPI.setBuildPlatform('uniapp');
```

**可选平台**:
- `"ori"` - 原生小程序环境（默认）
- `"uniapp"` - uniapp编译环境（**我们使用的**）

### 2. 设置运行平台（可选）

如果需要在非微信小程序平台运行：

```javascript
JCAPI.setPlatform('wx');  // 微信小程序（默认）
// JCAPI.setPlatform('dd');  // 钉钉
// JCAPI.setPlatform('fs');  // 抖音
```

### 3. 第三方蓝牙监听（可选）

如果你的程序需要同时使用其他蓝牙功能，需要外置蓝牙监听：

```javascript
// 在连接打印机之前设置
JCAPI.setUseThirdBleListen(true);

// 在页面中监听蓝牙数据
wx.onBLECharacteristicValueChange((res) => {
  JCAPI.bleValueChanged(res);
});
```

---

## 📝 使用示例

### 基础用法

```javascript
import JCAPI from './utils/jcing-sdk/JCAPI';

// 1. 初始化SDK（必须）
JCAPI.setBuildPlatform('uniapp');

// 2. 搜索打印机
JCAPI.scanedPrinters((printers) => {
  console.log('搜索到', printers.length, '台打印机');
  printers.forEach(p => {
    console.log(p.name, p.deviceId);
  });
});

// 3. 连接打印机
JCAPI.openPrinter(
  'B3S xxx',           // 打印机名称
  () => {              // 连接成功回调
    console.log('连接成功');
  },
  () => {              // 连接失败回调
    console.log('连接失败');
  }
);

// 4. 打印标签
JCAPI.startJob(1, 3, 1, () => {
  // gapType: 1=间隙纸, darkness: 3=浓度, count: 打印份数
  JCAPI.print(1, () => {
    console.log('打印完成');
  });
});
```

---

## ⚠️ 常见问题

### Q1: 蓝牙初始化失败
**原因**: 未设置编译平台
**解决**:
```javascript
JCAPI.setBuildPlatform('uniapp');
```

### Q2: 搜索不到打印机
**检查项**:
- 打印机是否开机（绿灯快速闪烁）
- 手机蓝牙是否开启
- 距离是否在2米内

### Q3: 连接失败
**检查项**:
- 打印机是否被其他设备连接
- 是否需要先取消配对
- 手机蓝牙权限是否开启

---

## 🎯 完整配置示例

```javascript
// app.vue 或 main.ts
import JCAPI from './utils/jcing-sdk/JCAPI';

export default {
  onLaunch() {
    // 初始化精臣SDK
    JCAPI.setBuildPlatform('uniapp');
    console.log('精臣SDK已初始化');
  }
}
```

---

## 📱 权限配置

### 微信小程序权限

在 `app.json` 或 `pages.json` 中无需特殊配置，SDK会自动处理蓝牙权限。

但需要确保：
1. 用户已授权小程序使用蓝牙
2. 手机蓝牙已开启
3. 位置权限已开启（扫描蓝牙设备需要）

### 用户授权流程

如果用户拒绝蓝牙权限，需要引导用户开启：

```javascript
wx.getSetting({
  success: (res) => {
    if (!res.authSetting['scope.bluetooth']) {
      wx.showModal({
        title: '需要蓝牙权限',
        content: '请在设置中开启蓝牙权限',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting();
          }
        }
      });
    }
  }
});
```

---

## 🔍 调试技巧

### 开启SDK调试日志

SDK内部有调试日志开关，但需要修改源码。建议在开发时：

```javascript
// 在控制台查看日志
console.log('[JCPrinter] 自定义日志');
```

### 关键日志标识

- `scanedPrinters` - 搜索打印机
- `openPrinter` - 连接打印机
- `startJob` - 开始打印任务
- `print` - 执行打印

---

## 📚 SDK API参考

### 主要API

| API | 说明 |
|-----|------|
| `setBuildPlatform(platform)` | 设置编译平台（必须） |
| `scanedPrinters(callback)` | 搜索打印机 |
| `openPrinter(name, success, fail)` | 连接打印机 |
| `closePrinter()` | 断开打印机 |
| `startJob(gapType, darkness, count, callback)` | 开始打印任务 |
| `print(count, callback)` | 执行打印 |
| `getConnName()` | 获取当前连接的打印机 |

### 打印浓度设置

不同打印机的浓度范围不同：
- **B3S/B1/B203/B21**: 1-5，建议3
- **B32/Z401**: 1-15，建议8

### 纸张类型

```javascript
gapType值：
1 - 间隙纸
2 - 黑标纸
3 - 连续纸
4 - 定孔纸
5 - 透明纸
6 - 标牌
10 - 黑标间隙纸
```

---

## 🛠️ 项目集成检查清单

- [ ] 已复制 `jcing-sdk` 目录到项目中
- [ ] 已在代码中调用 `JCAPI.setBuildPlatform('uniapp')`
- [ ] 已创建打印机封装类（如 `jcing-printer.ts`）
- [ ] 已在页面中实现搜索、连接、打印功能
- [ ] 已测试蓝牙权限是否正常
- [ ] 已测试打印机连接是否正常
- [ ] 已测试打印功能是否正常

---

## 📞 技术支持

- **SDK官方文档**: 位于 `miniapp/src/utils/mini _program_3.0.4_release_20250925/SDK DEMO/`
- **SDK版本**: 3.0.4
- **项目使用路径**: `miniapp/src/utils/jcing-sdk/`

---

## 📌 重要提示

1. **必须设置编译平台**，否则蓝牙功能无法正常工作
2. 确保手机蓝牙已开启且距离打印机在2米内
3. 打印机需要进入配对模式（绿灯快速闪烁）
4. 如果打印机被其他设备连接，需要先断开
5. 建议在App启动时初始化SDK
