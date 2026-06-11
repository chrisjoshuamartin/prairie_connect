import { postgresSearchProvider } from "./postgres";
import type { SearchProvider } from "./provider";

export * from "./provider";

/** Active provider — swap for Algolia/OpenSearch here when the time comes. */
export const searchProvider: SearchProvider = postgresSearchProvider;
