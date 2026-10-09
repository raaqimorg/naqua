// UTC day numbers avoid timezone and daylight-saving shifts.

const MS_PER_DAY = 86_400_000;

export interface YearSegment {
  year: number;
  days: number;
}

export const dayNumber = (year: number, month: number, day: number): number =>
  Date.UTC(year, month - 1, day) / MS_PER_DAY;

export const yearOfDay = (day: number): number => new Date(day * MS_PER_DAY).getUTCFullYear();

// Reject invalid dates instead of allowing Date.UTC to roll them into the next month.
export const parseIsoDate = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? dayNumber(year, month, day) : null;
};

// The sale day is excluded; a full year ends on the following 1 January.
export const splitDateRangeIntoYears = (start: number, end: number): YearSegment[] => {
  const segments: YearSegment[] = [];
  let current = start;
  while (current < end) {
    const year = yearOfDay(current);
    const segmentEnd = Math.min(end, dayNumber(year + 1, 1, 1));
    segments.push({ year, days: segmentEnd - current });
    current = segmentEnd;
  }
  return segments;
};

// Days mode uses 365-day chunks regardless of leap years.
export const splitDaysIntoYears = (startYear: number, totalDays: number): YearSegment[] => {
  const segments: YearSegment[] = [];
  let remaining = totalDays;
  let year = startYear;
  while (remaining > 0) {
    const days = Math.min(remaining, 365);
    segments.push({ year, days });
    remaining -= days;
    year++;
  }
  return segments;
};
