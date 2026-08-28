import {
  validateProtocolEnvelope,
  type ProtocolEnvelope,
  type ValidationIssue,
  type ValidationResult,
} from "@blastlauncher/protocol";

export const SCENE_TRANSACTION_MESSAGE = "scene.transaction" as const;
export const SCENE_EVENT_MESSAGE = "scene.event" as const;

export const SCENE_NODE_TYPES = ["list", "list-item", "action"] as const;

export type SceneNodeType = (typeof SCENE_NODE_TYPES)[number];

export type ScenePropValue = string | number | boolean;

export interface SceneNode {
  readonly id: string;
  readonly type: SceneNodeType;
  readonly props: Readonly<Record<string, ScenePropValue>>;
  readonly children: readonly SceneNode[];
}

export type SceneSnapshotOperation = { readonly type: "snapshot"; readonly root: SceneNode };

export type SceneInsertOperation = {
  readonly type: "insert";
  readonly node: SceneNode;
  readonly parentId: string;
  readonly index?: number;
};

export type SceneUpdateOperation = {
  readonly type: "update";
  readonly nodeId: string;
  readonly props: Readonly<Record<string, ScenePropValue | null>>;
};

export type SceneRemoveOperation = { readonly type: "remove"; readonly nodeId: string };

export type SceneReorderOperation = {
  readonly type: "reorder";
  readonly parentId: string;
  readonly order: readonly string[];
};

export type SceneOperation =
  | SceneSnapshotOperation
  | SceneInsertOperation
  | SceneUpdateOperation
  | SceneRemoveOperation
  | SceneReorderOperation;

export interface SceneTransaction {
  readonly transactionId: string;
  readonly operations: readonly SceneOperation[];
}

export interface SceneEventPayload {
  readonly eventId: string;
}

export type SceneTransactionMessage = ProtocolEnvelope<typeof SCENE_TRANSACTION_MESSAGE, SceneTransaction>;

export type SceneEventMessage = ProtocolEnvelope<typeof SCENE_EVENT_MESSAGE, SceneEventPayload>;

/**
 * Receives one ordered transaction per commit. The React renderer publishes to
 * this boundary (ADR 0004); clients and test harnesses consume it without
 * knowing which transport carried the transaction.
 */
export interface SceneTransactionSink {
  publish(transaction: SceneTransaction): void | Promise<void>;
}

/**
 * Deterministic in-memory sink used by tests and the first client fixtures.
 */
export function createCollectingSceneSink(): SceneTransactionSink & {
  readonly transactions: SceneTransaction[];
} {
  const transactions: SceneTransaction[] = [];
  return {
    transactions,
    publish(transaction) {
      transactions.push(transaction);
    },
  };
}

const PROP_WHITELIST: Record<SceneNodeType, readonly string[]> = {
  list: ["navigationTitle", "searchBarPlaceholder", "isLoading"],
  "list-item": ["title", "subtitle"],
  action: ["title", "onAction"],
};

const REQUIRED_PROPS: Record<SceneNodeType, readonly string[]> = {
  list: [],
  "list-item": ["title"],
  action: ["title", "onAction"],
};

const PROP_TYPES: Record<SceneNodeType, Readonly<Record<string, "string" | "boolean" | "number">>> = {
  list: { navigationTitle: "string", searchBarPlaceholder: "string", isLoading: "boolean" },
  "list-item": { title: "string", subtitle: "string" },
  action: { title: "string", onAction: "string" },
};

const CHILD_TYPES: Record<SceneNodeType, readonly SceneNodeType[]> = {
  list: ["list-item"],
  "list-item": ["action"],
  action: [],
};

export class SceneError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SceneError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
export function validateSceneTransactionMessage(value: unknown): ValidationResult<SceneTransactionMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== SCENE_TRANSACTION_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(SCENE_TRANSACTION_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateTransactionPayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as SceneTransactionMessage } : { ok: false, issues };
}

export function validateSceneTransactionPayload(value: unknown): ValidationResult<SceneTransaction> {
  const issues: ValidationIssue[] = [];
  validateTransactionPayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as SceneTransaction } : { ok: false, issues };
}

function validateTransactionPayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.transactionId, `${basePath}.transactionId`, issues);
  if (!Array.isArray(value.operations)) {
    issues.push({ path: `${basePath}.operations`, message: "Expected an array" });
    return;
  }
  value.operations.forEach((operation, index) => {
    validateOperation(operation, `${basePath}.operations[${index}]`, issues);
  });
}

