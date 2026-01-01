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
      情報: 
      <span :style="{ color: infoColor, fontWeight: 'bold' }">
        {{ hoveredInfo }}
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
  probability: number;
}

// — 設定 —
const pendingWidth  = ref(10);
const pendingHeight = ref(10);
const pendingMines  = ref(15);

// — 状態 —
const width      = ref(10);
const height     = ref(10);
const minesCount = ref(15);

const cells = reactive<CellType[]>([]);
const maxUndoAfterLose    = 10;
const undoUsedAfterLose   = ref(0);

interface Snapshot { cells: CellType[] }
const historyStack = ref<Snapshot[]>([]);
const historyIndex = ref(-1);

const hoveredInfo = ref('---');
const infoColor = ref('black');

const remainingMinesCount = computed(() => {
  const flags = cells.filter(c => c.flagged).length;
  return minesCount.value - flags;
});

const remainingSafeCells = computed(() => {
  const totalSafe = (width.value * height.value) - minesCount.value;
  const revealedSafe = cells.filter(c => c.revealed && !c.isMine).length;
  return totalSafe - revealedSafe;
});

// ——————————————————————————————————————
// ★高速・高精度ハイブリッドソルバー (最終調整版)
// ——————————————————————————————————————

// 高速な隣接取得 (Index Access)
function getNeighborIndices(idx: number): number[] {
  const w = width.value;
  const h = height.value;
  const cx = idx % w;
  const cy = Math.floor(idx / w);
  const res: number[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        res.push(ny * w + nx);
      }
    }
  }
  return res;
}

