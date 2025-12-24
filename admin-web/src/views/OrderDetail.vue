<template>
  <div class="order-detail-page">
    <el-page-header @back="goBack" title="返回" />
    <el-card style="margin-top: 20px">
      <template #header>
        <span>订单详情 - {{ order?.id }}</span>
      </template>

      <el-descriptions v-if="order" :column="2" border>
        <el-descriptions-item label="订单ID">{{ order.id }}</el-descriptions-item>
        <el-descriptions-item label="客户ID">{{ order.customerId }}</el-descriptions-item>
        <el-descriptions-item label="狗狗ID">{{ order.dogId }}</el-descriptions-item>
        <el-descriptions-item label="收货地址ID">{{ order.addressId }}</el-descriptions-item>
        <el-descriptions-item label="订单类型">
          <el-tag>{{ order.type === 'FRESH_FOOD' ? '鲜食' : '定制服务' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="订单状态">
          <el-tag :type="getStatusType(order.status)">{{ getStatusText(order.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="商品金额">¥{{ order.amountProduct }}</el-descriptions-item>
        <el-descriptions-item label="运费">¥{{ order.amountShipping }}</el-descriptions-item>
        <el-descriptions-item label="总金额">¥{{ order.amountTotal }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatTime(order.paidAt) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="发货时间">{{ formatTime(order.shippedAt) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{ formatTime(order.completedAt) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="物流单号">{{ order.trackingNumber || '-' }}</el-descriptions-item>
        <el-descriptions-item label="快递公司">{{ order.carrierCode || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>订单商品</el-divider>
      <el-table :data="order?.items" style="width: 100%">
        <el-table-column prop="recipeSnapshot.name" label="食谱名称" />
        <el-table-column prop="quantityG" label="重量(g)" />
        <el-table-column prop="packageCount" label="包装数量" />
        <el-table-column prop="packageSpecG" label="每袋规格(g)" />
        <el-table-column prop="dailyIntakeG" label="日摄入(g)" />
      </el-table>

      <el-divider>价格明细</el-divider>
      <el-descriptions v-if="order?.pricingBreakdown" :column="2" border>
        <el-descriptions-item label="原料成本">¥{{ order.pricingBreakdown.costIngredients }}</el-descriptions-item>
        <el-descriptions-item label="包装成本">¥{{ order.pricingBreakdown.costPackaging }}</el-descriptions-item>
        <el-descriptions-item label="人工成本">¥{{ order.pricingBreakdown.costLabor }}</el-descriptions-item>
        <el-descriptions-item label="分摊费用">¥{{ order.pricingBreakdown.costOverhead }}</el-descriptions-item>
        <el-descriptions-item label="总成本">¥{{ order.pricingBreakdown.totalProductCost }}</el-descriptions-item>
        <el-descriptions-item label="产品价格">¥{{ order.pricingBreakdown.productPrice }}</el-descriptions-item>
        <el-descriptions-item label="运费">¥{{ order.pricingBreakdown.shippingFee }}</el-descriptions-item>
        <el-descriptions-item label="总价">¥{{ order.pricingBreakdown.totalPrice }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { orderApi } from '@/api'

const route = useRoute()
const router = useRouter()
const order = ref<any>(null)

const getStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    PAID: 'success',
    PENDING_PAYMENT: 'warning',
    IN_PRODUCTION: 'primary',
    SHIPPED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return typeMap[status] || ''
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PAID: '已支付',
    PENDING_PAYMENT: '待支付',
    IN_PRODUCTION: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  }
  return textMap[status] || status
}

const formatTime = (time: string | null) => {
  if (!time) return null
  return new Date(time).toLocaleString('zh-CN')
}

const loadOrder = async () => {
  try {
    const data = await orderApi.getDetail(route.params.id as string)
    order.value = data
  } catch (error) {
    ElMessage.error('加载订单详情失败')
  }
}

const goBack = () => {
  router.back()
}

onMounted(() => {
  loadOrder()
})
</script>

<style scoped>
.order-detail-page {
  padding: 0;
}
</style>
