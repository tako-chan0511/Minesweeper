<template>
  <div id="app">
    <h1>Minesweeper</h1>
    <Board />
    <button @click="reset">Restart</button>
  </div>
</template>

<script setup lang="ts">
import Board from './components/Board.vue';
const reset = () => window.location.reload();
</script>
