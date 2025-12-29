/**
 * Cache operations factory for resource seeding and clearing.
 *
 * This module creates operations for pre-populating and managing
 * both Dexie and TanStack Query caches.
 */

import type { Table } from "dexie";

import { queryClient } from "../../query-client";
import type { EntityNormalizer } from "../core/entity-normalizer";
import type { CacheOperations, ListParams, QueryKeys } from "../types";

/**
 * Configuration for creating cache operations.
 */
export interface CacheConfig<T, ID> {
    /** Function to get the Dexie table (lazy) */
    getTable: () => Table<T, ID>;
    /** Entity normalizer for Dexie storage */
    normalizer: EntityNormalizer<T>;
    /** Query key factory for cache management */
    queryKeys: QueryKeys<T, ID>;
}

/**
 * Creates cache operations for a resource.
 *
 * Cache operations allow pre-populating both Dexie (IndexedDB) and
 * TanStack Query caches with known data, avoiding unnecessary network requests.
 *
 * This is particularly useful for:
 * - App initialization data (e.g., /v1/init endpoint)
 * - Pre-loading related data
 * - Optimistic updates
 * - Testing and development
 *
 * @param config - Cache configuration
 * @param getEntityId - Function to extract ID from entity
 * @returns Cache operations (seedOne, seedMany, clearCache)
 *
 * @example
 * ```ts
 * const cacheOps = createCacheOperations<User, string>(
 *   {
 *     getTable: () => usersTable,
 *     normalizer: new EntityNormalizer(),
 *     queryKeys: createQueryKeys("users"),
 *   },
 *   (user) => user.id
 * );
 *
 * // Seed app initialization data
 * const initData = await fetch("/v1/init").then(r => r.json());
 * await cacheOps.seedMany(initData.users);
 *
 * // Now when components call useList(), they get instant data
 * const { data } = usersResource.useList(); // Instant!
 * ```
 */
export function createCacheOperations<T, ID>(
    config: CacheConfig<T, ID>,
    getEntityId: (entity: T) => ID
): CacheOperations<T> {
    const { getTable, normalizer, queryKeys } = config;

    return {
        /**
         * Seeds a single item into both Dexie and React Query cache.
         *
         * This is useful for pre-populating the cache with known data,
         * avoiding unnecessary network requests.
         *
         * @param item - The item to seed
         *
         * @example
         * ```ts
         * // Seed a single category from app initialization data
         * await categoriesResource.seedOne({
         *   id: "1",
         *   name: "Work",
         *   color: "#FF0000"
         * });
         * ```
         */
        seedOne: async (item: T): Promise<void> => {
            // Store in Dexie (normalized for composite keys)
            const tbl = getTable();
            await tbl.put(normalizer.normalize(item));

            // Update React Query cache for detail query (original entity with nested objects)
            const entityId = getEntityId(item);
            queryClient.setQueryData(queryKeys.detail(entityId), item);
        },

        /**
         * Seeds multiple items into both Dexie and React Query cache.
         *
         * This is useful for pre-populating the cache with data from
         * app initialization (e.g., /v1/init endpoint).
         *
         * @param items - Array of items to seed
         * @param params - Optional query params to associate with the list cache
         *
         * @example
         * ```ts
         * // Seed categories from app initialization
         * const initData = await fetch("/v1/init").then(r => r.json());
         * await categoriesResource.seedMany(initData.categories);
         *
         * // Now when components call useList(), they get instant data
         * const { data } = categoriesResource.useList(); // Instant!
         * ```
         */
        seedMany: async (items: T[], params?: ListParams): Promise<void> => {
            // Store in Dexie (normalized for composite keys)
            const tbl = getTable();
            await tbl.bulkPut(normalizer.normalizeMany(items));

            // Update React Query cache for list query (original entities with nested objects)
            queryClient.setQueryData(queryKeys.list(params), items);

            // Also seed individual detail queries
            items.forEach((item) => {
                const entityId = getEntityId(item);
                queryClient.setQueryData(queryKeys.detail(entityId), item);
            });
        },

        /**
         * Clears all cached data for this resource from both Dexie and React Query.
         *
         * @example
         * ```ts
         * // Clear all categories cache (e.g., on logout)
         * await categoriesResource.clearCache();
         * ```
         */
        clearCache: async (): Promise<void> => {
            // Clear Dexie
            const tbl = getTable();
            await tbl.clear();

            // Clear React Query cache
            queryClient.removeQueries({ queryKey: queryKeys.all });
        },
    };
}
