# Product Requirements Document (PRD)
## Mission Mutual Personal AI Assistant - MVP

### Executive Summary
A proactive AI assistant that understands your complete work context across Microsoft 365 platforms (Email, Teams, SharePoint, OneDrive), learns your communication patterns, and autonomously handles routine tasks while providing intelligent daily briefings and draft responses that require your approval before sending.

### Vision Statement
Create a truly intelligent personal assistant that goes beyond basic email automation - one that understands your projects, relationships, and communication style across all work platforms, proactively identifies what needs your attention, and handles routine tasks autonomously while keeping you in complete control of important decisions.

### Success Metrics
- **Intelligence**: 90% context accuracy in daily briefings (understanding what actually matters)
- **Autonomy**: 70% of routine emails handled automatically without user intervention
- **Proactivity**: 80% of action items identified before user notices them
- **Quality**: 85%+ draft acceptance rate with minimal edits
- **Privacy**: Zero cross-user data leakage, complete user data isolation
- **Efficiency**: Reduce daily "email management time" from 3 hours to 45 minutes

### User Personas

**Primary: Tom Lucas (VP Business Operations)**
- Receives 100+ emails daily across multiple initiatives
- Needs to maintain relationships with board members, donors, and partners
- Values efficiency but requires maintaining personal touch
- Technical enough to configure advanced features

**Secondary: Finance & Operations Team**
- Anthony Keeler: Financial communications, approval workflows
- Julie Riggs: Coordination and scheduling
- Andrew Cleveland: Data and reporting communications

### Core Features (MVP Scope)

#### 1. Cross-Platform Intelligence Foundation
- **Personal Knowledge Base**: Private, encrypted vector store per user
- **Multi-Platform Context**: Email, Teams, SharePoint, OneDrive, Google Drive integration
- **Relationship Intelligence**: Learn communication patterns with each person/organization
- **Project Context Awareness**: Understand ongoing initiatives from documents and conversations
- **Communication Style Learning**: Analyze your writing patterns, tone, and preferences

#### 2. Proactive Daily Intelligence
- **Morning Intelligence Briefing**: What you need to know, need to do, and anomalies requiring attention
- **Priority Filtering**: Surface only what actually matters, hide routine noise
- **Anomaly Detection**: Flag unusual patterns, urgent items, or things breaking normal rules
- **Action Item Identification**: Extract commitments and deadlines across all platforms
- **Context-Rich Summaries**: Understand why things are important, not just what happened

#### 3. Autonomous Task Handling
- **Rule-Based Automation**: Handle routine emails (admin notifications, confirmations) automatically
- **Smart Filing**: Organize emails/documents based on project and content understanding
- **Follow-up Management**: Track commitments and remind when action is needed
- **Meeting Coordination**: Suggest times, prepare agendas based on context
- **Document Organization**: Auto-file documents in correct SharePoint/Drive locations

#### 4. Intelligent Draft Generation
- **Full Context Drafts**: Consider conversation history, project status, and relationship dynamics
- **Human-in-Loop**: Always requires approval before sending anything important
- **Style Consistency**: Match your communication style for each recipient type
- **Fact Verification**: Check claims against your knowledge base and documents
- **Draft Explanations**: Show why AI chose this approach and what context it considered

#### 5. Privacy-First Learning System
- **Personal Vector Store**: Your data never mixes with other users
- **Continuous Improvement**: Learn from your edits and feedback without compromising privacy
- **Contextual Memory**: Remember project details, decision history, and communication preferences
- **Adaptive Intelligence**: Improve understanding of your work patterns over time

### Out of Scope (MVP)
- **Mobile Application**: Web-first approach, mobile optimization in Phase 2
- **Multi-Organization Support**: Single-tenant focus for MVP
- **Advanced Calendar Integration**: Basic meeting suggestions only, not full scheduling automation
- **Third-Party Integrations**: Beyond Microsoft 365 and Google Drive (Slack, Zoom, etc.)
- **Financial Workflow Automation**: Approval processes and budget tracking in Phase 2
- **Real-Time Collaboration**: Document co-editing and live updates in Phase 2

