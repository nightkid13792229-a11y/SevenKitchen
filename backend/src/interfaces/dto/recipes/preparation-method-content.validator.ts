import { registerDecorator, ValidationOptions } from 'class-validator';

import {
  PREPARATION_METHOD_MAX_CONTENT_LENGTH,
  isPreparationMethodWithinContentLimit,
} from '../../../domain/recipe/preparation-field-text';

/**
 * 校验「部位 / 状态 / 预处理」的内容字符数（不含 `/`、顿号、空格等符号）。
 * 空值交给 @IsOptional / @IsString 处理。
 */
export function IsPreparationMethodContentLength(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPreparationMethodContentLength',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value !== 'string' ||
            isPreparationMethodWithinContentLimit(value)
          );
        },
        defaultMessage(): string {
          return `部位 / 状态 / 预处理最多 ${PREPARATION_METHOD_MAX_CONTENT_LENGTH} 个字（不含符号）`;
        },
      },
    });
  };
}
