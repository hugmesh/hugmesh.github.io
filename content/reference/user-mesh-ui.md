---
title: "Meshtastic device dashboard"
section: "reference"
slug: "user-mesh-ui"
summary: "Each member's view of their Meshtastic radios. Its screens are not built yet."
---

HugMesh can bridge Meshtastic LoRa radio networks into Matrix chat, so a community can
keep talking over radio when the internet is down. This dashboard is meant to show each
member which radio nodes are reachable, which radios they have claimed, and which chat
rooms are bridged onto the radio mesh.

**It is not built yet.** Its back-end client, formatting and route guards exist, but the
three views are not written, so the web app does not build. The host shell does not load
it, and the frontend gateway has no route for it. The
[Meshtastic device API](/reference/mesh-bff) behind it is in place.

## Who will be able to open it

Members with the `mesh` role, and admins and superadmins.

## Who can see a claimed radio

A member who claims a radio chooses who may see it is theirs:

| Setting | Who sees the owner and status |
|---|---|
| `private` | only the owner |
| `channels` | any member with the `mesh` role in the same domain |
| `friends` | only the owner, for now: the platform has no friends list to check yet |

A radio nobody has claimed is listed without an owner.

## More detail

The [`hugmesh-user-mesh-ui` README](https://github.com/hugmesh/hugmesh-user-mesh-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
