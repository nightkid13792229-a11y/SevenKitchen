import { describe, expect, it } from 'vitest'
import orderDetailSource from '@/views/CustomRecipes/OrderDetail.vue?raw'
import aftersaleListSource from '@/views/CustomRecipes/AftersaleList.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'

/**
 * 代客发起调整（2026-10-27）
 *
 * ## 守的是什么
 *
 * 顾客不满意但不会/不方便在小程序提单时，老板必须能自己改稿重交。
 * 这条前端链路有三个不能丢的环节，丢任何一个都会让它变回"没法用"：
 *
 *   ① 订单详情要有入口，且只在**已交付 / 已完成**的订单上出现；
 *   ② 发起后必须接着 `reopenAftersaleDesign`（只建单不改稿，顾客拿到的还是旧食谱）；
 *   ③ 重新交付后必须把新批次写回售后单（`linkedDeliveryId`），
 *      否则「已交付」却指不到最新那版。
 */

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const orderDetail = stripComments(orderDetailSource)
const aftersaleList = stripComments(aftersaleListSource)

describe('代客发起调整 · 订单详情入口', () => {
  it('已交付/已完成的订单才有入口，且只给管理员', () => {
    expect(orderDetail).toContain('canInitiateAdjustment')
    expect(orderDetail).toContain("status === 'DELIVERED' || status === 'COMPLETED'")
    expect(orderDetail).toContain('代客发起调整')
  })

  it('发起后要接着打开设计器改稿，不能只建单', () => {
    expect(orderDetail).toContain('createStaffAftersale')
    expect(orderDetail).toContain('reopenAftersaleDesign')
    expect(orderDetail).toContain('aftersaleId=')
  })

  it('说明必填 —— 顾客会看到这句话', () => {
    expect(orderDetail).toContain("adjustDescription.value.trim()")
    expect(orderDetail).toContain('请写一句这次要调整什么')
  })
})

describe('代客发起调整 · 售后页', () => {
  it('商家发起的单要有标记，不能和顾客诉求混在一起看', () => {
    expect(aftersaleList).toContain("item.source === 'STAFF'")
    expect(aftersaleList).toContain('商家发起')
  })

  it('重新交付后把新批次写回售后单', () => {
    expect(aftersaleList).toContain('resolveAfterRedelivery(item, result?.batchId)')
    expect(aftersaleList).toContain('linkedDeliveryId')
  })
})

describe('代客发起调整 · 接口', () => {
  it('走后台上单接口，不是顾客端那条', () => {
    expect(apiSource).toContain('createStaffAftersale')
    expect(apiSource).toContain('/orders/${orderId}/aftersales')
  })
})
