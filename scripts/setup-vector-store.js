#!/usr/bin/env node

/**
 * Setup script for OpenAI Vector Store
 * Run this after setting up your OpenAI API key
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

async function setupVectorStore() {
  try {
    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY environment variable is not set');
      console.log('Please set your OpenAI API key in .env.local');
      process.exit(1);
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID,
    });

    // Check if vector store ID already exists in env
    let vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
    let vectorStore;

    if (vectorStoreId) {
      console.log('📋 Using existing vector store from environment...');
      try {
        vectorStore = await openai.beta.vectorStores.retrieve(vectorStoreId);
        console.log('✅ Found existing vector store:', vectorStore.name);
      } catch (error) {
        console.log('⚠️ Could not retrieve existing vector store, creating new one...');
        vectorStoreId = null;
      }
    }

    if (!vectorStoreId) {
      console.log('🚀 Creating OpenAI Vector Store for MPA...');

      // Create vector store
      vectorStore = await openai.beta.vectorStores.create({
        name: 'MPA Organizational Knowledge',
        description: 'Email history, documents, decisions, and project context for Mission Mutual',
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          project: 'mpa-email-assistant',
          version: '1.0.0',
        },
      });

      console.log('✅ Vector store created successfully!');
      console.log(`📋 Vector Store ID: ${vectorStore.id}`);
      console.log(`📋 Vector Store Name: ${vectorStore.name}`);
      vectorStoreId = vectorStore.id;
    }

    // Update .env.local with the vector store ID
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';

    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch (error) {
      console.log('📝 Creating new .env.local file...');
    }

    // Only update .env.local if we created a new vector store
    if (!process.env.OPENAI_VECTOR_STORE_ID) {
      // Add or update the vector store ID
      const vectorStorePattern = /OPENAI_VECTOR_STORE_ID=.*/;
      const vectorStoreEntry = `OPENAI_VECTOR_STORE_ID=${vectorStoreId}`;

      if (vectorStorePattern.test(envContent)) {
        envContent = envContent.replace(vectorStorePattern, vectorStoreEntry);
      } else {
        envContent += `\n${vectorStoreEntry}\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log('✅ Updated .env.local with vector store ID');
    }

    // Create sample organizational knowledge files
    await createSampleKnowledgeFiles(openai, vectorStoreId);

    console.log('\n🎉 Setup complete!');
    console.log('🔧 Next steps:');
    console.log('1. Review the generated vector store ID in .env.local');
    console.log('2. Upload your organizational documents to the vector store');
    console.log('3. Start the development server with: npm run dev');
    console.log('4. Test the agent at: http://localhost:3000/api/test-agent');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

async function createSampleKnowledgeFiles(openai, vectorStoreId) {
  console.log('📄 Creating sample organizational knowledge files...');

  const sampleFiles = [
    {
      name: 'mission-mutual-overview.txt',
      content: `Mission Mutual - Christian Insurance Company Overview

Mission Statement:
Mission Mutual is a Christian insurance company dedicated to providing comprehensive coverage while upholding Christian values and serving our community with integrity.

Key Personnel:
- Tom Lucas: VP Business Operations
- Anthony Keeler: Finance Director
- Julie Riggs: Operations Coordinator
- Andrew Cleveland: Data and Reporting Manager

Core Values:
- Christian integrity in all business dealings
- Excellent customer service
- Community focus and support
- Transparent and ethical practices

Services:
- Life Insurance
- Health Insurance
- Property Insurance
- Business Insurance
- Financial Planning

Board Members:
- Various industry leaders and Christian community representatives
- Meet quarterly for strategic planning
- Provide oversight and guidance

Contact Information:
- Main Office: info@missionmutual.org
- Customer Service: support@missionmutual.org
- Claims: claims@missionmutual.org`,
    },
    {
      name: 'current-projects.txt',
      content: `Current Projects at Mission Mutual

Q4 2024 Donor Campaign:
- Goal: $500,000 in donations
- Timeline: October - December 2024
- Team: Tom Lucas (lead), Julie Riggs (coordination)
- Status: Planning phase

Digital Transformation Initiative:
- Modernizing customer portal
- Implementing new CRM system
- Timeline: 6 months
- Budget: $150,000

Compliance Review:
- Annual SOC 2 audit preparation
- Security protocol updates
- Led by Anthony Keeler
- Deadline: End of Q4

Board Meeting Preparation:
- Quarterly board meeting scheduled
- Financial reports due
- Strategic planning session
- Presenter: Tom Lucas`,
    },
    {
      name: 'communication-guidelines.txt',
      content: `Communication Guidelines for Mission Mutual

Email Communication:
- Professional tone with Christian values
- Clear and concise messaging
- Timely responses (within 24 hours)
- Proper signature blocks required

VIP Contacts:
- Board members: immediate response required
- Major donors: high priority
- Regulatory contacts: urgent handling
- Media inquiries: escalate to leadership

Internal Communication:
- Team meetings: weekly
- All-hands: monthly
- Board updates: quarterly
- Emergency protocols: defined escalation

External Communication:
- Customer service: friendly and helpful
- Vendor relations: professional and fair
- Community outreach: welcoming and inclusive
- Media relations: approved spokespeople only`,
    },
  ];

  for (const file of sampleFiles) {
    try {
      // Create a temporary file
      const tempPath = path.join(process.cwd(), 'temp', file.name);
      const tempDir = path.dirname(tempPath);
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(tempPath, file.content);

      // Upload to vector store
      const uploadedFile = await openai.files.create({
        file: fs.createReadStream(tempPath),
        purpose: 'assistants',
      });

      await openai.beta.vectorStores.files.create(vectorStoreId, {
        file_id: uploadedFile.id,
      });

      console.log(`✅ Uploaded: ${file.name}`);
      
      // Clean up temp file
      fs.unlinkSync(tempPath);
    } catch (error) {
      console.error(`❌ Error uploading ${file.name}:`, error);
    }
  }

  // Clean up temp directory
  try {
    fs.rmdirSync(path.join(process.cwd(), 'temp'));
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Run the setup
if (require.main === module) {
  setupVectorStore();
}

module.exports = { setupVectorStore };