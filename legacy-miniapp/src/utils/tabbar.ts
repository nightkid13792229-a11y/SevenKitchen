export function refreshCurrentTabBar(): void {
  try {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1] as any
    const tabBar =
      currentPage?.getTabBar?.() ||
      currentPage?.$scope?.getTabBar?.()

    if (tabBar && typeof tabBar.refresh === 'function') {
      tabBar.refresh()
    }
  } catch (error) {
    console.error('[TabBar] Failed to refresh current tab bar:', error)
  }
}
