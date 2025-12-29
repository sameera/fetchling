// Core API
export { query, Query } from "./lib/query";
export { apiRequest, ApiError } from "./lib/api";

// Hooks
export { useDebouncedUpdate } from "./lib/hooks/use-debounced-update";

// Types
export type {
    BaseEntity,
    ResourceConfig,
    ResourceAPI,
    ResourceOperations,
    ResourceHooks,
    CacheOperations,
    QueryKeys,
    ListParams,
} from "./lib/types";

export { queryClient } from "./query-client";
