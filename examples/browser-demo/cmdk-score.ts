// cmdk's own matcher. The cmdk package only exports its React entry, whose
// top-level React and Radix imports would add ~184 KB to the page, so import the
// scorer file cmdk ships next to it. cmdk's defaultFilter is exactly
// (value, search, keywords) => commandScore(value, search, keywords).
export { commandScore } from "./node_modules/cmdk/dist/command-score.mjs";
