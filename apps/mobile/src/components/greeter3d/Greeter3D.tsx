/**
 * ChangChang, alive, on the web. The island's greeter in three dimensions.
 *
 * A MODEL FILE, WHICH `creature3d/Creature3D.tsx` REFUSES, AND WHY THAT IS
 * NOT A CONTRADICTION. That file's rule is "no model file, for the same
 * reason the SVG marks have no photograph: a downloaded monkey carries
 * somebody's licence and somebody's idea of a monkey". Both halves of that
 * are about REAL ANIMALS drawn by STRANGERS - a licence this project cannot
 * show, and a claim about wildlife it cannot check. Neither applies here:
 * ChangChang is this project's own character, made for this project, and is
 * not a species. The primitives rule guards the five companions and the
 * seventy-seven emblems, and it still does. See `packages/core/greeters.ts`
 * for the line between the three lists.
 *
 * WHAT IS IN THE FILE. 39,726 triangles, no textures, colour on the vertices.
 * The source bake was 7.1 million triangles and a fragmented 4K atlas -
 * `scripts/mascot-bake/reduce.mjs` explains why the atlas had to go before
 * the mesh could be simplified at all, and is the pipeline that did it.
 *
 * WEB ONLY, loaded AFTER the screen has painted, like the companion's room
 * and for the same reason: three.js plus the model is most of a megabyte, and
 * what somebody looks at while it arrives must be the mascot, not a space
 * where the mascot will be. `GreeterScene.tsx` owns that switch; this file is
 * only ever reached once the decision has been made.
 */

import React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Greeter } from '@chivago/core';
import { dayArc, hourFrom } from '../island-clock.ts';
import {
  CLIP_MS, REST, blend, blinkAt, nextPerformance, poseAt, widthFor,
  type ClipName, type Pose,
} from './choreography.ts';
import { ARM, EYE_A, EYE_B, EYE_RADIUS, HEAD, SPINE, TAIL, weightBuffers } from './rig.ts';
import { atRest, stepBone, type SpringState } from './spring.ts';
import { bakeQuantisedMesh } from './dequantize.ts';

/**
 * The blink, drawn rather than moved.
 *
 * There is no eyelid in this model and no eyeball either - the eyes are
 * painted into the base colour map. So the lid is a line swept down across
 * the two eye spheres in OBJECT space, repainting what it passes as fur and
 * leaving a lash line at its edge. Object space and not UV: the atlas is
 * thousands of photogrammetry patches, so a rectangle of UV is not a region
 * of face, while a sphere in object space is exactly one.
 *
 * `vRestPos` is the vertex's position BEFORE skinning, so the eyes stay
 * where they are on the face however far the head has turned.
 *
 * The lid runs from 1.12 to -0.12 rather than 1 to 0, so that with the eyes
 * open the sweep is entirely above the eye and cannot tint the top of it,
 * and with them shut it is entirely below and nothing is left peeking.
 */
const BLINK_VERTEX = 'varying vec3 vRestPos;\n';
const BLINK_FRAGMENT = /* glsl */`
varying vec3 vRestPos;
uniform float uBlink;
uniform vec3 uEyeA;
uniform vec3 uEyeB;
uniform float uEyeRadius;
uniform vec3 uLid;
uniform vec3 uLash;
`;
const BLINK_BODY = /* glsl */`
{
  float dA = distance(vRestPos, uEyeA);
  float dB = distance(vRestPos, uEyeB);
  vec3 centre = dA < dB ? uEyeA : uEyeB;
  float inEye = 1.0 - smoothstep(uEyeRadius * 0.55, uEyeRadius, min(dA, dB));
  if (inEye > 0.001 && uBlink > 0.001) {
    float h = (vRestPos.y - (centre.y - uEyeRadius)) / (2.0 * uEyeRadius);
    float lid = mix(1.12, -0.12, uBlink);
    float covered = smoothstep(lid - 0.07, lid + 0.03, h) * inEye;
    diffuseColor.rgb = mix(diffuseColor.rgb, uLid, covered);
    float lash = (1.0 - smoothstep(0.0, 0.05, abs(h - lid))) * inEye;
    diffuseColor.rgb = mix(diffuseColor.rgb, uLash, lash * 0.85);
  }
}
`;

