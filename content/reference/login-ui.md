---
title: "Sign-in web app"
section: "reference"
slug: "login-ui"
summary: "Sign-in, registration, multi-factor sign-in, and the ban and suspension screens."
---

The sign-in web app handles everything before and around signing in: the sign-in form,
two-stage registration, multi-factor sign-in, and the screens a banned or suspended
member sees, including their appeal.

Sign-in has no redirect to another site. The form posts the username and password to the
[User API](/reference/user-bff), which signs the member in with Casdoor on the server and
returns only a session cookie the page cannot read. The browser never sees a Casdoor
address or a token.

- **Multi-factor sign-in.** Members enrol an authenticator app (TOTP) or a passkey, and
  manage them on a security page. Other web apps load this app's step-up challenge when
  an action needs a second factor.
- **Two-stage registration.** A member's first sign-in asks for a display name before the
  rest of the platform opens.
- **Local sign-in without a password.** On a machine that runs the local agent, the page
  can offer a one-click choice of role instead of the form. It only ever asks the same
  machine, never the network.

## Where it appears

The host shell mounts it at `/login`.

## Who can open it

Anyone. The sign-in pages need no account.

## Settings

The sign-in page's look is set when its container starts, so a change is an environment
edit and a restart, not a rebuild:

| Variable | What it does |
|---|---|
| `HUG_THEME_CSS` | The domain's theme colours. |
| `SNAP_BG_EFFECT` | The background effect. Unset, the theme decides. |
| `SNAP_BG_IMAGE_URL` | Your own background image. |
| `SNAP_BG_PICKER` | Shows visitors a background picker. Off by default. |

Which languages the page offers is decided when the image is built (`HUG_WEB_LOCALES`).

## More detail

For how it is put together and how to build and test it, see the [`hugmesh-login-ui` README](https://github.com/hugmesh/hugmesh-login-ui/blob/main/README.md).
