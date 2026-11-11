---
title: "Avatar creator (2D)"
section: "reference"
slug: "character-studio-ui"
summary: "Build a layered 2D avatar: species, class, colours and expressions."
---

The avatar creator builds a layered 2D avatar in the browser: pick a species and a
class, recolour each part, add an expression, draw extra details by hand, and export the
result. Everything is drawn in the browser, so a preview needs no server.

The chat and fediverse web apps and the forum show the avatars it makes. They are saved
through the [User API](/reference/user-bff) under the member's own account.

## Where it appears

The host shell mounts it at `/character-studio`.

## Who can open it

Any signed-in member. It has no role gates; it is the same tool for everyone.

## More detail

The [`hugmesh-character-studio-ui` README](https://github.com/hugmesh/hugmesh-character-studio-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
