# School Facilities Evidence Desk

A reader for historical school sanitation tables. The public build opens with an empty official view and does not invent a figure. Choose **Synthetic sample** to run the included demo. Those rows are invented sample data, not UDISE+ and not official India statistics.

Public repository: https://github.com/happy-star/school-facilities-evidence-desk

Live demo: http://140.82.0.23:8893/ (HTTP, not HTTPS). The page opens on **Official import**, which is empty. Select **Synthetic sample** explicitly. Sample figures are labeled as not official India statistics.

## Run locally

Node.js 22. No booklet download and no poppler are required.

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:43127 on the same machine. The data source starts on **Official import**, which stays empty. **Synthetic sample** is the explicit demo. The question path starts on the deterministic baseline. **Reviewed plan** is a separate opt-in and is a post-review edit, not unedited IDE output.

PDF import and the official-file reader are compiled off in this tree. `npm run import` exits without reading a file.

## Docker

See `docs/DEPLOY.md`. The image listens on port 3000 inside the container. It does not include poppler, a model key, or an official dataset.

## AgentFoundry

AgentFoundry 0.1.80 `create_file` wrote `evidence/agentfoundry-ide-2026-11-09/query-plan.ts` (12210 bytes, SHA-256 `eb251f01b91859f6668b9f4593b2db2694a3256b4419d958d9977ee3b9756820`). That file is unchanged. `src/lib/agentfoundry/query-plan.reviewed.ts` is a later correction and is labeled as such. The published judging text does not require the generated file to stay unedited. Whether the recorded use meets the rule is for the organisers.

## Licence

MIT for source code written for this project by Peter Zhou. See `LICENSE` and `NOTICE`. The licence does not cover the UDISE+ booklet or official statistics. This repository does not grant that data.
