/**
 * Pure parser for PostgreSQL EXPLAIN (FORMAT JSON) output.
 * No DOM, no React — fully unit-testable.
 */

export interface PlanNode {
  id: string;
  nodeType: string;
  relationName?: string;
  alias?: string;
  indexName?: string;
  filter?: string;
  joinType?: string;
  parentId: string | null;
  children: PlanNode[];
  depth: number;
  orderIndex: number; // position in post-order execution order
  // raw actuals (0 when EXPLAIN was run without ANALYZE)
  actualStartupTime: number;
  actualTotalTime: number;
  actualRows: number;
  actualLoops: number;
  planRows: number;
  totalCost: number;
  rowsRemovedByFilter: number;
  // computed
  inclusiveTime: number; // actualTotalTime * actualLoops
  exclusiveTime: number; // inclusive minus children's inclusive (clamped >= 0)
  exclusivePct: number; // share of the root's inclusive time
}

export interface ParsedPlan {
  root: PlanNode;
  nodes: PlanNode[]; // pre-order (tree order)
  executionOrder: PlanNode[]; // post-order: children execute before parents
  executionTime: number | null;
  planningTime: number | null;
  slowest: PlanNode;
  criticalPathIds: string[]; // root -> ... -> slowest
  totalRowsRemoved: number;
}

export class PlanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanParseError";
  }
}

type RawNode = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

function buildNode(raw: RawNode, parentId: string | null, depth: number, counter: { n: number }): PlanNode {
  const id = `n${counter.n++}`;
  const node: PlanNode = {
    id,
    nodeType: str(raw["Node Type"]) ?? "Unknown",
    relationName: str(raw["Relation Name"]),
    alias: str(raw["Alias"]),
    indexName: str(raw["Index Name"]),
    filter: str(raw["Filter"]),
    joinType: str(raw["Join Type"]),
    parentId,
    children: [],
    depth,
    orderIndex: -1,
    actualStartupTime: num(raw["Actual Startup Time"]),
    actualTotalTime: num(raw["Actual Total Time"]),
    actualRows: num(raw["Actual Rows"]),
    actualLoops: num(raw["Actual Loops"], 1),
    planRows: num(raw["Plan Rows"]),
    totalCost: num(raw["Total Cost"]),
    rowsRemovedByFilter: num(raw["Rows Removed by Filter"]),
    inclusiveTime: 0,
    exclusiveTime: 0,
    exclusivePct: 0,
  };
  const kids = raw["Plans"];
  if (Array.isArray(kids)) {
    for (const k of kids) {
      if (k && typeof k === "object") node.children.push(buildNode(k as RawNode, id, depth + 1, counter));
    }
  }
  return node;
}

/** Bottom-up: exclusive = own inclusive minus children's inclusive. */
function computeExclusive(node: PlanNode): number {
  node.inclusiveTime = node.actualTotalTime * node.actualLoops;
  let childrenInclusive = 0;
  for (const c of node.children) childrenInclusive += computeExclusive(c);
  node.exclusiveTime = Math.max(0, node.inclusiveTime - childrenInclusive);
  return node.inclusiveTime;
}

function preOrder(node: PlanNode, out: PlanNode[]): PlanNode[] {
  out.push(node);
  for (const c of node.children) preOrder(c, out);
  return out;
}

function postOrder(node: PlanNode, out: PlanNode[]): PlanNode[] {
  for (const c of node.children) postOrder(c, out);
  out.push(node);
  return out;
}

/**
 * Parse raw EXPLAIN (FORMAT JSON) text into a ParsedPlan.
 * Throws PlanParseError with a human-friendly message on bad input.
 */
export function parsePlan(input: string): ParsedPlan {
  const text = input.trim();
  if (!text) throw new PlanParseError("Nothing to parse — paste your EXPLAIN output first.");

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new PlanParseError(
      "That doesn't look like JSON. In psql run: EXPLAIN (ANALYZE, FORMAT JSON) SELECT … ; then paste the whole output."
    );
  }

  const first = Array.isArray(doc) ? doc[0] : doc;
  if (!first || typeof first !== "object") {
    throw new PlanParseError("Expected a JSON object (or array) with a \"Plan\" key inside.");
  }
  const plan = (first as RawNode)["Plan"];
  if (!plan || typeof plan !== "object") {
    throw new PlanParseError(
      'No "Plan" found. Did you use FORMAT JSON? Try: EXPLAIN (ANALYZE, FORMAT JSON) SELECT … ;'
    );
  }

  const root = buildNode(plan as RawNode, null, 0, { n: 0 });
  computeExclusive(root);

  const nodes = preOrder(root, []);
  const executionOrder = postOrder(root, []);
  executionOrder.forEach((n, i) => (n.orderIndex = i));

  const rootInclusive = root.inclusiveTime;
  for (const n of nodes) {
    n.exclusivePct = rootInclusive > 0 ? (n.exclusiveTime / rootInclusive) * 100 : 0;
  }

  let slowest = root;
  for (const n of nodes) {
    if (n.exclusiveTime > slowest.exclusiveTime) slowest = n;
  }

  // critical path: root -> ... -> slowest, via parent links
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  let cur: PlanNode | undefined = slowest;
  while (cur) {
    path.unshift(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  const totalRowsRemoved = nodes.reduce((s, n) => s + n.rowsRemovedByFilter, 0);

  return {
    root,
    nodes,
    executionOrder,
    executionTime: typeof (first as RawNode)["Execution Time"] === "number"
      ? ((first as RawNode)["Execution Time"] as number)
      : null,
    planningTime: typeof (first as RawNode)["Planning Time"] === "number"
      ? ((first as RawNode)["Planning Time"] as number)
      : null,
    slowest,
    criticalPathIds: path,
    totalRowsRemoved,
  };
}

/** Short human label for a node, e.g. "Index Scan on orders using orders_customer_id_idx". */
export function nodeLabel(n: PlanNode): string {
  let label = n.nodeType;
  if (n.relationName) label += ` on ${n.relationName}`;
  if (n.indexName) label += ` using ${n.indexName}`;
  return label;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(1)} ms`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(3)} ms`;
}