### User Workflows

#### Daily Intelligence Workflow (Primary)
1. **Morning Briefing** (7 AM): Receive intelligent summary of what needs attention
2. **Priority Review**: Review AI-identified urgent items and anomalies first
3. **Draft Approval**: Review context-aware drafts with explanations, approve/edit/reject
4. **Autonomous Monitoring**: AI handles routine items automatically, surfaces only exceptions
5. **End-of-Day Summary**: Brief recap of what was handled and what's pending

#### Proactive Assistant Workflow
1. **Context Detection**: AI notices project deadlines, follow-up needs, or relationship patterns
2. **Proactive Suggestions**: "You usually follow up with X after 3 days, draft ready"
3. **Anomaly Alerts**: "Client Y usually responds within 24 hours, it's been 3 days"
4. **Action Preparation**: Pre-draft responses, prepare meeting agendas, organize documents
5. **User Decision**: Simple approve/modify/delegate actions

#### Continuous Learning Workflow
1. **Pattern Recognition**: AI observes your communication preferences and decision patterns
2. **Context Building**: Learns from document access, email interactions, and project involvement
3. **Feedback Integration**: Incorporates your edits and preferences into personal model
4. **Privacy Protection**: All learning stays within your personal, encrypted knowledge base

### Technical Constraints
- **Platform Agnostic**: Standalone application with API integrations, not constrained by M365 UI
- **Privacy First**: Per-user encrypted vector stores, zero cross-user data leakage
- **Performance**: <5 seconds webhook response, <15 seconds context-aware draft generation
- **Scale**: Support 10,000+ emails and 1,000+ documents per user per month
- **Cross-Platform**: Microsoft 365 Graph API integration for all services
- **Compliance**: Maintain complete audit trail, data residency control

### Security Requirements
- SOC 2 Type II compliance ready
- Encrypted credential storage
- Row-level security for multi-user
- No email content in logs
- Audit trail for all automated actions

---

# System Requirements Document (SRD)
## Mission Mutual Personal AI Assistant - MVP

### 1. System Architecture

#### 1.1 High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    Cross-Platform Data Sources                  │
├─────────────────┬─────────────────┬─────────────────┬───────────┤
│   Microsoft 365 │   SharePoint    │   OneDrive      │ Google    │
│   (Email/Teams) │   (Documents)   │   (Files)       │ Drive     │
└─────────────────┴─────────────────┴─────────────────┴───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Data Ingestion      │
                    │   Pipeline            │
                    └───────────┬───────────┘
                                │
┌─────────────────────┐     ┌───▼────────────────────┐     ┌─────────────────────┐
│   Personal AI       │────▶│  Intelligence Engine   │────▶│ Personal Vector     │
│   Dashboard         │     │  (Context + Learning)  │     │ Store (Per User)    │
│   (Next.js)         │     │                        │     │ (Encrypted)         │
└─────────────────────┘     └───┬────────────────────┘     └─────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Proactive Actions   │
                    │   Engine              │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   User Database       │
                    │   (Supabase)          │
                    └───────────────────────┘
```

#### 1.2 Technology Stack
- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Shadcn/ui
- **Backend**: Vercel Edge Functions, Node.js
- **Database**: Supabase (PostgreSQL) with Row-Level Security
- **AI Platform**: OpenAI GPT-4o with Function Calling
- **Vector Storage**: Per-user OpenAI Vector Stores (privacy-first)
- **Cross-Platform APIs**: 
  - Microsoft Graph API (Email, Teams, SharePoint, OneDrive)
  - Google Drive API (documents and files)
- **Queue System**: Upstash QStash for async processing
- **Authentication**: Supabase Auth with Microsoft OAuth 2.0
- **Encryption**: AES-256-GCM for sensitive data
- **Monitoring**: Vercel Analytics, Sentry, OpenAI Usage Tracking

### 2. Database Schema

```sql
-- Users and authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'user')),
  microsoft_user_id TEXT UNIQUE,
  google_user_id TEXT,
  encrypted_microsoft_token TEXT,
  encrypted_google_token TEXT,
  personal_vector_store_id TEXT UNIQUE, -- OpenAI Vector Store ID for this user
  intelligence_preferences JSONB DEFAULT '{}',
  communication_style JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-platform integrations
