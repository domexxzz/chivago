import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { IMAGE_CREDITS, PHOTOS } from "../data/mockData";
it("ships every locally referenced photo with matching credits and a WebP signature", () => {
  for (const photo of Object.values(PHOTOS)) {
    const asset = resolve("public/images", `${photo.creditId}.webp`);
    expect(existsSync(asset)).toBe(true);
    const bytes = readFileSync(asset);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    expect(
      IMAGE_CREDITS.find((credit) => credit.id === photo.creditId)?.source,
    ).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);
  }
});
