export function scrollPageToTop(duration = 0) {
  if (typeof uni === 'undefined' || typeof uni.pageScrollTo !== 'function') {
    return
  }

  uni.pageScrollTo({
    scrollTop: 0,
    duration,
  })
}
