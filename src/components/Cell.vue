<template>
  <div
    class="cell"
    :class="{
      hidden: !cell.revealed,
      mine: cell.revealed && cell.isMine,
      flagged: cell.flagged
    }"
    @mousedown.prevent="onMouseDown"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @contextmenu.prevent="toggleFlag"
  >
    <span v-if="cell.revealed && !cell.isMine && cell.adjacent > 0">
      {{ cell.adjacent }}
    </span>
    <span v-if="cell.flagged">🚩</span>
    <span v-if="cell.revealed && cell.isMine">💣</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CellType } from './Board.vue';

const props = defineProps<{
  cell: CellType;
  onReveal: () => void;
  onToggleFlag: () => void;
}>();

// 長押し検出用タイマー
const pressTimer = ref<number|undefined>(undefined);
const PRESS_THRESHOLD = 500; // ms

function clearPress() {
  if (pressTimer.value !== undefined) {
    clearTimeout(pressTimer.value);
    pressTimer.value = undefined;
  }
}

function startPress() {
  clearPress();
  pressTimer.value = window.setTimeout(() => {
    props.onToggleFlag();
    clearPress();
  }, PRESS_THRESHOLD);
}

function onMouseDown(e: MouseEvent) {
  if (e.button === 2) {
    // 右クリックは即フラグ
    props.onToggleFlag();
  } else {
    startPress();
  }
}

function onMouseUp() {
  if (pressTimer.value !== undefined) {
    // 長押ししきる前に離した → 開く
    clearPress();
    reveal();
  }
}

function onTouchStart() {
  startPress();
}

function onTouchEnd() {
  if (pressTimer.value !== undefined) {
    // 長押ししきる前に離した → 開く
    clearPress();
    reveal();
  }
}

function reveal() {
  if (!props.cell.flagged) props.onReveal();
}

function toggleFlag() {
  if (!props.cell.revealed) props.onToggleFlag();
}
</script>

<style scoped>
.cell {
  width: 30px; height: 30px;
  border: 1px solid #444;
  display: flex; align-items: center; justify-content: center;
  user-select: none;
}
.cell.hidden { background: #ccc; cursor: pointer; }
.cell.revealed { background: #eee; }
.cell.flagged { background: #ffc; }
.cell.mine { background: #f88; }
</style>
