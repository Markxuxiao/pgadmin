import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withPagination } from '../../plugins/postgrest.js';

const createMenuSchema = z.object({
  name: z.string().min(1).max(100),
  path: z.string().optional(),
  icon: z.string().optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0)
});

const updateMenuSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  path: z.string().optional(),
  icon: z.string().optional(),
  parentId: z.string().uuid().optional().nullable,
  sortOrder: z.number().int().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export async function menuRoutes(app: FastifyInstance) {
  // 获取菜单树
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth.tenantId;

    const menus = await app.pg('menus')
      .where('tenant_id', tenantId)
      .where('status', 'active')
      .orderBy('sort_order', 'asc')
      .select('id', 'parent_id', 'name', 'path', 'icon', 'sort_order', 'status');

    // 构建树形结构
    const menuTree = buildMenuTree(menus, null);

    return { data: menuTree };
  });

  // 获取菜单列表（扁平）
  app.get('/flat', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth.tenantId;

    const menus = await app.pg('menus')
      .where('tenant_id', tenantId)
      .orderBy('sort_order', 'asc')
      .select('id', 'parent_id', 'name', 'path', 'icon', 'sort_order', 'status', 'created_at');

    return { data: menus };
  });

  // 获取单个菜单
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    const menu = await app.pg('menus')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!menu) {
      return reply.code(404).send({ error: 'Menu not found' });
    }

    return menu;
  });

  // 创建菜单
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createMenuSchema.parse(request.body);
    const tenantId = request.auth.tenantId;

    // 验证 parentId 属于当前租户
    if (body.parentId) {
      const parent = await app.pg('menus')
        .where('id', body.parentId)
        .where('tenant_id', tenantId)
        .first();

      if (!parent) {
        return reply.code(400).send({ error: 'Parent menu not found' });
      }
    }

    const [menu] = await app.pg('menus')
      .insert({
        tenant_id: tenantId,
        name: body.name,
        path: body.path,
        icon: body.icon,
        parent_id: body.parentId || null,
        sort_order: body.sortOrder
      })
      .returning('*');

    return reply.code(201).send(menu);
  });

  // 更新菜单
  app.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateMenuSchema.parse(request.body);
    const tenantId = request.auth.tenantId;

    const existing = await app.pg('menus')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'Menu not found' });
    }

    // 防止循环引用
    if (body.parentId === id) {
      return reply.code(400).send({ error: 'Cannot set menu as its own parent' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.path !== undefined) updateData.path = body.path;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.parentId !== undefined) updateData.parent_id = body.parentId;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.status) updateData.status = body.status;
    updateData.updated_at = new Date();

    await app.pg('menus').where('id', id).update(updateData);

    return { success: true };
  });

  // 删除菜单
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    const existing = await app.pg('menus')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'Menu not found' });
    }

    // 检查是否有子菜单
    const hasChildren = await app.pg('menus')
      .where('parent_id', id)
      .where('tenant_id', tenantId)
      .first();

    if (hasChildren) {
      return reply.code(400).send({ error: 'Cannot delete menu with children' });
    }

    await app.pg('menus').where('id', id).update({ status: 'deleted', updated_at: new Date() });

    return { success: true };
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
