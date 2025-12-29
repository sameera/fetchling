/**
 * Entity normalization for Dexie storage.
 *
 * This module handles flattening nested objects in composite key fields
 * to ensure Dexie can properly index and query entities.
 */

/**
 * Normalizes entities for Dexie storage by flattening nested objects in key fields.
 *
 * For resources with composite keys, Dexie needs primitive values in the key fields
 * to build the compound index. This class handles the normalization automatically.
 *
 * @example
 * ```ts
 * const normalizer = new EntityNormalizer<Tag>(["space", "name"]);
 *
 * // Input: nested object in key field
 * const tag = {
 *   space: { id: "s1", name: "Work" },
 *   name: "urgent",
 *   color: "#FF0000"
 * };
 *
 * // Output: flattened for Dexie
 * const normalized = normalizer.normalize(tag);
 * // => { space: "s1", name: "urgent", color: "#FF0000" }
 * ```
 */
export class EntityNormalizer<T> {
    private keyFields?: string[];

    /**
     * Creates a new EntityNormalizer.
     *
     * @param keyFields - Optional array of field names that form the composite key
     */
    constructor(keyFields?: string[]) {
        this.keyFields = keyFields;
    }

    /**
     * Normalizes a single entity for Dexie storage.
     *
     * If no composite keys are configured, returns the entity as-is.
     * Otherwise, clones the entity and replaces nested objects in key fields
     * with their primitive id values.
     *
     * @param entity - The entity to normalize
     * @returns Normalized entity ready for Dexie storage
     */
    normalize(entity: T): T {
        if (!this.keyFields || this.keyFields.length === 0) {
            // No composite keys, store as-is
            return entity;
        }

        // Clone the entity to avoid mutating the original
        const normalized = { ...entity };

        // Flatten nested objects in key fields to primitives
        this.keyFields.forEach((field) => {
            const value = (entity as Record<string, unknown>)[field];
            if (value && typeof value === "object" && "id" in value) {
                // Replace nested object with its id value
                (normalized as Record<string, unknown>)[field] = value.id;
            }
        });

        return normalized;
    }

    /**
     * Normalizes an array of entities for bulk operations.
     *
     * @param entities - Array of entities to normalize
     * @returns Array of normalized entities
     */
    normalizeMany(entities: T[]): T[] {
        return entities.map((entity) => this.normalize(entity));
    }
}
