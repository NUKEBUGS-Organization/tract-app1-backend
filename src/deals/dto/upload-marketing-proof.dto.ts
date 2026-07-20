import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UploadMarketingProofDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/tract/proof.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  marketing_proof_url: string;
}
