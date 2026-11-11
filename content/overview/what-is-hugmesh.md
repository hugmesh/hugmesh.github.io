---
title: "What HugMesh is"
section: "overview"
slug: "what-is-hugmesh"
summary: "What you get, who it is for, the three ways to run it, and what is still experimental."
---

HugMesh runs a community's online services on hardware that community owns. You build
it, you host it, and you hold the keys. There is no account with us to lose and no cloud
service it depends on.

## What you get

One mesh gives its members:

- **Chat** on Matrix, which can talk to the wider Matrix network.
- **A fediverse server** (Akkoma, which speaks the Mastodon API), so members can follow
  and be followed across the fediverse.
- **A forum**, **a wiki**, **video** and **live streaming**.
- **Games**: a browser game portal with multiplayer sessions, plus makers for RPGs and
  visual novels.
- **One sign-in for all of it.** A member signs in once and every service knows them.
  The sign-in service (Casdoor) runs on your own cluster, and the browser never holds a
  sign-in token, only a session cookie.

Chat, the fediverse server and the forum are on by default. Games, video and live
streaming are opt-in, and any optional service can be left out without breaking the
others: its entry in the web interface is greyed out.

Behind that sits an admin console, a moderator console and per-domain controls, so one
mesh can serve several communities, each under its own domain.

## Who it is for

- **People who want their community's chat, posts and files on their own machines**,
  instead of on a platform that can change its rules or close.
- **Small groups with a few spare computers.** The reference setup is three Raspberry Pi
  5 boards and one x86_64 computer, but a single x86_64 machine can run everything.
- **Developers** who want a self-hosted platform they can extend. Each service is its
  own repository with its own build and release.

## Three ways to run it

1. **Try it on one computer.** The whole stack runs in Docker on one x86_64 machine.
   Nothing to flash. See [Run the whole stack on one computer](/tutorials/local-docker-stack).
2. **Build a mesh on your own hardware.** The Studio, a desktop app, builds a hardened
   Gentoo image for each node. Each node then reads its keys from a USB stick at first
   boot and joins the cluster. See [Your first mesh, step by step](/tutorials/start-here).
3. **Join a mesh someone else runs.** Laptops, desktops and Docker hosts join as
   clients, and phones are enrolled with MDM. See
   [Devices and images](/devices).

[Download the Studio](/downloads) for Windows or Linux to start.

## Built from open parts

Everything is open source and self-hosted: Gentoo Linux on the nodes, Kubernetes for the
cluster, headscale (a self-hosted Tailscale control server) for the private network,
Vault for secrets, Casdoor for sign-in, and Spring and Angular for the services. SSH is
key-only by default, and every image is built without secrets; they arrive on the KEYS
stick at first boot. [How it works](/overview/how-it-works) walks through the pieces in
order.

## What is still experimental

Some of HugMesh is not finished, and the pages say so:

- **Other boards.** NVIDIA Jetson and the Orange Pi boards are experimental ports that
  have not been validated on real hardware. See [Devices and images](/devices).
- **Cloud deploy.** Publishing an image to AWS, Azure or OpenShift has not yet run end
  to end against a real provider. See
  [Deploy an image to a cloud provider](/operations/cloud-deploy).
- **Per-domain service choices.** The Studio records which services each domain wants,
  but the cluster does not yet enforce a different choice per domain. See
  [Choose which services run](/operations/optional-services).
- **The Meshtastic dashboard** has its back end but not yet its screens. See
  [Meshtastic device dashboard](/reference/user-mesh-ui).

HugMesh is MIT licensed. The source is at [github.com/hugmesh](https://github.com/hugmesh).
