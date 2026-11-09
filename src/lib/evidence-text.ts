const STRUCTURAL_NUMBERS = new Set<string>([
  ...Array.from({ length: 26 }, (_, index) => String(index + 1)),
  "2022",
  "23",
  "7.3",
  "7.4",
  "7.5",
  "7.12",
  "8.8",
  "8.9",
  "8.10",
  "124",
  "125",
  "126",
  "127",
  "136",
  "137",
  "159",
  "160",
  "161",
  "185",
]);

/**
 * Answers may contain structural identifiers (table, page, column, year)
 * and numbers explicitly quoted from cells, counts, or stored warning text.
 */
export class EvidenceText {
  private readonly chunks: string[] = [];
  private readonly allowed = new Set<string>(STRUCTURAL_NUMBERS);

  add(text: string): this {
    this.chunks.push(text);
    return this;
  }

  /** Append text and allow every number that already occurs inside it. */
  quote(text: string): this {
    this.chunks.push(text);
    for (const match of text.match(/\d+(?:\.\d+)?/g) ?? []) {
      this.allowed.add(match);
    }
    return this;
  }

  finish(): string {
    const answer = this.chunks.join("");
    const found = answer.match(/\d+(?:\.\d+)?/g) ?? [];
    const unexpected = found.filter((value) => !this.allowed.has(value));
    if (unexpected.length > 0) {
      throw new Error(`Evidence binding failed. Numbers not taken from a cited cell, count, warning, or structural identifier: ${unexpected.join(", ")}`);
    }
    return answer;
  }
}
