export type IssueSeverity = "error" | "warning" | "info";

export type Issue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  tableId?: string;
  physicalPage?: number;
  regionId?: string;
  managementId?: string;
  indicatorId?: string;
};

export function issue(partial: Issue): Issue {
  return partial;
}
