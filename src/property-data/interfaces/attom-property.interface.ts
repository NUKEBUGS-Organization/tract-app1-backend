// Typing for ATTOM's property/expandedprofile response — field names were
// verified against a live response (2026-07-08), not guessed from docs.
// `unitsCount` is the one exception — not present on the single-family
// sample we tested against, so its casing is inferred, not confirmed.
export interface AttomPropertyResponse {
  status?: {
    code?: number;
    msg?: string;
    total?: number;
  };
  property?: AttomProperty[];
}

export interface AttomProperty {
  identifier?: {
    apn?: string;
    fips?: string;
    attomId?: number;
  };
  address?: {
    oneLine?: string;
    line1?: string;
    line2?: string;
    locality?: string;
    countrySubd?: string; // state
    postal1?: string; // zip
    country?: string;
  };
  location?: {
    latitude?: string;
    longitude?: string;
  };
  summary?: {
    propType?: string; // e.g. "SFR"
    propertyType?: string; // e.g. "SINGLE FAMILY RESIDENCE"
    propSubType?: string;
    propClass?: string;
    propLandUse?: string;
    yearBuilt?: number;
    unitsCount?: number; // unverified casing — not present on SFH sample
  };
  lot?: {
    lotSize1?: number; // acres
    lotSize2?: number; // sqft
    zoningType?: string;
  };
  building?: {
    size?: {
      universalSize?: number;
      livingSize?: number;
      grossSize?: number;
    };
    rooms?: {
      beds?: number;
      bathsTotal?: number;
      bathsFull?: number;
    };
  };
  assessment?: {
    assessed?: {
      assdTtlValue?: number;
    };
    market?: {
      mktTtlValue?: number;
    };
    tax?: {
      taxAmt?: number;
      taxYear?: number;
    };
  };
  // Not present on the expandedprofile tier we tested — kept as a fallback
  // in case a different ATTOM plan/endpoint includes it.
  avm?: {
    amount?: {
      value?: number;
    };
  };
  sale?: {
    amount?: {
      saleAmt?: number;
    };
    saleSearchDate?: string;
  };
}
