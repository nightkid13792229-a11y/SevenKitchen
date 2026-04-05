/**
 * 用户管理相关类型定义
 */

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN'
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BANNED: 'BANNED'
} as const

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const UserRoleLabels: Record<UserRole, string> = {
  [UserRole.CUSTOMER]: '客户',
  [UserRole.STAFF]: '员工',
  [UserRole.ADMIN]: '管理员'
}

export const UserStatusLabels: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: '正常',
  [UserStatus.INACTIVE]: '未激活',
  [UserStatus.BANNED]: '已禁用'
}

export const UserRoleTagTypes: Record<
  UserRole,
  'success' | 'warning' | 'info' | 'danger'
> = {
  [UserRole.CUSTOMER]: 'info',
  [UserRole.STAFF]: 'warning',
  [UserRole.ADMIN]: 'danger'
}

export interface User {
  id: string
  phone: string
  nickname: string
  role: UserRole
  status: UserStatus
  lastLoginAt?: string | null
  createdAt: string
}

export interface CreateUserForm {
  phone: string
  nickname: string
  department: 'KITCHEN' | 'PURCHASING' | 'SHIPPING'
}

export interface UpdateUserForm {
  nickname?: string
  status?: UserStatus
  role?: UserRole
}

export interface UserListParams {
  role?: UserRole
  status?: UserStatus
  keyword?: string
}
