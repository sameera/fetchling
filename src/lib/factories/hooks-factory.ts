/**
 * React hooks factory for resource operations.
 *
 * This module creates TanStack Query-powered hooks with automatic
 * cache invalidation and SWR behavior.
 */

import {
    useMutation,
    useQuery,
    useQueryClient,
    UseQueryOptions,
} from "@tanstack/react-query";
import type { Table } from "dexie";

import type { EntityNormalizer } from "../core/entity-normalizer";
import type { URLBuilder } from "../core/url-builder";
import type {
    ListParams,
    QueryKeys,
    ResourceHooks,
    ResourceOperations,
} from "../types";
/**
 * Helper: Determines if all values in params object are defined.
 * Used for auto-enabling list queries.
 */
function hasAllParamsDefined(params?: ListParams): boolean {
    if (!params) return true; // No params = always enabled
    return Object.values(params).every((value) => value !== undefined);
}

/**
 * Configuration for creating resource hooks.
 */
export interface HooksConfig<T, ID> {
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
    /** Query key factory for cache management */
    queryKeys: QueryKeys<T, ID>;
    /** Resource operations (for delegation) */
    operations: ResourceOperations<T, ID>;
}

/**
 * Creates React hooks for a resource.
 *
 * All query hooks follow the SWR (Stale-While-Revalidate) pattern:
 * 1. Read from Dexie immediately (instant response)
 * 2. Fire network request in background
 * 3. Update Dexie with fresh data
 * 4. TanStack Query triggers re-render with fresh data
 *
 * All mutation hooks automatically invalidate related queries.
 *
 * @param config - Hooks configuration
 * @returns Resource hooks (useGetById, useList, useCreate, useUpdate, useDelete)
 *
 * @example
 * ```tsx
 * const hooks = createHooks<User, string>({
 *   name: "users",
 *   baseUrl: "/v1/users",
 *   getTable: () => usersTable,
 *   normalizer: new EntityNormalizer(),
 *   urlBuilder: new URLBuilder("/v1/users"),
 *   queryKeys: createQueryKeys("users"),
 * });
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const { data: user, isLoading } = hooks.useGetById(userId);
 *   const { mutate: updateUser } = hooks.useUpdate();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (!user) return <div>User not found</div>;
 *
 *   return (
 *     <div>
 *       <h1>{user.name}</h1>
 *       <button onClick={() => updateUser({ id: userId, data: { name: "New Name" } })}>
 *         Update Name
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function createHooks<T, ID>(
    config: HooksConfig<T, ID>
): ResourceHooks<T, ID> {
    const { queryKeys, operations } = config;

    return {
        /**
         * Hook to fetch a single item by ID with SWR behavior.
         *
         * Reads from Dexie immediately, then fetches from network.
         * Automatically updates when network request completes.
         *
         * **Auto-enabling:** Query is automatically enabled when id !== undefined,
         * unless explicitly overridden via options.enabled.
         */
        useGetById: (
            id: ID | undefined,
            options?: Partial<
                Omit<
                    UseQueryOptions<T | undefined, Error>,
                    "queryKey" | "queryFn"
                >
            >
        ) => {
            // Determine if query should be enabled
            const shouldEnable =
                options?.enabled !== undefined
                    ? options.enabled
                    : id !== undefined;

            return useQuery({
                queryKey:
                    id !== undefined ? queryKeys.detail(id) : ["disabled"],
                queryFn: async () => {
                    if (id === undefined) return undefined;
                    const result = await operations.getById(id);
                    return result ?? undefined;
                },
                // Return cached data immediately while fetching
                staleTime: 0,
                refetchOnMount: true,
                // Spread user options (allows overriding staleTime, refetchOnMount, etc.)
                ...options,
                // Apply enabled after spread to ensure it takes precedence
                enabled: shouldEnable,
            });
        },

        /**
         * Hook to fetch a list of items with SWR behavior.
         *
         * Reads from Dexie immediately, then fetches from network.
         * Automatically updates when network request completes.
         *
         * **Auto-enabling:** Query is automatically enabled when ALL params are defined,
         * unless explicitly overridden via options.enabled.
         */
        useList: (
            params?: ListParams,
            options?: Partial<
                Omit<UseQueryOptions<T[], Error>, "queryKey" | "queryFn">
            >
        ) => {
            // Determine if query should be enabled
            const shouldEnable =
                options?.enabled !== undefined
                    ? options.enabled
                    : hasAllParamsDefined(params);

            return useQuery({
                // eslint-disable-next-line @tanstack/query/exhaustive-deps
                queryKey: queryKeys.list(params),
                queryFn: async () => {
                    return operations.list(params);
                },
                // Return cached data immediately while fetching
                staleTime: 0,
                refetchOnMount: true,
                // Spread user options (allows overriding staleTime, refetchOnMount, etc.)
                ...options,
                // Apply enabled after spread to ensure it takes precedence
                enabled: shouldEnable,
            });
        },

        /**
         * Hook for creating items.
         *
         * Automatically invalidates list queries after successful creation.
         */
        useCreate: () => {
            const queryClientHook = useQueryClient();

            return useMutation({
                mutationFn: async (data: Omit<T, keyof ID>) => {
                    return operations.create(data as any);
                },
                onSuccess: () => {
                    // Invalidate all list queries for this resource
                    queryClientHook.invalidateQueries({
                        queryKey: queryKeys.lists(),
                    });
                },
            });
        },

        /**
         * Hook for updating items.
         *
         * Automatically invalidates affected queries after successful update.
         */
        useUpdate: () => {
            const queryClientHook = useQueryClient();

            return useMutation({
                mutationFn: async ({
                    id,
                    data,
                }: {
                    id: ID;
                    data: Partial<Omit<T, keyof ID>>;
                }) => {
                    return operations.update(id, data);
                },
                onSuccess: (_, { id }) => {
                    // Invalidate detail query for this item
                    queryClientHook.invalidateQueries({
                        queryKey: queryKeys.detail(id),
                    });
                    // Invalidate all list queries
                    queryClientHook.invalidateQueries({
                        queryKey: queryKeys.lists(),
                    });
                },
            });
        },

        /**
         * Hook for deleting items.
         *
         * Automatically invalidates affected queries after successful deletion.
         */
        useDelete: () => {
            const queryClientHook = useQueryClient();

            return useMutation({
                mutationFn: async (id: ID) => {
                    return operations.remove(id);
                },
                onSuccess: (_, id) => {
                    // Invalidate detail query for this item
                    queryClientHook.invalidateQueries({
                        queryKey: queryKeys.detail(id),
                    });
                    // Invalidate all list queries
                    queryClientHook.invalidateQueries({
                        queryKey: queryKeys.lists(),
                    });
                },
            });
        },
    };
}