function calculateProbabilities() {
  // 1. 初期化
  cells.forEach(c => {
    if (c.revealed) c.probability = 0;
    else if (c.flagged) c.probability = 1;
    else c.probability = -1; // 未計算マーク
  });

  // 2. 境界セルの特定
  const boundaryIndices = new Set<number>();
  const activeClueIndices = new Set<number>();

  cells.forEach((c, idx) => {
    if (c.revealed && !c.isMine && c.adjacent > 0) {
      const nIdxs = getNeighborIndices(idx);
      // 未開封かつ旗でない隣接マスがあるか
      const hasUnknown = nIdxs.some(ni => !cells[ni].revealed && !cells[ni].flagged);
      if (hasUnknown) {
        activeClueIndices.add(idx);
        nIdxs.forEach(ni => {
          if (!cells[ni].revealed && !cells[ni].flagged) {
            boundaryIndices.add(ni);
          }
        });
      }
    }
  });

  const boundaryList = Array.from(boundaryIndices);

  // 3. コンポーネント分割 (連結成分分解)
  const components: number[][] = [];
  const visited = new Set<number>();

  for (const bIdx of boundaryList) {
    if (visited.has(bIdx)) continue;

    const component: number[] = [];
    const queue = [bIdx];
    visited.add(bIdx);

    while (queue.length > 0) {
      const currIdx = queue.shift()!;
      component.push(currIdx);

      // currに隣接する「有効なヒント」を探す
      const nIdxs = getNeighborIndices(currIdx);
      const adjClues = nIdxs.filter(ni => activeClueIndices.has(ni));

      for (const clueIdx of adjClues) {
        // そのヒントが共有している「他の境界セル」も同じグループ
        const clueNeighbors = getNeighborIndices(clueIdx);
        for (const cnIdx of clueNeighbors) {
          if (boundaryIndices.has(cnIdx) && !visited.has(cnIdx)) {
            visited.add(cnIdx);
            queue.push(cnIdx);
          }
        }
      }
    }
    components.push(component);
  }

  // 4. 各コンポーネントの計算
  let predictedBoundaryMines = 0;

  for (const comp of components) {
    // 厳密解法 (<=18マス) または 近似解法
    if (comp.length <= 18) {
      solveExact(comp);
    } else {
      solveApprox(comp);
    }

    comp.forEach(idx => {
      predictedBoundaryMines += cells[idx].probability;
    });
  }

  // 5. 残りの「奥地」の確率
  // ★重要修正：ここで境界セル(boundary)の値は絶対にいじらない
  const deepUnknowns = cells.filter(c => c.probability === -1);
  
  if (deepUnknowns.length > 0) {
    let remainingMines = remainingMinesCount.value - predictedBoundaryMines;
    
    // 計算誤差でマイナスになるのを防ぐ
    if (remainingMines < 0) remainingMines = 0;
    
    // 奥地の地雷数が残り地雷数を超えないようにする（矛盾回避）
    if (remainingMines > deepUnknowns.length) remainingMines = deepUnknowns.length;

    const p = remainingMines / deepUnknowns.length;
    
    // 奥地のセルだけに一律適用
    deepUnknowns.forEach(c => c.probability = p);
  }
}

  /**
   * クリックした「数字セル」の周辺だけ、確率合計が
   * 「その数字が要求する地雷数」に一致するように局所的に再調整します。
   *
   * 例) 数字=2、周囲未確定マスが3つで合計確率が1.97などズレた場合、
   *     周囲3マスの確率だけを合計2.0に揃えます（0〜1に収める）。
   *
   * ※あくまでヒューリスティックです（厳密ソルバではない）。
   */
  function recalcLocalAroundNumber(center: CellType) {
    if (!center.revealed) return;
    if (center.mine) return;
    if (center.adjacent <= 0) return;

    const nIdx = getNeighborIndices(center.x, center.y);

    const unknown: CellType[] = [];
    let flagged = 0;
    for (const idx of nIdx) {
      const c = cells[idx];
      if (c.flagged) {
        flagged += 1;
        continue;
      }
      if (!c.revealed) unknown.push(c);
    }

    if (unknown.length === 0) return;

    // その数字セルの周囲で「まだ地雷であるべき数」
    const targetRaw = center.adjacent - flagged;
    const target = Math.max(0, Math.min(targetRaw, unknown.length));

    // 現在の周囲確率合計
    const clamp01 = (p: number) => Math.max(0, Math.min(1, p));
    const eps = 1e-9;

    const probs = unknown.map((c) => clamp01(c.probability));
    let fixedOnes = 0;

    // まずは単純スケールで目標合計に近づける（ゼロ割回避あり）
    const sum0 = probs.reduce((a, b) => a + b, 0);
    if (sum0 < eps) {
      const p = target / unknown.length;
      for (let i = 0; i < probs.length; i++) probs[i] = clamp01(p);
    } else {
      const scale = target / sum0;
      for (let i = 0; i < probs.length; i++) probs[i] = clamp01(probs[i] * scale);
    }

    // [0,1] 制約付きで合計を target に合わせる（最大10回）
    const normalizeToSum = (arr: number[], tgt: number) => {
      for (let iter = 0; iter < 10; iter++) {
        const s = arr.reduce((a, b) => a + b, 0);
        const delta = tgt - s;
        if (Math.abs(delta) < 1e-6) break;

        const adjustable: number[] = [];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] > 0 && arr[i] < 1) adjustable.push(i);
        }
        if (adjustable.length === 0) break;

        if (delta > 0) {
          let cap = 0;
          for (const i of adjustable) cap += 1 - arr[i];
          if (cap < eps) break;
          for (const i of adjustable) arr[i] = clamp01(arr[i] + (delta * (1 - arr[i])) / cap);
        } else {
          let cap = 0;
          for (const i of adjustable) cap += arr[i];
          if (cap < eps) break;
          for (const i of adjustable) arr[i] = clamp01(arr[i] + (delta * arr[i]) / cap);
        }
      }
    };

    normalizeToSum(probs, target);

    // しきい値（5%未満→0、95%以上→1）を「局所の整合性を壊さない範囲」で反映
    const LOW = 0.05;
    const HIGH = 0.95;

    // 低確率は 0 に確定（安全寄りのヒューリスティック）
    let remainingTarget = target;
    const adjustableIdx: number[] = [];
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] <= LOW) {
        probs[i] = 0;
      } else {
        adjustableIdx.push(i);
      }
    }

    // 高確率は「確定しても残りの合計が作れる」範囲だけ 1 に確定
    adjustableIdx.sort((a, b) => probs[b] - probs[a]); // 高い順
    const stillAdjustable: number[] = [];
    for (let pos = 0; pos < adjustableIdx.length; pos++) {
      const i = adjustableIdx[pos];
      // i を 1 にすると仮定したときの実現可能性
      // fixedOnes+1 <= target かつ (fixedOnes+1) + (残り可変数) >= target
      const restCount = adjustableIdx.length - pos - 1;
      if (probs[i] >= HIGH && fixedOnes + 1 <= target && fixedOnes + 1 + restCount >= target) {
        probs[i] = 1;
        fixedOnes += 1;
      } else {
        stillAdjustable.push(i);
      }
    }

    remainingTarget = target - fixedOnes;

    // まだ調整が必要なら、残りの可変セルで合計を合わせる
    if (stillAdjustable.length > 0) {
      // 可変セルだけ取り出して正規化して戻す
      const sub = stillAdjustable.map((i) => probs[i]);
      normalizeToSum(sub, remainingTarget);

      for (let j = 0; j < stillAdjustable.length; j++) {
        probs[stillAdjustable[j]] = clamp01(sub[j]);
      }
    }

    // 反映
    for (let i = 0; i < unknown.length; i++) {
      unknown[i].probability = probs[i];
    }

    // 表示系（周辺確率合計など）を即更新したいので hover 情報更新
    onMouseOverCell(center);
  }


