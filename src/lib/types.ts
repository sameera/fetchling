import type {
    UseMutationResult,
    UseQueryOptions,
    UseQueryResult,
} from "@tanstack/react-query";
import type { Table } from "dexie";

/**
 * Supported key types for resources.
 * Can be a simple primitive or a composite key object.
 */
export type KeyValue = string | number | Record<string, string | number>;

/**
 * Base entity type that can use either simple or composite keys.
 *
 * For simple keys (default):
 * ```ts
 * interface User extends BaseEntity<string> {
 *   id: string;
 *   name: string;
 * }
 * ```
 *
 * For composite keys:
 * ```ts
 * interface Tag extends BaseEntity<{ spaceId: string; tagName: string }> {
 *   spaceId: string;
 *   tagName: string;
 *   // Note: no 'id' field needed
 * }
 * ```
 */
export type BaseEntity<ID = string> = ID extends Record<string, any>
    ? Record<string, any> // Composite key - no specific id field required
    : { id: ID }; // Simple key - id field required

/**
 * Configuration for creating a resource.
 */
export interface ResourceConfig<T, ID = string> {
    /** Unique name for the resource (used for table name and query keys) */
    name: string;
    /** Base URL for REST API endpoints (e.g., "/api/users") */
    baseUrl: string;
    /**
     * Optional: Specify fields that form the composite primary key.
     * If not provided, defaults to using "id" field.
     *
     * @example
     * ```ts
     * // Composite key example
     * {
     *   name: "tags",
     *   baseUrl: "/v1/tags",
     *   keyFields: ["spaceId", "tagName"]
     * }
     * // Results in URLs like: /v1/tags/{spaceId}/{tagName}
     * ```
     */
    keyFields?: Array<keyof T & string>;
}

/**
 * Query parameters for list operations.
 */
export type ListParams = Record<
    string,
    string | number | boolean | string[] | undefined
>;

/**
 * Query key factory for a resource.
 */
export interface QueryKeys<T, ID = string> {
    /** Base key for all queries of this resource */
    all: readonly [string];
    /** Key for all list queries */
    lists: () => readonly [string, string];
    /** Key for a specific list query with params */
    list: (params?: ListParams) => readonly [string, string, ListParams?];
    /** Key for a detail/single item query */
    detail: (id: ID) => readonly [string, string, string | ID];
}

/**
 * Raw CRUD operations (promise-based, for direct use).
 */
export interface ResourceOperations<T, ID = string> {
    /** Fetch a single item by ID */
    getById: (id: ID) => Promise<T | null>;
    /** Fetch a list of items with optional params */
    list: (params?: ListParams) => Promise<T[]>;
    /** Create a new item */
    create: (data: FlattenRefs<Omit<T, keyof ID>>) => Promise<T>;
    /** Update an existing item */
    update: (id: ID, data: Partial<Omit<T, keyof ID>>) => Promise<T>;
    /** Delete an item */
    remove: (id: ID) => Promise<void>;
}

/**
 * Cache management operations.
 */
export interface CacheOperations<T> {
    /** Seed a single item into both Dexie and React Query cache */
    seedOne: (item: T) => Promise<void>;
    /** Seed multiple items into both Dexie and React Query cache */
    seedMany: (items: T[], params?: ListParams) => Promise<void>;
    /** Clear all cached data for this resource */
    clearCache: () => Promise<void>;
}

/**
 * React hooks for resource operations.
 */
export interface ResourceHooks<T, ID = string> {
    /**
     * Hook to fetch a single item by ID (with SWR behavior).
     *
     * @param id - The resource ID (query disabled if undefined)
     * @param options - Optional TanStack Query options (enabled, staleTime, etc.)
     *
     * **Auto-enabling:** If options.enabled is not provided, the query is automatically
     * enabled only when `id !== undefined`.
     *
     * @example
     * ```tsx
     * // Basic usage - auto-enabled when userId is defined
     * const { data: user } = users.useGetById(userId);
     *
     * // With explicit control
     * const { data: user } = users.useGetById(userId, {
     *   enabled: userId !== undefined && canFetchUser,
     *   staleTime: 5000
     * });
     *
     * // Force disable even when ID is available
     * const { data: user } = users.useGetById(userId, { enabled: false });
     * ```
     */
    useGetById: (
        id: ID | undefined,
        options?: Partial<
            Omit<UseQueryOptions<T | undefined, Error>, "queryKey" | "queryFn">
        >
    ) => UseQueryResult<T | undefined>;

