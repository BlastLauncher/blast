import { describe, expect, test } from "bun:test";
import { evaluateExpression, formatExpressionResult } from "./expressions.ts";

const cases = (rows: [string, number][]) => () => {
  for (const [text, value] of rows) {
    expect({ text, value: evaluateExpression(text) }).toEqual({ text, value });
  }
};

describe("evaluateExpression", () => {
  test(
    "operators and precedence",
    cases([
      ["1 + 2 * 3", 7],
      ["10 - 4 - 3", 3],
      ["2 * 3 + 4 * 5", 26],
      ["7 / 2", 3.5],
      ["7 % 4", 3],
      ["8 / 4 / 2", 1],
      ["2 ^ 10", 1024],
      ["2 ** 3", 8],
      ["2 ^ 3 ^ 2", 512],
      ["3 * 2 ^ 2", 12],
    ]),
  );

  test(
    "unary signs and parentheses",
    cases([
      ["-3 + 5", 2],
      ["+4", 4],
      ["--2", 2],
      ["-2 ^ 2", -4],
      ["(-2) ^ 2", 4],
      ["2 ^ -1", 0.5],
      ["(1 + 2) * (3 + 4)", 21],
      ["((((5))))", 5],
      ["4 * -(2 + 1)", -12],
    ]),
  );

  test(
    "decimals, exponents and whitespace",
    cases([
      ["0.5 + .25", 0.75],
      ["1.5e3", 1500],
      ["2E-2", 0.02],
      ["  1+\t2 ", 3],
    ]),
  );

  test(
    "constants and functions, case-insensitively",
    cases([
      ["pi", Math.PI],
      ["E", Math.E],
      ["abs(-3)", 3],
      ["round(2.5)", 3],
      ["floor(-1.5)", -2],
      ["ceil(1.2)", 2],
      ["sqrt(16)", 4],
      ["log(1000)", 3],
      ["ln(e)", 1],
      ["sin(0) + cos(0) + tan(0)", 1],
      ["min(3, 1, 2)", 1],
      ["MAX(3, 1 + 9, 2)", 10],
      ["pow(2, 8)", 256],
      ["2 * max(1, pi)", 2 * Math.PI],
    ]),
  );

  test("syntax errors are named", () => {
    const rows: [string, RegExp][] = [
      ["", /empty expression/],
      ["   ", /empty expression/],
      ["1 +", /unexpected end/],
      ["(1 + 2", /expected "\)"/],
      ["1 + 2)", /unexpected "\)" at 6/],
      ["2 3", /unexpected "3"/],
      ["1 $ 2", /unexpected "\$" at 3/],
      ["foo(1)", /unknown name "foo"/],
      ["x + 1", /unknown name "x"/],
      ["sqrt 4", /expected "\("/],
      ["pow(2)", /pow\(\) takes 2 arguments/],
      ["abs(1, 2)", /abs\(\) takes 1 argument$/],
      ["pi(1)", /unexpected "\("/],
      ["1.2.3", /unexpected/],
    ];
    for (const [text, message] of rows) {
      expect(() => evaluateExpression(text)).toThrow(message);
    }
  });

  test("non-finite results are rejected", () => {
    for (const text of ["1 / 0", "-1 / 0", "0 / 0", "5 % 0", "sqrt(-1)", "log(0)", "10 ^ 400"]) {
      expect(() => evaluateExpression(text)).toThrow(/not a finite number/);
    }
  });

  test("never evaluates JavaScript", () => {
    for (const text of ["process.exit(1)", "this", "alert`1`", "[1]"]) {
      expect(() => evaluateExpression(text)).toThrow();
    }
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(() => evaluateExpression(`${name}(1)`)).toThrow(`unknown name "${name}"`);
      expect(() => evaluateExpression(name)).toThrow(`unknown name "${name}"`);
    }
  });
});

describe("formatExpressionResult", () => {
  test("integers, decimals, binary noise and negative zero", () => {
    expect(formatExpressionResult(42)).toBe("42");
    expect(formatExpressionResult(3.5)).toBe("3.5");
    expect(formatExpressionResult(0.1 + 0.2)).toBe("0.3");
    expect(formatExpressionResult(-0)).toBe("0");
    expect(formatExpressionResult(1e21)).toBe("1e+21");
  });
});
