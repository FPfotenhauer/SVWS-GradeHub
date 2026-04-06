<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { RouterView } from 'vue-router'

import ThemeHeader from '@/components/ThemeHeader.vue'

const route = useRoute()
const showGlobalThemeHeader = computed<boolean>(() => route.name !== 'admin')
</script>

<template>
  <div>
    <ThemeHeader v-if="showGlobalThemeHeader" />

    <RouterView />
  </div>
</template>
