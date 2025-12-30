# @sameera/fetchling Library Documentation

## Overview

The `@sameera/fetchling` library is a unified query cache system that implements **local-first data fetching** with the **SWR (Stale-While-Revalidate)** pattern. It combines TanStack Query v5 and Dexie (IndexedDB) to provide near-zero latency data access with automatic server synchronization.

## Purpose

This library solves the challenge of building responsive applications that feel instant while maintaining data consistency with backend APIs. It provides:

-   **Instant data access** through IndexedDB caching
-   **Automatic background synchronization** with REST APIs
-   **Optimistic updates** for better user experience
-   **Offline-first capabilities** with automatic retry
-   **Type-safe resource management** with TypeScript

## Core Concepts

### Local-First Architecture

The library prioritizes local data for instant UI updates:

1. **First render**: Data from IndexedDB (Dexie) shows immediately
2. **Background fetch**: Network request fires to get fresh data
3. **Cache update**: Both Dexie and TanStack Query caches update
4. **UI refresh**: Component re-renders with fresh data

This means your UI is never blocked waiting for network requests.

### SWR (Stale-While-Revalidate) Pattern

SWR is a data fetching strategy that:

-   Serves stale data from cache immediately (fast)
-   Revalidates data in the background (fresh)
-   Updates UI when fresh data arrives (automatic)

Perfect for building responsive UIs that feel instant while staying synchronized.

### Two-Phase Initialization

The library uses a two-phase initialization system for efficiency:

```typescript
// Phase 1: Create resources (synchronous, no I/O)
const users = query.createResource<User>({
    name: "users",
    baseUrl: "/api/users",
});
const posts = query.createResource<Post>({
    name: "posts",
    baseUrl: "/api/posts",
});

// Phase 2: Initialize database (async, single batch operation)
await query.initialize();
```

This allows you to create all resources at module level while deferring database initialization to app startup.

### Simple vs Composite Keys

**Simple Keys (default)**: Use the `id` field

```typescript
interface User extends BaseEntity<string> {
    id: string;
    name: string;
}

const users = query.createResource<User>({
    name: "users",
    baseUrl: "/api/users",
    // keyFields omitted - defaults to ["id"]
});

// URLs: /api/users/{id}
await users.getById("user123");
```

**Composite Keys**: Specify multiple key fields

```typescript
interface Tag extends BaseEntity<{ spaceId: string; name: string }> {
    spaceId: string;
    name: string;
    color?: string;
}

const tags = query.createResource<Tag, { spaceId: string; name: string }>({
    name: "tags",
    baseUrl: "/v1/tags",
    keyFields: ["spaceId", "name"],
});

// URLs: /v1/tags/{spaceId}/{name}
await tags.getById({ spaceId: "space123", name: "urgent" });
```

## API Reference

### Query Class

#### `new Query()`

Creates a new query cache instance. Most apps should use the singleton `query` export instead.

```typescript
import { query } from "@sameera/quantum/query";
// or
import { Query } from "@sameera/quantum/query";
const customQuery = new Query();
```

#### `query.createResource<T, ID>(config: ResourceConfig<T, ID>): ResourceAPI<T, ID>`

Creates a fully-featured resource API with CRUD operations, React hooks, and cache management.

**Parameters:**

-   `config.name` - Unique resource name (used for table name and query keys)
-   `config.baseUrl` - Base URL for REST API endpoints (e.g., `/api/users`)
-   `config.keyFields` - Optional array of field names for composite primary key

**Returns:** `ResourceAPI<T, ID>` with operations, hooks, and cache methods

```typescript
const spaces = query.createResource<Space>({
import { query } from "@sameera/fetchling";
import type { Space } from "./types";

// Create resource API
const spaces = query.createResource<Space, string>({
    name: "spaces",
    baseUrl: "/v1/spaces",
});
```

#### `query.initialize(): Promise<void>`

Initializes the IndexedDB database by creating all registered tables in a single batch operation. Call this once during app initialization after creating all resources.

```typescript
await query.initialize();
```

#### `query.getTable<T, ID>(name: string): Table<T, ID> | undefined`

Gets the Dexie table for a resource. Useful for advanced Dexie operations.

```typescript
const spacesTable = query.getTable<Space>("spaces");
const allSpaces = await spacesTable?.toArray();
```

### ResourceConfig

Configuration object for creating a resource.

```typescript
interface ResourceConfig<T, ID = string> {
    name: string; // Unique name for the resource
    baseUrl: string; // Base URL for REST API
    keyFields?: string[]; // Optional: fields forming composite key
}
```

