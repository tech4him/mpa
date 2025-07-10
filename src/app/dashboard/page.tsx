'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EmailThreadList } from '@/components/email-thread-list'
import { StatsCards } from '@/components/stats-cards'
import { DashboardHeader } from '@/components/dashboard-header'
import { EmailClassificationDashboard } from '@/components/email-classification-dashboard'
import { ProcessingRulesManager } from '@/components/processing-rules-manager'
import { DailyBriefingComponent } from '@/components/daily-briefing'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, RefreshCw, Brain, TrendingUp } from 'lucide-react'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [threads, setThreads] = useState<any[]>([])
  const [classificationStats, setClassificationStats] = useState<any>({})
  const [showProcessed, setShowProcessed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [autoProcessing, setAutoProcessing] = useState(false)
  const [briefing, setBriefing] = useState<any>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      loadThreads()
      loadClassificationStats()
      loadBriefing()
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
                Email Dashboard
              </h1>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                Manage your email threads, AI-generated drafts, and email classifications
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
          <Tabs defaultValue="briefing" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="briefing" className="flex items-center space-x-1">
                <TrendingUp className="h-4 w-4" />
                <span>Daily Briefing</span>
              </TabsTrigger>
              <TabsTrigger value="emails">
                Email Threads 
                {!showProcessed && (
                  <span className="ml-2 text-xs text-gray-500">(active only)</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="classification">
                Classification {classificationStats.spam > 0 && (
                  <span className="ml-2 bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                    {classificationStats.spam}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex items-center space-x-1">
                <Brain className="h-4 w-4" />
                <span>AI Rules</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="briefing" className="mt-6">
              <DailyBriefingComponent 
                briefing={briefing}
                onRefresh={loadBriefing}
                loading={briefingLoading}
              />
            </TabsContent>
            
            <TabsContent value="emails" className="mt-6">
              <EmailThreadList 
                threads={threads || []} 
                showProcessed={showProcessed}
                onThreadUpdated={loadThreads}
              />
            </TabsContent>
            
            <TabsContent value="classification" className="mt-6">
              <EmailClassificationDashboard />
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