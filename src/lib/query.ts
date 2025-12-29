/**
 * Unified query cache class that manages resource configuration and database operations.
 *
 * This class provides a two-phase initialization system:
 * 1. Synchronously create resources and register their table configurations
 * 2. Asynchronously initialize all tables in a single batch operation
 *
 * Resources will lazy-load their tables from the cache when needed.
 */

import Dexie, { type Table } from "dexie";

import { TableRegistry } from "./core/table-registry";
import { createResourceAPI } from "./factories/resource-factory";
import type { ResourceAPI, ResourceConfig } from "./types";

/**
 * Unified query cache class that manages both resource configuration and database operations.
 * Extends Dexie to provide dynamic table registration for resources with local-first caching.
 *
 * This class combines the responsibilities of configuration storage (pending table registrations)
 * and database management (creating and accessing Dexie tables).
 *
 * @example
 * ```ts
 * const query = new Query();
 *
 * // Phase 1: Create resources (synchronous)
 * const spacesResource = query.createResource<Space>({
 *   name: "space",
 *   baseUrl: "/v1/spaces"
 * });
 *
 * const categoriesResource = query.createResource<Category>({
 *   name: "category",
 *   baseUrl: "/v1/categories"
 * });
 *
 * // Phase 2: Initialize database (asynchronous, batch operation)
 * await query.initialize();
 *
 * // Now resources are ready to use
 * const spaces = await spacesResource.list();
 * const { data } = spacesResource.useList();
 * ```
 */
export class Query extends Dexie {
    private registry: TableRegistry;

    constructor() {
        super("QuantumQueryDB");
        this.version(1).stores({
            // Initial empty schema - tables will be added dynamically
        });
        this.registry = new TableRegistry(this);
    }

    /**
     * Registers a resource's table configuration.
     * This is a synchronous operation - no database interaction happens here.
     * The table will be created when initialize() is called.
     *
     * @param name - The resource/table name
     * @param keyFields - Optional array of field names for composite primary key
     * @param baseUrl - The base URL for API requests
     */
    registerTable(
        name: string,
        keyFields: string[] | undefined,
        baseUrl: string
    ): void {
        this.registry.registerTable(name, keyFields, baseUrl);
    }

    /**
     * Initializes the database by creating all pending table registrations.
     *
     * This method should be called once after all resources have been created.
     * It performs a single batch database operation to create all tables efficiently.
     * Resources will lazy-load their tables from the cache when needed.
     *
     * @returns Promise that resolves when initialization is complete
     *
     * @example
     * ```ts
     * const query = new Query();
     *
     * const spacesResource = query.createResource<Space>({
     *   name: "space",
     *   baseUrl: "/v1/spaces"
     * });
     *
     * const categoriesResource = query.createResource<Category>({
     *   name: "category",
     *   baseUrl: "/v1/categories"
     * });
     *
     * // Initialize the database - resources will lazy-load tables
     * await query.initialize();
     * ```
     */
    async initialize(): Promise<void> {
        await this.registry.initializeAll();
    }

    /**
     * Checks if a table has been registered (either pending or created).
     */
    hasTable(name: string): boolean {
        return this.registry.hasTable(name);
    }

    /**
     * Gets the number of registered tables (pending + created).
     */
    get size(): number {
        return (
            this.registry.getPendingTables().size +
            this.registry.getRegisteredTables().length
        );
    }

    /**
     * Gets an existing table.
     * Returns undefined if the table hasn't been created yet.
     *
     * @param name - The resource name
     * @returns The Dexie table instance or undefined
     */
    getTable<T, ID = string>(name: string): Table<T, ID> | undefined {
        return this.registry.getTable<T, ID>(name);
    }

    /**
     * Lists all registered table names.
     */
    getRegisteredTables(): string[] {
        return this.registry.getRegisteredTables();
    }

    /**
     * Gets all pending table configurations.
     * Used internally by initialize() to create all tables at once.
     */
    getPendingTables() {
        return this.registry.getPendingTables();
    }

    /**
     * Creates a fully-featured resource API with local-first SWR behavior.
     *
     * This method generates:
     * - A Dexie table for local storage (initialized lazily)
     * - Query key factory for cache management
     * - Raw CRUD operations (promise-based)
     * - React hooks powered by TanStack Query
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
     * @returns Complete resource API with hooks and operations
     *
     * @example
     * ```ts
     * const query = new Query();
     *
     * const usersResource = query.createResource<User>({
     *   name: "users",
     *   baseUrl: "/api/users"
     * });
     *
     * const categoriesResource = query.createResource<Category>({
     *   name: "category",
     *   baseUrl: "/api/categories"
     * });
     *
     * // Later: await query.initialize();
     * ```
     */
    createResource<T, ID = string>(
        config: ResourceConfig<T, ID>
    ): ResourceAPI<T, ID> {
        const { name, baseUrl, keyFields } = config;

        // Register table configuration
        this.registerTable(name, keyFields, baseUrl);

        // Create and return complete resource API via factory
        return createResourceAPI(config, this.registry);
    }
}

/**
 * Shared query cache instance.
 * This is a singleton that will be used by all resources.
 */
export const query = new Query();
