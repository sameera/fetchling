import React, { type ReactNode } from "react";
import {
    type QueryClient as IQueryClient,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./api";
import { Query } from "./query";

// Mock the apiRequest function from the local API module
vi.mock("./api", () => ({
    apiRequest: vi.fn(),
    ApiError: class extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.name = "ApiError";
            this.status = status;
        }
    },
}));

// Mock the Dexie library
vi.mock("dexie", async () => {
    const actualDexie = await vi.importActual("dexie");

    // In-memory store for our mock database
    const db: Record<string, Map<string, any>> = {};
    const mockTables: Record<string, any> = {};

    function getMockTable(name: string, keyFields?: string[]) {
        if (mockTables[name]) return mockTables[name];

        if (!db[name]) {
            db[name] = new Map();
        }

        const getStoreKey = (key: any) => {
            if (typeof key === "object" && Array.isArray(key)) {
                return JSON.stringify(key);
            }
            if (typeof key === "object" && key !== null) {
                return JSON.stringify(keyFields?.map((k) => (key as any)[k]));
            }
            return key;
        };

        const getItemKey = (item: any) => {
            if (!keyFields || keyFields.length === 0) {
                return item.id;
            }
            return JSON.stringify(keyFields.map((k) => item[k]));
        };

        const table = {
            name,
            get: vi.fn((key) => {
                const storeKey = getStoreKey(key);
                return Promise.resolve(db[name].get(storeKey));
            }),
            put: vi.fn((item) => {
                const storeKey = getItemKey(item);
                db[name].set(storeKey, item);
                return Promise.resolve(storeKey);
            }),
            bulkPut: vi.fn((items) => {
                items.forEach((item) => {
                    const storeKey = getItemKey(item);
                    db[name].set(storeKey, item);
                });
                return Promise.resolve();
            }),
            delete: vi.fn((key) => {
                const storeKey = getStoreKey(key);
                db[name].delete(storeKey);
                return Promise.resolve();
            }),
            toArray: vi.fn(() =>
                Promise.resolve(Array.from(db[name].values()))
            ),
            clear: vi.fn(() => {
                db[name].clear();
                return Promise.resolve();
            }),
        };
        mockTables[name] = table;
        return table;
    }

    class MockDexie {
        _stores: Record<string, string> = {};
        _version = 1;
        _isOpen = false;
        _keyFields: Record<string, string[]> = {};

        constructor() {
            // No-op constructor to avoid real Dexie setup
        }

        static __reset() {
            Object.keys(db).forEach((key) => delete db[key]);
            Object.keys(mockTables).forEach((key) => {
                const table = mockTables[key];
                table.get.mockClear();
                table.put.mockClear();
                table.bulkPut.mockClear();
                table.delete.mockClear();
                table.toArray.mockClear();
                table.clear.mockClear();
                delete mockTables[key];
            });
        }

        version(v: number) {
            this._version = v;
            return {
                stores: (stores: Record<string, string>) => {
                    Object.assign(this._stores, stores);
                    for (const tableName in stores) {
                        const schema = stores[tableName];
                        if (schema.startsWith("[")) {
                            this._keyFields[tableName] = schema
                                .slice(1, -1)
                                .split("+");
                        }
                    }
                },
            };
        }

        table(name: string) {
            return getMockTable(name, this._keyFields[name]);
        }

        open() {
            this._isOpen = true;
            return Promise.resolve(this);
        }

        close() {
            this._isOpen = false;
        }

        isOpen() {
            return this._isOpen;
        }

        get verno() {
            return this._version;
        }
    }

    return {
        default: MockDexie,
        Table: actualDexie.Table,
    };
});

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: Infinity,
            },
        },
    });

const createWrapper =
    (client: IQueryClient) =>
    ({ children }: { children: ReactNode }) =>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>;

interface TestEntity {
    id: string;
    name: string;
}

const mockedApiRequest = vi.mocked(api.apiRequest);

