# Product Requirements Document (PRD)
## Mission Mutual AI Assistant - MVP

### Executive Summary
An intelligent email assistant that monitors Mission Mutual staff's Outlook 365 accounts, provides thread-aware intelligence, learns from user behavior, and automates routine tasks while maintaining full user control and organizational security.

### Vision Statement
Transform email from a time sink into a strategic advantage by creating an AI assistant that truly understands context, learns from behavior, and proactively manages communication workflows for Mission Mutual's leadership team.

### Success Metrics
- Reduce email processing time by 50% (from ~3 hours to ~1.5 hours daily)
- Achieve 80%+ draft acceptance rate within 30 days
- Zero missed critical emails from VIPs or board members
- 90% accuracy in task extraction and categorization

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

#### 1. Intelligent Thread Monitoring
- **Real-time Webhook Integration**: Connect to Outlook 365 via Microsoft Graph API
- **Thread Context Awareness**: Track entire conversation history, not individual emails
- **Smart Categorization**: 
  - ACTION_REQUIRED (needs response)
  - FYI_ONLY (auto-file)
  - FINANCIAL (special handling)
  - MEETING_REQUEST (calendar integration)
  - VIP_CRITICAL (immediate alert)

#### 2. Context-Aware Response Drafting
- **Thread-Based Drafts**: Consider entire conversation when drafting
- **Organizational Context**: Reference project documents, past decisions, and relationships
- **Personality Learning**: Analyze last 90 days of sent emails for tone/style
- **Recipient-Specific Adaptation**: Different tone for donors vs. team
- **Edit Tracking**: Learn from changes user makes to drafts
- **Fact Verification**: Cross-reference claims against organizational knowledge base

#### 3. Daily Intelligence Briefing
- **7 AM Daily Email**: Comprehensive overview of email state
- **Smart Prioritization**: Based on sender importance and content urgency
- **Thread Status Tracking**: Show momentum of ongoing conversations
- **Action Summary**: What was auto-handled overnight

#### 4. Learning & Feedback System
- **Inline Feedback**: Quick thumbs up/down on every AI action
- **Edit Analysis**: Track differences between draft and sent
- **Pattern Recognition**: Identify repeated corrections
- **Monthly Learning Report**: Show AI improvement over time

#### 5. Task & Commitment Extraction
- **Automatic Detection**: Find commitments in email threads
- **ClickUp Integration**: Create tasks with context
- **Due Date Recognition**: Parse mentioned dates
- **Assignment Logic**: Determine responsible party

### Out of Scope (MVP)
- Calendar scheduling automation (Phase 2)
- Slack/Teams integration (Phase 2)
- Financial approval workflows (Phase 2)
- Multi-org support beyond Mission Mutual (Future)
- Mobile app (Future)

### User Workflows

#### Daily Email Review Workflow
1. User opens web dashboard
2. Sees prioritized email queue with AI-generated summaries
3. Reviews and edits draft responses
4. Provides feedback on AI actions
5. Sends approved responses with one click

#### VIP Email Alert Workflow
1. VIP email arrives
2. System sends immediate Slack/SMS alert
3. AI drafts response considering full context
4. User reviews and sends from mobile or desktop

#### Learning Feedback Workflow
1. User edits AI draft
2. System captures diff
3. User optionally adds note about why
4. System updates patterns for future

### Technical Constraints
- Must work within Outlook 365 ecosystem
- Cannot store emails long-term (reference only)
- Must maintain audit trail of all actions
- Response time <5 seconds for webhook acknowledgment
- Support for 10,000+ emails per month

### Security Requirements
- SOC 2 Type II compliance ready
- Encrypted credential storage
- Row-level security for multi-user
- No email content in logs
- Audit trail for all automated actions

---

# System Requirements Document (SRD)
## Mission Mutual AI Assistant - MVP

### 1. System Architecture

#### 1.1 High-Level Architecture
```
┌─────────────────────┐     ┌─────────────────────┐
│   Microsoft 365     │────▶│   Webhook Handler   │
│   (Email Source)    │     │   (Vercel Edge)     │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────┐
                            │   Message Queue     │
                            │   (QStash)          │
                            └──────────┬──────────┘
                                       │
┌─────────────────────┐     ┌──────────▼──────────┐     ┌─────────────────────┐
│   Web Dashboard     │────▶│   Agent Orchestrator│────▶│  OpenAI Vector Store│
│   (Next.js)         │     │   (OpenAI Agents)   │     │  (Org Knowledge)    │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                       │
                            ┌──────────▼──────────┐
                            │   Data Layer        │
                            │   (Supabase)        │
                            └─────────────────────┘
```

#### 1.2 Technology Stack
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Shadcn/ui
- **Backend**: Vercel Edge Functions, Node.js
- **Database**: Supabase (PostgreSQL)
- **Queue**: Upstash QStash
- **AI**: OpenAI Agents SDK with GPT-4o
- **Vector Store**: OpenAI Vector Store API for organizational knowledge
- **Email**: Microsoft Graph API v1.0
- **Authentication**: Supabase Auth with Azure AD SSO
- **Monitoring**: Vercel Analytics, Sentry, OpenAI Tracing

### 2. Database Schema

```sql
-- Users and authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'user')),
  azure_ad_id TEXT UNIQUE,
  encrypted_refresh_token TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email account connections
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  microsoft_subscription_id TEXT UNIQUE,
  webhook_secret TEXT NOT NULL,
  sync_status TEXT DEFAULT 'active',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- Daily briefing preferences and history
CREATE TABLE daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  content JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, briefing_date)
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

### 10. MVP Deliverables

1. **Week 1-2**: Core infrastructure, Microsoft integration, OpenAI Agents SDK setup
2. **Week 3-4**: Vector store creation, historical data indexing, RAG tools
3. **Week 5-6**: Agent-based email processing with context awareness
4. **Week 7-8**: Learning system, feedback loop, and relationship intelligence
5. **Week 9-10**: Daily briefing, web dashboard, and monitoring
6. **Week 11-12**: Testing, security audit, deployment, and pilot with Tom

### 11. Success Criteria

- Successfully process 95% of emails without errors
- Generate contextually appropriate drafts 80% of the time
- Achieve 90% accuracy in fact verification against organizational knowledge
- Demonstrate project and relationship awareness in 85% of responses
- Reduce email processing time by 50% for pilot user
- Zero security incidents or data breaches
- User satisfaction score of 4+ out of 5

### 12. Key Differentiators with RAG/Agent Approach

1. **Full Organizational Context**: Every email response considers the complete organizational knowledge base
2. **Fact Verification**: All claims and numbers verified against source documents
3. **Project Awareness**: References specific initiatives, deadlines, and team members
4. **Relationship Intelligence**: Tailored communication based on interaction history
5. **Continuous Learning**: Vector store updates with every significant interaction
6. **Production-Ready**: Built on OpenAI's battle-tested Agents SDK with built-in tracing