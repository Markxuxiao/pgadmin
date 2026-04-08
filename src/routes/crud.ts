import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { success, error, paginated } from '../utils/response.js';
import { auditLog } from '../plugins/audit.js';

// 需要软删除的表（统一用 status = 'deleted'）
const SOFT_DELETE_TABLES = ['users', 'roles', 'menus', 'org_departments', 'tenants'];

// 允许直接操作的表（不需要 tenant 隔离）
const GLOBAL_TABLES = ['permissions'];

// 分页默认配置
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// 列表查询 schema
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().optional(),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  // 动态字段筛选
  status: z.enum(['active', 'inactive', 'deleted']).optional()
});

function shouldSoftDelete(table: string): boolean {
  return SOFT_DELETE_TABLES.includes(table);
}

function isGlobalTable(table: string): boolean {
  return GLOBAL_TABLES.includes(table);
}

export async function crudRoutes(app: FastifyInstance) {
  // =====================================================
  // GET /:entity - 列表
  // =====================================================
  app.get('/api/:entity', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity } = request.params as { entity: string };
    const table = entity; // 直接使用复数表名

    const query = listQuerySchema.parse(request.query);
    const tenantId = request.auth?.tenantId;

    // 构建查询
    let dbQuery = app.db(table);

    // 全局表不加 tenant 过滤
    if (!isGlobalTable(table) && tenantId) {
      dbQuery = dbQuery.where('tenant_id', tenantId);
    }

    // 软删除过滤
    if (shouldSoftDelete(table) && query.status !== 'deleted') {
      dbQuery = dbQuery.whereNot('status', 'deleted');
    }

    // status 筛选
    if (query.status && shouldSoftDelete(table)) {
      dbQuery = dbQuery.where('status', query.status);
    }

    // 搜索（简单实现，可扩展）
    if (query.search) {
      dbQuery = dbQuery.where((builder) => {
        builder
          .whereILike('name', `%${query.search}%`)
          .orWhereILike('code', `%${query.search}%`)
          .orWhereILike('username', `%${query.search}%`)
          .orWhereILike('email', `%${query.search}%`);
      });
    }

    // 总数
    const countQuery = app.db(table);
    if (!isGlobalTable(table) && tenantId) {
      countQuery.where('tenant_id', tenantId);
    }
    const [{ count }] = await countQuery.count({ count: '*' });
    const total = Number(count);

    // 排序和分页
    dbQuery = dbQuery
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const data = await dbQuery;

    return paginated(data, total, query.page, query.pageSize);
  });

  // =====================================================
  // GET /:entity/:id - 详情
  // =====================================================
  app.get('/api/:entity/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, id } = request.params as { entity: string; id: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;

    let dbQuery = app.db(table).where('id', id);

    if (!isGlobalTable(table) && tenantId) {
      dbQuery = dbQuery.where('tenant_id', tenantId);
    }

    const row = await dbQuery.first();

    if (!row) {
      return reply.code(404).send(error(`${entity} not found`, 404));
    }

    return success(row);
  });

  // =====================================================
  // POST /:entity - 创建
  // =====================================================
  app.post('/api/:entity', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity } = request.params as { entity: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;

    const body = request.body as Record<string, unknown>;

    // 添加 tenant_id（除全局表外）
    if (!isGlobalTable(table) && tenantId) {
      body.tenant_id = tenantId;
    }
    body.created_at = new Date();
    body.updated_at = new Date();

    const [row] = await app.db(table)
      .insert(body)
      .returning('*');

    // 审计日志
    await auditLog(app, request, reply, `create_${entity}`, entity, row.id);

    return reply.code(201).send(success(row));
  });

  // =====================================================
  // PUT /:entity/:id - 更新
  // =====================================================
  app.put('/api/:entity/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, id } = request.params as { entity: string; id: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;

    // 检查是否存在
    let checkQuery = app.db(table).where('id', id);
    if (!isGlobalTable(table) && tenantId) {
      checkQuery = checkQuery.where('tenant_id', tenantId);
    }

    const existing = await checkQuery.first();
    if (!existing) {
      return reply.code(404).send(error(`${entity} not found`, 404));
    }

    const body = request.body as Record<string, unknown>;
    body.updated_at = new Date();

    // 不允许修改的字段
    delete body.id;
    delete body.tenant_id;
    delete body.created_at;

    // 更新时必须包含 tenant_id 过滤，防止跨租户修改
    let updateQuery = app.db(table).where('id', id);
    if (!isGlobalTable(table) && tenantId) {
      updateQuery = updateQuery.where('tenant_id', tenantId);
    }
    await updateQuery.update(body);

    // 获取更新后的数据
    let getQuery = app.db(table).where('id', id);
    if (!isGlobalTable(table) && tenantId) {
      getQuery = getQuery.where('tenant_id', tenantId);
    }
    const [row] = await getQuery.returning('*');

    // 审计日志
    await auditLog(app, request, reply, `update_${entity}`, entity, id);

    return success(row);
  });

  // =====================================================
  // DELETE /:entity/:id - 删除
  // =====================================================
  app.delete('/api/:entity/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, id } = request.params as { entity: string; id: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;

    // 检查是否存在
    let checkQuery = app.db(table).where('id', id);
    if (!isGlobalTable(table) && tenantId) {
      checkQuery = checkQuery.where('tenant_id', tenantId);
    }

    const existing = await checkQuery.first();
    if (!existing) {
      return reply.code(404).send(error(`${entity} not found`, 404));
    }

    // 删除时必须包含 tenant_id 过滤，防止跨租户删除
    let deleteQuery = app.db(table).where('id', id);
    if (!isGlobalTable(table) && tenantId) {
      deleteQuery = deleteQuery.where('tenant_id', tenantId);
    }

    if (shouldSoftDelete(table)) {
      // 软删除
      await deleteQuery.update({
        status: 'deleted',
        updated_at: new Date()
      });
    } else {
      // 硬删除
      await deleteQuery.delete();
    }

    // 审计日志
    await auditLog(app, request, reply, `delete_${entity}`, entity, id);

    return success({ id });
  });
}
