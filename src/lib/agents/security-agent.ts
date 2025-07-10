import { Agent, tool } from '@openai/agents';
import { VectorStoreService } from '@/lib/vector-store/service';
import { createClient } from '@/lib/supabase/server';

// Initialize services
const vectorStoreService = new VectorStoreService();

interface SecurityAnalysis {
  isSpam: boolean;
  isPhishing: boolean;
  isSuspicious: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  indicators: string[];
  confidence: number;
  recommendedAction: 'allow' | 'quarantine' | 'delete' | 'report';
  reasoning: string;
}

interface EmailSecurityContext {
  id: string;
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  headers?: any;
  links?: string[];
  attachments?: string[];
  threadId: string;
}

// Security-focused email analysis agent
export const securityAgent = new Agent({
  name: 'MPA Security Agent',
  model: 'gpt-4o',
  instructions: `You are a cybersecurity expert for Mission Mutual, a Christian insurance company. Your primary responsibility is to analyze emails for security threats including spam, phishing, malware, and social engineering attacks.

SECURITY ANALYSIS FRAMEWORK:
1. SPAM DETECTION:
   - Unsolicited bulk email
   - Marketing without consent
   - Promotional content from unknown senders
   - Repetitive or mass-distributed content

2. PHISHING DETECTION:
   - Requests for sensitive information (passwords, SSNs, financial data)
   - Urgent language designed to bypass critical thinking
   - Suspicious links or domains
   - Impersonation of legitimate services or people
   - Requests to "verify account" or "update payment info"

3. SOCIAL ENGINEERING:
   - Attempts to manipulate emotions (urgency, fear, greed)
   - Requests for money transfers or gift cards
   - Impersonation of executives or authority figures
   - Unusual requests that bypass normal procedures

4. MALWARE INDICATORS:
   - Suspicious attachments (.exe, .scr, .zip with executables)
   - Links to file-sharing or suspicious domains
   - Requests to download software or files

RISK ASSESSMENT:
- CRITICAL: Active phishing or malware attempts
- HIGH: Likely phishing or advanced social engineering
- MEDIUM: Suspicious patterns but may be legitimate
- LOW: Minor indicators but likely safe

CONTEXT AWARENESS:
- Consider Mission Mutual's business context
- Recognize legitimate business communications
- Understand normal communication patterns for insurance industry
- Account for Christian values and community focus

RECOMMENDED ACTIONS:
- ALLOW: Safe email, no action needed
- QUARANTINE: Suspicious but not dangerous, review required
- DELETE: Spam or low-risk threats, remove from inbox
- REPORT: High-risk threats, escalate to security team

Always provide detailed reasoning for your assessment and specific indicators found.`,
});

export class SecurityEmailProcessor {
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

  async analyzeEmailSecurity(
    emailContext: EmailSecurityContext,
    userId: string
  ): Promise<SecurityAnalysis> {
    try {
      // Get historical security patterns
      const securityHistory = await this.getSecurityHistory(userId);
      
      // Analyze with security agent
      const analysis = await this.performSecurityAnalysis(emailContext, securityHistory);
      
      // Store analysis results
      await this.storeSecurityAnalysis(emailContext, analysis, userId);
      
      // Update learning patterns
      await this.updateSecurityPatterns(emailContext, analysis, userId);
      
      return analysis;
    } catch (error) {
      console.error('Security analysis error:', error);
      // Default to safe analysis on error
      return {
        isSpam: false,
        isPhishing: false,
        isSuspicious: false,
        riskLevel: 'low',
        indicators: [],
        confidence: 0.1,
        recommendedAction: 'allow',
        reasoning: 'Error in analysis - defaulting to safe',
      };
    }
  }

  private async performSecurityAnalysis(
    email: EmailSecurityContext,
    history: any[]
  ): Promise<SecurityAnalysis> {
    // Basic rule-based analysis
    const indicators: string[] = [];
    let riskScore = 0;
    
    // Check sender domain
    const senderDomain = email.sender.split('@')[1]?.toLowerCase();
    if (senderDomain && !this.isKnownSafeDomain(senderDomain)) {
      indicators.push(`External domain: ${senderDomain}`);
      riskScore += 1;
    }
    
    // Check for urgency language
    const urgencyPatterns = [
      /urgent/i, /immediate/i, /asap/i, /act now/i, /limited time/i,
      /expires today/i, /final notice/i, /last chance/i
    ];
    
    if (urgencyPatterns.some(pattern => pattern.test(email.body) || pattern.test(email.subject))) {
      indicators.push('Urgency language detected');
      riskScore += 2;
    }
    
    // Check for phishing patterns
    const phishingPatterns = [
      /verify.*account/i, /update.*payment/i, /confirm.*identity/i,
      /click here/i, /download.*attachment/i, /suspended.*account/i,
      /security.*alert/i, /unusual.*activity/i
    ];
    
    if (phishingPatterns.some(pattern => pattern.test(email.body))) {
      indicators.push('Phishing language detected');
      riskScore += 3;
    }
    
    // Check for financial scams
    const financialScamPatterns = [
      /lottery/i, /winner/i, /congratulations.*won/i, /inheritance/i,
      /million.*dollar/i, /bitcoin/i, /crypto.*investment/i,
      /wire.*transfer/i, /gift.*card/i
    ];
    
    if (financialScamPatterns.some(pattern => pattern.test(email.body))) {
      indicators.push('Financial scam language detected');
      riskScore += 4;
    }
    
    // Check for suspicious links
    if (email.links && email.links.length > 0) {
      const suspiciousLinks = email.links.filter(link => 
        !this.isKnownSafeDomain(this.extractDomain(link))
      );
      if (suspiciousLinks.length > 0) {
        indicators.push(`Suspicious links: ${suspiciousLinks.length}`);
        riskScore += 2;
      }
    }
    
    // Determine risk level and actions
    let riskLevel: SecurityAnalysis['riskLevel'] = 'low';
    let recommendedAction: SecurityAnalysis['recommendedAction'] = 'allow';
    
    if (riskScore >= 6) {
      riskLevel = 'critical';
      recommendedAction = 'report';
    } else if (riskScore >= 4) {
      riskLevel = 'high';
      recommendedAction = 'quarantine';
    } else if (riskScore >= 2) {
      riskLevel = 'medium';
      recommendedAction = 'quarantine';
    } else if (riskScore >= 1) {
      riskLevel = 'low';
      recommendedAction = 'allow';
    }
    
    return {
      isSpam: riskScore >= 2,
      isPhishing: riskScore >= 3,
      isSuspicious: riskScore >= 1,
      riskLevel,
      indicators,
      confidence: Math.min(0.9, 0.3 + (riskScore * 0.1)),
      recommendedAction,
      reasoning: `Risk score: ${riskScore}/10. Indicators: ${indicators.join(', ')}`,
    };
  }

