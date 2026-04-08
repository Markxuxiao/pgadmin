import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { success, error, paginated } from '../utils/response.js';
import { auditLog } from '../plugins/audit.js';
import { parseQueryToKnex } from '../common/knex-query.parser.js';

// 需要软删除的表（统一用 status = 'deleted'）
const SOFT_DELETE_TABLES = ['users', 'roles', 'menus', 'org_departments', 'tenants'];

// 允许直接操作的表（不需要 tenant 隔离）
const GLOBAL_TABLES = ['permissions'];

// 不需要租户隔离的表（表本身是租户相关但没有 tenant_id 列）
const NO_TENANT_TABLES = ['tenants'];

function shouldSoftDelete(table: string): boolean {
  return SOFT_DELETE_TABLES.includes(table);
}

function isGlobalTable(table: string): boolean {
  return GLOBAL_TABLES.includes(table);
}

function needsTenantIsolation(table: string): boolean {
  return !isGlobalTable(table) && !NO_TENANT_TABLES.includes(table);
}

export async function crudRoutes(app: FastifyInstance) {
  // =====================================================
  // GET /:entity - 列表
  // =====================================================
  app.get('/api/:entity', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity } = request.params as { entity: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;
    const query = request.query as Record<string, any>;

    let dbQuery = app.db(table);

    // 全局表不加 tenant 过滤
    if (needsTenantIsolation(table) && tenantId) {
      dbQuery = dbQuery.where('tenant_id', tenantId);
    }

    // 软删除过滤（默认排除 deleted）
    if (shouldSoftDelete(table)) {
      const statusFilter = query.status;
      if (!statusFilter || statusFilter === 'active' || statusFilter === 'inactive') {
        dbQuery = dbQuery.whereNot('status', 'deleted');
      }
    }

    // 使用通用查询解析器
    dbQuery = parseQueryToKnex(query, dbQuery);

    // 总数查询
    let countQuery = app.db(table);
    if (needsTenantIsolation(table) && tenantId) {
      countQuery = countQuery.where('tenant_id', tenantId);
    }
    if (shouldSoftDelete(table) && !query.status) {
      countQuery = countQuery.whereNot('status', 'deleted');
    }

    const [{ count }] = await countQuery.count({ count: '*' });
    const total = Number(count);

    const limit = query.limit ? +query.limit : 20;
    const offset = query.offset ? +query.offset : 0;
    const page = Math.floor(offset / limit) + 1;
    const data = await dbQuery;
    return paginated(data, total, page, limit);
  });

  // =====================================================
  // GET /:entity/:id - 详情
  // =====================================================
  app.get('/api/:entity/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, id } = request.params as { entity: string; id: string };
    const table = entity;
    const tenantId = request.auth?.tenantId;

    let dbQuery = app.db(table).where('id', id);

    if (needsTenantIsolation(table) && tenantId) {
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
    if (needsTenantIsolation(table) && tenantId) {
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
    if (needsTenantIsolation(table) && tenantId) {
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
    if (needsTenantIsolation(table) && tenantId) {
      updateQuery = updateQuery.where('tenant_id', tenantId);
    }
    await updateQuery.update(body);

    // 获取更新后的数据
    let getQuery = app.db(table).where('id', id);
    if (needsTenantIsolation(table) && tenantId) {
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
    if (needsTenantIsolation(table) && tenantId) {
      checkQuery = checkQuery.where('tenant_id', tenantId);
    }

    const existing = await checkQuery.first();
    if (!existing) {
      return reply.code(404).send(error(`${entity} not found`, 404));
    }

    // 删除时必须包含 tenant_id 过滤，防止跨租户删除
    let deleteQuery = app.db(table).where('id', id);
    if (needsTenantIsolation(table) && tenantId) {
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
