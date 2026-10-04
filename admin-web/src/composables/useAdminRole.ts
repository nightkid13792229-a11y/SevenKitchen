import { computed } from 'vue'
import { useUserStore } from '@/store/user'

/**
 * 当前登录用户是不是管理员（口径 2，老板 2026-10-04）。
 *
 * 权限口径：**客服/员工**可以做日常（看订单、确认收款、开始制作、上传附件）；
 * **仅管理员**可以做交付食谱（含重新交付）、取消订单、恢复抵扣额度、
 * 改「食谱定制设置」、排期批量设置。
 *
 * 为什么前端也要判：菜单对所有登录者可见，不判角色的话客服看得见按钮、
 * 点下去才吃 403 —— 既不知道错在哪，也不知道该找谁。前端按角色隐藏，
 * 后端 AdminGuard 仍然再拦一次（前端只是体验，不是安全边界）。
 */
export function useIsAdmin() {
  const userStore = useUserStore()

  return computed(
    () => String(userStore.userInfo?.role || '').toUpperCase() === 'ADMIN',
  )
}

/** 非管理员看到敏感按钮位置的统一说明文案 */
export const ADMIN_ONLY_TIP = '需要管理员权限，请联系管理员操作'
