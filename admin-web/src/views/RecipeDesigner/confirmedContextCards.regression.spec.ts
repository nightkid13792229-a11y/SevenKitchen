import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/RecipeAgentDrawer.vue?raw'

describe('已确认的方案/选材卡', () => {
  it('确认后不再固定挂在每条回复下面', () => {
    expect(drawerSource).toContain('session?.plan && !session.planConfirmedAt')
    expect(drawerSource).toContain(
      'session?.selection && !session.selectionConfirmedAt',
    )
  })
})
