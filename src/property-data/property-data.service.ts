import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PropertyType } from '../listings/schemas/listing.schema';
import {
  AttomProperty,
  AttomPropertyResponse,
} from './interfaces/attom-property.interface';
import { PropertyLookupResult } from './interfaces/property-lookup-result.interface';
import { GooglePlacesService } from './google-places.service';

@Injectable()
export class PropertyDataService {
  private readonly logger = new Logger(PropertyDataService.name);
  private readonly client: AxiosInstance;
  private readonly propertyEndpoint: string;
  private readonly apiKeyConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly googlePlacesService: GooglePlacesService,
  ) {
    const baseURL =
      this.configService.get<string>('ATTOM_API_URL') ??
      'https://api.gateway.attomdata.com';
    // Read lazily rather than getOrThrow — an unconfigured key shouldn't
    // block the whole app from booting, only the lookup endpoint itself.
    const apiKey = this.configService.get<string>('ATTOM_API_KEY');
    this.apiKeyConfigured = !!apiKey;

    this.propertyEndpoint =
      this.configService.get<string>('ATTOM_PROPERTY_ENDPOINT') ??
      '/propertyapi/v1.0.0/property/expandedprofile';

    this.client = axios.create({
      baseURL,
      headers: {
        apikey: apiKey ?? '',
        Accept: 'application/json',
      },
    });
  }

  // Step 1 — typeahead as the seller types in the address field.
  async searchAddresses(query: string, sessionToken?: string) {
    return this.googlePlacesService.searchAddresses(query, sessionToken);
  }

  // Step 2 — seller picked one suggestion: resolve it to a structured
  // address via Google, then pull parcel data from ATTOM for prefill.
  async selectProperty(
    placeId: string,
    sessionToken?: string,
  ): Promise<PropertyLookupResult> {
    const resolved = await this.googlePlacesService.resolveAddress(
      placeId,
      sessionToken,
    );

    const result = await this.lookupByAddress(
      resolved.address1,
      resolved.address2,
    );

    // Google's geocode is more precise than ATTOM's for lat/lng and gives
    // us a clean formatted address even when ATTOM's oneLine differs.
    return {
      ...result,
      address: resolved.formatted_address,
      latitude: resolved.latitude ?? result.latitude,
      longitude: resolved.longitude ?? result.longitude,
    };
  }

  async lookupByAddress(
    address1: string,
    address2: string,
  ): Promise<PropertyLookupResult> {
    if (!this.apiKeyConfigured) {
      throw new InternalServerErrorException(
        'Property data lookup is not configured (missing ATTOM_API_KEY)',
      );
    }

    let data: AttomPropertyResponse;

    try {
      const response = await this.client.get<AttomPropertyResponse>(
        this.propertyEndpoint,
        { params: { address1, address2 } },
      );
      data = response.data;
    } catch (err) {
      this.logger.error(
        `ATTOM lookup failed for "${address1}, ${address2}": ${err.message}`,
        err.stack,
      );
      throw new BadGatewayException(
        'Property data lookup failed. Please enter the details manually.',
      );
    }

    const property = data.property?.[0];

    if (!property) {
      throw new NotFoundException('No property record found for that address');
    }

    return this.mapToLookupResult(address1, address2, property);
  }

  private mapToLookupResult(
    address1: string,
    address2: string,
    property: AttomProperty,
  ): PropertyLookupResult {
    return {
      address: property.address?.oneLine ?? `${address1}, ${address2}`,
      zip_code: property.address?.postal1 ?? null,
      state_code: property.address?.countrySubd ?? null,
      year_built: property.summary?.yearBuilt ?? null,
      property_type: this.mapPropertyType(
        property.summary?.propType ??
          property.summary?.propertyType ??
          property.summary?.propLandUse,
      ),
      zoning: property.lot?.zoningType ?? null,
      unit_count: property.summary?.unitsCount ?? null,
      suggested_price:
        property.avm?.amount?.value ??
        property.assessment?.market?.mktTtlValue ??
        null,

      bedrooms: property.building?.rooms?.beds ?? null,
      bathrooms: property.building?.rooms?.bathsTotal ?? null,
      square_footage:
        property.building?.size?.livingSize ??
        property.building?.size?.universalSize ??
        null,
      lot_size_acres: property.lot?.lotSize1 ?? null,
      latitude: property.location?.latitude
        ? Number(property.location.latitude)
        : null,
      longitude: property.location?.longitude
        ? Number(property.location.longitude)
        : null,
      county_fips: property.identifier?.fips ?? null,
      apn: property.identifier?.apn ?? null,
      last_sale_price: property.sale?.amount?.saleAmt ?? null,
      last_sale_date: property.sale?.saleSearchDate ?? null,

      source: 'attom',
    };
  }

  // Best-effort mapping — ATTOM's type strings vary by data source, so an
  // unrecognized value is left null rather than guessed, and the frontend
  // falls back to asking the user to pick a property type.
  private mapPropertyType(raw?: string): PropertyType | null {
    if (!raw) return null;
    const type = raw.toUpperCase();

    if (type.includes('VACANT') || type.includes('LAND')) {
      return PropertyType.LAND;
    }
    if (
      type.includes('DUPLEX') ||
      type.includes('TRIPLEX') ||
      type.includes('QUAD') ||
      type.includes('APARTMENT') ||
      type.includes('MULTI')
    ) {
      return PropertyType.MULTI_FAMILY;
    }
    if (
      type.includes('SFR') ||
      type.includes('SINGLE FAMILY') ||
      type.includes('RESIDENTIAL')
    ) {
      return PropertyType.SFH;
    }
    return null;
  }
}
