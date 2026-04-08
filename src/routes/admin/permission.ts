import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const createPermissionSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  resource: z.string().min(1).max(100),
  action: z.string().min(1).max(50),
  description: z.string().optional()
});

// 权限不需要分 tenant_id，因为是全局的

export async function permissionRoutes(app: FastifyInstance) {
  // 获取所有权限（分页）
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page = 1, pageSize = 100, resource, search } = z.object({
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).max(200).default(100),
      resource: z.string().optional(),
      search: z.string().optional()
    }).parse(request.query);

    let dbQuery = app.pg('permissions').select('*');

    if (resource) {
      dbQuery = dbQuery.where('resource', resource);
    }

    if (search) {
      dbQuery = dbQuery.whereILike('name', `%${search}%`);
    }

    const [{ count }] = await app.pg('permissions').count({ count: '*' });
    const total = Number(count);

    dbQuery = dbQuery
      .orderBy('resource', 'asc')
      .orderBy('action', 'asc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const permissions = await dbQuery;

    return {
      data: permissions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  });

  // 获取所有权限（不分页，按 resource 分组）
  app.get('/grouped', async (_request: FastifyRequest, reply: FastifyReply) => {
    const permissions = await app.pg('permissions')
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

    return { data: grouped };
  });

  // 获取单个权限
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const permission = await app.pg('permissions')
      .where('id', id)
      .first();

    if (!permission) {
      return reply.code(404).send({ error: 'Permission not found' });
    }

    return permission;
  });

  // 创建权限
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createPermissionSchema.parse(request.body);

    // 检查 code 唯一性
    const existing = await app.pg('permissions')
      .where('code', body.code)
      .first();

    if (existing) {
      return reply.code(400).send({ error: 'Permission code already exists' });
    }

    const [permission] = await app.pg('permissions')
      .insert(body)
      .returning('*');

    return reply.code(201).send(permission);
  });

  // 删除权限
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await app.pg('permissions')
      .where('id', id)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'Permission not found' });
    }

    // 检查是否被角色使用
    const usedBy = await app.pg('role_permissions')
      .where('permission_id', id)
      .first();

    if (usedBy) {
      return reply.code(400).send({ error: 'Permission is in use by roles' });
    }

    await app.pg('permissions').where('id', id).delete();

    return { success: true };
  });
}
