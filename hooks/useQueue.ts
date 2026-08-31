// hooks/useQueue.ts
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StageCode, Row, emptyRow } from "@/types";

export function useQueue(stage: StageCode) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const loadQueue = useCallback(async (targetStage?: StageCode) => {
    const s = targetStage || stageRef.current;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_production_entry_queue",
        { p_stage_code: s }
      );
      if (rpcError) {
        setRows([]);
        setError(rpcError.message);
      } else {
        setRows((data ?? []).map((r: any) => emptyRow(r)));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue(stage);
  }, [stage, loadQueue]);

  return { rows, setRows, loading, error, reload: () => loadQueue(stage) };
}

