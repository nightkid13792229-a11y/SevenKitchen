import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ValidationError } from '../../../src/domain/common/errors';
import { BadRequestExceptionFilter } from '../../../src/interfaces/common/bad-request-exception.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/admin/ingredients' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('BadRequestExceptionFilter', () => {
  it('把领域 ValidationError 映射成业务 400，而不是 500', () => {
    const { host, status, json } = createHost();
    const filter = new BadRequestExceptionFilter();

    filter.catch(
      new ValidationError('reorder_point must be greater than or equal to safety_stock'),
      host,
    );

    // 与现有 BadRequestExceptionFilter 一致：HTTP 200 + body.code=400，
    // 前端拦截器会显示 message，不会误报网络 500。
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 400,
        message: expect.stringContaining('reorder_point'),
      }),
    );
  });

  it('BadRequestException 仍然保留校验消息', () => {
    const { host, json } = createHost();
    const filter = new BadRequestExceptionFilter();

    filter.catch(new BadRequestException('参数不合法'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 400, message: '参数不合法' }),
    );
  });
});
