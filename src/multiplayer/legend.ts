export interface LegendRoles {
  pitcherId: string
  umpireId: string
}

/**
 * Legend is one game from the top of the eighth through the bottom of the
 * ninth. The two players trade pitcher/umpire roles after every three outs.
 */
export function legendRolesForOuts(firstPitcherId: string, playerIds: string[], totalOuts: number): LegendRoles {
  const first = playerIds.find((id) => id === firstPitcherId)
  const second = playerIds.find((id) => id !== firstPitcherId)
  if (!first || !second) throw new Error('Legend role assignment requires two distinct players.')
  const firstPitcherActive = Math.floor(Math.max(0, totalOuts) / 3) % 2 === 0
  return firstPitcherActive
    ? { pitcherId: first, umpireId: second }
    : { pitcherId: second, umpireId: first }
}
