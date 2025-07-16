'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { 
  CheckCircle, 
  Clock, 
  Trash2, 
  Forward, 
  Reply,
  Calendar,
  Archive,
  Mail,
  Timer,
  AlertTriangle,
  User,
  Calendar as CalendarIcon
} from 'lucide-react'
import { EmailThread } from '@/types/email'

interface InboxZeroProps {
  className?: string
}

interface EmailWithActions extends EmailThread {
  estimated_time_seconds?: number
  suggested_action?: 'do' | 'delegate' | 'defer' | 'delete'
  action_confidence?: number
  action_reason?: string
}

export function InboxZero({ className }: InboxZeroProps) {
  const [emails, setEmails] = useState<EmailWithActions[]>([])
  const [currentEmail, setCurrentEmail] = useState<EmailWithActions | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [deferDate, setDeferDate] = useState('')

  useEffect(() => {
    loadEmails()
  }, [])

  const loadEmails = async () => {
    try {
      const response = await fetch('/api/inbox-zero/emails')
      if (response.ok) {
        const data = await response.json()
        setEmails(data)
        if (data.length > 0) {
          setCurrentEmail(data[0])
        }
      }
    } catch (error) {
      console.error('Failed to load emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const processNextEmail = () => {
    const currentIndex = emails.findIndex(e => e.id === currentEmail?.id)
    if (currentIndex < emails.length - 1) {
      setCurrentEmail(emails[currentIndex + 1])
    } else {
      setCurrentEmail(null)
    }
  }

  const removeEmailFromQueue = (emailId: string) => {
    setEmails(prev => prev.filter(e => e.id !== emailId))
  }

  // DO: Handle immediately (< 2 minutes)
  const handleDo = async (action: 'reply' | 'forward' | 'file') => {
    if (!currentEmail) return
    
    if (action === 'reply') {
      setProcessing(true)
      try {
        const response = await fetch('/api/drafts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: currentEmail.id,
            type: 'reply'
          })
        })
        
        if (response.ok) {
          const draft = await response.json()
          setDraftContent(draft.content)
          setShowDraftModal(true)
        }
      } catch (error) {
        console.error('Failed to generate draft:', error)
      } finally {
        setProcessing(false)
      }
    } else if (action === 'file') {
      // Archive/file the email
      await handleArchive()
    }
  }

  // DELETE: Remove permanently
  const handleDelete = async () => {
    if (!currentEmail) return
    
    try {
      const response = await fetch(`/api/email/${currentEmail.id}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        removeEmailFromQueue(currentEmail.id)
        processNextEmail()
      }
    } catch (error) {
      console.error('Failed to delete email:', error)
    }
  }

  // DELEGATE: Forward to someone else
  const handleDelegate = async () => {
    if (!currentEmail) return
    
    setProcessing(true)
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: currentEmail.id,
          type: 'delegate'
        })
      })
      
      if (response.ok) {
        const draft = await response.json()
        setDraftContent(draft.content)
        setShowDraftModal(true)
      }
    } catch (error) {
      console.error('Failed to generate delegation draft:', error)
    } finally {
      setProcessing(false)
    }
  }

  // DEFER: Schedule for later
  const handleDefer = async () => {
    if (!currentEmail || !deferDate) return
    
    try {
      const response = await fetch('/api/inbox-zero/defer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: currentEmail.id,
          defer_until: deferDate
        })
      })
      
      if (response.ok) {
        removeEmailFromQueue(currentEmail.id)
        processNextEmail()
        setDeferDate('')
      }
    } catch (error) {
      console.error('Failed to defer email:', error)
    }
  }

  const handleArchive = async () => {
    if (!currentEmail) return
    
    try {
      const response = await fetch(`/api/email/${currentEmail.id}/archive`, {
        method: 'POST'
      })
      
      if (response.ok) {
        removeEmailFromQueue(currentEmail.id)
        processNextEmail()
      }
    } catch (error) {
      console.error('Failed to archive email:', error)
    }
  }

  const sendDraft = async () => {
    if (!currentEmail || !draftContent) return
    
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: currentEmail.id,
          content: draftContent
        })
      })
      
      if (response.ok) {
        setShowDraftModal(false)
        setDraftContent('')
        removeEmailFromQueue(currentEmail.id)
        processNextEmail()
      }
    } catch (error) {
      console.error('Failed to send email:', error)
    }
  }

  const getTimeEstimate = (seconds?: number) => {
    if (!seconds) return 'Unknown'
    if (seconds < 120) return `${seconds}s (DO)`
    if (seconds < 900) return `${Math.ceil(seconds/60)}m (DO)`
    return `${Math.ceil(seconds/60)}m (DEFER)`
  }

  const getSuggestedActionIcon = (action?: string) => {
    switch (action) {
      case 'do': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'delegate': return <Forward className="h-4 w-4 text-blue-600" />
      case 'defer': return <Clock className="h-4 w-4 text-yellow-600" />
      case 'delete': return <Trash2 className="h-4 w-4 text-red-600" />
      default: return <Mail className="h-4 w-4 text-gray-600" />
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading emails...</div>
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">🎉 Inbox Zero Achieved!</h2>
        <p className="text-muted-foreground mt-2">All emails have been processed</p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inbox Zero</h2>
          <p className="text-muted-foreground">
            {emails.length} emails remaining • Processing: {currentEmail?.subject || 'None'}
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {emails.length} left
        </Badge>
      </div>

      {/* Current Email */}
      {currentEmail && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  {getSuggestedActionIcon(currentEmail.suggested_action)}
                  <Badge variant="secondary">
                    {currentEmail.suggested_action?.toUpperCase() || 'ANALYZE'}
                  </Badge>
                  <Badge variant="outline">
                    {getTimeEstimate(currentEmail.estimated_time_seconds)}
                  </Badge>
                  {currentEmail.action_confidence && (
                    <Badge variant="outline">
                      {currentEmail.action_confidence}% confidence
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg">{currentEmail.subject}</CardTitle>
                <CardDescription className="flex items-center space-x-4 mt-1">
                  <span className="flex items-center space-x-1">
                    <User className="h-4 w-4" />
                    <span>{currentEmail.participants[0]?.email}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{new Date(currentEmail.last_message_at).toLocaleDateString()}</span>
                  </span>
                </CardDescription>
              </div>
            </div>
            {currentEmail.action_reason && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>AI Analysis:</strong> {currentEmail.action_reason}
                </p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {/* 4 D's Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Button
                variant="outline"
                onClick={() => handleDo('reply')}
                disabled={processing}
                className="flex items-center space-x-2 h-auto py-3"
              >
                <Reply className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">DO</div>
                  <div className="text-xs text-muted-foreground">Reply Now</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                onClick={handleDelegate}
                disabled={processing}
                className="flex items-center space-x-2 h-auto py-3"
              >
                <Forward className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">DELEGATE</div>
                  <div className="text-xs text-muted-foreground">Forward</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                onClick={() => document.getElementById('defer-date')?.click()}
                className="flex items-center space-x-2 h-auto py-3"
              >
                <Clock className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">DEFER</div>
                  <div className="text-xs text-muted-foreground">Schedule</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                onClick={handleDelete}
                className="flex items-center space-x-2 h-auto py-3 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">DELETE</div>
                  <div className="text-xs text-muted-foreground">Remove</div>
                </div>
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDo('file')}
                className="flex items-center space-x-1"
              >
                <Archive className="h-4 w-4" />
                <span>Archive</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={processNextEmail}
                className="flex items-center space-x-1"
              >
                <Timer className="h-4 w-4" />
                <span>Skip</span>
              </Button>
            </div>

            {/* Hidden date input for defer */}
            <input
              id="defer-date"
              type="datetime-local"
              value={deferDate}
              onChange={(e) => setDeferDate(e.target.value)}
              className="hidden"
              onBlur={() => {
                if (deferDate) {
                  handleDefer()
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Draft Modal */}
      {showDraftModal && (
        <Card className="border-2 border-green-200">
          <CardHeader>
            <CardTitle>AI Generated Draft</CardTitle>
            <CardDescription>
              Review and edit the draft before sending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Draft content..."
              className="min-h-[200px]"
            />
            <div className="flex items-center space-x-2">
              <Button onClick={sendDraft} disabled={!draftContent}>
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
      )}

      {/* Queue Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5" />
            <span>Email Queue</span>
            <Badge variant="outline">{emails.length} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {emails.slice(0, 5).map((email, index) => (
              <div
                key={email.id}
                className={`flex items-center justify-between p-2 rounded-lg border ${
                  email.id === currentEmail?.id ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {getSuggestedActionIcon(email.suggested_action)}
                  <span className="font-medium text-sm">{email.subject}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {getTimeEstimate(email.estimated_time_seconds)}
                  </Badge>
                  {email.suggested_action && (
                    <Badge variant="secondary" className="text-xs">
                      {email.suggested_action.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {emails.length > 5 && (
              <p className="text-sm text-muted-foreground text-center">
                ... and {emails.length - 5} more emails
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}