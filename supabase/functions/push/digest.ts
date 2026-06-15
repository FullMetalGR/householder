// Pure digest construction: no Deno APIs, unit-tested from vitest.
// tests/push/digest.test.ts is this file's only tsc anchor: supabase/functions
// is excluded from tsconfig, so the test import is what keeps it typechecked.

export type QueueRow = {
  id: number;
  household_id: string;
  list_id: string | null;
  actor_id: string | null;
  event: "items_added" | "list_completed";
  payload: { item_name?: string; list_name?: string };
};

export type Recipient = { userId: string; locale: string };

export type Digest = {
  recipientId: string;
  locale: string;
  title: string;
  navigate: string;
};

const TEXT = {
  el: {
    someone: "Κάποιος",
    added: (actor: string, n: number, list: string) =>
      n === 1
        ? `${actor} πρόσθεσε 1 προϊόν στη λίστα ${list}`
        : `${actor} πρόσθεσε ${n} προϊόντα στη λίστα ${list}`,
    completed: (actor: string, list: string) => `${actor} ολοκλήρωσε τη λίστα ${list}`,
  },
  en: {
    someone: "Someone",
    added: (actor: string, n: number, list: string) =>
      n === 1 ? `${actor} added 1 item to ${list}` : `${actor} added ${n} items to ${list}`,
    completed: (actor: string, list: string) => `${actor} completed the list ${list}`,
  },
};

export function buildDigests(input: {
  rows: QueueRow[];
  recipientsByHousehold: Record<string, Recipient[]>;
  listNames: Record<string, string>;
  actorNames: Record<string, string>;
}): Digest[] {
  // group key: list + actor + event; fan out per non-actor recipient after.
  const groups = new Map<string, { rows: QueueRow[]; first: QueueRow }>();
  for (const r of input.rows) {
    const key = `${r.list_id}|${r.actor_id}|${r.event}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { rows: [r], first: r });
  }

  const out: Digest[] = [];
  for (const { rows, first } of groups.values()) {
    // list_id is non-null for every row today (both triggers set it and the
    // FK cascades deletes), but the type admits null: skip rather than emit
    // a /lists/null navigate target if that invariant ever breaks.
    if (!first.list_id) continue;
    const recipients = input.recipientsByHousehold[first.household_id] ?? [];
    const listName =
      (first.list_id && input.listNames[first.list_id]) || first.payload.list_name || "";
    for (const rec of recipients) {
      if (rec.userId === first.actor_id) continue;
      const t = TEXT[rec.locale === "en" ? "en" : "el"];
      const actor = (first.actor_id && input.actorNames[first.actor_id]) || t.someone;
      const title =
        first.event === "items_added"
          ? t.added(actor, rows.length, listName)
          : t.completed(actor, listName);
      out.push({
        recipientId: rec.userId,
        locale: rec.locale === "en" ? "en" : "el",
        title,
        navigate: `/lists/${first.list_id}`,
      });
    }
  }
  return out;
}