// ————————————————
// A. 厳密解法 (Backtracking)
// ————————————————
function solveExact(compIndices: number[]) {
  const compClues = new Set<number>();
  const idMap = new Map<number, number>(); // cellIndex -> localIndex
  
  compIndices.forEach((idx, i) => {
    idMap.set(idx, i);
    getNeighborIndices(idx).forEach(ni => {
      const c = cells[ni];
      if (c.revealed && !c.isMine && c.adjacent > 0) {
        compClues.add(ni);
      }
    });
  });

  const clueList = Array.from(compClues);
  // 制約条件の事前コンパイル
  const clueConstraints = clueList.map(clueIdx => {
    const clue = cells[clueIdx];
    const nIdxs = getNeighborIndices(clueIdx);
    const relevantLocalIndices: number[] = [];
    let placedFlags = 0;

    nIdxs.forEach(ni => {
      if (cells[ni].flagged) placedFlags++;
      else if (idMap.has(ni)) relevantLocalIndices.push(idMap.get(ni)!);
    });

    return {
      limit: clue.adjacent - placedFlags,
      locals: relevantLocalIndices
    };
  });

  let validCount = 0;
  const mineCounts = new Array(compIndices.length).fill(0);
  const currentAssignment = new Array(compIndices.length).fill(0);

  function backtrack(k: number) {
    if (k === compIndices.length) {
      // 最終チェック
      for (const constr of clueConstraints) {
        let mines = 0;
        for (const loc of constr.locals) mines += currentAssignment[loc];
        if (mines !== constr.limit) return;
      }
      validCount++;
      for (let i = 0; i < compIndices.length; i++) {
        if (currentAssignment[i] === 1) mineCounts[i]++;
      }
      return;
    }

    // 0 (Safe)
    currentAssignment[k] = 0;
    // 枝刈り簡易チェック（高速化のため一部のみ）
    if (checkPartial(k)) backtrack(k + 1);

    // 1 (Mine)
    currentAssignment[k] = 1;
    if (checkPartial(k)) backtrack(k + 1);
  }

  // 簡易枝刈り関数
  function checkPartial(k: number) {
    void k;
    // 現在決定したセル(k)が関与するヒントだけチェック
    // ※今回は実装簡略化のため、全探索でも十分速いのでスキップ
    // （本格的なソルバーならここで矛盾を弾く）
    return true;
  }

  backtrack(0);

  if (validCount > 0) {
    compIndices.forEach((idx, i) => {
      cells[idx].probability = mineCounts[i] / validCount;
    });
  } else {
    // 矛盾（解なし）の場合
    compIndices.forEach(idx => cells[idx].probability = 0);
  }
}

// ————————————————
// B. 近似解法 (Iterative) - 大規模エリア用
// ————————————————
function solveApprox(compIndices: number[]) {
  compIndices.forEach(idx => cells[idx].probability = 0.5);

  const compClues = new Set<number>();
  compIndices.forEach(idx => {
    getNeighborIndices(idx).forEach(ni => {
      const c = cells[ni];
      if (c.revealed && !c.isMine && c.adjacent > 0) compClues.add(ni);
    });
  });

  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    compClues.forEach(clueIdx => {
      const clue = cells[clueIdx];
      const nIdxs = getNeighborIndices(clueIdx);
      
      const unknowns = nIdxs.filter(ni => !cells[ni].revealed && !cells[ni].flagged);
      const flags = nIdxs.filter(ni => cells[ni].flagged).length;
      
      if (unknowns.length === 0) return;

      const targetSum = Math.max(0, clue.adjacent - flags);
      const currentSum = unknowns.reduce((sum, ni) => sum + cells[ni].probability, 0);

      if (currentSum === 0) return;

      const ratio = targetSum / currentSum;
      if (Math.abs(1 - ratio) < 0.001) return;

      unknowns.forEach(ni => {
        let p = cells[ni].probability * ratio;
        p = Math.max(0, Math.min(1, p));
        cells[ni].probability = p;
      });
      changed = true;
    });
    if (!changed) break;
  }
}


