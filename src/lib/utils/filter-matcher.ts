import type { ListParams } from "../types";

// Following fields should not be used for filtering as they are special query params meant for the API.
const SPECIAL_PARAMS = new Set<string>(["sort", "fields"]);

/**
 * Checks if an entity matches all filter params.
 * Returns true only if ALL params match the entity's properties (AND logic).
 *
 * @param entity - The entity to check
 * @param params - The filter parameters
 * @returns true if the entity matches all params, false otherwise
 */
export function matchesFilter<T>(entity: T, params: ListParams): boolean {
    for (const [key, expectedValue] of Object.entries(params)) {
        if (expectedValue === undefined || SPECIAL_PARAMS.has(key)) {
            continue; // Skip undefined and special params
        }

        const actualValue = (entity as Record<string, unknown>)[key];

        // Handle array params (e.g., tags: ["urgent", "work"])
        if (Array.isArray(expectedValue)) {
            // Match if entity value is in the array
            if (!expectedValue.includes(actualValue as string)) {
                return false;
            }
        }
        // Handle object reference params (e.g., type: { id: "1234567" })
        else if (typeof actualValue === "object" && expectedValue !== null) {
            // Match if entity value is an object with matching properties
            const actualObj = actualValue as { id: string };
            if (String(actualObj.id) !== String(expectedValue)) {
                return false;
            }
        }
        // Handle primitive comparisons
        else {
            // Normalize both to strings for comparison (handles number/boolean)
            if (String(actualValue) !== String(expectedValue)) {
                return false;
            }
        }
    }

    return true; // All params matched
}

/**
 * Filters an array of entities based on ListParams.
 * Returns all items if params is undefined/empty.
 *
 * @param entities - The array of entities to filter
 * @param params - Optional filter parameters
 * @returns Filtered array of entities
 */
export function filterEntities<T>(entities: T[], params?: ListParams): T[] {
    // No params = no filtering
    if (!params || Object.keys(params).length === 0) {
        return entities;
    }

    // Filter out undefined values from params
    const cleanParams = Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {} as ListParams);

    // No valid params after cleanup = no filtering
    if (Object.keys(cleanParams).length === 0) {
        return entities;
    }

    // Apply filters
    return entities.filter((entity) => matchesFilter(entity, cleanParams));
}
