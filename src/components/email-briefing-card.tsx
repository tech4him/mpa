'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { 
  CheckCircle2, 
  Reply, 
  FolderOpen, 
  Clock,
  User,
  ChevronRight,
  Mail
} from 'lucide-react'
import { EmailBriefingItem, EmailAction } from '@/types/briefing'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
// import { toast } from 'sonner'

interface EmailBriefingCardProps {
  email: EmailBriefingItem
  onActionComplete?: () => void
}

export function EmailBriefingCard({ email, onActionComplete }: EmailBriefingCardProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const handleAction = async (action: EmailAction) => {
    setIsProcessing(true)
    
    try {
      switch (action.type) {
        case 'mark_done':
          await markAsRead(email.id)
          setIsDone(true)
          console.log('Email marked as done')
          break
          
        case 'draft_reply':
          window.location.href = `/dashboard/thread/${email.id}?action=draft`
          break
          
        case 'file':
          await fileEmail(email.id)
          console.log('Email filed')
          break
          
        case 'snooze':
          // TODO: Implement snooze functionality
          console.log('Snooze feature coming soon')
          break
      }
      
      onActionComplete?.()
    } catch (error) {
      console.error('Action failed:', error)
      console.error('Action failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const defaultActions: EmailAction[] = [
    { type: 'mark_done', label: 'Done', icon: 'check' },
    { type: 'draft_reply', label: 'Reply', icon: 'reply' },
    { type: 'file', label: 'File', icon: 'folder' }
  ]

  const actions = email.actions || defaultActions

  return (
    <div 
      className={cn(
        "p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        isDone && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground truncate">
              {email.from.name || email.from.email}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(email.received_at), 'MMM d, h:mm a')}
            </span>
          </div>
          
          <Link 
            href={`/dashboard/thread/${email.id}`}
            className="block group"
          >
            <h4 className="font-medium mb-1 group-hover:text-primary transition-colors">
              {email.subject}
            </h4>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {email.preview}
            </p>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.type}
              variant="ghost"
              size="sm"
              onClick={() => handleAction(action)}
              disabled={isProcessing || isDone}
              className="h-8"
            >
              {action.type === 'mark_done' && <CheckCircle2 className="w-4 h-4" />}
              {action.type === 'draft_reply' && <Reply className="w-4 h-4" />}
              {action.type === 'file' && <FolderOpen className="w-4 h-4" />}
              {action.type === 'snooze' && <Clock className="w-4 h-4" />}
              <span className="ml-1">{action.label}</span>
            </Button>
          ))}
          
          <Link href={`/dashboard/thread/${email.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

async function markAsRead(threadId: string) {
  const response = await fetch(`/api/email/mark-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId })
  })
  
  if (!response.ok) {
    throw new Error('Failed to mark as read')
  }
}

async function fileEmail(threadId: string) {
  const response = await fetch(`/api/email/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId })
  })
  
  if (!response.ok) {
    throw new Error('Failed to file email')
  }
}