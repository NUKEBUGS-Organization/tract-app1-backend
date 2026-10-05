import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListingsService } from './listings.service';

// No JwtAuthGuard — backs the shareable public property page.
@ApiTags('Public Listings')
@Controller('public/listings')
export class PublicListingsController {
  constructor(private listingsService: ListingsService) {}

  // GET /public/listings/:id — Redacted live listing for share links
  @Get(':id')
  @ApiOperation({ summary: 'Get a live listing for public share links' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Public listing returned' })
  @ApiResponse({ status: 404, description: 'Listing not found or not live' })
  getPublicListing(@Param('id') id: string) {
    return this.listingsService.getPublicListing(id);
  }
}
