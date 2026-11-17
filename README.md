# IOM Calcs

<https://kellett.github.io/IOM_Calcs/>

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

### Veins

Veins are zone based, not ore based. Each of the 21 zones has a floor range, a
rarity and a range of ore indices, and the rate is:

```
veins/screen = morph% x oresPerScreen + (1 - morph%) x MIN(oresPerScreen, spawnRate x research / rarity)
variant      = golden / rainbow / gleaming chain
veins/hr     = veins/screen x 2880 x gameSpeed x floorSpeed x income x variant
```

`floorSpeed` is the sheet's step ladder (0.75 on floors 71-72, 89-92 and 97-98, 0.7 on 119-120, 0.6 on 121-124) with the World 3 and World 4 modifiers on top. 2x research comes from `vein_2x_spawn_array` in the export and covers that many zones in order, which is what the sheet's per-world ticks amount to.

Ported from the Best Veins tab of v3.3.6 and checked against that sheet's own output for Neon Vein: veins per screen `3.050513544` and every in-zone floor matching to 2.6e-11.

Void portals only count while the Void Drone is equipped, which is read from
`is_drone_void_equipped` in the export and can be toggled on Loadout. With it on, a
portaled ore can turn into a vein of its own zone, using that ore's rarity, and vein
income is multiplied by the portal the same way ore is. That makes the portal share
of the rate:

```
portalShare x floorMultiplier x (shareA x oreWeight(oreA) + shareB x oreWeight(oreB)) x averagePortalMulti
```

`oreWeight(i)` is the chance that a random ore between 1 and `i` falls inside the
vein's ore range, which is the same shape the sheet uses. The same flag drives the
Include void portals checkboxes on Best floor and Farm time, so all three views
agree on whether portals exist.

### Bombs

Bomb of Plenty multiplies the ore you dig, which then gets crafted. The Transmuter
drops bars directly and can also stamp a BoP stack. The winner comes down to ore per
bar, so the answer is a break-even cost rather than a single floor:

```
cost  = (plentyBars - transmuteCraftBars) / transmuteDirectBars
```

Ores above that cost favour the Transmuter. The Bomb tab turns that into a floor
range using the first floor each ore appears on. This follows
[tabatkins' Transmuter calculator](https://tabatkins.com/obelisk/transmuter/),
which models the Transmuter reapplying BoP. Doing it the sheet's way, where the
two are simply added, always picks Of Plenty.

`ore EM/hr` chains the multiplier stats with `EMBIN(chance, multi, nested)`,
where `nested` lets a rarer floor type sit inside a more common one. Void portal
ore is modelled separately from the base floor share, which is why a floor can
show more than 100% of its own ore.

### Fishing

A dock fills its tick meter, then rolls catch chance against each fish. The tick
interval is the wiki's 60 second base less the flat `fishing_tick_reduction_seconds`
stat; the 3x elixir and every upgrade are already inside that figure.

```
clock ticks/hr = 3600 / (60 - reduction)
lootbug ticks  = sheet v3.2.2 formula from game speed, spawn rate, triple chance
                 and loot multiplier, scaled by active hours per day
ticks/hr       = (clock + lootbug) x expected tick multiplier
```

The expected tick multiplier is the same eight-way double/triple/5x chain the
fishing sheet uses. Fish per catch is dock power times income and the shiny chain;
fish per hour divides by the selected dock's tick requirement, which assumes every
point of power is on that dock. The fish card and legendary tables are not ported.

The upgrade advisor ranks every upgrade, enhancement and skill that is not maxed
by growth per million of its cost. Growth is measured by putting the state through
the same fishing model once with that one purchase added, so the tick chain and dock
meter come along. Fish costs use the selected dock's fish per hour; gem costs use
the net gems per hour from the Gems tab, which can be overridden with a typed rate.
Poly card multi is excluded because the sheet flags its own growth calculation as
faulty. Fish cards and tributes are a separate planner.

The floor table is generated rather than stored: 132 floors × 2 ores × void on/off,
528 rows, recomputed whenever a stat changes.

### Gems

The gems tab is a per-hour receipt of every source, and what the drones you keep
fuelled cost. It is a port of the Game Utilities calculator's Gems per hour panel,
which its author wrote from the wiki's Store, Bombs, Lootbugs, Lootfrogs and
Founder pages.

```
freebies  = claims/hr × (pack gems + 4 × jackpot × pack gems + Stonks)
claims/hr = 60 / cooldown minutes × game speed / (1 - instant refresh)
gem bombs = (recharges + D20/battery charges) × fires per charge × gem chance
            + cherry charges × gem chance
lootbugs  = bugs/hr × the gems buff's share of the free buffs × 2 × loot multiplier
elixir    = the 10x Bomb Recharge buff's extra charges, run through the same loop
founder   = crate gems + the gem jackpot + cherry charges from supply drops
magnets   = item chests/hr × items per chest × 2.6% × gems per magnet
spend     = 5 gems per fuel for every fuelled drone, plus the lootbug buffs you buy
```

Gem chance is `(0.03 + 0.001 × pet quest 7) × 1.25` when a legendary tribute is at
level 3. The D20 and battery feed each other, so the two fire rates are solved as a
pair of linear equations rather than stepped. Cherry charges can be sent to the gem
bomb, the battery or the D20, which changes the answer, so that is a control.

The receipt was checked against gameutils.app with this export: every line matched,
at default playstyle (gross 4516.11, spending -132.99, net 4383.12, offline 171.16),
and again with Founder, Charge Magnets, all the lootbug buffs and a fourth world
switched on (gross 5991.57, spending -878.16, net 5113.41).

## Where the numbers come from

The formulas are ported from the community spreadsheet (`Main`, `Floors` and
`Ore Stats` tabs, sheet v1.1.1) and checked against its own output. Running the
engine over the sheet's own per-floor stats reproduces all 528 rows for ore,
craft, transmute, bar and gold per hour to within 0.001%.

`assets/data.js` was extracted once from that workbook: ores, floors, floor
debuffs, the mod source list and the notation table. Do not edit it by hand. It only
needs regenerating if a game update adds floors or ores.

## Known limits

- Drone and item adjustments use the spreadsheet's `Mod` model. Base values that
  come from a drone fuel grade are approximate, because the grade to multiplier
  mapping is not in the workbook. Your export already includes whatever you have
  equipped, so the baseline is exact; only "what if I swapped this" is affected.
- Gold per bar is derived from the sheet at a single card level, then scaled by the
  bar card. It matches the sheet but is not independently confirmed against the game.
- Floors per hour is fixed at 2880, the value the sheet uses.
- The gems receipt follows gameutils.app, including its two fitted lootbug buff
  uptimes. The Frogger and lootfrog lines were not exercised because the drone is
  not on this save.

## Running locally

No build step and no dependencies.

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
