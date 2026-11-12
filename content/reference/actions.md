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
| Game master sync | Copies the members who hold `game-master` in the main sign-in service into `mesh-games-admin`, a role in the games sign-in service that only this job writes. It counts a member only when their two accounts each name the other. It never writes the games service's own `admin` role. Off by default. |
| GitHub organisation admin | Gives admins of the configured GitHub organisations the admin role, and a scheduled job revokes it when they leave. Off by default. |
| Default roles for new sign-ups | Applies the roles an outside sign-in provider should give new members. Off by default. |

Game master sync is off unless `GM_SYNC_ENABLED` is set, and it never writes the games
service's own `admin` role. Turned on, it has no visible effect yet: nothing writes the
account links it needs, and the games service does not act on `mesh-games-admin`.

## Where it runs

It has no user interface. In the cluster it runs as `hugmesh-api`, behind the backend
gateway.

## Who can use it

Its registration endpoint, `/api/registration/`, needs the admin role. The jobs run on a
schedule; nobody calls them.

## Settings

| Variable | What it does |
|---|---|
| `GM_SYNC_ENABLED` | Turns on game master sync. Default `false`. |
| `GM_SYNC_SYSTEMS_ROLE` | The role to copy from the main sign-in service. Default `game-master`. |
| `GM_SYNC_GAMES_ROLE` | The role it becomes in the games sign-in service. Default `mesh-games-admin`. The name must start with `mesh-`; any other value, `admin` included, is refused and the job writes nothing. |
| `GH_ORG_ADMIN_ENABLED` | Turns on the GitHub organisation admin job. Default `false`. |
| `APP_OIDC_DEFAULT_ROLES_ENABLED` | Turns on default roles for new sign-ups. Default `false`. |

## More detail

The [`hugmesh-actions` README](https://github.com/hugmesh/hugmesh-actions/blob/main/README.md) has the architecture, the full API and how to build and test it.
