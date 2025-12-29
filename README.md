# @quantum/query Library Documentation

## Overview

The `@quantum/query` library is a unified query cache system that implements **local-first data fetching** with the **SWR (Stale-While-Revalidate)** pattern. It combines TanStack Query v5 and Dexie (IndexedDB) to provide near-zero latency data access with automatic server synchronization.

## Purpose

This library solves the challenge of building responsive applications that feel instant while maintaining data consistency with backend APIs. It provides:

- **Instant data access** through IndexedDB caching
- **Automatic background synchronization** with REST APIs
- **Optimistic updates** for better user experience
- **Offline-first capabilities** with automatic retry
- **Type-safe resource management** with TypeScript

## Core Concepts

### Local-First Architecture

The library implements a two-tier caching strategy:

1. **IndexedDB (Dexie)** - Persistent local storage for instant data access
2. **TanStack Query** - Server state management with automatic cache invalidation

When you read data, it returns immediately from IndexedDB while simultaneously fetching fresh data from the server in the background.

### SWR Pattern

The Stale-While-Revalidate pattern works as follows:

1. Return stale data from cache immediately (near-zero latency)
2. Trigger background fetch from server
3. Update cache with fresh data
4. Re-render UI with updated data

This provides the best of both worlds: instant UI updates and fresh data.

### Resource-Based API

The library uses a resource-centric approach where each entity type (users, tasks, spaces, etc.) is configured once and provides a complete set of operations, hooks, and cache management functions.

## Key Features

### Composite Key Support

Full support for entities with multi-field primary keys:

```typescript
// Simple key
const users = query.createResource<User, string>({
    name: "users",
    baseUrl: "/v1/users",
    keyField: "id"
});

// Composite key (e.g., tags identified by spaceId + tagName)
const tags = query.createResource<Tag, [string, string]>({
    name: "tags",
    baseUrl: "/v1/tags",
    keyFields: ["spaceId", "tagName"]
});
```

### Automatic Cache Invalidation

Hierarchical query keys enable smart cache invalidation:

- Creating a tag invalidates the tag list
- Updating a tag invalidates both the specific tag and the list
- Deleting a tag removes it from all caches

### Debounced Updates

The `useDebouncedUpdate` hook provides two-tier persistence for high-frequency updates:

```typescript
const { debouncedUpdate } = useDebouncedUpdate(notes, 500);

// Immediate IndexedDB save + debounced API sync
debouncedUpdate(noteId, { content: newText });
```

Perfect for text editors, drag-and-drop interfaces, and other scenarios with rapid changes.

### Offline Support

All operations work offline through IndexedDB. When connectivity returns, pending mutations are automatically synchronized.

## Architecture

### Core Components

**Query Singleton** (`query`)
- Central instance managing all resources
- Extends Dexie for IndexedDB operations
- Two-phase initialization (synchronous resource creation + asynchronous table setup)

**Resource Factory** (`createResource`)
- Creates a complete ResourceAPI for each entity type
- Generates CRUD operations, React hooks, and cache management
- Handles simple and composite keys

**API Request Layer** (`apiRequest`)
- RESTful HTTP client with automatic authentication
- Injects OIDC tokens from react-oidc-context
- Standardized error handling with `ApiError` class

**React Hooks** (generated per resource)
- `useGetById` - Fetch single entity by ID
- `useList` - Fetch collection with query params
- `useCreate` - Create new entity
- `useUpdate` - Update existing entity
- `useDelete` - Delete entity

## Usage Example

### Creating a Resource

```typescript
import { query } from "@sameera/quantum-query";
import type { Space } from "./types";

// Create resource API
const spaces = query.createResource<Space, string>({
    name: "spaces",
    baseUrl: "/v1/spaces",
    keyField: "id"
});

// Initialize all tables (call once at app startup)
await query.initialize();
```

### Using the Resource

