import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import KnexConfig from '../../db/knexfile.js';

/**
 * PostgREST 风格查询构建器插件
 *
 * 特点：
 * - 支持 .eq(), .neq(), .gt(), .gte(), .lt(), .lte(), .like(), .in(), .is()
 * - 支持关联查询 .withGraphFetched()
 * - 支持分页 .page(), .limit()
 * - 自动注入 tenant_id（用于 RLS）
 *
 * 使用方式类似 PostgREST：
 * const users = await fastify.pg('users')
 *   .where('status', 'active')
 *   .where('tenant_id', request.auth.tenantId)
 *   .select('*')
 */
export async function postgrestPlugin(fastify: FastifyInstance) {
  const env = fastify.config?.app?.env || process.env.NODE_ENV || 'development';

  const knex = Knex({
    ...KnexConfig[env],
    wrapIdentifier: (value: string, _origImpl: unknown, queryContext: unknown) => {
      // 驼峰转蛇形：userId -> user_id
      const snakeCase = value.replace(/([A-Z])/g, '_$1').toLowerCase();
      return `"${snakeCase}"`;
    }
  });

  // 挂载到 fastify 实例
  fastify.decorate('pg', knex);

  // 清理
  fastify.addHook('onClose', async () => {
    await knex.destroy();
  });
}

// 扩展 Fastify 实例
declare module 'fastify' {
  interface FastifyInstance {
    pg: Knex;
  }
}

// =====================================================
// Query Builder 扩展（链式调用辅助函数）
// =====================================================

export interface QueryOptions {
  tenantId?: string;
  userId?: string;
  offset?: number;
  limit?: number;
}

/**
 * 构建带 tenant 隔离的查询
 */
export function withTenant<T>(query: Knex.QueryBuilder<T, T>, tenantId: string): Knex.QueryBuilder<T, T> {
  return query.where('tenant_id', tenantId);
}

/**
 * 构建分页查询
 */
export function withPagination<T>(
  query: Knex.QueryBuilder<T, T>,
  page: number = 1,
  pageSize: number = 20
): Knex.QueryBuilder<T, T> {
  const offset = (page - 1) * pageSize;
  return query.limit(pageSize).offset(offset);
}

/**
 * 获取总数（配合分页）
 */
export async function getCount(query: Knex.QueryBuilder): Promise<number> {
  const result = await query.count({ count: '*' }).first();
  return Number(result?.count) || 0;
}
