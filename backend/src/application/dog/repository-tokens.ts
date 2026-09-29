/**
 * 狗狗仓储的注入令牌（2026-09-29 抽出）
 *
 * 为什么单独放一个文件：`DogService` 需要注入 `WeightGoalPlanService`
 * （阶段 D1/D2，让 calcPreview 反映体重管理计划），而 `WeightGoalPlanService`
 * 又要用这两个令牌。
 *
 * 令牌原先定义在 `dog.service.ts` 里，于是就形成了
 *   dog.service → weight-goal-plan.service → dog.service
 * 的**循环 import**。ES 模块求值时后者的 `DOG_REPOSITORY` 还是 undefined，
 * Nest 报 `Nest can't resolve dependencies of the WeightGoalPlanService`。
 *
 * ⚠️ 这个故障**单元测试抓不到** —— 测试里都是显式传 provider，
 *    只有真正启动应用才会暴露。所以令牌必须放在不依赖任何服务的文件里。
 *
 * `dog.service.ts` 仍然 re-export 这两个常量，既有 import 路径不受影响。
 */

export const DOG_REPOSITORY = Symbol('DogRepository');
export const DOG_BREED_REPOSITORY = Symbol('DogBreedRepository');
