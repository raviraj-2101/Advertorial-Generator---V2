import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { publishLander } from "../server/publishing.js";
import { tryGetServiceClient } from "../server/supabase.js";
(async () => {
  const supa = tryGetServiceClient();
  const { data } = await supa.from("landers").select("html").eq("id", "b646d0d1-9bb4-42f6-811d-22e928a72463").single();
  const result = await publishLander({
    domain: "adv-test.acentecom.com",
    publishPath: "test-lander",
    html: (data as { html: string }).html,
  });
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
