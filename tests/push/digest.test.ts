import { describe, it, expect } from "vitest";
import { buildDigests, type QueueRow } from "@/supabase/functions/push/digest";

const HH = "hh-1";
const LIST = "list-1";
let nextId = 1;
function row(over: Partial<QueueRow>): QueueRow {
  return {
    id: nextId++,
    household_id: HH,
    list_id: LIST,
    actor_id: "maria",
    event: "items_added",
    payload: { item_name: "Γάλα" },
    ...over,
  };
}
const base = {
  recipientsByHousehold: {
    [HH]: [
      { userId: "maria", locale: "el" },
      { userId: "nikos", locale: "el" },
      { userId: "ana", locale: "en" },
    ],
  },
  listNames: { [LIST]: "Σούπερ μάρκετ" },
  actorNames: { maria: "Μαρία" },
};

describe("buildDigests", () => {
  it("groups by recipient, list, actor, event and never notifies the actor", () => {
    const out = buildDigests({ rows: [row({}), row({}), row({})], ...base });
    const recipients = out.map((n) => n.recipientId).sort();
    expect(recipients).toEqual(["ana", "nikos"]);
    const nikos = out.find((n) => n.recipientId === "nikos")!;
    expect(nikos.title).toBe("Μαρία πρόσθεσε 3 προϊόντα στη λίστα Σούπερ μάρκετ");
    expect(nikos.navigate).toBe(`/lists/${LIST}`);
  });

  it("localizes per recipient and handles the singular", () => {
    const out = buildDigests({ rows: [row({})], ...base });
    expect(out.find((n) => n.recipientId === "nikos")!.title).toBe(
      "Μαρία πρόσθεσε 1 προϊόν στη λίστα Σούπερ μάρκετ"
    );
    expect(out.find((n) => n.recipientId === "ana")!.title).toBe(
      "Μαρία added 1 item to Σούπερ μάρκετ"
    );
  });

  it("separates digests per actor and per event type", () => {
    const rows = [
      row({}),
      row({ actor_id: "nikos" }),
      row({ event: "list_completed", payload: { list_name: "Σούπερ μάρκετ" } }),
    ];
    const withNikosName = {
      ...base,
      actorNames: { maria: "Μαρία", nikos: "Νίκος" },
    };
    const out = buildDigests({ rows, ...withNikosName });
    const anaTitles = out.filter((n) => n.recipientId === "ana").map((n) => n.title).sort();
    expect(anaTitles).toEqual([
      "Μαρία added 1 item to Σούπερ μάρκετ",
      "Μαρία completed the list Σούπερ μάρκετ",
      "Νίκος added 1 item to Σούπερ μάρκετ",
    ]);
  });

  it("falls back when the actor's profile is unreadable (departed member)", () => {
    const out = buildDigests({ rows: [row({ actor_id: "ghost" })], ...base });
    expect(out.find((n) => n.recipientId === "nikos")!.title).toBe(
      "Κάποιος πρόσθεσε 1 προϊόν στη λίστα Σούπερ μάρκετ"
    );
  });

  it("produces nothing when the only recipient is the actor", () => {
    const out = buildDigests({
      rows: [row({})],
      recipientsByHousehold: { [HH]: [{ userId: "maria", locale: "el" }] },
      listNames: base.listNames,
      actorNames: base.actorNames,
    });
    expect(out).toEqual([]);
  });

  it("keeps households separate within one flush", () => {
    const out = buildDigests({
      rows: [row({}), row({ household_id: "hh-2", list_id: "list-2", actor_id: "petros" })],
      recipientsByHousehold: {
        [HH]: [
          { userId: "maria", locale: "el" },
          { userId: "nikos", locale: "el" },
        ],
        "hh-2": [
          { userId: "petros", locale: "el" },
          { userId: "zoe", locale: "en" },
        ],
      },
      listNames: { [LIST]: "Σούπερ μάρκετ", "list-2": "Λαϊκή" },
      actorNames: { maria: "Μαρία", petros: "Πέτρος" },
    });
    expect(out.map((n) => n.recipientId).sort()).toEqual(["nikos", "zoe"]);
    expect(out.find((n) => n.recipientId === "zoe")!.title).toBe("Πέτρος added 1 item to Λαϊκή");
  });

  it("same actor on two lists yields two separate digests", () => {
    const out = buildDigests({
      rows: [row({}), row({ list_id: "list-2" })],
      recipientsByHousehold: { [HH]: [{ userId: "nikos", locale: "el" }] },
      listNames: { [LIST]: "Σούπερ μάρκετ", "list-2": "Λαϊκή" },
      actorNames: { maria: "Μαρία" },
    });
    const titles = out.map((n) => n.title).sort();
    expect(titles).toEqual([
      "Μαρία πρόσθεσε 1 προϊόν στη λίστα Λαϊκή",
      "Μαρία πρόσθεσε 1 προϊόν στη λίστα Σούπερ μάρκετ",
    ]);
    expect(out.map((n) => n.navigate).sort()).toEqual(["/lists/list-1", "/lists/list-2"]);
  });
});
