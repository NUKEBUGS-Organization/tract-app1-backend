// Shape returned to the frontend to prefill the create-listing form.
//
// Google Places is the only property-data provider. It resolves and
// normalizes an address; it does NOT return parcel facts (year built,
// property type, zoning, unit count, price). Sellers enter those manually.
export interface PropertyLookupResult {
  // Google's single-line rendering, e.g. "123 Main St, Austin, TX 78701, USA"
  address: string;
  street_address: string;
  city: string | null;
  state_code: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  // False when Places resolved a route without a house number.
  street_address_complete: boolean;

  source: 'google';
}
