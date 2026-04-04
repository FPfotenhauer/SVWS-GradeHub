<script setup lang="ts">
import { RouterView } from 'vue-router'

import ThemeHeader from '@/components/ThemeHeader.vue'
</script>

<template>
  <div>
    <ThemeHeader />

    <RouterView />
  </div>
</template>
