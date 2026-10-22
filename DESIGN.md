---
name: KaamTrack
description: A plain, high-contrast tracking board for Surat textile owners, godown staff and job workers, used on budget Android phones.
colors:
  cream-ground: "#f6f5f2"
  white-panel: "#ffffff"
  ink: "#1c1b19"
  stone-muted: "#6b6862"
  hairline: "#dedbd4"
  godown-green: "#1f5f4a"
  alarm-red: "#c62828"
  alarm-red-wash: "#fdecea"
  amber-ink: "#8a5a00"
  amber-wash: "#fff4d6"
  status-received-ink: "#1a4f8b"
  status-received-wash: "#e3effd"
  status-ready-ink: "#1f6b43"
  status-ready-wash: "#e2f4ea"
  status-sent-wash: "#ecebe7"
typography:
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
rounded:
  field: "8px"
  button: "10px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.godown-green}"
    textColor: "#ffffff"
    rounded: "{rounded.button}"
    height: "44px"
    padding: "0 16px"
  button-default:
    backgroundColor: "{colors.white-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    height: "44px"
  button-small:
    height: "44px"
    padding: "0 14px"
  chip:
    backgroundColor: "{colors.white-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.godown-green}"
    textColor: "#ffffff"
  lot-card:
    backgroundColor: "{colors.white-panel}"
    rounded: "{rounded.panel}"
    padding: "12px 14px"
  lot-card-overdue:
    backgroundColor: "{colors.alarm-red-wash}"
    textColor: "{colors.alarm-red}"
  field-missing:
    backgroundColor: "{colors.alarm-red-wash}"
    rounded: "{rounded.field}"
---

## Overview

A working tool, not a showpiece. Godown staff photograph a paper challan one-handed in bright light; job workers who may barely read tap one of four big buttons; the owner reads a single board each morning. Everything is plain, flat and high-contrast, and meaning never depends on colour or text alone. (Descriptive wording in this file is inferred from the code and `PRODUCT.md`; it has not been reviewed with the owner.)

## Colors

A warm off-white ground with white panels and hairline borders. One accent, **godown green** (`#1f5f4a`), marks the primary action and the active filter. **Alarm red** is reserved for what needs attention: overdue lots, required-and-empty fields, errors. **Amber** is for "check this" notices and the In process status. Each status has a tinted wash with a darker ink of the same hue: Received blue, In process amber, Ready green, Sent warm grey, Dispatched solid green with white text. Text colours sit at 4.5:1 or better on their washes.

## Typography

One family, Geist (system sans as fallback). Body is 16px, which also stops phones zooming into inputs. A single bold title (1.6rem), bold section headings (1.15rem), and small semibold labels (0.85rem). No decorative type; the interface should read like a form.

## Layout

A single column on phones with a 16px gutter and no sideways scroll. On laptops the board widens to 1100px and lots flow in two columns from 900px. The capture card places the photo beside the form once there is room. Every tappable thing is at least 44px tall. Pages are listed top to bottom in the order the work happens: snap, confirm, save, then the board.

## Elevation & Depth

Flat. Depth comes from white panels on the cream ground and 1px hairline borders; there are no shadows. The only emphasis is colour (overdue red, selected green) and a heavier 4px border marking a job worker's current status.

## Shapes

Soft but not playful: 12px panels and lot cards, 10px buttons, 8px fields, fully round chips and status pills. Status icons are drawn on a 24px grid with a 2px round stroke (see `app/StatusIcon.tsx`).

## Components

- **Buttons:** primary (green, white text) for the one main action; default (white, hairline) for the rest; small variant for lot actions (still 44px); danger variant is red text on a pale-red border (Delete).
- **Lot card:** worker and quantity on top, status pill, "days out · promised date", then actions. Overdue turns the whole card red-washed with a red border and the word OVERDUE (never colour alone).
- **Filter chips:** All, Overdue, Sent, Received, In process, Ready, Dispatched, Archive, each with a count; the active one is green; Overdue shows red when it has lots.
- **Lot card form:** labelled fields; a required field that is empty gets a red border, red wash and the word "required"; an AI-unsure field gets an amber "unclear" tag. Save stays disabled and says how many fields to fix.
- **Job worker page:** four full-width status buttons, each with its own icon, tint and word; the current one gets a heavy border and the word NOW.

## Do's and Don'ts

- **Do** pair every status with an icon and a word as well as a colour.
- **Do** keep tap targets at 44px or more and text at 16px.
- **Do** show unclear or missing information as such; never fill a guess in silently.
- **Do** keep screens flat: borders and tints, not shadows.
- **Don't** use emoji or text symbols as icons; draw them in the icon set.
- **Don't** rely on hover for anything; this is used by touch.
- **Don't** add decoration (gradients, glass, big numbers) to the board; it must scan in seconds.
- **Don't** add a second accent colour; red and amber are for attention only.
