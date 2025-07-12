'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Bot, 
  Play, 
  Pause, 
  Square, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertTriangle,
  Activity,
  Zap,
  Brain,
  Users,
  Mail,
  RefreshCw
} from 'lucide-react'

interface AgentStatus {
  id: string
  name: string
  status: 'idle' | 'running' | 'paused' | 'error'
  metrics: {
    processed: number
    succeeded: number
    failed: number
    pending: number
    uptime: number
  }
  config: {
    autonomyLevel: string
    checkInterval: number
  }
  startedAt?: string
}

interface Approval {
  id: string
  agent_id: string
  item_type: string
  item_data: any
  decision: any
  created_at: string
}

export function AgentMissionControl() {
  const [agents, setAgents] = useState<{ [id: string]: AgentStatus }>({})
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadAgentStatuses()
    loadApprovals()
    
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadAgentStatuses()
      loadApprovals()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [])

  const loadAgentStatuses = async () => {
    try {
      const response = await fetch('/api/agents/orchestrator?action=status')
      const data = await response.json()
      setAgents(data.statuses || {})
    } catch (error) {
      console.error('Failed to load agent statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadApprovals = async () => {
    try {
      const response = await fetch('/api/agents/orchestrator?action=approvals')
      const data = await response.json()
      setApprovals(data.approvals || [])
    } catch (error) {
      console.error('Failed to load approvals:', error)
    }
  }

  const controlAgent = async (action: string, agentId?: string) => {
    setActionLoading(action)
    try {
      await fetch('/api/agents/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, agentId })
      })
      await loadAgentStatuses()
    } catch (error) {
      console.error(`Failed to ${action} agent:`, error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleApproval = async (approvalId: string, action: 'approve' | 'reject') => {
    try {
      await fetch('/api/agents/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          approvalId,
          ...(action === 'reject' && { reason: 'User rejected' })
        })
      })
      await loadApprovals()
    } catch (error) {
      console.error(`Failed to ${action} approval:`, error)
    }
  }

  const updateAutonomyLevel = async (agentId: string, autonomyLevel: string) => {
    try {
      await fetch('/api/agents/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update_config',
          agentId,
          config: { autonomyLevel }
        })
      })
      await loadAgentStatuses()
    } catch (error) {
      console.error('Failed to update autonomy level:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Activity className="h-4 w-4 text-green-500" />
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: any = {
      'running': 'default',
      'paused': 'secondary',
      'error': 'destructive',
      'idle': 'outline'
    }
    return <Badge variant={variants[status] || 'outline'}>{status.toUpperCase()}</Badge>
  }

  const getAgentIcon = (name: string) => {
    if (name.includes('Email')) return <Mail className="h-5 w-5" />
    if (name.includes('Relationship')) return <Users className="h-5 w-5" />
    return <Bot className="h-5 w-5" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading Agent Mission Control...</span>
      </div>
    )
  }

  const agentList = Object.values(agents)
  const runningAgents = agentList.filter(a => a.status === 'running').length
  const totalProcessed = agentList.reduce((sum, a) => sum + a.metrics.processed, 0)
  const pendingApprovals = approvals.length

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Agents</p>
                <p className="text-2xl font-bold">{runningAgents}/{agentList.length}</p>
              </div>
              <Bot className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Items Processed</p>
                <p className="text-2xl font-bold">{totalProcessed}</p>
              </div>
              <Zap className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Approvals</p>
                <p className="text-2xl font-bold">{pendingApprovals}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold">
                  {totalProcessed > 0 
                    ? Math.round((agentList.reduce((sum, a) => sum + a.metrics.succeeded, 0) / totalProcessed) * 100)
                    : 0}%
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Agent Control Center</CardTitle>
              <CardDescription>Manage your autonomous AI agents</CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={() => controlAgent('start')}
                disabled={actionLoading === 'start'}
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Start All
              </Button>
              <Button 
                variant="outline"
                onClick={() => controlAgent('stop')}
                disabled={actionLoading === 'stop'}
                size="sm"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop All
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents">Agents ({agentList.length})</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals {pendingApprovals > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                {pendingApprovals}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4">
          {agentList.map((agent) => (
            <Card key={agent.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    {getAgentIcon(agent.name)}
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <p className="text-sm text-gray-600">
                        {agent.config.autonomyLevel.replace('-', ' ')} mode
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(agent.status)}
                    {getStatusBadge(agent.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{agent.metrics.succeeded}</p>
                    <p className="text-xs text-gray-600">Succeeded</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-600">{agent.metrics.failed}</p>
                    <p className="text-xs text-gray-600">Failed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{agent.metrics.pending}</p>
                    <p className="text-xs text-gray-600">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{agent.metrics.processed}</p>
                    <p className="text-xs text-gray-600">Total</p>
                  </div>
                </div>

                {agent.metrics.processed > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Success Rate</span>
                      <span>{Math.round((agent.metrics.succeeded / agent.metrics.processed) * 100)}%</span>
                    </div>
                    <Progress value={(agent.metrics.succeeded / agent.metrics.processed) * 100} />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant={agent.status === 'running' ? 'outline' : 'default'}
                      onClick={() => controlAgent(agent.status === 'running' ? 'pause' : 'start', agent.id)}
                      disabled={actionLoading !== null}
                    >
                      {agent.status === 'running' ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => controlAgent('stop', agent.id)}
                      disabled={actionLoading !== null}
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Stop
                    </Button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Autonomy:</span>
                    <Select 
                      value={agent.config.autonomyLevel}
                      onValueChange={(value) => updateAutonomyLevel(agent.id, value)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supervised">Supervised</SelectItem>
                        <SelectItem value="semi-autonomous">Semi-Autonomous</SelectItem>
                        <SelectItem value="fully-autonomous">Fully Autonomous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          {approvals.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">No Pending Approvals</h3>
                <p className="text-gray-600">Your agents are working autonomously</p>
              </CardContent>
            </Card>
          ) : (
            approvals.map((approval) => (
              <Card key={approval.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        Agent Approval Required
                      </CardTitle>
                      <CardDescription>
                        {approval.agent_id} • {approval.item_type} • {new Date(approval.created_at).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleApproval(approval.id, 'approve')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproval(approval.id, 'reject')}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium mb-2">Proposed Action:</h4>
                      <Badge>{approval.decision.action}</Badge>
                      <span className="ml-2 text-sm text-gray-600">
                        Confidence: {Math.round(approval.decision.confidence * 100)}%
                      </span>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Reasoning:</h4>
                      <p className="text-sm text-gray-600">{approval.decision.reasoning}</p>
                    </div>
                    {approval.item_data.subject && (
                      <div>
                        <h4 className="font-medium mb-2">Email Subject:</h4>
                        <p className="text-sm">{approval.item_data.subject}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="monitoring">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Agent Uptime</span>
                    <span className="font-bold">99.8%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Error Rate</span>
                    <span className="font-bold text-green-600">0.2%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Response Time</span>
                    <span className="font-bold">1.2s</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Email Agent processed 5 emails</span>
                    <span className="text-gray-500">2 min ago</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span>VIP email requires approval</span>
                    <span className="text-gray-500">5 min ago</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Bot className="h-4 w-4 text-blue-500" />
                    <span>Agent autonomy updated</span>
                    <span className="text-gray-500">10 min ago</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}