### ResourceAPI

Complete API returned by `createResource()`. Includes all operations, hooks, and cache methods.

```typescript
interface ResourceAPI<T, ID = string> {
    // Metadata
    name: string;
    table: Table<T, ID>;
    queryKeys: QueryKeys<T, ID>;

    // CRUD Operations (Promise-based)
    getById(id: ID): Promise<T | null>;
    list(params?: ListParams): Promise<T[]>;
    create(data: Omit<T, keyof ID>): Promise<T>;
    update(id: ID, data: Partial<Omit<T, keyof ID>>): Promise<T>;
    remove(id: ID): Promise<void>;

    // React Hooks
    useGetById(id: ID | undefined, options?): UseQueryResult<T | undefined>;
    useList(params?: ListParams, options?): UseQueryResult<T[]>;
    useCreate(): UseMutationResult<T, Error, Omit<T, keyof ID>>;
    useUpdate(): UseMutationResult<T, Error, { id: ID; data: Partial<T> }>;
    useDelete(): UseMutationResult<void, Error, ID>;

    // Cache Operations
    seedOne(item: T): Promise<void>;
    seedMany(items: T[], params?: ListParams): Promise<void>;
    clearCache(): Promise<void>;
}
```

## CRUD Operations

All operations return Promises and can be used outside React components (e.g., in services, utilities, or scripts).

### `getById(id: ID): Promise<T | null>`

Fetch a single item by ID. Checks Dexie cache first, then fetches from API if needed.

```typescript
const space = await spaces.getById("space123");
if (space) {
    console.log(space.name);
}
```

### `list(params?: ListParams): Promise<T[]>`

Fetch a list of items with optional query parameters.

```typescript
// All items
const allSpaces = await spaces.list();

// With filters
const mySpaces = await spaces.list({ owner: userId });
```

**ListParams**: Record of query parameters (strings, numbers, booleans, arrays, or undefined)

### `create(data: Omit<T, keyof ID>): Promise<T>`

Create a new item. The server should return the created item with ID.

```typescript
const newSpace = await spaces.create({
    name: "My Workspace",
    icon: "briefcase",
    owner: { id: userId },
});
```

### `update(id: ID, data: Partial<Omit<T, keyof ID>>): Promise<T>`

Update an existing item. Returns the updated item.

```typescript
const updated = await spaces.update("space123", {
    name: "Renamed Workspace",
});
```

### `remove(id: ID): Promise<void>`

Delete an item.

```typescript
await spaces.remove("space123");
```

## React Hooks

All hooks are powered by TanStack Query and include automatic cache management.

### `useGetById(id, options?)`

Fetch a single item by ID with auto-enabling.

**Auto-enabling**: Query is automatically enabled when `id !== undefined` (unless `options.enabled` is explicitly set).

```typescript
function SpaceDetail({ spaceId }: { spaceId?: string }) {
    // Auto-enabled when spaceId is defined
    const { data: space, isLoading, error } = spaces.useGetById(spaceId);

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    if (!space) return <div>Not found</div>;

    return <h1>{space.name}</h1>;
}
```

**With custom options:**

```typescript
const { data: space } = spaces.useGetById(spaceId, {
    enabled: spaceId !== undefined && userCanView,
    staleTime: 5000,
    refetchOnWindowFocus: false,
});
```

### `useList(params?, options?)`

Fetch a list of items with auto-enabling.

**Auto-enabling**: Query is automatically enabled when all params are defined (unless `options.enabled` is explicitly set).

```typescript
function SpacesList({ userId }: { userId?: string }) {
    // Auto-enabled when userId is defined
    const { data: spaces = [], isLoading } = spaces.useList({
        owner: userId,
    });

    if (isLoading) return <div>Loading...</div>;

    return (
        <ul>
            {spaces.map((space) => (
                <li key={space.id}>{space.name}</li>
            ))}
        </ul>
    );
}

function SpaceEditor({ spaceId }: { spaceId: string }) {
    const { data: space } = spaces.hooks.useGetById(spaceId);
    const updateMutation = spaces.hooks.useUpdate();

    const handleSave = (updates: Partial<Space>) => {
        updateMutation.mutate({ id: spaceId, data: updates });
    };

    // ... editor UI
}
```

### Manual Cache Operations

