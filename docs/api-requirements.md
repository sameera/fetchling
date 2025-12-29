# API Response Format Requirements

All backend APIs that integrate with this library **must** follow a standardized response format to ensure compatibility with the client-side query operations.

### HTTP Status Code Requirements

APIs must use proper HTTP status codes to indicate success or failure:

-   **2xx Success**: Request succeeded, return `{ data: T | T[] }`
-   **4xx Client Error**: Invalid request, authentication/authorization failure, resource not found
-   **5xx Server Error**: Unexpected server error

**The client library (`apiRequest`) throws an `ApiError` for all non-2xx responses**, so backend services should throw errors instead of returning error objects in the response body.

### Required Response Structure

#### Success Responses (HTTP 2xx)

##### Single Resource Endpoints (GET, POST, PATCH)

```typescript
{
    data: T; // The resource object
}
```

**Example (HTTP 200):**

```json
{
    "data": {
        "id": "abc123...",
        "name": "My Space",
        "owner": { "id": "user123" }
    }
}
```

##### Collection Endpoints (GET /resources)

```typescript
{
  data: T[]            // Array of resources
}
```

**Example (HTTP 200):**

```json
{
    "data": [
        {
            "id": "abc123...",
            "name": "Space 1",
            "owner": { "id": "user123" }
        },
        {
            "id": "def456...",
            "name": "Space 2",
            "owner": { "id": "user456" }
        }
    ]
}
```

#### Error Responses (HTTP 4xx, 5xx)

When errors occur, throw appropriate HTTP errors with error details in the response body:

```typescript
{
  error: {
    code: string;       // Machine-readable error code
    message: string;    // Human-readable error message
    details?: string;   // Optional additional details
  }
}
```

**Example (HTTP 404):**

```json
{
    "error": {
        "code": "SPACE_NOT_FOUND",
        "message": "Space not found or you do not have access"
    }
}
```

**Example (HTTP 400):**

```json
{
    "error": {
        "code": "INVALID_CAS_KEY",
        "message": "The provided space ID does not match the expected CAS key",
        "details": "Space ID validation failed"
    }
}
```

### Key Points

1. **Use HTTP status codes** - Throw errors with appropriate status codes (400, 401, 403, 404, 409, 500) instead of returning HTTP 200 with error objects

2. **Success responses use `data` wrapper** - Always use `data` as the property name, not resource-specific names like `space`, `spaces`, `categories`

3. **Error responses use `error` object** - Use singular `error` (not `errors` array) with `code`, `message`, and optional `details`

4. **Client handles errors automatically** - The `apiRequest` function throws `ApiError` for non-2xx responses, which is caught by the query library

5. **DELETE operations** - DELETE endpoints return HTTP 204 No Content with no response body

### Examples by HTTP Method and Status Code

```typescript
// GET /spaces/:id
// Success (200): { data: Space }
// Not Found (404): { error: { code: "SPACE_NOT_FOUND", message: "..." } }
// Access Denied (403): { error: { code: "ACCESS_DENIED", message: "..." } }

// POST /spaces
// Success (200): { data: Space }
// Bad Request (400): { error: { code: "INVALID_CAS_KEY", message: "..." } }
// Conflict (409): { error: { code: "SPACE_ALREADY_EXISTS", message: "..." } }

// PATCH /spaces/:id
// Success (200): { data: Space }
// Not Found (404): { error: { code: "SPACE_NOT_FOUND", message: "..." } }

// GET /spaces
// Success (200): { data: Space[] }
// Empty result: { data: [] } (still HTTP 200)

// DELETE /spaces/:id
// Success: HTTP 204 No Content (no body)
// Not Found (404): { error: { code: "SPACE_NOT_FOUND", message: "..." } }
```

### TypeScript Types

When defining response DTOs in your backend, follow this pattern:

```typescript
// Success response - single resource
export interface ResourceResponseDto {
    data: ResourceDto;
}

// Success response - collection
export interface ResourcesResponseDto {
    data: ResourceDto[];
}

// Error response (thrown, not returned)
export class ResourceNotFoundError extends NotFoundError {
    constructor(message: string = "Resource not found") {
        super(message, "RESOURCE_NOT_FOUND");
    }
}
```

### Backend Implementation Pattern

```typescript
// Service layer - throw errors
async getById(id: string): Promise<ResourceDto> {
  const resource = await db.findById(id);
  if (!resource) {
    throw new NotFoundError("Resource not found", "RESOURCE_NOT_FOUND");
  }
  return resource;
}

// Handler layer - catch errors and set status codes
async handler(request, reply) {
  try {
    const resource = await service.getById(id);
    return reply.status(200).send({ data: resource });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return reply.status(404).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }
    throw error; // Let global error handler deal with unexpected errors
  }
}
```

## Running unit tests

Run `nx test @sameera/fetchling` to execute the unit tests via [Vitest](https://vitest.dev/).
