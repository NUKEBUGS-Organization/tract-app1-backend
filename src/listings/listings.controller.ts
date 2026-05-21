import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/schemas/user.schema';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingQueryDto } from './dto/listing-query.dto';

@ApiTags('Listings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  // POST /listings — Seller creates draft listing
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({ summary: 'Create new property listing (Draft status)' })
  @ApiResponse({ status: 201, description: 'Listing created as draft' })
  createListing(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateListingDto,
  ) {
    return this.listingsService.createListing(req.user._id, dto);
  }

  // GET /listings — Public paginated stream (with filters)
  @Get()
  @ApiOperation({ summary: 'Fetch paginated property stream with filters' })
  @ApiResponse({ status: 200, description: 'Paginated listings returned' })
  getListings(@Query() query: ListingQueryDto) {
    return this.listingsService.getListings(query);
  }

  // GET /listings/dashboard — Seller dashboard
  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Get seller dashboard with all listings + bid summaries',
  })
  getSellerDashboard(@Request() req: AuthenticatedRequest) {
    return this.listingsService.getSellerDashboard(req.user._id);
  }

  // GET /listings/:id — Single listing details
  @Get(':id')
  @ApiOperation({ summary: 'Get single listing details' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Listing returned' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  getListingById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.listingsService.getListingById(id, req.user._id);
  }

  // PATCH /listings/:id — Update listing fields
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({ summary: 'Update listing fields (draft only)' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Listing updated' })
  updateListing(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.updateListing(id, req.user._id, dto);
  }

  // POST /listings/:id/submit — Submit for auto-live (triggers 1-hr job)
  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Submit listing for auto-live — triggers 1-hr job queue',
  })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({
    status: 200,
    description: 'Listing submitted, goes live in 1 hour',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required documents or invalid status',
  })
  submitListing(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.listingsService.submitListing(id, req.user._id);
  }

  // POST /listings/:id/documents — Upload to Document Vault (S3)
  @Post(':id/documents')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  @ApiOperation({ summary: 'Upload multiple documents to Document Vault (S3)' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { 
          type: 'array', 
          items: { type: 'string', format: 'binary' }
        },
        document_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'survey',
              'tax_bill',
              'property_picture',
              'loi',
              'proof_of_funds',
              'other',
            ],
          },
        },
      },
    },
  })
  async uploadDocuments(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('document_types') documentTypes: string | string[],
  ) {
    // Handle both single string and array
    const typesArray = Array.isArray(documentTypes) 
      ? documentTypes 
      : documentTypes ? [documentTypes] : [];
  
    return this.listingsService.uploadDocuments(
      id,
      req.user._id,
      files,
      typesArray,
    );
  }

  // GET /listings/:id/documents — Retrieve signed URLs
  @Get(':id/documents')
  @ApiOperation({ summary: 'Retrieve signed URLs for listing documents' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Signed document URLs returned' })
  getDocuments(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.listingsService.getDocuments(id, req.user._id);
  }

  // DELETE /listings/:id — Seller withdraws listing (before bids placed)
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({ summary: 'Seller withdraws listing (before bids placed)' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Listing withdrawn' })
  @ApiResponse({
    status: 400,
    description: 'Bids already placed — cannot withdraw',
  })
  withdrawListing(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.listingsService.withdrawListing(id, req.user._id);
  }
}
