/**
 * Resource factory that orchestrates creation of complete ResourceAPI.
 *
 * This module composes all the individual factories (operations, hooks, cache)
 * to create a fully-featured resource with local-first SWR behavior.
 */

import { EntityNormalizer } from "../core/entity-normalizer";
import { getEntityId } from "../core/id-utils";
import type { TableRegistry } from "../core/table-registry";
import { URLBuilder } from "../core/url-builder";
import type { ResourceAPI, ResourceConfig } from "../types";

import { createCacheOperations } from "./cache-factory";
import { createHooks } from "./hooks-factory";
import { createOperations } from "./operations-factory";
import { createQueryKeys } from "./query-keys-factory";

/**
 * Creates a complete resource API with local-first SWR behavior.
 *
 * This function orchestrates all the individual factories to create:
 * - A Dexie table for local storage (initialized lazily)
 * - Query key factory for cache management
 * - Raw CRUD operations (promise-based)
 * - React hooks powered by TanStack Query
 * - Cache seeding and clearing operations
 * - Automatic cache invalidation
 *
 * SWR (Stale-While-Revalidate) Pattern:
 * 1. Read stale data from Dexie (IndexedDB)
 * 2. Return immediately (near-zero latency)
 * 3. Fire network request in background
 * 4. Update Dexie with fresh data
 * 5. Update TanStack Query cache
 * 6. UI re-renders with fresh data
 *
 * @param config - Resource configuration (name, baseUrl, keyFields)
 * @param tableRegistry - The table registry for database access
 * @returns Complete resource API with hooks and operations
 *
 * @example
 * ```ts
 * const registry = new TableRegistry(db);
 *
 * const usersResource = createResourceAPI<User>({
 *   name: "users",
 *   baseUrl: "/api/users"
 * }, registry);
 *
 * const categoriesResource = createResourceAPI<Category>({
 *   name: "category",
 *   baseUrl: "/api/categories"
 * }, registry);
 *
 * // Later: await registry.initializeAll();
 * ```
 */
export function createResourceAPI<T, ID = string>(
    config: ResourceConfig<T, ID>,
    tableRegistry: TableRegistry
): ResourceAPI<T, ID> {
    const { name, baseUrl, keyFields } = config;

    /**
     * Helper to get the table from the registry, throwing a helpful error if not initialized.
     * This lazy-loads the table from TableRegistry on first access.
     * Ensures operations fail fast if registry.initializeAll() wasn't called.
     */
    const getTable = () => {
        const table = tableRegistry.getTable<T, ID>(name);
        if (!table) {
            throw new Error(
                `Resource "${name}" is not initialized. ` +
                    `You must call query.initialize() before using resource operations. ` +
                    `Example: await query.initialize();`
            );
        }
        return table;
    };

    // Create utilities
    const normalizer = new EntityNormalizer<T>(keyFields);
    const urlBuilder = new URLBuilder<T, ID>(baseUrl, keyFields);

    // Create query keys
    const queryKeys = createQueryKeys<T, ID>(name, keyFields);

    // Create operations
    const operations = createOperations<T, ID>({
        name,
        baseUrl,
        keyFields,
        getTable,
        normalizer,
        urlBuilder,
    });

    // Create hooks
    const hooks = createHooks<T, ID>({
        name,
        baseUrl,
        keyFields,
        getTable,
        normalizer,
        urlBuilder,
        queryKeys,
        operations,
    });

    // Create cache operations
    const cacheOps = createCacheOperations<T, ID>(
        { getTable, normalizer, queryKeys },
        (entity) => getEntityId(entity, keyFields)
    );

    // Return complete API
    return {
        name,
        get table() {
            return getTable();
        },
        queryKeys,
        ...operations,
        ...hooks,
        ...cacheOps,
    };
}
