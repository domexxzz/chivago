# ChangChang, the Koh Sichang greeter — 12 November 2026

The island's greeter, as `packages/core/src/greeters.ts` defines one: a
character made for this project, modelled in 3D. **Not a species, and not a
claim about the animals of Koh Sichang.** That sentence ships on the card.

| File | What it is | Size |
| --- | --- | --- |
| `changchang.glb` | the small build: vertex-coloured, no textures — 39,726 triangles, 19,630 vertices | 771 KB |
| `changchang-detailed.glb` | the full build: base colour, normal and metallic-roughness maps — 149,992 triangles, 155,527 vertices; quantised + `EXT_meshopt_compression` | 3.2 MB (2.9 MB gzipped) |
| `changchang-greeting.png` | the detailed model rendered face-on, waving; 626 × 760, alpha trimmed to the character | 538 KB |
| `changchang-mark.png` | the same render at 181 × 220, for a row or a chip | 61 KB |

`GreeterScene` decides which build a machine is sent: everyone gets the
detailed one except Data Saver, which gets the small one (`greeter3d/build-choice.ts`). Both
portraits are rendered from the detailed build, so a phone that never
downloads it still sees the face it has.

Under `/media/` and not `/assets/`, for the reason measured at the top of
`apps/mobile/src/api/photos.ts`: `/assets/` is Metro's own URL namespace and
`expo start --web` answers it from the bundler registry rather than from
`public/`, so everything under it 404s for the whole of development.

## Where it came from

The owner supplied a Meshy image-to-3D bake on 12 November 2026:

- `Meshy_AI_Blue_ChangChang_with__1110073359_image-to-3d-texture.glb` — 222 MB,
  7,130,456 triangles, 3,902,555 vertices, three 4096 × 4096 JPEG maps
  (base colour, metallic-roughness, normal) totalling 22 MB.
- `Meshy_AI_Blue_ChangChang_with_Bag_3D_20261108_image-to-3d-texture-2.blend` — 636 MB.

Neither is in this repository. Both are the source of record and should be
kept wherever the rest of the project's art masters live.

## How it was reduced, and why that way

`scripts/mascot-bake/` is the pipeline, re-runnable end to end. The one
decision worth knowing:

**The texture came off and went onto the vertices.** The atlas is
photogrammetry output — thousands of small UV islands. Simplifying a mesh like
that while keeping its texture smears every island edge, because the
simplifier sees only positions and every seam reads to it as a border it must
not cross; locking those borders keeps the texture honest and keeps the
triangle count in the hundreds of thousands. So the colour was sampled at full
4K resolution onto every one of the 3.9 M vertices first, the atlas was thrown
away, the mesh was welded by position, and only then simplified. 22 MB of JPEG
became four bytes a vertex.

What that costs is the fine painted pattern on the hat and coat. What it keeps
is the colour, the silhouette and 99.8% of the shape — the simplifier reports
0.00218 of the model's extent as its error.

## And why there is a second, textured build

Because "the fine painted pattern" turned out to include the character's
**eyes**. Nineteen thousand colour samples for a whole animal leaves the
irises as dull smudges with no pupil, no catchlight and no lash line, and a
face reads as friendly or it does not almost entirely on its eyes. The maps
also turn the blur on the hat and bag into a printed lighthouse-and-waves
pattern, and the metallic-roughness map is what makes the camera a camera
rather than a grey lump.

Keeping the atlas means keeping the UV seams, and a seam is a border the
simplifier will not collapse across. Measured on this model with
`probe-uv.mjs`:

| asked | got | error |
| --- | --- | --- |
| 40,000 | 103,144 | 0.04645 |
| 80,000 | 103,038 | 0.04885 |
| 150,000 | 149,992 | 0.00154 |
| 300,000 | 299,982 | 0.00065 |

103k is the floor and a bad place to stand — the error there is thirty times
what it is just above it, because the simplifier is chewing into the
silhouette trying to reach a count the seams forbid. Hence 150,000.

`reduce-textured.mjs` is that pipeline. It is 3.8× the triangles of the small
build and the maps go out at 2048 / 1024 / 2048 (base colour, roughness,
normal), JPEG, with higher quality on the normal map because its channels are
a direction vector rather than a picture.

**Compressed for phones (15 November 2026).** The small build blotched the coat
and lost the eyes on real phones and tablets, so the detailed build was made
cheap enough to send everywhere:

```bash
npx @gltf-transform/cli@4.1.1 meshopt changchang-detailed.glb out.glb --level medium
```

7.8 MB -> 3.2 MB. Positions and normals become normalised int16 with the
offset on the node; `greeter3d/dequantize.ts` widens them back to model units
at load so `rig.ts` and the shader patch see what they always saw, and the
loader is given three's `MeshoptDecoder`. Re-run this after any re-bake.

The bake also stands the model up: feet at y = 0, centred on x and z, exactly
one unit tall, so no scene has to measure it. Vertex colours are converted
sRGB → linear, which is what glTF says `COLOR_0` holds; without that the whole
mascot renders several stops too dark.

## Re-baking

```bash
# 1. mesh and textures out of the source, by targeted reads - the 222 MB
#    buffer is never held in memory at once
node scripts/mascot-bake/extract.mjs <source.glb> <work-dir>

# 2. colour onto the vertices, weld, simplify, stand it up, write the GLB
MESHOPT=node_modules/.pnpm/meshoptimizer@0.18.1/node_modules/meshoptimizer/meshopt_simplifier.module.js \
  node --max-old-space-size=6144 scripts/mascot-bake/reduce.mjs <work-dir> <out.glb> 40000 4096

# 3. check it: vertex count, true bounding box, index range, colour
node scripts/mascot-bake/check.mjs <out.glb>

# 4. renders. The viewer inlines the GLB as base64 so file:// needs no server;
#    the shot server exists because a hidden browser pane will not composite a
#    screenshot, so the page uploads its own frames instead.
node scripts/mascot-bake/make-viewer.mjs <out.glb> <dir>/viewer.html
node scripts/mascot-bake/shotserver.mjs <dir> 8913
#    then, in the page: await window.sheet([0, 60, 120, 180, 240, 300], 8)

# 5. crop a render to its alpha and scale it
node scripts/mascot-bake/trim.mjs <dir>/shots/angle-0.png <out.png> 760
```

`reduce.mjs` needs `meshoptimizer` (already in the workspace, as a transitive
dependency) and `ffmpeg` on the machine; `trim.mjs` needs ffmpeg only.

The viewer's lighting is a plain neutral three-point rig and is NOT the
island-clock rig that `src/components/greeter3d/Greeter3D.tsx` uses, so the
portrait is the same character but not the same hour. That is deliberate: a
portrait baked at one hour would disagree with the live room at every other.
