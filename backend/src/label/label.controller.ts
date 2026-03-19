import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LabelService } from './label.service';
import { LabelDataDto } from './dto/label-data.dto';
import { ApiResponseDto } from '../interfaces/dto/common/response.dto';

@ApiTags('标签打印')
@Controller('api/v1/labels')
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post('generate-image')
  @ApiOperation({
    summary: '生成标签图片',
    description: '根据标签数据生成PNG图片，返回base64编码',
  })
  @ApiResponse({
    status: 201,
    description: '成功生成标签图片',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            imageBase64: {
              type: 'string',
              description:
                'PNG图片的base64编码（不含data:image/png;base64,前缀）',
              example: 'iVBORw0KGgoAAAANSUhEUgAA...',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  generateImage(
    @Body() labelData: LabelDataDto,
  ): ApiResponseDto<{ imageBase64: string }> {
    const imageBase64 = this.labelService.generateLabelImage(labelData);
    return ApiResponseDto.success({ imageBase64 });
  }
}
