import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("opens the app standalone from the home screen", () => {
    const m = manifest();
    expect(m).toMatchObject({ name: expect.stringContaining("Kuke"), short_name: "Kuke", start_url: "/", display: "standalone" });
  });

  it("points only at icons that exist in public/", () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(existsSync(`public${icon.src}`), icon.src).toBe(true);
  });
});
