# Research: recipe to shopping list

- Ticket: [#19](https://github.com/FullMetalGR/householder/issues/19)
- Backlog item: 9 (Recipe to shopping list, `docs/BACKLOG.md`)
- Date: 2026-08-18
- Method: primary sources only (specs, live site HTML, first-party docs, registries). Every claim carries its source. Greek site HTML was inspected directly; akispetretzikis.com was verified through Wayback Machine captures of the real page HTML because the live site serves a Cloudflare challenge to non-browser clients.

## Question

How do recipe-to-shopping-list flows work in practice, and which approach fits Householder? Cover paste-a-URL parsing (schema.org/Recipe), manual capture, LLM extraction, what AnyList actually ships, and ingredient-line parsing libraries. Rank the options by effort and reliability for Greek-language recipes.

## TL;DR

1. Recipe JSON-LD with a free-text `recipeIngredient` array is effectively universal on professional food sites, including the big Greek ones (argiro.gr, akispetretzikis.com, gastronomos.gr all verified emitting it), because Google's rich-results guidance recommends it.
2. AnyList's signature import is exactly this: one generic schema.org extractor plus a manual copy-paste fallback, then a tap-per-ingredient / add-all UI into the list. No per-site scrapers, no interactive fix-up flow.
3. No open-source ingredient-line parser supports Greek. The viable Greek-capable line splitters are (a) a small hand-rolled quantity-first regex with a Greek unit dictionary, or (b) LLM structured extraction at roughly $0.003-0.004 per recipe.
4. Recommended for Householder: URL fetch + JSON-LD extraction in a tRPC mutation (no library needed), a deterministic Greek-aware line splitter into `name`/`qty`/`note` (all free text in our schema, so failures degrade gracefully), a review screen before a batch insert, and paste-a-block manual capture as the always-available fallback. LLM splitting is a clean later upgrade, not a prerequisite.

## 1. Paste-a-URL parsing: schema.org/Recipe

### The vocabulary

- `recipeIngredient`: "An ingredient or ordered list of ingredients and potentially quantities used in the recipe, e.g. 1 cup of sugar, flour or garlic. The ingredients can be represented as free text or more structured values. Supersedes ingredients." ([schema.org/Recipe](https://schema.org/Recipe))
- The current release TTL declares `rangeIncludes` Text, ItemList, PropertyValue ([schemaorg-current-https.ttl](https://schema.org/version/latest/schemaorg-current-https.ttl)), but the structured variants are a recent addition; everything deployed in the wild (all sites verified below, and Google's own examples) uses plain text lines like "200 g flour" with quantity, unit, and name embedded in one string.
- Legacy `ingredients` is superseded and nearly dead ("1K - 10K Domains" per Google's index aggregation on [schema.org/ingredients](https://schema.org/ingredients)); accept it as a fallback key, nothing more.
- `recipeYield` is "QuantitativeValue or Text" ([schema.org/Recipe](https://schema.org/Recipe)); useful later for scaling, not needed for v1.

### Why adoption is near-universal on food sites

Google's Recipe rich-results documentation requires only `name` and `image` but recommends `recipeIngredient`, `recipeYield`, `recipeInstructions`, times, ratings, and nutrition, with all examples in JSON-LD ([developers.google.com recipe structured data](https://developers.google.com/search/docs/appearance/structured-data/recipe)). That recommendation is what drives food sites to emit full ingredient arrays.

Measured adoption:

- Web Data Commons (structured data extracted from Common Crawl, October 2024 corpus): schema.org/Recipe markup on 2,746,545 URLs across 37,304 hosts ([webdatacommons.org subsets](https://webdatacommons.org/structureddata/2024-12/stats/schema_org_subsets.html)); about 52% of all crawled HTML URLs carried some structured data ([webdatacommons.org](https://webdatacommons.org/structureddata/)). Lower bounds, since Common Crawl samples the web.
- HTTP Archive Web Almanac 2024: JSON-LD on 41% of mobile pages and rising, microdata 26% ([almanac.httparchive.org structured-data](https://almanac.httparchive.org/en/2024/structured-data)).
- schema.org itself shows Recipe in use on "10K - 100K Domains" ([schema.org/Recipe](https://schema.org/Recipe)).

### Greek sites, verified against actual HTML (2026-08-18)

| Site | Emits Recipe? | Format | recipeIngredient |
| --- | --- | --- | --- |
| argiro.gr | Yes | JSON-LD (Yoast `@graph`) | Yes, Greek free text |
| akispetretzikis.com | Yes | JSON-LD | Yes, with caveats below |
| gastronomos.gr | Yes | JSON-LD | Yes, Greek free text |
| sintagespareas.gr | Unverified | JS bot-protection wall blocked fetching | n/a |

None of the three verified sites use microdata; all are JSON-LD in `<script type="application/ld+json">`.

Example lines exactly as emitted, showing what a parser must handle:

- argiro.gr ([Λαχανοντολμάδες της μαμάς](https://www.argiro.gr/recipe/laxanontolmades-ths-mamas/), URL from their recipe sitemap): `1 τεμάχια λάχανο μέτριο`, `500 gr κιμά`, `2 κρεμμύδια ψιλοκομμένα`, `1/2 ματσ. άνηθο ψιλοκομμένο`, `1  φλ. ρύζι καρολίνα` (double space where a field is empty). Recipe node also carries `name`, `recipeYield: "6"`, times, instructions.
- akispetretzikis.com ([Πεϊνιρλί σοκολάτας, Wayback capture](https://web.archive.org/web/20250815153012/https://akispetretzikis.com/recipe/1006/peinirli-sokolatas)): `250 γρ.  νερό`, `1 κ.σ. ξηρή μαγιά`, `410 γρ.  αλεύρι γ.ό.χ.`, `1  πρέζα αλάτι`, `  κουβερτούρα` (no quantity at all). The site concatenates separate qty + unit + name fields with spaces, leaving doubles when a field is empty; page-level ingredient sections (dough vs filling) are flattened into one array.
- gastronomos.gr ([Παγωμένη τάρτα black forest](https://www.gastronomos.gr/syntagh/pagomeni-tarta-black-forest/375491/)): `130 γρ. ζάχαρη ` (trailing space), `100 ml νερό `, `150 γρ. ασπράδι αυγού (από περίπου 5 μεσαία αυγά)`, plus long comma-separated prep notes and secondary quantities embedded mid-line ("100 ml Kirsch" inside the cherries line). No `recipeYield` on this page.

Two operational caveats:

1. Bot protection. akispetretzikis.com returns a Cloudflare "Just a moment" challenge (403) to curl with a browser UA and to non-browser fetchers. A server-side fetch will fail for that site specifically; the manual paste fallback covers it.
2. Client-side hydration. Later Wayback captures of some Akis recipes contain the Recipe JSON-LD skeleton with `recipeIngredient: []`, `recipeInstructions: []`, `cookTime: "PTnullM"` ([example capture](https://web.archive.org/web/20251027154155/https://akispetretzikis.com/recipe/1012/garides-gioyvetsi-bb0d212d-e30d-4191-af70-24d7d9d97e88)), meaning the JSON-LD is filled in client-side. A parser must treat an empty `recipeIngredient` as "needs JS rendering, fall back to manual", not "recipe has no ingredients".

Parser checklist distilled from the real data: Greek unit abbreviations (γρ., κ.σ., κ.γ., φλ., ματσ., πρέζα, τεμάχια) and Latin ones (gr, ml), fraction strings (1/2), comma decimal separator, double and trailing spaces, quantity-less lines, parenthetical and comma-appended prep notes, flattened sections, `@graph` wrappers, empty hydrated arrays.

## 2. What AnyList actually ships (their docs, not listicles)

AnyList is the closest reference product, and its docs are unusually explicit about the mechanism.

- Parsing approach: "Recipes can be imported from any websites that supports the schema.org microdata standard. Most major recipe websites and blogs support this standard, because it helps to improve the appearance of their recipes in Google search results" ([help.anylist.com recipe-import-sites](https://help.anylist.com/articles/recipe-import-sites/)). One generic structured-data extractor, not per-site scrapers.
- Failure fallback is plain manual capture: "Unfortunately, not every site supports the schema.org microdata standard. For these sites, you can copy and paste recipes into AnyList instead" (same page; repeated in the [iOS extension article](https://help.anylist.com/articles/recipe-extension/)). There is no documented interactive correction flow.
- Entry points are share sheet (iOS action extension, Android sharing activity), desktop browser extensions, and an in-app recipe search engine ([feature overview](https://help.anylist.com/articles/feature-overview-recipe-import/), [desktop extensions](https://help.anylist.com/articles/recipe-desktop-extensions/)). Notably their docs do not describe a paste-a-URL-into-the-app flow.
- Manual entry is paste-a-block, not a per-ingredient form: create a recipe, tap Ingredients, "Tap on Paste Ingredients, then paste the ingredient text and tap Done" ([recipe-copy-paste](https://help.anylist.com/articles/recipe-copy-paste/)).
- Recipe to list: "When viewing a recipe, tap on an ingredient to add it to your list", plus an "Add all ingredients to list" button; a destination-list picker in the header; "Similar ingredients are combined into a single list item which shows the total quantity needed", with per-recipe removal from a merged line ([add-recipe-ingredients-to-list](https://help.anylist.com/articles/add-recipe-ingredients-to-list/), [remove-single-ingredient-from-list](https://help.anylist.com/articles/remove-single-ingredient-from-list/)).
- Quantity is a parsed per-ingredient field: recipe scaling (paid) adjusts the quantity field and back-propagates to list items already added, and their docs enumerate its limits ("only the first value (or range of values) in the quantity is scaled") ([scale-recipe](https://help.anylist.com/articles/scale-recipe/)).
- Monetization: 5 web-recipe imports free, unlimited with AnyList Complete ($9.99/yr individual, $14.99/yr household); core add-to-list, merge, and aisle auto-categorization stay free; scaling, recipe photos, and meal planning are paid ([anylist.com/features](https://www.anylist.com/features), [feature overview](https://help.anylist.com/articles/feature-overview-recipe-import/)).
- No photo/OCR import is documented; "email import" is opening a proprietary AnyList recipe file, not parsing arbitrary emails ([open-recipe-file](https://help.anylist.com/articles/open-recipe-file/)).

Takeaway: the industry-leading implementation of this feature is schema.org extraction + copy-paste fallback + a low-friction add-to-list UI. That entire shape is reproducible by Householder.

## 3. Manual ingredient capture UIs

Two patterns exist in practice:

1. Paste-a-block (AnyList's documented flow, above): user pastes the whole ingredient list as multi-line text; the app splits on newlines, one line per item. This is the highest-value manual UI because every recipe source (cookbook, Instagram caption, blocked site) reduces to it, and it costs almost nothing to build.
2. Field-per-ingredient forms: not what AnyList documents, and strictly more taps. Householder already has a single-item add flow (`item.add` with `name`, `qty`, `note` in `server/routers/item.ts`); a per-ingredient form adds nothing over it.

For Householder the manual path is: textarea, split on newlines, run each line through the same splitter as URL import, show the same review screen. One code path, two entry points.

## 4. Ingredient-line parsing (qty/unit/name splitting)

### Open-source libraries

| Library | Stack | Approach | Languages | Status (checked 2026-08-18) |
| --- | --- | --- | --- | --- |
| [nytimes/ingredient-phrase-tagger](https://github.com/nytimes/ingredient-phrase-tagger) | Python | CRF model, ~180k NYT examples | English | Archived read-only since Mar 2019 |
| [strangetom/ingredient-parser](https://github.com/strangetom/ingredient-parser) (`ingredient-parser-nlp`) | Python | Sequence labelling, 81k+ examples; self-reported 95.62% sentence accuracy | English only; maintainer says other languages would be "a lot of effort" ([issue #46](https://github.com/strangetom/ingredient-parser/issues/46)) | Active, v2.7.0 May 2026 |
| [parse-ingredient](https://github.com/jakeboone02/parse-ingredient) (jakeboone02) | TypeScript | Pattern matching + English unit dictionary; returns quantity, quantity2, unitOfMeasure, description; extensible via `additionalUOMs` and `decimalSeparator` | English dictionary; Greek units addable by hand | Active, MIT, v2.2.0 Apr 2026, ~1.9k weekly downloads |
| [recipe-ingredient-parser-v3](https://github.com/suprmat95/recipe-parser) | JS | NLP via Natural | English, Italian | v1.5.0 Feb 2025, 129 weekly downloads |
| ingredientparserjs | JS | n/a | English | Abandoned (2022, 2 weekly downloads) |
| [Zestful](https://zestfuldata.com/) | Commercial API | ML service | Undocumented; all examples English | $0.02 per ingredient ([pricing](https://zestfuldata.com/pricing)); a 10-ingredient recipe costs $0.20 |

Recipe scraping (page to ingredient lines) has one excellent library, [hhursev/recipe-scrapers](https://github.com/hhursev/recipe-scrapers) (Python, MIT, active, 734+ sites including argiro.gr and akispetretzikis.com per its [supported-sites list](https://docs.recipe-scrapers.com/getting-started/supported-sites/)), but it is Python and Householder has no Python sidecar. The JS scraper packages are dormant (`recipe-scraper` last published 2022, 34 weekly downloads; `recipe-data-scraper` 26 weekly downloads) or unsuitable (`@julianpoy/recipe-clipper` is AGPL-3.0 and designed to run against a live browser `window`). Since the Greek targets all emit JSON-LD, generic `<script type="application/ld+json">` extraction needs no library at all.

### Greek reality check

No surveyed library declares Greek support. parse-ingredient ships an English unit dictionary (Greek units like κ.σ. or φλιτζάνι must be hand-added via `additionalUOMs`, and the comma decimal separator configured); recipe-ingredient-parser-v3 lists exactly English and Italian; strangetom's model and the NYT tagger are English-only. Greek splitting therefore means either a small custom splitter or an LLM.

The custom splitter is smaller than it sounds because the verified Greek sites share one shape: optional leading quantity (integer, fraction, or comma decimal), optional unit from a short known list, remainder is the name, with parentheticals and comma-appended phrases peelable into `note`. And because Householder's `qty` and `note` columns are free text (`supabase/migrations/0001_schema.sql`), a line the splitter cannot parse degrades gracefully to the whole line in `name`, which the user fixes on the review screen.

### LLM extraction

Structured extraction is a first-class documented pattern on the Claude API: structured outputs constrain responses to a JSON schema with guaranteed conformance via constrained decoding, supported by `claude-haiku-4-5` ([structured outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). At official Haiku 4.5 pricing ($1/MTok in, $5/MTok out, [pricing](https://platform.claude.com/docs/en/about-claude/pricing)), a recipe's ingredient block (~1,000 input tokens with prompt and schema, ~500 output) costs roughly $0.003-0.004, several hundred recipes per dollar. It is language-agnostic, so Greek lines, ranges, and prep notes map directly onto `name`/`qty`/`note` with no unit dictionary. Costs: an API key, a new dependency, per-call latency, and a server-side external call from the tRPC mutation.

## 5. Options ranked for Householder

Householder specifics that shape the ranking: `list_items` has free-text `name`/`qty`/`note`; `item.add` exists but there is no batch insert yet; the stack is Next.js + tRPC on Vercel serverless; primary content language is Greek.

| # | Option | Effort | Reliability for Greek recipes | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Paste-a-block manual capture: textarea, newline split, line splitter, review screen, batch insert | Lowest (one screen + one `item.addMany` mutation) | High; works for every source including blocked sites | Ship first; it is also the fallback every other option needs |
| 2 | URL import via JSON-LD extraction: server-side fetch in a tRPC mutation, parse `application/ld+json` (handle `@graph`, arrays, legacy `ingredients`), feed lines into the same review screen | Low; no scraping library needed | High on argiro.gr and gastronomos.gr; fails on Cloudflare-guarded (akispetretzikis.com server-side) and empty hydrated arrays, both of which must route to option 1, not error out | Ship second; this is AnyList's exact architecture |
| 3a | Line splitting, deterministic: quantity-first regex + Greek unit dictionary (optionally as `additionalUOMs` on parse-ingredient, though hand-rolling ~50 lines avoids the dependency) | Low-medium | Good on the verified site formats; degrades gracefully (whole line into `name`) | Ship as the v1 splitter behind the review screen |
| 3b | Line splitting, LLM: Claude Haiku structured output over the ingredient block | Low code, new operational dependency | Highest; language-agnostic, handles prep-note peeling into `note` | Clean upgrade if 3a's misses annoy in practice; ~$0.003-0.004/recipe |
| 4 | Per-site scrapers or Python recipe-scrapers sidecar | High (new runtime or per-site maintenance) | High but unnecessary | Rejected; JSON-LD covers the same sites without the runtime |
| 5 | Zestful API | Low code | Undocumented for Greek; $0.20 per 10-ingredient recipe | Rejected on language and cost (50x the LLM route) |

### Recommendation

Build options 1 + 2 + 3a as one feature: a "recipe import" screen accepting either a URL or pasted text, producing an editable review list of `{name, qty, note}` rows (Greek unit-aware deterministic splitter), inserted via a new batch mutation on confirm. This mirrors what AnyList ships (schema.org extraction, manual paste fallback, add-all with review) at small effort, works fully for argiro.gr and gastronomos.gr, and handles akispetretzikis.com via paste. Keep 3b (Haiku structured extraction) as the documented upgrade path if splitter quality on wild recipes disappoints; the review screen makes the deterministic version safe to ship first because every parse error is user-correctable before insert.

Out of scope for v1, by evidence: scaling and ingredient merging (AnyList's paid tier and the main reason it parses quantities numerically; our free-text `qty` cannot sum, and a two-person household rarely needs it), photo/OCR (even AnyList does not ship it), and storing recipes as first-class objects (a later decision; v1 can be import-and-forget straight into a list).
