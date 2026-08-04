# Householder Feature Backlog

Sourced from the 2026-08-04 deep-research pass over couples/household apps
(Tricount, Splitwise, Settle Up, Honeydue, Cozi, OurHome, AnyList). All ten
candidate items were kept. Order within each tier is rough priority; tiers
are ordered by evidence strength and fit with the existing app.

## Tier A: expenses core

1. **Shared expense tracker with running balance.**
   Add an expense (amount, who paid, category, note, optional photo) with an
   equal or custom split. One balance line per couple ("X owes Y 23.50") and
   a Settle action that records a settlement and zeroes the balance.
   Evidence: collaborative entry, uneven splits, and a clear "who owes whom"
   view are the core of every successful splitter (Tricount, Settle Up,
   Splitwise). For two people the debt graph collapses to a single running
   balance, so the data model is trivial. Keep it free and unlimited:
   Splitwise's free-tier cap (~3-5 entries/day) is the most-cited complaint
   in the category. Keep the UI minimal: reviewers call Settle Up
   over-engineered for basic use.

2. **Comments and reactions on items and expenses.**
   Attach short comments and icon reactions (lucide icons, never emojis) to
   individual shopping-list items and expenses, surfaced through the existing
   push pipeline. Evidence: Honeydue's per-transaction comments/reactions are
   its signature couples feature; questions get answered in context instead
   of in a separate chat app.

3. **Recurring bill reminders.**
   Recurring entries (rent, power, internet) with due-date push reminders.
   Evidence: Honeydue's bill calendar and due-date alerts define the
   reminder cluster couples actually use.

4. **Per-category monthly budgets with threshold alerts.**
   Set a monthly limit per category; push a notification when spending
   crosses a threshold. Evidence: Honeydue's spending-limit alerts; pairs
   naturally with item 1's categories.

## Tier B: platform quality

5. **Offline writes with queued sync.**
   Extend the current offline reads to offline entry: mutations queue
   locally and sync when back online. Evidence: offline entry with auto-sync
   is a headline feature for both Tricount and Settle Up (category norm);
   reliability of the sync, not the checkbox, is the quality bar.

6. **Per-partner notification preferences and delivery hardening.**
   Let each partner choose which events push to them; treat delivery
   reliability as a feature (tracking, retry). Evidence: unreliable
   reminders were OurHome's top complaint for years; our working web-push
   stack is a competitive asset worth protecting.

## Tier C: household organization and Greece specifics

7. **Lightweight chore assignment.**
   Assign and rotate recurring chores between partners with fairness in
   view. No points/rewards gamification: that mechanic was proven on
   children (OurHome) and is unproven for adult couples.

8. **Settle via IRIS / SEPA deep link.**
   On settle-up, deep-link into the payment rail Greek couples actually use
   (IRIS instant payments, or a plain SEPA reference). Needs a spike:
   Venmo-style integration is US-only and Tricount settles via its parent
   bank bunq; no EU-generic answer surfaced in research.

9. **Recipe to shopping list.**
   Convert a recipe into list items. Evidence: adjacent to AnyList's
   signature flow, closest to our core use case, but nothing survived
   verification in this research pass; needs its own investigation.

10. **Shared household calendar.**
    Shared events and reminders. Evidence: Cozi's core, with calendar depth
    as its paywall lever. Biggest scope risk in the backlog; consider last.

## Anti-features (deliberate)

- No bank-account aggregation (PSD2): Honeydue's sync failures are its top
  2026 complaint; manual entry sidesteps the whole failure mode.
- No multi-currency: euro-only household.
- No usage caps, ads, or paywalls: undercutting Splitwise's cap is free for
  a private two-person app.

## Open questions carried from research

- Which settlement rails work in Greece (IRIS, Viva, Revolut, SEPA links)?
- Do adult couples respond to fairness/rotation chore mechanics better than
  points? (No direct evidence either way.)
- What do YNAB shared budgeting and AnyList contribute that the research
  missed? (No claims about either survived verification.)
