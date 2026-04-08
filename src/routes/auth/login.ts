import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  tenantCode: z.string().min(1)
});

/**
 * 登录路由（公开，不需要认证）
 */
export async function loginRoutes(app: FastifyInstance) {
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // 1. 查询租户
    const tenant = await app.pg('tenants')
      .where('code', body.tenantCode)
      .where('status', 'active')
      .first();

    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // 2. 查询用户
    const user = await app.pg('users')
      .where('tenant_id', tenant.id)
      .where('username', body.username)
      .where('status', 'active')
      .first();

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // 3. 验证密码
    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // 4. 查询用户角色
    const roles = await app.pg('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .where('roles.status', 'active')
      .select('roles.code');

    const roleCodes = roles.map((r: { code: string }) => r.code);

    // 5. 更新最后登录时间
    await app.pg('users')
      .where('id', user.id)
      .update({ last_login_at: new Date() });

    // 6. 生成 JWT
    const token = app.jwt.sign({
      sub: user.id,
      tid: tenant.id,
      username: user.username,
      roles: roleCodes
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        tenantId: tenant.id,
        tenantName: tenant.name
      },
      roles: roleCodes
    };
  });

  // 注册（创建租户 + 第一个用户）
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const registerSchema = z.object({
      tenantName: z.string().min(1),
      tenantCode: z.string().min(1).max(100),
      username: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(6),
      fullName: z.string().optional()
    });

    const body = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    // 在事务中创建
    const result = await app.pg.transaction(async (trx) => {
      // 创建租户
      const [tenant] = await trx('tenants')
        .insert({
          name: body.tenantName,
          code: body.tenantCode
        })
        .returning('*');

      // 创建管理员角色
      const [adminRole] = await trx('roles')
        .insert({
          tenant_id: tenant.id,
          name: 'Administrator',
          code: 'admin',
          description: 'System administrator role',
          is_system: true
        })
        .returning('*');

      // 创建用户
      const [user] = await trx('users')
        .insert({
          tenant_id: tenant.id,
          username: body.username,
          email: body.email,
          password_hash: passwordHash,
          full_name: body.fullName
        })
        .returning('*');

      // 分配 admin 角色
      await trx('user_roles')
        .insert({
          user_id: user.id,
          role_id: adminRole.id
        });

      return { tenant, user, adminRole };
    });

    // 生成 JWT
    const token = app.jwt.sign({
      sub: result.user.id,
      tid: result.tenant.id,
      username: result.user.username,
      roles: [result.adminRole.code]
    });

    return reply.code(201).send({
      token,
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        code: result.tenant.code
      },
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email
      }
    });
  });
}