CREATE TABLE platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('microsoft', 'google')),
  platform_user_id TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  webhook_subscription_id TEXT,
  sync_status TEXT DEFAULT 'active',
  last_sync TIMESTAMPTZ,
  enabled_services TEXT[] DEFAULT ARRAY['email'], -- email, teams, sharepoint, onedrive, drive, docs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Email thread tracking
CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  subject TEXT,
  participants TEXT[],
  category TEXT,
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'active',
  first_message_date TIMESTAMPTZ,
  last_message_date TIMESTAMPTZ,
  message_count INTEGER DEFAULT 1,
  has_attachments BOOLEAN DEFAULT FALSE,
  is_vip BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Individual messages within threads
CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipients TEXT[],
  cc_recipients TEXT[],
  sent_date TIMESTAMPTZ,
  has_draft BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated drafts
CREATE TABLE email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  draft_content TEXT NOT NULL,
  draft_version INTEGER DEFAULT 1,
  ai_confidence DECIMAL(3,2),
  context_used JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning from user edits
CREATE TABLE learning_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES email_drafts(id) ON DELETE SET NULL,
  original_draft TEXT NOT NULL,
  final_sent TEXT NOT NULL,
  diff_analysis JSONB NOT NULL,
  recipient_domain TEXT,
  thread_category TEXT,
  feedback_score INTEGER CHECK (feedback_score BETWEEN -1 AND 1),
  user_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracted tasks and commitments
CREATE TABLE extracted_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  due_date DATE,
  assigned_to TEXT,
  status TEXT DEFAULT 'pending',
  clickup_task_id TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VIP and contact management
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  organization TEXT,
  is_vip BOOLEAN DEFAULT FALSE,
  vip_tier INTEGER DEFAULT 3,
  communication_preferences JSONB DEFAULT '{}',
  total_interactions INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Daily intelligence briefings
CREATE TABLE daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  briefing_type TEXT DEFAULT 'morning' CHECK (briefing_type IN ('morning', 'evening')),
  intelligence_summary JSONB NOT NULL, -- need_to_know, need_to_do, anomalies
  actions_recommended JSONB DEFAULT '[]',
  actions_taken_automatically JSONB DEFAULT '[]',
  priority_score INTEGER DEFAULT 5,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  user_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, briefing_date, briefing_type)
);

-- Cross-platform content ingestion tracking
CREATE TABLE content_ingestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL, -- email, teams_message, document, calendar_event
  platform_content_id TEXT NOT NULL,
  content_summary TEXT,
  extracted_entities JSONB DEFAULT '{}', -- people, projects, topics, dates
  significance_score DECIMAL(3,2) DEFAULT 0.5,
  vector_store_file_id TEXT, -- Reference to OpenAI Vector Store file
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  last_referenced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_content_id)
);

-- Personal relationship intelligence
CREATE TABLE relationship_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_identifier TEXT NOT NULL, -- email or other unique ID
  contact_name TEXT,
  contact_organization TEXT,
  relationship_type TEXT, -- colleague, client, vendor, board_member, etc.
  communication_frequency TEXT, -- daily, weekly, monthly, occasional
  communication_pattern JSONB DEFAULT '{}', -- preferred times, response patterns, etc.
  project_associations TEXT[], -- projects they're involved with
  importance_score INTEGER DEFAULT 5 CHECK (importance_score BETWEEN 1 AND 10),
  last_interaction TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  context_summary TEXT, -- AI-generated summary of relationship context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_identifier)
);

-- Project and context awareness
CREATE TABLE project_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  project_description TEXT,
  project_status TEXT DEFAULT 'active' CHECK (project_status IN ('active', 'completed', 'on_hold', 'cancelled')),
  key_participants TEXT[],
  important_dates JSONB DEFAULT '{}', -- deadlines, milestones, etc.
  related_documents TEXT[], -- platform-specific document IDs
  ai_context_summary TEXT, -- AI-generated understanding of project
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_name)
);

