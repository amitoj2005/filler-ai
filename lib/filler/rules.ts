// TODO: move validation, flood fill, territory tracking, win detection
// - validateMove(state, player, color): reject colors that are the player's current
//   color or the opponent's current color
// - floodFill(board, territory, color): expand territory to all adjacent cells of
//   the chosen color, return updated territory set
// - checkWin(state): true when all 56 cells are claimed; winner is larger territory
// - GameState type: board, p1Territory, p2Territory, currentTurn, status
