import { run } from '@openai/agents';
import { simpleEmailAgent } from './simple-email-agent';
import { analyzeEmailThreadWithAgent } from './email-analyzer-agent';
import { generateDraftWithAgent } from './draft-generator-agent';
import { VectorStoreService } from '@/lib/vector-store/service';
import { createClient } from '@/lib/supabase/server';
import { EmailThread, ThreadAnalysis } from '@/types';

export class AgentEmailProcessor {
  private supabase: any;
  private vectorStoreService: VectorStoreService;

  constructor() {
    this.supabase = null;
    this.vectorStoreService = new VectorStoreService();
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  async processEmailWithAgent(
    threadId: string,
    userId: string,
    messageId: string
  ): Promise<{
    analysis: ThreadAnalysis;
    draftGenerated: boolean;
    draftId?: string;
    tasksExtracted: any[];
    organizationalInsights: any;
  }> {
    try {
      const supabase = await this.getSupabase();

      // Get thread and messages
      const { data: thread } = await supabase
        .from('email_threads')
        .select('*')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

      if (!thread) {
        throw new Error('Thread not found');
      }

      const { data: messages } = await supabase
        .from('email_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('sent_date', { ascending: true });

      const latestMessage = messages[messages.length - 1];

      // Analyze thread with agent
      const analysis = await analyzeEmailThreadWithAgent({
        thread,
        emails: messages,
        latestEmail: latestMessage,
        userId,
      });

      // Generate draft if action required
      let draftGenerated = false;
      let draftId: string | undefined;

      if (analysis.requiresAction) {
        try {
          const draft = await generateDraftWithAgent({
            threadId,
            userId,
            draftType: 'reply',
            context: analysis.contextSummary,
            urgency: analysis.priority > 4 ? 'high' : analysis.priority > 2 ? 'medium' : 'low',
            recipientRelationship: analysis.isVIP ? 'board' : 'external',
          });

          draftGenerated = true;
          draftId = draft.id;
        } catch (error) {
          console.error('Error generating draft:', error);
        }
      }

      // Extract tasks using agent
      const tasksExtracted = await this.extractTasksWithAgent(
        threadId,
        userId,
        messages,
        analysis
      );

      // Update organizational memory
      await this.updateOrganizationalMemory(
        thread,
        messages,
        analysis,
        userId
      );

      // Update thread with analysis results
      await supabase
        .from('email_threads')
        .update({
          category: analysis.category,
          priority: analysis.priority,
          is_vip: analysis.isVIP,
          metadata: {
            ...thread.metadata,
            agent_analysis: {
              confidence: analysis.confidence,
              context_summary: analysis.contextSummary,
              project_references: analysis.projectReferences,
              relationship_insights: analysis.relationshipInsights,
              analysis_date: new Date().toISOString(),
            },
          },
        })
        .eq('id', threadId);

      return {
        analysis,
        draftGenerated,
        draftId,
        tasksExtracted,
        organizationalInsights: {
          projectReferences: analysis.projectReferences,
          relationshipInsights: analysis.relationshipInsights,
          contextSummary: analysis.contextSummary,
        },
      };
    } catch (error) {
      console.error('Agent email processing error:', error);
      throw error;
    }
  }

  private async extractTasksWithAgent(
    threadId: string,
    userId: string,
    messages: any[],
    analysis: ThreadAnalysis
  ): Promise<any[]> {
    if (!analysis.hasTask) {
      return [];
    }

    try {
      const supabase = await this.getSupabase();

      // Use agent to extract detailed tasks
      const response = await run(simpleEmailAgent, `Extract actionable tasks from this email thread:

THREAD CONTEXT:
${JSON.stringify(messages, null, 2)}

ANALYSIS CONTEXT:
${JSON.stringify(analysis, null, 2)}

Extract specific tasks with:
1. Clear task description
2. Due date if mentioned
3. Who it's assigned to
4. Priority level
5. Any dependencies

Return as JSON array of tasks:
[
  {
    "description": "task description",
    "due_date": "YYYY-MM-DD or null",
    "assigned_to": "person or null",
    "priority": 1-5,
    "dependencies": ["dependency1", "dependency2"],
    "confidence": 0.0-1.0
  }
]`);

      const tasksData = this.parseTasksFromResponse(
        response.finalOutput || ''
      );

      // Store tasks in database
      const storedTasks = [];
      for (const task of tasksData) {
        const { data: storedTask } = await supabase
          .from('extracted_tasks')
          .insert({
            thread_id: threadId,
            user_id: userId,
            task_description: task.description,
            due_date: task.due_date,
            assigned_to: task.assigned_to,
            status: 'pending',
            confidence: task.confidence,
          })
          .select()
          .single();

        if (storedTask) {
          storedTasks.push(storedTask);
        }
      }

      return storedTasks;
    } catch (error) {
      console.error('Error extracting tasks with agent:', error);
      return [];
    }
  }

  private parseTasksFromResponse(content: string): any[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Error parsing tasks from response:', error);
      return [];
    }
  }

  private async updateOrganizationalMemory(
    thread: any,
    messages: any[],
    analysis: ThreadAnalysis,
    userId: string
  ): Promise<void> {
    try {
      const supabase = await this.getSupabase();

      // Only update if the analysis has high confidence and contains significant information
      if ((analysis.confidence || 0) < 0.7) {
        return;
      }

      // Determine if this thread contains significant organizational information
      const hasSignificantInfo = 
        analysis.isVIP || 
        analysis.category === 'FINANCIAL' || 
        analysis.category === 'VIP_CRITICAL' ||
        (analysis.projectReferences && analysis.projectReferences.length > 0);

      if (!hasSignificantInfo) {
        return;
      }

      // Create a summary of the thread
      const threadSummary = {
        subject: thread.subject,
        participants: thread.participants,
        category: analysis.category,
        priority: analysis.priority,
        key_points: analysis.contextSummary,
        project_references: analysis.projectReferences,
        relationship_insights: analysis.relationshipInsights,
        message_count: messages.length,
        date_range: {
          start: messages[0]?.sent_date,
          end: messages[messages.length - 1]?.sent_date,
        },
      };

      // Upload to vector store
      const emailDocument = {
        id: thread.id,
        subject: thread.subject,
        content: JSON.stringify(threadSummary),
        sender: thread.participants[0] || '',
        recipients: thread.participants.slice(1) || [],
        date: messages[messages.length - 1]?.sent_date || new Date().toISOString(),
        category: analysis.category,
        priority: analysis.priority > 3 ? 'high' : 'medium',
        threadId: thread.id,
      };

      // Upload significant organizational knowledge to vector store
      const uploadResult = await this.vectorStoreService.uploadEmailToVectorStore(
        emailDocument,
        userId
      );

      // Store in organizational knowledge database
      await supabase
        .from('organizational_knowledge')
        .insert({
          document_type: 'email',
          content: JSON.stringify(threadSummary),
          metadata: {
            thread_id: thread.id,
            user_id: userId,
            analysis_confidence: analysis.confidence,
            participants: thread.participants,
            category: analysis.category,
            significance: hasSignificantInfo ? 'high' : 'medium',
            auto_generated: true,
            source: 'agent_analysis',
          },
          vector_store_id: uploadResult.recordId || null,
        });

      // Update relationship intelligence
      await this.updateRelationshipIntelligence(
        thread.participants,
        analysis,
        userId
      );
    } catch (error) {
      console.error('Error updating organizational memory:', error);
    }
  }

  private async updateRelationshipIntelligence(
    participants: string[],
    analysis: ThreadAnalysis,
    userId: string
  ): Promise<void> {
    try {
      const supabase = await this.getSupabase();

      for (const participant of participants) {
        // Get or create contact
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', participant)
          .eq('user_id', userId)
          .single();

        if (!contact) {
          continue;
        }

        // Get existing relationship intelligence
        const { data: existing } = await supabase
          .from('relationship_intelligence')
          .select('*')
          .eq('contact_id', contact.id)
          .single();

        const newInteraction = {
          date: new Date().toISOString(),
          category: analysis.category,
          priority: analysis.priority,
          is_vip: analysis.isVIP,
          context_summary: analysis.contextSummary,
          project_references: analysis.projectReferences,
        };

        if (existing) {
          // Update existing record
          const interactionHistory = existing.interaction_history || [];
          interactionHistory.push(newInteraction);

          // Keep only last 50 interactions
          if (interactionHistory.length > 50) {
            interactionHistory.shift();
          }

          await supabase
            .from('relationship_intelligence')
            .update({
              interaction_history: interactionHistory,
              project_involvement: [
                ...(existing.project_involvement || []),
                ...(analysis.projectReferences || []),
              ].filter((value, index, self) => self.indexOf(value) === index),
            })
            .eq('id', existing.id);
        } else {
          // Create new record
          await supabase
            .from('relationship_intelligence')
            .insert({
              contact_id: contact.id,
              interaction_history: [newInteraction],
              project_involvement: analysis.projectReferences || [],
              communication_preferences: {
                typical_response_time: 'unknown',
                preferred_communication_style: 'professional',
              },
            });
        }
      }
    } catch (error) {
      console.error('Error updating relationship intelligence:', error);
    }
  }

  // Batch process multiple emails
  async batchProcessEmails(
    userId: string,
    emailIds: string[]
  ): Promise<{
    processed: number;
    failed: number;
    results: any[];
  }> {
    const results = [];
    let processed = 0;
    let failed = 0;

    for (const emailId of emailIds) {
      try {
        // Get thread ID for this email
        const supabase = await this.getSupabase();
        const { data: message } = await supabase
          .from('email_messages')
          .select('thread_id')
          .eq('id', emailId)
          .single();

        if (!message) {
          failed++;
          continue;
        }

        const result = await this.processEmailWithAgent(
          message.thread_id,
          userId,
          emailId
        );

        results.push({
          emailId,
          threadId: message.thread_id,
          success: true,
          result,
        });

        processed++;
      } catch (error) {
        console.error(`Error processing email ${emailId}:`, error);
        results.push({
          emailId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    return {
      processed,
      failed,
      results,
    };
  }
}