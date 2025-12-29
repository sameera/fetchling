/**
 * Raw CRUD operations factory.
 *
 * This module creates promise-based operations for direct resource manipulation
 * with local-first SWR (Stale-While-Revalidate) behavior.
 */

import type { Table } from "dexie";

import { ApiError, apiRequest } from "../api";
import type { EntityNormalizer } from "../core/entity-normalizer";
import { buildDexieKey } from "../core/id-utils";
import type { URLBuilder } from "../core/url-builder";
import type { FlattenRefs, ListParams, ResourceOperations } from "../types";
import { filterEntities } from "../utils/filter-matcher";

/**
 * Configuration for creating resource operations.
 */
export interface OperationsConfig<T, ID> {
    /** Resource name (for logging) */
    name: string;
    /** Base URL for API endpoints */
    baseUrl: string;
    /** Optional array of key field names for composite keys */
    keyFields?: string[];
    /** Function to get the Dexie table (lazy) */
    getTable: () => Table<T, ID>;
    /** Entity normalizer for Dexie storage */
    normalizer: EntityNormalizer<T>;
    /** URL builder for API requests */
    urlBuilder: URLBuilder<T, ID>;
}

/**
 * Creates raw CRUD operations for a resource.
 *
 * All operations follow the SWR (Stale-While-Revalidate) pattern:
 * 1. Check Dexie cache first (instant response)
 * 2. Fire network request in background
 * 3. Update Dexie with fresh data
 * 4. Return fresh data (or cached if network fails)
 *
 * @param config - Operations configuration
 * @returns Resource operations (getById, list, create, update, remove)
 *
 * @example
 * ```ts
 * const operations = createOperations<User, string>({
 *   name: "users",
 *   baseUrl: "/v1/users",
 *   getTable: () => usersTable,
 *   normalizer: new EntityNormalizer(),
 *   urlBuilder: new URLBuilder("/v1/users"),
 * });
 *
 * // Fetch user (checks cache first, then network)
 * const user = await operations.getById("123");
 *
 * // Create user
 * const newUser = await operations.create({ name: "John", email: "john@example.com" });
 * ```
 */
export function createOperations<T, ID>(
    config: OperationsConfig<T, ID>
): ResourceOperations<T, ID> {
    const { name, baseUrl, keyFields, getTable, normalizer, urlBuilder } =
        config;

    return {
        /**
         * Fetches a single item by ID.
         * First checks Dexie, then fetches from network and updates cache.
         */
        getById: async (id: ID): Promise<T | null> => {
            const tbl = getTable();
            // Try Dexie first for instant response
            const cached = await tbl.get(id);

            // Fetch from network in background
            const networkPromise = apiRequest<{ data: T }>(
                urlBuilder.buildIdUrl(id)
            )
                .then(async ({ data }) => {
                    await tbl.put(normalizer.normalize(data));
                    return data;
                })
                .catch((err) => {
                    const isNotFound =
                        err instanceof ApiError && err.status === 404;
                    if (!isNotFound) {
                        console.error(
                            `[Query] Failed to fetch ${name} by ID: `,
                            err
                        );
                    }
                    return null;
                });

            // Return cached if available, otherwise wait for network
            return cached ?? (await networkPromise);
        },

        /**
         * Fetches a list of items with optional query parameters.
         * First checks Dexie, then fetches from network and updates cache.
         */
        list: async (params?: ListParams): Promise<T[]> => {
            const tbl = getTable();
            // Try Dexie first for instant response
            const allCached = await tbl.toArray();
            // Apply client-side filtering to cached data
            const cached = filterEntities(allCached, params);

            // Fetch from network in background
            const url = urlBuilder.buildUrl(baseUrl, params);
            const networkPromise = apiRequest<{ data: T[] }>(url)
                .then(async ({ data }) => {
                    // Update Dexie with fresh data
                    await tbl.bulkPut(normalizer.normalizeMany(data));
                    return data;
                })
                .catch((err) => {
                    console.error(
                        `[Query] Failed to fetch ${name} list: `,
                        err
                    );
                    return [];
                });

            // Return filtered cached data if available, otherwise wait for network
            return cached.length > 0 ? cached : await networkPromise;
        },

        /**
         * Creates a new item.
         * Optimistically adds to Dexie, then syncs with server.
         */
        create: async (data: FlattenRefs<Omit<T, keyof ID>>): Promise<T> => {
            const { data: created } = await apiRequest<{ data: T }>(baseUrl, {
                method: "POST",
                body: JSON.stringify(data),
            });

            // Add to Dexie
            const tbl = getTable();
            await tbl.put(normalizer.normalize(created));

            return created;
        },

        /**
         * Updates an existing item.
         * Optimistically updates Dexie, then syncs with server.
         */
        update: async (
            id: ID,
            data: Partial<Omit<T, keyof ID>>
        ): Promise<T> => {
            const { data: updated } = await apiRequest<{ data: T }>(
                urlBuilder.buildIdUrl(id),
                {
                    method: "PATCH",
                    body: JSON.stringify(data),
                }
            );

            // Update Dexie
            const tbl = getTable();
            await tbl.put(normalizer.normalize(updated));

            return updated;
        },

        /**
         * Deletes an item.
         * Optimistically removes from Dexie, then syncs with server.
         */
        remove: async (id: ID): Promise<void> => {
            await apiRequest<void>(urlBuilder.buildIdUrl(id), {
                method: "DELETE",
            });

            // Remove from Dexie
            const tbl = getTable();
            const keyToDelete = buildDexieKey(id, keyFields);
            await tbl.delete(keyToDelete as any);
        },
    };
}
