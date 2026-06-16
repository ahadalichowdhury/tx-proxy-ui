export type QualityOption = {
  id: string;
  label: string;
  height: number;
};

export function formatQualityLabel(
  height: number,
  frameRate?: number,
): string {
  if (height <= 0) {
    return "Unknown";
  }

  const base = `${height}p`;
  if (frameRate && frameRate > 31) {
    return `${base}${Math.round(frameRate)}`;
  }

  return base;
}

export function buildQualityOptionsFromHeights(
  entries: Array<{ id: string; height: number; frameRate?: number; bandwidth?: number }>,
): QualityOption[] {
  if (entries.length <= 1) {
    return [];
  }

  const byHeight = new Map<number, (typeof entries)[number]>();

  for (const entry of entries) {
    const height = entry.height > 0 ? entry.height : 0;
    const key = height || Number(entry.id);
    const existing = byHeight.get(key);

    if (!existing || (entry.bandwidth ?? 0) > (existing.bandwidth ?? 0)) {
      byHeight.set(key, entry);
    }
  }

  const sorted = [...byHeight.values()].sort((left, right) => {
    return (right.height || 0) - (left.height || 0);
  });

  if (sorted.length <= 1) {
    return [];
  }

  return sorted.map((entry) => ({
    id: entry.id,
    label: formatQualityLabel(entry.height, entry.frameRate),
    height: entry.height,
  }));
}

export function qualityOptionsWithAuto(options: QualityOption[]): QualityOption[] {
  if (options.length === 0) {
    return [];
  }

  return [{ id: "auto", label: "Auto", height: -1 }, ...options];
}

export function selectedQualityLabel(
  options: QualityOption[],
  selectedId: string,
): string {
  if (selectedId === "auto") {
    return "Auto";
  }

  return options.find((option) => option.id === selectedId)?.label ?? "Auto";
}
