export interface Settings {
  enabled: boolean;
  rewindSeconds: number;
  gapThresholdSeconds: number;
  hudOpacityIdle: number;
  timelineSeconds: number;
}

export const DEFAULTS: Settings = {
  enabled: true,
  rewindSeconds: 1.0,
  gapThresholdSeconds: 0.5,
  hudOpacityIdle: 0.4,
  timelineSeconds: 30,
};

const NUMERIC_RANGES: { [k: string]: [number, number] } = {
  rewindSeconds: [0.0, 5.0],
  gapThresholdSeconds: [0.1, 1.0],
  hudOpacityIdle: [0.1, 1.0],
  timelineSeconds: [10, 60],
};

const clampNumeric = (key: string, value: number): number => {
  const range = NUMERIC_RANGES[key];
  if (!range) return value;
  if (Number.isNaN(value)) return DEFAULTS[key as keyof Settings] as number;
  return Math.min(range[1], Math.max(range[0], value));
};

const sanitize = (raw: Partial<Settings>): Settings => {
  const out: Settings = { ...DEFAULTS };
  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  for (const key of Object.keys(NUMERIC_RANGES)) {
    const v = raw[key as keyof Settings];
    if (typeof v === "number") {
      (out as unknown as Record<string, number>)[key] = clampNumeric(key, v);
    }
  }
  return out;
};

export const loadSettings = async (): Promise<Settings> => {
  try {
    const raw = await chrome.storage.sync.get(DEFAULTS);
    return sanitize(raw as Partial<Settings>);
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveSetting = async <K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<Settings[K]> => {
  let v: Settings[K] = value;
  if (typeof value === "number") {
    v = clampNumeric(key, value) as Settings[K];
  }
  try {
    await chrome.storage.sync.set({ [key]: v });
  } catch {
    // ignore
  }
  return v;
};

export const onSettingsChanged = (
  cb: (changes: Partial<Settings>) => void,
): (() => void) => {
  const handler = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName,
  ) => {
    if (area !== "sync") return;
    const patch: Partial<Settings> = {};
    if ("enabled" in changes && typeof changes.enabled?.newValue === "boolean") {
      patch.enabled = changes.enabled.newValue;
    }
    for (const key of Object.keys(NUMERIC_RANGES)) {
      if (key in changes) {
        const next = changes[key]?.newValue;
        if (typeof next === "number") {
          (patch as unknown as Record<string, number>)[key] = clampNumeric(
            key,
            next,
          );
        }
      }
    }
    if (Object.keys(patch).length > 0) cb(patch);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};
