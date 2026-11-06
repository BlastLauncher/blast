/** The util/types predicate used by a small number of catalog dependencies. */
export function isBoxedPrimitive(value: unknown): boolean {
  const tag = Object.prototype.toString.call(value);
  return (
    tag === "[object Boolean]" ||
    tag === "[object Number]" ||
    tag === "[object String]" ||
    tag === "[object BigInt]" ||
    tag === "[object Symbol]"
  );
}
