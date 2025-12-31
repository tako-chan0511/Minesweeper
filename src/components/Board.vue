<template>
  <div class="board-container">
    <div class="controls">
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
      <button @click="applySettings">設定完了</button>
      <button @click="initBoard">再スタート</button>
    </div>

    <div class="status-bar">
      <span>💣 残り地雷: <strong>{{ remainingMinesCount }}</strong></span>
      <span>⬜ 残り安全マス: <strong>{{ remainingSafeCells }}</strong></span>
      <span class="undo-info">
        (Undo残り: {{ maxUndoAfterLose - undoUsedAfterLose }})
      </span>
    </div>

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
import { reactive, ref, onMounted, computed } from 'vue';
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
const maxUndoAfterLose    = 10;
const undoUsedAfterLose   = ref(0);

interface Snapshot { cells: CellType[] }
const historyStack = ref<Snapshot[]>([]);
const historyIndex = ref(-1);

// 残り地雷数（設定地雷数 - 旗の数）
const remainingMinesCount = computed(() => {
  const flags = cells.filter(c => c.flagged).length;
  return minesCount.value - flags;
});

// 残り安全マス数
const remainingSafeCells = computed(() => {
  const totalSafe = (width.value * height.value) - minesCount.value;
  const revealedSafe = cells.filter(c => c.revealed && !c.isMine).length;
  return totalSafe - revealedSafe;
});

// 操作前に履歴を保存
function saveHistory() {
  historyStack.value.splice(historyIndex.value + 1);
  historyStack.value.push({
    cells: cells.map(c => ({ ...c }))
  });
  historyIndex.value = historyStack.value.length - 1;
}

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

// 再帰的に開く処理
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

// セルを開く
function revealCell(c: CellType) {
  if (c.revealed || c.flagged) return;

  // 地雷を踏んだ場合
  if (c.isMine) {
    if (undoUsedAfterLose.value < maxUndoAfterLose) {
      undoUsedAfterLose.value++;
      const remaining = maxUndoAfterLose - undoUsedAfterLose.value;
      alert(`💥 BOOM! 地雷です。\n残りUndo: ${remaining}`);
    } else {
      alert('💥 BOOM! Game Over');
      revealAll();
    }
    return;
  }

  saveHistory();
  doReveal(c);
}

// ★修正：旗を立てるロジック（数字以上の入力を禁止）
function toggleFlag(c: CellType) {
  if (c.revealed) return;

  // 1. 旗を「外す」場合 → 無条件でOK
  if (c.flagged) {
    saveHistory();
    c.flagged = false;
    return;
  }

  // 2. 旗を「立てる」場合 → 周囲の数字チェック
  const surr = neighbors(c);
  for (const n of surr) {
    // 隣接セルが開いていて、かつ数字（0以上の地雷数）を持っている場合
    if (n.revealed && !n.isMine) {
      // その数字マスの周りにある「現在の旗の数」を数える
      const ns = neighbors(n);
      const currentFlagCount = ns.filter(x => x.flagged).length;

      // 「現在の旗」が「数字」以上であれば、これ以上旗を置かせない
      if (currentFlagCount >= n.adjacent) {
        // ※必要であればここに alert('これ以上置けません') などを入れる
        return; 
      }
    }
  }

  // チェックを通過したら旗を立てる
  saveHistory();
  c.flagged = true;
}

// 全開示
function revealAll() {
  cells.forEach(c => c.revealed = true);
}

// 勝利判定
function checkWin() {
  const won = cells
    .filter(c => !c.isMine)
    .every(c => c.revealed);
  if (won) {
    setTimeout(() => {
      alert('🎉 You Win! 🎉');
      revealAll();
    }, 10);
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.controls label {
  font-size: 0.9em;
}
.controls input {
  width: 4ch;
  margin-left: 4px;
}

.status-bar {
  margin-bottom: 12px;
  padding: 8px;
  background-color: #f9f9f9;
  border-radius: 4px;
  display: flex;
  gap: 15px;
  font-family: monospace;
  font-size: 1.1em;
}

.undo-info {
  color: #666;
  font-size: 0.9em;
  align-self: center;
}

.board {
  display: grid;
  gap: 2px;
  background: #aaa;
  padding: 2px;
  border-radius: 4px;
}
</style>