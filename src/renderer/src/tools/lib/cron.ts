import { CronExpressionParser } from 'cron-parser';

/** Next `count` run times (1-50) of a cron expression. Throws on an invalid expression. */
export function getNextOccurrences(expression: string, count = 5): string[] {
  const n = Math.max(1, Math.min(50, Math.floor(Number(count) || 5)));
  const interval = CronExpressionParser.parse(expression);
  const dates: string[] = [];
  for (let i = 0; i < n; i++) dates.push(interval.next().toDate().toString());
  return dates;
}
