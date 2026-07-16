import { PropertyType } from '../../listings/schemas/listing.schema';

// Shape returned to the frontend to prefill the create-listing form.
// Fields mirror CreateListingDto 1:1 where ATTOM provides an equivalent;
// the rest are bonus context the form can optionally surface.
export interface PropertyLookupResult {
  // ── Maps directly onto CreateListingDto fields ──────────────────────────
  address: string;
  zip_code: string | null;
  state_code: string | null;
  year_built: number | null;
  property_type: PropertyType | null;
  zoning: string | null;
  unit_count: number | null;
  suggested_price: number | null;

  // ── Extra context, not on the Listing schema today but useful to show ──
  bedrooms: number | null;
  bathrooms: number | null;
  square_footage: number | null;
  lot_size_acres: number | null;
  latitude: number | null;
  longitude: number | null;
  county_fips: string | null;
  apn: string | null;
  last_sale_price: number | null;
  last_sale_date: string | null;

  source: 'attom';
}
