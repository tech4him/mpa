import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AgentOrchestrator } from '@/lib/agents/core/agent-orchestrator'

// Global orchestrator instances per user
const orchestrators = new Map<string, AgentOrchestrator>()

async function getOrchestrator(userId: string): Promise<AgentOrchestrator> {
  if (!orchestrators.has(userId)) {
    const orchestrator = new AgentOrchestrator({ userId, autoStart: false })
    await orchestrator.initialize()
    orchestrators.set(userId, orchestrator)
  }
  return orchestrators.get(userId)!
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    const orchestrator = await getOrchestrator(user.id)

    switch (action) {
      case 'status':
        const statuses = orchestrator.getAgentStatuses()
        return NextResponse.json({ statuses })

      case 'approvals':
        const approvals = await orchestrator.getApprovalQueue()
        return NextResponse.json({ approvals })

      default:
        return NextResponse.json({ 
          message: 'Agent orchestrator API',
          availableActions: ['status', 'approvals']
        })
    }
  } catch (error) {
    console.error('Agent orchestrator error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, agentId, config } = body

    const orchestrator = await getOrchestrator(user.id)

    switch (action) {
      case 'start':
        if (agentId) {
          await orchestrator.startAgent(agentId)
          return NextResponse.json({ message: `Agent ${agentId} started` })
        } else {
          await orchestrator.startAll()
          return NextResponse.json({ message: 'All agents started' })
        }

      case 'stop':
        if (agentId) {
          await orchestrator.stopAgent(agentId)
          return NextResponse.json({ message: `Agent ${agentId} stopped` })
        } else {
          await orchestrator.stopAll()
          return NextResponse.json({ message: 'All agents stopped' })
        }

      case 'pause':
        if (!agentId) {
          return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
        }
        await orchestrator.pauseAgent(agentId)
        return NextResponse.json({ message: `Agent ${agentId} paused` })

      case 'resume':
        if (!agentId) {
          return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
        }
        await orchestrator.resumeAgent(agentId)
        return NextResponse.json({ message: `Agent ${agentId} resumed` })

      case 'update_config':
        if (!agentId || !config) {
          return NextResponse.json({ error: 'Agent ID and config required' }, { status: 400 })
        }
        await orchestrator.updateAgentConfig(agentId, config)
        return NextResponse.json({ message: `Agent ${agentId} config updated` })

      case 'approve':
        const { approvalId } = body
        if (!approvalId) {
          return NextResponse.json({ error: 'Approval ID required' }, { status: 400 })
        }
        await orchestrator.approveAction(approvalId)
        return NextResponse.json({ message: `Action ${approvalId} approved` })

      case 'reject':
        const { approvalId: rejectId, reason } = body
        if (!rejectId) {
          return NextResponse.json({ error: 'Approval ID required' }, { status: 400 })
        }
        await orchestrator.rejectAction(rejectId, reason)
        return NextResponse.json({ message: `Action ${rejectId} rejected` })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Agent orchestrator error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agentId, config } = body

    if (!agentId || !config) {
      return NextResponse.json(
        { error: 'Agent ID and config required' },
        { status: 400 }
      )
    }

    const orchestrator = await getOrchestrator(user.id)
    await orchestrator.updateAgentConfig(agentId, config)

    return NextResponse.json({ 
      message: `Agent ${agentId} configuration updated`,
      config 
    })
  } catch (error) {
    console.error('Agent config update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const agentId = url.searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    const orchestrator = await getOrchestrator(user.id)
    await orchestrator.stopAgent(agentId)

    // Remove from database
    await supabase
      .from('agent_configs')
      .update({ enabled: false })
      .eq('id', agentId)
      .eq('user_id', user.id)

    return NextResponse.json({ message: `Agent ${agentId} deleted` })
  } catch (error) {
    console.error('Agent deletion error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}