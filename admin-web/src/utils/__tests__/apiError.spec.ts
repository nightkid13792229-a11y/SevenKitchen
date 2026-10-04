import { describe, expect, it } from 'vitest'
import {
  getApiErrorMessage,
  isUserCancel,
  shouldToastApiError,
  toastApiError,
  wasApiErrorToasted,
} from '../apiError'

/**
 * 报错文案的回归（2026-10-04 第 8 条）。
 *
 * 后端会回具体原因（"该订单还没确认收款，不能交付"
 * "这道食谱不属于该订单的顾客 / 狗狗"），页面必须原样显示，
 * 不能让员工对着一句"操作失败"猜。
 */
describe('从接口错误里取后端原因', () => {
  it('取 axios 错误体里的 message（NestJS 的 400 就长这样）', () => {
    const error = {
      response: { status: 400, data: { message: '该订单还没确认收款，不能交付' } },
      message: 'Request failed with status code 400',
    }

    expect(getApiErrorMessage(error, '交付失败')).toBe('该订单还没确认收款，不能交付')
  })

  it('校验错误是数组时取第一条', () => {
    const error = {
      response: { data: { message: ['名称不能为空', '能量密度必须大于 0'] } },
    }

    expect(getApiErrorMessage(error, '提交失败')).toBe('名称不能为空')
  })

  it('业务码错误（拦截器 reject 的 Error）也能取到原因', () => {
    expect(getApiErrorMessage(new Error('该订单已取消，不能交付'), '交付失败')).toBe(
      '该订单已取消，不能交付',
    )
  })

  it('只有 HTTP 通用话术时退回业务兜底文案', () => {
    expect(
      getApiErrorMessage(
        { response: { status: 500, data: { message: 'Internal Server Error' } } },
        '加载订单详情失败',
      ),
    ).toBe('加载订单详情失败')
    expect(
      getApiErrorMessage({ message: 'Request failed with status code 404' }, '删除失败'),
    ).toBe('删除失败')
    expect(getApiErrorMessage({ message: 'Network Error' }, '删除失败')).toBe('删除失败')
  })

  it('什么都没有时用兜底文案，不会显示 undefined', () => {
    expect(getApiErrorMessage(null, '操作失败')).toBe('操作失败')
    expect(getApiErrorMessage(undefined, '操作失败')).toBe('操作失败')
    expect(getApiErrorMessage({}, '操作失败')).toBe('操作失败')
  })
})

describe('区分"用户点了取消"与"真的失败"', () => {
  it('ElMessageBox 取消时 reject 的是 cancel / close', () => {
    expect(isUserCancel('cancel')).toBe(true)
    expect(isUserCancel('close')).toBe(true)
  })

  it('接口错误不算取消（否则失败会被静默吞掉）', () => {
    expect(isUserCancel(new Error('boom'))).toBe(false)
    expect(isUserCancel(undefined)).toBe(false)
  })
})

describe('同一句话不弹两遍（拦截器弹过就不再弹）', () => {
  const toasted = (error: any) => {
    error.__apiErrorToasted = true
    return error
  }

  it('拦截器已经用后端原话弹过 → 页面不再重复弹', () => {
    const error = toasted({
      response: { data: { message: '该订单还没确认收款，不能交付' } },
    })
    expect(wasApiErrorToasted(error)).toBe(true)
    expect(shouldToastApiError(error, '交付失败')).toBe(false)
  })

  it('拦截器弹过但后端没给原因（断网 / 500 通用话术）→ 页面补一条带场景的', () => {
    const error = toasted({ message: 'Network Error' })
    expect(shouldToastApiError(error, '加载订单详情失败')).toBe(true)
  })

  it('不是接口错误（本地抛的）→ 页面必须自己弹，否则用户什么都看不到', () => {
    expect(shouldToastApiError(new Error('上传未返回图片地址'), '封面上传失败')).toBe(true)
  })

  it('用户点取消 → 什么都不弹', () => {
    expect(shouldToastApiError('cancel', '交付失败')).toBe(false)
  })

  it('toastApiError 用后端原因调用提示函数', () => {
    const shown: string[] = []
    toastApiError(new Error('这道食谱不属于该订单的顾客 / 狗狗，不能交付到这张定制单'), '交付失败', (m) => shown.push(m))
    expect(shown).toEqual(['这道食谱不属于该订单的顾客 / 狗狗，不能交付到这张定制单'])
  })

  it('toastApiError 对拦截器已提示过的后端原因保持安静', () => {
    const shown: string[] = []
    const error: any = new Error('该订单已取消，不能交付')
    error.__apiErrorToasted = true
    toastApiError(error, '交付失败', (m) => shown.push(m))
    expect(shown).toEqual([])
  })
})
