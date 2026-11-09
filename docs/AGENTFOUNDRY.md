# AgentFoundry record

AgentFoundry was used. Version 0.1.80 `create_file` wrote `evidence/agentfoundry-ide-2026-11-09/query-plan.ts`.

- Size: 12210 bytes
- SHA-256: `eb251f01b91859f6668b9f4593b2db2694a3256b4419d958d9977ee3b9756820`

That file is the generated module and is byte-for-byte unchanged. A static review of it found defects. Those defects are not restated here as a claim that an unedited file was required. The published judging text requires a project built using AgentFoundry, a public README, a demo judges can open, and a submission issue. It does not say the generated file must remain unedited or pass every test by itself.

`src/lib/agentfoundry/query-plan.reviewed.ts` is a corrected copy. The desk labels it "Reviewed plan (post-review edit, not unedited IDE output)". It is opt-in. The default question path is the deterministic baseline. `agentFoundryGenerated` stays false because the answer text is not untouched IDE output. That flag is not a denial that the IDE wrote `query-plan.ts`.

No model provider is called. Refusals do not fall through to another path. Final judging belongs to the organisers. This tree does not declare that they have accepted the entry, and it does not file a submission.
