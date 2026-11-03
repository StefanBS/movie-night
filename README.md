<p align="center">
  <img src="mobile/assets/brand/logomark.svg" width="88" alt="Movie Night logomark">
</p>

<h1 align="center">Movie Night</h1>

<p align="center">
  <strong>Whose turn is it to pick?</strong><br>
  A mobile app for a group of friends with a weekly movie night.<br>
  One pick a night. No voting, no vetoing.
</p>

<p align="center">
  <img src="docs/screenshots/tonight.png" width="250" alt="Tonight: Paddington 2 on Friday, picked by Ada, with Cleo, Blake and Dev up next">
  &nbsp;
  <img src="docs/screenshots/plan-who.png" width="250" alt="Planning a night: marking who's coming next Friday, and Esme gets the pick">
  &nbsp;
  <img src="docs/screenshots/watched.png" width="250" alt="Watched: nights grouped by month, with posters, pickers and dates">
</p>

Most movie apps help a group *agree* on a film. Movie Night does the opposite:
the group takes turns, and whoever's turn it is picks. The app keeps track of
whose turn it is.

## Features

- **A fair rotation.** The next pick goes to whoever has picked least. Missing
  a night delays your turn instead of losing it.
- **Plan a night.** Pick a date, mark who's coming, and the turn goes to the
  next person in line who's there. Then find the film, with posters from
  [TMDB](https://www.themoviedb.org).
- **Upcoming and Watched.** Every night on the calendar, and every night the
  group has had: the film, who picked it, and who came.
- **Members and guests.** Guests can join and pick sometimes without entering
  the rotation.
- **Reminders** before each night.

## How it's built

| | |
|---|---|
| **[`mobile/`](mobile/README.md)** | Expo / React Native app in TypeScript |
| **[`backend/`](backend/README.md)** | Go HTTP API over PostgreSQL |
| **[`docs/adr/`](docs/adr)** | Architecture decision records |

Each component's README covers setup, running, and testing.