  private isKnownSafeDomain(domain: string): boolean {
    const safeDomains = [
      'missionmutual.org',
      'microsoft.com',
      'office.com',
      'sharepoint.com',
      'outlook.com',
      'gov',
      'edu',
      // Add more known safe domains
    ];
    
    return safeDomains.some(safeDomain => 
      domain === safeDomain || domain.endsWith(`.${safeDomain}`)
    );
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private async getSecurityHistory(userId: string): Promise<any[]> {
    const supabase = await this.getSupabase();
    
    const { data: history } = await supabase
      .from('security_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    return history || [];
  }

  private async storeSecurityAnalysis(
    email: EmailSecurityContext,
    analysis: SecurityAnalysis,
    userId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('security_analyses')
      .insert({
        user_id: userId,
        email_id: email.id,
        thread_id: email.threadId,
        sender: email.sender,
        subject: email.subject,
        is_spam: analysis.isSpam,
        is_phishing: analysis.isPhishing,
        is_suspicious: analysis.isSuspicious,
        risk_level: analysis.riskLevel,
        indicators: analysis.indicators,
        confidence: analysis.confidence,
        recommended_action: analysis.recommendedAction,
        reasoning: analysis.reasoning,
        analysis_date: new Date().toISOString(),
      });
  }

  private async updateSecurityPatterns(
    email: EmailSecurityContext,
    analysis: SecurityAnalysis,
    userId: string
  ): Promise<void> {
    // Store patterns for learning
    if (analysis.riskLevel === 'high' || analysis.riskLevel === 'critical') {
      await this.storeSecurityPattern(email, analysis, userId);
    }
  }

  private async storeSecurityPattern(
    email: EmailSecurityContext,
    analysis: SecurityAnalysis,
    userId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    const pattern = {
      sender_domain: email.sender.split('@')[1]?.toLowerCase(),
      subject_patterns: this.extractPatterns(email.subject),
      body_patterns: this.extractPatterns(email.body),
      risk_indicators: analysis.indicators,
      threat_type: analysis.isPhishing ? 'phishing' : analysis.isSpam ? 'spam' : 'suspicious',
    };
    
    await supabase
      .from('security_patterns')
      .insert({
        user_id: userId,
        pattern_type: pattern.threat_type,
        pattern_data: pattern,
        confidence: analysis.confidence,
        created_at: new Date().toISOString(),
      });
  }

  private extractPatterns(text: string): string[] {
    // Extract common patterns for learning
    const patterns = [];
    
    // Extract keywords
    const words = text.toLowerCase().split(/\s+/);
    const significantWords = words.filter(word => 
      word.length > 3 && !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'her', 'now', 'oil', 'sit', 'set'].includes(word)
    );
    
    return significantWords.slice(0, 10); // Keep top 10 significant words
  }

  async handleSecurityAction(
    emailId: string,
    action: SecurityAnalysis['recommendedAction'],
    userId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    switch (action) {
      case 'quarantine':
        await this.quarantineEmail(emailId, userId);
        break;
      case 'delete':
        await this.deleteEmail(emailId, userId);
        break;
      case 'report':
        await this.reportThreat(emailId, userId);
        break;
      default:
        // Allow - no action needed
        break;
    }
  }

  private async quarantineEmail(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_messages')
      .update({ 
        quarantined: true,
        quarantine_date: new Date().toISOString(),
        quarantine_reason: 'Security analysis'
      })
      .eq('id', emailId)
      .eq('user_id', userId);
  }

  private async deleteEmail(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    await supabase
      .from('email_messages')
      .update({ 
        deleted: true,
        delete_date: new Date().toISOString(),
        delete_reason: 'Security analysis - spam/low risk'
      })
      .eq('id', emailId)
      .eq('user_id', userId);
  }

  private async reportThreat(emailId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    
    // Create security incident
    await supabase
      .from('security_incidents')
      .insert({
        user_id: userId,
        email_id: emailId,
        incident_type: 'phishing_attempt',
        severity: 'high',
        status: 'open',
        created_at: new Date().toISOString(),
      });
    
    // Also quarantine the email
    await this.quarantineEmail(emailId, userId);
  }
}