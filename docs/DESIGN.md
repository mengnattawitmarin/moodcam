# MoonCam Design System

Source of truth is the `:root` block in `css/app.css`. Claude decides; GPT proposes changes via PR.

## Brand
- Name: MoonCam (repo: moodcam)
- Tone: luxury, black and gold, premium camera; calm, not flashy
- No watermark on photos

## Colours (CSS variables)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#050506` | app background |
| `--bg2` | `#0c0c0e` | secondary background |
| `--panel` | `rgba(16,16,19,.72)` | floating panels over preview |
| `--panel-solid` | `#111114` | sheets, solid panels |
| `--glass` | `rgba(20,20,24,.52)` | glass buttons |
| `--line` / `--line2` | white 8% / 14% | dividers, borders |
| `--ink` | `#f4efe6` | primary text |
| `--muted` | `#a29d93` | secondary text |
| `--dim` | `#66625b` | disabled |
| `--gold` | `#d8b87a` | accent, active state |
| `--gold2` | `#f1dcae` | highlight |
| `--gold-deep` | `#a8864b` | pressed, gradients |
| `--red` | `#ff5a5f` | recording, errors |
| `--green` | `#7bd88f` | success |

## Typography
- Brand / headings: `--f-brand` (Cormorant Garamond)
- UI and Thai: `--f-ui` (Noto Sans Thai, IBM Plex Sans Thai)
- Numbers (ISO, shutter, EV, counters): `--f-num` (JetBrains Mono), tabular

## Shape & motion
- Radius: `--r` = 16px
- Easing: `--ease` = `cubic-bezier(.2,.8,.2,1)`

## Mode skins
- Default: luxury black/gold
- DIGICAM: CCD 2005 + Y2K
- INSTANT: Polaroid body, Quicksand logo, handwritten captions (Itim)