-- Intelligent action recommendations and automation
CREATE TABLE intelligent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- draft_reply, schedule_follow_up, file_document, create_task, etc.
  trigger_context TEXT NOT NULL, -- what caused this action to be recommended
  recommended_action JSONB NOT NULL, -- the specific action details
  confidence_score DECIMAL(3,2) NOT NULL,
  urgency_level INTEGER DEFAULT 5 CHECK (urgency_level BETWEEN 1 AND 10),
  auto_execute BOOLEAN DEFAULT FALSE, -- whether this can be executed automatically
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'rejected', 'expired')),
  user_feedback TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Organizational knowledge and context
CREATE TABLE organizational_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL, -- 'email', 'document', 'meeting', 'project', 'decision'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  vector_store_id TEXT, -- OpenAI vector store reference
  project_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project context for RAG
CREATE TABLE project_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  team_members TEXT[],
  key_documents TEXT[],
  timeline JSONB,
  vector_store_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationship intelligence
CREATE TABLE relationship_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  interaction_history JSONB,
  communication_preferences JSONB,
  project_involvement TEXT[],
  decision_history JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_threads_user_date ON email_threads(user_id, last_message_date DESC);
CREATE INDEX idx_messages_thread ON email_messages(thread_id, sent_date DESC);
CREATE INDEX idx_drafts_status ON email_drafts(user_id, status, created_at DESC);
CREATE INDEX idx_contacts_email ON contacts(user_id, email);
CREATE INDEX idx_learning_user_date ON learning_samples(user_id, created_at DESC);
CREATE INDEX idx_org_knowledge_type ON organizational_knowledge(document_type, created_at DESC);
CREATE INDEX idx_project_context_name ON project_context(project_name);

-- Enable Row Level Security
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users only see their own data)
CREATE POLICY "Users see own threads" ON email_threads
  FOR ALL USING (auth.uid() = user_id);
  
CREATE POLICY "Users see own drafts" ON email_drafts
  FOR ALL USING (auth.uid() = user_id);
  
-- Add more RLS policies for other tables...
```

### 3. API Endpoints

#### 3.1 Webhook Endpoints
```typescript
// POST /api/webhooks/outlook
interface OutlookWebhookPayload {
  value: Array<{
    subscriptionId: string;
    changeType: "created" | "updated" | "deleted";
    resource: string; // Email resource URL
    resourceData: {
      id: string;
      "@odata.type": string;
      "@odata.id": string;
    };
  }>;
}

// Response must be within 5 seconds
Response: 200 OK
```

#### 3.2 Core API Endpoints
```typescript
// Email Management
GET    /api/threads?status=active&limit=50
GET    /api/threads/:threadId
POST   /api/threads/:threadId/draft
PUT    /api/drafts/:draftId
POST   /api/drafts/:draftId/send
POST   /api/drafts/:draftId/feedback

// Learning System
POST   /api/learning/capture-edit
GET    /api/learning/patterns
GET    /api/learning/report

// Contact Management  
GET    /api/contacts?is_vip=true
PUT    /api/contacts/:contactId
POST   /api/contacts/bulk-import

// Daily Briefing
GET    /api/briefing/today
POST   /api/briefing/preferences
GET    /api/briefing/history

// Task Management
GET    /api/tasks?status=pending
POST   /api/tasks/:taskId/complete
POST   /api/tasks/:taskId/export-clickup
```

### 4. Core Processing Logic

#### 4.1 Agent-Based Email Processing
```typescript
import { Agent, tool } from '@openai/agents';

// Configure main email processing agent
const emailAgent = new Agent({
  name: 'MPA Email Assistant',
  model: 'gpt-4o',
  instructions: `You are an intelligent email assistant for Mission Mutual.
    Always verify facts against organizational knowledge.
    Reference specific projects, people, and past decisions.
    Maintain consistent communication style based on recipient.`,
  tools: [
    // OpenAI built-in tools
    tool.fileSearch(),
    tool.webSearch(),
    
    // Custom organizational tools
    tool(searchProjectContext),
    tool(searchRelationshipHistory),
    tool(verifyOrganizationalFacts),
    tool(getEmailThreadContext),
    tool(updateOrganizationalMemory)
  ]
});

