# 通用后台管理系统 API 架构

## 概述

基于 **Fastify + PostgREST + Knex** 的通用后台管理系统 API 架构。

## 核心设计

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                      Fastify                            │
│  (认证 / 鉴权 / 日志 / 路由编排 / 10%复杂查询入口)         │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    PostgREST                             │
│  (90% CRUD / 过滤 / 关联查询 / RLS 权限控制)              │
└─────────────────────┬───────────────────────────────────┘
                      │ SQL
                      ▼
┌─────────────────────────────────────────────────────────┐
│               PostgreSQL + Knex                          │
│  (Migrations / 复杂事务 / 原生 SQL)                       │
└─────────────────────────────────────────────────────────┘
```

### 混用架构原则

| 场景 | 方案 | 说明 |
|------|------|------|
| **90% CRUD** | PostgREST | 简单增删改查、过滤、关联查询 |
| **10% 复杂查询** | Knex | 多表聚合、窗口函数、CTE |
| **复杂事务** | Knex | 支付、库存等多步骤业务逻辑 |

## 技术栈

- **运行时**: Node.js ≥ 20
- **框架**: Fastify 5.x
- **数据库**: PostgreSQL 16+ (RLS 支持)
- **查询构造器**: Knex 3.x
- **包管理器**: pnpm
- **测试**: Vitest

## 项目结构

```
pgadmin/
├── db/
│   ├── migrations/          # Knex SQL migrations
│   └── knexfile.ts          # Knex 配置
├── src/
│   ├── app.ts               # Fastify 入口
│   ├── config.ts            # 环境配置 (Zod)
│   ├── plugins/
│   │   ├── auth.ts          # JWT 认证
│   │   ├── postgrest.ts     # PostgREST 风格查询
│   │   └── tenant.ts        # 多租户上下文
│   ├── routes/
│   │   ├── auth/login.ts    # 登录/注册
│   │   └── admin/           # 管理端路由
│   │       ├── user.ts
│   │       ├── role.ts
│   │       ├── permission.ts
│   │       └── menu.ts
│   ├── services/
│   │   ├── user.service.ts  # Knex 复杂查询
│   │   └── report.service.ts
│   └── types/index.ts
├── tests/                   # Vitest 测试
├── docs/                    # 文档
└── package.json
```

## 数据库设计

### 表结构

| 表名 | 说明 | 多租户 |
|------|------|--------|
| `tenants` | 租户表 | - |
| `users` | 用户表 | ✓ |
| `roles` | 角色表 | ✓ |
| `permissions` | 权限表 | ✗ (全局) |
| `role_permissions` | 角色-权限关联 | - |
| `user_roles` | 用户-角色关联 | - |
| `menus` | 菜单表 | ✓ |
| `org_departments` | 组织架构 | ✓ |
| `operation_logs` | 操作日志 | ✓ |

### 多租户隔离 (Row-Level Security)

```sql
-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 策略：仅能访问当前租户数据
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

## 认证流程

```
请求 → JWT 验证 → 解析 tenant_id + user_id → 设置请求上下文
                                              ↓
                                    所有数据库查询自动注入 tenant_id
```

JWT Payload:
```json
{
  "sub": "user-123",      // 用户 ID
  "tid": "tenant-456",    // 租户 ID
  "username": "admin",
  "roles": ["admin"]
}
```

## API 路由

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/register` | 注册租户 |

### 管理端 (需认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/users/:id` | 用户详情 |
| POST | `/api/admin/users` | 创建用户 |
| PUT | `/api/admin/users/:id` | 更新用户 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET | `/api/admin/roles` | 角色列表 |
| GET | `/api/admin/permissions` | 权限列表 |
| GET | `/api/admin/menus` | 菜单树 |

## 启动

```bash
# 安装依赖
pnpm install

# 运行 migrations
pnpm knex migrate:latest

# 开发
pnpm dev

# 测试
pnpm test
```

## 环境变量

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pgadmin
JWT_SECRET=your-secret-key
PORT=3000
NODE_ENV=development
```
