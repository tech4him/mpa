'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  RefreshCw, 
  Mail, 
  CheckCircle, 
  Clock, 
  Forward, 
  Trash2,
  Eye,
  Calendar,
  Zap,
  Bot,
  Send,
  ArrowRight
} from 'lucide-react'

interface EmailThread {
  id: string
  subject: string
  from_email: string
  last_message_date: string
  email_messages: Array<{
    id: string
    from_email: string
    to_recipients: string[]
    body: string
    received_at: string
  }>
}

interface EmailWithSuggestion extends EmailThread {
  suggestion?: {
    action: 'do' | 'delegate' | 'defer' | 'delete'
    confidence: number
    reason: string
    auto_draft?: boolean
  }
}

interface ProcessingState {
  step: 'check_sync' | 'processing' | 'completed'
  total_emails: number
  processed_count: number
  current_email: EmailWithSuggestion | null
  draft_content: string
  sync_status: 'unknown' | 'syncing' | 'synced' | 'error'
}

export function InboxZeroProcessor() {
  const [state, setState] = useState<ProcessingState>({
    step: 'check_sync',
    total_emails: 0,
    processed_count: 0,
    current_email: null,
    draft_content: '',
    sync_status: 'unknown'
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailContent, setShowEmailContent] = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [deferDateTime, setDeferDateTime] = useState('')

  useEffect(() => {
    checkSyncStatus()
  }, [])

  const checkSyncStatus = async () => {
    try {
      const response = await fetch('/api/email/sync/status')
      const data = await response.json()
      
      setState(prev => ({
        ...prev,
        sync_status: data.is_syncing ? 'syncing' : 'synced',
        total_emails: data.unread_count || 0
      }))
      
      if (data.unread_count > 0 && !data.is_syncing) {
        setState(prev => ({ ...prev, step: 'processing' }))
        loadNextEmail()
      }
    } catch (error) {
      console.error('Failed to check sync status:', error)
      setState(prev => ({ ...prev, sync_status: 'error' }))
    }
  }

  const triggerSync = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/email/sync', { method: 'POST' })
      if (response.ok) {
        setState(prev => ({ ...prev, sync_status: 'syncing' }))
        // Poll for sync completion
        const pollSync = setInterval(async () => {
          const statusResponse = await fetch('/api/email/sync/status')
          const statusData = await statusResponse.json()
          
          if (!statusData.is_syncing) {
            clearInterval(pollSync)
            setState(prev => ({
              ...prev,
              sync_status: 'synced',
              total_emails: statusData.unread_count || 0,
              step: statusData.unread_count > 0 ? 'processing' : 'completed'
            }))
            
            if (statusData.unread_count > 0) {
              loadNextEmail()
            }
          }
        }, 2000)
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error)
      setError('Failed to sync emails')
    } finally {
      setLoading(false)
    }
  }

  const loadNextEmail = async () => {
    try {
      const response = await fetch('/api/inbox-zero/next-email')
      const data = await response.json()
      
      if (data.email) {
        setState(prev => ({
          ...prev,
          current_email: data.email,
          draft_content: ''
        }))
        setShowEmailContent(false)
        setShowDraftModal(false)
      } else {
        setState(prev => ({
          ...prev,
          step: 'completed',
          current_email: null
        }))
      }
    } catch (error) {
      console.error('Failed to load next email:', error)
      setError('Failed to load next email')
    }
  }

  const handleAction = async (action: 'do' | 'delegate' | 'defer' | 'delete') => {
    if (!state.current_email) return
    
    setLoading(true)
    setError(null)
    
    try {
      // Record the action for learning
      await fetch('/api/inbox-zero/record-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: state.current_email.id,
          action,
          email_data: {
            from_email: state.current_email.from_email,
            subject: state.current_email.subject,
            body: state.current_email.email_messages[0]?.body || '',
            estimated_time_seconds: estimateProcessingTime(state.current_email.email_messages[0]?.body || '')
          }
        })
      })

      // Handle the specific action
      switch (action) {
        case 'do':
          await handleDo()
          break
        case 'delegate':
          await handleDelegate()
          break
        case 'defer':
          await handleDefer()
          break
        case 'delete':
          await handleDelete()
          break
      }
    } catch (error) {
      console.error(`Failed to ${action} email:`, error)
      setError(`Failed to ${action} email`)
    } finally {
      setLoading(false)
    }
  }

  const handleDo = async () => {
    if (!state.current_email) return
    
    // Generate draft if suggested
    if (state.current_email.suggestion?.auto_draft) {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: state.current_email.id,
          type: 'reply'
        })
      })
      
      if (response.ok) {
        const draft = await response.json()
        setState(prev => ({ ...prev, draft_content: draft.content }))
        setShowDraftModal(true)
        return
      }
    }
    
    // Otherwise, archive and move to next
    await archiveEmail()
  }

  const handleDelegate = async () => {
    if (!state.current_email) return
    
    // Generate delegation draft
    const response = await fetch('/api/drafts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: state.current_email.id,
        type: 'delegate'
      })
    })
    
    if (response.ok) {
      const draft = await response.json()
      setState(prev => ({ ...prev, draft_content: draft.content }))
      setShowDraftModal(true)
    }
  }

  const handleDefer = async () => {
    if (!state.current_email) return
    
    // Show date/time picker
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    
    const deferDate = prompt('Defer until (YYYY-MM-DD HH:MM):', tomorrow.toISOString().slice(0, 16))
    if (!deferDate) return
    
    const response = await fetch('/api/inbox-zero/defer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_id: state.current_email.id,
        defer_until: deferDate
      })
    })
    
    if (response.ok) {
      moveToNext()
    }
  }

  const handleDelete = async () => {
    if (!state.current_email) return
    
    const response = await fetch(`/api/email/${state.current_email.id}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      moveToNext()
    }
  }

  const archiveEmail = async () => {
    if (!state.current_email) return
    
    const response = await fetch(`/api/email/${state.current_email.id}/archive`, {
      method: 'POST'
    })
    
    if (response.ok) {
      moveToNext()
    }
  }

  const sendDraft = async () => {
    if (!state.current_email || !state.draft_content) return
    
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: state.current_email.id,
        content: state.draft_content
      })
    })
    
    if (response.ok) {
      setShowDraftModal(false)
      moveToNext()
    }
  }

  const moveToNext = () => {
    setState(prev => ({
      ...prev,
      processed_count: prev.processed_count + 1
    }))
    loadNextEmail()
  }

  const estimateProcessingTime = (body: string): number => {
    const wordCount = body.split(' ').length
    return Math.min(Math.max(wordCount * 2, 30), 600)
  }

  const getProgressPercentage = () => {
    if (state.total_emails === 0) return 100
    return Math.round((state.processed_count / state.total_emails) * 100)
  }

  const getSuggestionIcon = (action: string) => {
    switch (action) {
      case 'do': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'delegate': return <Forward className="h-4 w-4 text-blue-600" />
      case 'defer': return <Clock className="h-4 w-4 text-yellow-600" />
      case 'delete': return <Trash2 className="h-4 w-4 text-red-600" />
      default: return <Mail className="h-4 w-4 text-gray-600" />
    }
  }

  // Step 1: Check/Sync Emails
  if (state.step === 'check_sync') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Inbox Zero</h1>
          <p className="text-muted-foreground">Process your emails efficiently with AI assistance</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5" />
              <span>Email Sync Status</span>
            </CardTitle>
            <CardDescription>
              First, let's make sure your emails are up to date
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {state.sync_status === 'syncing' && 'Syncing emails...'}
                  {state.sync_status === 'synced' && `${state.total_emails} emails ready to process`}
                  {state.sync_status === 'error' && 'Sync error occurred'}
                  {state.sync_status === 'unknown' && 'Checking sync status...'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {state.sync_status === 'syncing' && 'Please wait while we fetch your latest emails'}
                  {state.sync_status === 'synced' && state.total_emails === 0 && '🎉 Your inbox is already empty!'}
                  {state.sync_status === 'synced' && state.total_emails > 0 && 'Ready to start processing'}
                  {state.sync_status === 'error' && 'Please try syncing again'}
                </p>
              </div>
              <div>
                {state.sync_status === 'syncing' && (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                )}
                {state.sync_status === 'synced' && state.total_emails === 0 && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
            </div>
            
            <div className="flex space-x-3">
              <Button 
                onClick={triggerSync} 
                disabled={loading || state.sync_status === 'syncing'}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Emails</span>
              </Button>
              
              {state.sync_status === 'synced' && state.total_emails > 0 && (
                <Button 
                  onClick={() => {
                    setState(prev => ({ ...prev, step: 'processing' }))
                    loadNextEmail()
                  }}
                  className="flex items-center space-x-2"
                >
                  <ArrowRight className="h-4 w-4" />
                  <span>Start Processing</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 2: Processing Emails
  if (state.step === 'processing') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Progress Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">Processing Emails</h1>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {state.processed_count} / {state.total_emails}
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
        </div>

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Email */}
        {state.current_email && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg mb-2">{state.current_email.subject}</CardTitle>
                  <CardDescription className="mb-3">
                    From: {state.current_email.from_email} • {new Date(state.current_email.last_message_date).toLocaleString()}
                  </CardDescription>
                  
                  {/* AI Suggestion */}
                  {state.current_email.suggestion && (
                    <div className="flex items-center space-x-2 mb-3">
                      <Bot className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">AI Suggestion:</span>
                      <div className="flex items-center space-x-2">
                        {getSuggestionIcon(state.current_email.suggestion.action)}
                        <Badge variant="secondary" className="text-xs">
                          {state.current_email.suggestion.action.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {state.current_email.suggestion.confidence}% confidence
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {state.current_email.suggestion && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {state.current_email.suggestion.reason}
                    </p>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEmailContent(!showEmailContent)}
                  className="flex items-center space-x-1"
                >
                  <Eye className="h-4 w-4" />
                  <span>{showEmailContent ? 'Hide' : 'Show'} Content</span>
                </Button>
              </div>
            </CardHeader>
            
            {showEmailContent && (
              <CardContent>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Email Content:</h4>
                  <pre className="text-sm whitespace-pre-wrap text-gray-700 max-h-60 overflow-y-auto">
                    {state.current_email.email_messages[0]?.body || 'No content available'}
                  </pre>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Action Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>What should we do with this email?</CardTitle>
            <CardDescription>
              Choose an action based on the 4 D's methodology
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                variant={state.current_email?.suggestion?.action === 'do' ? 'default' : 'outline'}
                onClick={() => handleAction('do')}
                disabled={loading}
                className="flex flex-col items-center space-y-2 h-20"
              >
                <CheckCircle className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">DO</div>
                  <div className="text-xs text-muted-foreground">Reply Now</div>
                </div>
              </Button>
              
              <Button
                variant={state.current_email?.suggestion?.action === 'delegate' ? 'default' : 'outline'}
                onClick={() => handleAction('delegate')}
                disabled={loading}
                className="flex flex-col items-center space-y-2 h-20"
              >
                <Forward className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">DELEGATE</div>
                  <div className="text-xs text-muted-foreground">Forward</div>
                </div>
              </Button>
              
              <Button
                variant={state.current_email?.suggestion?.action === 'defer' ? 'default' : 'outline'}
                onClick={() => handleAction('defer')}
                disabled={loading}
                className="flex flex-col items-center space-y-2 h-20"
              >
                <Clock className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">DEFER</div>
                  <div className="text-xs text-muted-foreground">Later</div>
                </div>
              </Button>
              
              <Button
                variant={state.current_email?.suggestion?.action === 'delete' ? 'default' : 'outline'}
                onClick={() => handleAction('delete')}
                disabled={loading}
                className="flex flex-col items-center space-y-2 h-20"
              >
                <Trash2 className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">DELETE</div>
                  <div className="text-xs text-muted-foreground">Remove</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Draft Modal */}
        {showDraftModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>AI Generated Draft</CardTitle>
                <CardDescription>
                  Review and edit the draft before sending
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={state.draft_content}
                  onChange={(e) => setState(prev => ({ ...prev, draft_content: e.target.value }))}
                  placeholder="Draft content..."
                  className="min-h-[300px]"
                />
                <div className="flex items-center space-x-2">
                  <Button onClick={sendDraft} disabled={!state.draft_content}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Reply
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDraftModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // Step 3: Completed
  if (state.step === 'completed') {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">🎉 Inbox Zero Achieved!</h1>
        <p className="text-muted-foreground mb-6">
          You've successfully processed {state.processed_count} emails
        </p>
        
        <div className="flex justify-center space-x-4">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Check for New Emails
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return null
}