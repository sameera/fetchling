/**
 * Utility functions for ID extraction, serialization, and key management.
 *
 * This module provides helpers for working with both simple IDs (string/number)
 * and composite keys (objects with multiple fields).
 */

type Any = { [key: string]: unknown };

/**
 * Extracts a primitive value from a field, handling nested objects with id.
 *
 * @param value - The value to extract from (primitive or object with id)
 * @returns The primitive value (string or number)
 *
 * @example
 * ```ts
 * extractPrimitiveValue("simple")        // => "simple"
 * extractPrimitiveValue(123)             // => 123
 * extractPrimitiveValue({ id: "s1" })    // => "s1"
 * ```
 */
export function extractPrimitiveValue(value: unknown): string | number {
    if (value && typeof value === "object" && "id" in value) {
        // Nested object with id field - extract it
        return value.id as string | number;
    }
    // Primitive value or object without id - use as-is
    return value as string | number;
}

/**
 * Extracts the ID from an entity, handling both simple and composite keys.
 *
 * For simple keys, extracts the `id` field.
 * For composite keys, builds an object from the specified key fields,
 * automatically extracting primitive values from nested objects.
 *
 * @param entity - The entity to extract ID from
 * @param keyFields - Optional array of key field names for composite keys
 * @returns The extracted ID (simple value or composite object)
 *
 * @example
 * ```ts
 * // Simple key
 * getEntityId({ id: "123", name: "User" })
 * // => "123"
 *
 * // Composite key
 * getEntityId(
 *   { space: { id: "s1" }, name: "urgent", color: "#FF0000" },
 *   ["space", "name"]
 * )
 * // => { space: "s1", name: "urgent" }
 * ```
 */
export function getEntityId<T, ID>(entity: T, keyFields?: string[]): ID {
    if (keyFields && keyFields.length > 0) {
        // Composite key: extract key fields into object
        const idObj: Record<string, string | number> = {};
        keyFields.forEach((field) => {
            const value = (entity as Any)[field];
            // Auto-extract .id from nested objects
            idObj[field] = extractPrimitiveValue(value);
        });
        return idObj as ID;
    }
    // Simple key: extract id field
    return (entity as { id: ID }).id;
}

/**
 * Serializes an ID for use in query keys.
 *
 * Simple IDs are returned as-is.
 * Composite keys are normalized (primitives extracted) and JSON-stringified.
 *
 * @param id - The ID to serialize
 * @param keyFields - Optional array of key field names for composite keys
 * @returns Serialized ID (string for composite keys, original value for simple keys)
 *
 * @example
 * ```ts
 * // Simple key
 * serializeId("123")
 * // => "123"
 *
 * // Composite key
 * serializeId({ space: "s1", name: "urgent" }, ["space", "name"])
 * // => '{"space":"s1","name":"urgent"}'
 *
 * // Composite key with nested objects
 * serializeId({ space: { id: "s1" }, name: "urgent" }, ["space", "name"])
 * // => '{"space":"s1","name":"urgent"}'
 * ```
 */
export function serializeId<ID>(id: ID, keyFields?: string[]): string | ID {
    if (typeof id === "object" && id !== null) {
        // For composite keys, create a normalized object with primitive values
        if (keyFields && keyFields.length > 0) {
            const normalized: Record<string, string | number> = {};
            keyFields.forEach((field) => {
                const value = (id as Any)[field];
                normalized[field] = extractPrimitiveValue(value);
            });
            return JSON.stringify(normalized);
        }
        return JSON.stringify(id);
    }
    return id;
}

/**
 * Builds a Dexie-compatible key from an ID for delete operations.
 *
 * For simple keys, returns the ID as-is.
 * For composite keys, returns an array of primitive values in the order of keyFields.
 *
 * @param id - The ID to convert
 * @param keyFields - Optional array of key field names for composite keys
 * @returns Dexie-compatible key (simple value or array for compound index)
 *
 * @example
 * ```ts
 * // Simple key
 * buildDexieKey("123")
 * // => "123"
 *
 * // Composite key
 * buildDexieKey(
 *   { space: { id: "s1" }, name: "urgent" },
 *   ["space", "name"]
 * )
 * // => ["s1", "urgent"]
 * ```
 */
export function buildDexieKey<ID>(
    id: ID,
    keyFields?: string[]
): ID | (string | number)[] {
    if (
        keyFields &&
        keyFields.length > 0 &&
        typeof id === "object" &&
        id !== null
    ) {
        // Composite key: build array of primitive values
        return keyFields.map((field) => {
            const value = (id as Any)[field];
            return extractPrimitiveValue(value);
        });
    }
    // Simple key: return as-is
    return id;
}
