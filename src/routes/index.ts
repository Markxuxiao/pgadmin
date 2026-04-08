import type { FastifyInstance } from 'fastify';
import { loginRoutes } from './auth/login.js';
import { permissionRoutes } from './auth/permissions.js';
import { crudRoutes } from './crud.js';

/**
 * 注册所有路由
 */
export async function registerRoutes(app: FastifyInstance) {
  // 公开路由（不需要认证）
  await app.register(loginRoutes, { prefix: '/api/auth' });

  // 需要认证的路由
  await app.register(async (authenticatedApp) => {
    // 为所有路由添加认证
    authenticatedApp.addHook('preHandler', authenticatedApp.authenticate);

    // 权限/菜单查询
    await authenticatedApp.register(permissionRoutes, { prefix: '/api/auth' });

    // 通用 CRUD（处理所有表）
    await authenticatedApp.register(crudRoutes);
  });
}
