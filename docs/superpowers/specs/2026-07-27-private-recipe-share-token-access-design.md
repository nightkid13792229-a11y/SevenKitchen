# 私密食谱分享令牌访问设计

## 目标

让没有绑定客户或爱犬归属的 `PRIVATE_CUSTOM` 食谱可以由员工生成可转发的分享链接。持有未过期链接的客户可完成食谱详情、DIY 配置、制作单生成、制作单页面及图片导出；无有效链接的非员工仍不可访问。

## 范围与边界

- 不为历史或新增私密食谱强制补写 `customerOwnerId` 或 `customerDogId`。
- 保留员工、管理员和已绑定客户的既有访问能力。
- 分享令牌是 bearer token：完整链接被转发后，接收者同样可以访问，直到令牌过期。
- 本次不把令牌保存到“我的制作单”历史记录。客户需从原分享链接重新进入私密制作单流程。
- 不改变公开食谱访问、订单流程或令牌的现有 30 天有效期。

## 授权规则

对任何非公开食谱，请求按以下优先级授权：

1. `STAFF`、`ADMIN` 用户允许访问。
2. 对 `PRIVATE_CUSTOM`，当 `customerOwnerId` 与当前客户身份匹配时允许访问。
3. 其他请求携带与该食谱匹配且未过期的 `shareToken` 时允许访问。
4. 其余请求返回现有的 `Recipe not found`，避免泄露食谱存在性。

分享令牌只能由员工/管理员通过既有的 `POST /recipes/:id/share-token` 生成。

## 页面与接口数据流

分享路径使用查询参数 `shareToken`：

```text
/pages/recipe-detail/index?recipeId=<id>&shareToken=<token>
  -> /pages/recipe-diy/index?recipeId=<id>&dogId=<dog>&shareToken=<token>
  -> POST /recipes/<id>/diy-sheet { dogId, shareToken }
  -> /pages/diy-sheet/index?...&shareToken=<token>
```

各页面加载食谱详情时，把令牌作为 `GET /recipes/:id` 的请求参数；DIY 制作单页的页面分享链接也保留令牌。制作单图片由页面已加载的数据在本地 Canvas 生成，不新增图片 API 或权限接口。

## 错误处理

- 无令牌、错误令牌、过期令牌：沿用 `Recipe not found`。
- 客户从私密食谱详情进入 DIY，若令牌存在则逐页传递；无令牌的员工访问不受影响。
- 令牌丢失后，页面继续按现有加载失败行为显示；客户需回到原分享链接。

## 验证

- 后端测试覆盖私密食谱的有效令牌、无令牌和过期令牌访问，以及 DIY 生成接口的令牌授权。
- 小程序回归测试覆盖详情页、DIY 配置页及制作单页对 `shareToken` 的读取、请求传递和导航/分享保留。
- 保留公开食谱和已绑定私密食谱已有行为。
