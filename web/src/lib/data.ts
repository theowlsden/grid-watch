import { isEventList, isForecast, type Forecast, type GridEvent, type Site, type SitesSnapshot } from "./schema";
import snapshot from "../../../data/sites.snapshot.json";

// Forecast and events are fetched at runtime from /data, so a new pipeline run never
// needs a rebuild (spec 7.6). Short cache: the static server sets the headers.
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadForecast(signal?: AbortSignal): Promise<Forecast> {
  const data = await getJson("/data/forecast.json", signal);
  if (!isForecast(data)) throw new Error("forecast.json does not match the data contract");
  return data;
}

// Events are secondary: a missing or invalid file leaves the list empty, not the page broken.
export async function loadEvents(signal?: AbortSignal): Promise<GridEvent[]> {
  try {
    const data = await getJson("/data/events.json", signal);
    return isEventList(data) ? data : [];
  } catch {
    return [];
  }
}

// Sites come from the committed snapshot (spec 7.4); the CMS source is added in a later step.
export function snapshotSites(): Site[] {
  return (snapshot as unknown as SitesSnapshot).sites.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}
