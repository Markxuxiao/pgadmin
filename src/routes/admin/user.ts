import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { withTenant, withPagination } from '../../plugins/postgrest.js';

const createUserSchema = z.object({
  username: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().optional(),
  roleIds: z.array(z.string()).optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  roleIds: z.array(z.string()).optional()
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'deleted']).optional()
});

export async function userRoutes(app: FastifyInstance) {
  // 获取当前租户下所有用户
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.parse(request.query);
    const tenantId = request.auth.tenantId;

    let dbQuery = app.pg('users')
      .where('tenant_id', tenantId)
      .select('id', 'username', 'email', 'full_name', 'status', 'last_login_at', 'created_at');

    if (query.search) {
      dbQuery = dbQuery.where((builder) => {
        builder
          .whereILike('username', `%${query.search}%`)
          .orWhereILike('email', `%${query.search}%`)
          .orWhereILike('full_name', `%${query.search}%`);
      });
    }

    if (query.status) {
      dbQuery = dbQuery.where('status', query.status);
    }

    // 获取总数
    const countQuery = app.pg('users').where('tenant_id', tenantId);
    const [{ count }] = await countQuery.count({ count: '*' });
    const total = Number(count);

    // 分页
    dbQuery = dbQuery.orderBy('created_at', 'desc');
    dbQuery = withPagination(dbQuery, query.page, query.pageSize);

    const users = await dbQuery;

    return {
      data: users,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    };
  });

  // 获取单个用户
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    const user = await app.pg('users')
      .where('id', id)
      .where('tenant_id', tenantId)
      .select('id', 'username', 'email', 'full_name', 'status', 'last_login_at', 'created_at')
      .first();

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // 获取用户角色
    const roles = await app.pg('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', id)
      .select('roles.id', 'roles.name', 'roles.code');

    return { ...user, roles };
  });

  // 创建用户
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createUserSchema.parse(request.body);
    const tenantId = request.auth.tenantId;
    const passwordHash = await bcrypt.hash(body.password, 10);

    const result = await app.pg.transaction(async (trx) => {
      // 创建用户
      const [user] = await trx('users')
        .insert({
          tenant_id: tenantId,
          username: body.username,
          email: body.email,
          password_hash: passwordHash,
          full_name: body.fullName
        })
        .returning(['id', 'username', 'email', 'full_name', 'status', 'created_at']);

      // 分配角色
      if (body.roleIds && body.roleIds.length > 0) {
        const userRoles = body.roleIds.map((roleId: string) => ({
          user_id: user.id,
          role_id: roleId
        }));
        await trx('user_roles').insert(userRoles);
      }

      // 记录操作日志
      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'create_user',
        resource: 'users',
        resource_id: user.id,
        detail: { username: body.username }
      });

      return user;
    });

    return reply.code(201).send(result);
  });

  // 更新用户
  app.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);
    const tenantId = request.auth.tenantId;

    // 检查用户是否存在
    const existing = await app.pg('users')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.email) updateData.email = body.email;
    if (body.fullName !== undefined) updateData.full_name = body.fullName;
    if (body.status) updateData.status = body.status;
    updateData.updated_at = new Date();

    await app.pg.transaction(async (trx) => {
      // 更新用户
      await trx('users')
        .where('id', id)
        .update(updateData);

      // 更新角色
      if (body.roleIds) {
        await trx('user_roles').where('user_id', id).delete();
        if (body.roleIds.length > 0) {
          const userRoles = body.roleIds.map((roleId: string) => ({
            user_id: id,
            role_id: roleId
          }));
          await trx('user_roles').insert(userRoles);
        }
      }

      // 记录操作日志
      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'update_user',
        resource: 'users',
        resource_id: id,
        detail: { changes: body }
      });
    });

    return { success: true };
  });

  // 删除用户
  app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.auth.tenantId;

    // 检查用户是否存在
    const existing = await app.pg('users')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // 软删除
    await app.pg.transaction(async (trx) => {
      await trx('users')
        .where('id', id)
        .update({ status: 'deleted', updated_at: new Date() });

      await trx('operation_logs').insert({
        tenant_id: tenantId,
        user_id: request.auth.userId,
        action: 'delete_user',
        resource: 'users',
        resource_id: id
      });
    });

    return { success: true };
  });

  // 修改密码
  app.put('/:id/password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { password } = z.object({ password: z.string().min(6) }).parse(request.body);
    const tenantId = request.auth.tenantId;

    const existing = await app.pg('users')
      .where('id', id)
      .where('tenant_id', tenantId)
      .first();

    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await app.pg('users')
      .where('id', id)
      .update({ password_hash: passwordHash, updated_at: new Date() });

    return { success: true };
  });
}
