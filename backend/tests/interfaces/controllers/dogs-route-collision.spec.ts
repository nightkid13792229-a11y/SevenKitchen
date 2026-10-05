import { PATH_METADATA } from '@nestjs/common/constants';

import { DogsController } from '../../../src/interfaces/controllers/dogs.controller';
import { HealthRecordsController } from '../../../src/interfaces/controllers/health-records.controller';

/**
 * `/dogs/` 前缀下的路由**不能撞车**（2026-10-05 踩的坑）。
 *
 * ── 出了什么事 ──────────────────────────────────────────────────
 *
 * 疫苗目录接口原本写成 `@Get('vaccine-catalog')`，也就是
 * `/api/v1/dogs/vaccine-catalog`（**一段**）。
 *
 * 但 `DogsController` 里有一条 `@Get(':id')`，而且它在 app.module 里
 * **比 HealthRecordsController 先注册**。Express 是按注册顺序匹配的，
 * 于是 `/dogs/vaccine-catalog` 被 `:id` 先吃掉，`id = "vaccine-catalog"`，
 * 直奔"狗狗不存在" —— 我们的路由**永远不会被命中**。
 *
 * 表现：小程序里疫苗名称标签、产品库、归类选项**全都不显示**，
 * 而归类是必填项，于是**一条记录都存不进去**。接口返回的是
 * "狗狗不存在"，看起来像另一个问题，很容易查错方向。
 *
 * ── 这条测试挡什么 ──────────────────────────────────────────────
 *
 * 同前缀下的控制器之间，**一段式路径**会被先注册的 `:param` 吃掉。
 * 所以：`/dogs/` 下除了 `DogsController` 自己，其它控制器不许注册
 * **一段式**路由 —— 两段就安全（`:id` 匹配不了两段）。
 *
 * ⚠️ 真要加一段式的全局接口，别放在 `/dogs/` 这个前缀下。
 */

/** 取控制器上的 @Controller('...') 声明 */
function controllerPrefix(controller: any): string {
  return Reflect.getMetadata(PATH_METADATA, controller) || '';
}

/** 取控制器上每个方法的路由路径（可能有多个） */
function methodPaths(controller: any): string[] {
  const paths: string[] = [];
  const proto = controller.prototype;

  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const handler = proto[name];
    if (typeof handler !== 'function') continue;

    const meta = Reflect.getMetadata(PATH_METADATA, handler);
    if (!meta) continue;

    for (const item of Array.isArray(meta) ? meta : [meta]) {
      paths.push(String(item));
    }
  }

  return paths;
}

describe('/dogs/ 前缀下的路由不能撞车（2026-10-05 的疫苗目录接口踩过）', () => {
  const dogsPrefix = controllerPrefix(DogsController);

  it('两个控制器确实共用 /dogs 前缀（前提没变，这条测试才有意义）', () => {
    expect(dogsPrefix).toBe('api/v1/dogs');
    expect(controllerPrefix(HealthRecordsController)).toBe('api/v1/dogs');
    // DogsController 里那条会吃掉一段式路径的路由必须还在 ——
    // 它没了的话，这个坑也就不存在了，下面的规则可以放宽
    expect(methodPaths(DogsController)).toContain(':id');
  });

  it('HealthRecordsController 不许注册**一段式**路由（会被 :id 吃掉）', () => {
    const offenders = methodPaths(HealthRecordsController).filter(
      (path) => !path.includes('/'),
    );

    expect(offenders).toEqual([]);
  });

  it('疫苗目录接口是两段式的（`vaccines/catalog`）', () => {
    const paths = methodPaths(HealthRecordsController);

    // 曾经写成一段的 'vaccine-catalog'，被 :id 吃掉，整块功能全哑
    expect(paths).toContain('vaccines/catalog');
    expect(paths).not.toContain('vaccine-catalog');
  });
});
