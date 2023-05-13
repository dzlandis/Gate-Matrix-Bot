// Sourced and modified from @lukeed/ms
// https://github.com/lukeed/ms/blob/b2d295408f18bfd47a43ebf4de5e6ce21468e7d0/src/index.js
// Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

const SEC = 1e3,
  MIN = SEC * 60,
  HOUR = MIN * 60,
  DAY = HOUR * 24,
  YEAR = DAY * 365.25;

function fmt(val: number, pfx: string, str: string, long?: boolean) {
  const num = (val | 0) === val ? val : ~~(val + 0.5);
  return pfx + num + (long ? ' ' + str + (num != 1 ? 's' : '') : str[0]);
}

export function format(num: number, long?: boolean) {
  const pfx = num < 0 ? '-' : '',
    abs = num < 0 ? -num : num;
  if (abs < SEC) return num + (long ? ' ms' : 'ms');
  if (abs < MIN) return fmt(abs / SEC, pfx, 'second', long);
  if (abs < HOUR) return fmt(abs / MIN, pfx, 'minute', long);
  if (abs < DAY) return fmt(abs / HOUR, pfx, 'hour', long);
  if (abs < YEAR) return fmt(abs / DAY, pfx, 'day', long);
  return fmt(abs / YEAR, pfx, 'year', long);
}
