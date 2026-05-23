import api from './index'

export interface CustomerServiceMessage {
  id: string
  conversationId: string
  provider: string
  providerMessageId: string | null
  direction: string
  eventType: string | null
  messageType: string | null
  content: string | null
  rawPayload: Record<string, unknown> | null
  createdAt: string
}

export interface CustomerServiceConversation {
  id: string
  provider: string
  externalConversationId: string | null
  openKfid: string | null
  externalUserId: string | null
  customerId: string | null
  orderId: string | null
  productId: string | null
  sourceType: string
  sourceTitle: string | null
  sourcePath: string | null
  status: string
  assignedStaffId: string | null
  lastMessageAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  messages?: CustomerServiceMessage[]
}

export interface CustomerServiceConversationListResponse {
  items: CustomerServiceConversation[]
  total: number
  page: number
  pageSize: number
}

export interface CustomerServiceConversationQuery {
  status?: string
  orderId?: string
  sourceType?: string
  page?: number
  pageSize?: number
}

export const customerServiceApi = {
  listConversations: (
    params?: CustomerServiceConversationQuery
  ): Promise<CustomerServiceConversationListResponse> =>
    api.get('/admin/customer-service/conversations', { params }),

  getConversation: (id: string): Promise<CustomerServiceConversation> =>
    api.get(`/admin/customer-service/conversations/${id}`),

  updateConversationStatus: (
    id: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
  ): Promise<CustomerServiceConversation> =>
    api.patch(`/admin/customer-service/conversations/${id}/status`, { status })
}

export default customerServiceApi
