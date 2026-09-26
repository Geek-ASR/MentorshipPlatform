/** docs/10 §7.4: "One appeal per action, within 30 days". */
export const APPEAL_WINDOW_DAYS = 30;

export function isWithinAppealWindow(actionCreatedAt: Date, now: Date): boolean {
  return now.getTime() - actionCreatedAt.getTime() <= APPEAL_WINDOW_DAYS * 86_400_000;
}
