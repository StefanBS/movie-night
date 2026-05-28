# ADR-0001 — Build a dedicated turn-based movie-night app

**Status:** Accepted (2026-05-28)

## Context
We are a stable group of about five friends who hold a weekly movie night. Turns
rotate through the group; the person whose turn it is picks the film with no
discussion and no veto. Guests join regularly and sometimes pick. Existing apps in
this space are built around *group consensus* (swipe-to-match to find a film
everyone agrees on), which is the opposite of our model — our "debate" is already
resolved socially by the rotation rule. None of the surveyed apps model turn
rotation, turn deferral, or guests that retain history.

This is also a personal full-stack learning project. The author is already a
software engineer (comfortable in Go and Python); the growth areas are
frontend/UI (weakest), backend data modeling, and mobile development (new).

## Decision
Build a dedicated application rather than adopting or extending an existing
consensus-style product. Optimize for (a) faithfully modeling our ritual and
(b) learning value — not commercial differentiation.

## Consequences
- The rotation/deferral/guest domain is un-templated, which makes it a genuine
  design exercise (especially for data modeling) rather than a clone.
- Real users (the group, plus guests) provide motivation and feedback, and give a
  clear definition of "done and good."
- We will rebuild commodity features (watchlists, movie metadata) that existing
  apps already provide. Accepted, because the goals are learning and fit, not
  market share.

---
[← Index](README.md)
