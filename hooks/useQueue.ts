// hooks/useQueue.ts
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StageCode, Row, emptyRow } from "@/types"; // you'll define these

export function useQueue(stage: StageCode) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "get_production_entry_queue",
      { p_stage_code: stage }
    );
    if (rpcError) {
      setRows([]);
      
      setError(rpcError.message);
    } else {
      setRows((data ?? []).map((r: any) => emptyRow(r)));
    }
    setLoading(false);
  }, [stage, supabase]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  return { rows, setRows, loading, error, reload: loadQueue };
}
