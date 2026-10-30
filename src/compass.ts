/**
 * Headings as LMO shows them. A heading is 0° along +z and 90° along +x (the server's), but the
 * game's camera looks along heading 45°: pressing up walks that way, and that is the game's (and
 * its designers') north. +z is up and left on screen (north-west; Jungle Arena's "NW" pads are its
 * +z side, "NE" its +x side), so heading arrows are drawn turned −45°: up is north as in game.
 */
export const NORTH_HEADING = 45

/** The angle to draw a heading at (degrees clockwise from up). */
export const screenAngle = (degrees: number) => degrees - NORTH_HEADING

/** The game's compass point of a heading in degrees (N is heading 45°, NW +z, NE +x). */
export function compassPoint(degrees: number): string {
  const d = (((degrees - NORTH_HEADING) % 360) + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8]
}
