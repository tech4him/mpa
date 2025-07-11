'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Zap, 
  Archive, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Mail,
  TrendingUp,
  Brain,
  Timer,
  RefreshCw
} from 'lucide-react'
import { EmailTriageResult, InboxZeroSummary } from '@/lib/ai/inbox-zero-engine'

interface InboxZeroStatus {
  unread_count: number
  processing_history: any[]
}

export function InboxZeroDashboard() {
  const [status, setStatus] = useState<InboxZeroStatus | null>(null)
  const [processing, setProcessing] = useState(false)
  const [lastProcessing, setLastProcessing] = useState<InboxZeroSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/inbox-zero/process')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Failed to load inbox zero status:', error)
    } finally {
      setLoading(false)
    }
  }

  const processInbox = async () => {
    setProcessing(true)
    try {
      const response = await fetch('/api/inbox-zero/process', {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        setLastProcessing(result)
        // Reload status to get updated counts
        await loadStatus()
      } else {
        console.error('Failed to process inbox')
      }
    } catch (error) {
      console.error('Error processing inbox:', error)
    } finally {
      setProcessing(false)
    }
  }

  const getProgressPercentage = () => {
    if (!status || status.unread_count === 0) return 100
    if (!lastProcessing) return 0
    
    const totalProcessed = lastProcessing.auto_archived + lastProcessing.auto_deleted
    const remaining = status.unread_count - totalProcessed
    return Math.max(0, Math.min(100, ((lastProcessing.total_emails - remaining) / lastProcessing.total_emails) * 100))
  }

  const getInboxZeroStatus = () => {
    if (!status) return 'unknown'
    if (status.unread_count === 0) return 'achieved'
    if (status.unread_count <= 5) return 'close'
    if (status.unread_count <= 20) return 'manageable'
    return 'needs_attention'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'achieved': return 'text-green-600 bg-green-50 border-green-200'
      case 'close': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'manageable': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'needs_attention': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusMessage = (status: string, count: number) => {
    switch (status) {
      case 'achieved': return '🎉 Inbox Zero Achieved!'
      case 'close': return `${count} emails left - almost there!`
      case 'manageable': return `${count} emails - manageable load`
      case 'needs_attention': return `${count} emails - needs attention`
      default: return 'Loading status...'
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading inbox status...</span>
        </div>
      </div>
    )
  }

  const inboxStatus = getInboxZeroStatus()
  const progressPercentage = getProgressPercentage()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inbox Zero</h2>
          <p className="text-muted-foreground">
            Intelligent email processing to achieve inbox zero rapidly
          </p>
        </div>
        <Button 
          onClick={processInbox} 
          disabled={processing}
          className="flex items-center space-x-2"
        >
          {processing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          <span>{processing ? 'Processing...' : 'Process Inbox'}</span>
        </Button>
      </div>

      {/* Inbox Status Card */}
      <Card className={`border-2 ${getStatusColor(inboxStatus)}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-full bg-current opacity-10">
                {inboxStatus === 'achieved' ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <Mail className="h-6 w-6" />
                )}
              </div>
              <div>
                <CardTitle className="text-xl">
                  {getStatusMessage(inboxStatus, status?.unread_count || 0)}
                </CardTitle>
                <CardDescription>
                  {status?.unread_count === 0 
                    ? 'All emails processed and organized'
                    : 'Click "Process Inbox" for AI-powered triage'
                  }
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {status?.unread_count || 0}
            </Badge>
          </div>
        </CardHeader>
        {progressPercentage > 0 && progressPercentage < 100 && (
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress to Inbox Zero</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Last Processing Results */}
      {lastProcessing && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Archive className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{lastProcessing.auto_archived}</p>
                  <p className="text-xs text-muted-foreground">Auto-Archived</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Trash2 className="h-4 w-4 text-red-600" />
                <div>
                  <p className="text-2xl font-bold">{lastProcessing.auto_deleted}</p>
                  <p className="text-xs text-muted-foreground">Auto-Deleted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold">{lastProcessing.requires_action}</p>
                  <p className="text-xs text-muted-foreground">Need Action</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Timer className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{Math.round(lastProcessing.processing_time_ms / 1000)}s</p>
                  <p className="text-xs text-muted-foreground">Processing Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Immediate Attention Items */}
      {lastProcessing?.immediate_attention && lastProcessing.immediate_attention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span>Immediate Attention Required</span>
              <Badge variant="destructive">{lastProcessing.immediate_attention.length}</Badge>
            </CardTitle>
            <CardDescription>
              These emails need your immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lastProcessing.immediate_attention.map((item, index) => (
                <ImmediateAttentionItem key={index} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested Actions */}
      {lastProcessing?.suggested_actions && lastProcessing.suggested_actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <span>AI Suggestions</span>
              <Badge variant="secondary">{lastProcessing.suggested_actions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Recommended actions for remaining emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lastProcessing.suggested_actions.slice(0, 5).map((item, index) => (
                <SuggestedActionItem key={index} item={item} />
              ))}
              {lastProcessing.suggested_actions.length > 5 && (
                <p className="text-sm text-muted-foreground">
                  ... and {lastProcessing.suggested_actions.length - 5} more suggestions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing History */}
      {status?.processing_history && status.processing_history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Recent Processing History</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.processing_history.slice(0, 3).map((log, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">
                      Processed {log.total_processed} emails
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.processed_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      {log.auto_actions_taken} auto-actions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.high_confidence_decisions} high confidence
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ImmediateAttentionItem({ item }: { item: EmailTriageResult }) {
  return (
    <div className="flex items-start space-x-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <Badge variant="destructive" className="text-xs">
            {item.priority.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {item.confidence}% confidence
          </Badge>
        </div>
        <p className="text-sm font-medium mt-1 text-foreground">{item.reason}</p>
        {item.suggested_response && (
          <p className="text-xs text-muted-foreground mt-1">
            Suggested action available
          </p>
        )}
      </div>
    </div>
  )
}

function SuggestedActionItem({ item }: { item: EmailTriageResult }) {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'today': return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400'
      case 'tomorrow': return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
      case 'this_week': return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900 text-yellow-700 dark:text-yellow-400'
      default: return 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className={`flex items-start space-x-3 p-3 border rounded-lg ${getCategoryColor(item.category)}`}>
      <Clock className="h-4 w-4 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs">
            {item.category.replace('_', ' ')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {item.priority}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {item.confidence}%
          </Badge>
        </div>
        <p className="text-sm mt-1 text-foreground">{item.reason}</p>
        {item.auto_action && (
          <p className="text-xs text-muted-foreground mt-1">
            Recommended: {item.auto_action.replace('_', ' ')}
          </p>
        )}
      </div>
    </div>
  )
}