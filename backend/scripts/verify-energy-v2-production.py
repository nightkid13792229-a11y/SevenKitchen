#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生产环境 · 能量算法 v2 端到端验证（跑在真实生产接口上）

用公开的 `POST /api/v1/dogs/calc-preview`（无需登录）把 v2 的规则逐条打一遍。
期望值全部按 FEDIAF 2025 + 算法规格书现算，不是照抄实现。

用法：python3 scripts/verify-energy-v2-production.py
"""

import json
import math
from datetime import datetime, timezone
import sys
import urllib.request

API = "https://api.sevenkitchen.cloud/api/v1/dogs/calc-preview"

LAB = "9f31624f-e885-48b7-a2d8-1d255c2311e5"       # 拉布拉多 LARGE 31.8kg
DANE = "ee0401ef-2abf-413c-8e2d-329c173a54da"      # 大丹犬 GIANT 61.2kg
CHIHUAHUA = "d91145a0-3a6f-4aef-a877-529bf17c0551" # 吉娃娃 SMALL 1.8kg

# ---------------- 按规格书重算期望值 ----------------

RER_C = 70.0
BCS_FACTOR = {
    1: 1 / 0.60, 2: 1 / 0.65, 3: 1 / 0.75, 4: 1.0, 5: 1.0,
    6: 1 / 1.125, 7: 1 / 1.25, 8: 1 / 1.375, 9: 1 / 1.45,
}
ADULT = {  # kcal/kg^0.75
    "YOUNG":  {"daily": 125, "active": 130, "working": 150},
    "MIDDLE": {"daily": 95,  "active": 110, "working": 150},
    "SENIOR": {"daily": 80,  "active": 95,  "working": 150},
}
GROWTH = [  # (maxAdultKg, a, b)
    (7, 36.92, -43.57), (15, 36.86, -48.22), (27.5, 39.88, -60.70),
    (47.5, 36.96, -56.18), (float("inf"), 36.61, -62.39),
]
TREAT = {"NONE": 0.0, "LOW": 0.03, "MODERATE": 0.06, "HIGH": 0.10}
TREAT_CAP = 0.10


def rer(w):
    return RER_C * w ** 0.75


def ideal_weight(w, bcs):
    return round(w * BCS_FACTOR[bcs], 2)


def adult_phase(age_months):
    if age_months < 24:
        return "YOUNG"
    if age_months < 84:
        return "MIDDLE"
    return "SENIOR"


def column(activity):
    if activity == "WORKING":
        return "working"
    if activity == "HIGH":
        return "active"
    return "daily"


def growth_percent(adult_kg, weeks):
    for max_kg, a, b in GROWTH:
        if adult_kg <= max_kg:
            return a * math.log(weeks) + b
    return 0


def expect_adult(weight, bcs, age_months, activity, treat_level="NONE"):
    """期望：rer / gross / treat / net"""
    iw = ideal_weight(weight, bcs)
    r = rer(iw)
    factor = ADULT[adult_phase(age_months)][column(activity)] / RER_C
    gross = r * factor
    t = min(gross * TREAT[treat_level], gross * TREAT_CAP)
    return r, gross, t, gross - t, iw


def expect_puppy(weight, adult_kg, birthday_iso, treat_level="NONE"):
    """周龄必须按**真实日期差**算 —— 实现用的是 weeksBetween(birthday, now)，
    用「月数 × 30.4375」近似会差 0.3%，在生长曲线上放大成十几 kcal。"""
    r = rer(weight)  # 幼犬用当前体重
    bd = datetime.fromisoformat(birthday_iso.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    weeks = (now - bd).total_seconds() / (7 * 86400)
    weeks = max(8.0, min(weeks, 52.0))
    pct = growth_percent(adult_kg, weeks)
    ratio = max(0.0, min(pct / 100.0, 1.0))
    kcal_per_kg075 = 254.1 - 135.0 * ratio
    gross = kcal_per_kg075 * weight ** 0.75
    t = min(gross * TREAT[treat_level], gross * TREAT_CAP)
    return r, gross, t, gross - t


# ---------------- 调用生产 ----------------

def call(breed_id, birthday, weight, bcs, activity, life_stage="NONE",
         treat_level="LOW", size_class=None):
    body = {
        "breedId": breed_id,
        "birthday": birthday,
        "gender": "MALE",
        "isNeutered": True,
        "currentWeightKg": weight,
        "bcsScore": bcs,
        "activityLevel": activity,
        "lifeStageOverride": life_stage,
        "treatInputMode": "ESTIMATE_LEVEL",
        "treatLevel": treat_level,
    }
    if size_class:
        body["sizeClassOverride"] = size_class
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


PASS, FAIL = [], []


def check(name, actual, expected, unit="kcal"):
    """
    容差用**相对值**而不是绝对值。

    实现会把 `rer` 四舍五入到 1 位小数（`round(rer, 1)`）再参与后续乘法，
    所以末位差 0.1 是正常的精度传递，不是算法错。
    """
    tol = max(0.15, abs(expected) * 0.002)
    ok = actual is not None and abs(actual - expected) <= tol
    (PASS if ok else FAIL).append(name)
    mark = "✅" if ok else "❌"
    detail = f"{actual:.1f}" if isinstance(actual, (int, float)) else str(actual)
    print(f"  {mark} {name:<44} 实际 {detail:>9} {unit}   期望 {expected:>9.1f}")


def run_case(title, kwargs, exp, want=None):
    print(f"\n{title}")
    try:
        res = call(**kwargs)
    except Exception as e:
        FAIL.append(title)
        print(f"  ❌ 请求失败：{e}")
        return
    if res.get("code") != 0:
        FAIL.append(title)
        print(f"  ❌ 接口返回 code={res.get('code')} {res.get('message')}")
        return
    r = res["data"]
    want = want or {}
    if "rer" in want:
        check("rer", r.get("rer"), exp[0])
    if "gross" in want:
        check("总需求 der（毛值）", r.get("totalDer"), exp[1])
    if "treat" in want:
        check("零食扣减", r.get("treatDeduction"), exp[2])
    if "net" in want:
        check("主食热量 finalFoodKcal（净值）", r.get("finalFoodKcal"), exp[3])
    # 不变量：der 必须是毛值
    if r.get("totalDer") is not None and r.get("treatDeduction") is not None:
        inv = abs(r["totalDer"] - (r["finalFoodKcal"] + r["treatDeduction"])) < 0.05
        (PASS if inv else FAIL).append(f"{title} · der=净值+零食 不变量")
        print(f"  {'✅' if inv else '❌'} {'不变量 der = finalFoodKcal + 零食':<40} "
              f"{r['totalDer']:.1f} vs {r['finalFoodKcal'] + r['treatDeduction']:.1f}")


print("=" * 78)
print("生产环境 · 能量算法 v2 验证")
print(f"接口：{API}")
print("=" * 78)

# 1. 成犬 3×3 表（年龄档 × 活动档）
run_case("【1】成犬 中年 4岁 · NORMAL（日常档 95）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL"),
         expect_adult(20, 5, 68, "NORMAL", "LOW"), {"rer", "gross", "treat", "net"})

run_case("【2】成犬 青年 18个月 · NORMAL（青年档 125）",
         dict(breed_id=LAB, birthday="2025-03-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL"),
         expect_adult(20, 5, 18, "NORMAL"), {"rer", "gross"})

run_case("【3】成犬 老年 8岁 · NORMAL（老年档 80）",
         dict(breed_id=LAB, birthday="2018-01-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL"),
         expect_adult(20, 5, 92, "NORMAL"), {"rer", "gross"})

run_case("【4】成犬 中年 · HIGH（活跃档 110）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="HIGH"),
         expect_adult(20, 5, 68, "HIGH"), {"rer", "gross"})

run_case("【5】成犬 中年 · WORKING（工作犬 150）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="WORKING"),
         expect_adult(20, 5, 68, "WORKING"), {"rer", "gross"})

run_case("【6】RESTING 应与 NORMAL 同档（都算日常）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="RESTING"),
         expect_adult(20, 5, 68, "RESTING"), {"rer", "gross"})

# 2. 体况分 → 理想体重（FEDIAF 表 VII-2）
for bcs in [3, 5, 6, 7, 9]:
    run_case(f"【7】BCS {bcs} → 理想体重换算（rer 用理想体重）",
             dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
                  weight=20, bcs=bcs, activity="NORMAL"),
             expect_adult(20, bcs, 68, "NORMAL"), {"rer", "gross"})

# 3. 幼犬生长曲线
run_case("【8】幼犬 3个月 5kg（拉布拉多，预期成年 31.8kg）",
         dict(breed_id=LAB, birthday="2026-06-29T00:00:00Z",
              weight=5, bcs=5, activity="NORMAL"),
         expect_puppy(5, 31.8, "2026-06-29T00:00:00Z"), {"rer", "gross"})

run_case("【9】幼犬 3个月 1.2kg（吉娃娃，预期成年 1.8kg → 另一条曲线）",
         dict(breed_id=CHIHUAHUA, birthday="2026-06-29T00:00:00Z",
              weight=1.2, bcs=5, activity="NORMAL"),
         expect_puppy(1.2, 1.8, "2026-06-29T00:00:00Z"), {"rer", "gross"})

# 4. 零食档位与上限
run_case("【10】零食 NONE（应为 0）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL", treat_level="NONE"),
         expect_adult(20, 5, 68, "NORMAL", "NONE"), {"treat", "net"})

run_case("【11】零食 MODERATE（6%）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL", treat_level="MODERATE"),
         expect_adult(20, 5, 68, "NORMAL", "MODERATE"), {"treat", "net"})

run_case("【12】零食 HIGH（10%，正好在封顶）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=5, activity="NORMAL", treat_level="HIGH"),
         expect_adult(20, 5, 68, "NORMAL", "HIGH"), {"treat", "net"})

# 5. 妊娠 / 哺乳
print("\n【13】妊娠（未填配种日 → 应按孕早期保守处理）")
try:
    res = call(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
               weight=20, bcs=5, activity="NORMAL", life_stage="PREGNANCY")
    r = res["data"]
    exp_kcal = 132 * 20 ** 0.75          # 132 × 体重^0.75
    check("孕早期总能量", r.get("totalDer"), exp_kcal)
    det = r.get("calcDetails") or {}
    print(f"     lifeStage = {det.get('lifeStage')}")
except Exception as e:
    FAIL.append("妊娠")
    print(f"  ❌ {e}")

print("\n【14】哺乳（未填分娩日 → 应按成犬保守处理，而不是按哺乳给高热量）")
try:
    res = call(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
               weight=20, bcs=5, activity="NORMAL", life_stage="LACTATION")
    r = res["data"]
    exp_r, exp_gross, _, _, _ = expect_adult(20, 5, 68, "NORMAL")
    check("总能量（应≈成犬档）", r.get("totalDer"), exp_gross)
    det = r.get("calcDetails") or {}
    print(f"     lifeStage = {det.get('lifeStage')}（应为成犬档）")
except Exception as e:
    FAIL.append("哺乳")
    print(f"  ❌ {e}")

# 6. 极端值不炸
run_case("【15】最小体重 1kg",
         dict(breed_id=CHIHUAHUA, birthday="2024-01-01T00:00:00Z",
              weight=1, bcs=5, activity="NORMAL"),
         expect_adult(1, 5, 32, "NORMAL"), {"gross"})

run_case("【16】最大体重 90kg（大丹）",
         dict(breed_id=DANE, birthday="2021-01-01T00:00:00Z",
              weight=90, bcs=5, activity="NORMAL"),
         expect_adult(90, 5, 68, "NORMAL"), {"gross"})

run_case("【17】BCS 1（严重偏瘦，换算系数 1/0.6）",
         dict(breed_id=LAB, birthday="2021-01-01T00:00:00Z",
              weight=20, bcs=1, activity="NORMAL"),
         expect_adult(20, 1, 68, "NORMAL"), {"rer"})

# ---------------- 汇总 ----------------
print("\n" + "=" * 78)
print(f"通过 {len(PASS)} 项，失败 {len(FAIL)} 项")
if FAIL:
    print("\n失败明细：")
    for f in FAIL:
        print(f"  ❌ {f}")
    sys.exit(1)
print("全部通过 ✅")
