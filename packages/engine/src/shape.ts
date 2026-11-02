import { shapeKey, tintModel, usableModel, wantsShape, type EditOp } from "@worldbuilder/contracts";

function shapeLabel(op: EditOp): string | null {
  if (op.op === "place") {
    const words = op.label.trim().split(/\s+/);
    const shortSign = op.sprite === "sign" && words.length <= 2 && op.label.toLowerCase() !== "sign";
    if (op.sprite !== "prop" && !shortSign) return null;
    return wantsShape(op.label) ? op.label : null;
  }
  if (op.op === "update" && op.label?.trim() && wantsShape(op.label)) return op.label;
  return null;
}

export async function attachShapes(ops: EditOp[], lookup: (key: string) => Promise<string | null>): Promise<EditOp[]> {
  const labels = new Map<string, string>();
  for (const op of ops) {
    const label = shapeLabel(op);
    if (!label) continue;
    const supplied = op.op === "place" || op.op === "update" ? op.model : undefined;
    if (supplied && usableModel(supplied)) continue;
    labels.set(shapeKey(label), label);
  }

  const found = new Map<string, string>();
  await Promise.all([...labels.keys()].map(async (key) => {
    try {
      const spec = await lookup(key);
      if (spec && usableModel(spec)) found.set(key, spec);
    } catch {
      found.delete(key);
    }
  }));

  return ops.map((op) => {
    const label = shapeLabel(op);
    if (!label || (op.op !== "place" && op.op !== "update")) return op;
    if (op.model && usableModel(op.model)) return op;
    const spec = found.get(shapeKey(label));
    if (!spec) return op;
    return { ...op, model: tintModel(spec, label) };
  });
}
