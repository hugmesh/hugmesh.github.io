---
title: "Chat web app (Matrix)"
section: "reference"
slug: "matrix-ui"
summary: "An Element-like Matrix chat client inside the host shell."
---

The chat web app is a Matrix client in the style of Element, built into the host shell.
The mesh's Matrix server is tuwunel, which is on by default and can talk to the wider
Matrix network.

Besides rooms and messages, it renders members' visual-novel characters, with stickers
and character voices, and hosts *Shadows of the Net*, a 3D chat room. A moderator or
admin can keep a member's chat local-only, so it does not federate outside the mesh.

## Where it appears

The host shell mounts it at `/social/matrix`.

## Who can open it

Any signed-in member who has finished registering. Moderation controls appear in tiers:
moderators and admins see the moderator controls, and only admins see the admin
controls. The APIs check the same roles on the server.

## More detail

The [`hugmesh-matrix-ui` README](https://github.com/hugmesh/hugmesh-matrix-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
