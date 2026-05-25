/**
 * 用户管理相关类型定义
 */

// 用户角色枚举
export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  STAFF = 'STAFF',
  ADMIN = 'ADMIN',
}

// 用户状态枚举
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BANNED = 'BANNED',
}

// 用户角色标签
export const UserRoleLabels: Record<string, string> = {
  [UserRole.CUSTOMER]: '客户',
  [UserRole.STAFF]: '员工',
  [UserRole.ADMIN]: '管理员',
};

// 用户状态标签
export const UserStatusLabels: Record<string, string> = {
  [UserStatus.ACTIVE]: '正常',
  [UserStatus.INACTIVE]: '未激活',
  [UserStatus.BANNED]: '已禁用',
};

// 用户角色标签类型（Element Plus Tag类型）
export const UserRoleTagTypes: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  [UserRole.CUSTOMER]: 'info',
  [UserRole.STAFF]: 'warning',
  [UserRole.ADMIN]: 'danger',
};

// 用户实体
export interface User {
  id: string;
  phone: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string | null;
  createdAt: string;
}

// 创建员工表单
export interface CreateUserForm {
  phone: string;
  nickname: string;
  department: 'KITCHEN' | 'PURCHASING' | 'SHIPPING';
}

// 编辑用户表单
export interface UpdateUserForm {
  nickname?: string;
  status?: UserStatus;
  role?: UserRole;
}

// 列表查询参数
export interface UserListParams {
  role?: UserRole;
  status?: UserStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// 用户分页列表
export interface UserListResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LegacyMigrationUserSummary {
  id: string;
  nickname: string;
  phone?: string | null;
  role: UserRole;
  dogCount: number;
  orderCount: number;
  addressCount: number;
  diySheetCount: number;
  favoriteRecipeCount: number;
  customRecipeOrderCount: number;
}

export interface LegacyMigrationCandidate {
  migrationId: string;
  migrationStatus: string;
  phone: string | null;
  sourceUser: LegacyMigrationUserSummary;
  targetUser: LegacyMigrationUserSummary;
  sourceDataCount: number;
}

export interface LegacyMigrationSyncResult {
  status: string;
  mergedSourceCount: number;
  sourceDataCount: number;
  user: LegacyMigrationUserSummary;
}