interface EmailProcessor {
  // Step 1: Receive webhook
  async handleWebhook(payload: OutlookWebhookPayload): Promise<void> {
    // Acknowledge immediately
    await qstash.publishJSON({
      url: '/api/process-email',
      body: payload,
      delay: 0
    });
  }

  // Step 2: Fetch and analyze email
  async processEmail(resourceUrl: string): Promise<void> {
    const email = await fetchEmailFromGraph(resourceUrl);
    const thread = await getOrCreateThread(email);
    
    // Step 3: Determine action needed
    const analysis = await analyzeThread(thread);
    
    if (analysis.requiresAction) {
      await createDraft(thread, analysis);
    }
    
    if (analysis.hasTask) {
      await extractTask(thread, analysis);
    }
    
    if (analysis.isVIP) {
      await sendAlert(thread, analysis);
    }
  }

  // Step 4: Context-aware thread analysis
  async analyzeThread(thread: EmailThread): Promise<ThreadAnalysis> {
    // Gather organizational context
    const context = await this.gatherContext(thread);
    
    // Use agent to analyze with full context
    const response = await emailAgent.run({
      messages: [{
        role: 'user',
        content: `Analyze this email thread and determine required actions.
          
          Thread: ${JSON.stringify(thread)}
          
          Use the available tools to:
          1. Search for related project context
          2. Find relationship history with participants
          3. Verify any factual claims
          4. Determine if this relates to ongoing initiatives`
      }]
    });
    
    return parseAnalysis(response);
  }
  
  // Gather relevant organizational context
  async gatherContext(thread: EmailThread): Promise<OrganizationalContext> {
    const [projectContext, relationshipData, recentDecisions] = await Promise.all([
      searchProjectContext({ 
        query: thread.subject,
        participants: thread.participants 
      }),
      searchRelationshipHistory({ 
        contacts: thread.participants,
        timeframe: 'last_6_months' 
      }),
      searchOrganizationalKnowledge({
        type: 'decision',
        relatedTo: extractKeyTerms(thread)
      })
    ]);
    
    return {
      projects: projectContext,
      relationships: relationshipData,
      decisions: recentDecisions
    };
  }
}
```

#### 4.2 Custom RAG Tools
```typescript
// Custom tool for searching project context
const searchProjectContext = async ({ query, projectName }: {
  query: string;
  projectName?: string;
}) => {
  // Search OpenAI vector store
  const results = await openai.vectorStores.search({
    vector_store_id: process.env.ORG_KNOWLEDGE_STORE_ID,
    query: `${query} ${projectName ? `project:${projectName}` : ''}`,
    top_k: 5
  });
  
  // Enhance with database context
  const projectData = projectName ? 
    await db.from('project_context').select().eq('project_name', projectName) : 
    null;
  
  return {
    vectorResults: results,
    projectDetails: projectData,
    relevance: calculateRelevance(results)
  };
};

// Tool for relationship intelligence
const searchRelationshipHistory = async ({ contacts, timeframe }: {
  contacts: string[];
  timeframe: string;
}) => {
  const history = await db
    .from('relationship_intelligence')
    .select(`
      *,
      contacts!inner(email, name, organization)
    `)
    .in('contacts.email', contacts);
    
  return {
    interactions: history,
    communicationPatterns: analyzePatterns(history),
    preferences: extractPreferences(history)
  };
};

