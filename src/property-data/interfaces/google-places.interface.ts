// Typing for Google's legacy Place Autocomplete + Place Details JSON APIs.
// This response shape has been stable for years and is still fully
// supported (unlike ATTOM, this was not verified against a live call —
// no Google key was available — but the shape is long-documented and
// unchanged, unlike ATTOM's undocumented casing).
export interface GoogleAutocompleteResponse {
  status: string; // 'OK' | 'ZERO_RESULTS' | 'INVALID_REQUEST' | ...
  error_message?: string;
  predictions: GoogleAutocompletePrediction[];
}

export interface GoogleAutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

export interface GooglePlaceDetailsResponse {
  status: string;
  error_message?: string;
  result?: {
    formatted_address?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: {
      location?: { lat?: number; lng?: number };
    };
  };
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
