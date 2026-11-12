---
title: "Video console (LocalTube)"
section: "reference"
slug: "tube-ui"
summary: "Manage LocalTube, the optional personal video archive."
---

LocalTube lets a member subscribe to YouTube channels and keep local copies of new
videos to watch inside the mesh. This console has three parts: the member's own download
queue, storage budgets, and access controls with which admins grant, time out or ban a
member's use of it.

LocalTube is optional and off by default
([Choose which services run](/operations/optional-services)). The scheduled job that runs
the downloads is not built yet; see the [video API](/reference/tube-bff).

## Where it appears

The host shell mounts it at `/tube`.

## Who can open it

Members with the `tube` role, and admins. Access controls and storage budgets are for
admins and superadmins, and ask for a second sign-in factor.

## More detail

For how it is put together and how to build and test it, see the [`hugmesh-tube-ui` README](https://github.com/hugmesh/hugmesh-tube-ui/blob/main/README.md).
