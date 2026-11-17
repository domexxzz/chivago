export interface LauncherPoint { x: number; y: number }

/** Keep the AssistiveTouch-style launcher inside the visible safe frame. */
export function constrainLauncherPoint(point: LauncherPoint, width: number, height: number): LauncherPoint {
  return {
    x: Math.max(8, Math.min(Math.max(8, width - 78), point.x)),
    y: Math.max(48, Math.min(Math.max(48, height - 142), point.y)),
  };
}

/** Snap to the nearest screen edge while preserving the user's vertical choice. */
export function snapLauncherPoint(point: LauncherPoint, width: number, height: number): LauncherPoint {
  const safe = constrainLauncherPoint(point, width, height);
  return { x: safe.x + 35 < width / 2 ? 8 : Math.max(8, width - 78), y: safe.y };
}
