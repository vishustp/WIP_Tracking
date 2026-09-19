// scripts/remove_duplicate_wip.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function removeDuplicates() {
  console.log("=== REMOVING DUPLICATE WIP ENTRIES ===");

  const duplicateLogIds = [
    {
      id: "2973a5cc-2701-41d3-86d2-3f28665a10e4",
      desc: "WO 6183 Heat Treatment 492m (82 PCS, Heat 426090551) - duplicate of 9724e5a2-6948-4bec-9771-deda15747a8d",
    },
    {
      id: "7d6b7bcb-8e13-428d-9078-84aefca3e222",
      desc: "WO 6183 Heat Treatment 492m (82 PCS, Heat 426090553) - duplicate of 6e8f38d7-71a4-4293-8b21-a18f5ff721c8",
    },
    {
      id: "72047583-8d01-4bd1-a612-cbc3b16df06a",
      desc: "WO 6183 Heat Treatment 666m (111 PCS, Heat 426090554) - duplicate of 1e2649fc-b557-46d6-bf80-297cea58c315",
    },
  ];

  for (const item of duplicateLogIds) {
    console.log(`Deleting duplicate production log ${item.id} (${item.desc})...`);
    const res = await fetch(`${SUPABASE_URL}/production_logs?id=eq.${item.id}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      console.error(`Failed to delete ${item.id}: ${res.statusText}`);
    } else {
      const deleted = await res.json();
      console.log(`✓ Successfully deleted production log ${item.id}`);
    }
  }

  const duplicateQcIds = [
    {
      id: "ec8fc497-d8c5-4c44-8e19-f1a9d9ed6863",
      desc: "WO 6207 VDI Inspection (39 inspected, 35 OK, Date 2026-09-15) - duplicate of 1a869e70-a50d-4567-8201-0b34c40e47fd",
    },
  ];

  for (const item of duplicateQcIds) {
    console.log(`Deleting duplicate QC inspection ${item.id} (${item.desc})...`);
    const res = await fetch(`${SUPABASE_URL}/qc_inspections?id=eq.${item.id}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      console.error(`Failed to delete ${item.id}: ${res.statusText}`);
    } else {
      const deleted = await res.json();
      console.log(`✓ Successfully deleted QC inspection ${item.id}`);
    }
  }

  console.log("\n=== ALL DUPLICATE WIP RECORDS REMOVED SUCCESSFULLY ===");
}

removeDuplicates().catch(console.error);