    /**
     * Hook to fetch a list of items (with SWR behavior).
     *
     * @param params - Optional query parameters for filtering/pagination
     * @param options - Optional TanStack Query options (enabled, staleTime, etc.)
     *
     * **Auto-enabling:** If options.enabled is not provided, the query is automatically
     * enabled only when ALL required params are defined (non-undefined).
     *
     * @example
     * ```tsx
     * // Basic usage - auto-enabled when all params are defined
     * const { data: notes } = blocks.useList({ space: spaceId, type: blockType });
     *
     * // With explicit control
     * const { data: notes } = blocks.useList(
     *   { space: spaceId, type: blockType },
     *   { enabled: spaceId && blockType && userIsReady, staleTime: 10000 }
     * );
     *
     * // Always enabled (even with undefined params)
     * const { data: allBlocks } = blocks.useList(undefined, { enabled: true });
     * ```
     */
    useList: (
        params?: ListParams,
        options?: Partial<
            Omit<UseQueryOptions<T[], Error>, "queryKey" | "queryFn">
        >
    ) => UseQueryResult<T[]>;

    /** Hook for creating items */
    useCreate: () => UseMutationResult<T, Error, Omit<T, keyof ID>>;
    /** Hook for updating items */
    useUpdate: () => UseMutationResult<
        T,
        Error,
        { id: ID; data: Partial<Omit<T, keyof ID>> }
    >;
    /** Hook for deleting items */
    useDelete: () => UseMutationResult<void, Error, ID>;
}

/**
 * Complete resource API returned by createResource().
 */
export interface ResourceAPI<T, ID = string>
    extends ResourceOperations<T, ID>,
        ResourceHooks<T, ID>,
        CacheOperations<T> {
    /** Resource name */
    name: string;
    /** Dexie table for local storage (throws if not initialized) */
    table: Table<T, ID>;
    /** Query key factory */
    queryKeys: QueryKeys<T, ID>;
}

/**
 * Extracts a reference shape `{ id: T }` from any object type that contains an `id` field.
 *
 * @example
 *   RefOnly<{ id: string; name: string }>
 *   // => { id: string }
 *
 *   RefOnly<{ name: string }>
 *   // => never  (no id field present)
 */
type RefOnly<T> = T extends { id: infer I } ? { id: I } : never;

/**
 * Shallowly flattens properties of an object:
 * - If a property is an object type containing an `id` field, it becomes `{ id: ... }`.
 * - All other properties remain unchanged.
 *
 * This does *not* recurse into nested objects; only the top-level fields are simplified.
 *
 * @example
 *   interface Tag {
 *     name: string;
 *     space: { id: string; name: string };
 *     createdBy: { id: number; email: string };
 *   }
 *
 *   type Flat = FlattenRefs<Tag>;
 *
 *   // Result:
 *   // {
 *   //   name: string;
 *   //   space: { id: string };
 *   //   createdBy: { id: number };
 *   // }
 */
export type FlattenRefs<T> = {
    [K in keyof T]: RefOnly<T[K]> extends never ? T[K] : RefOnly<T[K]>;
};

/**
 * Deep version of FlattenRefs:
 * Recursively simplifies all nested properties whose types contain an `id` field.
 *
 * Rules:
 *  - If a property is an object with an `id`, it is replaced with `{ id: ... }`.
 *  - If a property is an array, the element type is processed recursively.
 *  - If a property is a plain object without an `id`, its fields are recursively processed.
 *  - Primitive properties are returned unchanged.
 *
 * @example
 *   interface Tag {
 *     name: string;
 *     space: {
 *       id: string;
 *       owner: { id: number; fullName: string };
 *     };
 *     children: Array<{ id: string; label: string }>;
 *   }
 *
 *   type DeepFlat = DeepFlattenRefs<Tag>;
 *
 *   // Result:
 *   // {
 *   //   name: string;
 *   //   space: { id: string };                 // full object collapsed
 *   //   children: Array<{ id: string }>;       // array elements collapsed
 *   // }
 */
export type DeepFlattenRefs<T> =
    // If T is an array → process the element type
    T extends Array<infer U>
        ? Array<DeepFlattenRefs<U>>
        : // If T is an object with id → collapse to { id }
        T extends { id: infer I }
        ? { id: I }
        : // If T is a non-function object → recursively process fields
        T extends object
        ? { [K in keyof T]: DeepFlattenRefs<T[K]> }
        : // Otherwise (primitive values) → leave unchanged
          T;
