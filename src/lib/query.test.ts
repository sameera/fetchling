import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createResourceAPI } from "./factories/resource-factory";
import { Query } from "./query";

// Mock the resource factory to avoid testing hook generation logic here
vi.mock("./factories/resource-factory", () => ({
    createResourceAPI: vi.fn(() => ({
        // Returning a dummy object as the resource API
        useList: vi.fn(),
        useGetById: vi.fn(),
        list: vi.fn(),
    })),
}));

// Mock Dexie
vi.mock("dexie", async () => {
    class MockDexie {
        _stores: Record<string, string> = {};
        _version = 1;
        _isOpen = false;

        constructor(name: string) {
            // no-op
        }

        version(v: number) {
            this._version = v;
            return {
                stores: (stores: Record<string, string>) => {
                    Object.assign(this._stores, stores);
                    return this; // fluent API
                },
            };
        }

        table(name: string) {
            // minimal mock of a table
            return {
                name,
                put: vi.fn(),
                get: vi.fn(),
            };
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
    };
});

describe("Query Class", () => {
    let query: Query;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        // Instantiate a fresh Query for each test
        query = new Query();
    });

    it("should initialize with no tables", () => {
        expect(query.size).toBe(0);
        expect(query.getRegisteredTables()).toEqual([]);
        expect(query.getPendingTables().size).toBe(0);
    });

    describe("registerTable", () => {
        it("should register a table in pending state", () => {
            query.registerTable("users", undefined, "/api/users");

            expect(query.size).toBe(1);
            expect(query.hasTable("users")).toBe(true);
            expect(query.getPendingTables().has("users")).toBe(true);
            // Not yet in registered list until initialized
            expect(query.getRegisteredTables()).not.toContain("users");
        });

        it("should register a table with composite keys", () => {
            query.registerTable("tags", ["space", "name"], "/api/tags");

            expect(query.hasTable("tags")).toBe(true);
            const pending = query.getPendingTables().get("tags");
            expect(pending?.keyFields).toEqual(["space", "name"]);
        });

        it("should throw error when registering duplicate table name", () => {
            query.registerTable("users", undefined, "/api/users");

            expect(() => {
                query.registerTable("users", undefined, "/api/users");
            }).toThrowError(/Resource "users" is already registered/);
        });
    });

    describe("initialize", () => {
        it("should move pending tables to registered tables", async () => {
            query.registerTable("users", undefined, "/api/users");
            query.registerTable("posts", ["id"], "/api/posts");

            expect(query.getPendingTables().size).toBe(2);

            await query.initialize();

            expect(query.getPendingTables().size).toBe(0);
            expect(query.getRegisteredTables()).toHaveLength(2);
            expect(query.getRegisteredTables()).toContain("users");
            expect(query.getRegisteredTables()).toContain("posts");
            expect(query.hasTable("users")).toBe(true);
        });

        it("should do nothing if no pending tables", async () => {
            await query.initialize();
            expect(query.size).toBe(0);
        });

        it("should allow incremental initialization", async () => {
            // First batch
            query.registerTable("users", undefined, "/api/users");
            await query.initialize();
            expect(query.getRegisteredTables()).toEqual(["users"]);

            // Second batch
            query.registerTable("posts", undefined, "/api/posts");
            await query.initialize();

            expect(query.getRegisteredTables()).toContain("users");
            expect(query.getRegisteredTables()).toContain("posts");
            expect(query.size).toBe(2);
        });
    });

    describe("getTable", () => {
        it("should return undefined for unknown tables", () => {
            expect(query.getTable("unknown")).toBeUndefined();
        });

        it("should return undefined for pending (uninitialized) tables", () => {
            query.registerTable("users", undefined, "/api/users");
            expect(query.getTable("users")).toBeUndefined();
        });

        it("should return table instance for initialized tables", async () => {
            query.registerTable("users", undefined, "/api/users");
            await query.initialize();

            const table = query.getTable("users");
            expect(table).toBeDefined();
            expect(table?.name).toBe("users");
        });
    });

    describe("createResource", () => {
        it("should register table and delegate to factory", () => {
            const config = {
                name: "comments",
                baseUrl: "/api/comments",
                keyFields: ["postId", "id"],
            };

            const resource = query.createResource(config);

            // Verify table registration
            expect(query.hasTable("comments")).toBe(true);
            expect(query.getPendingTables().has("comments")).toBe(true);

            // Verify delegation
            expect(createResourceAPI).toHaveBeenCalledWith(
                config,
                expect.any(Object) // expecting the registry instance
            );
            expect(resource).toBeDefined();
        });

        it("should fail if resource name is duplicate", () => {
            query.createResource({ name: "dup", baseUrl: "/1" });

            expect(() => {
                query.createResource({ name: "dup", baseUrl: "/2" });
            }).toThrowError(/Resource "dup" is already registered/);
        });
    });
});
