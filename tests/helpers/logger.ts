import { createLogger } from "@/server/platform/logger";

export const silentLogger = createLogger({ level: "silent" });
