import { describe, expect, it } from "vitest";
import { filterEntities, matchesFilter } from "./filter-matcher";

describe("matchesFilter", () => {
    it("should return true when entity matches single param", () => {
        const entity = { id: "1", type: "note", status: "active" };
        const params = { type: "note" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should return false when entity does not match single param", () => {
        const entity = { id: "1", type: "note", status: "active" };
        const params = { type: "task" };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should return true when entity matches multiple params (AND logic)", () => {
        const entity = { id: "1", type: "note", status: "active" };
        const params = { type: "note", status: "active" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should return false when entity matches some but not all params", () => {
        const entity = { id: "1", type: "note", status: "active" };
        const params = { type: "note", status: "inactive" };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should handle array params with IN logic", () => {
        const entity = { id: "1", status: "active" };
        const params = { status: ["active", "pending"] };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should return false when entity value not in array param", () => {
        const entity = { id: "1", status: "inactive" };
        const params = { status: ["active", "pending"] };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should handle boolean params with type coercion", () => {
        const entity = { id: "1", active: true };
        const params = { active: true };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should handle number params with type coercion", () => {
        const entity = { id: "1", score: 100 };
        const params = { score: 100 };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should handle mixed types with string coercion", () => {
        const entity = { id: "1", count: 5, active: true };
        const params = { count: "5", active: "true" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should skip undefined param values", () => {
        const entity = { id: "1", type: "note", status: "active" };
        const params = { type: "note", status: undefined };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should return true for empty params object", () => {
        const entity = { id: "1", type: "note" };
        const params = {};

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should return false when entity missing required property", () => {
        const entity = { id: "1" };
        const params = { type: "note" };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should ignore sort parameter", () => {
        const entity = { id: "1", type: "note", sort: "title" };
        const params = { type: "note", sort: "createdAt" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should ignore fields parameter", () => {
        const entity = { id: "1", type: "note", fields: "id,title" };
        const params = { type: "note", fields: "id,title,content" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should ignore both special parameters", () => {
        const entity = { id: "1", type: "note" };
        const params = { type: "note", sort: "title", fields: "id,title" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should filter other params even when special params present", () => {
        const entity = { id: "1", type: "note" };
        const params = { type: "task", sort: "title", fields: "id" };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should match reference field with matching id", () => {
        const entity = { id: "1", type: { id: "abc123", name: "Note" } };
        const params = { type: "abc123" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should not match reference field with non-matching id", () => {
        const entity = { id: "1", type: { id: "abc123", name: "Note" } };
        const params = { type: "xyz789" };

        expect(matchesFilter(entity, params)).toBe(false);
    });

    it("should handle reference field with number id", () => {
        const entity = { id: "1", category: { id: 42, name: "Work" } };
        const params = { category: "42" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should match multiple params including reference field", () => {
        const entity = {
            id: "1",
            type: { id: "abc123", name: "Note" },
            status: "active",
        };
        const params = { type: "abc123", status: "active" };

        expect(matchesFilter(entity, params)).toBe(true);
    });

    it("should fail when one reference field doesn't match", () => {
        const entity = {
            id: "1",
            type: { id: "abc123", name: "Note" },
            status: "active",
        };
        const params = { type: "xyz789", status: "active" };

        expect(matchesFilter(entity, params)).toBe(false);
    });
});

describe("filterEntities", () => {
    const entities = [
        { id: "1", type: "note", status: "active", score: 100 },
        { id: "2", type: "task", status: "active", score: 50 },
        { id: "3", type: "note", status: "inactive", score: 75 },
        { id: "4", type: "task", status: "pending", score: 100 },
    ];

    it("should filter by single property", () => {
        const result = filterEntities(entities, { type: "note" });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("3");
    });

    it("should filter by multiple properties (AND logic)", () => {
        const result = filterEntities(entities, {
            type: "note",
            status: "active",
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("1");
    });

    it("should return all entities when params is undefined", () => {
        const result = filterEntities(entities, undefined);

        expect(result).toHaveLength(4);
        expect(result).toEqual(entities);
    });

    it("should return all entities when params is empty object", () => {
        const result = filterEntities(entities, {});

        expect(result).toHaveLength(4);
        expect(result).toEqual(entities);
    });

    it("should handle array params correctly", () => {
        const result = filterEntities(entities, {
            status: ["active", "pending"],
        });

        expect(result).toHaveLength(3);
        expect(result.map(e => e.id)).toEqual(["1", "2", "4"]);
    });

    it("should handle number params", () => {
        const result = filterEntities(entities, { score: 100 });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("4");
    });

    it("should handle boolean params", () => {
        const boolEntities = [
            { id: "1", active: true },
            { id: "2", active: false },
            { id: "3", active: true },
        ];

        const result = filterEntities(boolEntities, { active: true });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("3");
    });

    it("should return empty array when no matches", () => {
        const result = filterEntities(entities, { type: "nonexistent" });

        expect(result).toHaveLength(0);
        expect(result).toEqual([]);
    });

    it("should skip undefined params", () => {
        const result = filterEntities(entities, {
            type: "note",
            status: undefined,
        });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("3");
    });

    it("should return all entities when all params are undefined", () => {
        const result = filterEntities(entities, {
            type: undefined,
            status: undefined,
        });

        expect(result).toHaveLength(4);
        expect(result).toEqual(entities);
    });

    it("should handle complex filtering scenario", () => {
        const result = filterEntities(entities, {
            type: "task",
            status: ["active", "pending"],
            score: 100,
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("4");
    });

    it("should handle empty entities array", () => {
        const result = filterEntities([], { type: "note" });

        expect(result).toHaveLength(0);
        expect(result).toEqual([]);
    });

    it("should preserve entity objects (no mutation)", () => {
        const original = [...entities];
        filterEntities(entities, { type: "note" });

        expect(entities).toEqual(original);
    });

    it("should filter entities ignoring special params", () => {
        const result = filterEntities(entities, {
            type: "note",
            sort: "title",
            fields: "id,title",
        });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("3");
    });

    it("should filter entities with reference fields", () => {
        const refEntities = [
            {
                id: "1",
                type: { id: "abc123", name: "Note" },
                status: "active",
            },
            {
                id: "2",
                type: { id: "xyz789", name: "Task" },
                status: "active",
            },
            {
                id: "3",
                type: { id: "abc123", name: "Note" },
                status: "inactive",
            },
        ];

        const result = filterEntities(refEntities, { type: "abc123" });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("3");
    });

    it("should handle combination of regular, reference, and special params", () => {
        const complexEntities = [
            {
                id: "1",
                type: { id: "abc123", name: "Note" },
                status: "active",
            },
            {
                id: "2",
                type: { id: "xyz789", name: "Task" },
                status: "active",
            },
            {
                id: "3",
                type: { id: "abc123", name: "Note" },
                status: "inactive",
            },
            {
                id: "4",
                type: { id: "abc123", name: "Note" },
                status: "active",
            },
        ];

        const result = filterEntities(complexEntities, {
            type: "abc123",
            status: "active",
            sort: "title",
        });

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("1");
        expect(result[1].id).toBe("4");
    });
});
