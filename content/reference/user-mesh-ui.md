---
title: "Meshtastic device dashboard"
section: "reference"
slug: "user-mesh-ui"
summary: "Each member's view of their Meshtastic radios. Built, but not yet mounted in the host shell."
---

HugMesh can bridge Meshtastic LoRa radio networks into Matrix chat, so a community can
keep talking over radio when the internet is down. This dashboard shows each member the
radio mesh in three views:

| View | What it shows |
|---|---|
| Nodes | every radio the bridge has heard, with a filter |
| My devices | the radios the member has claimed: claim, release, visibility and live status |
| Channels | the chat rooms bridged onto the radio mesh, grouped by radio channel |

**It is built, but not yet mounted.** The web app builds, its tests run and its image can
be produced. What is missing is on the platform side: the host shell has no entry for it,
the frontend gateway has no `/user-mesh` route, and the route access rules have no row
for it. Until those land it runs only on its own, for development. The
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

For how it is put together and how to build and test it, see the [`hugmesh-user-mesh-ui` README](https://github.com/hugmesh/hugmesh-user-mesh-ui/blob/main/README.md).
