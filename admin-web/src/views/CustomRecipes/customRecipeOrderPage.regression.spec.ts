import { describe, expect, it } from 'vitest'
// 用 Vite 的 `?raw` 读源码：admin-web 的 vitest 是 node 环境（没有 jsdom），
// Element Plus 页面挂不起来，所以接线用"读源码断言"锁住，
// 真正的算法（过敏比对、倒计时）放在 utils 里由单测真跑。
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import orderList from '@/views/CustomRecipes/OrderList.vue?raw'
import config from '@/views/CustomRecipes/Config.vue?raw'
import customRecipeApiSource from '@/api/customRecipe.ts?raw'

/**
 * 定制单后台改造的接线回归（2026-10-04）。
 *
 * 对应老板的八条：一键交付 / 重新交付 / 手工表单校验 / 档案最新信息 /
 * 退款与时效 / 状态文案统一 / 按钮按角色显示 / 报错要具体。
 */
describe('一键交付与重新交付（第 1、2 条）', () => {
  it('已付款/制作中/已交付都出现交付区，状态判断走白名单', () => {
    expect(orderDetail).toContain('<div class="recipe-creation-section" v-if="canDeliver">')
    expect(orderDetail).toContain('const canDeliver = computed(() => canDeliverCustomRecipe(order.value?.status));')
  })

  it('候选食谱走新接口，页面自己不发请求', () => {
    expect(orderDetail).toContain('customRecipeApi.listRecipeCandidates(props.orderId)')
    expect(orderDetail).toContain('<h3>{{ isRedelivery ? \'重新交付食谱\' : \'从已设计好的食谱交付\' }}</h3>')
  })

  it('候选列表展示名称 / 版本 / 更新时间 / 当前已挂', () => {
    expect(orderDetail).toContain('{{ candidate.name }}')
    expect(orderDetail).toContain('v{{ candidate.version }} · 更新于 {{ formatDateTime(candidate.updatedAt) }}')
    expect(orderDetail).toContain('v-if="candidate.linkedToThisOrder"')
    expect(orderDetail).toContain('当前已挂')
  })

  it('点交付调用 deliver-recipe，并在成功后刷新详情', () => {
    expect(orderDetail).toContain('await customRecipeApi.deliverRecipe(orderId, candidate.recipeId);')
    expect(orderDetail).toContain('await loadOrderDetail();')
    expect(orderDetail).toContain('await loadRecipeCandidates();')
    expect(orderDetail).toContain("emit('refresh');")
  })

  it('候选为空时给出可执行的空态，并保留「在设计器中设计」入口', () => {
    expect(orderDetail).toContain('description="这只狗还没有已发布的定制食谱，请先在设计器里设计并发布"')
    expect(orderDetail).toContain('@click="openInDesigner"')
    expect(orderDetail).toContain('在设计器中设计')
  })

  it('重新交付要二次确认，并写清"替换 + 再次通知"（口径 4）', () => {
    expect(orderDetail).toContain('将用所选食谱《${candidate.name}》替换订单 ${orderId} 当前交付的食谱，并再次给顾客发送通知。')
    expect(orderDetail).toContain("confirmButtonText: '确认重新交付'")
    expect(orderDetail).toContain("{{ isRedelivery ? '重新交付' : '交付到订单' }}")
  })

  it('重新交付默认不预选，换食谱必须是有意识的选择', () => {
    expect(orderDetail).toContain('selectedCandidateId.value = isRedelivery.value')
  })
})

describe('手工创建表单的校验与二次确认（第 3 条）', () => {
  it('表单挂上 rules，名称 / 能量密度 / 食材都有必填校验', () => {
    expect(orderDetail).toContain(':rules="recipeFormRules"')
    expect(orderDetail).toContain('prop="name"')
    expect(orderDetail).toContain('prop="energyDensityKcalPerKg"')
    expect(orderDetail).toContain('prop="items"')
    expect(orderDetail).toContain('请填写食谱名称，顾客收到的通知里会显示它')
    expect(orderDetail).toContain('至少添加一个食材，否则这不算一份食谱')
  })

  it('每一行食材也必须选食材、占比大于 0（否则提交会撞外键 500）', () => {
    expect(orderDetail).toContain('行还没选食材')
    expect(orderDetail).toContain('行的占比必须大于 0')
  })

  it('校验不通过就不提交，且提示缺什么', () => {
    expect(orderDetail).toContain('if (!(await validateElementForm(recipeFormRef.value))) {')
    expect(orderDetail).toContain("ElMessage.warning('请先补全：食谱名称、能量密度、至少一个食材');")
  })

  it('提交前的确认框写清狗名、订单号、金额（防串单）', () => {
    expect(orderDetail).toContain('把手工填写的《${recipeForm.name.trim()}》交付给「${dogName}」？')
    expect(orderDetail).toContain('订单号：${orderNo}　金额：¥${amount}')
  })
})

describe('档案最新信息与来源标注（第 4 条）', () => {
  it('档案最新的过敏（结构化记录 + 设计备注）单独展示', () => {
    expect(orderDetail).toContain('过敏（档案最新）')
    expect(orderDetail).toContain('v-for="(record, index) in order.dog.allergyRecords"')
    expect(orderDetail).toContain('设计备注里记录的过敏：{{ order.dog.allergyFoods }}')
  })

  it('下单时填写的那份仍单独展示，两个口径不混在一起', () => {
    expect(orderDetail).toContain('过敏史（下单时填写）')
    expect(orderDetail).toContain('疾病史（下单时填写）')
  })

  it('两份不一致时提示"下单后档案有更新，请按最新信息设计"', () => {
    expect(orderDetail).toContain('compareDogProfileAllergies(order.value?.dog, order.value?.allergies)')
    expect(orderDetail).toContain('v-if="allergyComparison.changed"')
    expect(orderDetail).toContain('title="下单后档案有更新，请按最新信息设计"')
  })
})

