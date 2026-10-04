export function scrollPageToTop(duration = 0) {
  if (typeof uni === 'undefined' || typeof uni.pageScrollTo !== 'function') {
    return
  }

  uni.pageScrollTo({
    scrollTop: 0,
    duration,
  })
}

/**
 * 滚到页面上某个区块（2026-10-04）。
 *
 * 过敏标签的底部固定栏用它把家长送到目标那张卡上 ——
 * 比"弹一句『在上面点选』让他自己找"强得多（老板："看不懂该如何添加过敏原"）。
 *
 * 小程序里 `pageScrollTo` 支持 `selector`；拿不到元素时静默不动，
 * 不要因为一个滚动失败就挡住主流程。
 */
export function scrollPageToSelector(selector: string, duration = 260) {
  if (typeof uni === 'undefined' || typeof uni.pageScrollTo !== 'function') {
    return
  }

  uni.pageScrollTo({
    selector,
    duration,
  })
}
