import type { FastifyInstance } from 'fastify';
import { authPlugin } from '../plugins/auth.js';
import { userRoutes } from './admin/user.js';
import { roleRoutes } from './admin/role.js';
import { permissionRoutes } from './admin/permission.js';
import { menuRoutes } from './admin/menu.js';
import { loginRoutes } from './auth/login.js';

/**
 * 注册所有路由
 */
export async function registerRoutes(app: FastifyInstance) {
  // 公开路由（不需要认证）
  await app.register(loginRoutes, { prefix: '/api/auth' });

  // 需要认证的管理端路由
  await app.register(async (authenticatedApp) => {
    // 为所有路由添加认证
    authenticatedApp.addHook('preHandler', authenticatedApp.authenticate);

    // 注册管理端路由
    await authenticatedApp.register(userRoutes, { prefix: '/api/admin/users' });
    await authenticatedApp.register(roleRoutes, { prefix: '/api/admin/roles' });
    await authenticatedApp.register(permissionRoutes, { prefix: '/api/admin/permissions' });
    await authenticatedApp.register(menuRoutes, { prefix: '/api/admin/menus' });
  });
}
