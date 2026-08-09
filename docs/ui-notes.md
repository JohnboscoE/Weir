# UI reference — extracted from `images/image.png`

Design tokens and structure taken from the landing-page mock, so the frontend build
(days 6–8) does not have to re-derive them.

## Visual language

Dark, near-black canvas with a single green accent. Everything else is neutral grey.

| Token | Value (approx, sampled) | Use |
|---|---|---|
| `bg` | `#080B0A` | page canvas |
| `surface` | `#0E1412` | cards, nav pills |
| `surface-raised` | `#131A17` | dashboard panels, table rows |
| `border` | `#1E2A24` | 1px hairlines on every card |
| `accent` | `#3DDC84` | primary green — CTAs, logo, active state |
| `accent-soft` | `#A8F0C6` | button label on filled green |
| `text` | `#E8EFEA` | headings |
| `text-muted` | `#8A9691` | body, labels, table headers |

- Type: geometric sans, tight tracking, very large hero (~72px) with the second line
  in accent green. Headings semibold, body regular, numerics tabular.
- Radius ~12px on cards, ~10px on buttons, pill (999px) on badges and nav chips.
- Accent green glows: soft outer shadow on the primary CTA and on the hero artwork.
  Use sparingly — one glow per viewport.
- Charts: green solid line for revenue in, dashed lighter line for repaid, subtle
  area fill under the solid line.

## Landing page structure

1. **Nav** — logo, links (Product, How it works, For Merchants, For Funders, Docs,
   About), a live network chip ("● On BOT Chain"), and a filled green "Launch App".
2. **Hero** — "Revenue today. / Growth tomorrow." with the second line in green,
   a two-sentence explainer, and dual CTAs: "I'm a Merchant" (filled) / "I'm a Funder"
   (outline). Under them a one-line trust statement: *No oracles. Fully on-chain.*
3. **Hero artwork** — a wallet with USDT flowing in and splitting into two labelled
   cards: Merchant share and Funder Pool share. This is the whole product in one image
   and should be the first thing built.
4. **Trust bar** — four items: No Oracles / Transparent / USDT Only / Programmable.
5. **For Merchants** — headline, four checkmark benefits, "Launch Merchant Dashboard"
   CTA, and a large dashboard preview screenshot beside it.

## App shell

Left sidebar: Overview, Offers, Splitter, Payments, Investors, History, Settings.
Merchant identity card pinned at the bottom of the sidebar.

Overview surface:
- Four stat tiles: Total Raised, Total Repaid, Repayment Progress (with bar),
  Available to Merchant.
- "Revenue & Repayments" time-series with a range selector.
- "Active Offer" panel: offer id, goal, repaid, revenue share, cap, ends, and a
  "View Offer Details" link.
- "Recent Payments" table: from / amount / USDT in / distributed-to bar / time.
- "Your Splitter Address" with a copy button and the line *Share this address with
  your customers to accept payments.*

## Where the mock and the spec disagree

Resolve these before building, not during.

1. **"Verified" badge on the merchant card.** CLAUDE.md §2 rules out KYC — the wallet
   is the identity. Keep the badge but re-label it to what it actually means:
   *Eligible* (cleared the volume gate) or *N settled payments*. A badge reading
   "Verified" implies identity checks we do not perform.
2. **"Revenue & Repayments" 30-day chart.** There is no indexer on chain 677, so a
   time series needs event history. It is feasible only because it is scoped to a
   *single* splitter address — `Settled` events from one contract, over a bounded
   block range, cached client-side. Treat it as a stretch item; the stat tiles and
   the payments table read straight from contract state and cannot fail.
3. **Risk disclosure is absent from the mock.** CLAUDE.md §5 makes it a design
   requirement, not a footnote. It must appear on the funder browse cards and on the
   offer detail page: repayment depends on continued revenue flow, and nothing forces
   the merchant to keep routing revenue through the splitter.
4. **70/30 split in the hero.** Illustrative only. The contracts take `shareBps` per
   offer; do not hardcode.
5. **"Recent Payments" shows a per-payment split.** Settlement is *batched* — the
   splitter sweeps an accumulated balance when `settle()` is called. The table should
   be labelled "Recent Settlements" and show settlement events, not individual
   customer payments, or it misrepresents how the contract works.
