<template>
  <div
    class="cell"
    :class="{
      hidden: !cell.revealed,
      mine: cell.revealed && cell.isMine,
      flagged: cell.flagged
    }"
    @click="reveal()"
    @contextmenu.prevent="toggleFlag()"
  >
    <span v-if="cell.revealed && !cell.isMine && cell.adjacent>0">
      {{ cell.adjacent }}
    </span>
    <span v-if="cell.flagged">🚩</span>
    <span v-if="cell.revealed && cell.isMine">💣</span>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';
import type { CellType } from './Board.vue';

const props = defineProps<{
  cell: CellType;
  onReveal: () => void;
  onToggleFlag: () => void;
}>();

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