/**
 * The skinning, as a patch on three's standard vertex shader.
 *
 * Two bones, one float of weight each, and a rotation about each bone's
 * pivot. It goes in the shader and not in JavaScript because the alternative
 * is rewriting 155,527 positions and normals on the CPU every frame, which
 * is several milliseconds of a sixteen-millisecond budget to do work the GPU
 * does for nothing.
 *
 * THE ARM TURNS ABOUT Z AND THE TAIL ABOUT Y, which is not arbitrary. The arm
 * is raised out to the side, so a wave tips the hand side to side across the
 * viewer's eye - that is a turn about the axis pointing at the camera. The
 * tail hangs behind, so a wag sweeps it left and right about the upright.
 *
 * Normals are rotated too. Leaving them is the classic skinning bug: the mesh
 * moves and the shading stays behind, so a waving arm lights as though it
 * never left its old position.
 */
const SKIN_HEAD = /* glsl */`
attribute float aArm;
attribute float aTail;
attribute float aHead;
attribute float aSpine;
uniform float uArm;
uniform float uArmOut;
uniform float uTail;
uniform float uSpine;
uniform vec3 uHeadTurn;
uniform vec3 uArmPivot;
uniform vec3 uTailPivot;
uniform vec3 uHeadPivot;
uniform vec3 uSpinePivot;

vec3 chivagoSpinX(vec3 p, vec3 pivot, float a) {
  vec3 q = p - pivot;
  float c = cos(a); float s = sin(a);
  return pivot + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
vec3 chivagoSpinY(vec3 p, vec3 pivot, float a) {
  vec3 q = p - pivot;
  float c = cos(a); float s = sin(a);
  return pivot + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
}
vec3 chivagoSpinZ(vec3 p, vec3 pivot, float a) {
  vec3 q = p - pivot;
  float c = cos(a); float s = sin(a);
  return pivot + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
}

/* The arm: the swing, then the reach toward the viewer. Two axes, so the
   hand travels round rather than along.

   The second angle is named reach and not out, because out is a storage
   qualifier in GLSL: a parameter called that compiles to nothing, the
   material's program fails to link, and the whole mascot disappears while
   its shadow - an unpatched mesh - carries on being drawn underneath. */
vec3 chivagoArm(vec3 p, vec3 pivot, float swing, float reach, float w) {
  vec3 r = chivagoSpinZ(p, pivot, swing * w);
  return chivagoSpinY(r, pivot, reach * w);
}

/* Yaw, then pitch, then roll - the order a head moves in. */
vec3 chivagoHead(vec3 p, vec3 pivot, vec3 turn, float w) {
  vec3 r = chivagoSpinY(p, pivot, turn.x * w);
  r = chivagoSpinX(r, pivot, turn.y * w);
  return chivagoSpinZ(r, pivot, turn.z * w);
}
`;


/** How far the head-and-body turn follows the pointer, in radians. */
const LOOK_YAW = 0.38;
/** How long a finished performance takes to melt back into breathing. */
const SETTLE_MS = 260;

/** The light at that hour, as the rest of the island already reckons it. */
function lightingFor(hour: number) {
  const { day, arc, golden } = dayArc(hour);
  return {
    /*
      A GREETER IS NEVER SHOWN IN THE DARK. The companion's room dims at
      night because the room is the island and the island does get dark. This
      is a character on a white card, and a mascot lit the way a beach is lit
      at ten at night reads as a rendering fault, not as nightfall - measured
      on this card at 22:00, where white fur came out grey-blue. Night here
      is a COOLER light, barely a dimmer one.
    */
    key: day ? 1.5 + arc * 1.3 : 1.6,
    ambient: day ? 1.4 + arc * 0.5 : 1.7,
    /*
      The night key is a LAMP, not the moon. A cool white key drains the blue
      out of the coat and the bag - the pattern that is most of why the
      detailed build is worth its size - and leaves a grey animal that looks
      switched off. The island's own lights are warm, the comment above says
      a greeter is never shown in the dark, and warm light is the half of
      "friendly" that costs nothing. The cool stays in the fill, where it
      separates the silhouette without touching the colours.
    */
    warm: new THREE.Color(day ? mixHex('#ffffff', '#ffd9a8', golden) : '#ffeedd'),
    sky: day ? new THREE.Color('#dff1f7').lerp(new THREE.Color('#ffe7c4'), golden) : new THREE.Color('#dde7f3'),
    ground: day ? new THREE.Color('#cfe3d8') : new THREE.Color('#a8b4c4'),
  };
}

