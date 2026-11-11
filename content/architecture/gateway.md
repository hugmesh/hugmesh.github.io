---
title: "Gateways"
section: "architecture"
slug: "gateway"
summary: "One gateway image in three roles (identity, backend, frontend), and what each overlay adds."
---

Every request from outside a mesh passes a gateway before it reaches a service. The
gateway checks who is calling and whether their roles allow the address they asked for.
It never signs anyone in: Casdoor issues the tokens, and the gateway only checks them.

The gateway is a Spring Cloud Gateway application in
[`hugmesh-gateway`](https://github.com/hugmesh/hugmesh-gateway).

## One image, three roles

The same image runs as every gateway. Only its instance name differs
(`SPRING_APPLICATION_NAME`), and that name decides which routes and which access rules
it loads. Three small repositories each build `FROM` the shared image and set the name,
a route set and the address behind it. They hold no gateway code of their own.

| Gateway | Instance name | Sits in front of | Overlay repository |
|---|---|---|---|
| Identity | `hugmesh-pki-gateway` | Casdoor (sign-in) and headscale (the private network). Internal only, never internet-facing. | [`hugmesh-pki-gateway`](https://github.com/hugmesh/hugmesh-pki-gateway) |
| Backend | `hugmesh-be-gateway` | The backend APIs and the Matrix and fediverse servers. One catch-all route. | [`hugmesh-be-gateway`](https://github.com/hugmesh/hugmesh-be-gateway) |
| Frontend | `hugmesh-fe-gateway` | The host shell and the web apps it loads. One catch-all route. | [`hugmesh-fe-gateway`](https://github.com/hugmesh/hugmesh-fe-gateway) |

A mesh that serves several brands runs one set per brand, named
`<brand>-pki-gateway`, `<brand>-be-gateway` and `<brand>-fe-gateway`. Because every
instance runs the same image, every node runs the same checked code.

## What every gateway does

- **Checks the token.** The gateway validates the Casdoor token on each request.
  Every signed-in caller gets the `user` role as a floor, and each role in the token
  becomes an authority such as `ROLE_ADMIN`.
- **Turns a session cookie into a token.** The browser holds only an opaque session
  cookie. On the way in, the gateway swaps it for the member's token, which is kept on
  the server side, so no token ever reaches the browser.
- **Applies route access rules.** For each gateway, a table of rules says which roles,
  or which users, may reach which URL patterns, per domain. Admins edit the rules
  through the admin API; [Route access control](/architecture/route-access-control)
  explains them.
- **Keeps domains apart.** A caller's domain comes from the token. The `superadmin`
  role is the only one that crosses domains; `admin` applies only inside its own domain.
- **Fails closed.** If a gateway cannot load its rules and has no stored copy, it falls
  back to built-in defaults for its tier. An unknown gateway name gets a rule that only
  admins pass, never an open door.

## Where the rules live

The rules are stored in Postgres, which the admin API writes. Each gateway reads only
its own rows at start and on every refresh, and copies them to Cassandra, so a short
Postgres outage does not change what is enforced.

## Where to read more

- [`hugmesh-gateway`](https://github.com/hugmesh/hugmesh-gateway) has the full request
  pipeline, configuration and tests.
- [Cluster architecture](/architecture/cluster-architecture) shows where the gateways
  sit in the cluster.
- [Host shell](/architecture/host-shell) is what the frontend gateway serves.
