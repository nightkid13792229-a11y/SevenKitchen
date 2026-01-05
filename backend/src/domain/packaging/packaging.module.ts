import { Module } from '@nestjs/common';
import { PackagingService } from './packaging.service';
import { INGREDIENT_REPOSITORY } from '../../application/ingredient/ingredient.service';

@Module({
  providers: [
    PackagingService,
    {
      provide: 'PackagingService',
      useClass: PackagingService,
    },
  ],
  exports: [PackagingService],
})
export class PackagingModule {}
