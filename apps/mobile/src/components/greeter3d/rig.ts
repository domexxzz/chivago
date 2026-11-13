/**
 * A skeleton for a model that was delivered without one.
 *
 * THREE ATTEMPTS, AND WHY THE FIRST TWO FAILED. Both of those tried to decide
 * which vertices ARE an arm, and neither could:
 *
 *   A box of coordinates wide enough to hold the raised hand also holds the
 *   hat brim, which shares the arm's x and y. Rotating that box tears the hat.
 *
 *   A flood across the surface from the hand leaks into the body - the welded
 *   build is one connected shell (19,615 of 19,630 vertices), and the unwelded
 *   one is 8,521 photogrammetry patches whose boundaries mean nothing. The
 *   same flood aimed at the tail took 34% of the animal.
 *
 * Skinning never asks that question. It asks how far each vertex is from a
 * BONE, and a bone is a line segment - which is exactly the shape an arm is,
 * and exactly the shape a box is not. A hat vertex can sit at the same x and
 * y as the hand and still be 0.2 from the line running down the arm.
 *
 * MEASURED, on the 155,527-vertex build, before any of this was written:
 *
 *   arm, radius 0.07   1,174 vertices   hat 0, far body 0, tail 0
 *   arm, radius 0.09   1,629 vertices   hat 0, far body 0, tail 0
 *   arm, radius 0.11   2,329 vertices   hat 0, far body 0, tail 0
 *   arm, radius 0.14   3,500 vertices   hat 16  <- the first leak
 *   tail, radius 0.10 19,025 vertices   front 0, +x side 0
 *
 * So 0.11 for the arm: the widest radius that still moves nothing it should
 * not. The bush of the tail really is an eighth of the animal.
 *
 * Everything is in model heights, like the choreography, because the bake
 * stands the mascot exactly one unit tall.
 */

export interface Bone {
  /** Where the joint is. Rotation happens about this point. */
  pivot: readonly [number, number, number];
  /** The far end. The segment between the two is what weights measure from. */
  tip: readonly [number, number, number];
  /** Vertices beyond this distance from the segment do not move at all. */
  radius: number;
  /**
   * How much the rotation grows along the bone, 0 to 1. THIS IS THE
   * DIFFERENCE BETWEEN A LIMB AND A LEVER.
   *
   * At 0 the whole weighted region turns by the same angle: the bone is a
   * rigid stick on a hinge, which is what a tail looked like swinging from
   * its base, and what an arm looked like swinging from the shoulder with no
   * elbow in it.
   *
   * At 1 the angle is scaled by how far along the bone the vertex sits, so
   * nothing moves at the joint and everything moves at the tip - the shape
   * CURVES. On the tail that is a tail; on the arm it is a crude elbow, with
   * the upper arm nearly still and the hand doing the travelling, which is
   * what a wave actually looks like.
   *
   * A head is rigid and keeps 0. Faces do not bend.
   */
  bend: number;
}

/**
 * The arm, from the shoulder to the raised hand.
 *
 * The hand is where the mesh actually ends - the furthest point out and up on
 * the +x side, found by search rather than typed in, and it came back at
 * (0.431, 0.659, 0.152). The shoulder is read off the occupancy map in the
 * bake notes: it is where the arm's column meets the torso's.
 */
export const ARM: Bone = {
  pivot: [0.18, 0.55, 0.07],
  tip: [0.431, 0.659, 0.152],
  radius: 0.11,
  // Most of the swing at the hand, almost none at the shoulder: the elbow
  // this model does not have, approximated by the only means available.
  bend: 0.85,
};

/** The tail, from where the bush leaves the hip to its tip, found the same way. */
export const TAIL: Bone = {
  pivot: [-0.1, 0.28, -0.14],
  tip: [-0.403, 0.397, -0.362],
  radius: 0.1,
  // A tail is the clearest case: hinged at the base it is a broom handle,
  // and curving along its length it is an animal's tail.
  bend: 1,
};

/**
 * The head, which is where life actually reads.
 *
 * A body can bob and sway all day and still look like a toy being shaken;
 * what makes something look ALIVE is that its head leads - it turns to look,
 * tilts when it is interested, lags a beat behind when the body moves first.
 * So this is the most important of the three bones, and the last one added.
 *
 * MEASURED like the others, at neck 0.55 and radius 0.30: 29,829 vertices
 * (19.2%), of which 5,749 are the hat - which is correct, a hat goes where
 * the head goes - and none at all are the legs. The radius was walked up
 * from 0.26 to 0.38; at 0.38 it starts taking feet, so 0.30 sits with room
 * to spare.
 *
 * It takes the shoulders and the top of the coat with it, and should: this
 * animal has no visible neck, so a head that turned while the collar stayed
 * put would be the thing that looked wrong.
 */
export const HEAD: Bone = {
  pivot: [0, 0.55, 0],
  tip: [0, 0.97, 0],
  radius: 0.3,
  // Rigid. A head that bends is a horror film.
  bend: 0,
};

/**
 * The eyes, so they can be closed.
 *
 * There is no eyelid to move and no eye to rotate: the eyes are PAINTED, part
 * of the base colour map, on a face that is otherwise white fur. So a blink
 * is not a deformation at all - it is drawing over them, and the only
 * question is where.
 *
 * NOT IN UV SPACE, which is the obvious place and the wrong one: the atlas is
 * 8,521 photogrammetry patches, so a rectangle of UV is not a region of face.
 * In object space the eyes are simply two small spheres, and a fragment knows
 * where it is.
 *
 * FOUND, NOT TYPED. The texture was sampled onto every vertex on the front of
 * the head and the darkness printed as a map; two blobs showed up, and these
 * are their weighted centres after six passes of refinement. They are not
 * symmetrical about x = 0 because the head is modelled slightly turned - the
 * model's x = 0 is the middle of its bounding box, not the middle of its face,
 * and an eye placed by assuming otherwise would have blinked the cheek.
 */
