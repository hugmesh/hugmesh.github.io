How HugMesh is built, for people who want the detail. For the short version, read
[How it works](/overview/how-it-works) first.

The cluster runs on Kubernetes and ArgoCD keeps it in step with its configuration. Every
request from outside passes a gateway. The web front end is one host shell that loads a
web app per service.
