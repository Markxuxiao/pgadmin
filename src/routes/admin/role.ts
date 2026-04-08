import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withPagination } from '../../plugins/postgrest.js';

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional()
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional()
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional()
});

export async function roleRoutes(app: FastifyInstance) {
  // 获取角色列表
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.parse(request.query);
    const tenantId = request.auth.tenantId;

    let dbQuery = app.pg('roles')
      .where('tenant_id', tenantId)
      .select('*');

    if (query.search) {
      dbQuery = dbQuery.whereILike('name', `%${query.search}%`);
    }

    const [{ count }] = await app.pg('roles')
      .where('tenant_id', tenantId)
      .count({ count: '*' });
    const total = Number(count);

    dbQuery = dbQuery.orderBy('created_at', 'desc');
    dbQuery = withPagination(dbQuery, query.page, query.pageSize);

    const roles = await dbQuery;

    return {
      data: roles,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    };
  });

  // 获取单个角色（含权限）
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    const role = await app.pg('roles')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!role) {
      return reply.code(404).send({ error: 'Role not found' });
    }

    // 获取角色权限
    const permissions = await app.pg('role_permissions')
      .join('permissions', 'role_permissions.permission_id', 'permissions.id')
      .where('role_permissions.role_id', id)
      .select('permissions.id', 'permissions.name', 'permissions.code', 'permissions.resource', 'permissions.action');

    return { ...role, permissions };
  });

  // 创建角色
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createRoleSchema.parse(request.body);
    const tenantId = request.auth.tenantId;

    // 检查 code 唯一性
    const existing = await app.pg('roles')
      .where('tenant_id', tenantId)
      .where('code', body.code)
      .first();

    if (existing) {
      return reply.code(400).send({ error: 'Role code already exists' });
    }

    const result = await app.pg.transaction(async (trx) => {
      const [role] = await trx('roles')
        .insert({
          tenant_id: tenantId,
          name: body.name,
          code: body.code,
          description: body.description
        })
        .returning('*');

      // 分配权限
      if (body.permissionIds && body.permissionIds.length > 0) {
        const rolePerms = body.permissionIds.map((permId: string) => ({
          role_id: role.id,
          permission_id: permId
        }));
        await trx('role_permissions').insert(rolePerms);
      }

      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'create_role',
        resource: 'roles',
        resource_id: role.id,
        detail: { name: body.name, code: body.code }
      });

      return role;
    });

    return reply.code(201).send(result);
  });

  // 更新角色
  app.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateRoleSchema.parse(request.body);
    const tenantId = request.auth.tenantId;

    const existing = await app.pg('roles')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'Role not found' });
    }

    // 系统角色不允许修改 code
    if (existing.is_system) {
      delete body;
      return reply.code(400).send({ error: 'Cannot modify system role' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    updateData.updated_at = new Date();

    await app.pg.transaction(async (trx) => {
      if (Object.keys(updateData).length > 0) {
        await trx('roles').where('id', id).update(updateData);
      }

      if (body.permissionIds) {
        await trx('role_permissions').where('role_id', id).delete();
        if (body.permissionIds.length > 0) {
          const rolePerms = body.permissionIds.map((permId: string) => ({
            role_id: id,
            permission_id: permId
          }));
          await trx('role_permissions').insert(rolePerms);
        }
      }

      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'update_role',
        resource: 'roles',
        resource_id: id
      });
    });

    return { success: true };
  });

  // 删除角色
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    const existing = await app.pg('roles')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'Role not found' });
    }

    if (existing.is_system) {
      return reply.code(400).send({ error: 'Cannot delete system role' });
    }

    await app.pg.transaction(async (trx) => {
      await trx('roles').where('id', id).update({ status: 'deleted', updated_at: new Date() });
      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'delete_role',
        resource: 'roles',
        resource_id: id
      });
    });

    return { success: true };
  });
}
