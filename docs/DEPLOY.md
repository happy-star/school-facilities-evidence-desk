# Deploy the public container

This image is the synthetic demo. It does not fetch or import an official booklet. poppler is not installed. `PUBLIC_DEMO=1` and `PUBLIC_RELEASE=1` are set in the image, and the source lock refuses official import even if those variables are overridden.

Build from this directory:

```bash
docker build -t school-facilities-evidence-desk:public .
```

The container listens on port 3000. Map it to a free host port. `8893` is a candidate only. Confirm it is unused before binding. Do not reuse a port already serving another demo, including 8787 or 8891, and do not attach this container to another project's network, volume, or name.

```bash
docker run --rm \
  --name school-facilities-evidence-desk \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit=256 \
  --memory=512m \
  --cpus=1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -p 127.0.0.1:8893:3000 \
  school-facilities-evidence-desk:public
```

`--read-only` needs the tmpfs because the server writes its own temporary files under `/tmp`. Do not mount the Docker socket. Do not add `--privileged`. Do not pass API keys or a dataset file. Do not publish the port on `0.0.0.0` until the maintainer has chosen to expose it.

Inside the container the process runs as the image's `node` user. A judge opens the mapped host port, leaves the official view empty, then selects **Synthetic sample**.

No server was contacted while this source pack was built. The `127.0.0.1:8893` mapping above is a local recipe.

The verified live demo is http://140.82.0.23:8893/ (HTTP, not HTTPS). That container still runs the published snapshot, archive SHA-256 `748b91ab1b327162bf26f23d5b872629a1115e9964b026f8a5766fb3dc95968c` (public commit `d4d983051a55bd1219b0dcf2acc55cbc5e89b16a`). Later source commits, including the CLI refusal fix, are not deployed there. Repository: https://github.com/happy-star/school-facilities-evidence-desk. This tree does not redeploy that host. Ports 8787 and 8891 belong to other demos and stay untouched.
