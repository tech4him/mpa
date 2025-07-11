'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Briefcase, DollarSign, Users, Monitor, Building, Scale, Target, Wrench } from 'lucide-react'
import { TopicGroup } from '@/types/briefing'
import { EmailBriefingCard } from './email-briefing-card'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface TopicGroupCardProps {
  group: TopicGroup
  defaultExpanded?: boolean
  onEmailActionComplete?: () => void
}

const topicIcons: Record<string, any> = {
  'Financial Operations': DollarSign,
  'Personnel and HR': Users,
  'Project Management': Briefcase,
  'Technology and IT': Monitor,
  'Vendor and Partner Relations': Building,
  'Legal and Compliance': Scale,
  'Strategic Planning': Target,
  'Operations and Facilities': Wrench,
  'Miscellaneous': Briefcase
}

export function TopicGroupCard({ 
  group, 
  defaultExpanded = false,
  onEmailActionComplete 
}: TopicGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const Icon = topicIcons[group.title] || Briefcase

  const priorityColors = {
    high: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    low: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg">{group.title}</h3>
          <Badge variant="secondary">{group.count}</Badge>
          <Badge className={cn("text-xs", priorityColors[group.priority])}>
            {group.priority}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          {group.description && (
            <span className="text-sm text-muted-foreground hidden md:block">
              {group.description}
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t">
          <div className="p-4 space-y-2">
            {group.emails.map((email) => (
              <EmailBriefingCard 
                key={email.id} 
                email={email}
                onActionComplete={onEmailActionComplete}
              />
            ))}
          </div>
          
          {group.suggestedActions && group.suggestedActions.length > 0 && (
            <div className="border-t p-4 bg-muted/30">
              <h4 className="text-sm font-medium mb-2">Suggested Actions</h4>
              <ul className="space-y-1">
                {group.suggestedActions.map((action, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    • {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}