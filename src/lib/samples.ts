/** Three realistic EXPLAIN (ANALYZE, FORMAT JSON) outputs for one-click demos. */

export interface SamplePlan {
  id: string;
  name: string;
  blurb: string;
  json: string;
}

const seqScanHeavy = [
  {
    Plan: {
      "Node Type": "Limit",
      "Plan Rows": 10,
      "Actual Startup Time": 42.1,
      "Actual Total Time": 42.3,
      "Actual Rows": 10,
      "Actual Loops": 1,
      Plans: [
        {
          "Node Type": "Sort",
          "Sort Key": ["created_at"],
          "Sort Method": "external merge",
          "Disk Usage": 2048,
          "Plan Rows": 50000,
          "Actual Startup Time": 38.2,
          "Actual Total Time": 42.0,
          "Actual Rows": 50000,
          "Actual Loops": 1,
          Plans: [
            {
              "Node Type": "Seq Scan",
              "Relation Name": "orders",
              "Alias": "orders",
              "Filter": "status = 'shipped'",
              "Rows Removed by Filter": 450000,
              "Plan Rows": 50000,
              "Actual Startup Time": 0.5,
              "Actual Total Time": 28.4,
              "Actual Rows": 50000,
              "Actual Loops": 1,
            },
          ],
        },
      ],
    },
    "Planning Time": 0.8,
    "Execution Time": 42.3,
  },
];

const nestedLoop = [
  {
    Plan: {
      "Node Type": "Nested Loop",
      "Join Type": "Inner",
      "Plan Rows": 2100,
      "Actual Startup Time": 0.1,
      "Actual Total Time": 120.5,
      "Actual Rows": 2000,
      "Actual Loops": 1,
      Plans: [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "customers",
          "Alias": "customers",
          "Filter": "country = 'NP'",
          "Rows Removed by Filter": 8000,
          "Plan Rows": 2000,
          "Actual Startup Time": 0.05,
          "Actual Total Time": 2.1,
          "Actual Rows": 2000,
          "Actual Loops": 1,
        },
        {
          "Node Type": "Index Scan",
          "Relation Name": "orders",
          "Alias": "orders",
          "Index Name": "orders_customer_id_idx",
          "Index Cond": "customer_id = customers.id",
          "Plan Rows": 3,
          "Actual Startup Time": 0.02,
          "Actual Total Time": 0.05,
          "Actual Rows": 3,
          "Actual Loops": 2000,
        },
      ],
    },
    "Planning Time": 1.2,
    "Execution Time": 120.5,
  },
];

const indexScan = [
  {
    Plan: {
      "Node Type": "Bitmap Heap Scan",
      "Relation Name": "products",
      "Alias": "products",
      "Recheck Cond": "category = 'books'",
      "Rows Removed by Index Recheck": 120,
      "Plan Rows": 1500,
      "Actual Startup Time": 1.2,
      "Actual Total Time": 8.4,
      "Actual Rows": 1500,
      "Actual Loops": 1,
      Plans: [
        {
          "Node Type": "Bitmap Index Scan",
          "Index Name": "products_category_idx",
          "Index Cond": "category = 'books'",
          "Plan Rows": 1620,
          "Actual Startup Time": 0.4,
          "Actual Total Time": 0.9,
          "Actual Rows": 1620,
          "Actual Loops": 1,
        },
      ],
    },
    "Planning Time": 0.5,
    "Execution Time": 8.4,
  },
];

export const SAMPLE_PLANS: SamplePlan[] = [
  {
    id: "seq-scan",
    name: "The 450k-row filter",
    blurb: "Seq Scan + Sort: half a million rows read to keep 50k",
    json: JSON.stringify(seqScanHeavy, null, 2),
  },
  {
    id: "nested-loop",
    name: "The 2,000-loop trap",
    blurb: "Nested Loop: an innocent index scan running 2,000 times",
    json: JSON.stringify(nestedLoop, null, 2),
  },
  {
    id: "index-scan",
    name: "The healthy one",
    blurb: "Bitmap Heap Scan: what a good plan looks like",
    json: JSON.stringify(indexScan, null, 2),
  },
];
