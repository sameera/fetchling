/**
 * Unit tests for hooks-factory.ts
 *
 * Tests the React hooks for resource operations with TanStack Query integration.
 * NOTE: These tests verify the CURRENT implementation which has duplicated logic.
 * After refactoring to delegate to operations, these tests should still pass.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type {
    ListParams,
    QueryKeys,
    ResourceOperations,
} from "../types";
import { createHooks, type HooksConfig } from "./hooks-factory";

// Test entity type
interface TestUser {
    id: string;
    name: string;
    email: string;
}

// Helper to create QueryClient wrapper
function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
            mutations: {
                retry: false,
            },
        },
    });

    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe("createHooks", () => {
    let mockQueryKeys: QueryKeys<TestUser, string>;
    let mockOperations: ResourceOperations<TestUser, string>;
    let config: HooksConfig<TestUser, string>;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create mock query keys
        mockQueryKeys = {
            all: ["users"],
            lists: () => ["users", "list"] as const,
            list: (params?: ListParams) => ["users", "list", params] as const,
            detail: (id: string) => ["users", "detail", id] as const,
        };

        // Create mock operations
        mockOperations = {
            getById: vi.fn(),
            list: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn(),
        };

        // Create test config
        config = {
            name: "users",
            baseUrl: "/api/users",
            getTable: vi.fn() as any,
            normalizer: {} as any,
            urlBuilder: {} as any,
            queryKeys: mockQueryKeys,
            operations: mockOperations,
        };
    });

    describe("useGetById", () => {
        it("should auto-enable when id is defined", async () => {
            const testUser: TestUser = {
                id: "user1",
                name: "Test User",
                email: "test@example.com",
            };

            vi.mocked(mockOperations.getById).mockResolvedValue(testUser);

            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useGetById("user1"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.getById).toHaveBeenCalledWith("user1");
            expect(result.current.data).toEqual(testUser);
        });

        it("should disable when id is undefined", () => {
            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useGetById(undefined), {
                wrapper: createWrapper(),
            });

            expect(result.current.isPending).toBe(true);
            expect(result.current.fetchStatus).toBe("idle");
            expect(mockOperations.getById).not.toHaveBeenCalled();
        });

        it("should respect explicit enabled override (disable even with id)", () => {
            const hooks = createHooks(config);
            const { result } = renderHook(
                () => hooks.useGetById("user1", { enabled: false }),
                {
                    wrapper: createWrapper(),
                }
            );

            expect(result.current.isPending).toBe(true);
            expect(result.current.fetchStatus).toBe("idle");
            expect(mockOperations.getById).not.toHaveBeenCalled();
        });
    });

    describe("useList", () => {
        it("should auto-enable when all params are defined", async () => {
            const testUsers: TestUser[] = [
                { id: "user1", name: "User 1", email: "user1@example.com" },
            ];

            vi.mocked(mockOperations.list).mockResolvedValue(testUsers);

            const hooks = createHooks(config);
            const { result } = renderHook(
                () => hooks.useList({ role: "admin", active: true }),
                {
                    wrapper: createWrapper(),
                }
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.list).toHaveBeenCalledWith({
                role: "admin",
                active: true,
            });
            expect(result.current.data).toEqual(testUsers);
        });

        it("should disable when any param is undefined", () => {
            const hooks = createHooks(config);
            const { result } = renderHook(
                () => hooks.useList({ role: undefined, active: true }),
                {
                    wrapper: createWrapper(),
                }
            );

            expect(result.current.isPending).toBe(true);
            expect(result.current.fetchStatus).toBe("idle");
            expect(mockOperations.list).not.toHaveBeenCalled();
        });

        it("should auto-enable when params is undefined", async () => {
            const testUsers: TestUser[] = [
                { id: "user1", name: "User 1", email: "user1@example.com" },
            ];

            vi.mocked(mockOperations.list).mockResolvedValue(testUsers);

            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useList(undefined), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.list).toHaveBeenCalledWith(undefined);
            expect(result.current.data).toEqual(testUsers);
        });
    });

    describe("useCreate", () => {
        it("should call operations.create on mutate", async () => {
            const newUserData = { name: "New User", email: "new@example.com" };
            const createdUser: TestUser = {
                id: "user1",
                ...newUserData,
            };

            vi.mocked(mockOperations.create).mockResolvedValue(createdUser);

            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useCreate(), {
                wrapper: createWrapper(),
            });

            result.current.mutate(newUserData);

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.create).toHaveBeenCalledWith(newUserData);
            expect(result.current.data).toEqual(createdUser);
        });
    });

    describe("useUpdate", () => {
        it("should call operations.update with id and data", async () => {
            const updateData = { name: "Updated Name" };
            const updatedUser: TestUser = {
                id: "user1",
                name: "Updated Name",
                email: "user1@example.com",
            };

            vi.mocked(mockOperations.update).mockResolvedValue(updatedUser);

            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useUpdate(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ id: "user1", data: updateData });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.update).toHaveBeenCalledWith(
                "user1",
                updateData
            );
            expect(result.current.data).toEqual(updatedUser);
        });
    });

    describe("useDelete", () => {
        it("should call operations.remove with id", async () => {
            vi.mocked(mockOperations.remove).mockResolvedValue(undefined);

            const hooks = createHooks(config);
            const { result } = renderHook(() => hooks.useDelete(), {
                wrapper: createWrapper(),
            });

            result.current.mutate("user1");

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockOperations.remove).toHaveBeenCalledWith("user1");
        });
    });
});