describe("Query Resource Hooks", () => {
    let query: Query;
    let resource: ReturnType<Query["createResource"]>;
    let queryClient: IQueryClient;
    let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

    beforeEach(async () => {
        query = new Query();
        resource = query.createResource<TestEntity, string>({
            name: "test",
            baseUrl: "/api/test",
        });
        await query.initialize();
        queryClient = createTestQueryClient();
        wrapper = createWrapper(queryClient);
    });

    afterEach(() => {
        vi.clearAllMocks();
        (Dexie as any).__reset();
        queryClient.clear();
    });

    describe("useGetById", () => {
        it("should fetch an item by ID and cache it in Dexie", async () => {
            const testItem: TestEntity = { id: "1", name: "Test Item" };
            mockedApiRequest.mockResolvedValue({ data: testItem });

            const { result } = renderHook(() => resource.useGetById("1"), {
                wrapper,
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockedApiRequest).toHaveBeenCalledWith("/api/test/1");
            expect(result.current.data).toEqual(testItem);

            const table = query.getTable("test");
            expect(table.put).toHaveBeenCalledWith(testItem);
        });

        it("should return undefined and not fetch if id is undefined", () => {
            const { result } = renderHook(
                () => resource.useGetById(undefined),
                {
                    wrapper,
                }
            );

            expect(result.current.data).toBeUndefined();
            expect(result.current.isFetching).toBe(false);
            expect(mockedApiRequest).not.toHaveBeenCalled();
        });
    });

    describe("useList", () => {
        it("should fetch a list of items and cache them in Dexie", async () => {
            const testItems: TestEntity[] = [
                { id: "1", name: "Item 1" },
                { id: "2", name: "Item 2" },
            ];
            mockedApiRequest.mockResolvedValue({ data: testItems });

            const { result } = renderHook(() => resource.useList(), {
                wrapper,
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(mockedApiRequest).toHaveBeenCalledWith("/api/test");
            expect(result.current.data).toEqual(testItems);

            const table = query.getTable("test");
            expect(table.bulkPut).toHaveBeenCalledWith(testItems);
        });
    });

    describe("useCreate", () => {
        it("should create an item, cache it, and invalidate list queries", async () => {
            const newItem = { name: "New Item" };
            const createdItem: TestEntity = { id: "3", ...newItem };
            mockedApiRequest.mockResolvedValue({ data: createdItem });
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

            const { result } = renderHook(() => resource.useCreate(), {
                wrapper,
            });

            await act(async () => {
                await result.current.mutateAsync(newItem as any);
            });

            expect(mockedApiRequest).toHaveBeenCalledWith("/api/test", {
                method: "POST",
                body: JSON.stringify(newItem),
            });

            const table = query.getTable("test");
            expect(table.put).toHaveBeenCalledWith(createdItem);

            expect(invalidateSpy).toHaveBeenCalledWith({
                queryKey: resource.queryKeys.lists(),
            });
        });
    });
});

describe("Query Resource Hooks with Composite Keys", () => {
    let query: Query;
    let resource: ReturnType<Query["createResource"]>;
    let queryClient: IQueryClient;
    let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

    interface CompositeKeyEntity {
        spaceId: string;
        tagId: string;
        name: string;
    }

    type CompositeId = Pick<CompositeKeyEntity, "spaceId" | "tagId">;

    beforeEach(async () => {
        query = new Query();
        resource = query.createResource<CompositeKeyEntity, CompositeId>({
            name: "composite",
            baseUrl: "/api/composite",
            keyFields: ["spaceId", "tagId"],
        });
        await query.initialize();

        queryClient = createTestQueryClient();
        wrapper = createWrapper(queryClient);
    });

    afterEach(() => {
        vi.clearAllMocks();
        (Dexie as any).__reset();
        queryClient.clear();
    });

    it("useDelete should delete an item using a composite key", async () => {
        const id: CompositeId = { spaceId: "s1", tagId: "t1" };
        mockedApiRequest.mockResolvedValue(undefined);

        const { result } = renderHook(() => resource.useDelete(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync(id);
        });

        expect(mockedApiRequest).toHaveBeenCalledWith("/api/composite/s1/t1", {
            method: "DELETE",
        });

        const table = query.getTable("composite");
        // Dexie requires composite keys as arrays in keyFields order
        expect(table.delete).toHaveBeenCalledWith(["s1", "t1"]);
    });
});
