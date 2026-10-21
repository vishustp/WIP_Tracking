import { Row, StageCode, WorkCenterWipInfo } from "@/types";

export interface CachePayload {
  timestamp: number;
  allCalculatedRows: Map<
    string,
    {
      queueRows: Record<StageCode, Row | null>;
      pipeline: WorkCenterWipInfo[];
      bandSawLotRows?: Row[];
      vdiLotRows?: Row[];
      vdiSalvageRow?: Row | null;
    }
  >;
  rollingPlanRows: Row[];
  childFinishingRows: Row[];
  workCenterSummary: Record<
    StageCode,
    { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }
  >;
}

// In-memory cache shared across the Node server process
let memoryCache: CachePayload | null = null;
export const QUEUE_CACHE_TTL_MS = 60000; // 60s in-memory TTL

export function getQueueCache(): CachePayload | null {
  if (memoryCache && (Date.now() - memoryCache.timestamp) < QUEUE_CACHE_TTL_MS) {
    return memoryCache;
  }
  return null;
}

export function setQueueCache(payload: CachePayload): void {
  memoryCache = payload;
}

export function invalidateQueueCache(): void {
  memoryCache = null;
}
