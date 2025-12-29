/**
 * Unit tests for operations-factory.ts
 *
 * Tests the raw CRUD operations for resources with SWR behavior.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Table } from "dexie";

import { ApiError, apiRequest } from "../api";
import type { EntityNormalizer } from "../core/entity-normalizer";
import type { URLBuilder } from "../core/url-builder";
import type { ListParams } from "../types";
import { createOperations, type OperationsConfig } from "./operations-factory";

// Mock the apiRequest module
vi.mock("../api", async () => {
    const actual = await vi.importActual("../api");
    return {
        ...actual,
        apiRequest: vi.fn(),
    };
});

// Mock buildDexieKey
vi.mock("../core/id-utils", () => ({
    buildDexieKey: vi.fn((id: unknown, keyFields?: string[]) => {
        if (
            keyFields &&
            keyFields.length > 0 &&
            typeof id === "object" &&
            id !== null
        ) {
            return keyFields.map((field) => (id as Record<string, unknown>)[field]);
        }
        return id;
    }),
}));

// Test entity types
interface TestUser {
    id: string;
    name: string;
    email: string;
}

interface TestTag {
    spaceId: string;
    tagName: string;
    color: string;
}

describe("createOperations", () => {
    let mockTable: Table<TestUser, string>;
    let mockNormalizer: EntityNormalizer<TestUser>;
    let mockUrlBuilder: URLBuilder<TestUser, string>;
    let config: OperationsConfig<TestUser, string>;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock console.error
        consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        // Create mock Dexie table
        mockTable = {
            get: vi.fn(),
            put: vi.fn(),
            bulkPut: vi.fn(),
            delete: vi.fn(),
            toArray: vi.fn(),
        } as unknown as Table<TestUser, string>;

        // Create mock normalizer
        mockNormalizer = {
            normalize: vi.fn((data: TestUser) => data),
            normalizeMany: vi.fn((data: TestUser[]) => data),
        } as unknown as EntityNormalizer<TestUser>;

        // Create mock URL builder
        mockUrlBuilder = {
            buildIdUrl: vi.fn((id: string) => `/api/users/${id}`),
            buildUrl: vi.fn((base: string, params?: ListParams) => {
                if (!params) return base;
                const query = new URLSearchParams(
                    Object.entries(params).map(([k, v]) => [k, String(v)])
                ).toString();
                return `${base}?${query}`;
            }),
        } as unknown as URLBuilder<TestUser, string>;

        // Create test config
        config = {
            name: "users",
            baseUrl: "/api/users",
            getTable: () => mockTable,
            normalizer: mockNormalizer,
            urlBuilder: mockUrlBuilder,
        };
    });

    describe("getById", () => {
        it("should return cached data immediately if available", async () => {
            const cachedUser: TestUser = {
                id: "user1",
                name: "Cached User",
                email: "cached@example.com",
            };
            const freshUser: TestUser = {
                id: "user1",
                name: "Fresh User",
                email: "fresh@example.com",
            };

            vi.mocked(mockTable.get).mockResolvedValue(cachedUser);
            vi.mocked(apiRequest).mockResolvedValue({ data: freshUser });

            const operations = createOperations(config);
            const result = await operations.getById("user1");

            // Should return cached data (not wait for network)
            expect(result).toEqual(cachedUser);
            expect(mockTable.get).toHaveBeenCalledWith("user1");
            expect(apiRequest).toHaveBeenCalledWith("/api/users/user1");
        });

        it("should fetch from network and update Dexie when cache is empty", async () => {
            const freshUser: TestUser = {
                id: "user1",
                name: "Fresh User",
                email: "fresh@example.com",
            };

            vi.mocked(mockTable.get).mockResolvedValue(undefined);
            vi.mocked(apiRequest).mockResolvedValue({ data: freshUser });

            const operations = createOperations(config);
            const result = await operations.getById("user1");

            // Should wait for network and return fresh data
            expect(result).toEqual(freshUser);
            expect(mockTable.get).toHaveBeenCalledWith("user1");
            expect(apiRequest).toHaveBeenCalledWith("/api/users/user1");
            expect(mockTable.put).toHaveBeenCalledWith(freshUser);
        });

        it("should handle 404 errors gracefully (return null)", async () => {
            const notFoundError = new ApiError("Not found", 404, "Not Found");

            vi.mocked(mockTable.get).mockResolvedValue(undefined);
            vi.mocked(apiRequest).mockRejectedValue(notFoundError);

            const operations = createOperations(config);
            const result = await operations.getById("nonexistent");

            expect(result).toBeNull();
            expect(consoleSpy).not.toHaveBeenCalled(); // 404 should not log error
        });

        it("should handle network errors and return cached data", async () => {
            const cachedUser: TestUser = {
                id: "user1",
                name: "Cached User",
                email: "cached@example.com",
            };
            const networkError = new Error("Network failure");

            vi.mocked(mockTable.get).mockResolvedValue(cachedUser);
            vi.mocked(apiRequest).mockRejectedValue(networkError);

            const operations = createOperations(config);
            const result = await operations.getById("user1");

            // Should return cached data when network fails
            expect(result).toEqual(cachedUser);

            // Wait for background network promise to complete
            await vi.waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(
                    "[Query] Failed to fetch users by ID: ",
                    networkError
                );
            });
        });

        it("should handle network errors when cache is empty", async () => {
            const networkError = new Error("Network failure");

            vi.mocked(mockTable.get).mockResolvedValue(undefined);
            vi.mocked(apiRequest).mockRejectedValue(networkError);

            const operations = createOperations(config);
            const result = await operations.getById("user1");

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                "[Query] Failed to fetch users by ID: ",
                networkError
            );
        });
    });

    describe("list", () => {
        it("should return cached data immediately if available", async () => {
            const cachedUsers: TestUser[] = [
                { id: "user1", name: "User 1", email: "user1@example.com" },
            ];
            const freshUsers: TestUser[] = [
                { id: "user1", name: "User 1 Updated", email: "user1@example.com" },
                { id: "user2", name: "User 2", email: "user2@example.com" },
            ];

            vi.mocked(mockTable.toArray).mockResolvedValue(cachedUsers);
            vi.mocked(apiRequest).mockResolvedValue({ data: freshUsers });

            const operations = createOperations(config);
            const result = await operations.list();

            // Should return cached data (not wait for network)
            expect(result).toEqual(cachedUsers);
            expect(mockTable.toArray).toHaveBeenCalled();
            expect(apiRequest).toHaveBeenCalledWith("/api/users");
        });

        it("should fetch from network with params and update Dexie", async () => {
            const params: ListParams = { role: "admin", active: true };
            const freshUsers: TestUser[] = [
                { id: "user1", name: "Admin User", email: "admin@example.com" },
            ];

            vi.mocked(mockTable.toArray).mockResolvedValue([]);
            vi.mocked(apiRequest).mockResolvedValue({ data: freshUsers });

            const operations = createOperations(config);
            const result = await operations.list(params);

            expect(result).toEqual(freshUsers);
            expect(mockUrlBuilder.buildUrl).toHaveBeenCalledWith(
                "/api/users",
                params
            );
            expect(apiRequest).toHaveBeenCalledWith(
                "/api/users?role=admin&active=true"
            );
            expect(mockTable.bulkPut).toHaveBeenCalledWith(freshUsers);
        });

        it("should return network data when cache is empty", async () => {
            const freshUsers: TestUser[] = [
                { id: "user1", name: "User 1", email: "user1@example.com" },
            ];

            vi.mocked(mockTable.toArray).mockResolvedValue([]);
            vi.mocked(apiRequest).mockResolvedValue({ data: freshUsers });

            const operations = createOperations(config);
            const result = await operations.list();

            expect(result).toEqual(freshUsers);
            expect(mockTable.bulkPut).toHaveBeenCalledWith(freshUsers);
        });

        it("should handle network errors and return empty array", async () => {
            const networkError = new Error("Network failure");

            vi.mocked(mockTable.toArray).mockResolvedValue([]);
            vi.mocked(apiRequest).mockRejectedValue(networkError);

            const operations = createOperations(config);
            const result = await operations.list();

            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                "[Query] Failed to fetch users list: ",
                networkError
            );
        });

        describe("filtering cached data", () => {
            it("should filter cached data based on single param", async () => {
                const allUsers: TestUser[] = [
                    { id: "1", name: "Admin", email: "admin@example.com" },
                    { id: "2", name: "User", email: "user@example.com" },
                    { id: "3", name: "Admin2", email: "admin2@example.com" },
                ];

                vi.mocked(mockTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {}) // Never resolves (simulates slow network)
                );

                const operations = createOperations(config);
                const result = await operations.list({ name: "Admin" });

                // Should return filtered cached data immediately
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe("1");
            });

            it("should filter cached data based on multiple params (AND logic)", async () => {
                interface ExtendedUser extends TestUser {
                    role?: string;
                    status?: string;
                }

                const allUsers: ExtendedUser[] = [
                    { id: "1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" },
                    { id: "2", name: "User", email: "user@example.com", role: "user", status: "active" },
                    { id: "3", name: "Admin2", email: "admin2@example.com", role: "admin", status: "inactive" },
                ];

                const extendedTable = mockTable as unknown as Table<ExtendedUser, string>;
                vi.mocked(extendedTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {}) // Never resolves
                );

                const extendedConfig = {
                    ...config,
                    getTable: () => extendedTable,
                } as unknown as OperationsConfig<ExtendedUser, string>;

                const operations = createOperations(extendedConfig);
                const result = await operations.list({ role: "admin", status: "active" });

                // Should return only users matching BOTH params
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe("1");
            });

            it("should return all records when params is undefined", async () => {
                const allUsers: TestUser[] = [
                    { id: "1", name: "Admin", email: "admin@example.com" },
                    { id: "2", name: "User", email: "user@example.com" },
                ];

                vi.mocked(mockTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {})
                );

                const operations = createOperations(config);
                const result = await operations.list();

                expect(result).toEqual(allUsers);
            });

            it("should return all records when params is empty object", async () => {
                const allUsers: TestUser[] = [
                    { id: "1", name: "Admin", email: "admin@example.com" },
                    { id: "2", name: "User", email: "user@example.com" },
                ];

                vi.mocked(mockTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {})
                );

                const operations = createOperations(config);
                const result = await operations.list({});

                expect(result).toEqual(allUsers);
            });

            it("should handle array params correctly", async () => {
                interface ExtendedUser extends TestUser {
                    status?: string;
                }

                const allUsers: ExtendedUser[] = [
                    { id: "1", name: "User1", email: "user1@example.com", status: "active" },
                    { id: "2", name: "User2", email: "user2@example.com", status: "inactive" },
                    { id: "3", name: "User3", email: "user3@example.com", status: "pending" },
                ];

                const extendedTable = mockTable as unknown as Table<ExtendedUser, string>;
                vi.mocked(extendedTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {})
                );

                const extendedConfig = {
                    ...config,
                    getTable: () => extendedTable,
                } as unknown as OperationsConfig<ExtendedUser, string>;

                const operations = createOperations(extendedConfig);
                const result = await operations.list({
                    status: ["active", "pending"],
                });

                expect(result).toHaveLength(2);
                expect(result.map(u => u.status)).toEqual(["active", "pending"]);
            });

            it("should wait for network when filtered cache is empty", async () => {
                const allCachedUsers: TestUser[] = [
                    { id: "1", name: "User", email: "user@example.com" },
                ];
                const freshUsers: TestUser[] = [
                    { id: "2", name: "Admin", email: "admin@example.com" },
                ];

                vi.mocked(mockTable.toArray).mockResolvedValue(allCachedUsers);
                vi.mocked(apiRequest).mockResolvedValue({ data: freshUsers });

                const operations = createOperations(config);
                const result = await operations.list({ name: "Admin" });

                // Cache has data but none matches filter, so should wait for network
                expect(result).toEqual(freshUsers);
            });

            it("should handle boolean and number params", async () => {
                interface ExtendedUser extends TestUser {
                    active?: boolean;
                    score?: number;
                }

                const allItems: ExtendedUser[] = [
                    { id: "1", name: "User1", email: "user1@example.com", active: true, score: 100 },
                    { id: "2", name: "User2", email: "user2@example.com", active: false, score: 50 },
                    { id: "3", name: "User3", email: "user3@example.com", active: true, score: 75 },
                ];

                const extendedTable = mockTable as unknown as Table<ExtendedUser, string>;
                vi.mocked(extendedTable.toArray).mockResolvedValue(allItems);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {})
                );

                const extendedConfig = {
                    ...config,
                    getTable: () => extendedTable,
                } as unknown as OperationsConfig<ExtendedUser, string>;

                const operations = createOperations(extendedConfig);
                const result = await operations.list({
                    active: true,
                    score: 100,
                });

                expect(result).toHaveLength(1);
                expect(result[0].id).toBe("1");
            });

            it("should skip undefined param values", async () => {
                const allUsers: TestUser[] = [
                    { id: "1", name: "Admin", email: "admin@example.com" },
                    { id: "2", name: "User", email: "user@example.com" },
                ];

                vi.mocked(mockTable.toArray).mockResolvedValue(allUsers);
                vi.mocked(apiRequest).mockImplementation(
                    () => new Promise(() => {})
                );

                const operations = createOperations(config);
                const result = await operations.list({
                    name: "Admin",
                    email: undefined,
                });

                // Should only filter by name, ignoring undefined email
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe("1");
            });
        });
    });

    describe("create", () => {
        it("should POST data to API and store in Dexie", async () => {
            const newUserData = { name: "New User", email: "new@example.com" };
            const createdUser: TestUser = {
                id: "user1",
                ...newUserData,
            };

            vi.mocked(apiRequest).mockResolvedValue({ data: createdUser });

            const operations = createOperations(config);
            const result = await operations.create(newUserData);

            expect(result).toEqual(createdUser);
            expect(apiRequest).toHaveBeenCalledWith("/api/users", {
                method: "POST",
                body: JSON.stringify(newUserData),
            });
            expect(mockNormalizer.normalize).toHaveBeenCalledWith(createdUser);
            expect(mockTable.put).toHaveBeenCalledWith(createdUser);
        });
    });

    describe("update", () => {
        it("should PATCH data to API and update Dexie", async () => {
            const updateData = { name: "Updated Name" };
            const updatedUser: TestUser = {
                id: "user1",
                name: "Updated Name",
                email: "user1@example.com",
            };

            vi.mocked(apiRequest).mockResolvedValue({ data: updatedUser });

            const operations = createOperations(config);
            const result = await operations.update("user1", updateData);

            expect(result).toEqual(updatedUser);
            expect(mockUrlBuilder.buildIdUrl).toHaveBeenCalledWith("user1");
            expect(apiRequest).toHaveBeenCalledWith("/api/users/user1", {
                method: "PATCH",
                body: JSON.stringify(updateData),
            });
            expect(mockNormalizer.normalize).toHaveBeenCalledWith(updatedUser);
            expect(mockTable.put).toHaveBeenCalledWith(updatedUser);
        });
    });

    describe("remove", () => {
        it("should DELETE via API and remove from Dexie", async () => {
            vi.mocked(apiRequest).mockResolvedValue(undefined);

            const operations = createOperations(config);
            await operations.remove("user1");

            expect(mockUrlBuilder.buildIdUrl).toHaveBeenCalledWith("user1");
            expect(apiRequest).toHaveBeenCalledWith("/api/users/user1", {
                method: "DELETE",
            });
            expect(mockTable.delete).toHaveBeenCalledWith("user1");
        });

        it("should handle composite keys with buildDexieKey", async () => {
            const mockTagTable: Table<TestTag, { spaceId: string; tagName: string }> = {
                delete: vi.fn(),
            } as unknown as Table<TestTag, { spaceId: string; tagName: string }>;

            const tagConfig: OperationsConfig<TestTag, { spaceId: string; tagName: string }> = {
                name: "tags",
                baseUrl: "/api/tags",
                keyFields: ["spaceId", "tagName"],
                getTable: () => mockTagTable,
                normalizer: {
                    normalize: vi.fn((data: TestTag) => data),
                    normalizeMany: vi.fn((data: TestTag[]) => data),
                } as unknown as EntityNormalizer<TestTag>,
                urlBuilder: {
                    buildIdUrl: vi.fn(() => "/api/tags/space1/urgent"),
                    buildUrl: vi.fn((base: string) => base),
                } as unknown as URLBuilder<TestTag, { spaceId: string; tagName: string }>,
            };

            vi.mocked(apiRequest).mockResolvedValue(undefined);

            const operations = createOperations(tagConfig);
            await operations.remove({ spaceId: "space1", tagName: "urgent" });

            expect(apiRequest).toHaveBeenCalledWith("/api/tags/space1/urgent", {
                method: "DELETE",
            });
            // buildDexieKey should convert composite key to array
            expect(mockTagTable.delete).toHaveBeenCalledWith(["space1", "urgent"]);
        });
    });
});
