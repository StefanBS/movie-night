# Movie Night

A small, recurring group of friends takes turns picking the film for movie night; the app tracks who attended, who picked, and whose turn is next.

## People

**Group**:
A movie-night crew whose members share one rotation.
_Avoid_: club (except as the UI label "The Club"), crew

**Core member**:
A person in the group's rotation, who is owed turns.
_Avoid_: regular, full member

**Guest**:
A person who attends and may pick, but is not in the rotation and is never owed a turn.
_Avoid_: visitor, plus-one

## Nights

**Night**:
One dated movie-night occasion of a group. Every Night has a picker; a plan without a picker is not yet a Night.
_Avoid_: event, session, open night, pick (for the occasion itself)

**Plan**:
A Night being arranged (date and attendees) that doesn't exist yet; it becomes a Night once it's saved with a picker.
_Avoid_: draft, open night

**Attendee**:
A person present at a Night. The picker is always an attendee.
_Avoid_: participant

**Picker**:
The attendee who chooses the film for a Night.
_Avoid_: chooser, host

**Film**:
The movie watched at a Night. Optional; adding it later does not change the Night's state.
_Avoid_: pick (for the movie)

**Upcoming Night**:
A Night dated after today.
_Avoid_: scheduled night (as a state), future night

**Tonight's Night**:
A Night dated today.

**Past Night**:
A Night dated before today. A past Night with no film still counts.
_Avoid_: recorded night, done night

## Rotation

**Credited pick**:
A Night whose picker's choice counts toward their standing; normally a core member's pick. Guest picks are not credited.
_Avoid_: turn taken, credit

**Served count**:
How many credited picks a core member has, plus their join-time baseline. Picks on upcoming Nights count as soon as the Night exists.
_Avoid_: score, turns used

**Turn ranking**:
The order of core members by served count (fewest first), then least-recent pick. Ranking for a Night considers that Night's attendees and ignores that Night's own pick.
_Avoid_: queue, rotation order (for the computed result)
