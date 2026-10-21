# Session log - 16 October 2026: the final HIG sweep (1.3)

Asked: a final sweep of the 19 Apple Foundations pages, so that everything
that can be implemented has been. Every implementable item of the shared
checklist was decided for this window; the table is in
[`docs/apple-hig-review.md`](../apple-hig-review.md) and the choices in
[decision 0012](../decisions/0012-apples-hig-foundations.md).

## What changed

See the review. The new code: `beside()`, `check()`, `lines()`, `title()`,
`say(..., undo)`, the menu bar's Stop, `ui.escTaken`.

## What was found by measuring

- ImGui's default menu highlight (a blue) left menu words at about 3:1, and
  its menu keys sat in `#8A919C`, 4.2:1 on the lighter menu.
- Loop's tick box was `#1A1D23` on `#23272E`, 1.1:1: only the tick showed.
- At 200% the action row was about 1,040 points wide in a 1,040-point
  window, and several tooltips ran to 200–400 characters on one line.

## Checks

`tools/test.sh` passes. `test_ui` gained: the theme's contrasts and R < G < B,
the tick box's edge, Esc in four states, the menu bar's Stop, both Undos,
tooltip line length, the left-out reasons on screen, the title, the smallest
size, and "nothing runs off the window's edge" in nine states at 100% and
200% and at the smallest width - the mock now lays each item out, and what
is left of a line shrinks after SameLine as it does in ImGui.

Twenty-two sabotages in scratch copies, each rule broken alone: twenty-one
failed the suite. Two first missed and led to better tests: an unwrapped
message (the overflow states had no long message - a saved file's path is
one now) and the smallest width (it was tested at 420, wider than the
window's real 384 inside its padding). The one still missed is Export put
beside Insert without a check: the two fit side by side even in the
smallest window, so that `beside()` is a safeguard, not a fix. A first
batch crashed in every copy: the test finds the script through `$PWD`, which
a copy run from elsewhere must set.

## Not done

- Not run in REAPER (see the review's last paragraph).
