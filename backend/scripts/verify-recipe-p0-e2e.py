#!/usr/bin/env python3
"""
食谱领域 P0 收敛 · 端到端功能验证

真实调用本地后端接口（http://127.0.0.1:3011），逐条验证 6 个工作包的行为。
不是单元测试：走 HTTP、走数据库、看真实返回与落库结果。

用法：python3 /tmp/e2e_recipe_verify.py
"""
import json
import subprocess
import urllib.error
import urllib.request

API = "http://127.0.0.1:3011/api/v1"
PSQL = ["/opt/homebrew/bin/psql", "postgresql://postgres:postgres@localhost:5432/sevenkitchen", "-A", "-t", "-c"]

ADMIN_ID = "7e5960f1-297e-4b94-91be-5607eafd4cdf"
CUSTOMER_NO_HISTORY = "test-user-001"
DOG_ID = "3ec6faf6-f83e-4996-bb1d-8c5f86b41d4b"
SERIES_RENAME = "cee07b43-8f9d-4c6d-b763-668407bd31bd"      # 燕麦山药牛肉饭：1 公开 + 1 草稿
SERIES_TWO_PUBLIC = "d13a856b-9d05-4379-80fc-79b3e5855594"   # 萝卜绿豆鸭胸猪里脊：2 公开

passed, failed = 0, 0
created_recipe_ids, created_series_ids = [], []


def sql(query):
    out = subprocess.run(PSQL + [query], capture_output=True, text=True)
    return out.stdout.strip()


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}")
        if detail:
            print(f"     {detail}")


def msg_of(payload):
    return str(payload.get("message") or payload.get("data") or payload)


def login(user_id):
    _, r = call("POST", "/auth/login", body={"customerId": user_id})
    return (r.get("data") or {}).get("token")


