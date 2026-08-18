# Settlement rails for a Greek couple: what a PWA can actually hand off

Research memo, 2026-08-18. Primary-source investigation for Householder's future "Settle" action.

## The question

Which settlement rails actually work for two private individuals in Greece settling a shared-expense balance in euros, and what can an installed PWA deep-link into? Examined: IRIS instant payments (DIAS), the EPC QR code (EPC069-12), SCT Inst and the EU Instant Payments Regulation, Revolut payment links, and Viva.com. Constraint: no PSP merchant account, no bank aggregation, both users are private individuals.

## TL;DR

| Rail | Can Householder generate a link/QR? | Works for two private individuals? | Greek bank support | Bottom line |
| --- | --- | --- | --- | --- |
| IRIS P2P | No. No public URI scheme or payment-link format exists; initiation happens only inside each bank's own mobile banking app | Yes: free, instant, addressed by mobile number, 1,000 EUR/day | All four systemic banks plus 8 smaller PSPs | The rail the couple will actually use, but Householder cannot deep-link into it; it can only prepare the data |
| EPC QR (EPC069-12) | Yes: fully public payload spec, trivially generatable client-side | Yes: it is just a pre-filled SEPA credit transfer | No first-party evidence that any Greek bank app scans it | Cheap to ship as a universal fallback, but do not expect Greek apps to scan it today |
| SCT Inst / IPR | Not a UI, a rail | Yes | Mandatory: euro-area banks must receive instant transfers since 2025-01-09 and send since 2025-10-09, at no price premium over normal transfers | Guarantees that a plain IBAN transfer between the partners lands in seconds |
| Revolut payment links | Partially: a static `revolut.me/<username>` profile link is a stable URL to open; amount pre-fill by a third party is not documented | Yes: Revolut-to-Revolut transfers have no fees; non-Revolut payers can pay a link by card within limits | Independent of Greek banks | Best real link handoff, but only if both partners keep Revolut accounts |
| Viva.com | No | No: onboarding is business-only (company name, business registry number or VAT required) | n/a | Not usable without a merchant account; rule it out |

## 1. IRIS (DIAS instant payments)

