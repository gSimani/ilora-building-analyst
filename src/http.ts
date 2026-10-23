/** Local entry point: npm run dev (or npm start). */
import { createApp } from "./app.js";
import { mountAssistant } from "./assistant/routes.js";

const port = Number(process.env.PORT ?? 8787);
createApp(mountAssistant).listen(port, () => {
  console.log(`ILORA.ai MCP server on http://localhost:${port}/mcp  (health: /health)`);
});
