# Containerization (optional)

> **Very optional.** The live site is static files on Cloudflare ([RUNBOOK §7](RUNBOOK.md#7-deploying)) and needs **none** of this. If you're maintaining the site day to day, you can skip this whole file.
> It exists so the site can move off Cloudflare, or grow server-side features, without starting over. CI keeps it working in the background.

**Contents:** [Why containers](#why-containers) · [Tools](#tools) · [Container image](#container-image) · [GitHub Container Registry](#github-container-registry-ghcr) · [Kubernetes: local](#kubernetes-local-k3d) · [Kubernetes: production](#kubernetes-production-k3s) · [Cloudflare Tunnel](#cloudflare-tunnel) · [When its checks fail](#when-its-checks-fail)

## Why containers

A **container image** packages the site with everything needed to serve it (Node, the server, the built pages) into one file that runs the same on a laptop, a $6/month server, or a managed cluster. For this project that buys three things:

1. **Leaving Cloudflare is cheap.** If the site moves to DigitalOcean, a university server, or someone's home server, the image and the Kubernetes configuration move with it unchanged. Only the host differs.
2. **Room for server features.** Static hosting can only serve files. Anything that needs code running on a server (a sign-up endpoint, live data, a members-only area) needs somewhere to run, and this is it.
3. **Proven, not theoretical.** CI builds the image and tests it under production restrictions on every PR ([RUNBOOK §10](RUNBOOK.md#10-tests-and-checks)), so it works on the day it's needed.

If none of that ever happens, the cost is a few minutes of CI per PR.

## Tools

| Tool | Needed for | Install | Check |
|---|---|---|---|
| Docker | Building and running the image; also required by k3d | [Docker Desktop](https://docs.docker.com/desktop/) (macOS/Windows, incl. WSL2) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux) | `docker --version` |
| kubectl | Any Kubernetes work (render, apply, logs) | [kubernetes.io/docs/tasks/tools](https://kubernetes.io/docs/tasks/tools/) · `brew install kubectl` | `kubectl version --client` |
| k3d | A local Kubernetes cluster that runs inside Docker | `curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \| bash` · `brew install k3d` | `k3d version` |
| kustomize | Only for `kustomize edit set image` when releasing; rendering uses kubectl | [kubectl.docs.kubernetes.io/installation/kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/) · `brew install kustomize` | `kustomize version` |
| kubeconform | Validating manifests locally (CI already does it) | [github.com/yannh/kubeconform](https://github.com/yannh/kubeconform#installation) · `brew install kubeconform` | `kubeconform -v` |

Tested with Docker 29.0, kubectl 1.34, k3d 5.9.

## Container image

The `Dockerfile` builds in two stages: the first runs `npm run export`; the second copies only what's needed to serve the result (the server, settings, `dist/`, and one runtime dependency). The final image runs as a non-root user and works with a read-only filesystem.

```bash
docker build -t hive-site:dev .
docker run --rm --read-only --user 1000 -p 8080:8080 hive-site:dev   # → http://localhost:8080
```

`--read-only --user 1000` reproduces the restrictions the Kubernetes pod runs under, so problems show up locally rather than after deploying.

## GitHub Container Registry (GHCR)

A **container registry** is to images what GitHub is to code: a place to upload versioned images so servers can download ("pull") them. **GHCR** (`ghcr.io`) is GitHub's registry, attached to this repository:

- **Same accounts and permissions as the repo.** No separate service to manage. A newly pushed image is private by default, even from a public repo; see below.
- **Provider-neutral.** Any host can pull from it, unlike a cloud provider's own registry (e.g. DigitalOcean's), which would tie the image to that provider.
- **Versioned.** Each release is pushed as `ghcr.io/<owner>/hive-site:<version>`, and the production cluster runs the version named in `kube/overlays/prod/kustomization.yaml`. Rolling back means pointing at the previous tag.

Publishing an image by hand (until release automation does it; see [RUNBOOK §5](RUNBOOK.md#5-versions-and-releases)):

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin   # a token with write:packages
docker build -t ghcr.io/<owner>/hive-site:<version> .
docker push ghcr.io/<owner>/hive-site:<version>
```

**Private images need cluster credentials.** The source is public, so the simplest option is to make the package public (package page → Package settings → Change visibility); then the cluster pulls without logging in. If the image stays private, the cluster must log in: create a pull secret once (token with `read:packages`) and reference it from the Deployment as `imagePullSecrets` (not yet in the prod overlay; see [PROJECT_LOG.md](PROJECT_LOG.md)):

```bash
kubectl -n hive create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
```

## Kubernetes: local (k3d)

Runs the site in a real (small) Kubernetes cluster on your machine, with Traefik routing traffic just like production. Needs Docker, kubectl, and k3d. Verified end to end on 2026-09-23.

```bash
k3d cluster create hive -p "8081:80@loadbalancer"    # one time
docker build -t hive-site:dev . && k3d image import hive-site:dev -c hive
kubectl apply -k kube/overlays/local                 # → http://hive.localhost:8081
kubectl -n hive get pods                             # should show Running
k3d cluster delete hive                              # tear down
```

After a code change: rebuild, re-import, then `kubectl -n hive rollout restart deploy/hive-site`.

`kube/` holds the configuration as **Kustomize** layers: `base/` is shared, and `overlays/local` and `overlays/prod` hold only what differs (image, hostnames, replicas). `kubectl kustomize kube/overlays/<name>` prints the combined result.

## Kubernetes: production (k3s)

For a real server running [k3s](https://k3s.io/), a lightweight Kubernetes distribution. Needs kubectl with access to that cluster.

One time:

```bash
kubectl create namespace hive
kubectl -n hive create secret generic cloudflared-token --from-literal=token=<tunnel-token>   # see Cloudflare Tunnel
```

Each release:

```bash
# Set the image tag in kube/overlays/prod/kustomization.yaml (images → newTag), or:
#   (cd kube/overlays/prod && kustomize edit set image hive-site=ghcr.io/<owner>/hive-site:<version>)
kubectl kustomize kube/overlays/prod | less          # review what will change
kubectl apply -k kube/overlays/prod
kubectl -n hive rollout status deploy/hive-site      # waits until healthy
kubectl -n hive logs deploy/hive-site                # if something's wrong
kubectl -n hive rollout undo deploy/hive-site        # roll back
```

## Cloudflare Tunnel

Only relevant to the production Kubernetes setup. A **tunnel** lets Cloudflare reach the server through an outbound connection that the server opens (the `cloudflared` pods), so the server needs **no open ports and no public IP**. That's what makes a home or campus server viable. Visitors still go through Cloudflare's network as usual.

Setup (Cloudflare dashboard):
1. Zero Trust → Networks → Tunnels → Create a tunnel (cloudflared). Copy its token into the `cloudflared-token` secret above.
2. Public hostnames: `hivesocietyimprov.com` and `www.hivesocietyimprov.com` → `http://traefik.kube-system.svc.cluster.local:80`.

## When its checks fail

| Failing check | What it means | Fix |
|---|---|---|
| **Kubernetes manifests** | A Kustomize layer doesn't combine, or a resource has an invalid field | `kubectl kustomize kube/overlays/<name>` locally; the kubeconform message in the CI log names the field |
| **Container image** | The image didn't build, or didn't serve pages under the pod restrictions | Run the two commands under [Container image](#container-image) locally; `docker logs <container>` shows the server's error |

Troubleshooting local k3d: if http://hive.localhost:8081 doesn't load, run `kubectl -n hive get pods,ingress`. `ErrImageNeverPull` or `ImagePullBackOff` means the image wasn't imported; re-run `k3d image import`.
