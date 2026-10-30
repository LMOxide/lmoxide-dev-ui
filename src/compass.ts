/**
 * Headings as LMO shows them. A heading is 0° along +z and 90° along +x (the server's); in game
 * 0° is north, which the camera shows up and to the left: an arrow pointing straight up on
 * screen points north-east, heading 45°. Heading arrows are drawn turned −45° to match.
 */
export const UP_HEADING = 45

/** The angle to draw a heading at (degrees clockwise from up). */
export const screenAngle = (degrees: number) => degrees - UP_HEADING

/** The game's compass point of a heading in degrees (0° N, up-left on screen; 45° NE, up). */
export function compassPoint(degrees: number): string {
  const d = ((degrees % 360) + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8]
}
