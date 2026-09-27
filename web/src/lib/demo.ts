/** Sandbox settings compiled in from .env (see NEXT_PUBLIC_* in docker-compose.yml). */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "";
