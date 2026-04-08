# CRUD 通用接口文档

## 概述

通用 CRUD 接口基于 RESTful 风格设计，支持对任意实体进行增删改查操作。

## 接口列表

### 通用 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/:entity` | 列表查询 |
| GET | `/api/:entity/:id` | 详情查询 |
| POST | `/api/:entity` | 创建记录 |
| PUT | `/api/:entity/:id` | 更新记录 |
| DELETE | `/api/:entity/:id` | 删除记录 |

### 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 注册租户 |
| GET | `/api/auth/menus` | 获取当前用户菜单 |
| GET | `/api/auth/permissions` | 获取当前用户权限 |

## 通用 CRUD

### 列表查询

```
GET /api/:entity
```

**请求参数 (Query)**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 (最大100) |
| search | string | - | 搜索关键词 |
| sortBy | string | created_at | 排序字段 |
| sortOrder | string | desc | 排序方向 (asc/desc) |
| status | string | - | 状态过滤 (active/inactive/deleted) |

**响应格式**

```json
{
  "code": 0,
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  },
  "message": "OK"
}
```

### 详情查询

```
GET /api/:entity/:id
```

**响应格式**

```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    ...
  },
  "message": "OK"
}
```

### 创建记录

```
POST /api/:entity
```

**请求体**: 任意 JSON 对象

**自动填充字段**:
- `tenant_id`: 非全局表自动添加当前租户 ID
- `created_at`: 创建时间
- `updated_at`: 更新时间

**响应格式**

```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    ...
  },
  "message": "OK"
}
```

### 更新记录

```
PUT /api/:entity/:id
```

**请求体**: 任意 JSON 对象

**禁止修改字段**:
- `id`
- `tenant_id`
- `created_at`

**响应格式**

```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    ...
  },
  "message": "OK"
}
```

### 删除记录

```
DELETE /api/:entity/:id
```

**行为**:
- 软删除表: 设置 `status = 'deleted'`
- 硬删除表: 直接删除

**响应格式**

```json
{
  "code": 0,
  "data": { "id": "uuid" },
  "message": "OK"
}
```

## 表分类

### 软删除表

以下表执行软删除 (`status = 'deleted'`):
- `users`
- `roles`
- `menus`
- `org_departments`
- `tenants`

### 全局表

以下表不受租户隔离限制:
- `permissions`

## 租户隔离

除 `permissions` 表外，所有表的 CRUD 操作都会自动注入 `tenant_id` 过滤条件：

```sql
-- 列表/详情/更新/删除都会自动添加
WHERE tenant_id = '当前租户ID'
```

这确保租户 A 无法访问租户 B 的数据。

## 使用示例

### 创建用户

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "new@example.com",
    "password_hash": "hashed_password"
  }'
```

### 查询用户列表

```bash
curl "http://localhost:3000/api/users?page=1&pageSize=10&search=john" \
  -H "Authorization: Bearer <token>"
```

### 更新用户

```bash
curl -X PUT http://localhost:3000/api/users/123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe"
  }'
```

### 删除用户

```bash
curl -X DELETE http://localhost:3000/api/users/123 \
  -H "Authorization: Bearer <token>"
```

## 错误响应

```json
{
  "code": 400,
  "data": null,
  "message": "错误描述"
}
```

常见错误码:
- `400` - 参数错误
- `401` - 未授权
- `404` - 记录不存在
- `500` - 服务器错误
