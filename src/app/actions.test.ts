import { describe, expect, it } from "vitest";
import { type Action, filterActions, normalize } from "./actions";

const action = (label: string, group = "Brano"): Action => ({
  id: label,
  label,
  group,
  run: () => {},
});

describe("command palette search", () => {
  const actions = [action("Velocità 50%"), action("Aggiungi sezione"), action("Mono", "Canali")];

  it("ignores case and accents", () => {
    expect(normalize("Velocità")).toBe("velocita");
    expect(filterActions(actions, "VELOCITA").map((a) => a.id)).toEqual(["Velocità 50%"]);
  });

  it("needs every typed word, in any order, label or group", () => {
    expect(filterActions(actions, "sezione aggiungi")).toHaveLength(1);
    expect(filterActions(actions, "canali mono")).toHaveLength(1);
    expect(filterActions(actions, "sezione mono")).toHaveLength(0);
  });

  it("shows everything for an empty query", () => {
    expect(filterActions(actions, "  ")).toHaveLength(3);
  });
});
