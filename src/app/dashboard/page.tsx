'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EmailThreadList } from '@/components/email-thread-list'
import { StatsCards } from '@/components/stats-cards'
import { DashboardHeader } from '@/components/dashboard-header'
import { EmailClassificationDashboard } from '@/components/email-classification-dashboard'
import { ProcessingRulesManager } from '@/components/processing-rules-manager'
import { EnhancedDailyBriefingComponent } from '@/components/enhanced-daily-briefing'
import { ExecutiveAssistantBriefingComponent } from '@/components/executive-assistant-briefing'
import { InboxZeroDashboard } from '@/components/inbox-zero-dashboard'
import { ExecutiveCommandCenter } from '@/components/executive-command-center'
import { AgentMissionControl } from '@/components/agent-mission-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, RefreshCw, Brain, TrendingUp, Briefcase, Zap, Command, Clock, Users, Bot } from 'lucide-react'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [threads, setThreads] = useState<any[]>([])
  const [classificationStats, setClassificationStats] = useState<any>({})
  const [showProcessed, setShowProcessed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [autoProcessing, setAutoProcessing] = useState(false)
  const [briefing, setBriefing] = useState<any>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [executiveBriefing, setExecutiveBriefing] = useState<any>(null)
  const [executiveBriefingLoading, setExecutiveBriefingLoading] = useState(false)
  const [briefingType, setBriefingType] = useState<'enhanced' | 'executive'>('executive')
  const [activeTab, setActiveTab] = useState('command-center')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    // Handle URL parameters for navigation from Command Center
    const tab = searchParams.get('tab')
    const filter = searchParams.get('filter')
    const action = searchParams.get('action')
    
    if (tab) {
      setActiveTab(tab)
      
      // Apply filters based on parameters
      if (tab === 'emails' && filter === 'action_required') {
        // This will be handled in the EmailThreadList component
      }
    }
  }, [searchParams])

  useEffect(() => {
    if (user) {
      loadThreads()
      loadClassificationStats()
      loadBriefing()
      loadExecutiveBriefing()
    }
  }, [user, showProcessed])

  const checkUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      router.push('/auth/login')
      return
    }
    
    setUser(user)
  }

  const loadThreads = async () => {
    if (!user) return
    
    setLoading(true)
    
    let query = supabase
      .from('email_threads')
      .select('*, is_processed, is_hidden, processed_at, processing_reason')
      .eq('user_id', user.id)
      .order('last_message_date', { ascending: false })
      .limit(50)

    if (!showProcessed) {
      query = query.eq('is_hidden', false)
    }

    // Filter out SPAM using OR condition to handle NULL values properly
    query = query.or('category.is.null,category.neq.SPAM')

    const { data } = await query
    setThreads(data || [])
    setLoading(false)
  }

  const loadClassificationStats = async () => {
    if (!user) return

    const { data: classifications } = await supabase
      .from('email_classifications')
      .select('category, is_relevant')
      .eq('user_id', user.id)

    setClassificationStats({
      totalClassifications: classifications?.length || 0,
      spam: classifications?.filter(c => c.category === 'SPAM').length || 0,
      businessRelevant: classifications?.filter(c => c.category === 'BUSINESS_RELEVANT').length || 0,
    })
  }

  const handleAutoProcess = async () => {
    if (!user) return
    
    setAutoProcessing(true)
    
    try {
      const response = await fetch('/api/emails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_process' })
      })
      
      const result = await response.json()
      
      if (result.success) {
        console.log(`Auto-processed ${result.processedCount} threads`)
        loadThreads() // Refresh the list
      }
    } catch (error) {
      console.error('Auto-processing failed:', error)
    } finally {
      setAutoProcessing(false)
    }
  }

  const loadBriefing = async () => {
    if (!user) return
    
    setBriefingLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch(`/api/briefing/generate?date=${today}&type=morning`)
      
      if (response.ok) {
        const data = await response.json()
        setBriefing(data.briefing)
      }
    } catch (error) {
      console.error('Error loading briefing:', error)
    } finally {
      setBriefingLoading(false)
    }
  }

  const loadExecutiveBriefing = async () => {
    if (!user) return
    
    setExecutiveBriefingLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch(`/api/briefing/executive?date=${today}&type=morning`)
      
      if (response.ok) {
        const data = await response.json()
        setExecutiveBriefing(data.briefing)
      }
    } catch (error) {
      console.error('Error loading executive briefing:', error)
    } finally {
      setExecutiveBriefingLoading(false)
    }
  }

  const statsData = {
    totalThreads: threads?.length || 0,
    actionRequired: threads?.filter(t => t.is_action_required).length || 0,
    unread: threads?.filter(t => t.has_unread).length || 0,
    vipThreads: threads?.filter(t => t.category === 'VIP_CRITICAL').length || 0,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <DashboardHeader />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="text-center">Loading...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardHeader />
      
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Executive Command Center
              </h1>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                AI-powered work orchestration - communications, commitments, and relationships
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleAutoProcess}
                disabled={autoProcessing}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${autoProcessing ? 'animate-spin' : ''}`} />
                <span>Auto-Process</span>
              </Button>
              
              <Button
                onClick={() => setShowProcessed(!showProcessed)}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                {showProcessed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{showProcessed ? 'Hide Processed' : 'Show Processed'}</span>
              </Button>
            </div>
          </div>
        </div>

        <StatsCards stats={statsData} />

        <div className="mt-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="command-center" className="flex items-center space-x-1">
                <Command className="h-4 w-4" />
                <span>Command Center</span>
              </TabsTrigger>
              <TabsTrigger value="commitments" className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Commitments</span>
              </TabsTrigger>
              <TabsTrigger value="relationships" className="flex items-center space-x-1">
                <Users className="h-4 w-4" />
                <span>Relationships</span>
              </TabsTrigger>
              <TabsTrigger value="emails">
                Email Threads 
                {!showProcessed && (
                  <span className="ml-2 text-xs text-gray-500">(active only)</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="inbox-zero" className="flex items-center space-x-1">
                <Zap className="h-4 w-4" />
                <span>Inbox Zero</span>
              </TabsTrigger>
              <TabsTrigger value="agents" className="flex items-center space-x-1">
                <Bot className="h-4 w-4" />
                <span>Agents</span>
              </TabsTrigger>
              <TabsTrigger value="briefing" className="flex items-center space-x-1">
                <Briefcase className="h-4 w-4" />
                <span>Intelligence Briefing</span>
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex items-center space-x-1">
                <Brain className="h-4 w-4" />
                <span>AI Rules</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="command-center" className="mt-6">
              <ExecutiveCommandCenter />
            </TabsContent>
            
            <TabsContent value="commitments" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Commitments & Tasks</h2>
                  <Button onClick={() => router.push('/api/executive/extract-commitments')} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Extract from Recent Emails
                  </Button>
                </div>
                <div className="text-center py-12 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4" />
                  <p>Commitment tracking will be implemented here</p>
                  <p className="text-sm">This will show all your promises, deliverables, and what you're waiting for</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="relationships" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Relationship Health</h2>
                  <Button onClick={() => {}} variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Analyze Patterns
                  </Button>
                </div>
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4" />
                  <p>Relationship monitoring will be implemented here</p>
                  <p className="text-sm">This will show contacts going cold, overdue follow-ups, and relationship insights</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="emails" className="mt-6">
              <EmailThreadList 
                threads={threads || []} 
                showProcessed={showProcessed}
                onThreadUpdated={loadThreads}
                filterActionRequired={searchParams.get('filter') === 'action_required'}
              />
            </TabsContent>
            
            <TabsContent value="inbox-zero" className="mt-6">
              <InboxZeroDashboard />
            </TabsContent>
            
            <TabsContent value="agents" className="mt-6">
              <AgentMissionControl />
            </TabsContent>
            
            <TabsContent value="briefing" className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Button
                    variant={briefingType === 'executive' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBriefingType('executive')}
                    className="flex items-center space-x-1"
                  >
                    <Briefcase className="h-4 w-4" />
                    <span>Executive Assistant</span>
                  </Button>
                  <Button
                    variant={briefingType === 'enhanced' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBriefingType('enhanced')}
                    className="flex items-center space-x-1"
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span>Email-Based</span>
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {briefingType === 'executive' 
                    ? 'Strategic project and relationship intelligence' 
                    : 'Topic-organized email briefing'}
                </div>
              </div>
              
              {briefingType === 'executive' ? (
                <ExecutiveAssistantBriefingComponent 
                  briefing={executiveBriefing}
                  onRefresh={loadExecutiveBriefing}
                  loading={executiveBriefingLoading}
                />
              ) : (
                <EnhancedDailyBriefingComponent 
                  briefing={briefing}
                  onRefresh={loadBriefing}
                  loading={briefingLoading}
                />
              )}
            </TabsContent>
            
            <TabsContent value="rules" className="mt-6">
              <ProcessingRulesManager />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}