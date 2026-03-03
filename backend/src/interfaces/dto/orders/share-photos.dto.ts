import { ApiProperty } from '@nestjs/swagger';

export class SharePhotosResponseDto {
  @ApiProperty({ description: 'Share token' })
  token!: string;

  @ApiProperty({ description: 'Token expiration time' })
  expiresAt!: Date;
}
