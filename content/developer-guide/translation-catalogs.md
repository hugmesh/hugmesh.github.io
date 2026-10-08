---
title: "Translation catalogs"
section: "developer-guide"
slug: "translation-catalogs"
summary: "How the generated source translation template and per-locale XLF catalogs work, and why the template is never hand-edited."
source_repo: "hugmesh-login-ui"
source_path: "src/locale/README.md"
source_ref: "hugmesh/hugmesh-login-ui@HEAD"
---

`messages.xlf` is the **source template**. `npm run i18n:extract` produces it. It is generated, so
never hand-edit it. Everything else here is `messages.<locale>.xlf`, one per translatable locale.

English is the **source language**. Its text lives in the templates and the `$localize` calls, so
there is no `messages.en.xlf` and there never will be. That is why the default image build
(`web_locales=()`) ships **zero** files from this directory and makes **zero** catalog requests. It
is the smallest artifact and has no network surface at all, which is what a LAN-only or air-gapped
mesh needs.

## What ships

The Studio's `web_locales` field (`--web-locales de,fr`) decides which catalogs end up in the image.
It is forwarded to the Dockerfile as the `HUG_WEB_LOCALES` build argument. (`SNAP_WEB_LOCALES`, the
old name, is still read when `HUG_WEB_LOCALES` is empty.) A catalog in this directory is
*available*, not *shipped*. Today the only catalog here besides the template is `en-XA`.

| `web_locales` | in the image |
|---|---|
| `()` (default) | *(no `i18n/` directory at all)* |
| `("de",)` | `/usr/share/nginx/html/i18n/de.json` |

## Adding a real locale

1. `npm run i18n:extract` — refresh `messages.xlf` from the source.
2. Copy it to `messages.<locale>.xlf` and add a `<target>` to **every** `<unit>`.
3. `npm run i18n:check` — this fails until the catalog is complete.
4. Add the locale to `web_locales` in the Studio.

**A catalog committed here must be complete.** `npm run i18n:check` enforces it, on purpose. At
runtime a missing message falls back to its English source, per message, with only a
`console.warn`. The result is mixed-language output, a half-translated login page, and it would
ship silently. The gate makes that impossible instead of unlikely. If a translation is in progress,
keep the locale out of `web_locales`. Do not commit a partial catalog.

## `messages.en-XA.xlf` is not a translation

`en-XA` is a **pseudo-locale**. `npm run i18n:pseudo` generates it, and it is regenerated after
every extract. Every target is the English source with its letters accented and padded ~30%
(`⟦Sîgn în tö…⟧`). It is mechanical, not linguistic. This repo does not invent translations nobody
can vouch for.

It earns its place three ways:

- It is complete by construction, so it proves the whole pipeline (xlf → json →
  `loadTranslations` → `$localize`) and the `web_locales` knob end to end.
- **Any text that renders unaccented under `?lang=en-XA` is a string somebody forgot to mark up.**
  Half-localization becomes visible instead of subtle.
- The padding shows layout that breaks on longer languages before a translator is ever paid.

## Editing copy

To change English text, edit the template or the `$localize` call. Then re-run `i18n:extract`
**and** `i18n:pseudo`. `i18n:check` (gate 4) fails if you forget. A stale `messages.xlf` makes every
catalog "complete" against the wrong set, and your new string renders English in every locale.

The ids are explicit (`@@login.heading`), not content-hashed. Rewording English therefore does
**not** orphan a translation: the id survives, and the reworded source shows up as a diff for
translators to review.

The design, and the reason translation loads at runtime and not at build time, are documented in
[`../app/i18n/locale.ts`](../app/i18n/locale.ts).
