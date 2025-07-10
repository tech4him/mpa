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
  User,
  Copy,
  ExternalLink,
  Mail
} from 'lucide-react'

interface AIDraft {
  id: string
  subject: string
  content: string
  confidence: number
  reasoning: string
  draft_type: 'reply' | 'forward' | 'new'
  status: 'pending_review' | 'approved' | 'rejected' | 'sent' | 'in_mailbox'
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
  id?: string
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
  const [editingDraft, setEditingDraft] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState('')

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
        console.log('Drafts API response:', draftsData)
        // The API returns the array directly, not wrapped in a drafts property
        setDrafts(Array.isArray(draftsData) ? draftsData : [])
      } else {
        console.error('Drafts API failed:', draftsResponse.status, await draftsResponse.text())
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
        const apiResponse = await response.json()
        
        // Transform API response to match AIDraft interface
        const draftData = apiResponse.draft || apiResponse
        const newDraft: AIDraft = {
          id: draftData.id,
          subject: draftData.subject || 'No Subject',
          content: draftData.content || 'No content',
          confidence: draftData.confidence || 0,
          reasoning: draftData.reasoning || 'No reasoning provided',
          draft_type: draftType,
          status: 'pending_review',
          created_at: new Date().toISOString()
        }
        
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

  const copyDraftToClipboard = async (draft: AIDraft) => {
    try {
      // Convert HTML to plain text for clipboard
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = draft.content
      const plainText = tempDiv.textContent || tempDiv.innerText || ''
      
      await navigator.clipboard.writeText(plainText)
      
      // You could add a toast notification here
      console.log('Draft copied to clipboard')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const openInEmailClient = (draft: AIDraft) => {
    // Get thread participants for recipients
    const recipients = draft.subject?.includes('Re:') ? 
      [] : // For replies, we'd need to get original sender
      ['recipient@example.com'] // Placeholder

    // Create mailto URL
    const subject = encodeURIComponent(draft.subject || 'Email Draft')
    const body = encodeURIComponent(draft.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '))
    const to = recipients.join(',')
    
    const mailtoUrl = `mailto:${to}?subject=${subject}&body=${body}`
    window.open(mailtoUrl, '_blank')
  }

  const createDraftInMailbox = async (draft: AIDraft) => {
    try {
      const response = await fetch(`/api/drafts/${draft.id}/mailbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_draft',
          organizeFolders: true
        })
      })

      const result = await response.json()

      if (response.ok) {
        // Update draft status
        setDrafts(prev => prev.map(d => 
          d.id === draft.id ? { ...d, status: 'in_mailbox' } : d
        ))
        
        // Create positive learning sample
        await fetch('/api/learning/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_draft: draft.content,
            final_sent: draft.content,
            feedback_score: 1,
            edit_type: 'approved_to_mailbox',
            thread_id: threadId
          })
        })
        
        console.log('Draft created in mailbox:', result.message)
        alert('Draft successfully created in your AI Assistant Drafts folder!')
      } else {
        // Handle sync requirement
        if (result.requiresSync) {
          const confirmMessage = result.error + '\n\nThis will redirect you to the dashboard where you can click "Sync Emails". Continue?'
          if (confirm(confirmMessage)) {
            window.location.href = '/dashboard'
          }
        } else {
          alert('Error: ' + result.error)
        }
      }
    } catch (error) {
      console.error('Failed to create draft in mailbox:', error)
      alert('Failed to create draft in mailbox. Please try again.')
    }
  }

  const sendDraftViaAPI = async (draft: AIDraft) => {
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          draftId: draft.id,
          subject: draft.subject,
          content: draft.content
        })
      })

      if (response.ok) {
        // Update draft status to sent
        setDrafts(prev => prev.map(d => 
          d.id === draft.id ? { ...d, status: 'sent' } : d
        ))
        
        // Create positive learning sample
        await fetch('/api/learning/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_draft: draft.content,
            final_sent: draft.content,
            feedback_score: 1,
            edit_type: 'approved_and_sent',
            thread_id: threadId
          })
        })
        
        console.log('Draft sent successfully')
      }
    } catch (error) {
      console.error('Failed to send draft:', error)
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

  const startEditing = (draft: AIDraft) => {
    setEditingDraft(draft.id)
    // Strip HTML tags for editing, but preserve line breaks
    const strippedContent = draft.content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
    setEditedContent(strippedContent)
  }

  const cancelEditing = () => {
    setEditingDraft(null)
    setEditedContent('')
  }

  const saveDraftEdit = async (draftId: string) => {
    try {
      const response = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: editedContent,
          status: 'pending_review' // Reset to pending after edit
        })
      })

      if (response.ok) {
        // Update local state
        setDrafts(prev => prev.map(draft => 
          draft.id === draftId ? { ...draft, content: editedContent } : draft
        ))
        
        // Create learning sample for AI improvement
        const originalDraft = drafts.find(d => d.id === draftId)
        if (originalDraft && originalDraft.content !== editedContent) {
          await fetch('/api/learning/samples', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              original_draft: originalDraft.content,
              final_sent: editedContent,
              feedback_score: 1, // Positive because user edited to improve
              edit_type: 'manual_improvement',
              thread_id: threadId
            })
          })
        }
        
        setEditingDraft(null)
        setEditedContent('')
        onAction?.('draft_edited', { draftId, originalContent: originalDraft?.content, editedContent })
      }
    } catch (error) {
      console.error('Failed to save draft edit:', error)
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

  const updateTaskStatus = async (taskId: string, status: 'pending' | 'completed' | 'in_progress') => {
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
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400'
    if (confidence >= 0.6) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
    if (confidence >= 0.6) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
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
                  <MessageSquare className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-700 dark:text-gray-300">No AI drafts generated yet</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
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
                        <CardTitle className="text-lg">{draft.subject || 'No Subject'}</CardTitle>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant="outline" className="capitalize">
                            {draft.draft_type || 'unknown'}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={getConfidenceColor(draft.confidence)}
                          >
                            {Math.round((draft.confidence || 0) * 100)}% confident
                          </Badge>
                          <Badge 
                            variant={draft.status === 'approved' ? 'default' : 'outline'}
                            className="capitalize"
                          >
                            {draft.status?.replace('_', ' ') || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {draft.created_at ? new Date(draft.created_at).toLocaleString() : 'Unknown date'}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AI Reasoning:</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                          {draft.reasoning || 'No reasoning provided'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Draft Content:</p>
                        {editingDraft === draft.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editedContent}
                              onChange={(e) => setEditedContent(e.target.value)}
                              className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                              placeholder="Edit your draft content..."
                            />
                            <div className="flex items-center space-x-2">
                              <Button
                                onClick={() => saveDraftEdit(draft.id)}
                                size="sm"
                                className="flex items-center space-x-1"
                              >
                                <CheckCircle className="h-4 w-4" />
                                <span>Save Changes</span>
                              </Button>
                              <Button
                                onClick={cancelEditing}
                                size="sm"
                                variant="outline"
                                className="flex items-center space-x-1"
                              >
                                <span>Cancel</span>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-4 max-h-48 overflow-y-auto">
                            <div 
                              className="text-sm text-gray-900 dark:text-gray-100 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: draft.content || 'No content' }}
                            />
                          </div>
                        )}
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
                            onClick={() => startEditing(draft)}
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>Edit</span>
                          </Button>
                        </div>
                      )}
                      
                      {draft.status === 'approved' && (
                        <div className="space-y-3">
                          <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                            ✅ Draft Approved - Choose an action:
                          </div>
                          <div className="flex items-center space-x-2 flex-wrap gap-2">
                            <Button
                              onClick={() => createDraftInMailbox(draft)}
                              size="sm"
                              className="flex items-center space-x-1"
                            >
                              <Mail className="h-4 w-4" />
                              <span>Create in Mailbox</span>
                            </Button>
                            <Button
                              onClick={() => copyDraftToClipboard(draft)}
                              size="sm"
                              variant="outline"
                              className="flex items-center space-x-1"
                            >
                              <Copy className="h-4 w-4" />
                              <span>Copy to Clipboard</span>
                            </Button>
                            <Button
                              onClick={() => openInEmailClient(draft)}
                              size="sm"
                              variant="outline"
                              className="flex items-center space-x-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>Open in Email Client</span>
                            </Button>
                            <Button
                              onClick={() => sendDraftViaAPI(draft)}
                              size="sm"
                              variant="outline"
                              className="flex items-center space-x-1"
                            >
                              <Send className="h-4 w-4" />
                              <span>Send Now</span>
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {draft.status === 'in_mailbox' && (
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          📬 Ready in AI Assistant Drafts folder
                        </div>
                      )}
                      
                      {draft.status === 'sent' && (
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          📧 Sent successfully
                        </div>
                      )}
                      
                      {draft.status === 'rejected' && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          ❌ Draft rejected
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
                  <Target className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-700 dark:text-gray-300">No tasks extracted yet</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
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
                        <h3 className="font-medium">{task.task_description || 'No description'}</h3>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge 
                            variant="outline" 
                            className={getConfidenceBadgeColor(task.confidence || 0)}
                          >
                            {Math.round((task.confidence || 0) * 100)}% confident
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {task.status || 'unknown'}
                          </Badge>
                        </div>
                        {task.assigned_to && (
                          <div className="flex items-center space-x-1 mt-2 text-sm text-gray-500">
                            <User className="h-4 w-4" />
                            <span>Assigned to: {task.assigned_to || 'Unknown'}</span>
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
                <Card key={recommendation.id || `${recommendation.type}-${recommendation.title}-${index}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{recommendation.title || 'No title'}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{recommendation.description || 'No description'}</p>
                        <Badge 
                          variant="outline" 
                          className={`mt-2 ${getConfidenceColor(recommendation.confidence || 0)}`}
                        >
                          {Math.round((recommendation.confidence || 0) * 100)}% recommended
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