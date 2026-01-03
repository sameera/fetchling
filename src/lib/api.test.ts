import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

// These will be defined when the module is imported
let apiRequest: <T = unknown>(url: string, options?: any) => Promise<T>;
let ApiError: any;
let setTokenGetter: (getter: any) => void;

// Declare mockFetch here
const mockFetch = vi.fn();
const mockTokenGetter = vi.fn();

// Mock environment variable
const originalViteApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

describe("API Tests", () => {
    const API_BASE_URL = "http://localhost:3000";

    beforeAll(async () => {
        // Set VITE_API_BASE_URL *before* dynamic import
        import.meta.env.VITE_API_BASE_URL = API_BASE_URL;

        // Stub global fetch BEFORE importing api.ts
        vi.stubGlobal("fetch", mockFetch);

        // Dynamically import the module under test
        const apiModule = await import("./api");
        apiRequest = apiModule.apiRequest;
        ApiError = apiModule.ApiError;
        setTokenGetter = apiModule.setTokenGetter;

        // Configure the token getter with our mock
        setTokenGetter(mockTokenGetter);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockClear();
        mockTokenGetter.mockResolvedValue(null); // Default to no token
    });

    afterAll(() => {
        // Restore original after all tests
        import.meta.env.VITE_API_BASE_URL = originalViteApiBaseUrl;
        // No need to call mockRestore() for vi.stubGlobal, as it's a global replacement for the test environment.
        // It's automatically cleaned up between test runs or test files by Vitest.
    });

    it("ApiError should create an instance with correct properties", () => {
        const error = new ApiError("Test message", 404, "Not Found", {
            detail: "Item not found",
        });
        expect(error.message).toBe("Test message");
        expect(error.name).toBe("ApiError");
        expect(error.status).toBe(404);
        expect(error.statusText).toBe("Not Found");
        expect(error.data).toEqual({ detail: "Item not found" });
    });

    it("ApiError should create an instance without data", () => {
        const error = new ApiError(
            "Another message",
            500,
            "Internal Server Error"
        );
        expect(error.message).toBe("Another message");
        expect(error.name).toBe("ApiError");
        expect(error.status).toBe(500);
        expect(error.statusText).toBe("Internal Server Error");
        expect(error.data).toBeUndefined();
    });

    it("should make a GET request and return JSON data", async () => {
        const mockResponseData = { id: 1, name: "Test" };
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify(mockResponseData), {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await apiRequest<{ id: number; name: string }>("/data");

        expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/data`, {
            headers: { "Content-Type": "application/json" },
            body: undefined,
        });
        expect(result).toEqual(mockResponseData);
    });

    it("should include Authorization header if user has access token", async () => {
        const mockAccessToken = "mock-access-token";
        mockTokenGetter.mockResolvedValueOnce(mockAccessToken);
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({}), {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" },
            })
        );

        await apiRequest("/secure-data");

        expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/secure-data`, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${mockAccessToken}`,
            },
            body: undefined,
        });
    });

    it("should send a POST request with JSON body", async () => {
        const requestBody = { item: "new item" };
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify(requestBody), {
                status: 201,
                statusText: "Created",
                headers: { "Content-Type": "application/json" },
            })
        );

        await apiRequest("/items", { method: "POST", body: requestBody });

        expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });
    });

    it("should return undefined for 204 No Content response", async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(null, {
                status: 204,
                statusText: "No Content",
            })
        );

        const result = await apiRequest("/no-content");

        expect(result).toBeUndefined();
    });

    it("should throw ApiError for non-ok response with JSON error", async () => {
        const mockErrorData = { errors: [{ message: "Something went wrong" }] };
        const mockedResponse = new Response(JSON.stringify(mockErrorData), {
            status: 400, // Explicitly set to 400 to match assertion
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" },
        });
        mockFetch.mockResolvedValueOnce(mockedResponse);

        console.log(
            "TEST: should throw ApiError for non-ok response with JSON error"
        );
        console.log("mockFetch set to resolve with:", mockedResponse);
        console.log(
            "Is mockFetch a Vitest mock?",
            vi.isMockFunction(mockFetch)
        );

        try {
            await apiRequest("/error");
            expect.fail("apiRequest should have thrown an error");
        } catch (error) {
            console.log("Error caught in test:", error);
            expect(error).toBeInstanceOf(ApiError);
            expect(error).toMatchObject({
                status: 400,
                statusText: "Bad Request",
                data: mockErrorData.errors,
            });
        }
    });

    it("should throw ApiError for non-ok response with direct JSON data", async () => {
        const mockErrorData = { message: "Something went wrong" };
        const mockedResponse = new Response(JSON.stringify(mockErrorData), {
            status: 400,
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" },
        });
        mockFetch.mockResolvedValueOnce(mockedResponse);

        try {
            await apiRequest("/error");
            expect.fail("apiRequest should have thrown an error");
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect(error).toMatchObject({
                status: 400,
                statusText: "Bad Request",
                data: mockErrorData,
            });
        }
    });

    it("should throw ApiError for non-ok response with text error", async () => {
        const mockErrorText = "Internal Server Error";
        const mockedResponse = new Response(mockErrorText, {
            status: 500,
            statusText: "Internal Server Error",
        });
        mockFetch.mockResolvedValueOnce(mockedResponse);

        try {
            await apiRequest("/server-error");
            expect.fail("apiRequest should have thrown an error");
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect(error).toMatchObject({
                status: 500,
                statusText: "Internal Server Error",
                data: mockErrorText,
            });
        }
    });

    it("should throw ApiError if JSON parsing fails for a successful response", async () => {
        const mockedResponse = new Response("not json", {
            status: 200,
            statusText: "OK",
        });
        mockFetch.mockResolvedValueOnce(mockedResponse);

        try {
            await apiRequest("/bad-json");
            expect.fail("apiRequest should have thrown an error");
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect(error).toMatchObject({
                message: expect.stringContaining(
                    "Failed to parse JSON response"
                ),
                status: 200,
                statusText: "OK",
            });
        }
    });

    it("should merge custom headers correctly", async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({}), {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" },
            })
        );

        await apiRequest("/custom-headers", {
            headers: { "X-Custom-Header": "value" },
        });

        expect(mockFetch).toHaveBeenCalledWith(
            `${API_BASE_URL}/custom-headers`,
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-Custom-Header": "value",
                },
                body: undefined,
            }
        );
    });

    it("should not stringify body if not an object", async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({}), {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" },
            })
        );

        await apiRequest("/plain-text-body", {
            method: "POST",
            body: "some text",
        });

        expect(mockFetch).toHaveBeenCalledWith(
            `${API_BASE_URL}/plain-text-body`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "some text",
            }
        );
    });
});
