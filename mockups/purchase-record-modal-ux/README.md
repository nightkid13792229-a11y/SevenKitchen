# 采购记录弹窗 · 优化原型

员工端「日采清单详情 → 采购记录」弹窗的交互原型。  
方案文字见 [`docs/design/procurement-record-modal-optimization.md`](../../docs/design/procurement-record-modal-optimization.md)。

## 看哪几张图

| 图 | 内容 |
|---|---|
| [`shots/overview.png`](shots/overview.png) | 四屏总览 |
| [`shots/screen-1.png`](shots/screen-1.png) | 记录采购 · 一屏填完 |
| [`shots/screen-2.png`](shots/screen-2.png) | 更换采购商品 · 按渠道 |
| [`shots/screen-3.png`](shots/screen-3.png) | 保存后 · 自动展开 + 高亮 |
| [`shots/screen-4.png`](shots/screen-4.png) | 没有匹配商品 · 新增入口 |

## 打开原型

直接双击 `index.html`，或在本目录起一个静态服务：

```bash
python3 -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899/index.html
```

## 单屏出图

页面支持 `?shot=1`、`?shot=2`、`?shot=3`，只显示对应一屏，便于截 390×844 的单屏图：

```text
http://127.0.0.1:8899/index.html?shot=1
```

截图时把浏览器视口设为 390×844，再按 3 倍缩放导出，得到 1170×2532 的清晰图。

## 说明

- 这是交互原型，不是线上截图；颜色、圆角、字号按现有员工端近似，落地时以真机为准。
- 图 1 是“填写中”的状态，用来展示结果行和多买提示；真实打开时数量、金额为空。
- 数据是演示数据：猪里脊、931g、4 盒 × 280g、¥29.48、多 189g。
- 覆盖「添加 / 更换商品 / 保存后 / 没有商品」四个状态；编辑、异常在方案文档里写，不在原型里画。