describe('退款与时效信息（第 5 条）', () => {
  it('退款状态 / 金额 / 到账时间都有，且未成功时提示核查', () => {
    expect(orderDetail).toContain('Boolean(order.value?.refundStatus)')
    expect(orderDetail).toContain('getCustomRecipeRefundStatusText(order.value?.refundStatus)')
    expect(orderDetail).toContain('Number(order.refundAmount)')
    expect(orderDetail).toContain('formatDateTime(order.refundedAt)')
    expect(orderDetail).toContain('退款尚未确认成功，请到微信商户平台核实后再答复顾客。')
  })

  it('支付流水号、取消原因与取消时间都展示', () => {
    expect(orderDetail).toContain('order.paymentTransactionId')
    expect(orderDetail).toContain('order.cancelledAt')
    expect(orderDetail).toContain('order.cancellationReason')
    expect(orderDetail).toContain('order.inProgressAt')
  })

  it('详情页的预计交付带倒计时/超期高亮', () => {
    expect(orderDetail).toContain('getEstimatedDeliveryInfo(order.value?.estimatedDeliveryDate, order.value?.status)')
    expect(orderDetail).toContain('v-if="deliveryInfo.overdue"')
  })

  it('列表页有「预计交付」列与超期标记', () => {
    expect(orderList).toContain('<el-table-column label="预计交付" width="160">')
    expect(orderList).toContain('getEstimatedDeliveryInfo(order.estimatedDeliveryDate, order.status)')
    expect(orderList).toContain(":class=\"{ 'overdue-text': getDeliveryInfo(row).overdue }\"")
  })
})

describe('状态文案只有一份字典（第 6 条）', () => {
  it('详情页与列表页都用共享字典，已取消不再是英文 CANCELLED', () => {
    expect(orderDetail).toContain('getCustomRecipeStatusText(order.value?.status)')
    expect(orderDetail).toContain('getCustomRecipeStatusTagType(order.value?.status)')
    expect(orderList).toContain('getCustomRecipeStatusText(row.status)')
    expect(orderList).toContain('getCustomRecipeStatusTagType(row.status)')
  })

  it('两个页面都不再自己维护状态 map（防"改一处漏一处"复发）', () => {
    expect(orderDetail).not.toContain("PENDING_PAYMENT: '待付款'")
    expect(orderList).not.toContain("PENDING_PAYMENT: '待付款'")
    expect(orderDetail).toContain("from '@/constants/customRecipeOrder'")
    expect(orderList).toContain("from '@/constants/customRecipeOrder'")
  })
})

describe('敏感按钮按角色显示（口径 2，第 7 条）', () => {
  it('交付 / 取消 / 恢复额度都由 isAdmin 控制，非管理员看到说明', () => {
    expect(orderDetail).toContain('const isAdmin = useIsAdmin();')
    expect(orderDetail).toContain("{{ ADMIN_ONLY_TIP }}：交付食谱（含重新交付）会给顾客发通知，只有管理员能做")
    expect(orderDetail).toContain("v-if=\"isAdmin && order.status !== 'DELIVERED' && order.status !== 'CANCELLED'\"")
    expect(orderDetail).toContain('{{ ADMIN_ONLY_TIP }}：恢复抵扣额度')
  })

  it('设置页入口对客服置灰并写明原因，而不是让人点了吃 403', () => {
    expect(orderList).toContain('const isAdmin = useIsAdmin();')
    expect(orderList).toContain(':content="`${ADMIN_ONLY_TIP}：食谱定制设置`"')
    expect(config).toContain('const isAdmin = useIsAdmin();')
    expect(config).toContain('只允许管理员修改，当前账号只能查看')
    expect(config).toContain(':disabled="!isAdmin"')
  })
})

describe('报错要具体（第 8 条）', () => {
  it('三个页面都取后端返回的原因，不再只有"操作失败"', () => {
    expect(orderDetail).toContain("getApiErrorMessage(error, '交付失败')")
    expect(orderDetail).toContain("getApiErrorMessage(error, '加载订单详情失败')")
    expect(orderList).toContain("getApiErrorMessage(error, '加载订单列表失败')")
    expect(config).toContain("getApiErrorMessage(error, '保存失败，请重试')")
    expect(orderDetail).not.toContain("ElMessage.error('操作失败')")
    expect(orderDetail).not.toContain("ElMessage.error('提交失败')")
  })

  it('用户点"取消"不算失败，不会弹红色报错', () => {
    expect(orderDetail).toContain('if (!isUserCancel(error)) {')
    expect(orderList).toContain('if (!isUserCancel(error)) {')
  })
})

describe('接口调用统一收在 api 层（铁律 2）', () => {
  it('三个页面都不再自己拼 /admin/custom-recipe 路径', () => {
    expect(orderDetail).not.toContain("'/admin/custom-recipe'")
    expect(orderList).not.toContain("'/admin/custom-recipe'")
    expect(config).not.toContain("'/admin/custom-recipe'")
  })

  it('新接口都在 api/customRecipe.ts 里声明', () => {
    expect(customRecipeApiSource).toContain('const BASE = \'/admin/custom-recipe\'')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/recipe-candidates`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/deliver-recipe`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/create-recipe`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/restore-credit`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/confirm-payment`')
  })
})
