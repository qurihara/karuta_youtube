const PREFIX = "[karuta]";

const isDebug = () => {
  try {
    return new URLSearchParams(location.search).has("karuta-debug");
  } catch {
    return false;
  }
};

export const log = (...args: unknown[]) => {
  if (isDebug()) {
    console.log(PREFIX, ...args);
  }
};

export const warn = (...args: unknown[]) => {
  console.warn(PREFIX, ...args);
};

export const error = (...args: unknown[]) => {
  console.error(PREFIX, ...args);
};
