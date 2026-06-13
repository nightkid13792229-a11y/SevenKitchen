import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe diy regressions', () => {
  it('hides loading safely after navigating to the generated DIY sheet', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('safeHideLoading()')
    expect(source).toContain('function safeHideLoading()')
    expect(source).toContain('fail: () => {}')
    expect(source).not.toContain('finally {\n    uni.hideLoading()')
  })

  it('defaults the selected dog from detail handoff before cached or first dog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const mountedSource = source.match(/onMounted\(async \(\) => \{[\s\S]*?\n}\)/)?.[0] || ''
    const loadDogsSource = source.match(
      /async function loadDogs\(\)[\s\S]*?\n}\n\nasync function selectDog/,
    )?.[0] || ''

    expect(source).toContain("const initialDogId = ref('')")
    expect(mountedSource).toContain("initialDogId.value = options.dogId || ''")
    expect(loadDogsSource).toContain('const preferredDogId = initialDogId.value || uni.getStorageSync(\'dogId\') || \'\'')
    expect(loadDogsSource).toContain('const preferredDog = res.data.find((dog: Dog) => dog.id === preferredDogId) || res.data[0]')
    expect(loadDogsSource).toContain('await selectDog(preferredDog.id)')
  })

  it('offers a quick switch to the selected dog matched life-stage recipe version', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const switchSource = source.match(
      /async function switchToRecommendedLifeStage[\s\S]*?\n}\n\nfunction dismissWarning/,
    )?.[0] || ''

    expect(templateSource).toContain('v-if="recommendedLifeStageOption"')
    expect(templateSource).toContain('@tap="switchToRecommendedLifeStage"')
    expect(templateSource).toContain("切换到{{ recommendedLifeStageOption.label }}")
    expect(source).toContain("const selectedLifeStage = ref('')")
    expect(source).toContain('availableLifeStageVersions?: RecipeLifeStageVersion[]')
    expect(source).toContain('const recommendedLifeStageOption = computed')
    expect(source).toContain('version.lifeStage === selectedDogRecipeLifeStage.value')
    expect(source).toContain('function resetDiyLifeStageDependentState')
    expect(switchSource).toContain('const option = recommendedLifeStageOption.value')
    expect(switchSource).toContain('selectedLifeStage.value = option.lifeStage')
    expect(switchSource).toContain('recipeId.value = option.recipeId')
    expect(switchSource).toContain('await loadRecipe()')
    expect(switchSource).toContain('await loadDogCalc(selectedDogId.value)')
    expect(switchSource).toContain('checkLifeStageMatch()')
  })

  it('explains that dog calories are a starting feeding suggestion for domestic city dogs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('起始喂食建议')
    expect(source).toContain('国内城市犬')
    expect(source).toContain('2-4周')
  })

  it('rounds recipe energy density before showing it to customers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain('formatEnergyDensityKcalPerKg')
    expect(source).toContain('../../utils/recipe-display')
    expect(source).toContain('const displayRecipeEnergyDensity = computed')
    expect(source).toContain('{{ displayRecipeEnergyDensity }} kcal/kg')
    expect(source).not.toContain('{{ recipe.energyDensityKcalPerKg || recipe.nutritionDetailedData?.energyDensityKcalPerKg }} kcal/kg')
  })

  it('mirrors the order dog selector and feeding context without purchase pricing copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('设计软件')
    expect(source).toContain("import { formatEnergyDensityKcalPerKg, formatRecipeFormulaSoftwareLabel } from '../../utils/recipe-display'")
    expect(source).toContain('const recipeFormulaSoftwareLabel = computed')
    expect(templateSource).toContain('{{ recipeFormulaSoftwareLabel }}')
    expect(templateSource).toContain('order-dog-scroll')
    expect(templateSource).toContain('order-dog-chip')
    expect(templateSource).toContain("['order-dog-chip', { active: dog.id === selectedDogId }]")
    expect(templateSource).toContain('@tap="selectDog(dog.id)"')
    expect(templateSource).toContain('order-dog-avatar')
    expect(templateSource).toContain('resolveDogAvatarSrc(dog.avatarUrl)')
    expect(templateSource).toContain('v-for="fact in dogProfileFacts"')
    expect(source).toContain('const dogProfileFacts = computed')
    expect(source).toContain("MALE: '弟弟'")
    expect(source).toContain("FEMALE: '妹妹'")
    expect(templateSource).toContain('每日参考')
    expect(templateSource).toContain('每餐约')
    expect(templateSource).toContain('主食能量')
    expect(templateSource).not.toContain('最低订购量')
    expect(templateSource).not.toContain('袋均价')
    expect(templateSource).not.toContain('确认订单')
  })

  it('uses configurable package plans for DIY sheets instead of purchase checkout pricing', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(source).toContain('ORDER_CYCLE_OPTIONS')
    expect(source).toContain('buildDefaultPackagePlan')
    expect(source).toContain('getPackagePlanTotal(normalizedPackagePlan.value)')
    expect(source).toContain('packagePlanInlineSummaryText')
    expect(source).toContain('isCustomPackagePlan')
    expect(source).toContain('cancelCustomPackagePlan')
    expect(source).toContain('请先取消自定义分装后再切换配置天数')
    expect(source).toContain('packagePlan: JSON.stringify(normalizedPackagePlan.value)')
    expect(source).toContain('packageCount: totalPackages.value')
    expect(source).toContain('packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value)')
    expect(templateSource).toContain('配置天数')
    expect(templateSource).toContain("{{ showPackageEditor ? '取消自定义' : '自定义分装' }}")
    expect(templateSource).toContain('v-for="(row, index) in packagePlan"')
    expect(templateSource).toContain('添加多个分装规格')
    expect(source).not.toContain('/orders/pricing/preview')
    expect(source).not.toContain('pricePreview')
    expect(source).not.toContain('minimumOrderMet')
  })
})
