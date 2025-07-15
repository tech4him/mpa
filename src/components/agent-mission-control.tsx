'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
  RefreshCw,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  Eye,
  User,
  AtSign
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
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean
    approval: Approval | null
    action: 'approve' | 'reject'
  }>({ open: false, approval: null, action: 'approve' })
  const [feedback, setFeedback] = useState({
    reasoning: '',
    correctAction: '',
    confidence: ''
  })
  const [expandedApprovals, setExpandedApprovals] = useState<Set<string>>(new Set())

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
      // Fetch both agent approvals and pending email drafts
      const [approvalsResponse, draftsResponse] = await Promise.all([
        fetch('/api/agents/orchestrator?action=approvals'),
        fetch('/api/drafts?status=pending_review')
      ])
      
      const approvalsData = await approvalsResponse.json()
      const draftsData = await draftsResponse.json()
      
      // Combine both types of approvals
      const agentApprovals = approvalsData.approvals || []
      const pendingDrafts = (draftsData.drafts || []).map((draft: any) => ({
        id: draft.id,
        agent_id: 'email_agent',
        item_type: 'email_draft',
        item_data: draft,
        decision: null,
        created_at: draft.created_at
      }))
      
      setApprovals([...agentApprovals, ...pendingDrafts])
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

  const openFeedbackDialog = (approval: Approval, action: 'approve' | 'reject') => {
    setFeedbackDialog({ open: true, approval, action })
    setFeedback({ reasoning: '', correctAction: '', confidence: '' })
  }

  const handleApproval = async (quick: boolean = false) => {
    if (!feedbackDialog.approval) return

    try {
      const payload: any = {
        approvalId: feedbackDialog.approval.id,
        action: feedbackDialog.action
      }

      if (!quick && (feedback.reasoning || feedback.correctAction)) {
        payload.reasoning = feedback.reasoning
        payload.correctAction = feedback.correctAction
        payload.feedback = {
          reasoning: feedback.reasoning,
          suggestedConfidence: feedback.confidence
        }
      }

      await fetch('/api/agents/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      setFeedbackDialog({ open: false, approval: null, action: 'approve' })
      await loadApprovals()
    } catch (error) {
      console.error(`Failed to ${feedbackDialog.action} approval:`, error)
    }
  }

  const handleQuickApproval = async (approvalId: string, action: 'approve' | 'reject') => {
    try {
      // Find the approval to determine if it's an email draft
      const approval = approvals.find(a => a.id === approvalId)
      
      if (approval?.item_type === 'email_draft') {
        // Handle email draft approval
        const newStatus = action === 'approve' ? 'approved' : 'rejected'
        await fetch(`/api/drafts/${approvalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            status: newStatus,
            feedback: action === 'reject' ? 'Quick rejection from Mission Control' : 'Quick approval from Mission Control'
          })
        })
      } else {
        // Handle agent approval (existing logic)
        await fetch('/api/agents/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            approvalId, 
            action,
            reasoning: action === 'reject' ? 'Quick rejection' : 'Quick approval'
          })
        })
      }
      
      await loadApprovals()
    } catch (error) {
      console.error(`Failed to ${action} approval:`, error)
    }
  }

  const toggleApprovalExpansion = (approvalId: string) => {
    const newExpanded = new Set(expandedApprovals)
    if (newExpanded.has(approvalId)) {
      newExpanded.delete(approvalId)
    } else {
      newExpanded.add(approvalId)
    }
    setExpandedApprovals(newExpanded)
  }

  const convertHtmlToPlainText = (html: string) => {
    if (!html) return 'No content available'
    
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const textContent = doc.body.textContent || doc.body.innerText || ''
      return textContent.trim() || 'No content available'
    } catch (error) {
      // If parsing fails, try to strip HTML tags with regex as fallback
      return html.replace(/<[^>]*>/g, '').trim() || 'No content available'
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
                        {approval.item_type === 'email_draft' ? 'Email Draft Approval Required' : 'Agent Approval Required'}
                      </CardTitle>
                      <CardDescription>
                        {approval.agent_id} • {approval.item_type} • {new Date(approval.created_at).toLocaleString()}
                        {approval.item_type === 'email_draft' && approval.item_data?.subject && (
                          <> • {approval.item_data.subject}</>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleQuickApproval(approval.id, 'approve')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickApproval(approval.id, 'reject')}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openFeedbackDialog(approval, 'reject')}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Give Feedback
                          </Button>
                        </DialogTrigger>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Email Details */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 p-4 rounded-lg space-y-3">
                      <h4 className="font-medium mb-3 flex items-center text-gray-900 dark:text-gray-100">
                        <Mail className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                        Email Details
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center space-x-2">
                          <AtSign className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          <span className="font-medium text-gray-900 dark:text-gray-100">From:</span>
                          <span className="text-gray-900 dark:text-gray-100 font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-300 dark:border-gray-600">
                            {approval.item_data.from_email || approval.item_data.from || 'N/A'}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                          <span className="font-medium text-gray-900 dark:text-gray-100">To:</span>
                          <span className="text-gray-900 dark:text-gray-100 font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-300 dark:border-gray-600">
                            {approval.item_data.to_email || approval.item_data.to || 'N/A'}
                          </span>
                        </div>
                        
                        {(approval.item_data.cc_email || approval.item_data.cc) && (
                          <div className="flex items-center space-x-2 md:col-span-2">
                            <Users className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">CC:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-300 dark:border-gray-600">
                              {approval.item_data.cc_email || approval.item_data.cc}
                            </span>
                          </div>
                        )}
                        
                        <div className="md:col-span-2">
                          <div className="flex items-center space-x-2 mb-2">
                            <Mail className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">Subject:</span>
                          </div>
                          <p className="text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 p-3 rounded border border-gray-300 dark:border-gray-600 font-medium">
                            {approval.item_data.subject || approval.item_data.email_subject || approval.item_data.title || 'No subject'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Email Content Toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleApprovalExpansion(approval.id)}
                        className="w-full mt-2"
                      >
                        {expandedApprovals.has(approval.id) ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            Hide Email Content
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Show Email Content
                          </>
                        )}
                      </Button>
                      
                      {/* Expandable Email Content */}
                      {expandedApprovals.has(approval.id) && (
                        <div className="mt-3 border-t pt-3">
                          <h5 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                            <Eye className="h-3 w-3 mr-2" />
                            Email Content:
                          </h5>
                          <div className="bg-white dark:bg-gray-900 p-4 rounded border text-sm text-gray-900 dark:text-gray-100 max-h-60 overflow-y-auto border-gray-300 dark:border-gray-600">
                            <pre className="whitespace-pre-wrap font-sans">
                              {(() => {
                                // First try to get plain text versions
                                const plainTextContent = approval.item_data.plain_text || 
                                                        approval.item_data.text_content || 
                                                        approval.item_data.body_text
                                
                                if (plainTextContent) {
                                  return plainTextContent
                                }
                                
                                // If no plain text, convert HTML to plain text
                                const htmlContent = approval.item_data.content || 
                                                  approval.item_data.body || 
                                                  approval.item_data.html_content ||
                                                  approval.item_data.body_html
                                
                                if (htmlContent) {
                                  return convertHtmlToPlainText(htmlContent)
                                }
                                
                                // Fallback to preview or no content
                                return approval.item_data.preview || 'No content available'
                              })()}
                            </pre>
                          </div>
                          
                          {/* Debug: Available Fields */}
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">Debug: Available Fields</summary>
                            <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 overflow-auto border border-gray-300 dark:border-gray-600">
                              {JSON.stringify(Object.keys(approval.item_data), null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>

                    {/* Agent Decision or Draft Content */}
                    {approval.item_type === 'email_draft' ? (
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                            <Bot className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                            Draft Content:
                          </h4>
                          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-700">
                            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-2">
                              Subject: {approval.item_data?.subject || 'No subject'}
                            </p>
                            <div className="text-sm text-gray-700 dark:text-gray-300 max-h-40 overflow-y-auto">
                              {approval.item_data?.content || approval.item_data?.draft_content || 'No content'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium mb-2 flex items-center text-gray-900 dark:text-gray-100">
                            <Bot className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                            Proposed Action:
                          </h4>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-lg px-3 py-1">
                              {approval.decision?.action || 'Unknown'}
                            </Badge>
                            <span className="text-sm text-gray-600">
                              Confidence: {approval.decision?.confidence ? Math.round(approval.decision.confidence * 100) : 0}%
                            </span>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-medium mb-2 text-gray-900 dark:text-gray-100">Agent Reasoning:</h4>
                          <p className="text-sm text-gray-900 dark:text-gray-100 bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-700">
                            {approval.decision?.reasoning || 'No reasoning provided'}
                          </p>
                        </div>
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

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialog.open} onOpenChange={(open) => 
        setFeedbackDialog(prev => ({ ...prev, open }))
      }>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {feedbackDialog.action === 'approve' ? 'Approve with Feedback' : 'Correct Agent Decision'}
            </DialogTitle>
            <DialogDescription>
              Help the agent learn from your decision by providing feedback about what it should have done differently.
            </DialogDescription>
          </DialogHeader>

          {feedbackDialog.approval && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                {feedbackDialog.approval.item_type === 'email_draft' ? (
                  <>
                    <h4 className="font-medium mb-2">Email Draft:</h4>
                    <div className="mb-2">
                      <Badge>Draft Review</Badge>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">
                      Subject: {feedbackDialog.approval.item_data?.subject || 'No subject'}
                    </p>
                    <div className="text-sm text-gray-600 mt-2 max-h-32 overflow-y-auto">
                      {feedbackDialog.approval.item_data?.content || feedbackDialog.approval.item_data?.draft_content || 'No content'}
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="font-medium mb-2">Agent's Original Decision:</h4>
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge>{feedbackDialog.approval.decision?.action || 'Unknown'}</Badge>
                      <span className="text-sm text-gray-600">
                        Confidence: {feedbackDialog.approval.decision?.confidence ? Math.round(feedbackDialog.approval.decision.confidence * 100) : 0}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{feedbackDialog.approval.decision?.reasoning || 'No reasoning provided'}</p>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="reasoning">Why was this decision incorrect? *</Label>
                  <Textarea
                    id="reasoning"
                    placeholder="Explain why the agent's decision was wrong and what factors it should have considered..."
                    value={feedback.reasoning}
                    onChange={(e) => setFeedback(prev => ({ ...prev, reasoning: e.target.value }))}
                    className="min-h-[100px]"
                  />
                </div>

                <div>
                  <Label htmlFor="correctAction">What should the agent have done instead?</Label>
                  <Select value={feedback.correctAction} onValueChange={(value) => 
                    setFeedback(prev => ({ ...prev, correctAction: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select the correct action..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="archive">Archive Email</SelectItem>
                      <SelectItem value="reply">Generate Reply</SelectItem>
                      <SelectItem value="flag_important">Flag as Important</SelectItem>
                      <SelectItem value="schedule_followup">Schedule Follow-up</SelectItem>
                      <SelectItem value="escalate">Escalate to Human</SelectItem>
                      <SelectItem value="categorize">Categorize Differently</SelectItem>
                      <SelectItem value="no_action">Take No Action</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {feedbackDialog.action === 'approve' && (
                  <div>
                    <Label htmlFor="confidence">How confident should the agent be in similar cases?</Label>
                    <Select value={feedback.confidence} onValueChange={(value) => 
                      setFeedback(prev => ({ ...prev, confidence: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select confidence level..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low (0-40%) - Be more cautious</SelectItem>
                        <SelectItem value="medium">Medium (40-70%) - Current level is good</SelectItem>
                        <SelectItem value="high">High (70-90%) - Be more confident</SelectItem>
                        <SelectItem value="very_high">Very High (90-100%) - Very confident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
                  <Brain className="h-5 w-5 text-blue-600" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Learning Impact</p>
                    <p>This feedback will help the agent make better decisions in similar future scenarios.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="space-x-2">
            <Button
              variant="outline"
              onClick={() => setFeedbackDialog({ open: false, approval: null, action: 'approve' })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleApproval(true)}
              disabled={!feedback.reasoning.trim()}
            >
              {feedbackDialog.action === 'approve' ? (
                <>
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Approve & Learn
                </>
              ) : (
                <>
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Reject & Teach
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}