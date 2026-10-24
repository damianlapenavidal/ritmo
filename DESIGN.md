# Ritmo design system

Athletic, calm, data-first. Scoreboard-style condensed numerals over a warm paper background; one pitch-green accent.

## Color tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f5f1` | `#111312` | page |
| `--surface` | `#fcfcfb` | `#1a1a19` | cards, inputs, chart surface |
| `--surface-2` | `#efeee8` | `#242522` | tracks, segmented control, flags |
| `--ink` | `#0f1412` | `#f0efec` | primary text |
| `--ink-2` | `#4a514d` | `#c3c2b7` | secondary text |
| `--ink-3` | `#5f655f` | `#93928a` | labels, axes, target lines |
| `--line` | `#dedcd3` | `#34352f` | borders, grid |
| `--accent` | `#0e7a52` | `#3cc98e` | primary buttons, active tab, meters |
| `--accent-soft` | `#dcefe5` | `#173a2c` | pills, banners |
| `--series-1` | `#2a78d6` | `#3987e5` | bodyweight, sessions, protein |
| `--series-2` | `#eb6834` | `#d95926` | strength e1RM, calories |
| `--series-3` | `#1baf7a` | `#199e70` | conditioning |
| `--good` / `--warning` / `--critical` | `#0ca30c` / `#fab219` / `#d03b3b` | same | status, always with icon + text |

## Type
- Display: **Barlow Condensed** 600/700, uppercase for headings; big numbers 38px.
- Body: **IBM Plex Sans** 400/500/600, 15px/1.5, tabular numerals.
- Labels: 12px, 600, uppercase, 0.06-0.08em tracking, `--ink-3`.

## Shape and space
Radius 14px (cards), 8px (inputs), pill for buttons and chips. Base spacing 16px; grid gaps 12px. Touch targets at least 44px.

## Components
Stat tile (label, big number, unit, sub, meter) · session list · flag (icon + text) · segmented control · set-row input grid · quick-add chips · line chart (dots + 7-day line, dashed target) · bar chart (rounded tops, dashed target) · horizontal bar with reference tick · bottom tab bar on mobile, top tabs on desktop.

## Charts
One axis per chart, thin marks, legend or direct label, hover/tap tooltip, colors from the series tokens in fixed order, dashed `--ink-3` line for targets.
