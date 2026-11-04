import { it } from "./it";

/** Shape every translation must follow, derived from the Italian strings. */
export type Strings = typeof it;

/** Active UI strings. A language switch will swap this object, nothing else. */
export const t: Strings = it;
