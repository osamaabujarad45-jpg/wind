# Decompile access — for the implementing agent (Opus 5.5)

> The full Uber rider decompile is **not** in this repo. It is proprietary Uber
> material (code + resources) and must not be committed, pushed, or copied into
> any tracked file. This doc tells you where it lives locally and how to look up
> raw specifics on demand — so the repo stays clean while you keep full read
> access for reference. Treat everything there as **evidence to cite by path**,
> never content to reproduce.

## Where it is

- **Root:** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full`
  (on this machine: `C:\Users\osama\AppData\Local\Temp\opencode\uber\rea-full`)
- **Java sources:** `…\rea-full\sources\com\ubercab\…` and `…\rea-full\sources\com\uber\…`
- **Android resources:** `…\rea-full\resources\res\{layout,values,drawable,anim,animator,interpolator,transition}\…`

**Scale:** 12,236 dirs · 239 `com.ubercab` + 721 `com.uber` packages · 2,822
layout XMLs · 6,340 drawables · full `res/values` design tokens · **1,030 unique
`/rt/` route literals**.

> **Note:** it lives under `Temp`, so it can be cleaned by the OS. If it's gone,
> re-decompile the APK with jadx (resources + sources) before relying on it.

## How to look things up (fast, token-efficient)

Work summary-first — grep/glob before reading whole files.

**Find a route literal's interface file** (PowerShell):
```powershell
$r="$env:LOCALAPPDATA\Temp\opencode\uber\rea-full\sources"
Get-ChildItem $r -Recurse -Filter *.java |
  Select-String -Pattern '"/rt/riders' -List |
  Select-Object -First 20 Path
```

**List all `/rt/` paths (unique):**
```powershell
Get-ChildItem $r -Recurse -Filter *.java |
  Select-String -Pattern '"/rt/[a-z0-9/_{}-]+"' |
  ForEach-Object { if($_.Line -match '"(/rt/[^"]+)"'){ $Matches[1] } } |
  Sort-Object -Unique
```

**Find a layout / drawable / dimen:**
```powershell
$res="$env:LOCALAPPDATA\Temp\opencode\uber\rea-full\resources\res"
Get-ChildItem "$res\layout" -Filter '*location_editor*'
Get-ChildItem "$res\values\dimens.xml" | Select-String 'bottom_sheet'
```

**Read a specific model** (e.g. the fare-estimate response):
`…\sources\com\uber\model\core\generated\rtapi\services\pricing\RidersFareEstimateResponse.java`

## What to cite vs. what to copy

- **Cite by path** (e.g. "`rtapi\services\pricing\RidersFareEstimateResponse.java`
  carries `fareCacheTTLSettings` tag 27") — that's evidence.
- **Port** only concepts, state names, field semantics, layout slots, and token
  *structure* — in Fastship's own words and code.
- **Never** paste decompiled Java, drawable/artwork bytes, tiles, parameter
  values, or proprietary identifiers (`mapdisplay_flipr_*`, `tc2.uber.com`) into
  this repo or shipped code.

## Already-distilled knowledge (read these first)

Most of what you need is already extracted and verified — start here before
grepping the decompile:

- `docs/KNOWLEDGE-2026-11-02-uber-rea-opus-implementation-handoff.md` — the handoff (start)
- `docs/REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` — canonical brief (bugs/a11y/map gaps)
- `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` — API/backend
- `docs/KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md` — UI layer
- `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` — 100-item map inventory
- `docs/REVIEW-2026-11-02-map-ux-vs-uber.md` — map/UX detail