// Tool for fact verification
const verifyOrganizationalFacts = async ({ claims }: {
  claims: string[];
}) => {
  const verifications = await Promise.all(
    claims.map(async (claim) => {
      const evidence = await openai.vectorStores.search({
        vector_store_id: process.env.ORG_KNOWLEDGE_STORE_ID,
        query: claim,
        top_k: 3
      });
      
      return {
        claim,
        verified: evidence.relevance > 0.8,
        evidence: evidence.results,
        confidence: evidence.relevance
      };
    })
  );
  
  return verifications;
};
```

#### 4.3 Learning System
```typescript
interface LearningSystem {
  // Capture edits
  async captureEdit(
    draftId: string, 
    finalContent: string,
    userNote?: string
  ): Promise<void> {
    const draft = await getDraft(draftId);
    const diff = computeDiff(draft.content, finalContent);
    
    await saveLearning({
      userId: draft.userId,
      draftId: draftId,
      originalDraft: draft.content,
      finalSent: finalContent,
      diffAnalysis: {
        additions: diff.additions,
        deletions: diff.deletions,
        toneShift: analyzeToneShift(draft.content, finalContent),
        structureChange: analyzeStructure(diff),
        significantChange: diff.similarity < 0.8
      },
      recipientDomain: extractDomain(draft.recipient),
      threadCategory: draft.category,
      userNote: userNote
    });
    
    // Update user-specific patterns if threshold met
    await updateUserPatterns(draft.userId);
  }

  // Generate personalized prompts
  async getUserPromptContext(userId: string): Promise<string> {
    const patterns = await getUserPatterns(userId);
    const recentEdits = await getRecentEdits(userId, 30);
    
    return generateContextPrompt({
      commonCorrections: patterns.corrections,
      tonePreferences: patterns.tone,
      phrasesToAvoid: patterns.avoid,
      phrasesToUse: patterns.preferred,
      recipientStyles: patterns.byRecipient
    });
  }
}
```

### 5. Security Requirements

#### 5.1 Authentication Flow
```typescript
// Microsoft OAuth with PKCE
const authConfig = {
  authority: "https://login.microsoftonline.com/{tenant}",
  clientId: process.env.MICROSOFT_CLIENT_ID,
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  scopes: [
    "User.Read",
    "Mail.ReadWrite", 
    "Calendars.Read",
    "offline_access"
  ]
};

// Token refresh handling
async function refreshAccessToken(userId: string): Promise<string> {
  const user = await getUser(userId);
  const refreshToken = await decrypt(user.encrypted_refresh_token);
  
  const newTokens = await refreshMicrosoftToken(refreshToken);
  await updateUserTokens(userId, newTokens);
  
  return newTokens.access_token;
}
```

#### 5.2 Data Encryption
- All Microsoft refresh tokens encrypted using AES-256-GCM
- Email content not stored permanently (only references)
- TLS 1.3 for all API communications
- Webhook secrets rotated monthly

### 6. Vector Store Management

```typescript
// Initialize organizational vector store
const initializeVectorStore = async () => {
  const vectorStore = await openai.vectorStores.create({
    name: 'MPA Organizational Knowledge',
    description: 'Email history, documents, decisions, and project context'
  });
  
  // Index existing data
  await indexHistoricalEmails(vectorStore.id);
  await indexOrganizationalDocuments(vectorStore.id);
  await indexProjectDocumentation(vectorStore.id);
  
  return vectorStore.id;
};

// Continuous learning - update vector store
const updateKnowledgeBase = async (email: ProcessedEmail) => {
  if (email.significance > 0.7) {
    await openai.vectorStores.files.create({
      vector_store_id: process.env.ORG_KNOWLEDGE_STORE_ID,
      file: {
        content: formatEmailForIndexing(email),
        metadata: {
          type: 'email',
          project: email.project,
          participants: email.participants,
          date: email.date,
          significance: email.significance
        }
      }
    });
  }
};
```

### 7. Performance Requirements

- **Webhook Response Time**: <5 seconds (Microsoft requirement)
- **Email Processing**: <30 seconds per email (including context search)
- **Draft Generation**: <15 seconds with full context
- **Vector Search**: <2 seconds per query
- **Dashboard Load**: <2 seconds initial load
- **Daily Briefing Generation**: <60 seconds
- **Concurrent Users**: Support 10 simultaneous users

### 7. Monitoring & Logging

```typescript
// Structured logging
interface LogEvent {
  userId: string;
  action: string;
  resource: string;
  metadata: Record<string, any>;
  timestamp: Date;
  duration?: number;
  error?: Error;
}

