// A small arithmetic evaluator for Alfred's Expression utility. Workflow text
// is untrusted, so this is a recursive-descent parser over a fixed grammar
// rather than `eval` / `new Function`:
//
//   sum     = product (("+" | "-") product)*
//   product = unary (("*" | "/" | "%") unary)*
//   unary   = ("+" | "-") unary | power
//   power   = primary (("^" | "**") unary)?      right-associative
//   primary = number | constant | name "(" sum ("," sum)* ")" | "(" sum ")"

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Fn = { arity: number | "variadic"; apply(args: number[]): number };

const unary = (apply: (x: number) => number): Fn => ({ arity: 1, apply: ([x]) => apply(x!) });

const FUNCTIONS: Record<string, Fn> = {
  abs: unary(Math.abs),
  round: unary(Math.round),
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
  sqrt: unary(Math.sqrt),
  log: unary(Math.log10),
  ln: unary(Math.log),
  sin: unary(Math.sin),
  cos: unary(Math.cos),
  tan: unary(Math.tan),
  pow: { arity: 2, apply: ([x, y]) => x! ** y! },
  min: { arity: "variadic", apply: (args) => Math.min(...args) },
  max: { arity: "variadic", apply: (args) => Math.max(...args) },
};

type Token =
  | { kind: "number"; value: number; at: number }
  | { kind: "name"; value: string; at: number }
  | { kind: "op"; value: string; at: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/%^(),])/y;
  let at = 0;
  while (at < text.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (!match) throw new Error(`unexpected ${JSON.stringify(text[at])} at ${at + 1}`);
    if (match[1] !== undefined) tokens.push({ kind: "number", value: Number(match[1]), at });
    else if (match[2] !== undefined) tokens.push({ kind: "name", value: match[2], at });
    else if (match[3] !== undefined) tokens.push({ kind: "op", value: match[3], at });
    at = pattern.lastIndex;
  }
  return tokens;
}

const describe = (token: Token | undefined): string =>
  token ? `${JSON.stringify(String(token.value))} at ${token.at + 1}` : "end of expression";

/** Evaluates `text`; throws on syntax errors and on non-finite results. */
export function evaluateExpression(text: string): number {
  const tokens = tokenize(text);
  let index = 0;
  const peek = (): Token | undefined => tokens[index];
  const isOp = (...ops: string[]): boolean => {
    const token = peek();
    return token?.kind === "op" && ops.includes(token.value);
  };
  const expect = (op: string): void => {
    if (!isOp(op)) throw new Error(`expected "${op}" but found ${describe(peek())}`);
    index++;
  };

  const sum = (): number => {
    let value = product();
    while (isOp("+", "-")) {
      const op = tokens[index++]!.value;
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const product = (): number => {
    let value = signed();
    while (isOp("*", "/", "%")) {
      const op = tokens[index++]!.value;
      const right = signed();
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  };
  // Unary minus binds looser than `^`, so `-2^2` is -4 as in mathematics.
  const signed = (): number => {
    if (isOp("+", "-")) {
      const op = tokens[index++]!.value;
      const value = signed();
      return op === "-" ? -value : value;
    }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (!isOp("^", "**")) return base;
    index++;
    return base ** signed();
  };
  const primary = (): number => {
    const token = peek();
    if (!token) throw new Error("unexpected end of expression");
    index++;
    if (token.kind === "number") return token.value;
    if (token.kind === "op") {
      if (token.value !== "(") throw new Error(`unexpected ${describe(token)}`);
      const value = sum();
      expect(")");
      return value;
    }
    const name = token.value.toLowerCase();
    // Own keys only: `constructor` or `toString` must not reach Object.prototype.
    if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name]!;
    if (!Object.hasOwn(FUNCTIONS, name)) {
      throw new Error(`unknown name ${JSON.stringify(token.value)} at ${token.at + 1}`);
    }
    const fn = FUNCTIONS[name]!;
    expect("(");
    const args = [sum()];
    while (isOp(",")) {
      index++;
      args.push(sum());
    }
    expect(")");
    if (fn.arity !== "variadic" && args.length !== fn.arity) {
      throw new Error(`${name}() takes ${fn.arity} argument${fn.arity === 1 ? "" : "s"}`);
    }
    return fn.apply(args);
  };

  if (tokens.length === 0) throw new Error("empty expression");
  const value = sum();
  if (index < tokens.length) throw new Error(`unexpected ${describe(peek())}`);
  if (!Number.isFinite(value)) throw new Error(`result is not a finite number (${value})`);
  return value;
}

/**
 * The text an Expression passes on. Fifteen significant digits hide binary
 * rounding noise (`0.1 + 0.2` is `0.3`), and `-0` prints as `0`.
 */
export function formatExpressionResult(value: number): string {
  const clean = Number.parseFloat(value.toPrecision(15));
  return String(clean === 0 ? 0 : clean);
}
