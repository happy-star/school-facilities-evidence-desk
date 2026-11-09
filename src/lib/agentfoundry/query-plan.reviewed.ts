/**
 * Reviewed correction of the AgentFoundry file.
 * This is not unedited IDE output.
 *
 * The original create_file result remains byte-for-byte at
 * evidence/agentfoundry-ide-2026-11-09/query-plan.ts
 * (12210 bytes, SHA-256 eb251f01b91859f6668b9f4593b2db2694a3256b4419d958d9977ee3b9756820).
 *
 * The corrections address the static review recorded at commit d6c70d6:
 * plural "toilets", the "printed" injection false positive, two indicators,
 * a current-status request that also names 2022-23, causal wording, and
 * private or unaided management. This function still returns no statistics.
 * The server owns citations, denominators, and zero-denominator readings.
 */

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

const STATE_AND_UT_IDS = REGION_IDS.filter((id) => id !== "india");

const REJECTED = [
  "no_code_execution",
  "no_cross_indicator_subtraction",
  "no_causal_estimate",
  "no_invented_numbers",
] as const;

const ALIASES: { phrase: string; id: string; note: string }[] = [
  { phrase: "andaman and nicobar", id: "andaman-and-nicobar-islands", note: "Andaman was read as the printed row Andaman & Nicobar Islands." },
  { phrase: "andaman", id: "andaman-and-nicobar-islands", note: "Andaman was read as the printed row Andaman & Nicobar Islands." },
  { phrase: "dadra and nagar haveli", id: "dadra-and-nagar-haveli-and-daman-and-diu", note: "The booklet prints one combined row for Dadra & Nagar Haveli and Daman & Diu." },
  { phrase: "daman and diu", id: "dadra-and-nagar-haveli-and-daman-and-diu", note: "The booklet prints one combined row for Dadra & Nagar Haveli and Daman & Diu." },
  { phrase: "dadra", id: "dadra-and-nagar-haveli-and-daman-and-diu", note: "The booklet prints one combined row for Dadra & Nagar Haveli and Daman & Diu." },
  { phrase: "daman", id: "dadra-and-nagar-haveli-and-daman-and-diu", note: "The booklet prints one combined row for Dadra & Nagar Haveli and Daman & Diu." },
  { phrase: "orissa", id: "odisha", note: "The booklet prints Odisha." },
  { phrase: "pondicherry", id: "puducherry", note: "The booklet prints Puducherry." },
  { phrase: "jammu and kashmir", id: "jammu-and-kashmir", note: "Jammu and Kashmir was read as the printed row Jammu & Kashmir." },
];

type RegionHit = { id: string; start: number; note?: string };

