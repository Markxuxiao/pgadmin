import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { success } from '../../utils/response.js';

/**
 * 权限和菜单查询
 * 这些是自研后端要写的业务接口，不是 CRUD
 */
export async function permissionRoutes(app: FastifyInstance) {
  // =====================================================
  // GET /api/auth/menus - 获取当前用户的菜单树
  // =====================================================
  app.get('/api/auth/menus', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenantId;
    const userId = request.auth?.userId;
    const roles = request.auth?.roles || [];

    // 如果是超级管理员，返回所有菜单
    if (roles.includes('super_admin')) {
      const menus = await app.db('menus')
        .where('tenant_id', tenantId)
        .where('status', 'active')
        .orderBy('sort_order', 'asc');

      const menuTree = buildMenuTree(menus, null);
      return success(menuTree);
    }

    // 普通用户：根据角色获取菜单
    const menus = await app.db('menus')
      .join('role_menus', 'menus.id', 'role_menus.menu_id')
      .join('roles', 'role_menus.role_id', 'roles.id')
      .join('user_roles', 'roles.id', 'user_roles.role_id')
      .where('user_roles.user_id', userId)
      .where('menus.tenant_id', tenantId)
      .where('menus.status', 'active')
      .where('roles.status', 'active')
      .select('menus.*')
      .orderBy('menus.sort_order', 'asc');

    const menuTree = buildMenuTree(menus, null);
    return success(menuTree);
  });

  // =====================================================
  // GET /api/auth/permissions - 获取当前用户的接口权限
  // =====================================================
  app.get('/api/auth/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.auth?.userId;
    const roles = request.auth?.roles || [];

    // 如果是超级管理员，返回所有权限
    if (roles.includes('super_admin')) {
      const permissions = await app.db('permissions').select('*');
      return success(permissions);
    }

    // 普通用户：根据角色获取权限
    const permissions = await app.db('permissions')
      .join('role_permissions', 'permissions.id', 'role_permissions.permission_id')
      .join('roles', 'role_permissions.role_id', 'roles.id')
      .join('user_roles', 'roles.id', 'user_roles.role_id')
      .where('user_roles.user_id', userId)
      .where('roles.status', 'active')
      .select('permissions.*');

    return success(permissions);
  });

  // =====================================================
  // GET /api/auth/permissions/grouped - 获取权限（按 resource 分组）
  // =====================================================
  app.get('/api/auth/permissions/grouped', async (request: FastifyRequest, reply: FastifyReply) => {
    const permissions = await app.db('permissions')
      .orderBy('resource', 'asc')
      .orderBy('action', 'asc');

    // 按 resource 分组
    const grouped = permissions.reduce((acc: Record<string, unknown[]>, perm: { resource: string; [key: string]: unknown }) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {});

    return success(grouped);
  });
}

// 辅助函数：构建菜单树
function buildMenuTree(
  menus: Array<{ id: string; parent_id: string | null; [key: string]: unknown }>,
  parentId: string | null
): Array<{ id: string; children: unknown[]; [key: string]: unknown }> {
  return menus
    .filter((menu) => menu.parent_id === parentId)
    .map((menu) => ({
      ...menu,
      children: buildMenuTree(menus, menu.id)
    }));
}
