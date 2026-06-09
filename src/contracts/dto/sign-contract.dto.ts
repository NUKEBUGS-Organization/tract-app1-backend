import { IsOptional, IsString } from 'class-validator';

export class SignContractDto {
  @IsOptional()
  @IsString()
  docusign_envelope_id?: string;
}
