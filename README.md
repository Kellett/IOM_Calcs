# IOM Calcs

A browser calculator for Idle Obelisk Miner. Paste your `EXPORTSTATS` and it works
out ore, bar and gold rates for every floor, then answers the three questions that
actually matter: where to farm, how long something takes, and which bomb is better.

Version 0.1.0.

The maths, the floor data and the structure come from the **IOM Calcs** spreadsheet
by **Taikuh** (sheet v1.1.1, built against game v2.2.5). That sheet in turn credits
the IOM Wiki, the Total Resources Calculator, Best Farming Floor and Let's Go
Fishing. Not affiliated with the game or its developers.

Everything runs in the page. The export is kept in `localStorage` and never leaves
the browser.

## Using it

1. Copy `EXPORTSTATS` from the game.
2. Paste it into the Import tab and press Import.
3. Check the Stats tab. Anything the game does not export is marked `manual` and
   can be typed in directly.
4. Set the bomb you throw, your card multipliers and any loadout swaps on the
   Loadout tab.
5. Use Best floor, Farm time and Bomb.

Ore and bar card multipliers are set once on the Loadout tab. Ores without a card of
their own ignore them.

Number fields take plain numbers, exponents and the game's own suffixes: `75000000`,
`7.5e7`, `75m` and `75.0no` all mean the same thing.

## What it calculates

```
ore/hr    = floor share × ore EM/hr × ore card
craft/hr  = ore/hr ÷ craft cost × craft EM × bar card
trans/hr  = ore/hr × transmuter EM × bar card
bar/hr    = craft/hr + trans/hr
gold/hr   = bar/hr × bar value × bar card
```

`ore EM/hr` chains the multiplier stats with `EMBIN(chance, multi, nested)`,
where `nested` lets a rarer floor type sit inside a more common one. Void portal
ore is modelled separately from the base floor share, which is why a floor can
show more than 100% of its own ore.

The floor table is generated rather than stored: 132 floors × 2 ores × void on/off,
528 rows, recomputed whenever a stat changes.

## Where the numbers come from

The formulas are ported from the community spreadsheet (`Main`, `Floors` and
`Ore Stats` tabs, sheet v1.1.1) and checked against its own output. Running the
engine over the sheet's own per-floor stats reproduces all 528 rows for ore,
craft, transmute, bar and gold per hour to within 0.001%.

`assets/data.js` is generated from that workbook by `tools/build-data.py`, which
needs an `export?format=xlsx` copy of the sheet unpacked next to it. Do not edit
`data.js` by hand.

## Known limits

- Drone and item adjustments use the spreadsheet's `Mod` model. Base values that
  come from a drone fuel grade are approximate, because the grade to multiplier
  mapping is not in the workbook. Your export already includes whatever you have
  equipped, so the baseline is exact; only "what if I swapped this" is affected.
- Gold per bar is derived from the sheet at a single card level, then scaled by the
  bar card. It matches the sheet but is not independently confirmed against the game.
- Floors per hour is fixed at 2880, the value the sheet uses.

## Running locally

No build step and no dependencies.

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
