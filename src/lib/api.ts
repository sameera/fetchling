/**
 * Error thrown when an API request fails.
 */
export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public statusText: string,
        public data?: unknown
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export type TokenGetter = () =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;

let tokenGetter: TokenGetter = () => undefined;

/**
 * Configures the token getter for API requests.
 * Use this to integrate with your authentication system.
 */
export function setTokenGetter(getter: TokenGetter) {
    tokenGetter = getter;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Makes a REST API request with automatic JSON handling and authentication.
 *
 * Features:
 * - Automatic JSON encoding for request body
 * - Automatic JSON parsing for response
 * - Automatic authentication token injection via tokenGetter
 * - Error handling with status codes
 * - Type-safe response
 *
 * @param url - The URL to fetch (relative or absolute)
 * @param options - Standard fetch options
 * @returns Promise resolving to typed response data
 * @throws {ApiError} When the response is not ok (status >= 400)
 */
export async function apiRequest<T>(
    url: string,
    options?: RequestInit
): Promise<T> {
    // Get access token from the configured getter
    const token = await tokenGetter();

    // Prepare headers with JSON content type and authorization
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token && {
            Authorization: `Bearer ${token}`,
        }),
        ...options?.headers,
    };

    // Serialize body to JSON if it's an object
    const body =
        options?.body && typeof options.body === "object"
            ? JSON.stringify(options.body)
            : options?.body;

    // Make the request
    const response = await fetch(API_BASE_URL + url, {
        ...options,
        headers,
        body,
    });

    // Handle error responses
    if (!response.ok) {
        let errorData: unknown;
        const jsonAttemptResponse = response.clone(); // Clone for JSON attempt
        try {
            const parsedResponse = await jsonAttemptResponse.json();
            errorData =
                "errors" in parsedResponse
                    ? parsedResponse.errors
                    : parsedResponse;
        } catch {
            const textAttemptResponse = response.clone(); // Clone again for text attempt
            errorData = await textAttemptResponse.text();
        }

        throw new ApiError(
            `API request failed: ${response.status} ${response.statusText}`,
            response.status,
            response.statusText,
            errorData
        );
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
        return undefined as T;
    }

    // Parse JSON response
    try {
        return await response.json();
    } catch (error) {
        throw new ApiError(
            `Failed to parse JSON response: ${
                error instanceof Error ? error.message : "Unknown error"
            }`,
            response.status,
            response.statusText
        );
    }
}
