import { Injectable, NotFoundException } from '@nestjs/common';
import { PropertyLookupResult } from './interfaces/property-lookup-result.interface';
import { GooglePlacesService, ResolvedAddress } from './google-places.service';

// Google Places is the sole property-data provider. It resolves addresses
// only; parcel facts the previous ATTOM integration supplied have no Places
// equivalent and are entered manually on the listing form.
@Injectable()
export class PropertyDataService {
  constructor(private readonly googlePlacesService: GooglePlacesService) {}

  // Step 1 — typeahead as the seller types in the address field.
  async searchAddresses(query: string, sessionToken?: string) {
    return this.googlePlacesService.searchAddresses(query, sessionToken);
  }

  // Step 2 — seller picked one suggestion: resolve it to a structured address.
  async selectProperty(
    placeId: string,
    sessionToken?: string,
  ): Promise<PropertyLookupResult> {
    const resolved = await this.googlePlacesService.resolveAddress(
      placeId,
      sessionToken,
    );
    return this.toLookupResult(resolved);
  }

  // Direct lookup by a known address, with no preceding typeahead step.
  async lookupByAddress(
    address1: string,
    address2: string,
  ): Promise<PropertyLookupResult> {
    const full = [address1.trim(), address2.trim()].filter(Boolean).join(', ');
    const resolved = await this.googlePlacesService.findAddress(full);
    if (!resolved) {
      throw new NotFoundException(
        'No matching address was found. Please check the address or enter the details manually.',
      );
    }
    return this.toLookupResult(resolved);
  }

  private toLookupResult(resolved: ResolvedAddress): PropertyLookupResult {
    return {
      address: resolved.formatted_address,
      street_address: resolved.address1,
      city: resolved.city,
      state_code: resolved.stateCode,
      zip_code: resolved.zipCode,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      street_address_complete: resolved.streetAddressComplete !== false,
      source: 'google',
    };
  }
}