Confirmed by primary source (DIAS S.A., the scheme operator, [IRIS payments service page](https://www.dias.com.gr/en/services/iris-payments/), fetched live 2026-08-18):

- IRIS is "DIAS' interbank service for instant account-to-account money transfers", built "on the rules of the European SEPA Instant Credit Transfer payment scheme". It has three products: IRIS P2P (individuals), IRIS P2Pro (freelancers and sole proprietors), IRIS Commerce (merchants).
- IRIS P2P is addressed by alias: "Money is sent without requiring the entry of the recipient's IBAN. Instead, an alternative identifier ('alias') is used, such as the mobile phone number or a QR Code."
- Initiation is in-bank-app only: "Transfers are executed instantly, easily and securely via the mobile banking apps of the banks that participate in the service, provided that both the sender and the recipient have activated the IRIS payments service." The service is offered "through the banks' existing mobile banking applications, with no need for a new app."
- Free for P2P: "The service is offered free of charge to users by the participating banks."
- Limits: 1,000 EUR/day to individuals plus 1,000 EUR/day to professionals (2,000 EUR/day total from mobile). Receiving as an individual: up to 1,000 EUR/day.
- P2P participating providers include all four systemic banks: Eurobank, Piraeus Bank, National Bank of Greece, Alpha Bank, plus Credia Bank, Optima bank, Viva.com, Snappi Bank, and four cooperative banks.
- Crediting happens "within 10 seconds, 24/7/365" with an immediate notification to the beneficiary.

Limit history, confirmed by the DIAS [2025 review press release, 2026-01-13](https://www.dias.com.gr/en/news-center/press-releases/dias-payment-system-2025-review-dias-accelerates-the-economy-new-all-time-high-in-transaction-volume-and-value-in-2025-iris-further-strengthened-with-a-doubling-of-daily-transaction-limits/): "as of 15 January 2026" DIAS doubled the daily limits, so users can "send up to 1,000 EUR per day to individuals via IRIS P2P (with a monthly limit of 5,000 EUR)". The prior 500 EUR/day P2P limit is confirmed in the ["IRIS Everywhere" press release, 2025-12-16](https://www.dias.com.gr/en/news-center/press-releases/dias-iris-everywhere-greece-becomes-the-first-country-in-europe-with-universal-acceptance-of-instant-payments-across-all-points-of-sale/): "up to 500 EUR per day per individual (soon increasing to 1,000 EUR)".

### Is there a payment link or URI scheme a third-party app can generate?

No. This is the core negative finding, and it is an absence-of-evidence conclusion after reviewing the operator's own materials:

- The DIAS service pages and [FAQ](https://www.dias.com.gr/en/faqs/) describe every flow as starting inside the bank's app: "In your mobile banking app, select: IRIS payments > With QR code. The camera on your phone opens; you scan the QR code and approve the payment." Sending P2P is described only as "selecting their mobile number from your contacts or by entering it manually" inside the bank app.
- The IRIS QR codes that exist are produced by the system itself, not by third parties: a "static IRIS QR" that a professional's bank issues for P2Pro, a per-transaction QR that "the POS in the physical store generates", and checkout QRs in e-shops. DIAS publishes no payload format for any of them, and no `iris://` scheme, universal link, or web payment-link format appears anywhere in its public materials.
- Merchant-side IRIS (IRIS Commerce) is only reachable through a contracted PSP: "The merchant / business must have a contract with a Payment Service Provider that offers the IRIS Commerce product" (DIAS services page). PSP developer documentation confirms this shape: Nexi's [XPay Greece IRIS docs](https://developer.nexigroup.com/xpaygreece/en-EU/docs/iris-payments/) expose IRIS only as a payment method inside a merchant acquiring integration (hosted payment page, pay-by-link, API), where the customer then scans a QR or is redirected to their bank's environment.

Gap noted honestly: the consumer site irispayments.gr could not be reached from this environment (DNS resolution failure on 2026-08-18), so it could not be checked directly. Nothing in the DIAS corporate materials that were fetched suggests it documents a third-party-generatable link, and no search result surfaced one.

### The 2025 regulatory push

Confirmed via DIAS primary sources, with one caveat:

- The DIAS FAQ states that IRIS P2Pro acceptance implements "Compliance with Law 5072/2023 and Joint Ministerial Decision 119899/2023 for acceptance of account-to-account instant payments". The legal texts themselves were not fetched; the citation is DIAS's.
- "As of 1 December 2025, IRIS Commerce is available at every POS and every e-shop in Greece", making Greece "the first country in Europe to achieve universal acceptance of Account-to-Account instant payments across all points of sale" (["IRIS Everywhere" press release](https://www.dias.com.gr/en/news-center/press-releases/dias-iris-everywhere-greece-becomes-the-first-country-in-europe-with-universal-acceptance-of-instant-payments-across-all-points-of-sale/)).
- Cross-border: Greece joined the EuroPA alliance (DIAS, SIBS, Bizum, BANCOMAT signing first) with DIAS "technically ready to support IRIS P2P transactions via EuroPA in the first half of 2026" ([press release, 2025-06-12](https://www.dias.com.gr/en/news-center/press-releases/greece-joins-europa-through-iris-payments-the-first-pan-european-network-for-interoperable-instant-payments/)). Secondary press reports a 2026-06-30 launch of cross-border P2P by mobile number; that date was not confirmed against a DIAS primary source in this pass.

## 2. EPC QR code (EPC069-12)

Primary source: the EPC document itself, [EPC069-12 v3.1, "Quick Response Code: Guidelines to Enable the Data Capture for the Initiation of a SEPA Credit Transfer"](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-03/EPC069-12%20v3.1%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT.pdf), issued and effective 2024-03-19 (PDF downloaded and read in full).

### Status: guidelines, not a scheme

Quoting the document: "This document is of an informative nature only and describes how the data capture prior to the initiation of an SCT can be made by means of a 2D code. Therefore, it is optional for PSPs adhering to the SCT scheme to implement this feature and offer it to their customers." So there is no obligation on any bank, Greek or otherwise, to scan these codes. The document also notes it targets use cases where the payment data is simultaneously shown in plain text to the payer (e.g. on an invoice); for QR-only presentation at a point of interaction it refers to a separate document, EPC024-22 (standardisation of QR codes for mobile-initiated SEPA credit transfers).

### Exact payload format (v3.1)

Elements in order, separated by LF or CRLF, last populated element not followed by a separator, total payload at most 331 bytes, QR error correction level M, QR version at most 13:

| # | Element | M/O | Max chars | Content |
| --- | --- | --- | --- | --- |
| 1 | Service Tag | M | 3 | `BCD` |
| 2 | Version | M | 3 | `001` (V1) or `002` (V2) |
| 3 | Character set | M | 1 | `1` = UTF-8, `2` = ISO 8859-1, ... `6` = ISO 8859-7 (Greek), `8` = ISO 8859-15 |
| 4 | Identification | M | 3 | `SCT` |
| 5 | BIC | V1: M, V2: O/M | 11 | AT-C002, BIC of the beneficiary PSP; "mandatory for SEPA payment transactions involving SCT scheme participants from non-EEA countries" |
| 6 | Name | M | 70 | AT-E001, name of the beneficiary |
| 7 | IBAN | M | 34 | AT-C001, "Only IBAN is allowed." |
| 8 | Amount | O | 12 | AT-T002, "Amount of the SEPA Credit Transfer in euro", format `EUR12.3`; "Amount must be larger than or equal to 0.01, and cannot be larger than 999999999.99" |
| 9 | Purpose | O | 4 | AT-T007 purpose code |
| 10 | Remittance (structured) | O, {Or} | 35 | AT-T009 structured, "ISO 11649 RF Creditor Reference may be used" |
| 11 | Remittance (unstructured) | O, {Or} | 140 | AT-T009 unstructured free text (only one of 10/11 may be populated) |
| 12 | Beneficiary-to-originator info | O | 70 | free text |

A Householder-style payload for settling 25.00 EUR (version 002, UTF-8, no BIC needed for a Greek-to-Greek transfer, unstructured remittance):

```
BCD
002
1
SCT

PAPADOPOULOU MARIA
GR1601101250000000012300695
EUR25.00


Householder Aug 2026
```

(Line 5, BIC, left empty; line 9, purpose, left empty; structured remittance line empty, unstructured used.)

### Who scans it, and do Greek banks?

- Adoption is strongest in Austria, Germany, Belgium, the Netherlands and Finland; this is stated by secondary sources only (QR generator vendors and the banking-software vendor Gini), not verified bank by bank in this pass. Inferred, not primary-confirmed.
- Greek banks: no first-party evidence was found that any of the four systemic Greek banks (Alpha, NBG, Eurobank, Piraeus) scans EPC069-12 codes. Checked directly: Alpha Bank's [money transfers page](https://www.alpha.gr/en/retail/myalpha/online-transactions-and-digital-wallets/money-transfers) describes IBAN transfers only via manual entry and mentions QR nowhere in that context; Eurobank's [mobile app page](https://www.eurobank.gr/en/retail/electronic-banking/mobile-and-apps/mobile-apps/eurobank-mobile-app) mentions QR scanning only for IRIS business payments and for bill payments ("scan the barcode or the QR code of the bill"), which is the separate DIAS RF/QR bill-payment product, not EPC QR. NBG and Piraeus materials reviewed via search likewise surfaced only IRIS and bill-payment QR features. Conclusion: treat EPC QR as unscannable in Greek bank apps until a bank documents otherwise. This is an absence-of-evidence finding, stated as such, not a confirmed "they cannot".

## 3. SCT Inst and the Instant Payments Regulation

Primary sources: the EPC's [SEPA Instant Credit Transfer page](https://www.europeanpaymentscouncil.eu/what-we-do/sepa-instant-credit-transfer) (read via Wayback snapshot of 2026-06-10; the live site blocks automated fetching) and the full text of [Regulation (EU) 2024/886 on EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R0886) (read via Wayback snapshot of 2026-05-31).

- SCT Inst is the EPC scheme "enabling pan-European credit transfers with the funds made available on the account in less than ten seconds", operational since November 2017 (EPC page).
- Regulation (EU) 2024/886 of the European Parliament and of the Council of 13 March 2024 (the Instant Payments Regulation, IPR) amends Regulation (EU) No 260/2012 and others "as regards instant credit transfers in euro". Key obligations from the regulation text:
  - Article 5a(8): PSPs "located in a Member State whose currency is the euro shall offer PSUs the payment service of receiving instant credit transfers in euro ... by 9 January 2025, and the payment service of sending instant credit transfers in euro ... by 9 October 2025." (Non-euro member states: 2027-01-09 and 2027-07-09.)
  - Article 5b(1): "Any charges levied by a PSP on payers and payees in respect of sending and receiving instant credit transfers shall not be higher than the charges levied by that PSP in respect of sending and receiving other credit transfers of corresponding type." Euro-area PSPs had to comply by 2025-01-09.
  - Articles 5b(2) and 5c: verification of payee (name/IBAN check before sending) must be offered "free of charge"; euro-area PSPs had to comply by 2025-10-09.
- Implication for Householder: both partners' Greek banks are legally required to receive and send instant euro credit transfers around the clock at no premium over a normal transfer. A plain IBAN transfer between the two partners is therefore an instant rail even outside IRIS aliases, subject to each bank's own daily e-banking limits.

## 4. Revolut payment links (revolut.me)

Primary sources: Revolut's own help centre. The live pages block automated fetching ("Just a quick security check"), so they were read via Wayback snapshots, noted per page.

- What a link is: "Revolut.me links are a secure way to receive money without sharing personal or account details. They can be used to request money from a card or a Revolut account" ([Revolut.me link, UK help page](https://help.revolut.com/help/transfers/payment-links/revolut-me-link/), snapshot 2025-09-18). So the payer does not need a Revolut account; a card payment against the link works.
- Amount pre-fill: the amount is set by the recipient when creating the request inside the app: "Set the amount to request, or share a generic Revolut.me link and allow the sender to input the amount" and "To change the amount on a payment link, you'll need to cancel it and create a new one" ([Requesting money with a payment link, US help page](https://help.revolut.com/en-US/help/adding-money/with-money-from-friends-or-relatives/requesting-money/), snapshot 2026-05-06). No primary source documents a URL parameter (e.g. an amount query string) that a third-party app could append to `revolut.me/<username>` to pre-fill an amount; community folklore about such parameters exists but is unverified, and this memo does not rely on it.
- Expiry and limits: "When you request money, the sender will have 10 days to complete your request and then the link will expire"; card receipts are capped ("a maximum of 250 GBP per week (or the equivalent in other currencies) via card payments", plus per-link top-up counts: at most 20 completed top-ups a week, 40 a month). Note the caps apply to the card path, not to Revolut-to-Revolut payments.
- Fees between Revolut users: "There are no transfer fees when making transfers between Revolut customers" ([Send or request money from other Revolut customers, US help page](https://help.revolut.com/en-US/help/transfers/internal-transfers/send-or-request-money-from-other-revolut-customers/), snapshot 2026-06-30).
- Regional variance exists (the US page notes requesting from non-Revolut customers is unavailable there), so exact behaviour for Greek accounts (served by Revolut Bank UAB) should be sanity-checked once on the partners' own phones. That Revolut serves Greek customers is background knowledge, not re-verified against a primary page in this pass.

Net: the only thing Householder can deep-link is the static profile URL `https://revolut.me/<username>`, which opens the recipient's pay page; the payer types the amount. A pre-filled amount requires the creditor to create the request inside the Revolut app, which Householder cannot automate.

## 5. Viva.com

Primary sources: Viva.com's support centre (Intercom pages, rendered headless because article bodies are JS-loaded).

- Onboarding is business-only. The [account registration article](https://euhelp.viva.com/en/articles/10221575-viva-com-account-registration-process) requires "Company Name" and "Business Registry Number or VAT Number" plus estimated "Annual Processing Revenue", and its own copy reads "start enjoying the benefits of your business account". The support centre brands the product "Viva.com - the 1st Tech Bank in Europe for Businesses".
- Payment links exist but hang off a merchant account: Quick Pay is "a unique permanent payment link ... to accept online payments from your customers on your Viva.com Account", created "from the home page of the Viva.com business account", priced on the Interchange++ card-acquiring model ([Getting started with Quick Pay](https://euhelp.viva.com/en/articles/5221014-getting-started-with-quick-pay)). Smart Checkout is the underlying merchant checkout.
- Personal wallet: the help centre still contains legacy references to personal accounts (an article titled "How can I transfer money from my personal Viva.com Account to a card?"), but no consumer sign-up path exists on viva.com today and no P2P product is marketed. No primary page was found that formally announces the personal wallet's discontinuation; the conclusion "not open to new private individuals" is inferred from the business-only registration flow and support structure, and is flagged as inference.
- One genuinely relevant fact: Viva.com participates in IRIS P2P and P2Pro as a payment service provider (listed among participating providers on the [DIAS IRIS page](https://www.dias.com.gr/en/services/iris-payments/)), so an existing legacy Viva personal account could in principle sit on the IRIS rail; this does not help two individuals who are not already Viva customers.

Verdict: Viva is not usable for this app's Settle action. No merchant onboarding is possible for the two partners, and every Viva payment tool presupposes one.

## 6. Generic fallbacks a PWA can always do

- Web Share: `navigator.share()` "invokes the native sharing mechanism of the device to share data such as text, URLs, or files"; available "only in secure contexts (HTTPS)" and it "must be triggered off a UI event like a button click" (transient activation) ([MDN, Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)). Sharing a plain-text settlement summary (payee name, IBAN, amount, note) into Viber/WhatsApp/SMS works on Android Chrome and iOS Safari.
- Clipboard: `navigator.clipboard.writeText()` for one-tap copy of the IBAN alone, the amount alone, or a formatted block ([MDN, Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)). Copying discrete fields separately matters because bank transfer forms have separate inputs.
- Greek bank app deep links: no documented URL schemes or app links were found for myAlpha Mobile, the Eurobank Mobile App, winbank/Piraeus, or NBG Mobile Banking in any first-party documentation or developer resource. Searches across the banks' sites and app-store listings turned up nothing. Absence stated explicitly: as of this memo there is no documented way to deep-link a Greek bank app, let alone into a pre-filled transfer screen.

## What this means for Householder's Settle action

The realistic shape of Settle, given all of the above:

1. Accept that the money will move over IRIS P2P inside a bank app, and that Householder's job ends at the app's edge. Both partners' banks are IRIS P2P participants, the transfer is free, instant, and addressed by the partner's mobile number, which Householder already knows. There is no link to generate; instead, make the 20-second manual flow zero-thought: a Settle sheet showing "Pay X.XX EUR to <partner name>", with one-tap copy of the amount and of the partner's mobile number, and a hint line ("Open your bank app, IRIS payments, send to contact"). Amounts above 1,000 EUR/day (or 5,000 EUR/month) need the IBAN path instead; the sheet should switch its guidance when the balance exceeds the IRIS limit.
2. Offer a Revolut shortcut when both partners have Revolut. Store an optional `revolut.me` username per partner profile; Settle then shows an "Open Revolut" button linking to `https://revolut.me/<username>`. The payer still types the amount (keep it on the clipboard). Do not build on undocumented amount query parameters.
3. Ship the EPC QR plus a structured copy block as the universal fallback. Generating EPC069-12 payloads is trivial and fully client-side (service tag BCD, version 002, UTF-8, SCT, name, IBAN, `EURxx.xx`, unstructured remittance "Householder <month>"). Label it honestly in the UI as "for banking apps that scan SEPA QR codes", because no Greek bank app is documented to scan it; its real value today is as a future-proof data carrier and for any EU bank app a partner might also use. The dependable sibling is the copy block: partner name, IBAN, amount, and note as separately copyable fields, plus `navigator.share()` of the whole block.
4. Skip Viva entirely, and skip any IRIS "integration" pretence: no third-party link or QR into IRIS P2P exists, and faking one (e.g. rendering an unofficial QR and calling it IRIS) would only confuse.

The one-line summary: prepare the payment perfectly, hand it to the human, and let the rails (IRIS in-app, or a pasted-IBAN instant SEPA transfer that the IPR now guarantees arrives in seconds) do the rest.

## Sources

Primary, fetched live:

- DIAS, IRIS payments service page: https://www.dias.com.gr/en/services/iris-payments/
- DIAS, FAQs: https://www.dias.com.gr/en/faqs/
- DIAS press release, 2025 review and limit doubling (2026-01-13): https://www.dias.com.gr/en/news-center/press-releases/dias-payment-system-2025-review-dias-accelerates-the-economy-new-all-time-high-in-transaction-volume-and-value-in-2025-iris-further-strengthened-with-a-doubling-of-daily-transaction-limits/
- DIAS press release, "IRIS Everywhere" (2025-12-16): https://www.dias.com.gr/en/news-center/press-releases/dias-iris-everywhere-greece-becomes-the-first-country-in-europe-with-universal-acceptance-of-instant-payments-across-all-points-of-sale/
- DIAS press release, EuroPA (2025-06-12): https://www.dias.com.gr/en/news-center/press-releases/greece-joins-europa-through-iris-payments-the-first-pan-european-network-for-interoperable-instant-payments/
- EPC069-12 v3.1 PDF (2024-03-19): https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-03/EPC069-12%20v3.1%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT.pdf
- Nexi XPay Greece, IRIS payments developer docs: https://developer.nexigroup.com/xpaygreece/en-EU/docs/iris-payments/
- Viva.com support, account registration process: https://euhelp.viva.com/en/articles/10221575-viva-com-account-registration-process
- Viva.com support, Getting started with Quick Pay: https://euhelp.viva.com/en/articles/5221014-getting-started-with-quick-pay
- Alpha Bank, money transfers: https://www.alpha.gr/en/retail/myalpha/online-transactions-and-digital-wallets/money-transfers
- Eurobank, mobile app: https://www.eurobank.gr/en/retail/electronic-banking/mobile-and-apps/mobile-apps/eurobank-mobile-app
- MDN, Navigator.share: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share

Primary, read via Wayback Machine snapshots (live pages block automated fetching; snapshot dates in section text):

- EPC, SEPA Instant Credit Transfer: https://www.europeanpaymentscouncil.eu/what-we-do/sepa-instant-credit-transfer
- EUR-Lex, Regulation (EU) 2024/886 full text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R0886
- Revolut help, Revolut.me link (UK): https://help.revolut.com/help/transfers/payment-links/revolut-me-link/
- Revolut help, Requesting money with a payment link (US): https://help.revolut.com/en-US/help/adding-money/with-money-from-friends-or-relatives/requesting-money/
- Revolut help, Send or request money from other Revolut customers (US): https://help.revolut.com/en-US/help/transfers/internal-transfers/send-or-request-money-from-other-revolut-customers/

Not reachable in this pass (gaps stated in text): irispayments.gr (DNS failure); the Greek legal texts Law 5072/2023 and JMD 119899/2023 (cited via the DIAS FAQ only); any first-party statement on Viva's personal wallet discontinuation; per-bank verification of EPC QR scanning outside Greece (secondary sources only).