export function planQuestion(question: string): QueryPlan {
  const assumptions: string[] = [];
  const rejectedOperations = [...REJECTED];
  const text = normalize(question ?? "");
  if (!text) {
    return unsupported("The question is empty.", assumptions, rejectedOperations);
  }
  if (isPromptInjection(text)) {
    return {
      status: "refused",
      code: "prompt_injection",
      reason: "The question asks to ignore the rules or to run code or SQL. No plan is returned.",
      assumptions,
      rejectedOperations,
    };
  }
  if (requestsOtherYear(text)) {
    return {
      status: "refused",
      code: "other_year",
      reason: "Only the historical year 2022-23 can be planned. A current status or another year is refused.",
      assumptions,
      rejectedOperations,
    };
  }
  if (isCausal(text)) {
    return {
      status: "refused",
      code: "causal",
      reason: "Causal claims are refused. No percentage is planned.",
      assumptions,
      rejectedOperations,
    };
  }
  if (isStudentInference(text)) {
    return {
      status: "refused",
      code: "student_inference",
      reason: "Student or enrolment counts are not planned from a facility indicator.",
      assumptions,
      rejectedOperations,
    };
  }
  const indicators = indicatorsMentioned(text);
  if (indicators.length > 1) {
    return {
      status: "refused",
      code: "cross_indicator",
      reason: "Girls, boys, and CWSN-friendly indicators use different populations and are not combined.",
      assumptions,
      rejectedOperations,
    };
  }
  if (isToiletCount(text)) {
    return {
      status: "refused",
      code: "toilet_count",
      reason: "Counts of toilets or seats are refused. The unit is schools with a facility, and that count is not planned here.",
      assumptions,
      rejectedOperations,
    };
  }

  if (/\bweather\b/.test(text)) {
    return unsupported("Weather is outside the three historical facility indicators.", assumptions, rejectedOperations);
  }
  if (/\b(data quality|warnings?|anomal(?:y|ies))\b/.test(text)) {
    return { status: "explain", operation: "quality", indicatorId: null, assumptions, rejectedOperations };
  }

  const wantsSchoolCount = /\b(how many schools|number of schools|published count|numerator)\b/.test(text);
  if (/\bdenominator\b/.test(text) && !wantsSchoolCount) {
    return {
      status: "explain",
      operation: "denominator",
      indicatorId: indicators[0] ?? null,
      assumptions,
      rejectedOperations,
    };
  }
  if (indicators.length === 0) {
    return unsupported("Name girls toilets, boys toilets, or CWSN-friendly toilets.", assumptions, rejectedOperations);
  }

  const indicatorId = indicators[0];
  if (!indicatorId) {
    return unsupported("Name girls toilets, boys toilets, or CWSN-friendly toilets.", assumptions, rejectedOperations);
  }
  const regions = findRegions(text);
  for (const region of regions) {
    if (region.note && !assumptions.includes(region.note)) assumptions.push(region.note);
  }
  const management = findManagement(text);
  if (management.note) assumptions.push(management.note);

  const asksWhich = /\bwhich states?\b/.test(text) || /\bwhich ut\b/.test(text);
  const wantsLowest = /\b(lowest|smallest|fewest)\b/.test(text);
  const wantsHighest = /\b(highest|largest)\b/.test(text) || (asksWhich && !wantsLowest);
  if (wantsLowest && wantsHighest) {
    return unsupported("The question asks for both a lowest and a highest value.", assumptions, rejectedOperations);
  }
  const wantsOrder = wantsLowest || wantsHighest;
  const wantsCompare = /\b(compare|comparison|across)\b/.test(text);

  if (wantsOrder) {
    return plan("order", {
      indicatorId,
      year: "2022-23",
      regionIds: [...STATE_AND_UT_IDS],
      managementId: management.id ?? assumedManagement(assumptions),
      order: wantsLowest ? "printed_asc" : "printed_desc",
      excludeAggregate: true,
    }, assumptions, rejectedOperations);
  }
  if (wantsCompare || /\brank\b/.test(text)) {
    const ranking = /\brank\b/.test(text) && !wantsCompare;
    return plan(ranking ? "order" : "compare", {
      indicatorId,
      year: "2022-23",
      regionIds: [...STATE_AND_UT_IDS],
      managementId: management.id ?? assumedManagement(assumptions),
      order: ranking ? "printed_desc" : "report",
      excludeAggregate: true,
    }, assumptions, rejectedOperations);
  }

  const regionIds = regions.map((region) => region.id);
  if (regionIds.length === 0) {
    regionIds.push("india");
    assumptions.push("No geography was named. India, the aggregate, was selected.");
  } else if (regionIds.length > 1) {
    assumptions.push("More than one geography was named. Each matched id is included and none was dropped.");
  }
  if (!management.id) assumedManagement(assumptions);

  const operation = operationFor(text);
  return plan(operation, {
    indicatorId,
    year: "2022-23",
    regionIds,
    managementId: management.id ?? "all_management",
    order: "report",
    excludeAggregate: false,
  }, assumptions, rejectedOperations);
}

function plan(
  operation: "cell" | "compare" | "order" | "zero" | "source" | "counts",
  query: ReadOnlyQuery,
  assumptions: string[],
  rejectedOperations: string[],
): QueryPlan {
  return { status: "plan", operation, query, assumptions, rejectedOperations };
}

function operationFor(text: string): "cell" | "zero" | "source" | "counts" {
  if (/\b(how many schools|number of schools|published count|numerator)\b/.test(text)) return "counts";
  if (/\bprinted 0\b/.test(text) || /\bdenominator is zero\b/.test(text) || (/\bzero\b/.test(text) && /\b(why|printed|undefined)\b/.test(text))) {
    return "zero";
  }
  if (/\b(source|where does|come from|which table|which page|citation)\b/.test(text)) return "source";
  return "cell";
}

function assumedManagement(assumptions: string[]): ManagementId {
  assumptions.push("No management was named. All management was selected.");
  return "all_management";
}