export function validateSceneEventMessage(value: unknown): ValidationResult<SceneEventMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== SCENE_EVENT_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(SCENE_EVENT_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateEventPayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as SceneEventMessage } : { ok: false, issues };
}

export function validateSceneEventPayload(value: unknown): ValidationResult<SceneEventPayload> {
  const issues: ValidationIssue[] = [];
  validateEventPayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as SceneEventPayload } : { ok: false, issues };
}

function validateEventPayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.eventId, `${basePath}.eventId`, issues);
}
function validateOperation(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value) || typeof value.type !== "string") {
    issues.push({ path, message: "Expected an operation object with a type" });
    return;
  }

  switch (value.type) {
    case "snapshot":
      validateNode(value.root, `${path}.root`, issues);
      return;
    case "insert":
      validateNode(value.node, `${path}.node`, issues);
      validateNonEmptyString(value.parentId, `${path}.parentId`, issues);
      if (value.index !== undefined && (!isInteger(value.index) || value.index < 0)) {
        issues.push({ path: `${path}.index`, message: "Expected a non-negative integer" });
      }
      return;
    case "update":
      validateNonEmptyString(value.nodeId, `${path}.nodeId`, issues);
      validateUpdateProps(value.props, issues);
      return;
    case "remove":
      validateNonEmptyString(value.nodeId, `${path}.nodeId`, issues);
      return;
    case "reorder":
      validateNonEmptyString(value.parentId, `${path}.parentId`, issues);
      if (!Array.isArray(value.order)) {
        issues.push({ path: `${path}.order`, message: "Expected an array" });
        return;
      }
      value.order.forEach((nodeId, index) => {
        validateNonEmptyString(nodeId, `${path}.order[${index}]`, issues);
      });
      return;
    default:
      issues.push({ path: `${path}.type`, message: "Unknown scene operation type" });
  }
}

function validateNode(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a scene node object" });
    return;
  }
  validateNonEmptyString(value.id, `${path}.id`, issues);
  if (typeof value.type !== "string" || !SCENE_NODE_TYPES.includes(value.type as SceneNodeType)) {
    issues.push({ path: `${path}.type`, message: "Unknown scene node type" });
    return;
  }
  const nodeType = value.type as SceneNodeType;

  if (!isRecord(value.props)) {
    issues.push({ path: `${path}.props`, message: "Expected a props object" });
    return;
  }
  for (const key of Object.keys(value.props)) {
    if (!PROP_WHITELIST[nodeType].includes(key)) {
      issues.push({ path: `${path}.props.${key}`, message: "Property is not in the whitelist" });
      continue;
    }
    const expected = PROP_TYPES[nodeType][key];
    if (typeof value.props[key] !== expected) {
      issues.push({ path: `${path}.props.${key}`, message: `Expected a ${expected} value` });
    }
  }
  for (const required of REQUIRED_PROPS[nodeType]) {
    if (!(required in value.props)) {
      issues.push({ path: `${path}.props.${required}`, message: "Required property is missing" });
    }
  }

  if (!Array.isArray(value.children)) {
    issues.push({ path: `${path}.children`, message: "Expected a children array" });
    return;
  }
  value.children.forEach((child, index) => {
    const childPath = `${path}.children[${index}]`;
    if (isRecord(child) && !CHILD_TYPES[nodeType].includes(child.type as SceneNodeType)) {
      issues.push({ path: `${childPath}.type`, message: `A ${nodeType} cannot contain a ${String(child.type)}` });
    }
    validateNode(child, childPath, issues);
  });
}

function validateUpdateProps(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "props", message: "Expected a props object" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (value[key] !== null) {
      validatePropValue(value[key], `props.${key}`, issues);
    }
  }
}

function validatePropValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    issues.push({ path, message: "Expected a string, number, or boolean property value" });
  }
}

interface InternalNode {
  readonly type: SceneNodeType;
  readonly props: Readonly<Record<string, ScenePropValue>>;
  readonly childIds: readonly string[];
}

/**
 * Applies ordered scene transactions and exposes the materialized scene.
 * Referential integrity is enforced here: unknown parents or nodes, duplicate
 * identifiers, invalid child placement, incomplete reorders, and removal of
 * required properties fail with structured error codes. Node shape and the
 * property whitelist are validated by the message validators before a
 * transaction reaches this buffer.
 */
