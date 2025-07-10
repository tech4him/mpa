'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { 
  Brain, 
  Plus, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb
} from 'lucide-react'

interface ProcessingRule {
  id: string
  name: string
  description: string
  is_active: boolean
  matching_criteria: any
  actions: any
  confidence_score: number
  times_applied: number
  times_correct: number
  times_incorrect: number
  created_at: string
}

interface ProcessingRulesManagerProps {
  threadId?: string
}

export function ProcessingRulesManager({ threadId }: ProcessingRulesManagerProps) {
  const [rules, setRules] = useState<ProcessingRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newInstruction, setNewInstruction] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showInstructionForm, setShowInstructionForm] = useState(false)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      const response = await fetch('/api/emails/rules')
      if (response.ok) {
        const data = await response.json()
        setRules(data.rules || [])
      }
    } catch (error) {
      console.error('Failed to load rules:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createRule = async () => {
    if (!newInstruction.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/emails/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          instruction: newInstruction,
          threadId // Include current thread as example if available
        })
      })

      if (response.ok) {
        const data = await response.json()
        setRules(prev => [data.rule, ...prev])
        setNewInstruction('')
        setShowInstructionForm(false)
        alert(`Rule "${data.rule.name}" created successfully!`)
      } else {
        const error = await response.json()
        alert('Failed to create rule: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to create rule:', error)
      alert('Failed to create rule. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const response = await fetch('/api/emails/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, isActive })
      })

      if (response.ok) {
        setRules(prev => prev.map(rule => 
          rule.id === ruleId ? { ...rule, is_active: isActive } : rule
        ))
      } else {
        alert('Failed to toggle rule')
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    }
  }

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const response = await fetch(`/api/emails/rules?id=${ruleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setRules(prev => prev.filter(rule => rule.id !== ruleId))
      } else {
        alert('Failed to delete rule')
      }
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatCriteria = (criteria: any) => {
    const parts = []
    
    if (criteria.sender_contains?.length) {
      parts.push(`Sender contains: ${criteria.sender_contains.join(', ')}`)
    }
    if (criteria.subject_contains?.length) {
      parts.push(`Subject contains: ${criteria.subject_contains.join(', ')}`)
    }
    if (criteria.category?.length) {
      parts.push(`Category: ${criteria.category.join(', ')}`)
    }
    if (criteria.participants_include?.length) {
      parts.push(`Participants include: ${criteria.participants_include.slice(0, 2).join(', ')}${criteria.participants_include.length > 2 ? '...' : ''}`)
    }
    
    return parts.length > 0 ? parts.join(' • ') : 'No specific criteria'
  }

  const formatActions = (actions: any) => {
    const parts = []
    
    if (actions.auto_process) parts.push('Auto-process')
    if (actions.move_to_folder) parts.push(`Move to: ${actions.move_to_folder}`)
    if (actions.response_style) parts.push(`Response: ${actions.response_style}`)
    if (actions.priority) parts.push(`Priority: ${actions.priority}`)
    
    return parts.length > 0 ? parts.join(' • ') : 'No actions'
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Brain className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-pulse" />
            <p className="text-gray-600">Loading processing rules...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <CardTitle>Email Processing Rules</CardTitle>
            </div>
            <Button
              onClick={() => setShowInstructionForm(!showInstructionForm)}
              variant="outline"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Rule</span>
            </Button>
          </div>
        </CardHeader>
        
        {showInstructionForm && (
          <CardContent className="border-t">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Instruction for AI Assistant
                </label>
                <Textarea
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  placeholder="Example: These messages I receive because I'm an admin of the resources. They require no action on my part. Move them to the appropriate folder and mark as processed. I don't need to waste time on them going forward."
                  rows={3}
                  className="w-full"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  onClick={createRule}
                  disabled={isCreating || !newInstruction.trim()}
                  className="flex items-center space-x-2"
                >
                  <Lightbulb className={`h-4 w-4 ${isCreating ? 'animate-pulse' : ''}`} />
                  <span>{isCreating ? 'Creating...' : 'Create Rule'}</span>
                </Button>
                <Button
                  onClick={() => {
                    setShowInstructionForm(false)
                    setNewInstruction('')
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Processing Rules Yet</h3>
              <p className="text-gray-600 mb-4">
                Create rules to teach the AI how to handle your emails automatically.
              </p>
              <Button
                onClick={() => setShowInstructionForm(true)}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create Your First Rule</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id} className={`${rule.is_active ? '' : 'opacity-60'}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <CardTitle className="text-lg">{rule.name}</CardTitle>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className={getConfidenceColor(rule.confidence_score)}>
                        {Math.round(rule.confidence_score * 100)}% confidence
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{rule.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => toggleRule(rule.id, !rule.is_active)}
                      variant="ghost"
                      size="sm"
                      title={rule.is_active ? 'Deactivate rule' : 'Activate rule'}
                    >
                      {rule.is_active ? 
                        <ToggleRight className="h-4 w-4 text-green-600" /> : 
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      }
                    </Button>
                    <Button
                      onClick={() => deleteRule(rule.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      title="Delete rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Matching Criteria:</h4>
                    <p className="text-sm text-gray-600">{formatCriteria(rule.matching_criteria)}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Actions:</h4>
                    <p className="text-sm text-gray-600">{formatActions(rule.actions)}</p>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Applied {rule.times_applied} times</span>
                    {rule.times_applied > 0 && (
                      <>
                        <span className="flex items-center space-x-1">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <span>{rule.times_correct} correct</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <XCircle className="h-3 w-3 text-red-600" />
                          <span>{rule.times_incorrect} incorrect</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}