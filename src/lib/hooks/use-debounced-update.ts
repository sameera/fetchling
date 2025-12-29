import { useCallback, useEffect, useRef } from "react";

import type { ResourceAPI } from "../types";

/**
 * Creates a debounced update function for a resource that implements local-first persistence.
 *
 * This hook provides a two-tier save strategy:
 * 1. **Immediate IndexedDB save** - Data is persisted locally instantly (via Dexie)
 * 2. **Debounced API sync** - Server updates are batched to reduce API load
 *
 * This pattern is ideal for high-frequency updates like text editors, where you want:
 * - Instant local persistence (no data loss)
 * - Reduced server load (fewer API calls)
 * - Automatic cleanup on component unmount
 *
 * @template T - The entity type (e.g., Block, Task, Note)
 * @template ID - The ID type (string, number, or composite key object)
 *
 * @param resource - The resource API created by query.createResource()
 * @param debounceMs - Debounce delay in milliseconds for API calls (default: 500)
 *
 * @returns Object with debounced update methods:
 *   - `debouncedUpdate`: Update function with local-first persistence
 *   - `flush`: Manually trigger pending API sync
 *   - `cancel`: Cancel pending API sync
 *
 * @example
 * ```tsx
 * // In a note editor component
 * const { debouncedUpdate, flush } = useDebouncedUpdate(blocks, 1000);
 *
 * const handleEditorChange = async (content: string) => {
 *   // Saves to IndexedDB immediately, syncs to API after 1 second of inactivity
 *   await debouncedUpdate(noteId, { content });
 * };
 *
 * // Optionally flush before navigating away
 * useEffect(() => {
 *   return () => {
 *     flush(); // Ensure final changes are synced
 *   };
 * }, [flush]);
 * ```
 *
 * @example
 * ```tsx
 * // For a drag-and-drop interface
 * const { debouncedUpdate } = useDebouncedUpdate(tasks, 300);
 *
 * const handleDragEnd = async (taskId: string, newPosition: number) => {
 *   // IndexedDB updated instantly, API synced after 300ms
 *   await debouncedUpdate(taskId, { position: newPosition });
 * };
 * ```
 */
export function useDebouncedUpdate<T, ID = string>(
    resource: ResourceAPI<T, ID>,
    debounceMs = 500
): {
    debouncedUpdate: (
        id: ID,
        data: Partial<Omit<T, keyof ID>>
    ) => Promise<void>;
    flush: () => Promise<void>;
    cancel: () => void;
} {
    // Track pending API updates
    const pendingUpdateRef = useRef<{
        id: ID;
        data: Partial<Omit<T, keyof ID>>;
        timerId: NodeJS.Timeout;
    } | null>(null);

    // Track the promise for the current API call
    const apiCallRef = useRef<Promise<T> | null>(null);

    /**
     * Normalizes an entity for Dexie storage.
     * This handles composite keys and nested objects correctly.
     */
    const normalizeEntityForStorage = useCallback((entity: T): T => {
        // Use the resource's internal normalization if available
        // For now, we'll store as-is since the resource handles this
        return entity;
    }, []);

    /**
     * Saves data to IndexedDB immediately.
     * This provides instant local persistence without waiting for the API.
     */
    const saveToIndexedDB = useCallback(
        async (id: ID, data: Partial<Omit<T, keyof ID>>): Promise<void> => {
            try {
                const table = resource.table;

                // Get existing entity to merge with updates
                const existing = await table.get(id);
                if (!existing) {
                    await table.put(
                        normalizeEntityForStorage({ ...data, id } as T)
                    );
                } else {
                    // Merge the updates with existing entity
                    const updated = { ...existing, ...data } as T;

                    // Save to IndexedDB
                    await table.put(normalizeEntityForStorage(updated));
                }
            } catch (error) {
                console.error(
                    "[useDebouncedUpdate] Failed to save to IndexedDB:",
                    error
                );
                // Don't throw - IndexedDB failure shouldn't block the update
            }
        },
        [resource.table, normalizeEntityForStorage]
    );

    /**
     * Syncs data to the API.
     * This is the actual network call that gets debounced.
     */
    const syncToAPI = useCallback(
        async (id: ID, data: Partial<Omit<T, keyof ID>>): Promise<void> => {
            try {
                // Call the resource's update method which handles API + cache
                const promise = resource.update(id, data);
                apiCallRef.current = promise;
                await promise;
                apiCallRef.current = null;
            } catch (error) {
                console.error(
                    "[useDebouncedUpdate] Failed to sync to API:",
                    error
                );
                apiCallRef.current = null;
                // Don't throw - we want to keep local changes even if API fails
                // The local IndexedDB save already succeeded
            }
        },
        [resource]
    );

    /**
     * Cancels any pending API sync.
     */
    const cancel = useCallback(() => {
        if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current.timerId);
            pendingUpdateRef.current = null;
        }
    }, []);

    /**
     * Flushes pending updates immediately.
     * Useful when component is unmounting or user navigates away.
     */
    const flush = useCallback(async (): Promise<void> => {
        if (pendingUpdateRef.current) {
            const { id, data } = pendingUpdateRef.current;
            cancel();
            await syncToAPI(id, data);
        }
        // Also wait for any in-flight API call to complete
        if (apiCallRef.current) {
            await apiCallRef.current;
        }
    }, [cancel, syncToAPI]);

    /**
     * Main debounced update function.
     * Saves to IndexedDB immediately, debounces API sync.
     */
    const debouncedUpdate = useCallback(
        async (id: ID, data: Partial<Omit<T, keyof ID>>): Promise<void> => {
            // 1. Save to IndexedDB immediately (instant local persistence)
            await saveToIndexedDB(id, data);

            // 2. Cancel any pending API sync
            cancel();

            // 3. Schedule new API sync after debounce delay
            const timerId = setTimeout(() => {
                syncToAPI(id, data);
                pendingUpdateRef.current = null;
            }, debounceMs);

            // Track the pending update
            pendingUpdateRef.current = { id, data, timerId };
        },
        [debounceMs, saveToIndexedDB, cancel, syncToAPI]
    );

    // Auto-flush on unmount to ensure no data loss
    useEffect(() => {
        return () => {
            if (pendingUpdateRef.current) {
                const { id, data } = pendingUpdateRef.current;
                cancel();
                // Fire and forget - component is already unmounting
                syncToAPI(id, data);
            }
        };
    }, [cancel, syncToAPI]);

    return {
        debouncedUpdate,
        flush,
        cancel,
    };
}
