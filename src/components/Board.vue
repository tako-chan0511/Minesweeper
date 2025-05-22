<template>
  <div class="board-container">
    <!-- 操作コントロール -->
    <div class="controls">
      <!-- サイズ・地雷数の設定 -->
      <label>
        幅:
        <input type="number" v-model.number="pendingWidth" min="5" max="30" />
      </label>
      <label>
        高さ:
        <input type="number" v-model.number="pendingHeight" min="5" max="30" />
      </label>
      <label>
        地雷数:
        <input
          type="number"
          v-model.number="pendingMines"
          :min="1"
          :max="pendingWidth * pendingHeight - 1"
        />
      </label>
      <!-- 設定完了 -->
      <button @click="applySettings">設定完了</button>
      <!-- 再スタート（現在の設定でリセット） -->
      <button @click="initBoard">再スタート</button>
      <!-- 残りUndo回数 -->
      <span class="undo-info">
        (残りUndo: {{ maxUndoAfterLose - undoUsedAfterLose }})
      </span>
    </div>

    <!-- 盤面表示 -->
    <div
      class="board"
      :style="{
        gridTemplateColumns: `repeat(${width}, 30px)`,
        gridTemplateRows:    `repeat(${height}, 30px)`
      }"
    >
      <Cell
        v-for="cell in cells"
        :key="cell.id"
        :cell="cell"
        :onReveal="() => revealCell(cell)"
        :onToggleFlag="() => toggleFlag(cell)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
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

// — 設定用のバインド変数 —
const pendingWidth  = ref(10);
const pendingHeight = ref(10);
const pendingMines  = ref(15);

// — 実際に使用する盤面パラメータ —
const width      = ref(10);
const height     = ref(10);
const minesCount = ref(15);

// — 盤面セルと履歴管理 —
const cells = reactive<CellType[]>([]);
const maxUndoAfterLose    = 3;
const undoUsedAfterLose   = ref(0);

interface Snapshot { cells: CellType[] }
const historyStack = ref<Snapshot[]>([]);
const historyIndex = ref(-1);

// 操作前に履歴を保存
function saveHistory() {
  // 「取り消し」操作後の履歴は切り捨て
  historyStack.value.splice(historyIndex.value + 1);
  historyStack.value.push({
    cells: cells.map(c => ({ ...c }))
  });
  historyIndex.value = historyStack.value.length - 1;
}

// Undo（地雷踏み時のみ使用）
// function undo() {
//   if (historyIndex.value <= 0) return;
//   historyIndex.value--;
//   const prev = historyStack.value[historyIndex.value].cells;
//   cells.splice(0, cells.length, ...prev.map(c => ({ ...c })));
// }

// 設定を反映して再初期化
function applySettings() {
  const inProgress = cells.some(c => c.revealed || c.flagged);
  if (inProgress) {
    const ok = confirm(
      'ゲーム途中ですが、現在のゲームを終了して新しい設定を適用しますか？\n' +
      '「OK」で再スタート、キャンセルで継続します。'
    );
    if (!ok) return;
  }
  width.value = pendingWidth.value;
  height.value = pendingHeight.value;
  minesCount.value = pendingMines.value;
  initBoard();
}

// 盤面初期化
function initBoard() {
  cells.length = 0;
  let id = 0;
  // 1. 空セルを生成
  for (let y = 0; y < height.value; y++) {
    for (let x = 0; x < width.value; x++) {
      cells.push({
        id, x, y,
        isMine:   false,
        adjacent: 0,
        revealed: false,
        flagged:  false
      });
      id++;
    }
  }
  // 2. 地雷をランダム配置
  let placed = 0;
  while (placed < minesCount.value) {
    const idx = Math.floor(Math.random() * cells.length);
    if (!cells[idx].isMine) {
      cells[idx].isMine = true;
      placed++;
    }
  }
  // 3. 周囲地雷数を計算
  for (const c of cells) {
    if (!c.isMine) {
      c.adjacent = neighbors(c).filter(n => n.isMine).length;
    }
  }
  // 履歴リセット
  historyStack.value = [];
  historyIndex.value = -1;
  undoUsedAfterLose.value = 0;
  saveHistory();
}

onMounted(initBoard);

// 隣接セル取得
function neighbors(c: CellType): CellType[] {
  return cells.filter(n =>
    Math.abs(n.x - c.x) <= 1 &&
    Math.abs(n.y - c.y) <= 1 &&
    !(n.x === c.x && n.y === c.y)
  );
}

// --- 新：再帰的に履歴を取らずに開示する本体関数 ---
function doReveal(c: CellType) {
  if (c.revealed || c.flagged) return;
  c.revealed = true;
  if (c.adjacent === 0) {
    neighbors(c).forEach(n => {
      doReveal(n);
    });
  }
  checkWin();
}

// セルを開く（１クリック＝１履歴保存）
function revealCell(c: CellType) {
  if (c.revealed || c.flagged) return;

  // 地雷を踏んだときの特別処理
  if (c.isMine) {
    // 地雷を踏んでも状態を戻さず、単に選び直しを促す
    // Undo回数を消費して残りを減らす
    if (undoUsedAfterLose.value < maxUndoAfterLose) {
      undoUsedAfterLose.value++;
    }
    const remaining = maxUndoAfterLose - undoUsedAfterLose.value;
    alert(`💥 BOOM! 地雷です。\n残りUndo: ${remaining}`);
    return;
  }

  // 通常の開示処理：ここだけ履歴を保存
  saveHistory();
  doReveal(c);
}

// フラグトグル（クリックごとに履歴）
function toggleFlag(c: CellType) {
  if (!c.revealed) {
    saveHistory();
    c.flagged = !c.flagged;
  }
}

// 全セルを開示
function revealAll() {
  cells.forEach(c => c.revealed = true);
}

// 勝利判定＋メッセージ
function checkWin() {
  const won = cells
    .filter(c => !c.isMine)
    .every(c => c.revealed);
  if (won) {
    alert('🎉 You Win! 🎉');
    revealAll();
  }
}
</script>

<style scoped>
.board-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.controls {
  margin-bottom: 8px;
}
.controls label {
  margin-right: 8px;
  font-size: 0.9em;
}
.controls input {
  width: 4ch;
  margin-left: 4px;
}
.controls button {
  margin-left: 8px;
}
.undo-info {
  margin-left: 12px;
  font-size: 0.9em;
  color: #666;
}
.board {
  display: grid;
  gap: 2px;
}
</style>
