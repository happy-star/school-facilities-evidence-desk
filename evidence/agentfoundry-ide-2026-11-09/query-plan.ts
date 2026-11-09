// query-plan.ts
// Deterministic, dependency-free TypeScript query planner implementing the
// contract in BUILD_SPEC.md and QUERY_PLAN_CONTRACT.md.

export type IndicatorId =
  | "functional_girls_toilet_pct"
  | "functional_boys_toilet_pct"
  | "functional_cwsn_toilet_pct";

export type ManagementId =
  | "all_management"
  | "government_total"
  | "kvs"
  | "nvs"
  | "other_central_government"
  | "state_government"
  | "government_aided"
  | "private_unaided_recognized"
  | "others";

export type ReadOnlyQuery = {
  indicatorId: IndicatorId;
  year: "2022-23";
  regionIds: string[];
  managementId: ManagementId;
  order: "report" | "printed_asc" | "printed_desc";
  excludeAggregate: boolean;
};

export type QueryPlan =
  | {
      status: "plan";
      operation: "cell" | "compare" | "order" | "zero" | "source" | "counts";
      query: ReadOnlyQuery;
      assumptions: string[];
      rejectedOperations: string[];
    }
  | {
      status: "explain";
      operation: "denominator" | "quality";
      indicatorId: IndicatorId | null;
      assumptions: string[];
      rejectedOperations: string[];
    }
  | {
      status: "refused";
      code:
        | "causal"
        | "other_year"
        | "student_inference"
        | "toilet_count"
        | "cross_indicator"
        | "prompt_injection";
      reason: string;
      assumptions: string[];
      rejectedOperations: string[];
    }
  | {
      status: "unsupported";
      reason: string;
      assumptions: string[];
      rejectedOperations: string[];
    };

const REGION_IDS = [
  "india",
  "andaman-and-nicobar-islands",
  "andhra-pradesh",
  "arunachal-pradesh",
  "assam",
  "bihar",
  "chandigarh",
  "chhattisgarh",
  "dadra-and-nagar-haveli-and-daman-and-diu",
  "delhi",
  "goa",
  "gujarat",
  "haryana",
  "himachal-pradesh",
  "jammu-and-kashmir",
  "jharkhand",
  "karnataka",
  "kerala",
  "ladakh",
  "lakshadweep",
  "madhya-pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "puducherry",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil-nadu",
  "telangana",
  "tripura",
  "uttar-pradesh",
  "uttarakhand",
  "west-bengal",
] as const;

const STATES_AND_UTS = REGION_IDS.filter((r) => r !== "india");

const MANAGEMENT_IDS: ManagementId[] = [
  "all_management",
  "government_total",
  "state_government",
  "other_central_government",
  "government_aided",
  "private_unaided_recognized",
  "kvs",
  "nvs",
  "others",
];

const INDICATORS: IndicatorId[] = [
  "functional_girls_toilet_pct",
  "functional_boys_toilet_pct",
  "functional_cwsn_toilet_pct",
];

const DEFAULT_REJECTED_OPERATIONS = [
  "no_code_execution",
  "no_cross_indicator_subtraction",
  "no_causal_estimate",
  "no_invented_numbers",
];

const REGION_ALIAS_MAP: { [alias: string]: string } = {
  andaman: "andaman-and-nicobar-islands",
  "andaman and nicobar": "andaman-and-nicobar-islands",
  dadra: "dadra-and-nagar-haveli-and-daman-and-diu",
  daman: "dadra-and-nagar-haveli-and-daman-and-diu",
  orissa: "odisha",
  pondicherry: "puducherry",
  "jammu & kashmir": "jammu-and-kashmir",
  "jammu and kashmir": "jammu-and-kashmir",
  "uttar pradesh": "uttar-pradesh",
  "tamil nadu": "tamil-nadu",
  "west bengal": "west-bengal",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"“”]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRegion(text: string): { region?: string; aliasUsed?: string } {
  for (const slug of REGION_IDS) {
    if (slug === "india") {
      if (/\bindia\b/.test(text)) return { region: "india" };
      continue;
    }
    const readable = slug.replace(/-/g, " ");
    if (new RegExp(`\\b${escapeRegExp(readable)}\\b`).test(text)) return { region: slug };
  }
  for (const aliasRaw in REGION_ALIAS_MAP) {
    const alias = aliasRaw.toLowerCase();
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(text)) return { region: REGION_ALIAS_MAP[aliasRaw], aliasUsed: aliasRaw };
  }
  return {};
}

