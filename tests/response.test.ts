import { describe, it, expect } from 'vitest';
import { success, error, paginated } from '../src/utils/response.js';

describe('统一响应格式', () => {
  describe('success', () => {
    it('应返回标准成功格式', () => {
      const data = { id: '1', name: 'test' };
      const result = success(data);

      expect(result).toEqual({
        code: 0,
        data,
        message: 'OK'
      });
    });

    it('应接受自定义消息', () => {
      const result = success({ id: '1' }, '创建成功');
      expect(result.message).toBe('创建成功');
    });

    it('data 为 undefined 时应返回 undefined', () => {
      const result = success();
      expect(result.code).toBe(0);
      expect(result.data).toBeUndefined();
      expect(result.message).toBe('OK');
    });
  });

  describe('error', () => {
    it('应返回标准错误格式', () => {
      const result = error('资源不存在', 404);

      expect(result).toEqual({
        code: 404,
        data: null,
        message: '资源不存在'
      });
    });

    it('默认错误码应为 400', () => {
      const result = error('参数错误');
      expect(result.code).toBe(400);
    });

    it('应支持常见错误码', () => {
      const tests = [
        { code: 401, msg: '未授权' },
        { code: 403, msg: '禁止访问' },
        { code: 500, msg: '服务器错误' }
      ];

      tests.forEach(({ code, msg }) => {
        const result = error(msg, code);
        expect(result.code).toBe(code);
        expect(result.message).toBe(msg);
        expect(result.data).toBeNull();
      });
    });
  });

  describe('paginated', () => {
    it('应返回完整分页信息', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const result = paginated(data, 50, 2, 20);

      expect(result.code).toBe(0);
      expect(result.data.list).toEqual(data);
      expect(result.data.total).toBe(50);
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.totalPages).toBe(3);
      expect(result.message).toBe('OK');
    });

    it('应正确计算总页数', () => {
      const tests = [
        { total: 100, pageSize: 20, expected: 5 },
        { total: 101, pageSize: 20, expected: 6 },
        { total: 0, pageSize: 20, expected: 0 },
        { total: 19, pageSize: 20, expected: 1 },
        { total: 1, pageSize: 20, expected: 1 }
      ];

      tests.forEach(({ total, pageSize, expected }) => {
        const result = paginated([], total, 1, pageSize);
        expect(result.data.totalPages).toBe(expected);
      });
    });
  });
});
