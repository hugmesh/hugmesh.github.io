---
title: "Role reconciliation service"
section: "reference"
slug: "actions"
summary: "Scheduled jobs that keep roles in step across services, and the registration grant endpoint."
---

The role reconciliation service runs scheduled jobs that keep roles in step across
services, and it hosts the endpoint that grants organisation admin during registration.
It keeps no state of its own: each run reads the current roles from Casdoor and fixes up
the other side.

| Job | What it does |
|---|---|
| Game master sync | Gives a member who holds `game-master` in the main sign-in service the `admin` role in the games sign-in service, and takes it away again. |
| GitHub organisation admin | Gives admins of the configured GitHub organisations the admin role, and a scheduled job revokes it when they leave. Off by default. |
| Default roles for new sign-ups | Applies the roles an outside sign-in provider should give new members. Off by default. |

## Where it runs

It has no user interface. In the cluster it runs as `hugmesh-api`, behind the backend
gateway.

## Who can use it

Its registration endpoint, `/api/registration/`, needs the admin role. The jobs run on a
schedule; nobody calls them.

## Settings

| Variable | What it does |
|---|---|
| `GM_SYNC_SYSTEMS_ROLE` | The role to copy from the main sign-in service. Default `game-master`. |
| `GM_SYNC_GAMES_ROLE` | The role it becomes in the games sign-in service. Default `admin`. |
| `GH_ORG_ADMIN_ENABLED` | Turns on the GitHub organisation admin job. Default `false`. |
| `APP_OIDC_DEFAULT_ROLES_ENABLED` | Turns on default roles for new sign-ups. Default `false`. |

## More detail

The [`hugmesh-actions` README](https://github.com/hugmesh/hugmesh-actions/blob/main/README.md) has the architecture, the full API and how to build and test it.
