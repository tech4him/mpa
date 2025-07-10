import { Agent } from '@openai/agents';
import { VectorStoreService } from '@/lib/vector-store/service';
import { createClient } from '@/lib/supabase/server';

// Initialize services
const vectorStoreService = new VectorStoreService();

interface EmailClassification {
  isRelevant: boolean;
  category: 'BUSINESS_RELEVANT' | 'PROMOTIONAL' | 'SOCIAL' | 'NEWSLETTER' | 'SPAM' | 'PERSONAL';
  businessContext: 'MISSION_MUTUAL' | 'INSURANCE_INDUSTRY' | 'CHRISTIAN_MINISTRY' | 'EXTERNAL' | 'UNRELATED';
  shouldIndex: boolean; // Whether to include in vector store
  shouldArchive: boolean;
  reasoning: string;
  confidence: number;
}

interface EmailContext {
  id: string;
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  threadId: string;
}

// Email classification agent focused on business relevance
export const emailClassificationAgent = new Agent({
  name: 'MPA Email Classification Agent',
  model: 'gpt-4o',
  instructions: `You are an email classification specialist for Mission Mutual, a Christian insurance company. Your job is to determine if emails are relevant to business operations and should be processed by AI agents or included in organizational knowledge.

MISSION MUTUAL CONTEXT:
- Christian insurance company
- Key personnel: Tom Lucas (VP Business Operations), Anthony Keeler (Finance Director), Julie Riggs (Operations Coordinator), Andrew Cleveland (Data and Reporting Manager)
- Services: Life, Health, Property, Business Insurance, Financial Planning
- Focus: Christian values, community service, donor campaigns, board governance

CLASSIFICATION CATEGORIES:
1. BUSINESS_RELEVANT:
   - Insurance industry communications
   - Vendor/partner correspondence
   - Customer service matters
   - Financial/accounting topics
   - Legal/regulatory updates
   - Internal operations
   - Board/governance communications

2. PROMOTIONAL:
   - Marketing emails from legitimate businesses
   - Conference invitations
   - Service offerings
   - Industry newsletters with business value

3. SOCIAL:
   - Community event invitations
   - Christian ministry communications
   - Donor appreciation events
   - Networking opportunities

4. NEWSLETTER:
   - Industry publications
   - Christian ministry updates
   - Financial/insurance newsletters
   - Regulatory updates

5. SPAM:
   - Obvious spam that slipped through M365
   - Get-rich-quick schemes
   - Suspicious promotional content
   - Irrelevant mass marketing

6. PERSONAL:
   - Personal communications not related to business
   - Family/friend messages
   - Personal appointments

BUSINESS CONTEXT ASSESSMENT:
- MISSION_MUTUAL: Direct relevance to company operations
- INSURANCE_INDUSTRY: Industry-related content
- CHRISTIAN_MINISTRY: Christian community/ministry related
- EXTERNAL: Business-related but not directly relevant
- UNRELATED: No business relevance

INDEXING DECISIONS:
- Include in vector store (shouldIndex = true): Business-relevant content that provides organizational value
- Exclude from vector store: Spam, irrelevant promotional content, personal messages
- Archive: Low-value but legitimate emails that don't need agent processing

Always provide specific reasoning for your classification decisions.`,
});

export class EmailClassificationProcessor {
  private supabase: any;