function unsupported(reason: string, assumptions: string[], rejectedOperations: string[]): QueryPlan {
  return { status: "unsupported", reason, assumptions, rejectedOperations };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'"“”]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPromptInjection(text: string): boolean {
  return (
    /\bignore previous\b/.test(text) ||
    /\bignore all instructions\b/.test(text) ||
    /\bignore instructions\b/.test(text) ||
    /\b(run|execute) sql\b/.test(text) ||
    /\b(run|execute) code\b/.test(text) ||
    /\b(run|execute) command\b/.test(text) ||
    /\byou are now\b/.test(text)
  );
}

function requestsOtherYear(text: string): boolean {
  if (/\b(current|today|now|latest)\b/.test(text)) return true;
  const withoutAllowed = text.replace(/2022-23/g, " ");
  return /\b20\d{2}\b/.test(withoutAllowed);
}

function isCausal(text: string): boolean {
  return /\b(cause|caused|causes|causal|impact|impacts|impacted|because|due to|lead to|leads to|led to|result in|resulted in)\b/.test(text);
}

function isStudentInference(text: string): boolean {
  return /\b(student|students|pupil|pupils|enrolment|enrollment|enroll|enrol)\b/.test(text);
}

function isToiletCount(text: string): boolean {
  if (/\b(how many schools|number of schools|count of schools)\b/.test(text)) return false;
  return (/\bhow many\b/.test(text) || /\bnumber of\b/.test(text) || /\bcount of\b/.test(text)) && /\btoilets?\b/.test(text);
}

function indicatorsMentioned(text: string): IndicatorId[] {
  const found: IndicatorId[] = [];
  if (/\bcwsn\b/.test(text) || /\bspecial needs\b/.test(text) || /\bcwsn-friendly\b/.test(text)) {
    found.push("functional_cwsn_toilet_pct");
  }
  if (/\bgirls?\b/.test(text) && /\btoilets?\b/.test(text)) found.push("functional_girls_toilet_pct");
  if (/\bboys?\b/.test(text) && /\btoilets?\b/.test(text)) found.push("functional_boys_toilet_pct");
  return found;
}

function findManagement(text: string): { id?: ManagementId; note?: string } {
  if (/\ball management\b/.test(text) || /\boverall\b/.test(text)) return { id: "all_management" };
  if (/\bother central government\b/.test(text) || /\bother central\b/.test(text)) return { id: "other_central_government" };
  if (/\bstate government\b/.test(text) || /\bstate govt\b/.test(text)) return { id: "state_government" };
  if (/\bgovernment aided\b/.test(text) || /\bgovt aided\b/.test(text)) return { id: "government_aided" };
  if (/\bprivate unaided\b/.test(text) || /\bunaided\b/.test(text) || /\bprivate\b/.test(text)) {
    const explicit = /\bprivate unaided\b/.test(text);
    return {
      id: "private_unaided_recognized",
      note: explicit ? undefined : "Private or unaided was read as private unaided recognized.",
    };
  }
  if (/\bkvs\b/.test(text)) return { id: "kvs" };
  if (/\bnvs\b/.test(text)) return { id: "nvs" };
  if (/\bgovernment total\b/.test(text) || /\bgovernment schools\b/.test(text) || /\bgovernment\b/.test(text)) {
    const explicit = /\bgovernment total\b/.test(text) || /\bgovernment schools\b/.test(text);
    return {
      id: "government_total",
      note: explicit ? undefined : "Government was read as government total, the parent aggregate, not state government.",
    };
  }
  if (/\bothers\b/.test(text) || /\bother management\b/.test(text)) return { id: "others" };
  return {};
}

function findRegions(text: string): RegionHit[] {
  const phrases = [
    ...REGION_IDS.map((id) => ({ phrase: id === "india" ? "india" : id.replace(/-/g, " "), id, note: undefined as string | undefined })),
    ...ALIASES.map((alias) => ({ phrase: alias.phrase, id: alias.id, note: alias.note })),
  ].sort((left, right) => right.phrase.length - left.phrase.length);
  const occupied = new Array<boolean>(text.length).fill(false);
  const found: RegionHit[] = [];
  for (const candidate of phrases) {
    const expression = new RegExp(`\\b${escapeRegExp(candidate.phrase)}\\b`, "g");
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (occupied.slice(start, end).some(Boolean)) continue;
      for (let index = start; index < end; index += 1) occupied[index] = true;
      found.push({ id: candidate.id, start, note: candidate.note });
    }
  }
  found.sort((left, right) => left.start - right.start);
  const unique: RegionHit[] = [];
  for (const hit of found) {
    if (!unique.some((item) => item.id === hit.id)) unique.push(hit);
  }
  return unique;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
