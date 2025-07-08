'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bot, 
  CheckCircle, 
  Edit3, 
  Send, 
  ThumbsUp, 
  ThumbsDown,
  Clock,
  AlertCircle,
  FileText,
  Sparkles,
  Target,
  MessageSquare,
  Calendar,
  User
} from 'lucide-react'

interface AIDraft {
  id: string
  subject: string
  content: string
  confidence: number
  reasoning: string
  draft_type: 'reply' | 'forward' | 'new'
  status: 'pending_review' | 'approved' | 'rejected' | 'sent'
  created_at: string
}

interface ExtractedTask {
  id: string
  task_description: string
  due_date?: string
  status: 'pending' | 'in_progress' | 'completed'
  confidence: number
  assigned_to?: string
}

interface AIRecommendation {
  type: 'draft_reply' | 'schedule_meeting' | 'create_task' | 'delegate' | 'archive'
  title: string
  description: string
  confidence: number
  action_data: any
}

interface AIEmailAssistantProps {
  threadId: string
  onAction?: (action: string, data: any) => void
}

export function AIEmailAssistant({ threadId, onAction }: AIEmailAssistantProps) {
  const [drafts, setDrafts] = useState<AIDraft[]>([])
  const [tasks, setTasks] = useState<ExtractedTask[]>([])
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Load AI insights for this thread
  useEffect(() => {
    loadAIInsights()
  }, [threadId])

  const loadAIInsights = async () => {
    setLoading(true)
    try {
      // Load AI drafts
      const draftsResponse = await fetch(`/api/drafts?threadId=${threadId}`)
      if (draftsResponse.ok) {
        const draftsData = await draftsResponse.json()
        setDrafts(draftsData)
      }

      // Load extracted tasks
      const tasksResponse = await fetch(`/api/tasks?threadId=${threadId}`)
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json()
        setTasks(tasksData.tasks || [])
      }

      // Load AI recommendations
      const recommendationsResponse = await fetch(`/api/ai/recommendations?threadId=${threadId}`)
      if (recommendationsResponse.ok) {
        const recommendationsData = await recommendationsResponse.json()
        setRecommendations(recommendationsData)
      }
    } catch (error) {
      console.error('Failed to load AI insights:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateDraft = async (draftType: 'reply' | 'forward' | 'new') => {
    setLoading(true)
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          draftType,
          urgency: 'medium'
        })
      })

      if (response.ok) {
        const newDraft = await response.json()
        setDrafts(prev => [newDraft, ...prev])
        setActiveTab('drafts')
      }
    } catch (error) {
      console.error('Failed to generate draft:', error)
    } finally {
      setLoading(false)
    }
  }

  const approveDraft = async (draftId: string) => {
    try {
      const response = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      })

      if (response.ok) {
        setDrafts(prev => prev.map(draft => 
          draft.id === draftId ? { ...draft, status: 'approved' } : draft
        ))
        onAction?.('draft_approved', { draftId })
      }
    } catch (error) {
      console.error('Failed to approve draft:', error)
    }
  }

  const rejectDraft = async (draftId: string) => {
    try {
      const response = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      })

      if (response.ok) {
        setDrafts(prev => prev.map(draft => 
          draft.id === draftId ? { ...draft, status: 'rejected' } : draft
        ))
        onAction?.('draft_rejected', { draftId })
      }
    } catch (error) {
      console.error('Failed to reject draft:', error)
    }
  }

  const extractTasks = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tasks/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId })
      })

      if (response.ok) {
        const result = await response.json()
        const newTasks = result.tasks || []
        setTasks(prev => [...prev, ...newTasks])
        setActiveTab('tasks')
      }
    } catch (error) {
      console.error('Failed to extract tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (response.ok) {
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, status } : task
        ))
        onAction?.('task_updated', { taskId, status })
      }
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  const executeRecommendation = async (recommendation: AIRecommendation) => {
    try {
      // Execute the recommended action
      switch (recommendation.type) {
        case 'draft_reply':
          await generateDraft('reply')
          break
        case 'create_task':
          await extractTasks()
          break
        case 'schedule_meeting':
          // Handle meeting scheduling
          onAction?.('schedule_meeting', recommendation.action_data)
          break
        case 'delegate':
          // Handle delegation
          onAction?.('delegate', recommendation.action_data)
          break
        case 'archive':
          // Handle archiving
          onAction?.('archive_thread', { threadId })
          break
      }
    } catch (error) {
      console.error('Failed to execute recommendation:', error)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="space-y-6">
      {/* AI Assistant Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <span>AI Assistant</span>
            <Badge variant="outline" className="ml-2">
              <Sparkles className="h-3 w-3 mr-1" />
              Smart Actions
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => generateDraft('reply')}
              disabled={loading}
              className="flex items-center space-x-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Draft Reply</span>
            </Button>
            <Button
              onClick={extractTasks}
              disabled={loading}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Target className="h-4 w-4" />
              <span>Extract Tasks</span>
            </Button>
            <Button
              onClick={() => generateDraft('forward')}
              disabled={loading}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>Forward</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="drafts">
            Drafts ({drafts.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            Suggestions ({recommendations.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">AI Drafts</p>
                    <p className="text-2xl font-bold">{drafts.length}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Extracted Tasks</p>
                    <p className="text-2xl font-bold">{tasks.length}</p>
                  </div>
                  <Target className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">AI Suggestions</p>
                    <p className="text-2xl font-bold">{recommendations.length}</p>
                  </div>
                  <Sparkles className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Drafts Tab */}
        <TabsContent value="drafts">
          <div className="space-y-4">
            {drafts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No AI drafts generated yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Click "Draft Reply" to generate an AI-powered response
                  </p>
                </CardContent>
              </Card>
            ) : (
              drafts.map((draft) => (
                <Card key={draft.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{draft.subject}</CardTitle>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant="outline" className="capitalize">
                            {draft.draft_type}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={getConfidenceColor(draft.confidence)}
                          >
                            {Math.round(draft.confidence * 100)}% confident
                          </Badge>
                          <Badge 
                            variant={draft.status === 'approved' ? 'default' : 'outline'}
                            className="capitalize"
                          >
                            {draft.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(draft.created_at).toLocaleString()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">AI Reasoning:</p>
                        <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          {draft.reasoning}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Draft Content:</p>
                        <div className="bg-white border rounded p-4 max-h-48 overflow-y-auto">
                          <pre className="whitespace-pre-wrap text-sm">{draft.content}</pre>
                        </div>
                      </div>
                      {draft.status === 'pending_review' && (
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={() => approveDraft(draft.id)}
                            size="sm"
                            className="flex items-center space-x-1"
                          >
                            <ThumbsUp className="h-4 w-4" />
                            <span>Approve</span>
                          </Button>
                          <Button
                            onClick={() => rejectDraft(draft.id)}
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                          >
                            <ThumbsDown className="h-4 w-4" />
                            <span>Reject</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>Edit</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No tasks extracted yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Click "Extract Tasks" to find action items in this thread
                  </p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{task.task_description}</h3>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge 
                            variant="outline" 
                            className={getConfidenceBadgeColor(task.confidence)}
                          >
                            {Math.round(task.confidence * 100)}% confident
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {task.status}
                          </Badge>
                        </div>
                        {task.assigned_to && (
                          <div className="flex items-center space-x-1 mt-2 text-sm text-gray-500">
                            <User className="h-4 w-4" />
                            <span>Assigned to: {task.assigned_to}</span>
                          </div>
                        )}
                        {task.due_date && (
                          <div className="flex items-center space-x-1 mt-2 text-sm text-gray-500">
                            <Calendar className="h-4 w-4" />
                            <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={() => updateTaskStatus(task.id, 'in_progress')}
                          size="sm"
                          variant="outline"
                          disabled={task.status === 'in_progress'}
                        >
                          Start
                        </Button>
                        <Button
                          onClick={() => updateTaskStatus(task.id, 'completed')}
                          size="sm"
                          disabled={task.status === 'completed'}
                        >
                          Complete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations">
          <div className="space-y-4">
            {recommendations.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No AI recommendations available</p>
                  <p className="text-sm text-gray-500 mt-2">
                    AI recommendations will appear here based on email analysis
                  </p>
                </CardContent>
              </Card>
            ) : (
              recommendations.map((recommendation, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{recommendation.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{recommendation.description}</p>
                        <Badge 
                          variant="outline" 
                          className={`mt-2 ${getConfidenceColor(recommendation.confidence)}`}
                        >
                          {Math.round(recommendation.confidence * 100)}% recommended
                        </Badge>
                      </div>
                      <Button
                        onClick={() => executeRecommendation(recommendation)}
                        size="sm"
                      >
                        Execute
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}