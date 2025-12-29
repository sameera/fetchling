/**
 * Table registration and Dexie database initialization.
 *
 * This module manages the lifecycle of table registration and batch database
 * initialization for optimal performance.
 */

import Dexie, { type Table } from "dexie";

/**
 * Configuration for a registered table.
 */
export interface TableConfig {
    /** Optional array of field names for composite primary key */
    keyFields?: string[];
    /** Base URL for API requests */
    baseUrl: string;
}

/**
 * Manages table registration and Dexie database initialization.
 *
 * This class provides a two-phase registration system:
 * 1. Synchronously register table configurations
 * 2. Batch initialize all tables in a single database version increment
 *
 * This approach is more efficient than creating tables one at a time.
 *
 * @example
 * ```ts
 * const db = new Dexie("MyDB");
 * db.version(1).stores({});
 *
 * const registry = new TableRegistry(db);
 *
 * // Phase 1: Register tables (synchronous)
 * registry.registerTable("users", undefined, "/v1/users");
 * registry.registerTable("tags", ["space", "name"], "/v1/tags");
 *
 * // Phase 2: Initialize all at once (async)
 * await registry.initializeAll();
 *
 * // Now tables are ready
 * const usersTable = registry.getTable("users");
 * ```
 */
export class TableRegistry {
    private db: Dexie;
    private registeredTables = new Set<string>();
    private registrationQueue: Promise<void> = Promise.resolve();
    private pendingTables = new Map<string, TableConfig>();

    /**
     * Creates a new TableRegistry.
     *
     * @param db - The Dexie database instance
     */
    constructor(db: Dexie) {
        this.db = db;
    }

    /**
     * Registers a table configuration.
     *
     * This is a synchronous operation - no database interaction happens here.
     * The table will be created when initializeAll() is called.
     *
     * @param name - The table name
     * @param keyFields - Optional array of field names for composite primary key
     * @param baseUrl - The base URL for API requests
     * @throws {Error} If a table with the same name is already registered
     *
     * @example
     * ```ts
     * // Simple key (uses "id" field)
     * registry.registerTable("users", undefined, "/v1/users");
     *
     * // Composite key (uses "space" and "name" fields)
     * registry.registerTable("tags", ["space", "name"], "/v1/tags");
     * ```
     */
    registerTable(name: string, keyFields?: string[], baseUrl?: string): void {
        if (this.pendingTables.has(name) || this.registeredTables.has(name)) {
            throw new Error(
                `Resource "${name}" is already registered in this Query. ` +
                    `Each resource can only be registered once.`
            );
        }

        this.pendingTables.set(name, { keyFields, baseUrl: baseUrl || "" });
    }

    /**
     * Checks if a table has been registered (either pending or created).
     *
     * @param name - The table name
     * @returns True if the table is registered
     */
    hasTable(name: string): boolean {
        return this.pendingTables.has(name) || this.registeredTables.has(name);
    }

    /**
     * Gets all pending table configurations.
     *
     * @returns Map of table names to their configurations
     */
    getPendingTables(): Map<string, TableConfig> {
        return new Map(this.pendingTables);
    }

    /**
     * Initializes the database by creating all pending table registrations.
     *
     * This method performs a single batch database operation to create all tables
     * efficiently. After initialization, pending tables are cleared.
     *
     * @returns Promise that resolves when initialization is complete
     *
     * @example
     * ```ts
     * registry.registerTable("users", undefined, "/v1/users");
     * registry.registerTable("tags", ["space", "name"], "/v1/tags");
     *
     * await registry.initializeAll();
     * // All tables are now created and ready to use
     * ```
     */
    async initializeAll(): Promise<void> {
        if (this.pendingTables.size === 0) {
            // No tables to register
            return;
        }

        // Create a map of table names to key fields for batch registration
        const tablesToRegister = new Map<string, string[] | undefined>();
        for (const [name, { keyFields }] of this.pendingTables.entries()) {
            tablesToRegister.set(name, keyFields);
        }

        // Register all tables in a single batch operation
        await this.createTables(tablesToRegister);

        // Clear pending tables after successful initialization
        this.pendingTables.clear();
    }

    /**
     * Gets an existing table.
     *
     * @param name - The table name
     * @returns The Dexie table instance or undefined if not initialized
     *
     * @example
     * ```ts
     * const usersTable = registry.getTable<User, string>("users");
     * if (usersTable) {
     *   const users = await usersTable.toArray();
     * }
     * ```
     */
    getTable<T, ID = string>(name: string): Table<T, ID> | undefined {
        if (!this.registeredTables.has(name)) {
            return undefined;
        }
        return this.db.table(name) as Table<T, ID>;
    }

    /**
     * Lists all registered table names.
     *
     * @returns Array of table names that have been initialized
     */
    getRegisteredTables(): string[] {
        return Array.from(this.registeredTables);
    }

    /**
     * Creates multiple tables at once in a single database version increment.
     *
     * This is more efficient than creating tables one at a time.
     * Operations are queued to ensure serial execution.
     *
     * @param tables - Map of table names to their key field configurations
     * @returns Promise that resolves when all tables are created
     *
     * @private
     */
    private async createTables(
        tables: Map<string, string[] | undefined>
    ): Promise<void> {
        if (tables.size === 0) {
            return;
        }

        // Queue the batch registration
        this.registrationQueue = this.registrationQueue.then(async () => {
            // Filter out already registered tables
            const newTables = new Map<string, string[] | undefined>();
            for (const [name, keyFields] of tables.entries()) {
                if (!this.registeredTables.has(name)) {
                    newTables.set(name, keyFields);
                }
            }

            if (newTables.size === 0) {
                // All tables already registered
                return;
            }

            // Close the database if it's open
            if (this.db.isOpen()) {
                this.db.close();
            }

            // Build the stores configuration for all new tables
            const stores: Record<string, string> = {};
            for (const [name, keyFields] of newTables.entries()) {
                const keySpec =
                    keyFields && keyFields.length > 0
                        ? `[${keyFields.join("+")}]` // Composite key
                        : "id"; // Simple key
                stores[name] = keySpec;
                this.registeredTables.add(name);
            }

            // Register all new tables in a single version increment
            const currentVersion = this.db.verno;
            this.db.version(currentVersion + 1).stores(stores);

            // Reopen the database
            await this.db.open();
        });

        // Wait for registration to complete
        await this.registrationQueue;
    }
}
