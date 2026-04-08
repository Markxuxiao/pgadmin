import { describe, it, expect } from 'vitest';
import { parseQueryToKnex } from '../src/common/knex-query.parser.js';

describe('parseQueryToKnex', () => {
  // 创建一个 mock knex query builder
  const createMockKnex = () => {
    const state: any = { select: [], where: [], orderBy: undefined, limit: null, offset: null };
    return {
      select: (cols: string[]) => { state.select = cols; return createMockKnex(); },
      where: (col: string, op: string, val: any) => { state.where.push({ col, op, val }); return createMockKnex(); },
      orderBy: (col: string, dir: string) => { state.orderBy = { col, dir }; return createMockKnex(); },
      limit: (n: number) => { state.limit = n; return createMockKnex(); },
      offset: (n: number) => { state.offset = n; return createMockKnex(); },
      _state: state
    };
  };

  describe('select', () => {
    it('应正确解析单列 select', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ select: 'id' }, mock);
      expect(mock._state.select).toEqual(['id']);
    });

    it('应正确解析多列 select（逗号分隔）', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ select: 'id,name,email' }, mock);
      expect(mock._state.select).toEqual(['id', 'name', 'email']);
    });

    it('应去除列名空格', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ select: ' id , name , email ' }, mock);
      expect(mock._state.select).toEqual(['id', 'name', 'email']);
    });
  });

  describe('操作符过滤', () => {
    describe('eq (等于)', () => {
      it('应解析 name=eq.john', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'name': 'eq.john' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'name', op: '=', val: 'john' });
      });

      it('应解析 status=eq.active', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'status': 'eq.active' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'status', op: '=', val: 'active' });
      });

      it('应解析 tenant_id=eq.tenant-123', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'tenant_id': 'eq.tenant-123' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'tenant_id', op: '=', val: 'tenant-123' });
      });
    });

    describe('gt (大于)', () => {
      it('应解析 age=gt.18', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'age': 'gt.18' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'age', op: '>', val: '18' });
      });

      it('应解析 price=gt.100', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'price': 'gt.100' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'price', op: '>', val: '100' });
      });
    });

    describe('gte (大于等于)', () => {
      it('应解析 age=gte.18', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'age': 'gte.18' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'age', op: '>=', val: '18' });
      });

      it('应解析 quantity=gte.10', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'quantity': 'gte.10' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'quantity', op: '>=', val: '10' });
      });
    });

    describe('lt (小于)', () => {
      it('应解析 age=lt.65', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'age': 'lt.65' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'age', op: '<', val: '65' });
      });

      it('应解析 price=lt.50', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'price': 'lt.50' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'price', op: '<', val: '50' });
      });
    });

    describe('lte (小于等于)', () => {
      it('应解析 age=lte.65', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'age': 'lte.65' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'age', op: '<=', val: '65' });
      });

      it('应解析 quantity=lte.100', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'quantity': 'lte.100' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'quantity', op: '<=', val: '100' });
      });
    });

    describe('like (模糊匹配)', () => {
      it('应解析 name=like.john', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'name': 'like.john' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'name', op: 'like', val: 'john' });
      });

      it('应解析 email=like.@example', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'email': 'like.@example' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'email', op: 'like', val: '@example' });
      });
    });

    describe('ilike (大小写不敏感模糊匹配)', () => {
      it('应解析 name=ilike.john', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'name': 'ilike.john' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'name', op: 'ilike', val: 'john' });
      });

      it('应解析 code=ilike.ABC', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'code': 'ilike.ABC' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'code', op: 'ilike', val: 'ABC' });
      });
    });

    describe('无操作符（默认 eq）', () => {
      it('应将 value 解析为 name=value', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'name': 'john' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'name', op: '=', val: 'john' });
      });

      it('应将 123 解析为 id=123', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'id': '123' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'id', op: '=', val: '123' });
      });
    });

    describe('不支持的操作符', () => {
      it('应将未知操作符当作 eq 处理', () => {
        const mock = createMockKnex();
        parseQueryToKnex({ 'name': 'in.john' }, mock);
        expect(mock._state.where).toContainEqual({ col: 'name', op: '=', val: 'in.john' });
      });
    });
  });

  describe('多条件组合', () => {
    it('应同时处理多个过滤条件', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        'status': 'eq.active',
        'name': 'like.john',
        'age': 'gte.18'
      }, mock);
      expect(mock._state.where).toHaveLength(3);
      expect(mock._state.where).toContainEqual({ col: 'status', op: '=', val: 'active' });
      expect(mock._state.where).toContainEqual({ col: 'name', op: 'like', val: 'john' });
      expect(mock._state.where).toContainEqual({ col: 'age', op: '>=', val: '18' });
    });

    it('应同时处理 select 和多个过滤条件', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        select: 'id,name,email',
        'status': 'eq.active'
      }, mock);
      expect(mock._state.select).toEqual(['id', 'name', 'email']);
      expect(mock._state.where).toContainEqual({ col: 'status', op: '=', val: 'active' });
    });
  });

  describe('排序', () => {
    it('应解析 order=created_at.desc', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ order: 'created_at.desc' }, mock);
      expect(mock._state.orderBy).toEqual({ col: 'created_at', dir: 'desc' });
    });

    it('应解析 order=created_at.asc', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ order: 'created_at.asc' }, mock);
      expect(mock._state.orderBy).toEqual({ col: 'created_at', dir: 'asc' });
    });

    it('应默认 asc 排序', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ order: 'name' }, mock);
      expect(mock._state.orderBy).toEqual({ col: 'name', dir: 'asc' });
    });

    it('应解析 order=updated_at.desc', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ order: 'updated_at.desc' }, mock);
      expect(mock._state.orderBy).toEqual({ col: 'updated_at', dir: 'desc' });
    });
  });

  describe('分页', () => {
    it('应正确设置 limit', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ limit: '20' }, mock);
      expect(mock._state.limit).toBe(20);
    });

    it('应将 limit 转换为数字', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ limit: '50' }, mock);
      expect(mock._state.limit).toBe(50);
    });

    it('应正确设置 offset', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ offset: '10' }, mock);
      expect(mock._state.offset).toBe(10);
    });

    it('应将 offset 转换为数字', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ offset: '40' }, mock);
      expect(mock._state.offset).toBe(40);
    });

    it('应同时设置 limit 和 offset', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ limit: '20', offset: '40' }, mock);
      expect(mock._state.limit).toBe(20);
      expect(mock._state.offset).toBe(40);
    });

    it('应处理分页为 0 的情况', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ limit: '0', offset: '0' }, mock);
      expect(mock._state.limit).toBe(0);
      expect(mock._state.offset).toBe(0);
    });
  });

  describe('完整查询场景', () => {
    it('应解析 PostgREST 风格完整列表查询', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        select: 'id,name,status',
        'tenant_id': 'eq.tenant-123',
        'status': 'eq.active',
        order: 'created_at.desc',
        limit: '20',
        offset: '0'
      }, mock);

      expect(mock._state.select).toEqual(['id', 'name', 'status']);
      expect(mock._state.where).toContainEqual({ col: 'tenant_id', op: '=', val: 'tenant-123' });
      expect(mock._state.where).toContainEqual({ col: 'status', op: '=', val: 'active' });
      expect(mock._state.orderBy).toEqual({ col: 'created_at', dir: 'desc' });
      expect(mock._state.limit).toBe(20);
      expect(mock._state.offset).toBe(0);
    });

    it('应解析搜索+排序+分页', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        'name': 'ilike.admin',
        order: 'updated_at.desc',
        limit: '10',
        offset: '20'
      }, mock);

      expect(mock._state.where).toContainEqual({ col: 'name', op: 'ilike', val: 'admin' });
      expect(mock._state.orderBy).toEqual({ col: 'updated_at', dir: 'desc' });
      expect(mock._state.limit).toBe(10);
      expect(mock._state.offset).toBe(20);
    });

    it('应解析范围查询', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        'min_age': 'gte.18',
        'max_age': 'lte.65',
        'price': 'gt.0'
      }, mock);

      expect(mock._state.where).toContainEqual({ col: 'min_age', op: '>=', val: '18' });
      expect(mock._state.where).toContainEqual({ col: 'max_age', op: '<=', val: '65' });
      expect(mock._state.where).toContainEqual({ col: 'price', op: '>', val: '0' });
    });

    it('应忽略 skipKeys 中的键', () => {
      const mock = createMockKnex();
      parseQueryToKnex({
        select: 'id',
        order: 'name.asc',
        limit: '10',
        offset: '0'
      }, mock);

      // select/order/limit/offset 不应变成 where 条件
      expect(mock._state.where).toHaveLength(0);
      expect(mock._state.select).toEqual(['id']);
      expect(mock._state.orderBy).toEqual({ col: 'name', dir: 'asc' });
      expect(mock._state.limit).toBe(10);
      expect(mock._state.offset).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('应处理空查询对象', () => {
      const mock = createMockKnex();
      parseQueryToKnex({}, mock);
      expect(mock._state.select).toHaveLength(0);
      expect(mock._state.where).toHaveLength(0);
      expect(mock._state.orderBy).toBeUndefined();
      expect(mock._state.limit).toBeNull();
      expect(mock._state.offset).toBeNull();
    });

    it('应处理 undefined 值', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ 'name': undefined }, mock);
      expect(mock._state.where).toHaveLength(0);
    });

    it('应处理 null 值', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ 'name': null }, mock);
      expect(mock._state.where).toHaveLength(0);
    });

    it('应处理 snake_case 字段名', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ 'created_at': 'gte.2024-01-01' }, mock);
      expect(mock._state.where).toContainEqual({ col: 'created_at', op: '>=', val: '2024-01-01' });
    });

    it('应处理 camelCase 字段名', () => {
      const mock = createMockKnex();
      parseQueryToKnex({ 'updatedAt': 'eq.2024-01-01' }, mock);
      expect(mock._state.where).toContainEqual({ col: 'updatedAt', op: '=', val: '2024-01-01' });
    });
  });
});
