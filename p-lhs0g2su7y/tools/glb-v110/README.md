# v110 GLB edits (reproducible)

Run from a folder with `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `sharp` installed
(three.js is imported from `vendor/three`). Inputs are the v109 originals (git `67688c8:models/*.glb`).

- `node fix-spark.mjs spark-v109.glb step1.glb` — removes the Chevrolet bowtie: rear emblem `polySurface272_escudo_0` + its chrome bezel
  `polySurface299_Chrome_0`, front emblem `Escudo_Front_Bumper_escudo_0` + the isolated bezel island of `Chrome_Front_Bumper1`.
- `node fix-spark3.mjs step1.glb spark.glb` — the two leftover centre tabs on the grille bars (they cover notches in the grille meshes)
  become `Plastic_Black` so no bowtie silhouette remains. Body paint (`Carpaint`) untouched.
- `node fix-m3.mjs m3-v109.glb m3.glb 1.15 1.8` — M3 lights: drops the duplicate `lights_position_front_and_back` glow layer and the
  parked-off `brakes` / `reverse` glows (4 stacked BLEND quads at the rear), glow texture alpha = brightness (no dark box),
  rear glow → `m3_tail_led` (red, strength 1.15), front → `m3_front_drl` (cool white, 1.8). The identical emissive PNG copy is pruned.