export class SceneStateBuffer {
  readonly #nodes = new Map<string, InternalNode>();
  #rootId?: string;

  get rootId(): string | undefined {
    return this.#rootId;
  }

  get nodeCount(): number {
    return this.#nodes.size;
  }

  has(nodeId: string): boolean {
    return this.#nodes.has(nodeId);
  }

  get(nodeId: string): SceneNode | undefined {
    const node = this.#nodes.get(nodeId);
    return node === undefined ? undefined : this.#materialize(nodeId, node);
  }

  childrenOf(nodeId: string): readonly SceneNode[] {
    const node = this.#internal(nodeId);
    return node.childIds.map((childId) => {
      const child = this.#nodes.get(childId) as InternalNode;
      return this.#materialize(childId, child);
    });
  }

  apply(transaction: SceneTransaction): void {
    if (typeof transaction.transactionId !== "string" || transaction.transactionId.length === 0) {
      throw new SceneError("invalid_transaction", "Scene transaction requires a transactionId");
    }
    if (!Array.isArray(transaction.operations)) {
      throw new SceneError("invalid_transaction", "Scene transaction requires an operations array");
    }
    for (const operation of transaction.operations) {
      this.#applyOperation(operation);
    }
  }

  toJSON(): Record<string, unknown> | undefined {
    if (this.#rootId === undefined) {
      return undefined;
    }
    return this.#materialize(this.#rootId, this.#nodes.get(this.#rootId) as InternalNode) as unknown as Record<
      string,
      unknown
    >;
  }

