export type App2ListingStatusDto =
  | { status: 'marketing_pending' }
  | { status: 'listed'; listingId: string; listingStatus: string }
  | {
      status: 'under_contract';
      listingId: string;
      dealId: string;
      currentStep: string;
    }
  | {
      status: 'sold';
      listingId: string;
      dealId: string;
      closedAt: string | null;
    }
  | { status: 'cancelled'; listingId: string }
  | { status: 'unknown' };
