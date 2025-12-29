/**
 * Query key generation for resource caching.
 *
 * This module creates hierarchical query keys for TanStack Query,
 * enabling efficient cache invalidation and management.
 */

import { serializeId } from "../core/id-utils";
import type { ListParams, QueryKeys } from "../types";

/**
 * Creates a query key factory for a resource.
 *
 * Query keys follow a hierarchical structure:
 * - `all`: `[name]` - Base key for all queries of this resource
 * - `lists()`: `[name, "list"]` - Key for all list queries
 * - `list(params)`: `[name, "list", params?]` - Key for specific list query
 * - `detail(id)`: `[name, "detail", serializedId]` - Key for single item query
 *
 * This structure enables efficient cache invalidation:
 * - Invalidate `all` to clear everything
 * - Invalidate `lists()` to clear all list queries
 * - Invalidate `list(params)` to clear specific list
 * - Invalidate `detail(id)` to clear single item
 *
 * @param name - The resource name
 * @param keyFields - Optional array of key field names for composite keys
 * @returns Query key factory with hierarchical keys
 *
 * @example
 * ```ts
 * const keys = createQueryKeys("users");
 * keys.all                    // ["users"]
 * keys.lists()                // ["users", "list"]
 * keys.list({ active: true }) // ["users", "list", { active: true }]
 * keys.detail("123")          // ["users", "detail", "123"]
 *
 * // Composite key example
 * const tagKeys = createQueryKeys("tags", ["space", "name"]);
 * tagKeys.detail({ space: "s1", name: "urgent" })
 * // ["tags", "detail", '{"space":"s1","name":"urgent"}']
 * ```
 */
export function createQueryKeys<T, ID>(
    name: string,
    keyFields?: string[]
): QueryKeys<T, ID> {
    return {
        /** Base key for all queries of this resource */
        all: [name] as const,

        /** Key for all list queries */
        lists: () => [name, "list"] as const,

        /** Key for a specific list query with params */
        list: (params?: ListParams) =>
            params
                ? ([name, "list", params] as const)
                : ([name, "list"] as const),

        /** Key for a detail/single item query */
        detail: (id: ID) => [name, "detail", serializeId(id, keyFields)] as const,
    };
}
