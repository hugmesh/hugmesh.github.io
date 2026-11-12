---
title: "Starter repos and archetypes"
section: "developer-guide"
slug: "scaffold-archetypes"
summary: "The starter repositories the Service Store hands out, and the templates they come from."
---

A new HugMesh service starts from an archetype: a template for one kind of repository,
such as a Spring API or an Angular web app. Archetypes live in two places, and this page
explains both.

## Starter ZIPs from the Service Store

A superadmin can download a starter codebase for a new service from the Service Store in
the [Service catalog console](/reference/service-catalog-ui). The admin API renders it as
a ZIP for one domain:

```
GET /bff/superadmin/service-store/{domain}/scaffold/{id}/archive
```

| Archetype | What you get |
|---|---|
| `spring-bff` | A minimal Spring Boot 4 WebFlux API (Java 25, built with the HugMesh parent POM) that builds, tests and runs. |
| `angular-mfe` | An Angular 22 native-federation web app that exposes `./routes`, ready for the host shell to load. |
| `angular-host` | An Angular 22 native-federation host shell that loads the web apps listed in its manifest. |
| `remote-fragment` | A pointer to the real base repository, which serves published web app bundles. There is no runnable skeleton for this one, on purpose. |

The `{{TOKEN}}` placeholders in the files are filled in when the ZIP is requested, and
the Java sources are moved into the package for your service. The templates are in
[`hugmesh-admin-bff-api`](https://github.com/hugmesh/hugmesh-admin-bff-api/tree/main/src/main/resources/scaffold).

## The generator's archetypes

The generator renders the platform's own repositories for a new brand from one recipe
per kind of repository, with each repository's identity filled in from the brand's
configuration. The templates are in
[`hugmesh-generator` `templates/archetypes/`](https://github.com/hugmesh/hugmesh-generator/tree/main/templates/archetypes).

| Archetype | Kind of repository | Members today |
|---|---|---|
| `spring-bff` | A Spring Boot 4 Java API | the admin, user, mod, forum, owncast, tube and wiki APIs, and the federation API |
| `angular-mfe` | An Angular native-federation web app | the login, admin, user, mod, matrix, mastodon, owncast, tube, wiki and forum web apps, the API documentation browser, the avatar creator and the service catalog console |
| `angular-host` | The host shell that loads every web app | `hugmesh-host-shell` |
| `gateway` | Gateways and infrastructure services | the gateways and `hugmesh-actions` |
| `remote-fragment` | The pod that serves published web app bundles | `hugmesh-remote-fragment` |

Each archetype changes only what differs per brand, such as the sign-in host and the CI
settings. The code itself stays as the base repository has it.

## The two copies differ

The Service Store templates started as a copy of the generator's archetype skeletons
and have since drifted: for example, the Java package and some deployment defaults
differ. The README in each location lists the differences.
