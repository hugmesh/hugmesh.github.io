---
title: "Live streaming console (Owncast)"
section: "reference"
slug: "owncast-ui"
summary: "Manage the optional Owncast live-streaming server."
---

The live streaming console is for the mesh's Owncast server. A streamer sets their
stream's title and description and whether it is public. Admins and moderators grant,
time out, ban and restore a member's right to broadcast. With **Avatar cam**, a streamer
can go live as their own 2D avatar instead of on camera.

Live streaming is optional and off by default
([Choose which services run](/operations/optional-services)).

## Where it appears

The host shell mounts it at `/owncast`, and shows it in the menu only to members whose
role allows it.

## Who can open it

Members with the `owncast` role. Broadcasting itself also needs a grant from an admin;
see the [live streaming API](/reference/owncast-bff).

## More detail

The [`hugmesh-owncast-ui` README](https://github.com/hugmesh/hugmesh-owncast-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
