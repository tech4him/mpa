'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  Bot,
  Send,
  ArrowRight,
  LogOut,
  User,
  Maximize2,
  Minimize2,
  Archive
} from 'lucide-react'
import { formatEmailForDisplay } from '@/lib/utils/email-content'

interface EmailThread {
  id: string
  subject: string
  from_email: string
  last_message_date: string
  email_messages: Array<{
    id: string
    from_email: string
    from_name?: string
    to_recipients: string[]
    cc_recipients?: string[]
    bcc_recipients?: string[]
    body: string
    received_at: string
  }>
}

interface EmailWithSuggestion extends EmailThread {
  suggestion?: {
    action: 'do' | 'delegate' | 'defer' | 'delete' | 'archive'
    confidence: number
    reason: string
    auto_draft?: boolean
  }
}

interface ProcessingState {
  step: 'loading' | 'check_sync' | 'processing' | 'completed'
  total_emails: number
  processed_count: number
  current_email: EmailWithSuggestion | null
  draft_content: string
  sync_status: 'unknown' | 'syncing' | 'synced' | 'error'
}

export default function InboxZeroPage() {
  const [user, setUser] = useState<any>(null)
  const [state, setState] = useState<ProcessingState>({
    step: 'loading',
    total_emails: 0,
    processed_count: 0,
    current_email: null,
    draft_content: '',
    sync_status: 'unknown'
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailContent, setShowEmailContent] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      checkSyncStatus()
    }
  }, [user])

  const checkUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      router.push('/auth/login')
      return
    }
    
    setUser(user)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const checkSyncStatus = async () => {
    try {
      const response = await fetch('/api/email/sync/status')
      const data = await response.json()
      
      setState(prev => ({
        ...prev,
        sync_status: data.is_syncing ? 'syncing' : 'synced',
        total_emails: data.unread_count || 0,
        step: data.unread_count > 0 && !data.is_syncing ? 'processing' : 'check_sync'
      }))
      
      if (data.unread_count > 0 && !data.is_syncing) {
        loadNextEmail()
      } else if (data.unread_count === 0 && !data.is_syncing) {
        setState(prev => ({ ...prev, step: 'completed' }))
      }
    } catch (error) {
      console.error('Failed to check sync status:', error)
      setState(prev => ({ ...prev, sync_status: 'error', step: 'check_sync' }))
    }
  }

  const triggerSync = async () => {
    setLoading(true)
    setError(null)
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
      } else {
        throw new Error('Sync failed')
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error)
      setError('Failed to sync emails')
      setState(prev => ({ ...prev, sync_status: 'error' }))
    } finally {
      setLoading(false)
    }
  }

  const triggerCleanupSync = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/email/cleanup-sync', { method: 'POST' })
      if (response.ok) {
        const result = await response.json()
        setError(`✅ ${result.message}`)
        setTimeout(() => setError(null), 5000)
        
        // Refresh status after cleanup
        checkSyncStatus()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Cleanup sync failed')
      }
    } catch (error) {
      console.error('Failed to trigger cleanup sync:', error)
      setError('Failed to perform cleanup sync')
    } finally {
      setLoading(false)
    }
  }

  const markAllProcessed = async () => {
    if (!confirm('Are you sure you want to mark all emails as processed? This should only be used if you\'ve already cleaned your Outlook inbox.')) {
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/email/mark-all-processed', { method: 'POST' })
      if (response.ok) {
        const result = await response.json()
        setError(`✅ ${result.message}`)
        setTimeout(() => setError(null), 5000)
        
        // Refresh status after cleanup
        checkSyncStatus()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Mark all processed failed')
      }
    } catch (error) {
      console.error('Failed to mark all processed:', error)
      setError('Failed to mark all processed')
    } finally {
      setLoading(false)
    }
  }

  const bulkArchiveOld = async () => {
    if (!confirm('This will archive ALL emails received before 6/29/2025 from your inbox to archive folder. This may take several minutes. Continue?')) {
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/email/bulk-archive-old', { method: 'POST' })
      if (response.ok) {
        const result = await response.json()
        setError(`✅ ${result.message}`)
        setTimeout(() => setError(null), 8000)
        
        // Refresh status after bulk archive
        checkSyncStatus()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Bulk archive failed')
      }
    } catch (error) {
      console.error('Failed to bulk archive:', error)
      setError('Failed to bulk archive old emails')
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
          draft_content: '',
          step: 'processing'
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

  const handleAction = async (action: 'do' | 'delegate' | 'defer' | 'delete' | 'archive') => {
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
        case 'archive':
          await handleArchive()
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
    } else {
      setError('Failed to generate delegation draft')
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
    } else {
      setError('Failed to defer email')
    }
  }

  const handleDelete = async () => {
    if (!state.current_email) return
    
    const response = await fetch(`/api/email/${state.current_email.id}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      moveToNext()
    } else {
      setError('Failed to delete email')
    }
  }

  const handleArchive = async () => {
    if (!state.current_email) return
    
    const response = await fetch(`/api/email/${state.current_email.id}/archive`, {
      method: 'POST'
    })
    
    if (response.ok) {
      moveToNext()
    } else {
      setError('Failed to archive email')
    }
  }

  const archiveEmail = async () => {
    if (!state.current_email) return
    
    const response = await fetch(`/api/email/${state.current_email.id}/archive`, {
      method: 'POST'
    })
    
    if (response.ok) {
      moveToNext()
    } else {
      setError('Failed to archive email')
    }
  }

  const createDraft = async () => {
    if (!state.current_email || !state.draft_content) return
    
    const response = await fetch('/api/email/create-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: state.current_email.id,
        subject: `Re: ${state.current_email.subject}`,
        body: state.draft_content,
        recipient_email: state.current_email.from_email,
        type: 'reply'
      })
    })
    
    if (response.ok) {
      setShowDraftModal(false)
      setError(null)
      // Show success message
      const result = await response.json()
      setError(`✅ ${result.message}`)
      setTimeout(() => setError(null), 3000)
      moveToNext()
    } else {
      const errorData = await response.json()
      setError(`Failed to create draft: ${errorData.error}`)
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
      case 'archive': return <Archive className="h-4 w-4 text-purple-600" />
      default: return <Mail className="h-4 w-4 text-gray-600" />
    }
  }

  // Utility function to highlight user's email
  const highlightUserEmail = (recipients: string[]) => {
    if (!user?.email) return recipients.join(', ')
    
    return recipients.map(recipient => {
      const isUserEmail = recipient.toLowerCase().includes(user.email.toLowerCase())
      return isUserEmail ? (
        <span key={recipient} className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded">
          {recipient}
        </span>
      ) : (
        <span key={recipient}>{recipient}</span>
      )
    }).reduce((prev, curr, index) => {
      return index === 0 ? [curr] : [...prev, ', ', curr]
    }, [] as React.ReactNode[])
  }

  // Loading state
  if (state.step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-600 dark:text-gray-400" />
          <p className="text-gray-700 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Mail className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox Zero</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="h-4 w-4" />
                <span>{user?.email}</span>
              </div>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <Alert className="mb-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
            <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
          </Alert>
        )}

        {/* Step 1: Check/Sync Emails */}
        {state.step === 'check_sync' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Let's Process Your Emails</h2>
              <p className="text-gray-600 dark:text-gray-400">First, let's make sure your emails are up to date</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <RefreshCw className="h-5 w-5" />
                  <span>Email Sync Status</span>
                </CardTitle>
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
                
                <div className="flex flex-col space-y-3">
                  <div className="flex space-x-3">
                    <Button 
                      onClick={triggerSync} 
                      disabled={loading || state.sync_status === 'syncing'}
                      className="flex items-center space-x-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>Sync Emails</span>
                    </Button>
                    
                    <Button 
                      onClick={triggerCleanupSync} 
                      disabled={loading}
                      variant="outline"
                      className="flex items-center space-x-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>Cleanup Sync</span>
                    </Button>
                    
                    <Button 
                      onClick={bulkArchiveOld} 
                      disabled={loading}
                      variant="outline"
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                    >
                      <Archive className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>Archive Old</span>
                    </Button>
                  </div>
                  
                  {state.sync_status === 'synced' && state.total_emails > 0 && (
                    <Button 
                      onClick={() => {
                        setState(prev => ({ ...prev, step: 'processing' }))
                        loadNextEmail()
                      }}
                      className="flex items-center space-x-2"
                    >
                      <ArrowRight className="h-4 w-4" />
                      <span>Start Processing ({state.total_emails} emails)</span>
                    </Button>
                  )}
                  
                  {state.total_emails > 500 && (
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      💡 If you've cleaned your Outlook inbox but still see many emails here, try "Cleanup Sync" to catch up with your mailbox changes.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Processing Emails */}
        {state.step === 'processing' && (
          <>
            {/* Progress Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Processing Emails</h2>
                <div className="flex items-center space-x-4">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {state.processed_count} / {state.total_emails}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={triggerSync}
                    className="flex items-center space-x-1"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Sync</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={triggerCleanupSync}
                    className="flex items-center space-x-1"
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Cleanup</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={bulkArchiveOld}
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-700"
                    disabled={loading}
                  >
                    <Archive className="h-4 w-4" />
                    <span>Archive Old</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllProcessed}
                    className="flex items-center space-x-1 text-orange-600 hover:text-orange-700"
                    disabled={loading}
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>Mark All Done</span>
                  </Button>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
            </div>

            {/* Current Email */}
            {state.current_email && (
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{state.current_email.subject}</CardTitle>
                      <CardDescription className="mb-3">
                        From: {state.current_email.email_messages[0]?.from_name || state.current_email.from_email} • {new Date(state.current_email.last_message_date).toLocaleString()}
                      </CardDescription>
                      
                      {/* Recipient Information */}
                      {state.current_email.email_messages[0] && (
                        <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="space-y-1">
                            {state.current_email.email_messages[0].to_recipients && state.current_email.email_messages[0].to_recipients.length > 0 && (
                              <div className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-medium">To:</span> {highlightUserEmail(state.current_email.email_messages[0].to_recipients)}
                              </div>
                            )}
                            {state.current_email.email_messages[0].cc_recipients && state.current_email.email_messages[0].cc_recipients.length > 0 && (
                              <div className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-medium">CC:</span> {highlightUserEmail(state.current_email.email_messages[0].cc_recipients)}
                              </div>
                            )}
                            {state.current_email.email_messages[0].bcc_recipients && state.current_email.email_messages[0].bcc_recipients.length > 0 && (
                              <div className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-medium">BCC:</span> {highlightUserEmail(state.current_email.email_messages[0].bcc_recipients)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
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
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">Email Content:</h4>
                        {(() => {
                          const emailBody = state.current_email.email_messages[0]?.body || ''
                          const { isLong } = formatEmailForDisplay(emailBody)
                          return isLong && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFullContent(!showFullContent)}
                              className="flex items-center space-x-1"
                            >
                              {showFullContent ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                              <span className="text-xs">{showFullContent ? 'Collapse' : 'Expand'}</span>
                            </Button>
                          )
                        })()}
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-96 overflow-y-auto bg-white dark:bg-gray-900 p-3 rounded border border-gray-100 dark:border-gray-600">
                          {(() => {
                            const emailBody = state.current_email.email_messages[0]?.body || 'No content available'
                            const { formatted } = formatEmailForDisplay(emailBody)
                            return showFullContent ? formatEmailForDisplay(emailBody).formatted : formatted
                          })()}
                        </div>
                      </div>
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
                  Choose an action based on the inbox zero methodology
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Button
                    variant={state.current_email?.suggestion?.action === 'do' ? 'default' : 'outline'}
                    onClick={() => handleAction('do')}
                    disabled={loading}
                    className="flex flex-col items-center space-y-2 h-20"
                  >
                    <CheckCircle className="h-6 w-6" />
                    <div className="text-center">
                      <div className="font-medium">DO</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Reply Now</div>
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">Forward</div>
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">Later</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant={state.current_email?.suggestion?.action === 'archive' ? 'default' : 'outline'}
                    onClick={() => handleAction('archive')}
                    disabled={loading}
                    className="flex flex-col items-center space-y-2 h-20"
                  >
                    <Archive className="h-6 w-6" />
                    <div className="text-center">
                      <div className="font-medium">ARCHIVE</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">File Away</div>
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">Remove</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Step 3: Completed */}
        {state.step === 'completed' && (
          <div className="max-w-2xl mx-auto text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">🎉 Inbox Zero Achieved!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You've successfully processed {state.processed_count} emails
            </p>
            
            <div className="flex justify-center space-x-4">
              <Button onClick={triggerSync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Check for New Emails
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Start Over
              </Button>
            </div>
          </div>
        )}

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
                  <Button onClick={createDraft} disabled={!state.draft_content}>
                    <Send className="h-4 w-4 mr-2" />
                    Create Draft
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
      </main>
    </div>
  )
}