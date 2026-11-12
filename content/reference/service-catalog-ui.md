---
title: "Service catalog console"
section: "reference"
slug: "service-catalog-ui"
summary: "The superadmin console for the service catalog."
---

The service catalog console is the superadmin's view of every service a domain can run.
It has six parts:

- **Curation:** which services each domain is offered.
- **App profiles:** the deployment templates services are created from.
- **Deployments:** a record of each service deployment and its state.
- **Create service:** a wizard that starts a new service from a starter archetype and
  can register its web app with the host shell
  ([Starter repos and archetypes](/developer-guide/scaffold-archetypes)).
- **Add a service:** provisions an existing service for a domain.
- **Optional services:** turns optional services on or off.

Where a button does less than it looks, the console says so.

## Where it appears

A separate superadmin gateway serves it at `/superadmin/service-catalog`, and that
gateway is reachable only over the mesh's private network. The cluster configuration
also describes it as a web app for the host shell at the same path, but the federation
API does not register it yet, so the host shell may not list it.

## Who can open it

`superadmin` only.

## What it talks to

The service catalog in the [admin API](/reference/admin-bff).

## More detail

For how it is put together and how to build and test it, see the [`hugmesh-superadmin-service-catalog-ui` README](https://github.com/hugmesh/hugmesh-superadmin-service-catalog-ui/blob/main/README.md).