  #internal(nodeId: string): InternalNode {
    const node = this.#nodes.get(nodeId);
    if (node === undefined) {
      throw new SceneError("unknown_node", "Scene node does not exist", { nodeId });
    }
    return node;
  }

  #materialize(nodeId: string, node: InternalNode): SceneNode {
    return {
      id: nodeId,
      type: node.type,
      props: { ...node.props },
      children: node.childIds.map((childId) => {
        const child = this.#nodes.get(childId) as InternalNode;
        return this.#materialize(childId, child);
      }),
    };
  }

  #applyOperation(operation: SceneOperation): void {
    switch (operation.type) {
      case "snapshot":
        this.#applySnapshot(operation.root);
        return;
      case "insert":
        this.#applyInsert(operation);
        return;
      case "update":
        this.#applyUpdate(operation);
        return;
      case "remove":
        this.#applyRemove(operation);
        return;
      case "reorder":
        this.#applyReorder(operation);
        return;
      default:
        throw new SceneError("unknown_operation", "Unknown scene operation", { operation });
    }
  }

  #applySnapshot(root: SceneNode): void {
    if (root.type !== "list") {
      throw new SceneError("invalid_root", "The scene root must be a list", { nodeType: root.type });
    }

    this.#nodes.clear();
    this.#rootId = root.id;
    for (const [nodeId, node] of collectNodes(root)) {
      assertPropTypes(node.type, node.props, nodeId);
      this.#nodes.set(nodeId, toInternalNode(node));
    }
  }

  #applyInsert(operation: SceneInsertOperation): void {
    const parent = this.#nodes.get(operation.parentId);
    if (parent === undefined) {
      throw new SceneError("unknown_parent", "Insert parent does not exist", { parentId: operation.parentId });
    }
    if (this.#nodes.has(operation.node.id)) {
      throw new SceneError("duplicate_node", "Scene node already exists", { nodeId: operation.node.id });
    }
    if (!CHILD_TYPES[parent.type].includes(operation.node.type)) {
      throw new SceneError("invalid_child", `A ${parent.type} cannot contain a ${operation.node.type}`, {
        parentId: operation.parentId,
        childType: operation.node.type,
      });
    }
    if (operation.index !== undefined && (operation.index < 0 || operation.index > parent.childIds.length)) {
      throw new SceneError("invalid_index", "Insert index is out of bounds", {
        parentId: operation.parentId,
        index: operation.index,
      });
    }

    for (const [nodeId, node] of collectNodes(operation.node)) {
      assertPropTypes(node.type, node.props, nodeId);
      this.#nodes.set(nodeId, toInternalNode(node));
    }
    const childIds = [...parent.childIds];
    if (operation.index === undefined) {
      childIds.push(operation.node.id);
    } else {
      childIds.splice(operation.index, 0, operation.node.id);
    }
    this.#nodes.set(operation.parentId, { ...parent, childIds });
  }

  #applyUpdate(operation: SceneUpdateOperation): void {
    const node = this.#internal(operation.nodeId);
    const props: Record<string, ScenePropValue> = { ...node.props };
    for (const [key, value] of Object.entries(operation.props)) {
      if (!PROP_WHITELIST[node.type].includes(key)) {
        throw new SceneError("invalid_prop", "Property is not in the whitelist", {
          nodeId: operation.nodeId,
          property: key,
        });
      }
      if (value === null) {
        if (REQUIRED_PROPS[node.type].includes(key)) {
          throw new SceneError("missing_required_prop", "Required property cannot be removed", {
            nodeId: operation.nodeId,
            property: key,
          });
        }
        delete props[key];
        continue;
      }
      const expected = PROP_TYPES[node.type][key];
      if (expected !== undefined && typeof value !== expected) {
        throw new SceneError("invalid_prop", `Expected a ${expected} value`, {
          nodeId: operation.nodeId,
          property: key,
        });
      }
      props[key] = value;
    }
    for (const required of REQUIRED_PROPS[node.type]) {
      if (!(required in props)) {
        throw new SceneError("missing_required_prop", "Required property is missing", {
          nodeId: operation.nodeId,
          property: required,
        });
      }
    }
    this.#nodes.set(operation.nodeId, { ...node, props });
  }

  #applyRemove(operation: SceneRemoveOperation): void {
    this.#internal(operation.nodeId);
    if (operation.nodeId === this.#rootId) {
      throw new SceneError("remove_root", "The scene root cannot be removed", { nodeId: operation.nodeId });
    }

    const parentEntry = [...this.#nodes.entries()].find(([, candidate]) =>
      candidate.childIds.includes(operation.nodeId),
    );
    if (parentEntry === undefined) {
      throw new SceneError("orphan_node", "Removed node is not attached to the scene", { nodeId: operation.nodeId });
    }
    const [parentId, parent] = parentEntry;
    this.#nodes.set(parentId, {
      ...parent,
      childIds: parent.childIds.filter((childId) => childId !== operation.nodeId),
    });

    const removed: string[] = [];
    collectChildIds(operation.nodeId, this.#nodes, removed);
    for (const nodeId of removed) {
      this.#nodes.delete(nodeId);
    }
  }

  #applyReorder(operation: SceneReorderOperation): void {
    const parent = this.#nodes.get(operation.parentId);
    if (parent === undefined) {
      throw new SceneError("unknown_parent", "Reorder parent does not exist", { parentId: operation.parentId });
    }
    const current = [...parent.childIds].toSorted().join("\u0000");
    const order = [...operation.order].toSorted().join("\u0000");
    if (operation.order.length !== parent.childIds.length || order !== current) {
      throw new SceneError("reorder_mismatch", "Reorder must contain exactly the current children", {
        parentId: operation.parentId,
        expected: parent.childIds,
        received: operation.order,
      });
    }
    this.#nodes.set(operation.parentId, { ...parent, childIds: [...operation.order] });
  }
}

function toInternalNode(node: SceneNode): InternalNode {
  return {
    type: node.type,
    props: { ...node.props },
    childIds: node.children.map((child) => child.id),
  };
}

function assertPropTypes(nodeType: SceneNodeType, props: Readonly<Record<string, unknown>>, nodeId: string): void {
  for (const [key, value] of Object.entries(props)) {
    const expected = PROP_TYPES[nodeType][key];
    if (expected !== undefined && typeof value !== expected) {
      throw new SceneError("invalid_prop", `Expected a ${expected} value`, { nodeId, property: key });
    }
  }
}

function collectNodes(node: SceneNode): Map<string, SceneNode> {
  const nodes = new Map<string, SceneNode>();
  const visit = (current: SceneNode): void => {
    if (nodes.has(current.id)) {
      throw new SceneError("duplicate_node", "Scene node identifiers must be unique within a tree", {
        nodeId: current.id,
      });
    }
    nodes.set(current.id, current);
    for (const child of current.children) {
      visit(child);
    }
  };
  visit(node);
  return nodes;
}

function collectChildIds(rootId: string, nodes: Map<string, InternalNode>, removed: string[]): void {
  const node = nodes.get(rootId);
  if (node === undefined) {
    return;
  }
  removed.push(rootId);
  for (const childId of node.childIds) {
    collectChildIds(childId, nodes, removed);
  }
}

function validateNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, message: "Expected a non-empty string" });
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}
