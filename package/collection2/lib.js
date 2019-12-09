export function fromEntries(entries) {
  return entries.reduce((obj, [key, value]) => ((obj[key] = value), obj), {});
}

export function removeQueryOperators(selector) {
  return fromEntries(
    Object.entries(selector).filter(([key, value]) => {
      return !(
        key.startsWith("$") ||
        (value && Object.keys(value).some(subKey => subKey.startsWith("$")))
      );
    })
  );
}
