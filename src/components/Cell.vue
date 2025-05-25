<template>
  <div
    class="cell"
    :class="{
      hidden: !cell.revealed,
      mine: cell.revealed && cell.isMine,
      flagged: cell.flagged
    }"
    @mousedown="onMouseDown"
    @mouseup="onMouseUp"
    @mouseleave="onMouseLeave"
    @touchstart.prevent="onTouchStart"
    @touchend.prevent="onTouchEnd"
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
import { ref } from 'vue'
import type { CellType } from './Board.vue'

const props = defineProps<{
  cell: CellType
  onReveal: () => void
  onToggleFlag: () => void
}>()

// 長押し検出用
const pressTimer = ref<number | null>(null)
const PRESS_THRESHOLD = 500  // ms

function clearPress() {
  if (pressTimer.value !== null) {
    clearTimeout(pressTimer.value)
    pressTimer.value = null
  }
}

// モバイル／PC長押し開始
function startPress() {
  clearPress()
  pressTimer.value = window.setTimeout(() => {
    props.onToggleFlag()
    clearPress()
  }, PRESS_THRESHOLD)
}

// PC 左ボタン押下
function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  startPress()
}

// PC 左ボタン離す
function onMouseUp(e: MouseEvent) {
  if (e.button !== 0) return
  if (pressTimer.value !== null) {
    // 長押し閾値に達していなければ「開く」
    clearPress()
    props.onReveal()
  }
}

// マウスがセル外に出たらキャンセル
function onMouseLeave() {
  clearPress()
}

// モバイル タッチ開始
function onTouchStart() {
  startPress()
}

// モバイル タッチ終了
function onTouchEnd() {
  if (pressTimer.value !== null) {
    clearPress()
    props.onReveal()
  }
}

// PC 右クリック／コンテキストメニュー
function toggleFlag() {
  if (!props.cell.revealed) {
    props.onToggleFlag()
  }
}
</script>

<style scoped>
.cell {
  width: 30px;
  height: 30px;
  border: 1px solid #444;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.cell.hidden {
  background: #ccc;
  cursor: pointer;
}
.cell.revealed {
  background: #eee;
}
.cell.flagged {
  background: #ffc;
}
.cell.mine {
  background: #f88;
}
</style>
