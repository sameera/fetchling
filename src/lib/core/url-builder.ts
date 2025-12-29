/**
 * URL construction utilities for resource operations.
 *
 * This module handles building URLs from IDs, base URLs, and query parameters,
 * with support for both simple and composite keys.
 */

import type { ListParams } from "../types";

import { extractPrimitiveValue } from "./id-utils";

type Any = { [key: string]: unknown };

/**
 * Builds URLs for resource operations.
 *
 * Handles URL construction for both simple IDs (e.g., "/users/123")
 * and composite keys (e.g., "/tags/s1/urgent").
 *
 * @example
 * ```ts
 * // Simple key
 * const builder = new URLBuilder("/v1/users");
 * builder.buildIdUrl("123");
 * // => "/v1/users/123"
 *
 * // Composite key
 * const tagBuilder = new URLBuilder("/v1/tags", ["space", "name"]);
 * tagBuilder.buildIdUrl({ space: { id: "s1" }, name: "urgent" });
 * // => "/v1/tags/s1/urgent"
 *
 * // With query params
 * tagBuilder.buildUrl("/v1/tags", { limit: 10, offset: 0 });
 * // => "/v1/tags?limit=10&offset=0"
 * ```
 */
export class URLBuilder<T, ID> {
    private baseUrl: string;
    private keyFields?: string[];

    /**
     * Creates a new URLBuilder.
     *
     * @param baseUrl - The base URL for the resource (e.g., "/v1/users")
     * @param keyFields - Optional array of key field names for composite keys
     */
    constructor(baseUrl: string, keyFields?: string[]) {
        this.baseUrl = baseUrl;
        this.keyFields = keyFields;
    }

    /**
     * Builds a URL for a specific ID.
     *
     * For simple keys, appends the ID directly.
     * For composite keys, builds a path from key field values in order.
     *
     * @param id - The ID to build URL for (simple value or composite object)
     * @returns The full URL path
     *
     * @example
     * ```ts
     * // Simple key
     * buildIdUrl("123")
     * // => "/v1/users/123"
     *
     * // Composite key
     * buildIdUrl({ space: "s1", name: "urgent" })
     * // => "/v1/tags/s1/urgent"
     * ```
     */
    buildIdUrl(id: ID): string {
        if (
            this.keyFields &&
            this.keyFields.length > 0 &&
            typeof id === "object"
        ) {
            // Composite key: build path from key fields
            const keyValues = this.keyFields.map((field) => {
                const value = (id as Any)[field];
                return extractPrimitiveValue(value);
            });
            return `${this.baseUrl}/${keyValues.join("/")}`;
        }
        // Simple key: append directly
        return `${this.baseUrl}/${id}`;
    }

    /**
     * Builds a URL with query parameters.
     *
     * @param path - The base path
     * @param params - Optional query parameters
     * @returns The full URL with query string
     *
     * @example
     * ```ts
     * buildUrl("/v1/users", { limit: 10, offset: 0, active: true })
     * // => "/v1/users?limit=10&offset=0&active=true"
     *
     * buildUrl("/v1/users")
     * // => "/v1/users"
     * ```
     */
    buildUrl(path: string, params?: ListParams): string {
        const url = new URL(path, "http://_");
        let arrayParms = "";

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value && Array.isArray(value)) {
                    arrayParms += `&${key}=${value
                        .map((v) => encodeURIComponent(v))
                        .join(",")}`;
                } else if (value !== undefined) {
                    url.searchParams.append(key, String(value));
                }
            });
        }
        return url.pathname + url.search + arrayParms + url.hash;
    }
}
