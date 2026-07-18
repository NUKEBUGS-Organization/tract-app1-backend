import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UploadMarketLaunchProofDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/tract/mls-proof.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  market_launch_proof_url: string;
}
