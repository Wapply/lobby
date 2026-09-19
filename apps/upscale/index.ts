import { serve } from "bun";
import { createApp } from "./service";

const PORT = 3012;
serve({ port: PORT, hostname: "127.0.0.1", fetch: createApp().fetch });
console.log(`upscale on 127.0.0.1:${PORT}`);