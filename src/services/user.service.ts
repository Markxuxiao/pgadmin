import type { Knex } from 'knex';

export interface UserWithRoles {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
  full_name: string | null;
  status: string;
  last_login_at: Date | null;
  created_at: Date;
  roles: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

/**
 * 用户服务 - 处理复杂查询
 *
 * 场景示例：
 * - 用户列表（带角色、部门信息）
 * - 用户行为统计
 * - 复杂条件查询
 */
export class UserService {
  constructor(private knex: Knex) {}

  /**
   * 获取用户详情（含角色和部门）
   */
  async getUserWithDetails(userId: string, tenantId: string): Promise<UserWithRoles | null> {
    const user = await this.knex('users')
      .where('id', userId)
      .where('tenant_id', tenantId)
      .first();

    if (!user) return null;

    // 查询角色
    const roles = await this.knex('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', userId)
      .where('roles.tenant_id', tenantId)
      .select('roles.id', 'roles.name', 'roles.code');

    return {
      ...user,
      roles
    };
  }

  /**
   * 获取用户在某个时间范围内的登录统计
   */
  async getUserLoginStats(userId: string, tenantId: string, days: number = 30) {
    const result = await this.knex.raw<{ login_count: bigint; last_login: Date }>(`
      SELECT
        COUNT(*) as login_count,
        MAX(last_login_at) as last_login
      FROM users
      WHERE tenant_id = ?
        AND id = ?
        AND last_login_at >= NOW() - INTERVAL '1 day' * ?
    `, [tenantId, userId, days]);

    return {
      loginCount: Number(result.rows[0]?.login_count || 0),
      lastLogin: result.rows[0]?.last_login || null
    };
  }

  /**
   * 获取部门用户列表（含用户统计）
   */
  async getDepartmentUsers(departmentId: string, tenantId: string) {
    // 使用 CTE 和窗口函数
    const result = await this.knex.raw(`
      WITH dept_users AS (
        SELECT
          u.id,
          u.username,
          u.email,
          u.full_name,
          u.status,
          u.created_at,
          COUNT(*) OVER (PARTITION BY u.department_id) as total_in_dept,
          RANK() OVER (PARTITION BY u.department_id ORDER BY u.created_at DESC) as join_rank
        FROM users u
        WHERE u.tenant_id = ?
          AND u.department_id = ?
          AND u.status = 'active'
      )
      SELECT *
      FROM dept_users
      WHERE join_rank <= 50
      ORDER BY join_rank
    `, [tenantId, departmentId]);

    return result.rows;
  }

  /**
   * 批量获取用户（带缓存 key）
   */
  async getUsersByIds(userIds: string[], tenantId: string) {
    if (userIds.length === 0) return [];

    return this.knex('users')
      .where('tenant_id', tenantId)
      .whereIn('id', userIds)
      .select('id', 'username', 'email', 'full_name', 'status');
  }

  /**
   * 检查用户是否拥有指定权限
   */
  async userHasPermission(userId: string, tenantId: string, permissionCode: string): Promise<boolean> {
    const result = await this.knex.raw(`
      SELECT EXISTS(
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = ?
          AND r.tenant_id = ?
          AND r.status = 'active'
          AND p.code = ?
      ) as has_permission
    `, [userId, tenantId, permissionCode]);

    return result.rows[0]?.has_permission || false;
  }

  /**
   * 获取用户的所有权限码
   */
  async getUserPermissionCodes(userId: string, tenantId: string): Promise<string[]> {
    const result = await this.knex.raw(`
      SELECT DISTINCT p.code
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
        AND r.tenant_id = ?
        AND r.status = 'active'
    `, [userId, tenantId]);

    return result.rows.map((row: { code: string }) => row.code);
  }
}