export const EYE_A: readonly [number, number, number] = [-0.039, 0.707, 0.223];
export const EYE_B: readonly [number, number, number] = [0.165, 0.759, 0.188];
/** Half the eye's width. The dark texels run to 0.086 at the ninetieth centile. */
export const EYE_RADIUS = 0.072;

/** Distance from a point to a bone's segment, and how far along it that lands. */
export function alongBone(x: number, y: number, z: number, bone: Bone): { distance: number; t: number } {
  const ax = bone.tip[0] - bone.pivot[0];
  const ay = bone.tip[1] - bone.pivot[1];
  const az = bone.tip[2] - bone.pivot[2];
  const bx = x - bone.pivot[0];
  const by = y - bone.pivot[1];
  const bz = z - bone.pivot[2];
  const length2 = ax * ax + ay * ay + az * az;
  let t = (bx * ax + by * ay + bz * az) / length2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { distance: Math.hypot(bx - ax * t, by - ay * t, bz - az * t), t };
}

/** Distance from a point to a bone's segment. */
export const distanceToBone = (x: number, y: number, z: number, bone: Bone): number =>
  alongBone(x, y, z, bone).distance;

/**
 * How much of a bone's rotation this vertex takes, 0 to 1.
 *
 * Squared falloff, not linear. A linear one reaches zero with slope still on
 * it, which puts a visible crease right where the arm meets the shoulder -
 * the one place on the model a seam would be most obvious. Squared arrives at
 * zero flat, so the deformation fades out instead of stopping.
 */
export function weightFor(x: number, y: number, z: number, bone: Bone): number {
  const { distance, t } = alongBone(x, y, z, bone);
  if (distance >= bone.radius) return 0;
  const k = 1 - distance / bone.radius;
  // The bend is folded in here rather than kept as a second attribute: the
  // shader only ever needs the product, and one float a bone is one float a
  // bone. At bend 0 this is the plain weight; at 1 it is zero at the joint.
  return k * k * (1 - bone.bend + bone.bend * t);
}

/**
 * The spine, which is not a tube and so is not a `Bone`.
 *
 * THE COMPLAINT THIS ANSWERS: everything below the waist was a rigid lump.
 * The body leaned and squashed as one block with its feet welded to it, which
 * is a statue being tilted - no amount of arm and tail fixes that, because
 * the eye reads the legs.
 *
 * A tube with a radius is the wrong shape for a spine: the legs sit directly
 * under the hips, well inside any radius wide enough to hold the torso, so a
 * tube takes them with it. What a spine actually is, is a HEIGHT RAMP -
 * nothing turns at the hips, everything turns by the top of the chest, and
 * whatever is above that carries the full rotation because it is riding on
 * the chest. No radius, so nothing to leak.
 *
 * It is applied LAST in the shader, after the limb bones, which makes it
 * their parent: the arm bends about its own shoulder first, and then the
 * whole posed upper body swings about the waist, exactly as a two-level
 * skeleton composes.
 */
export const SPINE = { hip: 0.22, chest: 0.6 } as const;

/** How much of the waist's bend this vertex carries. Zero at and below the hips. */
export function spineDrive(y: number): number {
  const k = (y - SPINE.hip) / (SPINE.chest - SPINE.hip);
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  // Eased at both ends: a linear ramp creases at the hip, and a waist that
  // creases is a hinge in a soft body.
  return (1 - Math.cos(k * Math.PI)) / 2;
}

/**
 * The weights for a whole position buffer, as the attributes a shader reads.
 *
 * One pass over the mesh at load. 155,527 vertices of arithmetic is under a
 * frame, and it happens once, behind the portrait that is already on screen.
 */
export function weightBuffers(positions: ArrayLike<number>): {
  arm: Float32Array;
  tail: Float32Array;
  head: Float32Array;
  spine: Float32Array;
  moved: { arm: number; tail: number; head: number; spine: number };
} {
  const count = Math.floor(positions.length / 3);
  const arm = new Float32Array(count);
  const tail = new Float32Array(count);
  const head = new Float32Array(count);
  const spine = new Float32Array(count);
  const moved = {
    arm: 0, tail: 0, head: 0, spine: 0,
  };
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const a = weightFor(x, y, z, ARM);
    arm[i] = a;
    /*
      THE ARM WINS WHERE THE BONES OVERLAP, and something has to.

      The head's radius reaches past the shoulder, so 161 vertices near the
      armpit answer to both bones. Applied one after the other they would
      take BOTH rotations and travel twice as far as either bone asked - the
      classic double-transform tear, and it would show up in the one place a
      seam is most visible. Scaling the others down by the arm's share is a
      normalisation: where the arm owns a vertex outright nothing else moves
      it, and where it has a partial claim the rest is shared smoothly.
    */
    tail[i] = weightFor(x, y, z, TAIL) * (1 - a);
    head[i] = weightFor(x, y, z, HEAD) * (1 - a);
    /*
      The spine is NOT scaled down by the others, because it is their parent
      rather than their rival. A hand riding on a bending torso goes where
      the torso puts it and then does its own waving on top; that is what a
      skeleton is. The shader applies this one last for the same reason.
    */
    spine[i] = spineDrive(y);
    if (arm[i] > 0.02) moved.arm += 1;
    if (tail[i] > 0.02) moved.tail += 1;
    if (head[i] > 0.02) moved.head += 1;
    if (spine[i] > 0.02) moved.spine += 1;
  }
  return {
    arm, tail, head, spine, moved,
  };
}
