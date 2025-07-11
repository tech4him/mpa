import { createClient } from '@/lib/supabase/server'
import { InboxZeroEngine, InboxZeroSummary } from './inbox-zero-engine'

export interface InboxZeroBriefingInsights {
  inbox_status: 'zero' | 'manageable' | 'overwhelming' | 'critical'
  unread_count: number
  processing_efficiency: number
  top_senders_need_attention: string[]
  automated_actions_summary: {
    archived_count: number
    deleted_count: number
    confidence_score: number
  }
  recommendations: string[]
  urgent_items_count: number
}

export class InboxZeroBriefingIntegration {
  private inboxZero: InboxZeroEngine

  constructor(private userId: string) {
    this.inboxZero = new InboxZeroEngine(userId)
  }

  private async getSupabase() {
    return await createClient(true) // Use service role
  }

  /**
   * Get inbox zero insights for executive briefing
   */
  async getInboxZeroInsights(): Promise<InboxZeroBriefingInsights> {
    try {
      // Get current inbox status
      const unreadCount = await this.getUnreadCount()
      const recentProcessing = await this.getRecentProcessingSummary()
      const urgentItems = await this.getUrgentItemsCount()

      // Determine inbox status
      const inboxStatus = this.determineInboxStatus(unreadCount)

      // Calculate processing efficiency
      const processingEfficiency = this.calculateProcessingEfficiency(recentProcessing)

      // Get top senders needing attention
      const topSenders = await this.getTopSendersNeedingAttention()

      // Generate recommendations
      const recommendations = this.generateInboxRecommendations(
        unreadCount, 
        recentProcessing, 
        urgentItems
      )

      return {
        inbox_status: inboxStatus,
        unread_count: unreadCount,
        processing_efficiency: processingEfficiency,
        top_senders_need_attention: topSenders,
        automated_actions_summary: {
          archived_count: recentProcessing?.auto_archived || 0,
          deleted_count: recentProcessing?.auto_deleted || 0,
          confidence_score: recentProcessing?.avg_confidence || 0
        },
        recommendations,
        urgent_items_count: urgentItems
      }
    } catch (error) {
      console.error('Failed to get inbox zero insights:', error)
      return this.getDefaultInsights()
    }
  }

  /**
   * Trigger automated inbox processing if needed
   */
  async triggerSmartProcessingIfNeeded(): Promise<InboxZeroSummary | null> {
    const unreadCount = await this.getUnreadCount()
    
    // Auto-process if inbox has more than 20 unread emails
    if (unreadCount > 20) {
      try {
        return await this.inboxZero.processInboxForZero()
      } catch (error) {
        console.error('Auto-processing failed:', error)
        return null
      }
    }
    
    return null
  }

  /**
   * Get inbox zero recommendations for daily briefing
   */
  async getDailyInboxRecommendations(): Promise<string[]> {
    const insights = await this.getInboxZeroInsights()
    const recommendations = []

    if (insights.inbox_status === 'overwhelming' || insights.inbox_status === 'critical') {
      recommendations.push(`🚨 Inbox needs immediate attention: ${insights.unread_count} unread emails`)
      recommendations.push('💡 Consider running AI-powered inbox zero processing')
    }

    if (insights.urgent_items_count > 0) {
      recommendations.push(`⚡ ${insights.urgent_items_count} urgent emails require immediate response`)
    }

    if (insights.processing_efficiency < 70) {
      recommendations.push('📈 Email processing efficiency is low - review AI automation rules')
    }

    if (insights.top_senders_need_attention.length > 0) {
      recommendations.push(
        `👥 Key stakeholders need responses: ${insights.top_senders_need_attention.slice(0, 3).join(', ')}`
      )
    }

    return recommendations
  }

  private async getUnreadCount(): Promise<number> {
    const supabase = await this.getSupabase()
    const { count } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('is_read', false)
      .eq('is_deleted', false)

    return count || 0
  }

  private async getRecentProcessingSummary() {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('inbox_zero_processing_log')
      .select('*')
      .eq('user_id', this.userId)
      .gte('processed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('processed_at', { ascending: false })
      .limit(1)
      .single()

    if (!data) return null

    // Calculate average confidence from results summary
    const avgConfidence = data.results_summary?.length > 0
      ? data.results_summary.reduce((sum: number, r: any) => sum + (r.confidence || 0), 0) / data.results_summary.length
      : 0

    return {
      auto_archived: data.results_summary?.filter((r: any) => r.auto_action === 'archive').length || 0,
      auto_deleted: data.results_summary?.filter((r: any) => r.auto_action === 'delete').length || 0,
      total_processed: data.total_processed || 0,
      avg_confidence: Math.round(avgConfidence)
    }
  }

  private async getUrgentItemsCount(): Promise<number> {
    const supabase = await this.getSupabase()
    const { count } = await supabase
      .from('email_triage_results')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('priority', 'urgent')
      .eq('requires_attention', true)

    return count || 0
  }

  private async getTopSendersNeedingAttention(): Promise<string[]> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('email_messages')
      .select('from_name, from_email')
      .eq('user_id', this.userId)
      .eq('is_read', false)
      .eq('is_deleted', false)
      .not('from_name', 'is', null)
      .limit(10)

    if (!data) return []

    // Count occurrences and return top senders
    const senderCounts = data.reduce((acc: any, email: any) => {
      const sender = email.from_name || email.from_email
      acc[sender] = (acc[sender] || 0) + 1
      return acc
    }, {})

    return Object.entries(senderCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([sender]) => sender)
  }

  private determineInboxStatus(unreadCount: number): 'zero' | 'manageable' | 'overwhelming' | 'critical' {
    if (unreadCount === 0) return 'zero'
    if (unreadCount <= 10) return 'manageable'
    if (unreadCount <= 50) return 'overwhelming'
    return 'critical'
  }

  private calculateProcessingEfficiency(recentProcessing: any): number {
    if (!recentProcessing || recentProcessing.total_processed === 0) return 0
    
    const autoActionRate = (recentProcessing.auto_archived + recentProcessing.auto_deleted) / recentProcessing.total_processed
    const confidenceScore = recentProcessing.avg_confidence / 100
    
    return Math.round((autoActionRate * 0.6 + confidenceScore * 0.4) * 100)
  }

  private generateInboxRecommendations(
    unreadCount: number, 
    recentProcessing: any, 
    urgentItems: number
  ): string[] {
    const recommendations = []

    if (unreadCount > 50) {
      recommendations.push('Run immediate AI-powered inbox zero processing')
      recommendations.push('Consider enabling automatic daily processing')
    } else if (unreadCount > 20) {
      recommendations.push('Schedule focused inbox processing session')
    }

    if (urgentItems > 0) {
      recommendations.push(`Review ${urgentItems} urgent items immediately`)
    }

    if (recentProcessing && recentProcessing.avg_confidence < 80) {
      recommendations.push('Review and improve email processing rules for better accuracy')
    }

    if (!recentProcessing) {
      recommendations.push('Enable AI-powered email processing to maintain inbox zero')
    }

    return recommendations
  }

  private getDefaultInsights(): InboxZeroBriefingInsights {
    return {
      inbox_status: 'manageable',
      unread_count: 0,
      processing_efficiency: 0,
      top_senders_need_attention: [],
      automated_actions_summary: {
        archived_count: 0,
        deleted_count: 0,
        confidence_score: 0
      },
      recommendations: ['Enable inbox zero processing to get insights'],
      urgent_items_count: 0
    }
  }
}