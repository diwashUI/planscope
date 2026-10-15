import { describe, expect, it } from "vitest";
import { formatMs, nodeLabel, parsePlan, PlanParseError } from "./plan";

const SIMPLE = JSON.stringify([
  {
    Plan: {
      "Node Type": "Seq Scan",
      "Relation Name": "users",
      "Actual Startup Time": 0.1,
      "Actual Total Time": 10.5,
      "Actual Rows": 1000,
      "Actual Loops": 1,
      "Plan Rows": 1000,
      "Total Cost": 100.0,
    },
    "Planning Time": 0.5,
    "Execution Time": 10.8,
  },
]);

const NESTED = JSON.stringify([
  {
    Plan: {
      "Node Type": "Nested Loop",
      "Actual Startup Time": 0.1,
      "Actual Total Time": 120.0,
      "Actual Rows": 2000,
      "Actual Loops": 1,
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "customers",
          "Filter": "country = 'NP'",
          "Rows Removed by Filter": 8000,
          "Actual Startup Time": 0.05,
          "Actual Total Time": 2.0,
          "Actual Rows": 2000,
          "Actual Loops": 1,
        },
        {
          "Node Type": "Index Scan",
          "Relation Name": "orders",
          "Index Name": "orders_customer_id_idx",
          "Actual Startup Time": 0.02,
          "Actual Total Time": 0.05,
          "Actual Rows": 3,
          "Actual Loops": 2000,
        },
      ],
    },
    "Planning Time": 1.2,
    "Execution Time": 120.0,
  },
]);

describe("parsePlan", () => {
  it("parses a minimal single-node plan", () => {
    const p = parsePlan(SIMPLE);
    expect(p.nodes).toHaveLength(1);
    expect(p.root.nodeType).toBe("Seq Scan");
    expect(p.root.relationName).toBe("users");
  });

  it("throws a friendly error on invalid JSON", () => {
    expect(() => parsePlan("EXPLAIN SELECT 1")).toThrow(PlanParseError);
    expect(() => parsePlan("EXPLAIN SELECT 1")).toThrow(/JSON/);
  });

  it("throws a friendly error on empty input", () => {
    expect(() => parsePlan("   ")).toThrow(/paste/i);
  });

  it("throws when there is no Plan key", () => {
    expect(() => parsePlan(JSON.stringify([{ foo: 1 }]))).toThrow(/FORMAT JSON/);
  });

  it("accepts a bare object (not wrapped in an array)", () => {
    const p = parsePlan(JSON.stringify({ Plan: { "Node Type": "Seq Scan" } }));
    expect(p.nodes).toHaveLength(1);
  });

  it("builds parent/child links and depths", () => {
    const p = parsePlan(NESTED);
    expect(p.nodes).toHaveLength(3);
    expect(p.root.children).toHaveLength(2);
    expect(p.root.children[0].parentId).toBe(p.root.id);
    expect(p.root.children[0].depth).toBe(1);
    expect(p.root.depth).toBe(0);
  });

  it("computes exclusive time as inclusive minus children", () => {
    const p = parsePlan(NESTED);
    // inner index scan: 0.05ms * 2000 loops = 100 inclusive
    const inner = p.root.children[1];
    expect(inner.inclusiveTime).toBeCloseTo(100, 6);
    // root: 120 - (2 + 100) = 18
    expect(p.root.exclusiveTime).toBeCloseTo(18, 6);
  });

  it("clamps exclusive time at zero when children exceed the parent", () => {
    const p = parsePlan(
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Nested Loop",
            "Actual Total Time": 5,
            "Actual Loops": 1,
            Plans: [{ "Node Type": "Seq Scan", "Actual Total Time": 9, "Actual Loops": 1 }],
          },
        },
      ])
    );
    expect(p.root.exclusiveTime).toBe(0);
  });

  it("multiplies actual time by loops for inclusive time", () => {
    const p = parsePlan(NESTED);
    const inner = p.root.children[1];
    expect(inner.actualLoops).toBe(2000);
    expect(inner.inclusiveTime).toBeCloseTo(0.05 * 2000, 6);
  });

  it("orders execution children-before-parent (post-order)", () => {
    const p = parsePlan(NESTED);
    const order = p.executionOrder.map((n) => n.nodeType);
    expect(order).toEqual(["Seq Scan", "Index Scan", "Nested Loop"]);
    expect(p.executionOrder[0].orderIndex).toBe(0);
  });

  it("finds the slowest node by exclusive time", () => {
    const p = parsePlan(NESTED);
    expect(p.slowest.nodeType).toBe("Index Scan");
    expect(p.slowest.exclusiveTime).toBeCloseTo(100, 6);
  });

  it("builds the critical path from root to slowest", () => {
    const p = parsePlan(NESTED);
    expect(p.criticalPathIds).toEqual([p.root.id, p.slowest.id]);
  });

  it("sums rows removed by filter", () => {
    const p = parsePlan(NESTED);
    expect(p.totalRowsRemoved).toBe(8000);
  });

  it("extracts planning and execution time", () => {
    const p = parsePlan(SIMPLE);
    expect(p.executionTime).toBe(10.8);
    expect(p.planningTime).toBe(0.5);
  });

  it("handles EXPLAIN without ANALYZE (no actuals)", () => {
    const p = parsePlan(JSON.stringify([{ Plan: { "Node Type": "Seq Scan", "Plan Rows": 100 } }]));
    expect(p.root.exclusiveTime).toBe(0);
    expect(p.root.exclusivePct).toBe(0);
    expect(p.executionTime).toBeNull();
  });

  it("computes exclusivePct relative to root inclusive time", () => {
    const p = parsePlan(NESTED);
    // inner: 100 / 120 * 100
    expect(p.slowest.exclusivePct).toBeCloseTo((100 / 120) * 100, 6);
  });
});

describe("nodeLabel", () => {
  it("labels relation and index", () => {
    const p = parsePlan(NESTED);
    expect(nodeLabel(p.root.children[1])).toBe("Index Scan on orders using orders_customer_id_idx");
    expect(nodeLabel(p.root)).toBe("Nested Loop");
  });
});

describe("formatMs", () => {
  it("formats sub-ms, ms and second ranges", () => {
    expect(formatMs(0.042)).toBe("0.042 ms");
    expect(formatMs(42.5)).toBe("42.50 ms");
    expect(formatMs(1500)).toBe("1.50 s");
  });
});
