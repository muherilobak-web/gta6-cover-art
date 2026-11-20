# Leonida Postcard — GTA-style cover maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/muherilobak-web/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/muherilobak-web/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns any photo and a caption into GTA-style cover
art — the multi-panel poster look with bold caption lettering and a Vice City
sunset or neon grade — exported as a PNG to share. Built for the
[make.fun](https://make.fun) bounty
[gta6-cover-art-01](https://make.fun/bounty/gta6-cover-art-01).

New to make.fun? Sign up with my referral link and we both get a boost:
**https://make.fun/r/bt57jd3y** (code `bt57jd3y`).

## What it does

- **Hero + film strip (default):** one huge full-bleed hero photo with a
  sunset gradient-map grade, a film strip of three panels along the bottom,
  the title overlapping the hero in huge outlined Anton with a neon glow, a
  Pacifico neon subtitle, a LEONIDA badge ribbon and a five-star heat meter.
- **5 layouts:** Hero + film strip, Tilted snapshots, Nine-panel grid,
  Full-bleed single, Hero + three — one click switches.
- **6 grades:** Vice Sunset, Neon Night, Golden Hour, Duotone Vice, Noir,
  Original — gradient-map grades baked into the photo, never a filter slapped
  on top.
- **Any photo:** upload your own (or drag and drop), crop and position each
  panel — click a panel, drag to pan, scroll to zoom, rotate 90° — fill
  several panels with one photo or several, and edit the caption live.
- **Fast:** open the app and a cover is already on screen. One click exports
  a PNG, or **Export all sizes** downloads 1080×1080, 1080×1350 and
  1920×1080 at once (plus a 1080×1920 story size).
- **Polish:** sun disc and palm silhouettes drawn in canvas, film grain and
  vignette toggles, sunset-gradient title with an optional halftone fade,
  undo/redo, shuffle.

## Run it

No build step, no network. Serve `app/` with any static server:

```sh
node serve.ts
# open http://localhost:8080
```

Everything loads from files under `app/` — fonts (Anton and Pacifico, SIL
Open Font License, under `app/fonts/`) and the two sample photos (made with
an image model, free to use). Your photos are read on your own machine and
never uploaded.

## Files

- `app/index.html`, `app/style.css` — the editor page
- `app/src/cover.js` — the render engine (layouts, grades, lettering, decor)
- `app/src/main.js` — the editor wiring (tray, panels, export, undo/redo)
- `app/src/shots.js` — the fixed `?shot=` scenes the screenshots come from
- `app/fonts/` — Anton and Pacifico (OFL), `app/samples/` — two sample photos
- `main.ts` — the entry program: copies `app/` + `screenshots/` to `/output`
  and writes `dossier.json` with `vendor/makefun-app.ts`

## License

MIT — see [LICENSE](LICENSE). All art is original and drawn in code; no
Rockstar Games logo, artwork or font anywhere.
