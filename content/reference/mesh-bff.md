---
title: "Meshtastic device API"
section: "reference"
slug: "mesh-bff"
summary: "The Meshtastic node directory and its cache."
---

The Meshtastic device API answers which radio nodes and bridged rooms exist, whether they
are online, who owns a node, and whether the caller may be told. It keeps a fast cache
of that directory.

It works alongside two other parts:

- **meshbridge**, an optional daemon that owns the radio link and carries chat text
  between the radio mesh and Matrix. It can push a snapshot of nodes and rooms here.
- **the User API**, which records which member claims which node, and their visibility
  choice.

Visibility is decided per node: `private` shows the owner and status only to the owner,
`channels` to any `mesh` member in the same domain, and `friends` behaves like `private`
for now. A node nobody has claimed is listed without an owner.

## Where it runs

Inside the cluster only, in the backend namespace. Browsers reach it through the
frontend gateway at `/bff/mesh/`. meshbridge sends its snapshots to an internal path
inside the cluster.

## Who can use it

Members with the `mesh` role, and admins. An admin can suspend a member's `mesh` role
through the admin API.

## More detail

The [`hugmesh-mesh-bff-api` README](https://github.com/hugmesh/hugmesh-mesh-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