function findManagement(text: string): ManagementId | undefined {
  if (/\ball management\b/.test(text) || /\boverall\b/.test(text)) return "all_management";
  if (/\bstate government\b/.test(text) || /\bstate govt\b/.test(text)) return "state_government";
  if (/\bother central government\b/.test(text)) return "other_central_government";
  if (/\bgovernment aided\b/.test(text) || /\baided\b/.test(text)) return "government_aided";
  if (/\bprivate\b/.test(text) && /\bunaided\b/.test(text)) return "private_unaided_recognized";
  if (/\bkvs\b/.test(text)) return "kvs";
  if (/\bnvs\b/.test(text)) return "nvs";
  if (/\bgovernment\b/.test(text) && !/\bstate\b/.test(text)) return "government_total";
  if (/\bother\b/.test(text)) return "others";
  return undefined;
}

function findIndicator(text: string): IndicatorId | undefined {
  if (/\bgirls\b/.test(text) && /\btoilet\b/.test(text)) return "functional_girls_toilet_pct";
  if (/\bboys\b/.test(text) && /\btoilet\b/.test(text)) return "functional_boys_toilet_pct";
  if (/\bcwsn\b/.test(text) || /\bspecial needs\b/.test(text) || /\bcwsn-friendly\b/.test(text)) return "functional_cwsn_toilet_pct";
  if (/\bfunctional\b/.test(text) && /\btoilet\b/.test(text) && /\bgirls\b/.test(text)) return "functional_girls_toilet_pct";
  if (/\bfunctional\b/.test(text) && /\btoilet\b/.test(text) && /\bboys\b/.test(text)) return "functional_boys_toilet_pct";
  return undefined;
}

