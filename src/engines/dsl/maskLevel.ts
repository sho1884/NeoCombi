// Mask-level convention (UR-008 / SR-090).
//
// A factor's "mask level" is the level whose value is exactly the fixed
// sentinel string defined here. The token is part of the level value
// itself — there is no separate data-model flag, so detection is exact
// string match.
//
// The sentinel `_MASK_` is a plain identifier (letters and underscores),
// so it is a valid bare level value in both NeoCombi's DSL and PICT.
// The DSL source can therefore be passed directly to PICT with no
// translation layer (per ADR-001 the DSL is a strict subset of PICT).
// The leading and trailing underscores follow the widely understood
// "framework-magic name" convention (Python's _private / __dunder__),
// signalling at a glance that this is not an ordinary level value.
//
// See:
//   - Doc/requirements/system_requirements.yaml SR-090
//   - Doc/requirements/user_requirements.yaml UR-008
//   - memory/pict_quirk_quoted_levels.md (why an angle-bracketed sentinel
//     was rejected)

import type { LevelNode, LevelValue } from '../../types/dsl'

export const MASK_LEVEL = '_MASK_'

export function isMaskLevel(value: LevelValue | string): boolean {
  return typeof value === 'string' && value === MASK_LEVEL
}

export function isMaskLevelNode(level: LevelNode): boolean {
  // The sentinel parses as either an Identifier (bare `_MASK_` in
  // parameter declarations) or a StringLevel (quoted `"_MASK_"` if
  // someone writes it that way). Either node type is accepted.
  return (
    (level.type === 'identifier' || level.type === 'string') &&
    level.value === MASK_LEVEL
  )
}