  constructor() {
    this.supabase = null;
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  async classifyEmail(
    emailContext: EmailContext,
    userId: string
  ): Promise<EmailClassification> {
    try {
      // Rule-based pre-classification
      const quickClassification = this.performQuickClassification(emailContext);
      
      if (quickClassification.confidence > 0.8) {
        // High confidence quick classification
        await this.storeClassification(emailContext, quickClassification, userId);
        return quickClassification;
      }

      // For uncertain cases, use more detailed analysis
      const detailedClassification = await this.performDetailedClassification(emailContext);
      
      // Store classification results
      await this.storeClassification(emailContext, detailedClassification, userId);
      
      return detailedClassification;
    } catch (error) {
      console.error('Email classification error:', error);
      // Default to conservative classification
      return {
        isRelevant: true,
        category: 'BUSINESS_RELEVANT',
        businessContext: 'EXTERNAL',
        shouldIndex: false,
        shouldArchive: false,
        reasoning: 'Error in classification - defaulting to manual review',
        confidence: 0.1,
      };
    }
  }

  private performQuickClassification(email: EmailContext): EmailClassification {
    const subject = email.subject.toLowerCase();
    const body = email.body.toLowerCase();
    const senderDomain = email.sender.split('@')[1]?.toLowerCase();
    
    // Mission Mutual internal emails
    if (senderDomain === 'missionmutual.org') {
      return {
        isRelevant: true,
        category: 'BUSINESS_RELEVANT',
        businessContext: 'MISSION_MUTUAL',
        shouldIndex: true,
        shouldArchive: false,
        reasoning: 'Internal Mission Mutual email - high business relevance',
        confidence: 0.95,
      };
    }

    // Clear spam indicators
    const spamIndicators = [
      /make.*money.*fast/i,
      /earn.*\$\d+.*week/i,
      /winner.*lottery/i,
      /congratulations.*won/i,
      /urgent.*transfer/i,
      /bitcoin.*investment/i,
      /forex.*trading/i,
      /weight.*loss.*miracle/i,
    ];

    if (spamIndicators.some(pattern => pattern.test(subject) || pattern.test(body))) {
      return {
        isRelevant: false,
        category: 'SPAM',
        businessContext: 'UNRELATED',
        shouldIndex: false,
        shouldArchive: false,
        reasoning: 'Spam patterns detected - not relevant to business',
        confidence: 0.9,
      };
    }

    // Insurance industry domains
    const insuranceDomains = [
      'insurance.com', 'naic.org', 'iii.org', 'acli.com', 'propertyinsuranceinfo.com',
      'insurancejournal.com', 'carriermanagement.com', 'riskandinsurance.com'
    ];

    if (insuranceDomains.some(domain => senderDomain?.includes(domain))) {
      return {
        isRelevant: true,
        category: 'BUSINESS_RELEVANT',
        businessContext: 'INSURANCE_INDUSTRY',
        shouldIndex: true,
        shouldArchive: false,
        reasoning: 'Insurance industry communication - relevant to business',
        confidence: 0.85,
      };
    }

    // Christian ministry/community domains
    const christianDomains = [
      'christianity.com', 'faithgateway.com', 'crosswalk.com', 'ministry.com',
      'church.org', 'christian.org', 'gospel.com'
    ];

    if (christianDomains.some(domain => senderDomain?.includes(domain))) {
      return {
        isRelevant: true,
        category: 'SOCIAL',
        businessContext: 'CHRISTIAN_MINISTRY',
        shouldIndex: false,
        shouldArchive: true,
        reasoning: 'Christian ministry communication - relevant to organizational values',
        confidence: 0.8,
      };
    }

    // Newsletter patterns
    const newsletterPatterns = [
      /newsletter/i,
      /weekly.*update/i,
      /monthly.*digest/i,
      /industry.*news/i,
      /unsubscribe/i,
    ];

    if (newsletterPatterns.some(pattern => pattern.test(subject) || pattern.test(body))) {
      return {
        isRelevant: true,
        category: 'NEWSLETTER',
        businessContext: 'EXTERNAL',
        shouldIndex: false,
        shouldArchive: true,
        reasoning: 'Newsletter content - informational value but not critical',
        confidence: 0.7,
      };
    }

    // Promotional patterns
    const promotionalPatterns = [
      /sale.*ends/i,
      /limited.*time.*offer/i,
      /\d+%.*off/i,
      /free.*trial/i,
      /upgrade.*now/i,
    ];

    if (promotionalPatterns.some(pattern => pattern.test(subject) || pattern.test(body))) {
      return {
        isRelevant: false,
        category: 'PROMOTIONAL',
        businessContext: 'EXTERNAL',
        shouldIndex: false,
        shouldArchive: true,
        reasoning: 'Promotional content - not relevant to business operations',
        confidence: 0.75,
      };
    }

    // Default to uncertain - needs detailed analysis
    return {
      isRelevant: true,
      category: 'BUSINESS_RELEVANT',
      businessContext: 'EXTERNAL',
      shouldIndex: false,
      shouldArchive: false,
      reasoning: 'Uncertain classification - needs detailed analysis',
      confidence: 0.3,
    };
  }

  private async performDetailedClassification(email: EmailContext): Promise<EmailClassification> {
    // For now, return the quick classification with slightly higher confidence
    // In production, this would use the AI agent for more nuanced analysis
    const quickResult = this.performQuickClassification(email);
    return {
      ...quickResult,
      confidence: Math.min(0.8, quickResult.confidence + 0.2),
      reasoning: `Detailed analysis: ${quickResult.reasoning}`,
    };
  }

  private async storeClassification(
    email: EmailContext,
    classification: EmailClassification,
    userId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_classifications')
      .insert({
        user_id: userId,
        email_id: email.id,
        thread_id: email.threadId,
        sender: email.sender,
        subject: email.subject,
        is_relevant: classification.isRelevant,
        category: classification.category,
        business_context: classification.businessContext,
        should_index: classification.shouldIndex,
        should_archive: classification.shouldArchive,
        reasoning: classification.reasoning,
        confidence: classification.confidence,
        classification_date: new Date().toISOString(),
      });
  }

  async handleEmailAction(
    emailId: string,
    action: 'archive' | 'ignore' | 'mark_irrelevant' | 'mark_relevant',
    userId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    switch (action) {
      case 'archive':
        await this.archiveEmail(emailId, userId);
        break;
      case 'ignore':
        await this.ignoreEmail(emailId, userId);
        break;
      case 'mark_irrelevant':
        await this.markEmailIrrelevant(emailId, userId);
        break;
      case 'mark_relevant':
        await this.markEmailRelevant(emailId, userId);
        break;
    }
  }

  private async archiveEmail(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_messages')
      .update({ 
        archived: true,
        archive_date: new Date().toISOString(),
        archive_reason: 'User action - archived'
      })
      .eq('id', emailId)
      .eq('user_id', userId);
  }

  private async ignoreEmail(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_messages')
      .update({ 
        ignored: true,
        ignore_date: new Date().toISOString(),
      })
      .eq('id', emailId)
      .eq('user_id', userId);
  }

  private async markEmailIrrelevant(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_classifications')
      .update({
        is_relevant: false,
        should_index: false,
        user_override: true,
        override_date: new Date().toISOString(),
      })
      .eq('email_id', emailId)
      .eq('user_id', userId);
  }

  private async markEmailRelevant(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_classifications')
      .update({
        is_relevant: true,
        should_index: true,
        user_override: true,
        override_date: new Date().toISOString(),
      })
      .eq('email_id', emailId)
      .eq('user_id', userId);
  }
}