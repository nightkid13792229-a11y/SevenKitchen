import { describe, expect, it } from 'vitest'
import { getApiErrorMessage, isUserCancel } from '../apiError'

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
