export const toDateTimeLocalValue = (ms: number) => {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
};

export const parseDateTimeLocalValue = (value: string) => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};
