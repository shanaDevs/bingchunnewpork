/** Strip the "Bing Chun -" store prefix for compact UI labels. */
export function shortBranchName(name: string) {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

export function normalizeBranchName(name: string) {
  return shortBranchName(name).toLowerCase();
}
