export type StoreSeed = {
    name: string;
    addressLine: string;
    city: string;
    district: string;
    lat: number;
    lng: number;
    phone?: string;
    openTime?: string;
    closeTime?: string;
    /** Previous seed names — keep existing store IDs when renaming. */
    legacyNames?: string[];
};
/** Canonical Bing Chun branches — names/addresses from bingchunsrilanka.lk, coordinates from Google Maps listings. */
export declare const BINGCHUN_STORES: StoreSeed[];
export declare function storeIdFromName(name: string): string;
export declare function storeIdCandidates(store: StoreSeed): string[];
/** All Bing Chun branches support delivery in the app. */
export declare function isDeliveryEnabledStore(_storeId: string): boolean;
//# sourceMappingURL=stores.d.ts.map