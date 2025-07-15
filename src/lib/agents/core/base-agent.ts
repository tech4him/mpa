import { EventEmitter } from 'events'
import { createClient } from '@/lib/supabase/server'
import { Client as QStashClient } from '@upstash/qstash'

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error'
export type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'fully-autonomous'

export interface AgentConfig {
  id: string
  name: string
  description: string
  userId: string
  autonomyLevel: AutonomyLevel
  checkInterval: number // milliseconds
  rules?: AutonomyRule[]
}

export interface AutonomyRule {
  condition: string
  action: 'approve' | 'notify' | 'block'
  threshold?: number
}

export interface AgentMetrics {
  processed: number
  succeeded: number
  failed: number
  pending: number
  lastRun?: Date
  uptime: number
}

export interface AgentEvent {
  type: string
  agentId: string
  userId: string
  payload: any
  timestamp: Date
}

export interface AgentDecision {
  action: string
  confidence: number
  reasoning: string
  requiresApproval?: boolean
  context?: any
  metadata?: any
}

export abstract class BaseAgent<TItem = any, TDecision = AgentDecision> extends EventEmitter {
  protected status: AgentStatus = 'idle'
  protected metrics: AgentMetrics = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    pending: 0,
    uptime: 0
  }
  protected startTime?: Date
  protected isActive = false
  protected qstash: QStashClient

  constructor(protected config: AgentConfig) {
    super()
    this.qstash = new QStashClient({
      token: process.env.QSTASH_TOKEN!
    })
  }

  // Lifecycle methods
  async start(): Promise<void> {
    console.log(`[${this.config.name}] Starting agent...`)
    this.status = 'running'
    this.isActive = true
    this.startTime = new Date()
    
    // Emit start event
    await this.emitEvent({
      type: 'agent.started',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: { config: this.config },
      timestamp: new Date()
    })

    // Start the main loop
    this.run().catch(error => {
      console.error(`[${this.config.name}] Fatal error:`, error)
      this.status = 'error'
      this.isActive = false
    })
  }

  async stop(): Promise<void> {
    console.log(`[${this.config.name}] Stopping agent...`)
    this.isActive = false
    this.status = 'idle'
    
    await this.emitEvent({
      type: 'agent.stopped',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: { metrics: this.getMetrics() },
      timestamp: new Date()
    })
  }

  async pause(): Promise<void> {
    this.status = 'paused'
    await this.emitEvent({
      type: 'agent.paused',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: {},
      timestamp: new Date()
    })
  }

  async resume(): Promise<void> {
    this.status = 'running'
    await this.emitEvent({
      type: 'agent.resumed',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: {},
      timestamp: new Date()
    })
  }

  // Main agent loop - must be implemented by subclasses
  protected abstract run(): Promise<void>

  // Process a single item - must be implemented by subclasses
  protected abstract processItem(item: TItem, decision: TDecision): Promise<void>
  
  // Analyze an item - must be implemented by subclasses
  protected abstract analyzeItem(item: TItem): Promise<TDecision>

  // Get items to process - must be implemented by subclasses
  protected abstract getItemsToProcess(): Promise<TItem[]>
  
  // Get item type for logging - must be implemented by subclasses
  protected abstract getItemType(): string

  // Helper methods
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  protected async logAction(action: {
    action_type: string
    email_id?: string
    thread_id?: string
    description: string
    metadata?: any
  }): Promise<void> {
    const supabase = await createClient()
    await supabase.from('agent_actions').insert({
      agent_id: this.config.id,
      user_id: this.config.userId,
      action_type: action.action_type,
      email_id: action.email_id,
      thread_id: action.thread_id,
      description: action.description,
      metadata: action.metadata || {},
      status: 'completed'
    })
  }

  protected async flagForReview(item: TItem, priority: number = 3): Promise<void> {
    const supabase = await createClient()
    await supabase.from('intelligent_actions').insert({
      user_id: this.config.userId,
      action_type: 'flagged_for_review',
      title: `Item flagged for review by ${this.config.name}`,
      description: `Item requires manual review`,
      priority: priority,
      status: 'pending',
      metadata: {
        item: item,
        flaggedBy: this.config.id,
        itemType: this.getItemType()
      }
    })
  }

  protected async shouldProcess(item: any, decision: AgentDecision): Promise<boolean> {
    // Apply autonomy rules
    if (this.config.autonomyLevel === 'supervised') {
      // Always require approval
      await this.requestApproval(item, decision)
      return false
    }

    if (this.config.autonomyLevel === 'semi-autonomous') {
      // Check rules
      for (const rule of this.config.rules || []) {
        if (this.evaluateRule(rule, decision)) {
          if (rule.action === 'block') {
            await this.requestApproval(item, decision)
            return false
          } else if (rule.action === 'notify') {
            await this.notifyUser(item, decision)
            return true
          }
        }
      }
      return true
    }

    // Fully autonomous - process everything
    return true
  }

  protected evaluateRule(rule: AutonomyRule, decision: AgentDecision): boolean {
    // Simple rule evaluation - can be enhanced
    if (rule.condition.includes('confidence') && rule.threshold) {
      return decision.confidence < rule.threshold
    }
    // Add more rule evaluation logic as needed
    return false
  }

  protected async requestApproval(item: any, decision: AgentDecision): Promise<void> {
    const supabase = await createClient()
    
    // Check if approval already exists for this item
    const itemId = item.id || item.thread_id
    if (itemId) {
      const { data: existingApproval } = await supabase
        .from('agent_approvals')
        .select('id')
        .eq('user_id', this.config.userId)
        .eq('agent_id', this.config.id)
        .eq('status', 'pending')
        .eq('item_data->>id', itemId)
        .single()
      
      if (existingApproval) {
        console.log(`[${this.config.name}] Approval already exists for item: ${itemId}`)
        return
      }
    }

    await this.emitEvent({
      type: 'agent.approval_requested',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: { item, decision },
      timestamp: new Date()
    })
    
    // Store in database for user review
    await supabase.from('agent_approvals').insert({
      agent_id: this.config.id,
      user_id: this.config.userId,
      item_type: this.getItemType(),
      item_data: item,
      decision,
      status: 'pending'
    })
    
    console.log(`[${this.config.name}] Created approval request for: ${item.subject || item.id || 'unknown item'}`)
  }

  protected async notifyUser(item: any, decision: AgentDecision): Promise<void> {
    await this.emitEvent({
      type: 'agent.notification',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: { 
        message: `${this.config.name} processed an item`,
        item, 
        decision 
      },
      timestamp: new Date()
    })
  }

  protected async recordAction(action: string, context: any, outcome: 'success' | 'failure'): Promise<void> {
    const supabase = await createClient()
    await supabase.from('agent_actions').insert({
      agent_id: this.config.id,
      user_id: this.config.userId,
      action_type: action,
      context,
      outcome,
      timestamp: new Date()
    })

    // Update metrics
    this.metrics.processed++
    if (outcome === 'success') {
      this.metrics.succeeded++
    } else {
      this.metrics.failed++
    }
  }

  protected async emitEvent(event: AgentEvent): Promise<void> {
    // Emit locally
    this.emit(event.type, event)
    
    // Broadcast to other agents via QStash (skip for localhost)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
      
      // Skip QStash publishing for localhost/development
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        console.log(`[${this.config.name}] Skipping QStash event publishing in development mode`)
        return
      }
      
      const eventUrl = baseUrl.startsWith('http') ? `${baseUrl}/api/agents/events` : `https://${baseUrl}/api/agents/events`
      
      await this.qstash.publishJSON({
        url: eventUrl,
        body: event,
        retries: 3
      })
    } catch (error) {
      console.error(`[${this.config.name}] Failed to emit event:`, error)
    }
  }

  // Public methods
  getStatus(): AgentStatus {
    return this.status
  }

  getMetrics(): AgentMetrics {
    return {
      ...this.metrics,
      lastRun: new Date(),
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
    }
  }

  getConfig(): AgentConfig {
    return this.config
  }

  updateConfig(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config }
    this.emitEvent({
      type: 'agent.config_updated',
      agentId: this.config.id,
      userId: this.config.userId,
      payload: { config: this.config },
      timestamp: new Date()
    })
  }

  abstract getItemType(): string
}