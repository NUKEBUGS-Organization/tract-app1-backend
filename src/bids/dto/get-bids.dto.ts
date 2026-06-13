import { IsMongoId } from 'class-validator';

export class GetBidsDto {
  @IsMongoId()
  listingId: string;
}
