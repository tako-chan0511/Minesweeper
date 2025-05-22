<template>
  <div class="board">
    <Cell
      v-for="cell in cells"
      :key="cell.id"
      :cell="cell"
      :onReveal="() => revealCell(cell)"
      :onToggleFlag="() => toggleFlag(cell)"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted } from 'vue';
import Cell from './Cell.vue';

export interface CellType {
  id: number;
  x: number;
  y: number;
  isMine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

const width = 10, height = 10, minesCount = 15;
const cells = reactive<CellType[]>([]);

function initBoard() {
  cells.length = 0;
  // 1) 空のマスを作る
  let id = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ id: id++, x, y, isMine: false, adjacent: 0, revealed: false, flagged: false });
    }
  }
  // 2) ランダムに地雷を配置
  let placed = 0;
  while (placed < minesCount) {
    const idx = Math.floor(Math.random() * cells.length);
    if (!cells[idx].isMine) {
      cells[idx].isMine = true;
      placed++;
    }
  }
  // 3) 各マスの周囲地雷数を計算
  for (const c of cells) {
    if (c.isMine) continue;
    c.adjacent = neighbors(c).filter(n => n.isMine).length;
  }
}

// 周囲8方向のセルを返すヘルパー
function neighbors(c: CellType) {
  const dirs = [-1,0,1];
  return cells.filter(n =>
    Math.abs(n.x - c.x) <= 1 &&
    Math.abs(n.y - c.y) <= 1 &&
    !(n.x===c.x && n.y===c.y)
  );
}

// クリック時の処理
function revealCell(c: CellType) {
  if (c.revealed || c.flagged) return;
  c.revealed = true;
  // 周囲に地雷がなければ連鎖的に開く
  if (c.adjacent === 0 && !c.isMine) {
    for (const n of neighbors(c)) {
      if (!n.revealed) revealCell(n);
    }
  }
  checkWinOrLose(c);
}

function toggleFlag(c: CellType) {
  if (!c.revealed) c.flagged = !c.flagged;
}

// 勝利・敗北判定
function checkWinOrLose(last: CellType) {
  if (last.isMine) {
    alert('💥 BOOM! Game Over');
    revealAll();
  } else if (cells.every(c => (c.isMine && !c.flagged) || (!c.isMine && c.revealed))) {
    alert('🎉 You Win!');
    revealAll();
  }
}

function revealAll() {
  for (const c of cells) c.revealed = true;
}

onMounted(initBoard);
</script>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(10, 30px);
  grid-template-rows: repeat(10, 30px);
  gap: 2px;
}
</style>
