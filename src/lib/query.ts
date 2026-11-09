import { INDICATOR_IDS, managementById, regionById, type IndicatorId, type ManagementId } from "@/lib/catalog";
import type { EvidenceCell, EvidenceDataset } from "@/lib/schema";
import { STATISTICAL_YEAR } from "@/lib/official-source";

export type ReadOnlyQuery = {
  indicatorId: IndicatorId;
  year: typeof STATISTICAL_YEAR;
  regionIds: string[];
  managementId: ManagementId;
  /** Descriptive sort of printed measured percentages. Undefined and missing cells are omitted, not treated as zero. */
  order: "report" | "printed_asc" | "printed_desc";
  excludeAggregate: boolean;
};

export type QueryOutcome = {
  ok: true;
  matched: EvidenceCell[];
  displayed: EvidenceCell[];
  omittedFromOrder: EvidenceCell[];
} | {
  ok: false;
  code: string;
  message: string;
};

const ORDERS = new Set<ReadOnlyQuery["order"]>(["report", "printed_asc", "printed_desc"]);

export function runQuery(dataset: EvidenceDataset, query: ReadOnlyQuery): QueryOutcome {
  if (query.year !== STATISTICAL_YEAR) {
    return {
      ok: false,
      code: "year_refused",
      message: "Only the historical year 2022-23 can be queried. Other years are not estimated.",
    };
  }
  if (!(INDICATOR_IDS as readonly string[]).includes(query.indicatorId)) {
    return { ok: false, code: "unknown_indicator", message: "That indicator is not one of the three known tables." };
  }
  if (!ORDERS.has(query.order)) {
    return { ok: false, code: "unknown_order", message: "The query order is not an allowed read." };
  }
  if (!managementById(query.managementId)) {
    return { ok: false, code: "unknown_management", message: "That management column is not in the known tables." };
  }
  if (query.regionIds.length === 0) {
    return { ok: false, code: "no_region", message: "The query has no geography." };
  }
  for (const regionId of query.regionIds) {
    if (!regionById(regionId)) {
      return { ok: false, code: "unknown_region", message: `Unknown geography id ${regionId}.` };
    }
  }

  const wanted = new Set(query.regionIds);
  const matched = dataset.cells
    .filter(
      (cell) =>
        cell.indicatorId === query.indicatorId &&
        cell.managementId === query.managementId &&
        wanted.has(cell.regionId),
    )
    .sort((left, right) => regionOrder(dataset, left.regionId) - regionOrder(dataset, right.regionId));

  const measured = matched.filter(
    (cell) =>
      cell.interpretation === "measured_percentage" &&
      cell.numeric != null &&
      cell.counts?.denominator !== 0 &&
      (!query.excludeAggregate || !isAggregate(dataset, cell.regionId)),
  );
  const omittedFromOrder = matched.filter((cell) => !measured.includes(cell));

  let displayed = matched;
  if (query.order === "printed_asc" || query.order === "printed_desc") {
    const direction = query.order === "printed_asc" ? 1 : -1;
    displayed = [...measured].sort((left, right) => {
      const delta = (left.numeric! - right.numeric!) * direction;
      if (delta !== 0) return delta;
      return regionOrder(dataset, left.regionId) - regionOrder(dataset, right.regionId);
    });
  } else if (query.excludeAggregate) {
    displayed = matched.filter((cell) => !isAggregate(dataset, cell.regionId));
  }

  return { ok: true, matched, displayed, omittedFromOrder: query.order === "report" && !query.excludeAggregate ? [] : omittedFromOrder };
}

function regionOrder(dataset: EvidenceDataset, regionId: string): number {
  return dataset.regions.find((region) => region.id === regionId)?.reportOrder ?? 999;
}

function isAggregate(dataset: EvidenceDataset, regionId: string): boolean {
  return dataset.regions.find((region) => region.id === regionId)?.role === "aggregate";
}

export function regionName(dataset: EvidenceDataset, regionId: string): string {
  return dataset.regions.find((region) => region.id === regionId)?.name ?? regionById(regionId)?.name ?? regionId;
}