def main():
    admin = login(ADMIN_ID)
    if not admin:
        print("无法取得管理员令牌，终止")
        return
    print("已取得管理员令牌\n")

    # ─────────────────────────────────────────────
    print("【W1】名称一致化")
    orig_name = sql(f"SELECT name FROM recipe_series WHERE id='{SERIES_RENAME}'")
    new_name = "【E2E】燕麦山药牛肉饭"
    code, _ = call("PATCH", f"/recipe-designer/series/{SERIES_RENAME}", admin, {"name": new_name})
    rows = sql(f"SELECT count(*) FROM recipe WHERE series_id='{SERIES_RENAME}' AND name='{new_name}'")
    total = sql(f"SELECT count(*) FROM recipe WHERE series_id='{SERIES_RENAME}'")
    check("改名后正式食谱名同步（W1 正向修复）", rows == total and int(total) > 0,
          f"同步 {rows}/{total} 行，HTTP {code}")

    # 反向：改食谱名不应改系列名
    pub_row = sql(f"SELECT id FROM recipe WHERE series_id='{SERIES_RENAME}' AND status='PUBLIC' LIMIT 1")
    call("PUT", f"/admin/recipes/{pub_row}", admin, {"name": "试图篡改系列名"})
    series_now = sql(f"SELECT name FROM recipe_series WHERE id='{SERIES_RENAME}'")
    recipe_now = sql(f"SELECT name FROM recipe WHERE id='{pub_row}'")
    check("改食谱名不会反写系列名（W1 反向修复）", series_now == new_name, f"系列名变成了「{series_now}」")
    check("系列食谱的版本名也不会被改", recipe_now == new_name, f"版本名变成了「{recipe_now}」")

    call("PATCH", f"/recipe-designer/series/{SERIES_RENAME}", admin, {"name": orig_name})
    print(f"  （已还原系列名为「{orig_name}」）\n")

    # ─────────────────────────────────────────────
    print("【W4-A】系列状态不再被历史版本锁死")
    pubs = sql(f"SELECT id FROM recipe WHERE series_id='{SERIES_TWO_PUBLIC}' AND status='PUBLIC'").split("\n")
    if len(pubs) >= 2:
        call("POST", f"/admin/recipes/{pubs[0]}/unpublish", admin)
        status_after = sql(f"SELECT business_status FROM recipe_series WHERE id='{SERIES_TWO_PUBLIC}'")
        check("下架其中一个公开版本后，系列仍是公开（还有另一个公开版本）",
              status_after == "PUBLIC", f"系列状态变成了 {status_after}")
        call("POST", f"/admin/recipes/{pubs[0]}/publish", admin)
    else:
        check("下架其中一个公开版本后，系列仍是公开", False, "本地缺少 2 个公开版本的样本")

    # 关键：私密版本不再把系列拖走私密
    pub_in_rename = sql(f"SELECT id FROM recipe WHERE series_id='{SERIES_RENAME}' AND status='PUBLIC' LIMIT 1")
    sql(f"UPDATE recipe SET status='PRIVATE_CUSTOM' WHERE id='{pub_in_rename}'")
    call("POST", f"/admin/recipes/{pub_in_rename}/publish", admin)
    dragged = sql(f"SELECT business_status FROM recipe_series WHERE id='{SERIES_RENAME}'")
    # 还原
    sql(f"UPDATE recipe SET status='PUBLIC' WHERE id='{pub_in_rename}'")
    sql(f"UPDATE recipe_series SET business_status='PUBLIC' WHERE id='{SERIES_RENAME}'")
    check("公开版本发布后，系列是 PUBLIC（旧实现会被拖成 PRIVATE_CUSTOM）",
          dragged == "PUBLIC", f"系列状态变成了 {dragged}")

    # ─────────────────────────────────────────────
    print("\n【W4-C】阻止「公开 / 私密定制」混用")
    draft_in_mixed = sql(f"SELECT id FROM recipe WHERE series_id='{SERIES_RENAME}' AND status='DRAFT' LIMIT 1")
    if draft_in_mixed:
        code, body = call("PUT", f"/admin/recipes/{draft_in_mixed}", admin,
                          {"status": "PRIVATE_CUSTOM", "customerOwnerId": ADMIN_ID, "customerDogId": "x"})
        check("在含公开版本的系列里设私密定制 → 被拦",
              "不能同时有" in msg_of(body), f"HTTP {code} / {msg_of(body)[:80]}")
    else:
        check("在含公开版本的系列里设私密定制 → 被拦", False, "本地缺少 草稿+公开 混合样本")

    # ─────────────────────────────────────────────
    print("\n【W4-B】设为私密定制必须选客户 + 狗")
    code, body = call("POST", "/admin/recipes", admin, {
        "name": "【E2E】私密定制校验用", "status": "DRAFT",
        "nutritionStandard": "FEDIAF_2025", "energyDensityKcalPerKg": 1300, "items": [],
    })
    new_recipe_id = (body.get("data") or {}).get("id")
    if new_recipe_id:
        created_recipe_ids.append(new_recipe_id)

        code, body = call("PUT", f"/admin/recipes/{new_recipe_id}", admin, {"status": "PRIVATE_CUSTOM"})
        check("不选客户和狗 → 拒绝保存",
              "必须选择客户和狗狗" in msg_of(body), f"HTTP {code} / {msg_of(body)[:80]}")

        code, body = call("PUT", f"/admin/recipes/{new_recipe_id}", admin, {
            "status": "PRIVATE_CUSTOM",
            "customerOwnerId": ADMIN_ID,
            "customerDogId": "e2e-dog",
        })
        owner = sql(f"SELECT customer_owner_id FROM recipe WHERE id='{new_recipe_id}'")
        dog = sql(f"SELECT customer_dog_id FROM recipe WHERE id='{new_recipe_id}'")
        is_custom = sql(f"SELECT is_custom_recipe FROM recipe WHERE id='{new_recipe_id}'")
        check("选了客户和狗 → 保存成功并落库",
              owner == ADMIN_ID and dog == "e2e-dog" and is_custom == "t",
              f"HTTP {code} / owner={owner} dog={dog} isCustom={is_custom}")
    else:
        check("不选客户和狗 → 拒绝保存", False, f"创建测试食谱失败：{msg_of(body)[:80]}")

    # ─────────────────────────────────────────────
    print("\n【W2】设计器不再对所有用户开放")
    cust_token = login(CUSTOMER_NO_HISTORY)
    if cust_token:
        sql(f"DELETE FROM recipe_series WHERE created_by='{CUSTOMER_NO_HISTORY}'")
        code, body = call("POST", "/recipe-designer/series", cust_token,
                          {"name": "【E2E】新客户尝试建系列", "dogId": None})
        check("没有设计历史的客户 → 拒绝新建",
              "不再对所有用户开放" in msg_of(body), f"HTTP {code} / {msg_of(body)[:80]}")

        # 造一条历史，模拟老客户
        fid = "e2e-fixture-series"
        sql(f"DELETE FROM recipe_series WHERE id='{fid}'")
        sql(f"INSERT INTO recipe_series (id, name, status, business_status, created_by, created_at, updated_at) "
            f"VALUES ('{fid}', '【E2E】老客户历史', 'ACTIVE', 'DRAFT', '{CUSTOMER_NO_HISTORY}', now(), now())")
        created_series_ids.append(fid)

        code, body = call("GET", "/recipe-designer/customer-access", cust_token)
        has_history = (body.get("data") or {}).get("hasDesignHistory")
        check("老客户的 customer-access 返回 hasDesignHistory=true", has_history is True,
              f"HTTP {code} / {body.get('data')}")
    else:
        check("没有设计历史的客户 → 拒绝新建", False, "无法取得客户令牌")

    # ─────────────────────────────────────────────
    print("\n【W3】客户自助食谱不能买成品")
    # 先用业务接口建一条「客户自建」的私密食谱：系列 created_by = 客户
    cid = "e2e-customer-series"
    sql(f"DELETE FROM recipe_series WHERE id='{cid}'")
    sql(f"INSERT INTO recipe_series (id, name, status, business_status, created_by, created_at, updated_at) "
        f"VALUES ('{cid}', '【E2E】客户自建系列', 'ACTIVE', 'PRIVATE_CUSTOM', '{CUSTOMER_NO_HISTORY}', now(), now())")
    created_series_ids.append(cid)

    code, body = call("POST", "/admin/recipes", admin, {
        "name": "【E2E】客户自建食谱", "status": "DRAFT",
        "nutritionStandard": "FEDIAF_2025", "energyDensityKcalPerKg": 1300, "items": [],
    })
    rid_row = (body.get("data") or {}).get("id")
    if rid_row:
        created_recipe_ids.append(rid_row)
        rid_biz = sql(f"SELECT recipe_id FROM recipe WHERE id='{rid_row}'")
        sql(f"UPDATE recipe SET series_id='{cid}', status='PRIVATE_CUSTOM', is_custom_recipe=true, "
            f"customer_owner_id='{CUSTOMER_NO_HISTORY}' WHERE id='{rid_row}'")

        code, body = call("GET", f"/recipes/{rid_biz}", cust_token)
        flag = (body.get("data") or {}).get("canBuyFinishedFood")
        check("客户自建食谱的详情返回 canBuyFinishedFood=false", flag is False,
              f"HTTP {code} / canBuyFinishedFood={flag}")

        code, body = call("POST", "/orders/pricing/preview", cust_token, {
            "dogId": DOG_ID,
            "type": "FRESH_FOOD",
            "items": [{"recipeId": rid_biz, "dailyIntakeG": 100, "quantityG": 700, "packageSpecG": 100}],
        })
        blocked = "自己设计" in msg_of(body)
        check("直接调报价接口也被拒（服务端兜底）", blocked,
              f"HTTP {code} / {msg_of(body)[:90]}")

        # 对照：标准公开食谱不受限
        std_biz = sql("SELECT recipe_id FROM recipe WHERE status='PUBLIC' AND series_id IS NOT NULL LIMIT 1")
        code, body = call("GET", f"/recipes/{std_biz}", cust_token)
        std_flag = (body.get("data") or {}).get("canBuyFinishedFood")
        check("标准公开食谱仍然 canBuyFinishedFood=true", std_flag is True,
              f"HTTP {code} / canBuyFinishedFood={std_flag}")
    else:
        check("客户自建食谱的详情返回 canBuyFinishedFood=false", False, "创建测试食谱失败")

    # ─────────────────────────────────────────────
    print("\n清理测试数据…")
    for rid in created_recipe_ids:
        sql(f"DELETE FROM recipe_item WHERE recipe_id=(SELECT recipe_id FROM recipe WHERE id='{rid}')")
        sql(f"DELETE FROM recipe WHERE id='{rid}'")
    for sid in created_series_ids:
        sql(f"DELETE FROM recipe_series WHERE id='{sid}'")
    print("清理完成")

    print("\n" + "=" * 60)
    print(f"结果：通过 {passed} 项，失败 {failed} 项")
    print("=" * 60)


if __name__ == "__main__":
    main()