function onMouseOverCell(target: CellType) {
  // A. 数字マス：周辺合計を表示
  if (target.revealed && !target.isMine && target.adjacent > 0) {
    const nIdxs = getNeighborIndices(target.id);
    
    let probSum = 0;
    nIdxs.forEach(ni => {
      if (cells[ni].flagged) probSum += 1;
      else if (!cells[ni].revealed) probSum += cells[ni].probability;
    });
    
    const totalPercent = probSum * 100;
    
    // ★修正：四捨五入して整数で表示
    hoveredInfo.value = `数字「${target.adjacent}」周辺確率合計: ${Math.round(totalPercent)}%`;
    
    const diff = Math.abs(totalPercent - (target.adjacent * 100));
    // 厳密解法なので、誤差はほぼ0のはず
    infoColor.value = diff < 1 ? 'green' : 'red';
    return;
  }

  // B. 安全
  if (target.revealed) {
    hoveredInfo.value = '安全 (0%)';
    infoColor.value = '#ccc';
    return;
  }
  // C. 旗
  if (target.flagged) {
    hoveredInfo.value = '地雷想定 (100%)';
    infoColor.value = 'red';
    return;
  }

  // D. 未開封
  const p = target.probability;
  hoveredInfo.value = `地雷確率: ${(p * 100).toFixed(1)}%`;
  
  if (p >= 0.999) {
    infoColor.value = 'red';
    hoveredInfo.value = '地雷確定 (100%)';
  } else if (p <= 0.001) {
    infoColor.value = 'blue';
    hoveredInfo.value = '安全確定 (0%)';
  } else {
    infoColor.value = 'black';
  }
}

function onMouseLeaveCell() {
  hoveredInfo.value = '---';
  infoColor.value = 'black';
}

// ————————————————
// 既存ロジック
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
      'ゲーム途中ですが...（省略）'
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
        flagged:  false,
        probability: 0
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
      const nIdxs = getNeighborIndices(c.id);
      c.adjacent = nIdxs.filter(ni => cells[ni].isMine).length;
    }
  }
  historyStack.value = [];
  historyIndex.value = -1;
  undoUsedAfterLose.value = 0;
  saveHistory();
  onMouseLeaveCell();
  calculateProbabilities();
}

onMounted(initBoard);

function doReveal(c: CellType) {
  if (c.revealed || c.flagged) return;
  c.revealed = true;
  if (c.adjacent === 0) {
    const nIdxs = getNeighborIndices(c.id);
    nIdxs.forEach(ni => doReveal(cells[ni]));
  }
  checkWin();
}

function revealCell(c: CellType) {
  // 既に開いている数字セルをクリックしたら「周辺だけ再計算」する
  if (c.revealed) {
    recalcLocalAroundNumber(c);
    return;
  }
  if (c.flagged) return;
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
  calculateProbabilities();
  onMouseOverCell(c);
}

function toggleFlag(c: CellType) {
  if (c.revealed) return;
  if (c.flagged) {
    saveHistory();
    c.flagged = false;
    calculateProbabilities();
    onMouseOverCell(c);
    return;
  }
  const nIdxs = getNeighborIndices(c.id);
  for (const ni of nIdxs) {
    const n = cells[ni];
    if (n.revealed && !n.isMine) {
      const nNeighbors = getNeighborIndices(ni);
      const currentFlags = nNeighbors.filter(nni => cells[nni].flagged).length;
      if (currentFlags >= n.adjacent) return;
    }
  }
  
  saveHistory();
  c.flagged = true;
  calculateProbabilities();
  onMouseOverCell(c);
}

function revealAll() {
  cells.forEach(c => c.revealed = true);
}

function checkWin() {
  const won = cells.filter(c => !c.isMine).every(c => c.revealed);
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
  white-space: nowrap;
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