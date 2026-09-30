# The colour scheme

Every colour the window uses. It is the house scheme, the same as Starting
Blocks, Midi Suggester, Midi Variator and ScaleView: a dark cool-grey ground, a
light grey for the controls raised off it, and one yellow for whatever is
switched on - and, in the preview roll, the notes.

This file was copied from Starting Blocks and is **not generated** - unlike
`CATALOGUE.md` next to it, it is a reference kept by hand. If you change a
colour in `reascripts/Midi Catalogue.lua`, change it here too.

## The four that carry it

Everything else is support. These four are the scheme.

| | value | what it is |
| --- | --- | --- |
| Accent | `#FFF200` | whatever is switched on |
| Controls | `#A9AFBA` | buttons and slider grabs, raised off the ground |
| Ground | `#23272E` | the window behind everything |
| Ink | `#14171C` | the text on any button |

The accent goes on one thing only: the state that is on. A chosen button, a
ticked box, the slider grab being dragged, and the notes in the preview roll.
Nothing decorative takes it, which is what makes it read at a glance.

## The grey ramp

Eighteen greys, darkest to lightest.

| | R | G | B | used for |
| --- | ---: | ---: | ---: | --- |
| `#111419` | 17 | 20 | 25 | piano-roll ground |
| `#14171C` | 20 | 23 | 28 | borders, and the text on every button |
| `#1A1D23` | 26 | 29 | 35 | sunken frames, scrollbar track |
| `#1B1F25` | 27 | 31 | 37 | popups, title bar |
| `#1E2228` | 30 | 34 | 40 | roll beat lines |
| `#22262D` | 34 | 38 | 45 | frame hover |
| `#23272E` | 35 | 39 | 46 | the window chrome, active title |
| `#2A2F37` | 42 | 47 | 55 | frame active |
| `#3A404A` | 58 | 64 | 74 | separators, roll bar lines |
| `#585F6B` | 88 | 95 | 107 | scrollbar grab |
| `#6D7581` | 109 | 117 | 129 | scrollbar hover |
| `#8A919C` | 138 | 145 | 156 | disabled and dim text |
| `#8F96A2` | 143 | 150 | 162 | button held |
| `#A9AFBA` | 169 | 175 | 186 | buttons, slider grabs |
| `#BFC5CE` | 191 | 197 | 206 | the step numbers |
| `#C0C6CF` | 192 | 198 | 207 | button hover |
| `#DDE1E7` | 221 | 225 | 231 | body text |
| `#F2F4F7` | 242 | 244 | 247 | the audition playhead |

## One colour off the ramp

`#D2483F` - red, for warnings in the status line. Deliberately not a shade of
the accent, so a warning can never read as a selection. It and the yellow are
the only saturated colours in the scheme.

## Hover and held

The two halves of the palette get their states differently, which matters if
you copy either.

| | rest | hover | held | how |
| --- | --- | --- | --- | --- |
| Controls | `#A9AFBA` | `#C0C6CF` | `#8F96A2` | set by hand in `THEME` |
| Accent | `#FFF200` | `#FFF42E` | `#D1C600` | computed by `shade()`, ±18% toward white and black |

So the source holds twenty values, while the running window shows twenty-two -
the accent's two states are derived rather than stored.

## Two rules worth carrying

**Keep the greys blue.** R < G < B holds in all eighteen. It is the least
obvious property here and the easiest to lose, because a neutral grey at the
same lightness looks perfectly correct in a diff and only reads as flat once it
is on screen beside the yellow. Compare `#A9AFBA` with a neutral `#B0B0B0`. The
greys in this window were neutral for a long time, which is why it is an easy
mistake to make twice. Taking the scheme elsewhere means taking the bias, not
the hexes - any cool ramp will do, a neutral one will not.

**Light controls force dark text.** Both button fills sit far lighter than the
ground, so the body text colour `#DDE1E7` vanishes on them. Every button takes
the ink, including the unchosen ones. This fails quietly: style the chosen state
alone and it looks right while every other control goes unreadable. Most dark
themes raise their buttons a shade off the chrome and letter them in the body
text colour; this one inverts that, so the habit is wrong here.

## Starting a new project from this

1. **Pick the ground first.** Dark, and cool rather than neutral. Stop short of
   black - flat black under a saturated accent reads as a hole, not a surface.
2. **Build the ramp off it**, keeping R < G < B the whole way. Everything
   structural comes out of the ramp: borders, frames, separators, scrollbars.
3. **Choose one accent and spend it only on what is on.** If a second thing
   wants the accent, it probably wants the ramp instead.
4. **Decide the ink before the controls.** If the controls end up lighter than
   the ground, every control needs dark text, and that reaches every button.
5. **Keep semantic colours out of the accent's hue**, so state and selection
   never look alike.

## The values

```css
:root {
  --accent:        #FFF200;
  --accent-hover:  #FFF42E;
  --accent-held:   #D1C600;
  --control:       #A9AFBA;
  --control-hover: #C0C6CF;
  --control-held:  #8F96A2;
  --ground:        #23272E;
  --sunken:        #1A1D23;
  --rule:          #3A404A;
  --ink:           #14171C;
  --text:          #DDE1E7;
  --text-dim:      #8A919C;
  --roll:          #111419;
  --warn:          #D2483F;
}
```

Every ReaImGui `Col_` the window sets, for a project that wants the same window
rather than only the same scheme:

| `Col_` | |
| --- | --- |
| `Col_Border` | `#14171C` |
| `Col_Button` | `#A9AFBA` |
| `Col_ButtonActive` | `#8F96A2` |
| `Col_ButtonHovered` | `#C0C6CF` |
| `Col_CheckMark` | `#FFF200` |
| `Col_FrameBg` | `#1A1D23` |
| `Col_FrameBgActive` | `#2A2F37` |
| `Col_FrameBgHovered` | `#22262D` |
| `Col_PopupBg` | `#1B1F25` |
| `Col_ScrollbarBg` | `#1A1D23` |
| `Col_ScrollbarGrab` | `#585F6B` |
| `Col_ScrollbarGrabActive` | `#A9AFBA` |
| `Col_ScrollbarGrabHovered` | `#6D7581` |
| `Col_Separator` | `#3A404A` |
| `Col_SliderGrab` | `#A9AFBA` |
| `Col_SliderGrabActive` | `#FFF200` |
| `Col_Text` | `#DDE1E7` |
| `Col_TextDisabled` | `#8A919C` |
| `Col_TitleBg` | `#1B1F25` |
| `Col_TitleBgActive` | `#23272E` |
| `Col_TitleBgCollapsed` | `#1B1F25` |
| `Col_WindowBg` | `#23272E` |
