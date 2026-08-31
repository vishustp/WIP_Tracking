// hooks/useHistory.ts
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductionEntry } from "@/types";

export function useHistory(
  search: string,
  entryStage: string,
  entryRoute: string,
  fromDate: string,
  toDate: string
) {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_production_entries",
        {
          p_search: search.trim() || null,
          p_stage_code: entryStage || null,
          p_route_code: entryRoute || null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }
      );
      if (rpcError) {
        setEntries([]);
        setError(rpcError.message);
      } else {
        setEntries(data as ProductionEntry[]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load history entries");
    } finally {
      setLoading(false);
    }
  }, [search, entryStage, entryRoute, fromDate, toDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  return { entries, loading, error, reload: loadEntries };
}