```typescript
import { spaces } from "./resources/spaces";

function SpaceList() {
    // Automatic SWR: instant cache read + background refresh
    const { data, isLoading, error } = spaces.hooks.useList();

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <ul>
            {data?.map(space => (
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
        staleTime: 5000  // Consider data fresh for 5 seconds
    });

    // ... component code
}

// Override stale time for a list query
function SpaceList() {
    const { data: spaces } = spaces.hooks.useList(
        { archived: false },
        {
            staleTime: 60000  // Consider data fresh for 1 minute
        }
    );

    // ... component code
}
```

**When to use custom staleTime:**

- **High staleTime (30s - 5min)**: Relatively static data that changes infrequently (user profiles, settings, configuration)
- **Medium staleTime (5s - 30s)**: Data that changes occasionally but not frequently (list of spaces, categories)
- **Low staleTime (0 - 5s)**: Dynamic data that may change frequently (task lists, real-time feeds, notifications)
- **staleTime: Infinity**: Data that never changes after creation (archived records, historical data)

**Note:** Even with a high staleTime, the SWR pattern means the UI still gets instant updates from IndexedDB cache. The staleTime only affects whether a background refetch is triggered.

```typescript
// Example: User settings that rarely change
const { data: settings } = userSettings.hooks.useGetById(userId, {
    staleTime: 5 * 60 * 1000,  // 5 minutes - settings rarely change
    refetchOnMount: false       // Don't refetch every mount
});

// Example: Real-time task list
const { data: tasks } = tasks.hooks.useList(
    { status: "active" },
    {
        staleTime: 0,              // Always stale - refetch on every mount
        refetchInterval: 30000     // Also poll every 30 seconds
    }
);
```

All TanStack Query options are supported, including:
- `staleTime` - How long data stays fresh
- `refetchOnMount` - Refetch when component mounts
- `refetchOnWindowFocus` - Refetch when window regains focus
- `refetchInterval` - Polling interval
- `enabled` - Conditionally enable/disable the query
- And all other [TanStack Query options](https://tanstack.com/query/latest/docs/react/reference/useQuery)

## Key Exports

### Core API

- `query` - Singleton Query instance
- `Query` - Query class (extends Dexie)
- `apiRequest` - HTTP client function
- `ApiError` - Error class for API failures

### Hooks

- `useDebouncedUpdate` - Two-tier persistence for high-frequency updates

### Types

- `BaseEntity<ID>` - Generic entity type
- `ResourceConfig<T, ID>` - Configuration for creating resources
- `ResourceAPI<T, ID>` - Complete resource interface
- `ResourceOperations<T, ID>` - CRUD operations
- `ResourceHooks<T, ID>` - React hooks
- `CacheOperations<T>` - Cache management
- `QueryKeys<T, ID>` - Query key factory
- `ListParams` - Query parameters type

## Related Documentation

- **[API Response Format Requirements](../README.md)** - Backend API contract and response format specifications
- **[Query Library Patterns](../../../../docs/tech-specs/query-library-patterns.md)** - Implementation patterns and best practices
- **[Library Source Code](../src/)** - Full implementation details

## Dependencies

### Peer Dependencies
- `@tanstack/react-query` ^5.0.0
- `react` ^18.0.0
- `react-dom` ^18.0.0

### Runtime Dependencies
- `dexie` - IndexedDB wrapper
- `@sameera/quantum` - Authentication via userManager

## Testing

Run unit tests:

```bash
npx nx test @sameera/quantum-query
```

Test files:
- `src/lib/api.test.ts` - API request layer
- `src/lib/query.test.ts` - Query initialization
- `src/lib/hooks/use-debounced-update.test.ts` - Debounced update hook

## Design Principles

1. **Local-First** - Always prioritize instant local data access
2. **Declarative** - Define resources once, get full CRUD + hooks
3. **Type-Safe** - Full TypeScript support with generic types
4. **Automatic** - Cache invalidation and synchronization happen transparently
5. **Flexible** - Support both simple and composite keys
6. **Resilient** - Work offline, sync when connectivity returns
