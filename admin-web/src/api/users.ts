/**
 * 用户管理API
 */
import api from './index';
import type {
  User,
  CreateUserForm,
  UpdateUserForm,
  UserListParams,
  UserListResponse,
  LegacyMigrationCandidate,
  LegacyMigrationSyncResult,
} from '@/types/user';

export const userApi = {
  /**
   * 获取用户列表
   * @param params 查询参数（角色筛选、状态筛选、关键词搜索）
   */
  list: (params?: UserListParams): Promise<UserListResponse> =>
    api.get('/admin/users', { params }),

  /**
   * 创建员工账号
   * @param data 员工表单数据
   */
  create: (data: CreateUserForm): Promise<User> =>
    api.post('/admin/users', data),

  /**
   * 更新用户信息
   * @param id 用户ID
   * @param data 更新数据
   */
  update: (id: string, data: UpdateUserForm): Promise<User> =>
    api.put(`/admin/users/${id}`, data),

  /**
   * 删除用户
   * @param id 用户ID
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/users/${id}`),

  legacyMigrationCandidate: (id: string): Promise<LegacyMigrationCandidate> =>
    api.get(`/admin/users/${id}/legacy-migration-candidate`),

  syncLegacyMigration: (
    id: string,
    migrationId: string
  ): Promise<LegacyMigrationSyncResult> =>
    api.post(`/admin/users/${id}/legacy-migration-sync`, { migrationId }),
};
