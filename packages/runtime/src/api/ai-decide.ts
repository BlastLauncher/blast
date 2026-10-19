import { requestCapability } from "./capability.ts";

export type DecisionQuestion =
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: readonly string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };
type JsonDecisionQuestion =
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };
const toJsonQuestion = (question: DecisionQuestion): JsonDecisionQuestion =>
  question.type === "score"
    ? { type: "score", instructions: question.instructions, criteria: [...question.criteria] }
    : question;
type Answer<Q extends DecisionQuestion> = Q extends { type: "choice"; criteria: infer C }
  ? { type: "choice"; choice: keyof C; confidence: number; probabilities: Record<keyof C, number> }
  : Q extends { type: "score" }
    ? {
        type: "score";
        score: number;
        confidence: number;
        legend: Record<string, string>;
        probabilities: Record<string, number>;
      }
    : { type: "noul"; noul: number };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const range = (value: unknown, max = 1): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
const keysMatch = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const invalid = () => new Error("AI.experimental_decide: invalid answer");

export async function experimental_decide<const Q extends Record<string, DecisionQuestion>>(
  input: { state: unknown; questions: Q },
  options: { signal?: AbortSignal } = {},
): Promise<{ [K in keyof Q]: Answer<Q[K]> }> {
  const questions = JSON.parse(JSON.stringify(input.questions)) as Q;
  const state = typeof input.state === "string" ? input.state : JSON.stringify(input.state);
  if (state === undefined)
    throw new Error("AI.experimental_decide: state must be JSON-serializable");
  for (const question of Object.values(questions)) {
    if (
      typeof question.instructions !== "string" ||
      (question.type === "score" &&
        (!Array.isArray(question.criteria) ||
          question.criteria.length < 2 ||
          question.criteria.length > 10 ||
          question.criteria.some((item) => typeof item !== "string"))) ||
      (question.type === "choice" &&
        (!object(question.criteria) ||
          !Object.keys(question.criteria).length ||
          Object.values(question.criteria).some(
            (item) => item !== null && typeof item !== "string",
          ))) ||
      !["noul", "score", "choice"].includes(question.type)
    )
      throw new Error("AI.experimental_decide: invalid question");
  }
  const jsonQuestions: Record<string, JsonDecisionQuestion> = Object.fromEntries(
    Object.entries(questions).map(([key, question]) => [key, toJsonQuestion(question)]),
  );
  const answers = await requestCapability(
    "ai.decide",
    { state, questions: jsonQuestions },
    options,
  );
  if (!object(answers) || !keysMatch(answers, Object.keys(questions))) throw invalid();
  for (const [key, question] of Object.entries(questions)) {
    const answer = answers[key];
    if (!object(answer) || answer.type !== question.type) throw invalid();
    if (question.type === "noul") {
      if (!range(answer.noul)) throw invalid();
      continue;
    }
    const keys =
      question.type === "score"
        ? question.criteria.map((_, i) => String(i))
        : Object.keys(question.criteria);
    if (
      !range(answer.confidence) ||
      !object(answer.probabilities) ||
      !keysMatch(answer.probabilities, keys) ||
      Object.values(answer.probabilities).some((value) => !range(value))
    )
      throw invalid();
    if (
      Math.abs(
        Object.values(answer.probabilities).reduce<number>(
          (sum, value) => sum + (value as number),
          0,
        ) - 1,
      ) > 0.000001
    )
      throw invalid();
    if (question.type === "choice") {
      if (typeof answer.choice !== "string" || !keys.includes(answer.choice)) throw invalid();
    } else if (
      !range(answer.score, question.criteria.length - 1) ||
      !object(answer.legend) ||
      !keysMatch(answer.legend, keys) ||
      keys.some(
        (level) =>
          (answer.legend as Record<string, unknown>)[level] !== question.criteria[Number(level)],
      )
    )
      throw invalid();
  }
  return answers as { [K in keyof Q]: Answer<Q[K]> };
}