```typescript
// Seed cache with data from another source
spaces.cache.seedOne(spaceData);
spaces.cache.seedMany([space1, space2, space3]);

// Clear all caches for this resource
spaces.cache.clearCache();
```

### Configuring Stale Time

By default, all queries use `staleTime: 0`, which means data is considered stale immediately and will always be refetched when a component mounts. This aggressive refetching ensures you always have the freshest data, which aligns with the SWR pattern.

However, you can override `staleTime` on a per-query basis by passing options to the hooks:

```typescript
// Override stale time for a single entity query
function UserProfile({ userId }: { userId: string }) {
    const { data: user } = users.hooks.useGetById(userId, {
        staleTime: 5000, // Consider data fresh for 5 seconds
    });

    // ... component code
}

// Override stale time for a list query
function SpaceList() {
    const { data: spaces } = spaces.hooks.useList(
        { archived: false },
        {
            staleTime: 60000, // Consider data fresh for 1 minute
        }
    );

    // ... component code
}
```

**When to use custom staleTime:**

-   **High staleTime (30s - 5min)**: Relatively static data that changes infrequently (user profiles, settings, configuration)
-   **Medium staleTime (5s - 30s)**: Data that changes occasionally but not frequently (list of spaces, categories)
-   **Low staleTime (0 - 5s)**: Dynamic data that may change frequently (task lists, real-time feeds, notifications)
-   **staleTime: Infinity**: Data that never changes after creation (archived records, historical data)

**Note:** Even with a high staleTime, the SWR pattern means the UI still gets instant updates from IndexedDB cache. The staleTime only affects whether a background refetch is triggered.

```typescript
// Example: User settings that rarely change
const { data: settings } = userSettings.hooks.useGetById(userId, {
    staleTime: 5 * 60 * 1000, // 5 minutes - settings rarely change
    refetchOnMount: false, // Don't refetch every mount
});

// Example: Real-time task list
const { data: tasks } = tasks.hooks.useList(
    { status: "active" },
    {
        staleTime: 0, // Always stale - refetch on every mount
        refetchInterval: 30000, // Also poll every 30 seconds
    }
);
```

All TanStack Query options are supported, including:

-   `staleTime` - How long data stays fresh
-   `refetchOnMount` - Refetch when component mounts
-   `refetchOnWindowFocus` - Refetch when window regains focus
-   `refetchInterval` - Polling interval
-   `enabled` - Conditionally enable/disable the query
-   And all other [TanStack Query options](https://tanstack.com/query/latest/docs/react/reference/useQuery)

## Key Exports

### Core API

-   `query` - Singleton Query instance
-   `Query` - Query class (extends Dexie)
-   `apiRequest` - HTTP client function
-   `ApiError` - Error class for API failures

### Hooks

-   `useDebouncedUpdate` - Two-tier persistence for high-frequency updates

### Types

-   `BaseEntity<ID>` - Generic entity type
-   `ResourceConfig<T, ID>` - Configuration for creating resources
-   `ResourceAPI<T, ID>` - Complete resource interface
-   `ResourceOperations<T, ID>` - CRUD operations
-   `ResourceHooks<T, ID>` - React hooks
-   `CacheOperations<T>` - Cache management
-   `QueryKeys<T, ID>` - Query key factory
-   `ListParams` - Query parameters type

## Related Documentation

-   **[API Response Format Requirements](../README.md)** - Backend API contract and response format specifications
-   **[Query Library Patterns](../../../../docs/tech-specs/query-library-patterns.md)** - Implementation patterns and best practices
-   **[Library Source Code](../src/)** - Full implementation details

## Dependencies

### Peer Dependencies

-   `@tanstack/react-query` ^5.0.0
-   `react` ^18.0.0
-   `react-dom` ^18.0.0

### Runtime Dependencies

-   `dexie` - IndexedDB wrapper
-   `@sameera/quantum` - Authentication via userManager

## Testing

Run unit tests:

```bash
npx nx test @sameera/fetchling
```

Test files:

-   `src/lib/api.test.ts` - API request layer
-   `src/lib/query.test.ts` - Query initialization
-   `src/lib/hooks/use-debounced-update.test.ts` - Debounced update hook

## Design Principles

1. **Local-First** - Always prioritize instant local data access
2. **Declarative** - Define resources once, get full CRUD + hooks
3. **Type-Safe** - Full TypeScript support with generic types
4. **Automatic** - Cache invalidation and synchronization happen transparently
5. **Flexible** - Support both simple and composite keys
6. **Resilient** - Work offline, sync when connectivity returns
