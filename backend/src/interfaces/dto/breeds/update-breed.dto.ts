/**
 * Update Breed DTO
 */

import { PartialType } from '@nestjs/swagger';
import { CreateBreedDto } from './create-breed.dto';

export class UpdateBreedDto extends PartialType(CreateBreedDto) {}
