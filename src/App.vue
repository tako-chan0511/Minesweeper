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
const history: any[] = ref([])

// Board.vue から「動いたよ」のたびに呼ばれる
function pushHistory(state: any) {
  // deep copy して積む
  history.value.push(JSON.parse(JSON.stringify(state)))
}

// Undo
function undo() {
  if (history.value.length<=1) return
  // 末尾を pop して、Board.vue に最新状態を emit し直す
  history.value.pop()
  const prev = history.value[history.value.length-1]
  // Board.vue 側で v-model 相当 or props.watch で受け取って再描画
  // 例: boardState.value = prev
}
</script>
