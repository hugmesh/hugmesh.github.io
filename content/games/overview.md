---
title: "About the Game Studio"
section: "games"
slug: "overview"
summary: "What the Game Studio is: a browser portal of 20 games, multiplayer sessions, and the RPG and visual-novel makers."
---

The Game Studio is the games service of a mesh: a portal in the browser where members
play together, and where authors make their own games without touching a game engine.
It lives in the [`hugmesh-games`](https://github.com/hugmesh/hugmesh-games) repository.

## What members get

- **A catalog of 20 games**, loaded on demand into an Angular page frame.
- **Multiplayer sessions.** Players create or join a session, and each session gets its
  own live event stream (server-sent events) from the games API, a Spring Boot service.
- **One sign-in.** Players sign in with the mesh's Casdoor account; Casdoor's own admin
  pages are never reachable from the network.

## Two kinds of game

| Kind | Games | How it runs |
|---|---|---|
| Godot 4, exported to WebAssembly | *Three Wizards In A Trenchcoat*, *Spinning Dodecahedron*, *Chess (Godot)*, *Connect Four (Godot)*, *Shadows of the Net*, *Character Forge* | Each game is a Godot 4 project exported to a self-contained WebAssembly bundle. The chess and Connect Four ports reuse the Rust rules engines of the web-native versions. |
| Web-native Rust | Chess, Connect Four, Reversi, Gomoku, Dots and Boxes, Go, Battleship, Tron, Bomberman, Asteroids Duel, Tetris, Minesweeper, Sudoku, Match Three | A pure-Rust game engine compiled to WebAssembly drives a plain JavaScript canvas. The host player's browser runs the game; the games API relays moves to the other players. |

[Architecture overview](/games/overview-games) explains how both kinds are served.

## Making games

The **RPG maker** and the **visual-novel maker** let a publisher author a game in the
portal. When the Godot build is turned on (`app.build.godot-enabled=true`), the makers
compile a project into a real Godot WebAssembly bundle. Decision
[018: Twin maker services for RPG and visual novel](/games/018-rpg-and-vn-makers)
describes them. To build a Godot game by hand, start from the
[Godot game template](/games/godot-game-template).

## Which guide is yours

| You are | Start with |
|---|---|
| An admin deploying games and managing roles | [Administration manual](/games/administration) |
| A moderator keeping sessions healthy | [Moderator guide](/games/moderator) |
| A publisher uploading your own games | [Publisher guide](/games/publisher) |
| A developer new to the code | [Intro for coders](/games/intro-for-coders), then the [Full-stack developer guide](/games/fullstack-developer) |
| Working on where game data lives | [Data architect overview](/games/data-architect) |
| On call | [Maintainer runbook](/games/maintainer-runbook) |

The how-to pages cover single tasks, and the numbered decision records explain why the
code is the way it is.

## Not finished yet

- *Connect Four (Godot)* is in the catalog, but its WebAssembly export has not been
  confirmed to boot.
- Server-authoritative real-time games (first-person and strategy) have engines but no
  game in the catalog yet; see
  [Server-authoritative real-time games](/games/realtime-server-authoritative).
- The strict Content Security Policy for the page frame is not done; see
  [decision 023](/games/023-content-security-policy).

The repository README has the build commands, the current status and the full roadmap.
