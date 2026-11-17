import { createSignaling } from "./service.js";
const list = (value?: string) =>
  value
    ?.split(",")
    .map((x) => x.trim())
    .filter(Boolean) ?? [];
const service = createSignaling({
  stun: list(process.env.STUN_URLS),
  turn: list(process.env.TURN_URLS),
  turnSecret: process.env.TURN_SHARED_SECRET,
  origins: list(process.env.ALLOWED_ORIGINS),
  trustProxy: process.env.TRUST_PROXY === "1",
});
service.http.listen(
  Number(process.env.PORT || 8080),
  process.env.HOST || "127.0.0.1",
  () => console.info("Pup Connect signaling ready")
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void service.stop().then(() => process.exit(0));
  });