// Key metrics to track
const metrics = {
  emailsProcessed: Counter,
  draftsGenerated: Counter,
  draftsAccepted: Counter,
  processingTime: Histogram,
  apiLatency: Histogram,
  errorRate: Counter,
  activeUsers: Gauge
};
```

### 8. Deployment Configuration

#### 8.1 Environment Variables
```bash
# Microsoft Graph
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=
OPENAI_ORG_ID=

# QStash
QSTASH_URL=
QSTASH_TOKEN=

# App Configuration
NEXT_PUBLIC_APP_URL=
ENCRYPTION_KEY=
WEBHOOK_SECRET=

# Monitoring
SENTRY_DSN=
```

#### 8.2 Vercel Configuration
```json
{
  "functions": {
    "api/webhooks/outlook.ts": {
      "maxDuration": 10
    },
    "api/process-email.ts": {
      "maxDuration": 60
    },
    "api/briefing/generate.ts": {
      "maxDuration": 300,
      "schedule": "0 7 * * *"
    }
  }
}
```

### 9. Testing Requirements

- **Unit Tests**: 80% code coverage minimum
- **Integration Tests**: All API endpoints
- **E2E Tests**: Critical user workflows
- **Load Testing**: 100 concurrent emails
- **Security Testing**: OWASP Top 10 compliance

### 10. MVP Deliverables (Refocused Roadmap)

#### **Phase 1: Intelligence Foundation (Weeks 1-3)**
1. **Per-User Vector Store Architecture**: Privacy-first, encrypted personal knowledge bases
2. **Cross-Platform Data Ingestion**: Microsoft 365 and Google Drive API integration
3. **Personal Context Engine**: Relationship mapping, project awareness, communication patterns

#### **Phase 2: Proactive Intelligence (Weeks 4-6)**
1. **Daily Intelligence Briefing System**: Morning briefings with need-to-know, need-to-do, anomalies
2. **Context-Aware Draft Generation**: Full work context consideration for responses
3. **Autonomous Rule Engine**: Handle routine tasks automatically, surface exceptions

#### **Phase 3: Learning & Adaptation (Weeks 7-9)**
1. **Personal Learning System**: Adapt to communication style and preferences
2. **Anomaly Detection**: Flag unusual patterns and important deviations
3. **Proactive Action Recommendations**: Suggest follow-ups, meetings, and tasks

#### **Phase 4: Production & Polish (Weeks 10-12)**
1. **Personal AI Dashboard**: Clean interface for briefings and approvals
2. **Privacy & Security Audit**: Ensure complete user data isolation
3. **Pilot Deployment**: Full system testing with primary user

### 11. Success Criteria

- **Intelligence Accuracy**: 90% of daily briefings contain only relevant, actionable information
- **Autonomy Achievement**: 70% of routine tasks handled automatically without user intervention
- **Context Understanding**: 85% of drafts demonstrate awareness of project/relationship context
- **Privacy Protection**: 100% user data isolation - zero cross-user information leakage
- **Proactive Value**: 80% of AI-surfaced anomalies/action items deemed valuable by user
- **Time Savings**: Reduce daily email/communication management from 3 hours to 45 minutes
- **User Trust**: User satisfaction score of 4.5+ out of 5 for AI decisions and recommendations

### 12. Key Differentiators vs Existing Solutions

#### **vs Microsoft Copilot:**
- **Personal Context**: Learns your specific work patterns vs generic responses
- **Cross-Platform Intelligence**: Unified view vs siloed assistance
- **Privacy-First**: Your data stays yours vs shared model training
- **Proactive Intelligence**: Identifies what needs attention vs reactive responses

#### **vs Superhuman/SaneBox:**
- **True Understanding**: Context-aware decisions vs rule-based filtering
- **Full Work Context**: Beyond email to complete work intelligence
- **Adaptive Learning**: Improves based on your patterns vs static rules
- **Autonomous Actions**: Takes action vs just organizing

#### **vs Traditional Email Clients:**
- **Intelligent Assistant**: Proactive help vs passive tool
- **Context Awareness**: Understands relationships and projects vs basic threading
- **Cross-Platform**: Unified intelligence vs platform-specific features
- **Learning System**: Adapts to you vs one-size-fits-all