<template>
  <div class="controls">
     Vue3 マインドスイパー
  </div>

  <!-- ↓ 既存の <Board> に props で渡す -->
  <Board :rows="rows" :cols="rows" :mines="mines" @move="pushHistory" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Board from './components/Board.vue'

const rows  = ref(16)
const mines = ref(Math.floor(16*16*0.15))

// Undo 用履歴スタック
// ヒストリーは any[] として持っておきます
const history = ref<any[]>([]);
// Board.vue から「動いたよ」のたびに呼ばれる
function pushHistory(state: any) {
  // deep copy して積む
  history.value.push(JSON.parse(JSON.stringify(state)))
}
</script>
