export interface Settings {
  rewindSeconds: number;
  gapThresholdSeconds: number;
  hudOpacityIdle: number;
  timelineSeconds: number;
}

export const DEFAULTS: Settings = {
  rewindSeconds: 1.0,
  gapThresholdSeconds: 0.5,
  hudOpacityIdle: 0.4,
  timelineSeconds: 30,
};

const RANGES: { [K in keyof Settings]: [number, number] } = {
  rewindSeconds: [0.0, 5.0],
  gapThresholdSeconds: [0.1, 1.0],
  hudOpacityIdle: [0.1, 1.0],
  timelineSeconds: [10, 60],
};

const clamp = (key: keyof Settings, value: number): number => {
  const [min, max] = RANGES[key];
  if (Number.isNaN(value)) return DEFAULTS[key];
  return Math.min(max, Math.max(min, value));
};

const sanitize = (raw: Partial<Settings>): Settings => {
  const out: Settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = raw[key];
    if (typeof v === "number") {
      out[key] = clamp(key, v);
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
  const v = clamp(key, value as number) as Settings[K];
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
    for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      if (key in changes) {
        const next = changes[key]?.newValue;
        if (typeof next === "number") {
          (patch[key] as number) = clamp(key, next);
        }
      }
    }
    if (Object.keys(patch).length > 0) cb(patch);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};