const mixHex = (a: string, b: string, k: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

export function Greeter3D({
  greeter, modelUri, height, label, still, onTap,
}: {
  greeter: Greeter;
  /** Already resolved for this platform by the caller; this file never guesses. */
  modelUri: string;
  height: number;
  label: string;
  /** Reduce-motion. Still means still: the pose holds and nothing loops. */
  still: boolean;
  onTap?: (clip: ClipName) => void;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const el = host.current;
    if (!el) return undefined;

    const hour = hourFrom(window.location.search) ?? new Date().getHours();
    const light = lightingFor(hour);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth || 320, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /*
      Tone mapping, which this scene went without and should not have.
      Untouched, three clips anything over white and a lit white animal in a
      bright scene loses its whole face to a flat blown-out patch. ACES rolls
      the highlights off instead, which is what keeps the fur reading as fur
      where the key light lands on it.
    */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', label);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = `${height}px`;
    renderer.domElement.style.touchAction = 'pan-y';
    // Always a pointer: a tap always does something now, whether or not the
    // card passed a handler of its own.
    renderer.domElement.style.cursor = 'pointer';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    /*
      IMAGE-BASED LIGHTING, which is most of the difference between a
      character and a toy made of shiny plastic.

      Two directional lights give a surface exactly two highlights: two hard
      dots, in the same place on every material, however the roughness map
      says that part should behave. An environment lights it from everywhere
      at once, so a glossy camera body picks up a broad soft reflection while
      the fur beside it stays matte - the map finally gets to mean something.

      `RoomEnvironment` rather than a downloaded HDRI: it is generated in
      code from three's own examples, so there is no image to license, host
      or wait for, and it is the neutral soft-box every product render uses.
    */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    pmrem.dispose();

    // Dialled back now the environment carries the base: these shape the
    // light rather than supplying all of it.
    scene.add(new THREE.HemisphereLight(light.sky, light.ground, light.ambient * 0.5));
    const key = new THREE.DirectionalLight(light.warm, light.key * 0.75);
    key.position.set(2.2, 3.4, 2.6);
    scene.add(key);
    // Tinted to the shore he now stands on, so the light on him belongs to
    // the same picture as the ground under him.
    const fill = new THREE.DirectionalLight(0xd8f1f7, 0.38);
    fill.position.set(-2.4, 1.2, -1.8);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(32, (el.clientWidth || 320) / height, 0.1, 40);
    // Closer than it was: he sat small in a wide band with dead space either
    // side, and empty frame is its own kind of floating.
    camera.position.set(0, 0.58, 1.95);
    camera.lookAt(0, 0.5, 0);

    /*
      A SOFT SHADOW, because the hard one was most of what made him look
      pasted on.

      This was a flat disc at a single opacity: a grey ellipse with a crisp
      edge, which is a sticker's drop shadow and not light. Real contact
      shadow is dark and tight where the feet meet the ground and fades to
      nothing a short way out, so the texture below is a radial gradient
      painted once into a canvas - dense in the middle, gone at the rim -
      and the disc samples it.

      Tinted toward the shore it sits on rather than grey. A neutral shadow
      on a blue-green ground reads as dirt.
    */
    const shadowTexture = (() => {
      const size = 128;
      const pad = document.createElement('canvas');
      pad.width = size;
      pad.height = size;
      const ink = pad.getContext('2d')!;
      const gradient = ink.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      // Stronger than it was: this now falls on sunlit sand rather than on
      // a pale flat band, and the first setting simply vanished into it.
      gradient.addColorStop(0, 'rgba(26, 62, 76, 0.6)');
      gradient.addColorStop(0.45, 'rgba(26, 62, 76, 0.32)');
      gradient.addColorStop(1, 'rgba(26, 72, 88, 0)');
      ink.fillStyle = gradient;
      ink.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(pad);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({
        map: shadowTexture, transparent: true, depthWrite: false, opacity: 1,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    /*
      Squashed so it reads as a shadow on the ground rather than a circle.
      LOCAL Y, not z: the plane is rotated flat, so its own y is the world's
      z. Scaling z here would stretch the plane along its own normal and do
      nothing at all, which is a quiet way to spend an afternoon.
    */
    shadow.scale.y = 0.62;
    scene.add(shadow);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let alive = true;
    let frame = 0;
    let model: THREE.Group | null = null;
    let pointerYaw = 0;
    const started = performance.now();

    /*
      What it is doing now. `performing` is null while it is only breathing;
      a tap sets it, and the clip hands itself back when it runs out.
    */
    let performing: ClipName | null = null;
    let performingSince = 0;
    let lastPerformance: ClipName | null = null;

    // Shared with every material the shader patch touches, so one write a
    // frame drives the whole skeleton.
    const armAngle = { value: 0 };
    const armOutAngle = { value: 0 };
    const tailAngle = { value: 0 };
    // Yaw, pitch, roll in one vector, so the shader takes one uniform.
    const headTurn = { value: new THREE.Vector3(0, 0, 0) };
    const spineAngle = { value: 0 };
    const blink = { value: 0 };

    /*
      Every bone chases the clip through a spring rather than being set to
      it. That is where lag, overshoot and follow-through come from, and
      they are most of the difference between a skeleton and a puppet on
      rods - see spring.ts for what each bone is made of.
    */
    const bones: Record<string, SpringState> = {
      arm: atRest(),
      armOut: atRest(),
      tail: atRest(),
      yaw: atRest(),
      pitch: atRest(),
      roll: atRest(),
      spine: atRest(),
    };
    let lastFrameAt = 0;
    const skinned: { arm: number; tail: number; head: number }[] = [];

    const play = (clip: ClipName, now: number) => {
      performing = clip;
      performingSince = now;
      lastPerformance = clip;
    };

    const draw = (now: number) => {
      if (model) {
        let pose: Pose;
        if (still) {
          // Reduce-motion means still, not slower. The pose holds.
          pose = REST;
        } else {
          const idle = poseAt('idle', now - started);
          if (performing === null) {
            pose = idle;
          } else {
            const into = now - performingSince;
            const length = CLIP_MS[performing];
            if (into >= length + SETTLE_MS) {
              performing = null;
              pose = idle;
            } else if (into >= length) {
              // Melt back into breathing rather than snapping to it.
              pose = blend(poseAt(performing, length), idle, (into - length) / SETTLE_MS);
            } else {
              pose = poseAt(performing, into);
            }
          }
        }

        // Seconds since the last frame, which the springs integrate over.
        // The first frame has no previous one; spring.ts clamps the rest.
        const deltaS = lastFrameAt === 0 ? 1 / 60 : (now - lastFrameAt) / 1000;
        lastFrameAt = now;

        bones.arm = stepBone(bones.arm, pose.wave, deltaS, 'arm');
        bones.armOut = stepBone(bones.armOut, pose.waveOut, deltaS, 'arm');
        bones.tail = stepBone(bones.tail, pose.wag, deltaS, 'tail');
        bones.spine = stepBone(bones.spine, pose.torso, deltaS, 'spine');
        armAngle.value = bones.arm.value;
        armOutAngle.value = bones.armOut.value;
        tailAngle.value = bones.tail.value;
        spineAngle.value = bones.spine.value;
        /*
          Off the ROOM's clock, not the clip's. Blinking belongs to the
          animal rather than to any performance: it carries on while it
          waves, while it jumps, while it stands there, and it does not
          start over because somebody tapped.
        */
        blink.value = still ? 0 : blinkAt(now - started);
        /*
          THE HEAD DOES THE LOOKING, NOT THE BODY.

          Following the pointer by turning the whole figure is what this did
          before, and it is what a turntable does. A creature tracks you with
          its head first and brings its body round only if it has to - so the
          head takes most of the pointer, the body a quarter of it, and the
          two together read as attention rather than as rotation.
        */
        const watch = still ? 0 : pointerYaw;
        bones.yaw = stepBone(bones.yaw, pose.glance + watch * 0.75, deltaS, 'headYaw');
        bones.pitch = stepBone(bones.pitch, pose.nod, deltaS, 'headPitch');
        bones.roll = stepBone(bones.roll, pose.tilt, deltaS, 'headRoll');
        headTurn.value.set(bones.yaw.value, bones.pitch.value, bones.roll.value);
        pivot.position.set(pose.drift, pose.lift, 0);
        // Pivoting at the feet, which is where a standing body bends from.
        pivot.scale.set(widthFor(pose.squash), pose.squash, widthFor(pose.squash));
        pivot.rotation.z = pose.lean;
        // A quarter of the pointer, and chased slowly: the body is the part
        // that gives in last.
        const wantedYaw = pose.turn + watch * 0.25;
        pivot.rotation.y += (wantedYaw - pivot.rotation.y) * 0.08;

        /*
          The shadow does the work a shadow does: it says how high off the
          ground the body is. It shrinks and fades as the mascot rises, which
          is the only cue in the scene that distinguishes a jump from the
          same body simply drawn larger.
        */
        const height = Math.max(0, pose.lift);
        const spread = Math.max(0.5, 1 - height * 1.4);
        shadow.scale.set(spread, spread * 0.62, 1);
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - height * 1.8);
        shadow.position.x = pose.drift;
      }
      renderer.render(scene, camera);
      if (alive) frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (e: PointerEvent) => {
      const box = renderer.domElement.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      pointerYaw = Math.max(-LOOK_YAW, Math.min(LOOK_YAW, x * LOOK_YAW * 2));
    };
    const onLeave = () => { pointerYaw = 0; };
    /*
      A tap plays the NEXT performance rather than the same one again. One
      reply repeated is a button; three in turn is a character with more than
      one thing to show you, and it is what makes somebody tap twice.
    */
    const onClick = () => {
      if (still) return;
      const clip = nextPerformance(lastPerformance);
      play(clip, performance.now());
      // Which one, so the card can let it speak only when it is greeting.
      onTap?.(clip);
    };

    // The detailed build ships EXT_meshopt_compression (quantised, 7.8 MB ->
    // 3.2 MB) so phones can afford it; without the decoder it will not load.
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      modelUri,
      (gltf) => {
        if (!alive) return;
        model = gltf.scene;
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Before anything reads a position: the detailed build is quantised.
          bakeQuantisedMesh(mesh);
          const material = mesh.material as THREE.MeshStandardMaterial;
          /*
            TWO BAKES, TWO MATERIALS, AND ONLY ONE OF THEM WANTS TO BE TOLD
            ANYTHING.

            The small build carries COLOR_0 and no maps, and three only reads
            vertex colour when the material is told to; its roughness has to
            be set here because there is nothing else to set it.

            The detailed build carries all three maps, and every line above
            would have quietly destroyed them: `roughness` multiplies the
            roughness map rather than replacing it, so 0.72 would have made
            the whole animal uniformly damp, and `metalness = 0` would have
            cancelled the metal channel that makes the camera a camera. When
            there are maps, the right amount of interference is none.
          */
          const textured = !!material.map;
          material.vertexColors = !!mesh.geometry.attributes.color;
          if (!textured) {
            material.roughness = 0.72;
            material.metalness = 0;
          }

          // The weights, computed once, here, from the positions this mesh
          // actually has. `rig.ts` has the measurements behind the radii.
          const positions = mesh.geometry.attributes.position.array as ArrayLike<number>;
          const { arm, tail, head, spine, moved } = weightBuffers(positions);
          mesh.geometry.setAttribute('aArm', new THREE.BufferAttribute(arm, 1));
          mesh.geometry.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
          mesh.geometry.setAttribute('aHead', new THREE.BufferAttribute(head, 1));
          mesh.geometry.setAttribute('aSpine', new THREE.BufferAttribute(spine, 1));
          skinned.push(moved);

          material.onBeforeCompile = (shader) => {
            shader.uniforms.uArm = armAngle;
            shader.uniforms.uArmOut = armOutAngle;
            shader.uniforms.uTail = tailAngle;
            shader.uniforms.uHeadTurn = headTurn;
            shader.uniforms.uArmPivot = { value: new THREE.Vector3(...ARM.pivot) };
            shader.uniforms.uTailPivot = { value: new THREE.Vector3(...TAIL.pivot) };
            shader.uniforms.uHeadPivot = { value: new THREE.Vector3(...HEAD.pivot) };
            shader.uniforms.uSpine = spineAngle;
            shader.uniforms.uSpinePivot = { value: new THREE.Vector3(0, SPINE.hip, 0) };
            shader.uniforms.uBlink = blink;
            shader.uniforms.uEyeA = { value: new THREE.Vector3(...EYE_A) };
            shader.uniforms.uEyeB = { value: new THREE.Vector3(...EYE_B) };
            shader.uniforms.uEyeRadius = { value: EYE_RADIUS };
            // Linear, because `diffuseColor` is linear by this point in the
            // shader: the map is decoded from sRGB before anything reads it.
            // Constants and not a texture sample, because an offset UV in a
            // shattered atlas lands somewhere else on the animal entirely.
            shader.uniforms.uLid = { value: new THREE.Color(0.86, 0.83, 0.8) };
            shader.uniforms.uLash = { value: new THREE.Color(0.1, 0.07, 0.06) };

            shader.vertexShader = BLINK_VERTEX + SKIN_HEAD + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n               vRestPos = position;',
            );
            shader.fragmentShader = BLINK_FRAGMENT + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              `#include <map_fragment>\n${BLINK_BODY}`,
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <beginnormal_vertex>',
              `#include <beginnormal_vertex>
               objectNormal = chivagoArm(objectNormal, vec3(0.0), uArm, uArmOut, aArm);
               objectNormal = chivagoSpinY(objectNormal, vec3(0.0), uTail * aTail);
               objectNormal = chivagoHead(objectNormal, vec3(0.0), uHeadTurn, aHead);
               objectNormal = chivagoSpinZ(objectNormal, vec3(0.0), uSpine * aSpine);`,
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
               transformed = chivagoArm(transformed, uArmPivot, uArm, uArmOut, aArm);
               transformed = chivagoSpinY(transformed, uTailPivot, uTail * aTail);
               transformed = chivagoHead(transformed, uHeadPivot, uHeadTurn, aHead);
               /* LAST, and that is what makes it their parent: the limbs pose
                  about their own joints first, then the whole posed upper
                  body swings over the hips. */
               transformed = chivagoSpinZ(transformed, uSpinePivot, uSpine * aSpine);`,
            );
          };
          material.needsUpdate = true;
        });
        // The bake stands the model on y=0, centred, exactly one unit tall,
        // so nothing here has to measure it.
        pivot.add(model);
        // One frame drawn straight away, before any loop. A background tab,
        // a throttled host or anything else that is slow to grant the first
        // animation frame would otherwise show an empty canvas over the
        // portrait, which is worse than either on its own.
        renderer.render(scene, camera);
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerleave', onLeave);
        renderer.domElement.addEventListener('click', onClick);
        // It says hello when it arrives. The one performance that needs no
        // prompting is the one the card is for.
        if (!still) play('greet', performance.now() + 350);
        frame = requestAnimationFrame(draw);
      },
      undefined,
      () => {
        // A greeter that will not load is not an error worth showing anybody:
        // the painted portrait is already on screen behind this.
        if (alive) setFailed(true);
      },
    );

    const onResize = () => {
      const w = el.clientWidth || 320;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('click', onClick);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      });
      // The generated environment is a render target's texture and is not
      // reached by the traversal above; without this every remount of the
      // card leaks one cube map.
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [greeter.key, modelUri, height, label, still, onTap]);

  // Nothing of its own to show: the portrait underneath stays visible.
  if (failed) return null;

  return <div ref={host} style={{ width: '100%', height }} />;
}
