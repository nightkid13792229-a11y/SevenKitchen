import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AdminRecipeTaxonomyController } from 'src/interfaces/controllers/admin-recipe-taxonomy.controller';

function routeOf(methodName: string): {
  path: string;
  method: RequestMethod;
} {
  const prototype = AdminRecipeTaxonomyController.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const handler = prototype[methodName];
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
  };
}

describe('AdminRecipeTaxonomyController 路由契约', () => {
  it('类级路径固定', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminRecipeTaxonomyController),
    ).toBe('api/v1/admin/recipe-taxonomy');
  });

  it('七个路由与前端 api 约定一致', () => {
    expect(routeOf('getTree')).toEqual({
      path: 'tree',
      method: RequestMethod.GET,
    });
    expect(routeOf('listSeries')).toEqual({
      path: 'series',
      method: RequestMethod.GET,
    });
    expect(routeOf('replaceLinks')).toEqual({
      path: 'series/:seriesId/links',
      method: RequestMethod.PUT,
    });
    expect(routeOf('batchLinks')).toEqual({
      path: 'series/batch-links',
      method: RequestMethod.POST,
    });
    expect(routeOf('createNode')).toEqual({
      path: 'nodes',
      method: RequestMethod.POST,
    });
    expect(routeOf('updateNode')).toEqual({
      path: 'nodes/:id',
      method: RequestMethod.PATCH,
    });
    expect(routeOf('deleteNode')).toEqual({
      path: 'nodes/:id',
      method: RequestMethod.DELETE,
    });
  });
});