export function planQuestion(question: string): QueryPlan {
  const raw = question || "";
  const text = normalize(raw);
  const assumptions: string[] = [];
  const rejectedOperations = [...DEFAULT_REJECTED_OPERATIONS];

  // Prompt injection detection
  const inj = [
    "ignore previous",
    "ignore instructions",
    "ignore all instructions",
    "run sql",
    "execute sql",
    "run code",
    "execute code",
    "run command",
    "print",
    "show me the figure",
  ];
  for (const k of inj) if (text.includes(k)) return { status: "refused", code: "prompt_injection", reason: "The question contains instructions to ignore rules or execute code; refusing for safety.", assumptions, rejectedOperations };

  // Domain-level unsupported: weather and timing
  if (/\bweather\b/.test(text) || /\bforecast\b/.test(text)) {
    return { status: "unsupported", reason: "This desk only plans queries against historical school-facilities indicators.", assumptions, rejectedOperations };
  }

  // Year handling: only allow explicit 2022-23. If question asks for current or any other explicit year refuse.
  if (!/2022-23/.test(raw)) {
    if (/\bcurrent\b/.test(text) || /\btoday\b/.test(text) || /\bnow\b/.test(text) || /\b20\d{2}\b/.test(raw)) {
      return { status: "refused", code: "other_year", reason: "Only year '2022-23' is supported by this planner.", assumptions, rejectedOperations };
    }
  }

  // Causal detection
  if (/\bcause\b/.test(text) || /\bcaused\b/.test(text) || /\blead to\b/.test(text) || /\bresult in\b/.test(text)) {
    if (/\btoilet\b/.test(text) || /\benrol|enroll|enrolment|enrollment\b/.test(text)) {
      return { status: "refused", code: "causal", reason: "Causal claims are refused.", assumptions, rejectedOperations };
    }
  }

  // Student inference
  if (/\benrol|enroll|enrolment|enrollment|students|pupils\b/.test(text)) {
    return { status: "refused", code: "student_inference", reason: "Inferring student counts or enrolment from facility indicators is refused.", assumptions, rejectedOperations };
  }

  // Toilet count explicit refusal
  if (/\bhow many\b/.test(text) && /\btoilet\b/.test(text)) {
    return { status: "refused", code: "toilet_count", reason: "Counts of toilets or seats are refused by the planner.", assumptions, rejectedOperations };
  }

  // Cross-indicator subtraction or difference
  if (/\bdifference\b/.test(text) || /\bminus\b/.test(text) || /\bminus\b/.test(text) || (/\bbetween\b/.test(text) && /\bgirls\b/.test(text) && /\bboys\b/.test(text))) {
    return { status: "refused", code: "cross_indicator", reason: "Cross-indicator operations are refused.", assumptions, rejectedOperations };
  }

  // Explain operations
  if (/\bdenominator\b/.test(text) || /what is the denominator/.test(text)) {
    const ind = findIndicator(text) || null;
    return { status: "explain", operation: "denominator", indicatorId: ind, assumptions, rejectedOperations };
  }
  if (/\bdata quality\b/.test(text) || /\bquality\b/.test(text) || /\bwarnings?\b/.test(text)) {
    return { status: "explain", operation: "quality", indicatorId: null, assumptions, rejectedOperations };
  }

  // Indicator detection
  const indicator = findIndicator(text);

  // Region detection
  const regionMatch = findRegion(text);
  let regionIds: string[] = regionMatch.region ? [regionMatch.region] : [];
  if (regionMatch.aliasUsed) assumptions.push(`Interpreted "${regionMatch.aliasUsed}" as "${regionMatch.region}".`);

  // Management detection
  const mgmt = findManagement(text);
  let managementId: ManagementId | undefined = mgmt;

  // Operation intent
  const wantsCompare = /\bcompare\b/.test(text) || /\bcomparison\b/.test(text) || /\bacross states\b/.test(text) || /\brank\b/.test(text);
  const wantsWhichState = /\bwhich state\b/.test(text) || /\bwhich states\b/.test(text) || /\bwhich region\b/.test(text);
  const wantsHighest = /\bhighest\b/.test(text) || /\blargest\b/.test(text) || /\bmost\b/.test(text) || wantsWhichState;
  const wantsLowest = /\blowest\b/.test(text) || /\bsmallest\b/.test(text) || /\bfewest\b/.test(text);

  // Order/compare handling
  if (wantsCompare || wantsHighest || wantsLowest) {
    if (!indicator) return { status: "unsupported", reason: "Indicator not specified; please ask about girls, boys, or CWSN-friendly toilets.", assumptions, rejectedOperations };
    const q: ReadOnlyQuery = {
      indicatorId: indicator,
      year: "2022-23",
      regionIds: STATES_AND_UTS.slice(),
      managementId: managementId || "all_management",
      order: wantsLowest ? "printed_asc" : wantsHighest ? "printed_desc" : "report",
      excludeAggregate: true,
    };
    const op: "compare" | "order" = wantsCompare ? "compare" : "order";
    return { status: "plan", operation: op, query: q, assumptions, rejectedOperations };
  }

  // zero/source/counts operations if explicitly requested
  if (/\bsource\b/.test(text) || /\bzero\b/.test(text) || /\bcounts?\b/.test(text)) {
    if (!indicator) return { status: "unsupported", reason: "Indicator not specified; please ask about girls, boys, or CWSN-friendly toilets.", assumptions, rejectedOperations };
    if (regionIds.length === 0) {
      regionIds = ["india"];
      assumptions.push("No geography named; using the aggregate 'india'.");
    }
    if (!managementId) {
      managementId = "all_management";
      assumptions.push("No management named; using 'all_management'.");
    }
    const op: "zero" | "source" | "counts" = /\bsource\b/.test(text) ? "source" : /\bzero\b/.test(text) ? "zero" : "counts";
    const q: ReadOnlyQuery = {
      indicatorId: indicator,
      year: "2022-23",
      regionIds,
      managementId,
      order: "report",
      excludeAggregate: false,
    };
    return { status: "plan", operation: op, query: q, assumptions, rejectedOperations };
  }

  // Default single-cell handling
  if (!indicator) return { status: "unsupported", reason: "Could not determine which indicator was requested. Please specify girls, boys, or CWSN-friendly toilets.", assumptions, rejectedOperations };

  if (regionIds.length === 0) {
    regionIds = ["india"];
    assumptions.push("No geography named; using the aggregate 'india'.");
  }
  if (!managementId) {
    managementId = "all_management";
    assumptions.push("No management named; using 'all_management'.");
  }

  const q: ReadOnlyQuery = {
    indicatorId: indicator,
    year: "2022-23",
    regionIds,
    managementId,
    order: "report",
    excludeAggregate: false,
  };

  return { status: "plan", operation: "cell", query: q, assumptions, rejectedOperations };
}
