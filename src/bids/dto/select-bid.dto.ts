import { IsIn, IsNumber } from 'class-validator';

export class SelectBidDto {
  @IsNumber()
  @IsIn([1, 2, 3])
  selection: 1 | 2 | 3;
}
