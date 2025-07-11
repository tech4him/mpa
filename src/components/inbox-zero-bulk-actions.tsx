'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { 
  Archive, 
  Trash2, 
  Clock, 
  CheckCircle, 
  Mail,
  Zap,
  Filter,
  RefreshCw
} from 'lucide-react'

interface EmailItem {
  id: string
  subject: string
  sender: string
  received_at: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  category: string
  confidence: number
  suggested_action?: string
}

interface BulkActionsProps {
  emails: EmailItem[]
  onActionComplete?: () => void
}

export function InboxZeroBulkActions({ emails, onActionComplete }: BulkActionsProps) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'high_confidence' | 'archive' | 'delete'>('all')

  const filteredEmails = emails.filter(email => {
    switch (filter) {
      case 'high_confidence':
        return email.confidence >= 90
      case 'archive':
        return email.suggested_action === 'archive'
      case 'delete':
        return email.suggested_action === 'delete'
      default:
        return true
    }
  })

  const toggleEmailSelection = (emailId: string) => {
    const newSelected = new Set(selectedEmails)
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId)
    } else {
      newSelected.add(emailId)
    }
    setSelectedEmails(newSelected)
  }

  const selectAllFiltered = () => {
    const allFilteredIds = new Set(filteredEmails.map(email => email.id))
    setSelectedEmails(allFilteredIds)
  }

  const clearSelection = () => {
    setSelectedEmails(new Set())
  }

  const executeBulkAction = async (action: string) => {
    if (selectedEmails.size === 0) return

    setProcessing(true)
    try {
      const actions = Array.from(selectedEmails).map(emailId => ({
        email_id: emailId,
        action_type: action
      }))

      const response = await fetch('/api/inbox-zero/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions })
      })

      if (response.ok) {
        clearSelection()
        onActionComplete?.()
      } else {
        console.error('Failed to execute bulk actions')
      }
    } catch (error) {
      console.error('Error executing bulk actions:', error)
    } finally {
      setProcessing(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600'
    if (confidence >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-4">
      {/* Header with filters and bulk actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Bulk Email Actions</span>
            <Badge variant="outline">{emails.length} emails</Badge>
          </CardTitle>
          <CardDescription>
            Select emails and execute bulk actions to reach inbox zero faster
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filter:</span>
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All ({emails.length})
            </Button>
            <Button
              variant={filter === 'high_confidence' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('high_confidence')}
            >
              High Confidence ({emails.filter(e => e.confidence >= 90).length})
            </Button>
            <Button
              variant={filter === 'archive' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('archive')}
            >
              Auto-Archive ({emails.filter(e => e.suggested_action === 'archive').length})
            </Button>
            <Button
              variant={filter === 'delete' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('delete')}
            >
              Auto-Delete ({emails.filter(e => e.suggested_action === 'delete').length})
            </Button>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium">
                {selectedEmails.size} of {filteredEmails.length} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllFiltered}
                disabled={filteredEmails.length === 0}
              >
                Select All Filtered
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={selectedEmails.size === 0}
              >
                Clear Selection
              </Button>
            </div>

            {/* Bulk action buttons */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => executeBulkAction('archive')}
                disabled={selectedEmails.size === 0 || processing}
                className="flex items-center space-x-1"
              >
                <Archive className="h-4 w-4" />
                <span>Archive</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executeBulkAction('delete')}
                disabled={selectedEmails.size === 0 || processing}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executeBulkAction('mark_read')}
                disabled={selectedEmails.size === 0 || processing}
                className="flex items-center space-x-1"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Mark Read</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email list */}
      <div className="space-y-2">
        {filteredEmails.map((email) => (
          <Card key={email.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  checked={selectedEmails.has(email.id)}
                  onCheckedChange={() => toggleEmailSelection(email.id)}
                />
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-sm truncate max-w-md">
                        {email.subject}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge className={getPriorityColor(email.priority)} variant="outline">
                        {email.priority}
                      </Badge>
                      <Badge variant="outline" className={getConfidenceColor(email.confidence)}>
                        {email.confidence}%
                      </Badge>
                      {email.suggested_action && (
                        <Badge variant="secondary" className="text-xs">
                          {email.suggested_action}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-gray-600 truncate max-w-xs">
                      {email.sender}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(email.received_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredEmails.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No emails found for the selected filter</p>
            </CardContent>
          </Card>
        )}
      </div>

      {processing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6">
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Processing bulk actions...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}