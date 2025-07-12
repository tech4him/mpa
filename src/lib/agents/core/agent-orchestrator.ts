import { BaseAgent, AgentStatus, AgentConfig } from './base-agent'
import { EmailAutonomousAgent } from '../email-autonomous-agent'
import { createClient } from '@/lib/supabase/server'
import { EventEmitter } from 'events'

interface OrchestratorConfig {
  userId: string
  autoStart?: boolean
}

interface AgentRegistration {
  agent: BaseAgent
  startedAt?: Date
  status: AgentStatus
}

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<string, AgentRegistration> = new Map()
  private userId: string
  private isRunning = false

  constructor(private config: OrchestratorConfig) {
    super()
    this.userId = config.userId
  }

  async initialize(): Promise<void> {
    console.log('[Orchestrator] Initializing agent orchestrator...')
    
    // Load agent configurations from database
    const configs = await this.loadAgentConfigs()
    
    // Register agents based on configs
    for (const config of configs) {
      await this.registerAgent(config)
    }

    if (this.config.autoStart) {
      await this.startAll()
    }
  }

  private async loadAgentConfigs(): Promise<AgentConfig[]> {
    const supabase = await createClient()
    
    // Load user's agent configurations
    const { data: configs, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', this.userId)
      .eq('enabled', true)

    if (error) {
      console.error('[Orchestrator] Error loading configs:', error)
      return this.getDefaultConfigs()
    }

    // If no configs exist, create defaults
    if (!configs || configs.length === 0) {
      return this.getDefaultConfigs()
    }

    return configs.map(c => ({
      id: c.id,
      name: c.agent_type,
      description: c.description || '',
      userId: c.user_id,
      autonomyLevel: c.autonomy_level,
      checkInterval: c.config.checkInterval || 60000,
      rules: c.config.rules || []
    }))
  }

  private getDefaultConfigs(): AgentConfig[] {
    return [
      {
        id: `email-agent-${this.userId}`,
        name: 'Email Agent',
        description: 'Processes emails autonomously',
        userId: this.userId,
        autonomyLevel: 'semi-autonomous',
        checkInterval: 60000, // Check every minute
        rules: [
          { condition: 'email.from.vip', action: 'notify' },
          { condition: 'email.contains.financial', action: 'block' },
          { condition: 'confidence < 0.8', action: 'block', threshold: 0.8 }
        ]
      }
    ]
  }

  async registerAgent(config: AgentConfig): Promise<void> {
    console.log(`[Orchestrator] Registering agent: ${config.name}`)
    
    let agent: BaseAgent

    // Create appropriate agent based on type
    switch (config.name) {
      case 'Email Agent':
        agent = new EmailAutonomousAgent(config)
        break
      // Add more agent types as they're created
      default:
        console.warn(`[Orchestrator] Unknown agent type: ${config.name}`)
        return
    }

    // Set up event listeners
    agent.on('agent.started', (event) => this.handleAgentEvent('started', event))
    agent.on('agent.stopped', (event) => this.handleAgentEvent('stopped', event))
    agent.on('agent.error', (event) => this.handleAgentEvent('error', event))
    agent.on('agent.notification', (event) => this.handleAgentEvent('notification', event))

    // Register the agent
    this.agents.set(config.id, {
      agent,
      status: 'idle'
    })
  }

  async startAll(): Promise<void> {
    console.log('[Orchestrator] Starting all agents...')
    this.isRunning = true
    
    const startPromises: Promise<void>[] = []
    
    for (const [id, registration] of this.agents) {
      startPromises.push(this.startAgent(id))
    }

    await Promise.all(startPromises)
    console.log('[Orchestrator] All agents started')
  }

  async stopAll(): Promise<void> {
    console.log('[Orchestrator] Stopping all agents...')
    this.isRunning = false
    
    const stopPromises: Promise<void>[] = []
    
    for (const [id, registration] of this.agents) {
      stopPromises.push(this.stopAgent(id))
    }

    await Promise.all(stopPromises)
    console.log('[Orchestrator] All agents stopped')
  }

  async startAgent(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId)
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`)
    }

    try {
      await registration.agent.start()
      registration.startedAt = new Date()
      registration.status = 'running'
    } catch (error) {
      console.error(`[Orchestrator] Failed to start agent ${agentId}:`, error)
      registration.status = 'error'
      throw error
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId)
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`)
    }

    try {
      await registration.agent.stop()
      registration.status = 'idle'
    } catch (error) {
      console.error(`[Orchestrator] Failed to stop agent ${agentId}:`, error)
      throw error
    }
  }

  async pauseAgent(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId)
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await registration.agent.pause()
    registration.status = 'paused'
  }

  async resumeAgent(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId)
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await registration.agent.resume()
    registration.status = 'running'
  }

  async updateAgentConfig(agentId: string, config: Partial<AgentConfig>): Promise<void> {
    const registration = this.agents.get(agentId)
    if (!registration) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Update in database
    const supabase = await createClient()
    await supabase
      .from('agent_configs')
      .update({
        autonomy_level: config.autonomyLevel,
        config: {
          checkInterval: config.checkInterval,
          rules: config.rules
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)

    // Update running agent
    registration.agent.updateConfig(config)
  }

  getAgentStatuses(): { [agentId: string]: any } {
    const statuses: { [agentId: string]: any } = {}
    
    for (const [id, registration] of this.agents) {
      statuses[id] = {
        id,
        name: registration.agent.getConfig().name,
        status: registration.status,
        metrics: registration.agent.getMetrics(),
        config: registration.agent.getConfig(),
        startedAt: registration.startedAt
      }
    }

    return statuses
  }

  getAgentStatus(agentId: string): any {
    const registration = this.agents.get(agentId)
    if (!registration) {
      return null
    }

    return {
      id: agentId,
      name: registration.agent.getConfig().name,
      status: registration.status,
      metrics: registration.agent.getMetrics(),
      config: registration.agent.getConfig(),
      startedAt: registration.startedAt
    }
  }

  private handleAgentEvent(type: string, event: any): void {
    console.log(`[Orchestrator] Agent event: ${type}`, event)
    
    // Re-emit for UI components
    this.emit(`agent.${type}`, event)
    
    // Store important events in database
    if (['error', 'notification', 'approval_requested'].includes(type)) {
      this.storeAgentEvent(type, event)
    }
  }

  private async storeAgentEvent(type: string, event: any): Promise<void> {
    const supabase = await createClient()
    
    try {
      await supabase.from('agent_events').insert({
        agent_id: event.agentId,
        user_id: event.userId,
        event_type: type,
        payload: event.payload,
        created_at: event.timestamp
      })
    } catch (error) {
      console.error('[Orchestrator] Failed to store event:', error)
    }
  }

  async getApprovalQueue(): Promise<any[]> {
    const supabase = await createClient()
    
    const { data: approvals } = await supabase
      .from('agent_approvals')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    return approvals || []
  }

  async approveAction(approvalId: string): Promise<void> {
    const supabase = await createClient()
    
    // Update approval status
    await supabase
      .from('agent_approvals')
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', approvalId)

    // TODO: Trigger the agent to execute the approved action
  }

  async rejectAction(approvalId: string, reason?: string): Promise<void> {
    const supabase = await createClient()
    
    await supabase
      .from('agent_approvals')
      .update({ 
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', approvalId)
  }
}