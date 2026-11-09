# Public build limits

This build does not run poppler and does not accept a PDF. The import route, the clear route, and `npm run import` refuse before a path is opened or a file is parsed. The official store is not read, so a file placed beside the server is not served.

There is no login. Anyone who can open the mapped port can use the synthetic sample. Bind that port to localhost until the maintainer decides otherwise. Do not mount the Docker socket or run the container as privileged. Memory, CPU, and process limits are in `docs/DEPLOY.md`.

No model key is read and no provider is called. The sample fixture is the only dataset the demo path loads.
