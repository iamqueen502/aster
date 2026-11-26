# Aster

A birth-chart tutor: it computes real planetary positions from your birth
details, then teaches you to read them one rule at a time.

Positions come from [astronomy-engine](https://github.com/cosinekitty/astronomy),
and the birth clock is converted through the time zone's historical rules, so a
chart computed for 1990 in New York accounts for the DST rules in force then.
Every placement is shown with the rule behind it, the reading it produces, and
the arithmetic that connects the two — nothing is asserted without its working.

## What it does

- **A wheel** with planets, signs, houses, angles and aspects, drawn from the
  computed chart rather than a picture.
- **Pinned cards** for each placement: the rule, your data, the reading.
- **Three lessons** — signs as styles, houses as arenas, planets as drives.
  Each asks a question about *your* chart before it reveals anything, and the
  houses lesson stays shut when no birth time was given, because without one
  there is no honest way to place houses.
- **Saved charts.** Guests keep theirs in the browser; signed-in visitors get
  them stored per account in D1. Editing updates the open chart rather than
  creating a second copy, and there is exactly one write path in the client.

## Run and check

```sh
bun install
bun run dev        # http://localhost:3000
bun run typecheck
bun test
bun run build
```

The dev server binds to `0.0.0.0` and runs the Worker with a local D1 database.
With no auth configuration on a loopback origin a single, clearly labelled
local preview identity is used; that fallback never applies on a hosted origin.

## Layout

- `src/shared/astro.ts` — ephemeris, time zones, houses, angles, aspects.
- `src/shared/content.ts` — the interpretation text and its provenance.
- `src/client/ChartWheel.tsx` — the wheel and its legend.
- `src/client/Learn.tsx`, `src/client/lessons.ts` — the lesson player and its
  three lessons, keyed per chart because every question quotes the chart.
- `src/client/store.ts` — profiles and progress, one write path.
- `src/worker/` — Hono API, D1 access, sign-in, place lookup.

## Tests

`bun test` covers the chart math against independent astronomy checks (a known
Sun position, DST conversions, the Ascendant on the horizon, the Midheaven at
transit, house invariance), the API's authentication, ownership and validation
rules against a real local D1 database, and the client's single-write-path
behaviour for both guests and signed-in users.

## Limits

Readings are a way of reading an old tradition, not a measurement. The app does
no numerology, no "frequency" or chakra work, and nothing medical, legal or
financial; the footer says so. Charts without a birth time say plainly that the
Moon's sign may be uncertain and that the Ascendant and houses are unavailable.
