import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { ChangeKey, LeistungsChange, LeistungsFeld } from '@/types/changes'

export const useChangeStore = defineStore('change', () => {
  const changes = shallowRef<Map<ChangeKey, LeistungsChange>>(new Map())

  const hasChanges = computed<boolean>(() => changes.value.size > 0)
  const changeCount = computed<number>(() => changes.value.size)

  function setChange(change: LeistungsChange): void {
    const key = `${change.schuelerId}:${change.lerngruppenId}:${change.feld}` as ChangeKey
    const next = new Map(changes.value)
    if (change.alterWert === change.neuerWert) {
      next.delete(key)
    } else {
      next.set(key, change)
    }
    changes.value = next
  }

  function getChange(
    schuelerId: number,
    lerngruppenId: number,
    feld: LeistungsFeld,
  ): LeistungsChange | undefined {
    const key = `${schuelerId}:${lerngruppenId}:${feld}` as ChangeKey
    return changes.value.get(key)
  }

  function reset(): void {
    changes.value = new Map()
  }

  return {
    changes,
    hasChanges,
    changeCount,
    setChange,
    getChange,
    reset,
  }
})

// Naechster Schritt: Undo/Redo-Stack auf Basis des Change-Buffers ergaenzen.
