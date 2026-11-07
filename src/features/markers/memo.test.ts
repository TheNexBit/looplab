import { beforeEach, describe, expect, it } from "vitest";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { memoNow } from "./memo";

const at = (position: number) =>
  usePlayerStore.setState({ playing: false, anchorPosition: position, anchorTime: 0 });

describe("the memo shown while playing", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      track: { path: "song.mp3", name: "song.mp3", duration: 120 } as never,
    });
    useLoopStore.getState().clear();
    useSavedLoopsStore
      .getState()
      .replace([{ id: "riff", name: "Riff", start: 10, end: 20, memo: "Pennata alternata" }]);
    useMarkersStore.getState().replace(
      [],
      [
        { id: "a", start: 0, end: 30, name: "Intro", color: 0, memo: "" },
        { id: "b", start: 30, end: 120, name: "Assolo", color: 1, memo: "Bending al 12" },
      ],
    );
  });

  it("is the one of the section under the playhead", () => {
    at(40);
    expect(memoNow()).toEqual({ name: "Assolo", text: "Bending al 12" });
    at(5);
    expect(memoNow()).toBeNull(); // the intro has none
  });

  it("is the one of the saved loop being looped, first", () => {
    at(12);
    useLoopStore.getState().setRegion(10, 20, 120);
    expect(memoNow()).toEqual({ name: "Riff", text: "Pennata alternata" });
  });
});
