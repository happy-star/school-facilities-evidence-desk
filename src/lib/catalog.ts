import { KNOWN_PAGES } from "@/lib/official-source";

export const INDICATOR_IDS = [
  "functional_girls_toilet_pct",
  "functional_boys_toilet_pct",
  "functional_cwsn_toilet_pct",
] as const;

export type IndicatorId = (typeof INDICATOR_IDS)[number];

export const MANAGEMENT_IDS = [
  "all_management",
  "government_total",
  "kvs",
  "nvs",
  "other_central_government",
  "state_government",
  "government_aided",
  "private_unaided_recognized",
  "others",
] as const;

export type ManagementId = (typeof MANAGEMENT_IDS)[number];

export type GeographyRole = "aggregate" | "state_ut";

export type RegionDef = {
  id: string;
  name: string;
  role: GeographyRole;
  reportOrder: number;
};

/**
 * Printed column (8) is absent on tables 8.8, 8.9, and 8.10.
 * The ninth numeric token is source column (11), not a shifted (10).
 */
export const PERCENTAGE_COLUMNS: readonly {
  managementId: ManagementId;
  sourceColumn: number;
  broad: boolean;
}[] = [
  { managementId: "all_management", sourceColumn: 2, broad: true },
  { managementId: "government_total", sourceColumn: 3, broad: true },
  { managementId: "kvs", sourceColumn: 4, broad: false },
  { managementId: "nvs", sourceColumn: 5, broad: false },
  { managementId: "other_central_government", sourceColumn: 6, broad: false },
  { managementId: "state_government", sourceColumn: 7, broad: false },
  { managementId: "government_aided", sourceColumn: 9, broad: true },
  { managementId: "private_unaided_recognized", sourceColumn: 10, broad: true },
  { managementId: "others", sourceColumn: 11, broad: true },
];

export const PERCENTAGE_INDEX_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11] as const;

/** Count tables 7.3, 7.4, and 7.12 do use column (8). That is a different table. */
export const COUNT_INDEX_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

/** Continuation pages print the geography column (1) and then percentage columns (17)–(26). */
export const CONTINUED_INDEX_SEQUENCE = [1, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] as const;

export const BROAD_COUNT_FIELDS = [
  { managementId: "all_management" as const, denominatorIndex: 0, numeratorIndex: 10, denominatorColumn: 2, numeratorColumn: 12 },
  { managementId: "government_total" as const, denominatorIndex: 1, numeratorIndex: 11, denominatorColumn: 3, numeratorColumn: 13 },
  { managementId: "government_aided" as const, denominatorIndex: 2, numeratorIndex: 12, denominatorColumn: 4, numeratorColumn: 14 },
  { managementId: "private_unaided_recognized" as const, denominatorIndex: 3, numeratorIndex: 13, denominatorColumn: 5, numeratorColumn: 15 },
  { managementId: "others" as const, denominatorIndex: 4, numeratorIndex: 14, denominatorColumn: 6, numeratorColumn: 16 },
];

/** Functional percentages on the continued pages are columns (22)–(26), tokens 6–10. */
export const CONTINUED_FUNCTIONAL_FIELDS = [
  { managementId: "all_management" as const, valueIndex: 5, sourceColumn: 22 },
  { managementId: "government_total" as const, valueIndex: 6, sourceColumn: 23 },
  { managementId: "government_aided" as const, valueIndex: 7, sourceColumn: 24 },
  { managementId: "private_unaided_recognized" as const, valueIndex: 8, sourceColumn: 25 },
  { managementId: "others" as const, valueIndex: 9, sourceColumn: 26 },
];

const stateNames = [
  "Andaman & Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const REGIONS: readonly RegionDef[] = [
  { id: "india", name: "India", role: "aggregate", reportOrder: 0 },
  ...stateNames.map((name, index) => ({
    id: slug(name),
    name,
    role: "state_ut" as const,
    reportOrder: index + 1,
  })),
];

export function regionKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

const REGION_BY_KEY = new Map(REGIONS.map((region) => [regionKey(region.name), region]));

export function matchRegionName(name: string): RegionDef | undefined {
  return REGION_BY_KEY.get(regionKey(name));
}

export function regionById(id: string): RegionDef | undefined {
  return REGIONS.find((region) => region.id === id);
}

export type IndicatorDef = {
  id: IndicatorId;
  label: string;
  shortLabel: string;
  unit: "percentage of schools";
  tableId: "8.8" | "8.9" | "8.10";
  physicalPage: number;
  population: string;
  numerator: string;
  countTableId: "7.4" | "7.3" | "7.12";
  countPhysicalPage: number;
  countContinuationPage: number;
  percentagePageKey: KnownPageKey;
  countPageKey: KnownPageKey;
  continuationPageKey: KnownPageKey;
  topic: "girls" | "boys" | "cwsn";
};

export type KnownPageKey =
  | "girlsPercent"
  | "boysPercent"
  | "cwsnPercent"
  | "girlsCounts"
  | "boysCounts"
  | "cwsnCounts"
  | "girlsPercentContinuation"
  | "boysPercentContinuation"
  | "cwsnPercentContinuation";

