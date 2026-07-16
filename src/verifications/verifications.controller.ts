import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { VerificationsService } from './verifications.service';
import { SubmitRealtorVerificationDto } from './dto/submit-realtor-verification.dto';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Verifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class VerificationsController {
  constructor(private readonly verificationsService: VerificationsService) {}

  @Post('realtor')
  @UseGuards(RolesGuard)
  @Roles(Role.REALTOR)
  @ApiOperation({
    summary: 'Submit/resubmit realtor license verification info',
  })
  async submitRealtorVerification(
    @Body() dto: SubmitRealtorVerificationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.verificationsService.submitRealtorVerification(
      req.user._id,
      dto,
    );
  }

  @Post('wholesaler')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload/resubmit wholesaler proof of activity document',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async submitWholesalerVerification(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.verificationsService.submitWholesalerVerification(
      req.user._id,
      file,
    );
  }

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(Role.REALTOR, Role.WHOLESALER)
  @ApiOperation({ summary: 'Get own verification status' })
  async getMyVerification(@Request() req: AuthenticatedRequest) {
    return this.verificationsService.getMyVerification(req.user._id);
  }
}
