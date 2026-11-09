import { INDICATOR_IDS, MANAGEMENT_IDS, regionById } from "@/lib/catalog";
import type { ReadOnlyQuery } from "@/lib/query";

const QUERY_KEYS = ["indicatorId", "year", "regionIds", "managementId", "order", "excludeAggregate"] as const;
const ORDERS = new Set(["report", "printed_asc", "printed_desc"]);

export type QueryValidation =
  | { ok: true; query: ReadOnlyQuery }
  | { ok: false; message: string };

/** Re-checks a planner object before runQuery. Unknown keys and ids are rejected. */
export function validateReadOnlyQuery(value: unknown): QueryValidation {
  if (!isRecord(value)) return { ok: false, message: "The query is not an object." };
  const keys = Object.keys(value);
  if (keys.some((key) => !QUERY_KEYS.includes(key as (typeof QUERY_KEYS)[number]))) {
    return { ok: false, message: "The query has a field outside the allowlist." };
  }
  for (const key of QUERY_KEYS) {
    if (!(key in value)) return { ok: false, message: `The query is missing ${key}.` };
  }
  const indicatorId = value.indicatorId;
  const year = value.year;
  const regionIds = value.regionIds;
  const managementId = value.managementId;
  const order = value.order;
  const excludeAggregate = value.excludeAggregate;
  if (typeof indicatorId !== "string" || !(INDICATOR_IDS as readonly string[]).includes(indicatorId)) {
    return { ok: false, message: "The indicator is not one of the three known tables." };
  }
  if (year !== "2022-23") return { ok: false, message: "The year is not 2022-23." };
  if (typeof managementId !== "string" || !(MANAGEMENT_IDS as readonly string[]).includes(managementId)) {
    return { ok: false, message: "The management id is not in the allowlist." };
  }
  if (typeof order !== "string" || !ORDERS.has(order)) return { ok: false, message: "The order is not an allowed read." };
  if (typeof excludeAggregate !== "boolean") return { ok: false, message: "excludeAggregate must be boolean." };
  if (!Array.isArray(regionIds) || regionIds.length === 0 || regionIds.length > 37) {
    return { ok: false, message: "The geography list is empty or too long." };
  }
  const seen = new Set<string>();
  for (const regionId of regionIds) {
    if (typeof regionId !== "string" || !regionById(regionId) || seen.has(regionId)) {
      return { ok: false, message: "A geography id is unknown or repeated." };
    }
    seen.add(regionId);
  }
  return {
    ok: true,
    query: {
      indicatorId: indicatorId as ReadOnlyQuery["indicatorId"],
      year: "2022-23",
      regionIds: [...regionIds],
      managementId: managementId as ReadOnlyQuery["managementId"],
      order: order as ReadOnlyQuery["order"],
      excludeAggregate,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