export const INDICATORS: readonly IndicatorDef[] = [
  {
    id: "functional_girls_toilet_pct",
    label: "Functional girls toilets",
    shortLabel: "Girls toilets",
    unit: "percentage of schools",
    tableId: "8.8",
    physicalPage: KNOWN_PAGES.girlsPercent,
    population:
      "Girls-only and coeducational schools for the selected geography and management. Not a count of toilets, and not a percentage of girls.",
    numerator: "Schools with a functional girls-toilet facility, not a count of toilet seats.",
    countTableId: "7.4",
    countPhysicalPage: KNOWN_PAGES.girlsCounts,
    countContinuationPage: KNOWN_PAGES.girlsPercentContinuation,
    percentagePageKey: "girlsPercent",
    countPageKey: "girlsCounts",
    continuationPageKey: "girlsPercentContinuation",
    topic: "girls",
  },
  {
    id: "functional_boys_toilet_pct",
    label: "Functional boys toilets",
    shortLabel: "Boys toilets",
    unit: "percentage of schools",
    tableId: "8.9",
    physicalPage: KNOWN_PAGES.boysPercent,
    population:
      "Boys-only and coeducational schools for the selected geography and management. Not a count of toilets, and not a percentage of boys.",
    numerator: "Schools with a functional boys-toilet facility, not a count of toilet seats.",
    countTableId: "7.3",
    countPhysicalPage: KNOWN_PAGES.boysCounts,
    countContinuationPage: KNOWN_PAGES.boysPercentContinuation,
    percentagePageKey: "boysPercent",
    countPageKey: "boysCounts",
    continuationPageKey: "boysPercentContinuation",
    topic: "boys",
  },
  {
    id: "functional_cwsn_toilet_pct",
    label: "Functional CWSN-friendly toilets",
    shortLabel: "CWSN-friendly toilets",
    unit: "percentage of schools",
    tableId: "8.10",
    physicalPage: KNOWN_PAGES.cwsnPercent,
    population:
      "Total schools for the selected geography and management. Not limited to schools that enrol children with special needs, and not a count of CWSN pupils.",
    numerator: "Schools with a functional CWSN-friendly toilet facility.",
    countTableId: "7.12",
    countPhysicalPage: KNOWN_PAGES.cwsnCounts,
    countContinuationPage: KNOWN_PAGES.cwsnPercentContinuation,
    percentagePageKey: "cwsnPercent",
    countPageKey: "cwsnCounts",
    continuationPageKey: "cwsnPercentContinuation",
    topic: "cwsn",
  },
];

export function indicatorById(id: string): IndicatorDef | undefined {
  return INDICATORS.find((indicator) => indicator.id === id);
}

export type ManagementDef = {
  id: ManagementId;
  label: string;
  shortLabel: string;
  sourceColumn: number;
  broad: boolean;
  parentAggregate: boolean;
  note: string;
};

export const MANAGEMENTS: readonly ManagementDef[] = [
  {
    id: "all_management",
    label: "All management",
    shortLabel: "All management",
    sourceColumn: 2,
    broad: true,
    parentAggregate: false,
    note: "All management groups in the table, printed as column (2).",
  },
  {
    id: "government_total",
    label: "Government total",
    shortLabel: "Government total",
    sourceColumn: 3,
    broad: true,
    parentAggregate: true,
    note: "Parent aggregate of the government group. It is not an extra category to add to KVS, NVS, other central government, or state government, and those parts are not used to replace it.",
  },
  {
    id: "kvs",
    label: "KVS",
    shortLabel: "KVS",
    sourceColumn: 4,
    broad: false,
    parentAggregate: false,
    note: "Printed as KVS. This desk does not expand the abbreviation; the booklet definition was not verified here.",
  },
  {
    id: "nvs",
    label: "NVS",
    shortLabel: "NVS",
    sourceColumn: 5,
    broad: false,
    parentAggregate: false,
    note: "Printed as NVS. This desk does not expand the abbreviation; the booklet definition was not verified here.",
  },
  {
    id: "other_central_government",
    label: "Other central government",
    shortLabel: "Other central gov.",
    sourceColumn: 6,
    broad: false,
    parentAggregate: false,
    note: "Printed inside the government group. The detailed count tables do not break this subcategory out.",
  },
  {
    id: "state_government",
    label: "State government",
    shortLabel: "State government",
    sourceColumn: 7,
    broad: false,
    parentAggregate: false,
    note: "Printed inside the government group. It is not the same column as Government total.",
  },
  {
    id: "government_aided",
    label: "Government aided",
    shortLabel: "Government aided",
    sourceColumn: 9,
    broad: true,
    parentAggregate: false,
    note: "Source column (9). There is no printed column (8) before it.",
  },
  {
    id: "private_unaided_recognized",
    label: "Private unaided recognized",
    shortLabel: "Private unaided",
    sourceColumn: 10,
    broad: true,
    parentAggregate: false,
    note: "Printed as private unaided recognized, source column (10).",
  },
  {
    id: "others",
    label: "Others",
    shortLabel: "Others",
    sourceColumn: 11,
    broad: true,
    parentAggregate: false,
    note: "Printed as Others, source column (11).",
  },
];

export function managementById(id: string): ManagementDef | undefined {
  return MANAGEMENTS.find((management) => management.id === id);
}

export function isBroadManagement(id: ManagementId): boolean {
  return MANAGEMENTS.find((management) => management.id === id)?.broad ?? false;
}
