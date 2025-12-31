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
      <span>⬜ 残り安全: <strong>{{ remainingSafeCells }}</strong></span>
      <span class="undo-info">
        (Undo: {{ maxUndoAfterLose - undoUsedAfterLose }})
      </span>
    </div>

    <div class="probability-bar">
      地雷確率: 
      <span :style="{ color: probabilityColor, fontWeight: 'bold' }">
        {{ hoveredProbability }}
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
        @mouseover="onMouseOverCell(cell)"
        @mouseleave="onMouseLeaveCell"
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

// ホバー中の確率表示用
const hoveredProbability = ref('---');
const probabilityColor = ref('black');

// 残り地雷数
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

// ————————————————
// ★確率計算ロジック（厳密版）
// ————————————————
function onMouseOverCell(target: CellType) {
  // 既に開いている or 旗は計算不要
  if (target.revealed) {
    hoveredProbability.value = '0%';
    probabilityColor.value = '#ccc';
    return;
  }
  if (target.flagged) {
    hoveredProbability.value = '100% (Flag)';
    probabilityColor.value = 'red';
    return;
  }

  // 1. 周囲のヒント（数字マス）を収集
  // targetに隣接する数字マスたち
  const adjacentClues = neighbors(target).filter(n => n.revealed && !n.isMine);

  let maxProb = -1.0;
  let minProb = 2.0; // 0%確定を見つけるために使用

  // ヒントが一つもない場合
  if (adjacentClues.length === 0) {
    const totalUnknown = cells.filter(x => !x.revealed && !x.flagged).length;
    const totalMinesLeft = remainingMinesCount.value;
    if (totalUnknown > 0) {
      let p = totalMinesLeft / totalUnknown;
      p = Math.max(0, Math.min(1, p));
      hoveredProbability.value = `${(p * 100).toFixed(1)}% (全体)`;
      probabilityColor.value = '#666';
    } else {
      hoveredProbability.value = '0%';
      probabilityColor.value = '#666';
    }
    return;
  }

  // ヒントがある場合：各ヒントについて確率を計算し、最も厳しい条件を採用する
  for (const clueA of adjacentClues) {
    // Aの未開封近傍セル（Set A）
    const hiddenNeighborsA = neighbors(clueA).filter(n => !n.revealed && !n.flagged);
    // Aの残り必要爆弾数
    const minesNeededA = clueA.adjacent - neighbors(clueA).filter(n => n.flagged).length;

    // --- ① 基本確率 (Local Probability) ---
    if (hiddenNeighborsA.length > 0) {
      const p = minesNeededA / hiddenNeighborsA.length;
      if (p > maxProb) maxProb = p;
      if (p < minProb) minProb = p;
    }

    // --- ② 集合差分確率 (Subset / Strict Probability) ---
    // Clue A の近傍にある、別の Clue B を探す
    const nearbyClues = neighbors(clueA).filter(n => n.revealed && !n.isMine && n.id !== clueA.id);

    for (const clueB of nearbyClues) {
      // Bの未開封近傍セル（Set B）
      const hiddenNeighborsB = neighbors(clueB).filter(n => !n.revealed && !n.flagged);
      const minesNeededB = clueB.adjacent - neighbors(clueB).filter(n => n.flagged).length;

      // 【判定】Set B が Set A の「部分集合」か？
      // (Bの未開封セルがすべて、Aの未開封セルに含まれているか)
      const isSubset = hiddenNeighborsB.every(b => hiddenNeighborsA.some(a => a.id === b.id));

      if (isSubset) {
        // 部分集合の場合、「差分エリア（A - B）」の確率を確定できる
        const diffCount = hiddenNeighborsA.length - hiddenNeighborsB.length;
        const diffMines = minesNeededA - minesNeededB;

        if (diffCount > 0) {
          // target が「B側（内側）」にいるのか、「差分側（外側）」にいるのか確認
          const targetInB = hiddenNeighborsB.some(b => b.id === target.id);
          
          if (!targetInB) {
            // target は「差分エリア」にいる → (差分爆弾 / 差分マス数)
            let pStrict = diffMines / diffCount;
            // 補正
            pStrict = Math.max(0, Math.min(1, pStrict));

            // より厳しい条件（高い確率 or 0%）があれば更新
            if (pStrict > maxProb) maxProb = pStrict;
            // 0% (安全) が判明した場合も重要
            if (pStrict < minProb) minProb = pStrict;
          }
        }
      }
    }
  }

  // 結果の整形
  // もし計算の結果、確率が0以下（安全確定）なら0%を表示
  if (minProb <= 0.000001) {
    maxProb = 0;
  } else if (maxProb < 0) {
    maxProb = 0;
  } else if (maxProb > 1) {
    maxProb = 1;
  }

  hoveredProbability.value = `${(maxProb * 100).toFixed(1)}%`;

  // 色分け：100%は赤、0%は青、それ以外は危険度に応じて
  if (maxProb >= 0.99) {
    probabilityColor.value = 'red';
  } else if (maxProb <= 0.01) {
    probabilityColor.value = 'blue'; // 安全確定
  } else if (maxProb >= 0.5) {
    probabilityColor.value = 'orange';
  } else {
    probabilityColor.value = 'black';
  }
}

function onMouseLeaveCell() {
  hoveredProbability.value = '---';
  probabilityColor.value = 'black';
}

// ————————————————
// 既存ロジック（変更なし）
// ————————————————

function saveHistory() {
  historyStack.value.splice(historyIndex.value + 1);
  historyStack.value.push({
    cells: cells.map(c => ({ ...c }))
  });
  historyIndex.value = historyStack.value.length - 1;
}

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

function initBoard() {
  cells.length = 0;
  let id = 0;
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
  let placed = 0;
  while (placed < minesCount.value) {
    const idx = Math.floor(Math.random() * cells.length);
    if (!cells[idx].isMine) {
      cells[idx].isMine = true;
      placed++;
    }
  }
  for (const c of cells) {
    if (!c.isMine) {
      c.adjacent = neighbors(c).filter(n => n.isMine).length;
    }
  }
  historyStack.value = [];
  historyIndex.value = -1;
  undoUsedAfterLose.value = 0;
  saveHistory();
  onMouseLeaveCell();
}

onMounted(initBoard);

function neighbors(c: CellType): CellType[] {
  return cells.filter(n =>
    Math.abs(n.x - c.x) <= 1 &&
    Math.abs(n.y - c.y) <= 1 &&
    !(n.x === c.x && n.y === c.y)
  );
}

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

function revealCell(c: CellType) {
  if (c.revealed || c.flagged) return;
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
  onMouseOverCell(c);
}

function toggleFlag(c: CellType) {
  if (c.revealed) return;
  if (c.flagged) {
    saveHistory();
    c.flagged = false;
    onMouseOverCell(c);
    return;
  }
  const surr = neighbors(c);
  for (const n of surr) {
    if (n.revealed && !n.isMine) {
      const ns = neighbors(n);
      const currentFlagCount = ns.filter(x => x.flagged).length;
      if (currentFlagCount >= n.adjacent) {
        return; 
      }
    }
  }
  saveHistory();
  c.flagged = true;
  onMouseOverCell(c);
}

function revealAll() {
  cells.forEach(c => c.revealed = true);
}

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
  margin-bottom: 5px;
  padding: 8px;
  background-color: #f9f9f9;
  border-radius: 4px;
  display: flex;
  gap: 15px;
  font-family: monospace;
  font-size: 1.1em;
}
.probability-bar {
  margin-bottom: 10px;
  font-family: monospace;
  font-size: 1.2em;
  height: 1.5em;
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